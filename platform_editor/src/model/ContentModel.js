import {
  CHARACTER_ANIMATION_TYPES,
  CHARACTER_ATTRIBUTE_DEFINITIONS,
  CHARACTER_TRIGGER_DEVICES,
  CHARACTER_TRIGGER_DIRECTIONS,
  CONTENT_FOLDER_ID_PATTERN,
  CONTENT_MODULES,
  ITEM_EFFECT_MODES,
  ITEM_STACK_LIMIT_MAX,
  MAX_RECENT_CONVERSATIONS,
  createDefaultCharacterAttributes,
  createDefaultCharacterCollisionBody,
  getCharacterAnimationTypeDefinition,
  getContentEntry,
  getContentModuleDefinition,
  getContentModuleForId,
  normalizeContentDocument
} from "../contract/index.js";

export {
  CHARACTER_ANIMATION_TYPES,
  CHARACTER_ATTRIBUTE_DEFINITIONS,
  CHARACTER_TRIGGER_DEVICES,
  CHARACTER_TRIGGER_DIRECTIONS,
  CONTENT_MODULES,
  ITEM_EFFECT_MODES,
  ITEM_STACK_LIMIT_MAX,
  createDefaultCharacterAttributes,
  createDefaultCharacterCollisionBody,
  getCharacterAnimationTypeDefinition,
  createEmptyContentDocument,
  getAllContentEntries,
  getContentEntry,
  getContentModuleDefinition,
  getContentModuleForId,
  hasContentErrors,
  migrateContentDocument,
  normalizeContentDocument,
  validateContentDocument
} from "../contract/index.js";

const defaultEntryNames = Object.freeze({
  conversations: "新会话",
  quests: "新任务",
  items: "新物品",
  animations: "新动画演绎",
  characters: "新角色"
});

export function allocateContentId(content, moduleKey) {
  const definition = getContentModuleDefinition(moduleKey);
  if (!definition) {
    throw new Error(`未知内容模块：${moduleKey}`);
  }
  const highestSuffix = (content?.[moduleKey] ?? []).reduce(
    (highest, entry) => {
      const match = new RegExp(`^${definition.prefix}-([0-9]{4})$`).exec(
        entry?.id
      );
      return match
        ? Math.max(highest, Number(match[1]))
        : highest;
    },
    0
  );
  const counter = Number(content?.idCounters?.[moduleKey]);
  const nextSuffix = Math.max(
    highestSuffix,
    Number.isInteger(counter) && counter >= 0 ? counter : 0
  );
  for (let index = nextSuffix + 1; index <= 9999; index += 1) {
    const id = `${definition.prefix}-${String(index).padStart(4, "0")}`;
    if (
      !CONTENT_MODULES.some((module) =>
        (content?.[module.key] ?? []).some(
          (entry) => entry?.id === id
        )
      )
    ) {
      return id;
    }
  }
  throw new Error(`${definition.label}模块已用完可用 ID`);
}

export function insertContentEntry(content, moduleKey) {
  const definition = getContentModuleDefinition(moduleKey);
  if (!definition || !Array.isArray(content?.[moduleKey])) {
    throw new Error(`未知内容模块：${moduleKey}`);
  }
  const entry = {
    id: allocateContentId(content, moduleKey),
    name: defaultEntryNames[moduleKey] ?? definition.entryLabel,
    description: ""
  };
  if (moduleKey === "conversations") {
    entry.dialogue = [];
  }
  if (moduleKey === "quests") {
    entry.prerequisites = [];
    entry.completionConditions = [];
    entry.rewards = [];
  }
  if (moduleKey === "items") {
    entry.primaryType = "";
    entry.secondaryType = "";
    entry.rarity = "";
    entry.stackLimit = 1;
    entry.tradeable = true;
    entry.buyPrice = 0;
    entry.sellPrice = 0;
    entry.effect = createDefaultItemEffect();
    entry.illustration = null;
  }
  if (moduleKey === "characters") {
    entry.attributes = createDefaultCharacterAttributes();
    entry.collisionBody = createDefaultCharacterCollisionBody();
    entry.animationBindings = [];
  }
  content[moduleKey].push(entry);
  commitContentId(content, moduleKey, entry.id);
  return {
    entry,
    selection: { moduleKey, id: entry.id }
  };
}

export const ITEM_CUSTOM_OPTION = "__custom__";

export function createDefaultItemEffect() {
  return {
    mode: "description",
    description: "",
    script: ""
  };
}

export function normalizeItemTypeName(value) {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ")
    : "";
}

