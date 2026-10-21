import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { listAssets, saveAsset } from "../tools/asset-storage.mjs";
import {
  assignAssetFolder,
  createAssetFolder,
  getAssetFolderState,
  renameAssetDisplayName
} from "../tools/asset-organization.mjs";
import { pasteClipboardItem } from "../tools/asset-clipboard-service.mjs";

test("asset clipboard copies, cuts and resolves foldered name conflicts", async (t) => {
  const assetRoot = await mkdtemp(
    join(tmpdir(), "platform-editor-clipboard-")
  );
  t.after(() => rm(assetRoot, { recursive: true, force: true }));

  const sourceFolder = await createAssetFolder(assetRoot, {
    categoryId: "background",
    name: "来源"
  });
  const targetFolder = await createAssetFolder(assetRoot, {
    categoryId: "background",
    name: "目标"
  });
  const asset = await saveAsset(assetRoot, {
    categoryId: "background",
    fileName: "庭院.png",
    contentType: "image/png",
    content: Buffer.from("asset-content")
  });
  await assignAssetFolder(assetRoot, {
    categoryId: "background",
    assetId: asset.id,
    folderId: sourceFolder.id
  });

  const copied = await pasteClipboardItem(assetRoot, {
    categoryId: "background",
    clipboard: {
      mode: "copy",
      kind: "asset",
      categoryId: "background",
      itemId: asset.id
    },
    targetFolderId: targetFolder.id
  });
  assert.notEqual(copied.asset.id, asset.id);
  const stateAfterCopy = await getAssetFolderState(
    assetRoot,
    "background"
  );
  assert.equal(
    stateAfterCopy.assignments[copied.asset.id],
    targetFolder.id
  );
  assert.equal(
    stateAfterCopy.displayNames[copied.asset.id],
    "庭院.png"
  );

  await assert.rejects(
    () =>
      pasteClipboardItem(assetRoot, {
        categoryId: "background",
        clipboard: {
          mode: "copy",
          kind: "asset",
          categoryId: "background",
          itemId: asset.id
        },
        targetFolderId: targetFolder.id
      }),
    (error) =>
      error.statusCode === 409 &&
      error.code === "ASSET_NAME_CONFLICT" &&
      error.suggestedName === "庭院-2.png"
  );

  const renamed = await pasteClipboardItem(assetRoot, {
    categoryId: "background",
    clipboard: {
      mode: "copy",
      kind: "asset",
      categoryId: "background",
      itemId: asset.id
    },
    targetFolderId: targetFolder.id,
    conflictAction: "rename",
    renameTo: "庭院-2.png"
  });
  assert.equal(renamed.displayName, "庭院-2.png");

  const currentAssets = await listAssets(
    assetRoot,
    "background"
  );
  const crossFolderRename = await renameAssetDisplayName(
    assetRoot,
    {
      categoryId: "background",
      assetId: asset.id,
      displayName: "庭院-2.png",
      assets: currentAssets
    }
  );
  assert.equal(crossFolderRename.displayName, "庭院-2.png");
  await assert.rejects(
    () =>
      renameAssetDisplayName(assetRoot, {
        categoryId: "background",
        assetId: renamed.asset.id,
        displayName: "庭院.png",
        assets: currentAssets
      }),
    (error) =>
      error.code === "ASSET_NAME_CONFLICT" &&
      error.statusCode === 409
  );

  const cutTarget = await createAssetFolder(assetRoot, {
    categoryId: "background",
    name: "剪切目标"
  });

  const folderCopy = await pasteClipboardItem(assetRoot, {
    categoryId: "background",
    clipboard: {
      mode: "copy",
      kind: "folder",
      categoryId: "background",
      itemId: sourceFolder.id
    },
    targetFolderId: targetFolder.id
  });
  assert.equal(folderCopy.kind, "folder");
  assert.equal(folderCopy.folder.name, "来源");

  const state = await getAssetFolderState(
    assetRoot,
    "background"
  );
  const copiedFolderAssets = Object.entries(
    state.assignments
  ).filter(
    ([, folderId]) => folderId === folderCopy.folder.id
  );
  assert.equal(copiedFolderAssets.length, 1);
  assert.equal((await listAssets(assetRoot, "background")).length, 4);

  const cutAsset = await pasteClipboardItem(assetRoot, {
    categoryId: "background",
    clipboard: {
      mode: "cut",
      kind: "asset",
      categoryId: "background",
      itemId: asset.id
    },
    targetFolderId: cutTarget.id
  });
  assert.equal(cutAsset.asset.id, asset.id);
  const stateAfterAssetCut = await getAssetFolderState(
    assetRoot,
    "background"
  );
  assert.equal(
    stateAfterAssetCut.assignments[asset.id],
    cutTarget.id
  );

  const cutFolder = await pasteClipboardItem(assetRoot, {
    categoryId: "background",
    clipboard: {
      mode: "cut",
      kind: "folder",
      categoryId: "background",
      itemId: targetFolder.id
    },
    targetFolderId: cutTarget.id
  });
  assert.equal(cutFolder.folder.parentId, cutTarget.id);
});
