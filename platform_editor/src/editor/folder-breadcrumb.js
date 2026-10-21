export function buildFolderBreadcrumbPath(
  folders,
  activeFolderId,
  rootLabel
) {
  const folderById = new Map(
    folders.map((folder) => [folder.id, folder])
  );
  const path = [];
  const visited = new Set();
  let folder = folderById.get(activeFolderId);

  while (folder && !visited.has(folder.id)) {
    visited.add(folder.id);
    path.unshift({
      id: folder.id,
      label: folder.name
    });
    folder = folder.parentId
      ? folderById.get(folder.parentId)
      : null;
  }

  return [
    { id: null, label: rootLabel },
    ...path
  ];
}