function itemTypeKey(value) {
  return normalizeItemTypeName(value).toLowerCase();
}

export function getItemTypeLibrary(content) {
  const library = content?.itemTypeLibrary;
  return {
    primaryTypes: Array.isArray(library?.primaryTypes)
      ? library.primaryTypes
      : [],
    rarities: Array.isArray(library?.rarities)
      ? library.rarities
      : []
  };
}

export function getItemPrimaryTypeNames(content) {
  return getItemTypeLibrary(content)
    .primaryTypes.map((primary) => primary?.name)
    .filter((name) => typeof name === "string" && name.trim());
}

export function getItemSecondaryTypeNames(
  content,
  primaryType
) {
  const key = itemTypeKey(primaryType);
  if (!key) {
    return [];
  }
  const primary = getItemTypeLibrary(
    content
  ).primaryTypes.find(
    (item) => itemTypeKey(item?.name) === key
  );
  return primary && Array.isArray(primary.secondaryTypes)
    ? primary.secondaryTypes.filter(
        (name) => typeof name === "string" && name.trim()
      )
    : [];
}

export function getItemRarityNames(content) {
  return getItemTypeLibrary(content).rarities.filter(
    (name) => typeof name === "string" && name.trim()
  );
}

export function addItemType(content, primaryName, secondaryName) {
  const primary = normalizeItemTypeName(primaryName);
  const secondary = normalizeItemTypeName(secondaryName);
  if (!primary || !secondary) {
    throw new Error("一级类型和二级类型都不能为空");
  }
  content.itemTypeLibrary ??= {
    primaryTypes: [],
    rarities: []
  };
  if (!Array.isArray(content.itemTypeLibrary.primaryTypes)) {
    content.itemTypeLibrary.primaryTypes = [];
  }
  const primaryTypes = content.itemTypeLibrary.primaryTypes;
  let primaryRecord = primaryTypes.find(
    (item) => itemTypeKey(item?.name) === itemTypeKey(primary)
  );
  let createdPrimary = false;
  if (!primaryRecord) {
    primaryRecord = {
      name: primary,
      secondaryTypes: []
    };
    primaryTypes.push(primaryRecord);
    createdPrimary = true;
  }
  if (!Array.isArray(primaryRecord.secondaryTypes)) {
    primaryRecord.secondaryTypes = [];
  }
  let matchedSecondary = primaryRecord.secondaryTypes.find(
    (item) => itemTypeKey(item) === itemTypeKey(secondary)
  );
  let createdSecondary = false;
  if (!matchedSecondary) {
    primaryRecord.secondaryTypes.push(secondary);
    matchedSecondary = secondary;
    createdSecondary = true;
  }
  return {
    primaryType: primaryRecord.name,
    secondaryType: matchedSecondary,
    createdPrimary,
    createdSecondary
  };
}

export function addItemRarity(content, rarityName) {
  const name = normalizeItemTypeName(rarityName);
  if (!name) {
    throw new Error("稀有度不能为空");
  }
  content.itemTypeLibrary ??= {
    primaryTypes: [],
    rarities: []
  };
  if (!Array.isArray(content.itemTypeLibrary.rarities)) {
    content.itemTypeLibrary.rarities = [];
  }
  const rarities = content.itemTypeLibrary.rarities;
  const existing = rarities.find(
    (item) => itemTypeKey(item) === itemTypeKey(name)
  );
  if (existing) {
    return { rarity: existing, created: false };
  }
  rarities.push(name);
  return { rarity: name, created: true };
}

export function createItemIllustration(asset) {
  const relativePath =
    typeof asset?.relativePath === "string"
      ? asset.relativePath.trim()
      : "";
  if (!relativePath) {
    return null;
  }
  const fileName =
    typeof asset?.fileName === "string" ? asset.fileName : "";
  return {
    assetId:
      typeof asset?.assetId === "string"
        ? asset.assetId
        : String(asset?.id ?? ""),
    fileName,
    displayName:
      typeof asset?.displayName === "string" && asset.displayName
        ? asset.displayName
        : fileName,
    relativePath,
    folderId:
      typeof asset?.folderId === "string" && asset.folderId
        ? asset.folderId
        : null,
    folderPath:
      typeof asset?.folderPath === "string"
        ? asset.folderPath
        : "",
    revision:
      typeof asset?.revision === "string"
        ? asset.revision
        : ""
  };
}

