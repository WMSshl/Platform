import { randomUUID } from "node:crypto";
import {
  AssetStorageError,
  copyAsset,
  deleteAsset,
  listAssets
} from "./asset-storage.mjs";
import {
  findAssetNameConflicts,
  findFolderNameConflict,
  getAssetDisplayName,
  getAssetFolderState,
  getAvailableAssetName,
  getAvailableFolderName,
  getFolderDescendantIds,
  updateAssetFolderState
} from "./asset-organization.mjs";
import {
  copyTiledMapAsset,
  deleteTiledMapAsset,
  listTiledMapAssets
} from "./tiled-asset-repository.mjs";

async function listCategoryAssets(assetRoot, categoryId) {
  return categoryId === "tiled"
    ? listTiledMapAssets(assetRoot)
    : listAssets(assetRoot, categoryId);
}

async function deleteAssetById(assetRoot, categoryId, assetId) {
  if (categoryId === "tiled") {
    return deleteTiledMapAsset(assetRoot, assetId);
  }
  const prefix = `${categoryId}:`;
  const fileName = assetId.startsWith(prefix)
    ? assetId.slice(prefix.length)
    : assetId;
  return deleteAsset(assetRoot, { categoryId, fileName });
}

async function copyAssetById(assetRoot, categoryId, asset) {
  if (categoryId === "tiled") {
    return copyTiledMapAsset(assetRoot, {
      assetId: asset.id
    });
  }
  return copyAsset(assetRoot, {
    categoryId,
    fileName: asset.fileName,
    targetName: asset.fileName
  });
}

function conflictError({
  itemKind,
  name,
  suggestedName,
  existingId
}) {
  const error = new AssetStorageError(
    409,
    `目标位置已存在同名${itemKind === "folder" ? "文件夹" : "素材"}：${name}`
  );
  error.code = "ASSET_NAME_CONFLICT";
  error.itemKind = itemKind;
  error.itemName = name;
  error.suggestedName = suggestedName;
  error.conflicts = [
    { kind: itemKind, name, existingId }
  ];
  return error;
}

async function resolveAssetConflict({
  state,
  assets,
  folderId,
  displayName,
  conflictAction,
  renameTo,
  excludeAssetId = ""
}) {
  const conflicts = findAssetNameConflicts(state, assets, {
    folderId,
    displayName,
    excludeAssetId
  });
  if (conflicts.length === 0) {
    return displayName;
  }
  if (conflictAction === "overwrite") {
    return displayName;
  }
  if (conflictAction === "rename") {
    return getAvailableAssetName(state, assets, {
      folderId,
      displayName: renameTo || displayName
    });
  }
  throw conflictError({
    itemKind: "asset",
    name: displayName,
    suggestedName: getAvailableAssetName(state, assets, {
      folderId,
      displayName
    }),
    existingId: conflicts[0]?.id
  });
}

async function resolveFolderConflict({
  state,
  parentId,
  name,
  conflictAction,
  renameTo
}) {
  const conflict = findFolderNameConflict(state, {
    parentId,
    name
  });
  if (!conflict) {
    return name;
  }
  if (conflictAction === "overwrite") {
    return name;
  }
  if (conflictAction === "rename") {
    return getAvailableFolderName(state, {
      parentId,
      name: renameTo || name
    });
  }
  throw conflictError({
    itemKind: "folder",
    name,
    suggestedName: getAvailableFolderName(state, {
      parentId,
      name
    }),
    existingId: conflict.id
  });
}

async function deleteFolderTree({
  assetRoot,
  categoryId,
  state,
  folderId
}) {
  const folderIds = getFolderDescendantIds(state, folderId);
  const assetIds = Object.entries(state.assignments)
    .filter(([, assignedFolderId]) =>
      folderIds.has(assignedFolderId)
    )
    .map(([assetId]) => assetId);
  for (const assetId of assetIds) {
    await deleteAssetById(
      assetRoot,
      categoryId,
      assetId
    ).catch((error) => {
      if (error.statusCode !== 404) {
        throw error;
      }
    });
    delete state.assignments[assetId];
    delete state.displayNames[assetId];
  }
  state.folders = state.folders.filter(
    (folder) => !folderIds.has(folder.id)
  );
  return assetIds;
}

