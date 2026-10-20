import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { normalizeLevel } from "../src/model/LevelModel.js";

const levelDirectory = resolve(
  process.argv[2] ?? join(process.cwd(), "data", "levels")
);
const backupDirectory = resolve(
  process.argv[3] ?? join(process.cwd(), ".editor-backups", "schema")
);
const entries = await readdir(levelDirectory, { withFileTypes: true });
const levelFiles = entries
  .filter(
    (entry) =>
      entry.isFile() &&
      entry.name.endsWith(".json") &&
      entry.name !== "manifest.json"
  )
  .map((entry) => join(levelDirectory, entry.name));

await mkdir(backupDirectory, { recursive: true });

for (const filePath of levelFiles) {
  const source = await readFile(filePath, "utf8");
  const level = normalizeLevel(JSON.parse(source));
  const backupPath = join(
    backupDirectory,
    `${basename(filePath, ".json")}-legacy.json`
  );
  await writeFile(backupPath, source, "utf8");
  await writeFile(
    filePath,
    `${JSON.stringify(level, null, 2)}\n`,
    "utf8"
  );
  console.log(
    `迁移 ${basename(filePath)}：${level.spawnPoints.length} 个出生点，${level.mechanisms.length} 个机关对象`
  );
}
