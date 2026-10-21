import {
  cp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { AssetStorageError } from "./asset-storage.mjs";
import {
  normalizeTiledAssetName,
  normalizeTiledFilePath,
  TILED_GROUP_SEGMENTS
} from "./tiled-map-import.mjs";

function tiledMapDirectory(assetRoot) {
  return join(assetRoot, ...TILED_GROUP_SEGMENTS);
}

async function readStoredManifests(assetRoot) {
  const root = tiledMapDirectory(assetRoot);
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
  const manifests = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    try {
      const directory = join(root, entry.name);
      const manifest = JSON.parse(
        await readFile(join(directory, "asset.json"), "utf8")
      );
      manifests.push({ ...manifest, id: entry.name, directory });
    } catch {
      // 损坏素材组不参与重名判断。
    }
  }
  return manifests;
}

function findConflict(manifests, name) {
  const normalizedName = String(name).toLowerCase();
  const matches = manifests.filter(
    (manifest) =>
      String(manifest.name ?? "").toLowerCase() === normalizedName
  );
  if (matches.length === 0) {
    return null;
  }
  const preferredId = normalizeTiledAssetName(name);
  return (
    matches.find((manifest) => manifest.id === preferredId) ??
    matches.sort((left, right) =>
      String(right.modifiedAt ?? "").localeCompare(
        String(left.modifiedAt ?? "")
      )
    )[0]
  );
}

export async function getTiledMapNameConflicts(
  assetRoot,
  bundles
) {
  const manifests = await readStoredManifests(assetRoot);
  return bundles
    .map((bundle) => {
      const existing = findConflict(
        manifests,
        bundle.manifest.name
      );
      return existing
        ? {
            name: bundle.manifest.name,
            existingId: existing.id,
            existingFileName: existing.fileName
          }
        : null;
    })
    .filter(Boolean);
}

async function availableBundleDirectory(assetRoot, baseName) {
  const root = tiledMapDirectory(assetRoot);
  await mkdir(root, { recursive: true });
  const safeStem =
    normalizeTiledAssetName(baseName)
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 72) || "tiled-map";
  let index = 1;
  while (true) {
    const name = index === 1 ? safeStem : `${safeStem}-${index}`;
    try {
      await stat(join(root, name));
      index += 1;
    } catch (error) {
      if (error.code === "ENOENT") {
        return { name, directory: join(root, name) };
      }
      throw error;
    }
  }
}

async function writeBundleDirectory(targetDirectory, bundle, id) {
  await mkdir(targetDirectory, { recursive: true });
  let totalSize = 0;
  for (const file of bundle.files) {
    const normalized = normalizeTiledFilePath(file.path);
    const outputPath = join(
      targetDirectory,
      ...normalized.split("/")
    );
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, file.content);
    totalSize += file.content.length;
  }
  const extension = bundle.manifest.fileName.includes(".")
    ? bundle.manifest.fileName.slice(
        bundle.manifest.fileName.lastIndexOf(".")
      )
    : "";
  const manifest = {
    ...bundle.manifest,
    id,
    name: bundle.manifest.name,
    fileName: `${bundle.manifest.name}${extension}`,
    size: totalSize,
    relativePath: [...TILED_GROUP_SEGMENTS, id].join("/")
  };
  await writeFile(
    join(targetDirectory, "asset.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );
  return manifest;
}

export async function publishTiledMapBundle({
  assetRoot,
  bundle,
  overwrite = false
}) {
  const manifests = await readStoredManifests(assetRoot);
  const existing = findConflict(
    manifests,
    bundle.manifest.name
  );
  if (existing && !overwrite) {
    const error = new AssetStorageError(
      409,
      `素材库中已存在同名 Tiled 地图：${bundle.manifest.name}`
    );
    error.code = "TILED_NAME_CONFLICT";
    error.conflicts = [
      {
        name: bundle.manifest.name,
        existingId: existing.id,
        existingFileName: existing.fileName
      }
    ];
    throw error;
  }
  const target = existing
    ? { name: existing.id, directory: existing.directory }
    : await availableBundleDirectory(
        assetRoot,
        bundle.manifest.name
      );
  const temporaryDirectory = `${target.directory}.tmp-${process.pid}-${Date.now()}`;
  const backupDirectory = `${target.directory}.bak-${process.pid}-${Date.now()}`;
  try {
    const manifest = await writeBundleDirectory(
      temporaryDirectory,
      bundle,
      target.name
    );
    if (existing) {
      await rename(target.directory, backupDirectory);
      try {
        await rename(temporaryDirectory, target.directory);
      } catch (error) {
        await rename(backupDirectory, target.directory).catch(() => {});
        throw error;
      }
      await rm(backupDirectory, { recursive: true, force: true });
    } else {
      await rename(temporaryDirectory, target.directory);
    }
    return manifest;
  } catch (error) {
    await rm(temporaryDirectory, {
      recursive: true,
      force: true
    }).catch(() => {});
    throw error;
  }
}

export async function listTiledMapAssets(assetRoot) {
  const root = tiledMapDirectory(assetRoot);
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
  const assets = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    try {
      const directory = join(root, entry.name);
      const manifest = JSON.parse(
        await readFile(join(directory, "asset.json"), "utf8")
      );
      const directoryStat = await stat(directory);
      assets.push({
        ...manifest,
        categoryId: "tiled",
        relativePath: [...TILED_GROUP_SEGMENTS, entry.name].join("/"),
        mimeType: "application/json",
        size: manifest.size ?? 0,
        modifiedAt:
          manifest.modifiedAt ?? directoryStat.mtime.toISOString()
      });
    } catch {
      // 损坏素材组不影响其他素材加载。
    }
  }
  const duplicateNameCounts = new Map();
  for (const asset of assets) {
    const key = String(asset.name ?? "").toLowerCase();
    duplicateNameCounts.set(
      key,
      (duplicateNameCounts.get(key) ?? 0) + 1
    );
  }
  for (const asset of assets) {
    const key = String(asset.name ?? "").toLowerCase();
    if ((duplicateNameCounts.get(key) ?? 0) <= 1) {
      continue;
    }
    const extension = asset.fileName.includes(".")
      ? asset.fileName.slice(asset.fileName.lastIndexOf("."))
      : "";
    asset.name = asset.id;
    asset.fileName = `${asset.id}${extension}`;
  }
  return assets.sort((left, right) =>
    right.modifiedAt.localeCompare(left.modifiedAt)
  );
}

