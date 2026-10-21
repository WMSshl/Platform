import {
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  stat,
  unlink,
  writeFile
} from "node:fs/promises";
import { basename, extname, join } from "node:path";

export const MAX_ASSET_BYTES = 20 * 1024 * 1024;

export const ASSET_MIME_TYPES = {
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

export const ASSET_CATEGORIES = [
  {
    id: "map",
    label: "地图",
    children: [
      {
        id: "background",
        label: "背景",
        storageSegments: ["map", "backgrounds"]
      },
      {
        id: "entity",
        label: "动画",
        storageSegments: ["map", "entities"]
      },
      {
        id: "static",
        label: "静态贴图",
        storageSegments: ["map", "static-textures"],
        allowedExtensions: [".png"]
      },
      {
        id: "tiled",
        label: "Tiled 地图",
        storageSegments: ["map", "tiled"],
        allowedExtensions: [".json", ".tmj"]
      }
    ]
  }
];

export class AssetStorageError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "AssetStorageError";
    this.statusCode = statusCode;
  }
}

export function getAssetCategory(categoryId) {
  for (const group of ASSET_CATEGORIES) {
    const category = group.children.find(
      (child) => child.id === categoryId
    );
    if (category) {
      return {
        ...category,
        groupId: group.id,
        groupLabel: group.label
      };
    }
  }
  throw new AssetStorageError(400, "未知的素材分类");
}

export function normalizeAssetFileName(rawName) {
  const source = basename(String(rawName ?? "").replaceAll("\\", "/"))
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+|\.+$/g, "");
  const extension = extname(source).toLowerCase();

  if (!source || !ASSET_MIME_TYPES[extension]) {
    throw new AssetStorageError(
      400,
      "仅支持 PNG、JPG、WebP、GIF 和 SVG 图片"
    );
  }

  const stem = basename(source, extname(source))
    .slice(0, 100)
    .trim()
    .replace(/^\.+|\.+$/g, "");
  if (!stem) {
    throw new AssetStorageError(400, "素材文件名不能为空");
  }

  return {
    extension,
    fileName: `${stem}${extension}`,
    mimeType: ASSET_MIME_TYPES[extension]
  };
}

