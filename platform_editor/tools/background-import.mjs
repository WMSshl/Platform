import { copyFile, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  ASSET_MIME_TYPES,
  AssetStorageError,
  getAssetCategory,
  normalizeAssetFileName
} from "./asset-storage.mjs";

function normalizeBackgroundAssetId(rawAssetId) {
  const category = getAssetCategory("background");
  const prefix = `${category.storageSegments.join("/")}/`;
  const normalizedId = String(rawAssetId ?? "")
    .replaceAll("\\", "/")
    .replace(/^\/+/, "");
  if (!normalizedId.startsWith(prefix)) {
    throw new AssetStorageError(400, "请选择背景分类中的素材");
  }

  const fileName = normalizedId.slice(prefix.length);
  if (!fileName || fileName.includes("/")) {
    throw new AssetStorageError(400, "背景素材路径不合法");
  }
  const normalizedFile = normalizeAssetFileName(fileName);
  if (normalizedFile.fileName !== fileName) {
    throw new AssetStorageError(400, "背景素材路径不合法");
  }

  return {
    id: normalizedId,
    fileName,
    mimeType: ASSET_MIME_TYPES[normalizedFile.extension],
    sourcePath: join(
      category.storageSegments[0],
      category.storageSegments[1],
      fileName
    )
  };
}

export async function importBackgroundToGame({
  assetRoot,
  gameRoot,
  assetId,
  revision = new Date().toISOString()
}) {
  const background = normalizeBackgroundAssetId(assetId);
  const sourcePath = join(assetRoot, background.sourcePath);
  let sourceStat;
  try {
    sourceStat = await stat(sourcePath);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new AssetStorageError(404, "背景素材不存在");
    }
    throw error;
  }
  if (!sourceStat.isFile()) {
    throw new AssetStorageError(400, "背景素材不是文件");
  }

  const targetDirectory = join(
    gameRoot,
    "assets",
    "map",
    "backgrounds"
  );
  await mkdir(targetDirectory, { recursive: true });
  await copyFile(
    sourcePath,
    join(targetDirectory, background.fileName)
  );

  return {
    id: background.id,
    path: `assets/map/backgrounds/${background.fileName}`,
    fileName: background.fileName,
    mimeType: background.mimeType,
    fit: "stretch",
    revision
  };
}
