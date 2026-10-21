import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  rename,
  writeFile
} from "node:fs/promises";
import { extname, join } from "node:path";
import {
  AssetStorageError,
  getAssetCategory
} from "./asset-storage.mjs";

const ASSET_FOLDER_STATE_FILE = ".folders.json";
const CURRENT_FOLDER_STATE_VERSION = 2;

export function normalizeAssetDisplayName(rawName) {
  const name = String(rawName ?? "")
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  if (!name || name.startsWith(".") || name.endsWith(".")) {
    throw new AssetStorageError(
      400,
      "素材名称不能为空，也不能以句点开头或结尾"
    );
  }
  return name;
}

function getAssetFolderStatePath(assetRoot, categoryId) {
  const category = getAssetCategory(categoryId);
  return join(
    assetRoot,
    ...category.storageSegments,
    ASSET_FOLDER_STATE_FILE
  );
}

export function normalizeAssetFolderName(rawName) {
  const name = String(rawName ?? "")
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  if (!name || name.startsWith(".") || name.endsWith(".")) {
    throw new AssetStorageError(
      400,
      "文件夹名称不能为空，也不能以句点开头或结尾"
    );
  }
  return name;
}

function sanitizeAssetFolderState(value) {
  const candidates = Array.isArray(value?.folders)
    ? value.folders
        .filter(
          (folder) =>
            folder &&
            typeof folder.id === "string" &&
            typeof folder.name === "string"
        )
        .map((folder) => ({
          id: folder.id,
          name: normalizeAssetFolderName(folder.name),
          parentId:
            typeof folder.parentId === "string"
              ? folder.parentId
              : null,
          createdAt:
            typeof folder.createdAt === "string"
              ? folder.createdAt
              : new Date().toISOString()
        }))
    : [];
  const candidateIds = new Set(
    candidates.map((folder) => folder.id)
  );
  const folders = candidates.map((folder) => ({
    ...folder,
    parentId:
      folder.parentId &&
      folder.parentId !== folder.id &&
      candidateIds.has(folder.parentId)
        ? folder.parentId
        : null
  }));
  const folderById = new Map(
    folders.map((folder) => [folder.id, folder])
  );
  for (const folder of folders) {
    const ancestors = new Set([folder.id]);
    let parentId = folder.parentId;
    while (parentId) {
      if (ancestors.has(parentId)) {
        folder.parentId = null;
        break;
      }
      ancestors.add(parentId);
      parentId =
        folderById.get(parentId)?.parentId ?? null;
    }
  }
  const folderIds = new Set(folders.map((folder) => folder.id));
  const assignments =
    value?.assignments && typeof value.assignments === "object"
      ? Object.fromEntries(
          Object.entries(value.assignments).filter(
            ([assetId, folderId]) =>
              assetId &&
              typeof folderId === "string" &&
              folderIds.has(folderId)
          )
        )
      : {};
  const displayNames =
    value?.displayNames && typeof value.displayNames === "object"
      ? Object.fromEntries(
          Object.entries(value.displayNames)
            .filter(
              ([assetId, displayName]) =>
                assetId &&
                typeof displayName === "string" &&
                displayName.trim()
            )
            .map(([assetId, displayName]) => [
              assetId,
              normalizeAssetDisplayName(displayName)
            ])
        )
      : {};
  return {
    version: CURRENT_FOLDER_STATE_VERSION,
    folders,
    assignments,
    displayNames
  };
}

export async function getAssetFolderState(assetRoot, categoryId) {
  const statePath = getAssetFolderStatePath(
    assetRoot,
    categoryId
  );
  try {
    return sanitizeAssetFolderState(
      JSON.parse(await readFile(statePath, "utf8"))
    );
  } catch (error) {
    if (error.code === "ENOENT") {
      return {
        version: CURRENT_FOLDER_STATE_VERSION,
        folders: [],
        assignments: {},
        displayNames: {}
      };
    }
    if (error instanceof SyntaxError) {
      throw new AssetStorageError(
        500,
        "素材文件夹数据损坏，请检查 .folders.json"
      );
    }
    throw error;
  }
}

export async function pruneAssetFolderState(
  assetRoot,
  categoryId,
  assets
) {
  const state = await getAssetFolderState(assetRoot, categoryId);
  const assetIds = new Set(assets.map((asset) => asset.id));
  let changed = false;
  for (const assetId of Object.keys(state.assignments)) {
    if (!assetIds.has(assetId)) {
      delete state.assignments[assetId];
      changed = true;
    }
  }
  for (const assetId of Object.keys(state.displayNames)) {
    if (!assetIds.has(assetId)) {
      delete state.displayNames[assetId];
      changed = true;
    }
  }
  if (changed) {
    await writeAssetFolderState(assetRoot, categoryId, state);
  }
  return state;
}