export function validateAssetContentType(fileName, contentType) {
  const normalizedType = String(contentType ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  const expectedType =
    ASSET_MIME_TYPES[extname(fileName).toLowerCase()];

  if (
    normalizedType &&
    normalizedType !== "application/octet-stream" &&
    normalizedType !== expectedType
  ) {
    throw new AssetStorageError(
      400,
      "文件类型与扩展名不匹配"
    );
  }

  return expectedType;
}

export function parsePngDimensions(buffer) {
  const pngSignature = "89504e470d0a1a0a";
  if (
    !Buffer.isBuffer(buffer) ||
    buffer.length < 24 ||
    buffer.subarray(0, 8).toString("hex") !== pngSignature ||
    buffer.subarray(12, 16).toString("ascii") !== "IHDR"
  ) {
    return null;
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

function getAssetMetadataPath(filePath) {
  return `${filePath}.meta.json`;
}

async function readPngDimensions(filePath) {
  const handle = await open(filePath, "r");
  try {
    const header = Buffer.alloc(24);
    await handle.read(header, 0, header.length, 0);
    return parsePngDimensions(header);
  } finally {
    await handle.close();
  }
}

async function readAssetMetadata(filePath) {
  try {
    const metadata = JSON.parse(
      await readFile(getAssetMetadataPath(filePath), "utf8")
    );
    return metadata && typeof metadata === "object"
      ? metadata
      : {};
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

function normalizeFrameRate(value, fallback = 8) {
  const frameRate = Math.round(Number(value));
  return Number.isFinite(frameRate)
    ? Math.min(60, Math.max(1, frameRate))
    : fallback;
}

function validateCategoryExtension(category, fileName) {
  if (!category.allowedExtensions?.length) {
    return;
  }
  const extension = extname(fileName).toLowerCase();
  if (!category.allowedExtensions.includes(extension)) {
    const formats = category.allowedExtensions
      .map((item) => item.slice(1).toUpperCase())
      .join("、");
    throw new AssetStorageError(
      400,
      `${category.label}分类仅支持 ${formats} 图片`
    );
  }
}

async function getAvailablePath(directory, fileName) {
  const extension = extname(fileName);
  const stem = basename(fileName, extension);
  let suffix = 1;

  while (true) {
    const candidateName =
      suffix === 1 ? fileName : `${stem}-${suffix}${extension}`;
    const candidatePath = join(directory, candidateName);
    try {
      await stat(candidatePath);
      suffix += 1;
    } catch (error) {
      if (error.code === "ENOENT") {
        return {
          fileName: candidateName,
          filePath: candidatePath
        };
      }
      throw error;
    }
  }
}

export async function saveAsset(
  assetRoot,
  {
    categoryId,
    fileName: rawFileName,
    contentType,
    content
  }
) {
  const category = getAssetCategory(categoryId);
  const normalized = normalizeAssetFileName(rawFileName);
  validateCategoryExtension(category, normalized.fileName);
  const mimeType = validateAssetContentType(
    normalized.fileName,
    contentType
  );
  const buffer = Buffer.isBuffer(content)
    ? content
    : Buffer.from(content ?? []);

  if (buffer.length === 0) {
    throw new AssetStorageError(400, "上传文件为空");
  }
  if (buffer.length > MAX_ASSET_BYTES) {
    throw new AssetStorageError(
      413,
      "单个素材不能超过 20 MB"
    );
  }

  const directory = join(
    assetRoot,
    ...category.storageSegments
  );
  await mkdir(directory, { recursive: true });
  const target = await getAvailablePath(
    directory,
    normalized.fileName
  );
  const temporaryPath = `${target.filePath}.tmp-${process.pid}-${Date.now()}`;

  await writeFile(temporaryPath, buffer);
  await rename(temporaryPath, target.filePath);

  return {
    id: `${category.id}:${target.fileName}`,
    categoryId: category.id,
    fileName: target.fileName,
    mimeType,
    relativePath: [
      ...category.storageSegments,
      target.fileName
    ].join("/"),
    size: buffer.length
  };
}

export async function listAssets(assetRoot, categoryId) {
  const category = getAssetCategory(categoryId);
  const directory = join(
    assetRoot,
    ...category.storageSegments
  );
  let entries;

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const assets = [];
  for (const entry of entries) {
    const extension = extname(entry.name).toLowerCase();
    if (!entry.isFile() || !ASSET_MIME_TYPES[extension]) {
      continue;
    }

    const filePath = join(directory, entry.name);
    const fileStat = await stat(filePath);
    const isAnimation = category.id === "entity";
    const spriteSheet =
      isAnimation && extension === ".png"
        ? await readPngDimensions(filePath)
        : null;
    const metadata = isAnimation
      ? await readAssetMetadata(filePath)
      : {};
    const frameHeight =
      spriteSheet?.height ?? null;
    const frameWidth =
      spriteSheet
        ? Math.max(
            1,
            Math.min(spriteSheet.width, spriteSheet.height)
          )
        : null;
    const frameCount =
      spriteSheet && frameHeight
        ? Math.max(1, Math.floor(spriteSheet.width / frameHeight))
        : 1;
    assets.push({
      id: `${category.id}:${entry.name}`,
      categoryId: category.id,
      fileName: entry.name,
      mimeType: ASSET_MIME_TYPES[extension],
      relativePath: [
        ...category.storageSegments,
        entry.name
      ].join("/"),
      size: fileStat.size,
      modifiedAt: fileStat.mtime.toISOString(),
      imageWidth: spriteSheet?.width ?? null,
      imageHeight: spriteSheet?.height ?? null,
      frameWidth,
      frameHeight,
      frameCount,
      frameRate: isAnimation
        ? normalizeFrameRate(metadata.frameRate)
        : null,
      isSpriteSheet: frameCount > 1
    });
  }

  return assets.sort((left, right) =>
    right.modifiedAt.localeCompare(left.modifiedAt)
  );
}

export async function updateAssetMetadata(
  assetRoot,
  { categoryId, fileName: rawFileName, frameRate }
) {
  const category = getAssetCategory(categoryId);
  if (category.id !== "entity") {
    throw new AssetStorageError(
      400,
      "只有动画素材可以设置帧速"
    );
  }
  const normalized = normalizeAssetFileName(rawFileName);
  const requestedName = String(rawFileName ?? "").normalize("NFC");
  if (normalized.fileName !== requestedName) {
    throw new AssetStorageError(400, "素材文件名不合法");
  }

  const filePath = join(
    assetRoot,
    ...category.storageSegments,
    normalized.fileName
  );
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      throw new AssetStorageError(400, "素材不是文件");
    }
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new AssetStorageError(404, "素材不存在");
    }
    throw error;
  }

  if (!Number.isFinite(Number(frameRate))) {
    throw new AssetStorageError(400, "帧速必须是数字");
  }
  const nextFrameRate = normalizeFrameRate(frameRate);
  const metadataPath = getAssetMetadataPath(filePath);
  const temporaryPath =
    `${metadataPath}.tmp-${process.pid}-${Date.now()}`;
  const metadata = {
    frameRate: nextFrameRate,
    updatedAt: new Date().toISOString()
  };
  await writeFile(
    temporaryPath,
    `${JSON.stringify(metadata, null, 2)}\n`,
    "utf8"
  );
  await rename(temporaryPath, metadataPath);
  return metadata;
}

export async function renameAsset(
  assetRoot,
  {
    categoryId,
    fileName: rawFileName,
    newFileName: rawNewFileName
  }
) {
  const category = getAssetCategory(categoryId);
  const normalized = normalizeAssetFileName(rawFileName);
  const requestedName = String(rawFileName ?? "").normalize("NFC");
  if (normalized.fileName !== requestedName) {
    throw new AssetStorageError(400, "素材文件名不合法");
  }

  const nextNormalized = normalizeAssetFileName(rawNewFileName);
  const requestedNewName = String(rawNewFileName ?? "").normalize(
    "NFC"
  );
  if (nextNormalized.fileName !== requestedNewName) {
    throw new AssetStorageError(400, "新素材文件名不合法");
  }
  validateCategoryExtension(category, nextNormalized.fileName);

  if (
    nextNormalized.extension !== normalized.extension
  ) {
    throw new AssetStorageError(
      400,
      "重命名不能修改文件后缀"
    );
  }
  if (nextNormalized.fileName === normalized.fileName) {
    return {
      categoryId,
      previousFileName: normalized.fileName,
      fileName: normalized.fileName
    };
  }

  const directory = join(
    assetRoot,
    ...category.storageSegments
  );
  const sourcePath = join(directory, normalized.fileName);
  const targetPath = join(directory, nextNormalized.fileName);
  const sourceMetadataPath = getAssetMetadataPath(sourcePath);
  const targetMetadataPath = getAssetMetadataPath(targetPath);

  try {
    const sourceStat = await stat(sourcePath);
    if (!sourceStat.isFile()) {
      throw new AssetStorageError(400, "素材不是文件");
    }
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new AssetStorageError(404, "素材不存在");
    }
    throw error;
  }

  for (const occupiedPath of [targetPath, targetMetadataPath]) {
    try {
      await stat(occupiedPath);
      throw new AssetStorageError(409, "同名素材已存在");
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }

  let hasMetadata = false;
  try {
    const metadataStat = await stat(sourceMetadataPath);
    hasMetadata = metadataStat.isFile();
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  await rename(sourcePath, targetPath);
  if (hasMetadata) {
    try {
      await rename(sourceMetadataPath, targetMetadataPath);
    } catch (error) {
      await rename(targetPath, sourcePath).catch(() => {});
      throw error;
    }
  }

  return {
    categoryId,
    previousFileName: normalized.fileName,
    fileName: nextNormalized.fileName
  };
}

export async function deleteAsset(
  assetRoot,
  { categoryId, fileName: rawFileName }
) {
  const category = getAssetCategory(categoryId);
  const normalized = normalizeAssetFileName(rawFileName);
  const requestedName = String(rawFileName ?? "").normalize("NFC");

  if (normalized.fileName !== requestedName) {
    throw new AssetStorageError(400, "素材文件名不合法");
  }

  const filePath = join(
    assetRoot,
    ...category.storageSegments,
    normalized.fileName
  );

  try {
    await unlink(filePath);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new AssetStorageError(404, "素材不存在或已被删除");
    }
    throw error;
  }
  try {
    await unlink(getAssetMetadataPath(filePath));
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  return {
    categoryId,
    fileName: normalized.fileName
  };
}