async function pasteFolder({
  assetRoot,
  categoryId,
  state,
  assets,
  clipboard,
  targetFolderId,
  conflictAction,
  renameTo
}) {
  const sourceFolder = state.folders.find(
    (folder) => folder.id === clipboard.itemId
  );
  if (!sourceFolder) {
    throw new AssetStorageError(404, "源文件夹不存在");
  }
  const targetParentId = targetFolderId || null;
  if (
    clipboard.mode === "cut" &&
    sourceFolder.parentId === targetParentId
  ) {
    return {
      kind: "folder",
      folder: sourceFolder,
      state
    };
  }
  let targetFolderName = await resolveFolderConflict({
    state,
    parentId: targetParentId,
    name: sourceFolder.name,
    conflictAction,
    renameTo
  });
  let existingFolder = findFolderNameConflict(state, {
    parentId: targetParentId,
    name: targetFolderName
  });
  if (
    conflictAction === "overwrite" &&
    existingFolder
  ) {
    if (existingFolder.id === sourceFolder.id) {
      targetFolderName = getAvailableFolderName(state, {
        parentId: targetParentId,
        name: sourceFolder.name
      });
      existingFolder = null;
    } else {
    await deleteFolderTree({
      assetRoot,
      categoryId,
      state,
      folderId: existingFolder.id
    });
    }
  }

  if (clipboard.mode === "cut") {
    if (
      targetParentId &&
      getFolderDescendantIds(state, sourceFolder.id).has(
        targetParentId
      )
    ) {
      throw new AssetStorageError(
        400,
        "不能把文件夹移动到自身或其子文件夹中"
      );
    }
    sourceFolder.parentId = targetParentId;
    sourceFolder.name = targetFolderName;
    return {
      kind: "folder",
      folder: sourceFolder,
      state
    };
  }

  const sourceFolderIds = getFolderDescendantIds(
    state,
    sourceFolder.id
  );
  const sourceFolders = state.folders.filter((folder) =>
    sourceFolderIds.has(folder.id)
  );
  const cloneIds = new Map(
    sourceFolders.map((folder) => [folder.id, randomUUID()])
  );
  const createdAssets = [];
  try {
    for (const folder of sourceFolders) {
      const isRoot = folder.id === sourceFolder.id;
      const cloned = {
        id: cloneIds.get(folder.id),
        name: isRoot ? targetFolderName : folder.name,
        parentId: isRoot
          ? targetParentId
          : cloneIds.get(folder.parentId) ?? targetParentId,
        createdAt: new Date().toISOString()
      };
      state.folders.push(cloned);
      const sourceAssets = assets.filter(
        (asset) =>
          state.assignments[asset.id] === folder.id
      );
      for (const asset of sourceAssets) {
        const copied = await copyAssetById(
          assetRoot,
          categoryId,
          asset
        );
        const copiedId = copied.id;
        createdAssets.push(copiedId);
        state.assignments[copiedId] = cloned.id;
        state.displayNames[copiedId] =
          getAssetDisplayName(asset, state);
      }
    }
  } catch (error) {
    const clonedFolderIds = new Set(cloneIds.values());
    for (const assetId of createdAssets) {
      await deleteAssetById(
        assetRoot,
        categoryId,
        assetId
      ).catch(() => {});
    }
    state.folders = state.folders.filter(
      (folder) => !clonedFolderIds.has(folder.id)
    );
    throw error;
  }
  return {
    kind: "folder",
    folder: state.folders.find(
      (folder) => folder.id === cloneIds.get(sourceFolder.id)
    ),
    state
  };
}

async function pasteAsset({
  assetRoot,
  categoryId,
  state,
  assets,
  clipboard,
  targetFolderId,
  conflictAction,
  renameTo
}) {
  const sourceAsset = assets.find(
    (asset) => asset.id === clipboard.itemId
  );
  if (!sourceAsset) {
    throw new AssetStorageError(404, "源素材不存在");
  }
  const sourceName = getAssetDisplayName(sourceAsset, state);
  if (
    clipboard.mode === "cut" &&
    (state.assignments[sourceAsset.id] ?? null) ===
      (targetFolderId ?? null)
  ) {
    return {
      kind: "asset",
      asset: sourceAsset,
      displayName: sourceName,
      state
    };
  }
  let displayName = await resolveAssetConflict({
    state,
    assets,
    folderId: targetFolderId,
    displayName: sourceName,
    conflictAction,
    renameTo,
    excludeAssetId:
      clipboard.mode === "cut" ? sourceAsset.id : ""
  });
  const conflict = findAssetNameConflicts(state, assets, {
    folderId: targetFolderId,
    displayName
  });
  if (
    conflictAction === "overwrite" &&
    conflict.length > 0
  ) {
    for (const existing of conflict) {
      if (
        clipboard.mode === "copy" &&
        existing.id === sourceAsset.id
      ) {
        continue;
      }
      await deleteAssetById(
        assetRoot,
        categoryId,
        existing.id
      );
      delete state.assignments[existing.id];
      delete state.displayNames[existing.id];
    }
    if (
      clipboard.mode === "copy" &&
      conflict.every(
        (existing) => existing.id === sourceAsset.id
      )
    ) {
      return {
        kind: "asset",
        asset: sourceAsset,
        displayName: sourceName,
        state
      };
    }
  }
  if (clipboard.mode === "cut") {
    if (targetFolderId) {
      state.assignments[sourceAsset.id] = targetFolderId;
    } else {
      delete state.assignments[sourceAsset.id];
    }
    state.displayNames[sourceAsset.id] = displayName;
    return {
      kind: "asset",
      asset: sourceAsset,
      displayName,
      state
    };
  }
  const copied = await copyAssetById(
    assetRoot,
    categoryId,
    sourceAsset
  );
  if (targetFolderId) {
    state.assignments[copied.id] = targetFolderId;
  }
  state.displayNames[copied.id] = displayName;
  return {
    kind: "asset",
    asset: copied,
    displayName,
    state
  };
}

export async function pasteClipboardItem(
  assetRoot,
  {
    categoryId,
    clipboard,
    targetFolderId = null,
    conflictAction = "",
    renameTo = ""
  }
) {
  if (!clipboard || clipboard.categoryId !== categoryId) {
    throw new AssetStorageError(
      400,
      "剪贴板内容与当前素材分类不匹配"
    );
  }
  const state = await getAssetFolderState(assetRoot, categoryId);
  const assets = await listCategoryAssets(assetRoot, categoryId);
  const result =
    clipboard.kind === "folder"
      ? await pasteFolder({
          assetRoot,
          categoryId,
          state,
          assets,
          clipboard,
          targetFolderId,
          conflictAction,
          renameTo
        })
      : await pasteAsset({
          assetRoot,
          categoryId,
          state,
          assets,
          clipboard,
          targetFolderId,
          conflictAction,
          renameTo
        });
  await updateAssetFolderState(
    assetRoot,
    categoryId,
    (nextState) => {
      Object.assign(nextState, result.state);
    }
  );
  return result;
}
