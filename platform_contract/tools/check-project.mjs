import { readdir, readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(
  fileURLToPath(new URL("..", import.meta.url))
);
const errors = [];

async function collectFiles(directory) {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") {
        continue;
      }
      files.push(...(await collectFiles(fullPath)));
      continue;
    }
    if ([".js", ".mjs"].includes(extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

for (const directoryName of ["src", "tests", "tools"]) {
  const files = await collectFiles(join(projectRoot, directoryName));
  for (const file of files) {
    const result = spawnSync(process.execPath, ["--check", file], {
      encoding: "utf8"
    });
    if (result.status !== 0) {
      errors.push(`语法错误：${file}\n${result.stderr}`);
    }
    if (directoryName === "src") {
      const source = await readFile(file, "utf8");
      const imports = [
        ...source.matchAll(/from\s+["']([^"']+)["']/g)
      ].map((match) => match[1]);
      for (const specifier of imports) {
        if (
          /platform_(?:editor|dome)/.test(specifier) ||
          /(?:^|\/)phaser(?:\/|$)/i.test(specifier) ||
          specifier.startsWith("node:")
        ) {
          errors.push(`contract 边界违规：${file} -> ${specifier}`);
        }
      }
    }
  }
}

const packageJson = JSON.parse(
  await readFile(join(projectRoot, "package.json"), "utf8")
);
if (packageJson.name !== "contract") {
  errors.push("package.json 的 name 必须是 contract");
}

if (errors.length > 0) {
  console.error("contract 检查未通过：");
  errors.forEach((error) => console.error(`- ${error}`));
  process.exitCode = 1;
} else {
  console.log("contract 检查通过：模块语法与包边界正常。");
}