export function getItemIllustrationUrl(illustration) {
  const relativePath = String(
    illustration?.relativePath ?? ""
  ).replace(/^\/+/, "");
  if (!relativePath) {
    return "";
  }
  const encodedPath = relativePath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const revision = illustration?.revision
    ? `?v=${encodeURIComponent(illustration.revision)}`
    : "";
  return `/assets/${encodedPath}${revision}`;
}

export function getItemTypeSummary(entry) {
  return [entry?.primaryType, entry?.secondaryType, entry?.rarity]
    .filter((value) => typeof value === "string" && value.trim())
    .join(" · ");
}

export function duplicateContentEntry(
  content,
  selection,
  folderId = undefined
) {
  const source = getContentEntry(
    content,
    selection?.id
  );
  if (!source) {
    return null;
  }
  const moduleKey = selection.moduleKey;
  const entry = {
    ...structuredClone(source),
    id: allocateContentId(content, moduleKey),
    name: `${source.name || "未命名"} 副本`
  };
  if (folderId !== undefined) {
    entry.folderId = folderId || null;
  }
  content[moduleKey].push(entry);
  commitContentId(content, moduleKey, entry.id);
  return {
    entry,
    selection: { moduleKey, id: entry.id }
  };
}

export function getContentFolders(content, moduleKey) {
  const folders = content?.contentFolders?.[moduleKey];
  return Array.isArray(folders) ? folders : [];
}

export function getContentFolder(
  content,
  moduleKey,
  folderId
) {
  if (!folderId) {
    return null;
  }
  return (
    getContentFolders(content, moduleKey).find(
      (folder) => folder?.id === folderId
    ) ?? null
  );
}

export function getContentFolderPath(
  content,
  moduleKey,
  folderId
) {
  const path = [];
  const visited = new Set();
  let folder = getContentFolder(content, moduleKey, folderId);
  while (folder && !visited.has(folder.id)) {
    visited.add(folder.id);
    path.unshift(folder);
    folder = folder.parentId
      ? getContentFolder(content, moduleKey, folder.parentId)
      : null;
  }
  return path;
}

export function allocateContentFolderId(content, moduleKey) {
  const definition = getContentModuleDefinition(moduleKey);
  if (!definition) {
    throw new Error(`未知内容模块：${moduleKey}`);
  }
  const folders = getContentFolders(content, moduleKey);
  const highest = folders.reduce((result, folder) => {
    const match = CONTENT_FOLDER_ID_PATTERN.exec(folder?.id);
    return match && match[1] === definition.prefix
      ? Math.max(result, Number(match[2]))
      : result;
  }, 0);
  const stored = Number(
    content?.folderIdCounters?.[moduleKey]
  );
  const next = Math.max(
    highest,
    Number.isInteger(stored) && stored >= 0 ? stored : 0
  );
  for (let index = next + 1; index <= 9999; index += 1) {
    const id = `${definition.prefix}-folder-${String(
      index
    ).padStart(4, "0")}`;
    if (!getContentFolder(content, moduleKey, id)) {
      return id;
    }
  }
  throw new Error(`${definition.label}文件夹已用完可用 ID`);
}

function getUniqueContentFolderName(
  content,
  moduleKey,
  parentId,
  baseName
) {
  const names = new Set(
    getContentFolders(content, moduleKey)
      .filter((folder) => (folder.parentId ?? null) === parentId)
      .map((folder) => folder.name)
  );
  if (!names.has(baseName)) {
    return baseName;
  }
  let suffix = 2;
  while (names.has(`${baseName} ${suffix}`)) {
    suffix += 1;
  }
  return `${baseName} ${suffix}`;
}

export function insertContentFolder(
  content,
  moduleKey,
  { name = "新建文件夹", parentId = null } = {}
) {
  if (!getContentModuleDefinition(moduleKey)) {
    throw new Error(`未知内容模块：${moduleKey}`);
  }
  if (
    parentId &&
    !getContentFolder(content, moduleKey, parentId)
  ) {
    throw new Error("目标内容文件夹不存在");
  }
  const folder = {
    id: allocateContentFolderId(content, moduleKey),
    name: getUniqueContentFolderName(
      content,
      moduleKey,
      parentId,
      String(name || "新建文件夹").trim() || "新建文件夹"
    ),
    parentId
  };
  content.contentFolders ??= Object.fromEntries(
    CONTENT_MODULES.map((definition) => [
      definition.key,
      []
    ])
  );
  content.contentFolders[moduleKey] ??= [];
  content.contentFolders[moduleKey].push(folder);
  content.folderIdCounters ??= {};
  content.folderIdCounters[moduleKey] = Number(
    CONTENT_FOLDER_ID_PATTERN.exec(folder.id)[2]
  );
  return folder;
}