export async function renameTiledMapAsset(
  assetRoot,
  { assetId, newName }
) {
  const normalizedId = normalizeTiledFilePath(assetId);
  if (normalizedId.includes("/")) {
    throw new AssetStorageError(400, "Tiled 素材 ID 不合法");
  }
  const name = normalizeTiledAssetName(newName);
  if (!name) {
    throw new AssetStorageError(400, "Tiled 素材名称不能为空");
  }
  const directory = join(tiledMapDirectory(assetRoot), normalizedId);
  const manifestPath = join(directory, "asset.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.name = name;
  manifest.modifiedAt = new Date().toISOString();
  await writeFile(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );
  return manifest;
}

export async function deleteTiledMapAsset(assetRoot, assetId) {
  const normalizedId = normalizeTiledFilePath(assetId);
  if (normalizedId.includes("/")) {
    throw new AssetStorageError(400, "Tiled 素材 ID 不合法");
  }
  const directory = join(tiledMapDirectory(assetRoot), normalizedId);
  await rm(directory, { recursive: true, force: false });
  return { id: normalizedId };
}

export async function importTiledMapToGame({
  assetRoot,
  gameRoot,
  assetId,
  revision = new Date().toISOString()
}) {
  const normalizedId = normalizeTiledFilePath(assetId);
  if (normalizedId.includes("/")) {
    throw new AssetStorageError(400, "Tiled 素材 ID 不合法");
  }
  const sourceDirectory = join(
    tiledMapDirectory(assetRoot),
    normalizedId
  );
  const manifest = JSON.parse(
    await readFile(join(sourceDirectory, "asset.json"), "utf8")
  );
  const revisionToken = revision.replace(/[^0-9A-Za-z-]+/g, "");
  const gameBundleName = `${normalizedId}-${revisionToken}`;
  const gameRelativeRoot = [
    "assets",
    "map",
    "tiled",
    gameBundleName
  ];
  const targetDirectory = join(gameRoot, ...gameRelativeRoot);
  await mkdir(dirname(targetDirectory), { recursive: true });
  await cp(sourceDirectory, targetDirectory, {
    recursive: true,
    force: false,
    errorOnExist: true
  });

  const prefix = gameRelativeRoot.join("/");
  return {
    type: "tiled",
    id: [...TILED_GROUP_SEGMENTS, manifest.id].join("/"),
    sourcePath: `${prefix}/${manifest.sourcePath}`,
    mapPath: `${prefix}/${manifest.mapPath}`,
    fileName: manifest.fileName,
    revision,
    sourceWidth: manifest.sourceWidth,
    sourceHeight: manifest.sourceHeight,
    tileWidth: manifest.tileWidth,
    tileHeight: manifest.tileHeight,
    tilesets: manifest.tilesets.map((tileset) => ({
      ...tileset,
      imagePath: `${prefix}/${tileset.imagePath}`
    })),
    collisions: manifest.collisions
  };
}
