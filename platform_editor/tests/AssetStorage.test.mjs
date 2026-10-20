import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  AssetStorageError,
  deleteAsset,
  listAssets,
  normalizeAssetFileName,
  parsePngDimensions,
  saveAsset,
  updateAssetMetadata,
  validateAssetContentType
} from "../tools/asset-storage.mjs";

function pngHeader(width, height) {
  const buffer = Buffer.alloc(24);
  Buffer.from("89504e470d0a1a0a", "hex").copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

test("asset uploads use the workspace map categories", async (t) => {
  const assetRoot = await mkdtemp(
    join(tmpdir(), "platform-editor-assets-")
  );
  t.after(() => rm(assetRoot, { recursive: true, force: true }));

  const first = await saveAsset(assetRoot, {
    categoryId: "background",
    fileName: "遗迹背景.png",
    contentType: "image/png",
    content: Buffer.from("first-image")
  });
  const second = await saveAsset(assetRoot, {
    categoryId: "background",
    fileName: "遗迹背景.png",
    contentType: "image/png",
    content: Buffer.from("second-image")
  });
  const entity = await saveAsset(assetRoot, {
    categoryId: "entity",
    fileName: "npc.webp",
    contentType: "image/webp",
    content: Buffer.from("entity-image")
  });

  assert.equal(
    first.relativePath,
    "map/backgrounds/遗迹背景.png"
  );
  assert.equal(
    second.relativePath,
    "map/backgrounds/遗迹背景-2.png"
  );
  assert.equal(
    entity.relativePath,
    "map/entities/npc.webp"
  );

  const backgrounds = await listAssets(
    assetRoot,
    "background"
  );
  assert.equal(backgrounds.length, 2);
  assert.deepEqual(
    new Set(backgrounds.map((asset) => asset.fileName)),
    new Set(["遗迹背景.png", "遗迹背景-2.png"])
  );

  const deleted = await deleteAsset(assetRoot, {
    categoryId: "background",
    fileName: second.fileName
  });
  assert.equal(deleted.fileName, "遗迹背景-2.png");
  assert.equal(
    (await listAssets(assetRoot, "background")).length,
    1
  );
  await assert.rejects(
    () =>
      deleteAsset(assetRoot, {
        categoryId: "background",
        fileName: "missing.png"
      }),
    (error) =>
      error instanceof AssetStorageError &&
      error.statusCode === 404
  );
});

test("asset upload validation rejects unsupported files and mismatched MIME types", () => {
  assert.throws(
    () => normalizeAssetFileName("notes.txt"),
    (error) =>
      error instanceof AssetStorageError &&
      error.statusCode === 400
  );
  assert.equal(
    normalizeAssetFileName("../escape.png").fileName,
    "escape.png"
  );
  assert.throws(
    () => validateAssetContentType("image.png", "image/jpeg"),
    (error) =>
      error instanceof AssetStorageError &&
      error.statusCode === 400
  );
});

test("asset deletion rejects paths outside the category directory", async (t) => {
  const assetRoot = await mkdtemp(
    join(tmpdir(), "platform-editor-assets-delete-")
  );
  t.after(() => rm(assetRoot, { recursive: true, force: true }));

  await saveAsset(assetRoot, {
    categoryId: "background",
    fileName: "safe.png",
    contentType: "image/png",
    content: Buffer.from("safe-image")
  });

  await assert.rejects(
    () =>
      deleteAsset(assetRoot, {
        categoryId: "background",
        fileName: "../safe.png"
      }),
    (error) =>
      error instanceof AssetStorageError &&
      error.statusCode === 400
  );
  assert.equal(
    (await listAssets(assetRoot, "background")).length,
    1
  );
});

test("horizontal PNG sprite sheets derive frame metadata and persisted frame rate", async (t) => {
  const assetRoot = await mkdtemp(
    join(tmpdir(), "platform-editor-sprites-")
  );
  t.after(() => rm(assetRoot, { recursive: true, force: true }));

  const header = pngHeader(128, 32);
  assert.deepEqual(parsePngDimensions(header), {
    width: 128,
    height: 32
  });
  const saved = await saveAsset(assetRoot, {
    categoryId: "entity",
    fileName: "walk.png",
    contentType: "image/png",
    content: header
  });

  let [asset] = await listAssets(assetRoot, "entity");
  assert.equal(asset.frameWidth, 32);
  assert.equal(asset.frameHeight, 32);
  assert.equal(asset.frameCount, 4);
  assert.equal(asset.frameRate, 8);
  assert.equal(asset.isSpriteSheet, true);

  await updateAssetMetadata(assetRoot, {
    categoryId: "entity",
    fileName: saved.fileName,
    frameRate: 12
  });
  [asset] = await listAssets(assetRoot, "entity");
  assert.equal(asset.frameRate, 12);

  await deleteAsset(assetRoot, {
    categoryId: "entity",
    fileName: saved.fileName
  });
  assert.equal(
    (await listAssets(assetRoot, "entity")).length,
    0
  );
});
