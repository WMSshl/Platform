import { copyFile, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  ASSET_MIME_TYPES,
  AssetStorageError,
  getAssetCategory,
  normalizeAssetFileName
} from "./asset-storage.mjs";

function normalizeAmbientAssetId(rawAssetId) {
  const category = getAssetCategory("ambient");
  const prefix = `${category.storageSegments.join("/")}/`;
  const normalizedId = String(rawAssetId ?? "")
    .replaceAll("\\", "/")
    .replace(/^\/+/, "");
  if (!normalizedId.startsWith(prefix)) {
    throw new AssetStorageError(400, "请选择环境音分类中的素材");
  }

  const fileName = normalizedId.slice(prefix.length);
  if (!fileName || fileName.includes("/")) {
    throw new AssetStorageError(400, "环境音素材路径不合法");
  }
  const normalizedFile = normalizeAssetFileName(fileName);
  if (normalizedFile.fileName !== fileName) {
    throw new AssetStorageError(400, "环境音素材路径不合法");
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

export async function importAmbientMusicToGame({
  assetRoot,
  gameRoot,
  assetId,
  revision = new Date().toISOString()
}) {
  const music = normalizeAmbientAssetId(assetId);
  const sourcePath = join(assetRoot, music.sourcePath);
  let sourceStat;
  try {
    sourceStat = await stat(sourcePath);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new AssetStorageError(404, "环境音素材不存在");
    }
    throw error;
  }
  if (!sourceStat.isFile()) {
    throw new AssetStorageError(400, "环境音素材不是文件");
  }

  const targetDirectory = join(
    gameRoot,
    "assets",
    "audio",
    "ambient"
  );
  await mkdir(targetDirectory, { recursive: true });
  await copyFile(
    sourcePath,
    join(targetDirectory, music.fileName)
  );

  return {
    id: music.id,
    path: `assets/audio/ambient/${music.fileName}`,
    fileName: music.fileName,
    mimeType: music.mimeType,
    revision
  };
}