export function renameContentFolder(
  content,
  moduleKey,
  folderId,
  name
) {
  const folder = getContentFolder(content, moduleKey, folderId);
  const nextName = String(name ?? "").trim();
  if (!folder || !nextName) {
    return false;
  }
  folder.name = nextName;
  return true;
}

export function moveContentEntry(
  content,
  contentId,
  folderId
) {
  const definition = getContentModuleForId(contentId);
  const entry = getContentEntry(content, contentId);
  if (
    !definition ||
    !entry ||
    (folderId &&
      !getContentFolder(
        content,
        definition.key,
        folderId
      ))
  ) {
    return false;
  }
  const nextFolderId = folderId || null;
  if ((entry.folderId ?? null) === nextFolderId) {
    return false;
  }
  entry.folderId = nextFolderId;
  return true;
}

export function isContentFolderInside(
  content,
  moduleKey,
  folderId,
  possibleParentId
) {
  let folder = getContentFolder(
    content,
    moduleKey,
    folderId
  );
  const visited = new Set();
  while (folder && !visited.has(folder.id)) {
    if (folder.id === possibleParentId) {
      return true;
    }
    visited.add(folder.id);
    folder = folder.parentId
      ? getContentFolder(
          content,
          moduleKey,
          folder.parentId
        )
      : null;
  }
  return false;
}

export function moveContentFolder(
  content,
  moduleKey,
  folderId,
  parentId
) {
  const folder = getContentFolder(content, moduleKey, folderId);
  if (
    !folder ||
    folderId === parentId ||
    (parentId &&
      !getContentFolder(content, moduleKey, parentId)) ||
    (parentId &&
      isContentFolderInside(
        content,
        moduleKey,
        parentId,
        folderId
      ))
  ) {
    return false;
  }
  const nextParentId = parentId || null;
  if ((folder.parentId ?? null) === nextParentId) {
    return false;
  }
  const conflict = getContentFolders(
    content,
    moduleKey
  ).some(
    (candidate) =>
      candidate.id !== folder.id &&
      (candidate.parentId ?? null) === nextParentId &&
      candidate.name === folder.name
  );
  if (conflict) {
    return false;
  }
  folder.parentId = nextParentId;
  return true;
}

export function removeContentFolder(
  content,
  moduleKey,
  folderId
) {
  if (!getContentFolder(content, moduleKey, folderId)) {
    return null;
  }
  const removedFolderIds = new Set([folderId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of getContentFolders(
      content,
      moduleKey
    )) {
      if (
        folder.parentId &&
        removedFolderIds.has(folder.parentId) &&
        !removedFolderIds.has(folder.id)
      ) {
        removedFolderIds.add(folder.id);
        changed = true;
      }
    }
  }
  const removedContentIds = new Set(
    (content[moduleKey] ?? [])
      .filter((entry) =>
        removedFolderIds.has(entry.folderId)
      )
      .map((entry) => entry.id)
  );
  content[moduleKey] = (content[moduleKey] ?? []).filter(
    (entry) => !removedContentIds.has(entry.id)
  );
  content.contentFolders[moduleKey] = getContentFolders(
    content,
    moduleKey
  ).filter((folder) => !removedFolderIds.has(folder.id));
  if (moduleKey === "conversations") {
    content.recentConversationIds = (
      content.recentConversationIds ?? []
    ).filter((id) => !removedContentIds.has(id));
  }
  return {
    removedFolderIds: [...removedFolderIds],
    removedContentIds: [...removedContentIds]
  };
}

export function duplicateContentFolder(
  content,
  moduleKey,
  sourceFolderId,
  destinationFolderId = null
) {
  const source = getContentFolder(
    content,
    moduleKey,
    sourceFolderId
  );
  if (
    !source ||
    (destinationFolderId &&
      !getContentFolder(
        content,
        moduleKey,
        destinationFolderId
      )) ||
    (destinationFolderId &&
      isContentFolderInside(
        content,
        moduleKey,
        destinationFolderId,
        sourceFolderId
      ))
  ) {
    return null;
  }

  const root = insertContentFolder(content, moduleKey, {
    name: `${source.name} 副本`,
    parentId: destinationFolderId
  });
  const folderMap = new Map([[source.id, root.id]]);
  const queue = [source.id];
  while (queue.length > 0) {
    const parentId = queue.shift();
    const children = getContentFolders(
      content,
      moduleKey
    ).filter((folder) => folder.parentId === parentId);
    for (const child of children) {
      if (child.id === root.id) {
        continue;
      }
      const copy = insertContentFolder(content, moduleKey, {
        name: child.name,
        parentId: folderMap.get(parentId)
      });
      folderMap.set(child.id, copy.id);
      queue.push(child.id);
    }
  }

  const copiedSelections = [];
  const sourceEntries = (content[moduleKey] ?? []).filter(
    (entry) => folderMap.has(entry.folderId)
  );
  for (const entry of sourceEntries) {
    const copied = duplicateContentEntry(
      content,
      {
        moduleKey,
        id: entry.id
      },
      folderMap.get(entry.folderId)
    );
    copiedSelections.push(copied.selection);
  }
  return {
    folder: root,
    selections: copiedSelections
  };
}

