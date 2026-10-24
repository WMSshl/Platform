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
import { importAmbientMusicToGame } from "../tools/audio-import.mjs";

test("环境音导入到游戏项目并保留素材路径", async (t) => {
  const root = await mkdtemp(
    join(tmpdir(), "platform-editor-audio-import-")
  );
  const assetRoot = join(root, "editor-assets");
  const gameRoot = join(root, "game");
  t.after(() => rm(root, { recursive: true, force: true }));

  const saved = await saveAsset(assetRoot, {
    categoryId: "ambient",
    fileName: "庭院环境.mp3",
    contentType: "audio/mpeg",
    content: Buffer.from("ambient-music")
  });
  const music = await importAmbientMusicToGame({
    assetRoot,
    gameRoot,
    assetId: saved.relativePath,
    revision: "music-revision"
  });

  assert.deepEqual(music, {
    id: "audio/ambient/庭院环境.mp3",
    path: "assets/audio/ambient/庭院环境.mp3",
    fileName: "庭院环境.mp3",
    mimeType: "audio/mpeg",
    revision: "music-revision"
  });
  assert.equal(
    await readFile(
      join(
        gameRoot,
        "assets",
        "audio",
        "ambient",
        "庭院环境.mp3"
      ),
      "utf8"
    ),
    "ambient-music"
  );
});

test("背景音乐导入拒绝短音效和其他分类", async (t) => {
  const root = await mkdtemp(
    join(tmpdir(), "platform-editor-audio-import-invalid-")
  );
  t.after(() => rm(root, { recursive: true, force: true }));

  await assert.rejects(
    () =>
      importAmbientMusicToGame({
        assetRoot: join(root, "editor-assets"),
        gameRoot: join(root, "game"),
        assetId: "audio/sfx/hit.wav"
      }),
    /请选择环境音分类中的素材/
  );
});