async function writeAssetFolderState(
  assetRoot,
  categoryId,
  state
) {
  const statePath = getAssetFolderStatePath(
    assetRoot,
    categoryId
  );
  const category = getAssetCategory(categoryId);
  await mkdir(
    join(assetRoot, ...category.storageSegments),
    { recursive: true }
  );
  const temporaryPath =
    `${statePath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(
    temporaryPath,
    `${JSON.stringify(state, null, 2)}\n`,
    "utf8"
  );
  await rename(temporaryPath, statePath);
}

export function getAssetDisplayName(asset, state) {
  return (
    state.displayNames[asset.id] ??
    asset.fileName
  );
}

export function getFolderDescendantIds(state, folderId) {
  const folderIds = new Set([folderId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of state.folders) {
      if (
        folder.parentId &&
        folderIds.has(folder.parentId) &&
        !folderIds.has(folder.id)
      ) {
        folderIds.add(folder.id);
        changed = true;
      }
    }
  }
  return folderIds;
}

export function findAssetNameConflicts(
  state,
  assets,
  { folderId = null, displayName, excludeAssetId = "" }
) {
  const normalizedName = String(displayName ?? "")
    .normalize("NFC")
    .toLocaleLowerCase("zh-CN");
  return assets.filter(
    (asset) =>
      asset.id !== excludeAssetId &&
      (state.assignments[asset.id] ?? null) ===
        (folderId ?? null) &&
      getAssetDisplayName(asset, state).toLocaleLowerCase(
        "zh-CN"
      ) === normalizedName
  );
}

export function findFolderNameConflict(
  state,
  { parentId = null, name, excludeFolderId = "" }
) {
  const normalizedName = String(name ?? "")
    .normalize("NFC")
    .toLocaleLowerCase("zh-CN");
  return (
    state.folders.find(
      (folder) =>
        folder.id !== excludeFolderId &&
        folder.parentId === (parentId ?? null) &&
        folder.name.toLocaleLowerCase("zh-CN") ===
          normalizedName
    ) ?? null
  );
}

export function getAvailableAssetName(
  state,
  assets,
  { folderId = null, displayName }
) {
  const normalized = normalizeAssetDisplayName(displayName);
  if (
    findAssetNameConflicts(state, assets, {
      folderId,
      displayName: normalized
    }).length === 0
  ) {
    return normalized;
  }
  const extensionIndex = normalized.lastIndexOf(".");
  const stem =
    extensionIndex > 0
      ? normalized.slice(0, extensionIndex)
      : normalized;
  const extension =
    extensionIndex > 0
      ? normalized.slice(extensionIndex)
      : "";
  let suffix = 2;
  while (true) {
    const candidate = `${stem}-${suffix}${extension}`;
    if (
      findAssetNameConflicts(state, assets, {
        folderId,
        displayName: candidate
      }).length === 0
    ) {
      return candidate;
    }
    suffix += 1;
  }
}

export function getAvailableFolderName(
  state,
  { parentId = null, name }
) {
  const normalized = normalizeAssetFolderName(name);
  if (
    !findFolderNameConflict(state, {
      parentId,
      name: normalized
    })
  ) {
    return normalized;
  }
  let suffix = 2;
  while (
    findFolderNameConflict(state, {
      parentId,
      name: `${normalized}-${suffix}`
    })
  ) {
    suffix += 1;
  }
  return `${normalized}-${suffix}`;
}

export async function listAssetFolders(assetRoot, categoryId) {
  const state = await getAssetFolderState(assetRoot, categoryId);
  const directCounts = new Map();
  for (const folderId of Object.values(state.assignments)) {
    directCounts.set(
      folderId,
      (directCounts.get(folderId) ?? 0) + 1
    );
  }
  const childrenByParent = new Map();
  for (const folder of state.folders) {
    const siblings =
      childrenByParent.get(folder.parentId) ?? [];
    siblings.push(folder.id);
    childrenByParent.set(folder.parentId, siblings);
  }
  const getTotalCount = (folderId) =>
    (directCounts.get(folderId) ?? 0) +
    (childrenByParent.get(folderId) ?? []).reduce(
      (total, childId) => total + getTotalCount(childId),
      0
    );
  return state.folders
    .map((folder) => ({
      ...folder,
      assetCount: getTotalCount(folder.id)
    }))
    .sort((left, right) =>
      left.name.localeCompare(right.name, "zh-CN")
    );
}

export async function createAssetFolder(
  assetRoot,
  { categoryId, name: rawName, parentId = null }
) {
  const name = normalizeAssetFolderName(rawName);
  const state = await getAssetFolderState(assetRoot, categoryId);
  const normalizedParentId = parentId || null;
  if (
    normalizedParentId &&
    !state.folders.some(
      (folder) => folder.id === normalizedParentId
    )
  ) {
    throw new AssetStorageError(404, "上级文件夹不存在");
  }
  if (
    findFolderNameConflict(state, {
      parentId: normalizedParentId,
      name
    })
  ) {
    throw new AssetStorageError(409, "同名文件夹已存在");
  }
  const folder = {
    id: randomUUID(),
    name,
    parentId: normalizedParentId,
    createdAt: new Date().toISOString()
  };
  state.folders.push(folder);
  await writeAssetFolderState(assetRoot, categoryId, state);
  return { ...folder, assetCount: 0 };
}

export async function renameAssetFolder(
  assetRoot,
  { categoryId, folderId, name: rawName }
) {
  const name = normalizeAssetFolderName(rawName);
  const state = await getAssetFolderState(assetRoot, categoryId);
  const folder = state.folders.find(
    (candidate) => candidate.id === folderId
  );
  if (!folder) {
    throw new AssetStorageError(404, "文件夹不存在");
  }
  if (
    findFolderNameConflict(state, {
      parentId: folder.parentId,
      name,
      excludeFolderId: folderId
    })
  ) {
    throw new AssetStorageError(409, "同名文件夹已存在");
  }
  folder.name = name;
  await writeAssetFolderState(assetRoot, categoryId, state);
  return folder;
}

export async function deleteAssetFolder(
  assetRoot,
  { categoryId, folderId, deleteAssetById = null }
) {
  const state = await getAssetFolderState(assetRoot, categoryId);
  const targetFolder = state.folders.find(
    (folder) => folder.id === folderId
  );
  if (!targetFolder) {
    throw new AssetStorageError(404, "文件夹不存在");
  }
  const folderIds = getFolderDescendantIds(state, folderId);
  const assetIds = Object.entries(state.assignments)
    .filter(([, assignedFolderId]) =>
      folderIds.has(assignedFolderId)
    )
    .map(([assetId]) => assetId);
  if (deleteAssetById) {
    for (const assetId of assetIds) {
      await deleteAssetById(assetId);
    }
  }
  for (const assetId of assetIds) {
    delete state.assignments[assetId];
    delete state.displayNames[assetId];
  }
  const deletedFolders = state.folders.filter((folder) =>
    folderIds.has(folder.id)
  );
  state.folders = state.folders.filter(
    (folder) => !folderIds.has(folder.id)
  );
  await writeAssetFolderState(assetRoot, categoryId, state);
  return {
    folder: targetFolder,
    folders: deletedFolders,
    assetIds
  };
}

export async function assignAssetFolder(
  assetRoot,
  { categoryId, assetId, folderId = null }
) {
  const state = await getAssetFolderState(assetRoot, categoryId);
  if (
    folderId &&
    !state.folders.some((folder) => folder.id === folderId)
  ) {
    throw new AssetStorageError(404, "目标文件夹不存在");
  }
  const normalizedAssetId = String(assetId ?? "").trim();
  if (!normalizedAssetId) {
    throw new AssetStorageError(400, "素材 ID 不能为空");
  }
  if (folderId) {
    state.assignments[normalizedAssetId] = folderId;
  } else {
    delete state.assignments[normalizedAssetId];
  }
  await writeAssetFolderState(assetRoot, categoryId, state);
  return {
    categoryId,
    assetId: normalizedAssetId,
    folderId: folderId || null
  };
}

export async function renameAssetDisplayName(
  assetRoot,
  { categoryId, assetId, displayName: rawDisplayName, assets }
) {
  const displayName = normalizeAssetDisplayName(rawDisplayName);
  const state = await getAssetFolderState(assetRoot, categoryId);
  const asset = assets.find(
    (candidate) => candidate.id === assetId
  );
  if (!asset) {
    throw new AssetStorageError(404, "素材不存在");
  }
  if (
    extname(asset.fileName).toLowerCase() !==
    extname(displayName).toLowerCase()
  ) {
    throw new AssetStorageError(
      400,
      "重命名不能修改文件后缀"
    );
  }
  const folderId = state.assignments[assetId] ?? null;
  const conflicts = findAssetNameConflicts(
    state,
    assets,
    {
      folderId,
      displayName,
      excludeAssetId: assetId
    }
  );
  if (conflicts.length > 0) {
    const error = new AssetStorageError(
      409,
      `当前文件夹中已存在同名素材：${displayName}`
    );
    error.code = "ASSET_NAME_CONFLICT";
    error.itemKind = "asset";
    error.itemName = displayName;
    throw error;
  }
  state.displayNames[assetId] = displayName;
  await writeAssetFolderState(assetRoot, categoryId, state);
  return { assetId, displayName };
}

export async function updateAssetFolderState(
  assetRoot,
  categoryId,
  update
) {
  const state = await getAssetFolderState(assetRoot, categoryId);
  await update(state);
  await writeAssetFolderState(assetRoot, categoryId, state);
  return state;
}