export function getConversationFolder(content, folderId) {
  return getContentFolder(content, "conversations", folderId);
}

export function getConversationFolderPath(content, folderId) {
  return getContentFolderPath(
    content,
    "conversations",
    folderId
  );
}

export function allocateConversationFolderId(content) {
  return allocateContentFolderId(content, "conversations");
}

export function insertConversationFolder(
  content,
  { name = "新建文件夹", parentId = null } = {}
) {
  return insertContentFolder(content, "conversations", {
    name,
    parentId
  });
}

export function renameConversationFolder(
  content,
  folderId,
  name
) {
  return renameContentFolder(
    content,
    "conversations",
    folderId,
    name
  );
}

export function moveConversationEntry(
  content,
  conversationId,
  folderId
) {
  return moveContentEntry(content, conversationId, folderId);
}

export function isConversationFolderInside(
  content,
  folderId,
  possibleParentId
) {
  return isContentFolderInside(
    content,
    "conversations",
    folderId,
    possibleParentId
  );
}

export function moveConversationFolder(
  content,
  folderId,
  parentId
) {
  return moveContentFolder(
    content,
    "conversations",
    folderId,
    parentId
  );
}

export function removeConversationFolder(content, folderId) {
  const removed = removeContentFolder(
    content,
    "conversations",
    folderId
  );
  return removed
    ? {
        removedFolderIds: removed.removedFolderIds,
        removedConversationIds: removed.removedContentIds
      }
    : null;
}

export function duplicateConversationFolder(
  content,
  sourceFolderId,
  destinationFolderId = null
) {
  return duplicateContentFolder(
    content,
    "conversations",
    sourceFolderId,
    destinationFolderId
  );
}

export function touchRecentConversation(content, conversationId) {
  if (
    !content ||
    !conversationId?.startsWith("00-") ||
    !getContentEntry(content, conversationId)
  ) {
    return false;
  }
  content.recentConversationIds ??= [];
  if (content.recentConversationIds.includes(conversationId)) {
    return false;
  }
  content.recentConversationIds.unshift(conversationId);
  content.recentConversationIds =
    content.recentConversationIds.slice(
      0,
      MAX_RECENT_CONVERSATIONS
    );
  return true;
}

export function reorderRecentConversation(
  content,
  draggedId,
  targetId,
  placement = "before"
) {
  const recent = content?.recentConversationIds;
  if (
    !Array.isArray(recent) ||
    draggedId === targetId ||
    !recent.includes(draggedId) ||
    !recent.includes(targetId)
  ) {
    return false;
  }
  const next = recent.filter((id) => id !== draggedId);
  const targetIndex = next.indexOf(targetId);
  next.splice(
    placement === "after" ? targetIndex + 1 : targetIndex,
    0,
    draggedId
  );
  if (next.every((id, index) => id === recent[index])) {
    return false;
  }
  content.recentConversationIds = next;
  return true;
}

export function removeContentEntry(content, selection) {
  const definition = getContentModuleDefinition(selection?.moduleKey);
  if (!definition || !Array.isArray(content?.[definition.key])) {
    return false;
  }
  const entries = content[definition.key];
  const index = entries.findIndex(
    (entry) => entry?.id === selection.id
  );
  if (index < 0) {
    return false;
  }
  entries.splice(index, 1);
  if (definition.key === "conversations") {
    content.recentConversationIds = (
      content.recentConversationIds ?? []
    ).filter((id) => id !== selection.id);
  }
  return true;
}

function commitContentId(content, moduleKey, id) {
  const definition = getContentModuleDefinition(moduleKey);
  content.idCounters ??= {};
  content.idCounters[moduleKey] = Number(
    id.slice(definition.prefix.length + 1)
  );
}
