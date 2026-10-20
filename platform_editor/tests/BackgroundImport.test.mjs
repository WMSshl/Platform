import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  rm
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { saveAsset } from "../tools/asset-storage.mjs";
import { importBackgroundToGame } from "../tools/background-import.mjs";

test("background import copies the selected library asset into the game", async (t) => {
  const root = await mkdtemp(
    join(tmpdir(), "platform-editor-background-")
  );
  const assetRoot = join(root, "editor-assets");
  const gameRoot = join(root, "game");
  t.after(() => rm(root, { recursive: true, force: true }));

  const saved = await saveAsset(assetRoot, {
    categoryId: "background",
    fileName: "庭院背景.png",
    contentType: "image/png",
    content: Buffer.from("background-image")
  });
  const background = await importBackgroundToGame({
    assetRoot,
    gameRoot,
    assetId: saved.relativePath,
    revision: "test-revision"
  });

  assert.deepEqual(background, {
    id: "map/backgrounds/庭院背景.png",
    path: "assets/map/backgrounds/庭院背景.png",
    fileName: "庭院背景.png",
    mimeType: "image/png",
    fit: "stretch",
    revision: "test-revision"
  });
  assert.equal(
    await readFile(
      join(gameRoot, "assets", "map", "backgrounds", "庭院背景.png"),
      "utf8"
    ),
    "background-image"
  );
});

test("background import rejects paths outside the background category", async (t) => {
  const root = await mkdtemp(
    join(tmpdir(), "platform-editor-background-invalid-")
  );
  t.after(() => rm(root, { recursive: true, force: true }));

  await assert.rejects(
    () =>
      importBackgroundToGame({
        assetRoot: join(root, "editor-assets"),
        gameRoot: join(root, "game"),
        assetId: "map/entities/demo.png"
      }),
    /请选择背景分类中的素材/
  );
});
