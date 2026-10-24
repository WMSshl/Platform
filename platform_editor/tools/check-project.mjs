import { readdir, readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { normalizeLevel } from "../src/model/LevelModel.js";
import {
  CONTENT_MODULES,
  normalizeContentDocument,
  validateContentDocument
} from "../src/model/ContentModel.js";
import { validateLevel } from "../src/model/Validation.js";

const projectRoot = resolve(
  fileURLToPath(new URL("..", import.meta.url))
);
const errors = [];

async function collectFiles(directory, extensions) {
  const results = [];
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "vendor") {
        continue;
      }
      results.push(...(await collectFiles(fullPath, extensions)));
    } else if (extensions.includes(extname(entry.name))) {
      results.push(fullPath);
    }
  }
  return results;
}

for (const directory of ["src", "tools", "tests"]) {
  const files = await collectFiles(join(projectRoot, directory), [
    ".js",
    ".mjs"
  ]);
  for (const file of files) {
    const result = spawnSync(process.execPath, ["--check", file], {
      encoding: "utf8"
    });
    if (result.status !== 0) {
      errors.push(`语法错误：${file}\n${result.stderr}`);
    }
    const source = await readFile(file, "utf8");
    const imports = [
      ...source.matchAll(/from\s+["']([^"']+)["']/g)
    ].map((match) => match[1]);
    if (
      imports.some((specifier) =>
        /platform_dome/.test(specifier)
      )
    ) {
      errors.push(`editor 不得直接引用 dome：${file}`);
    }
  }
}

async function readJson(relativePath) {
  try {
    return JSON.parse(
      await readFile(join(projectRoot, relativePath), "utf8")
    );
  } catch (error) {
    errors.push(`JSON 错误：${relativePath}\n${error.message}`);
    return null;
  }
}

const actors = await readJson("data/configs/actors.json");
const items = await readJson("data/configs/items.json");
const contentSource = await readJson(
  "data/content/content.json"
);
const levelFiles = (
  await collectFiles(join(projectRoot, "data", "levels"), [".json"])
).filter((file) => !file.endsWith("manifest.json"));
const levels = [];

for (const file of levelFiles) {
  try {
    levels.push(
      normalizeLevel(JSON.parse(await readFile(file, "utf8")))
    );
  } catch (error) {
    errors.push(`关卡 JSON 错误：${file}\n${error.message}`);
  }
}

if (actors && items) {
  const knownLevelIds = levels.map((level) => level.id);
  const knownLevels = levels.map((level) => ({
    id: level.id,
    name: level.name,
    spawnPoints: level.spawnPoints,
    mechanisms: level.mechanisms
  }));
  for (const level of levels) {
    const issues = validateLevel(level, {
      catalogs: { actors, items },
      knownLevelIds,
      knownLevels
    });
    for (const issue of issues) {
      if (issue.severity === "error") {
        errors.push(`关卡 ${level.id}：${issue.message}`);
      }
    }
  }
}

let contentEntryCount = 0;
if (contentSource) {
  try {
    const content = normalizeContentDocument(contentSource);
    for (const definition of CONTENT_MODULES) {
      contentEntryCount += content[definition.key].length;
    }
    for (const issue of validateContentDocument(content)) {
      if (issue.severity === "error") {
        errors.push(`内容文档：${issue.message}`);
      }
    }
  } catch (error) {
    errors.push(`内容文档错误：${error.message}`);
  }
}

if (errors.length > 0) {
  console.error("项目检查未通过：");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `项目检查通过：${levels.length} 个关卡，${contentEntryCount} 个内容项，结构与关键引用正常。`
  );
}
