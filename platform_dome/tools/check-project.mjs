import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  normalizeLevel,
  validateContent,
  validateManifest
} from "../src/contract/index.js";

/**
 * 项目基础检查脚本。
 *
 * 不依赖第三方工具，完成三件事：
 * 1. 检查所有 JavaScript 文件语法；
 * 2. 检查所有 JSON 文件能否解析；
 * 3. 检查角色技能、关卡出口等关键引用。
 */
const projectRoot = resolve(
  fileURLToPath(new URL("..", import.meta.url))
);

async function collectFiles(directory, extensions) {
  const results = [];
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "vendor" || entry.name === "node_modules") {
        continue;
      }
      results.push(...(await collectFiles(fullPath, extensions)));
      continue;
    }

    if (extensions.includes(extname(entry.name))) {
      results.push(fullPath);
    }
  }

  return results;
}

const errors = [];

for (const directoryName of ["src", "tools", "tests"]) {
  let files = [];
  try {
    files = await collectFiles(join(projectRoot, directoryName), [
      ".js",
      ".mjs"
    ]);
  } catch {
    // 空目录允许存在，后续添加测试时再创建文件。
  }

  for (const file of files) {
    const result = spawnSync(process.execPath, ["--check", file], {
      encoding: "utf8"
    });
    if (result.status !== 0) {
      errors.push(`语法错误：${file}\n${result.stderr}`);
    }
  }
}

async function readJson(relativePath) {
  const filePath = join(projectRoot, relativePath);
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    errors.push(`JSON 错误：${relativePath}\n${error.message}`);
    return null;
  }
}

const actors = await readJson("data/configs/actors.json");
const skills = await readJson("data/configs/skills.json");
const items = await readJson("data/configs/items.json");
const talents = await readJson("data/configs/talents.json");
const manifest = await readJson("data/levels/manifest.json");
const levelDirectory = join(projectRoot, "data", "levels");
let levelFiles = [];
try {
  levelFiles = (await readdir(levelDirectory))
    .filter(
      (fileName) =>
        fileName.endsWith(".json") && fileName !== "manifest.json"
    )
    .sort();
} catch (error) {
  errors.push(`无法读取关卡目录：${error.message}`);
}

const levels = [];
for (const fileName of levelFiles) {
  const level = await readJson(`data/levels/${fileName}`);
  if (level) {
    try {
      levels.push(normalizeLevel(level));
    } catch (error) {
      errors.push(`关卡迁移失败：${fileName}\n${error.message}`);
    }
  }
}
const levelIds = new Set(levels.map((level) => level.id));

for (const issue of validateManifest(manifest, [...levelIds])) {
  errors.push(issue.message);
}

if (actors && skills && items && talents) {
  const issues = validateContent({
    actors,
    skills,
    items,
    talents,
    levels
  });
  for (const issue of issues) {
    if (issue.severity === "error") {
      errors.push(
        issue.levelId
          ? `关卡 ${issue.levelId}：${issue.message}`
          : issue.message
      );
    }
  }
}

for (const level of levels) {
  const background = level.world?.backgroundAsset;
  if (background) {
    const backgroundPath = resolve(
      projectRoot,
      String(background.path ?? "")
    );
    if (
      !backgroundPath.startsWith(`${projectRoot}${sep}`) ||
      background.fit !== "stretch"
    ) {
      errors.push(`关卡 ${level.id} 的背景素材描述无效`);
    } else {
      try {
        const backgroundStat = await stat(backgroundPath);
        if (!backgroundStat.isFile()) {
          errors.push(`关卡 ${level.id} 的背景素材不是文件`);
        }
      } catch {
        errors.push(
          `关卡 ${level.id} 的背景素材不存在：${background.path}`
        );
      }
    }
  }
}

if (errors.length > 0) {
  console.error("项目检查未通过：");
  errors.forEach((error) => console.error(`- ${error}`));
  process.exitCode = 1;
} else {
  console.log(
    "项目检查通过：JavaScript 语法、关卡清单、JSON 格式和关键配置引用正常。"
  );
}
