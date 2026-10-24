import {
  CONTENT_MODULES,
  CURRENT_CONTENT_SCHEMA_VERSION,
  ITEM_STACK_LIMIT_MAX,
  MAX_RECENT_CONVERSATIONS,
  createDefaultCharacterAttributes,
  createDefaultCharacterCollisionBody
} from "./schema.js";

function clone(value) {
  return structuredClone(value);
}

export function createEmptyContentDocument() {
  return {
    schemaVersion: CURRENT_CONTENT_SCHEMA_VERSION,
    idCounters: Object.fromEntries(
      CONTENT_MODULES.map((definition) => [definition.key, 0])
    ),
    folderIdCounters: Object.fromEntries(
      CONTENT_MODULES.map((definition) => [
        definition.key,
        0
      ])
    ),
    contentFolders: Object.fromEntries(
      CONTENT_MODULES.map((definition) => [
        definition.key,
        []
      ])
    ),
    itemTypeLibrary: {
      primaryTypes: [],
      rarities: []
    },
    recentConversationIds: [],
    ...Object.fromEntries(
      CONTENT_MODULES.map((definition) => [definition.key, []])
    )
  };
}

function migrateVersion1ToVersion2(document) {
  return {
    ...document,
    schemaVersion: 2,
    folderIdCounters: {
      conversations: 0
    },
    conversationFolders: [],
    recentConversationIds: [],
    conversations: Array.isArray(document.conversations)
      ? document.conversations.map((entry) => ({
          ...entry,
          folderId: null
        }))
      : []
  };
}

function migrateVersion2ToVersion3(document) {
  return {
    ...document,
    schemaVersion: 3,
    conversations: Array.isArray(document.conversations)
      ? document.conversations.map((entry) => ({
          ...entry,
          dialogue: Array.isArray(entry.dialogue)
            ? entry.dialogue
            : []
        }))
      : []
  };
}

function migrateVersion3ToVersion4(document) {
  const legacyConversationFolders = Array.isArray(
    document.conversationFolders
  )
    ? document.conversationFolders
    : [];
  const contentFolders = Object.fromEntries(
    CONTENT_MODULES.map((definition) => [
      definition.key,
      definition.key === "conversations"
        ? legacyConversationFolders
        : []
    ])
  );
  const folderIdCounters = Object.fromEntries(
    CONTENT_MODULES.map((definition) => [
      definition.key,
      definition.key === "conversations"
        ? Number(document.folderIdCounters?.conversations) || 0
        : 0
    ])
  );
  const migrated = {
    ...document,
    schemaVersion: 4,
    contentFolders,
    folderIdCounters
  };
  delete migrated.conversationFolders;
  for (const definition of CONTENT_MODULES) {
    migrated[definition.key] = Array.isArray(
      document[definition.key]
    )
      ? document[definition.key].map((entry) => ({
          ...entry,
          folderId:
            typeof entry?.folderId === "string" &&
            entry.folderId
              ? entry.folderId
              : null
        }))
      : [];
  }
  return migrated;
}

function migrateVersion4ToVersion5(document) {
  return {
    ...document,
    schemaVersion: 5,
    quests: Array.isArray(document.quests)
      ? document.quests.map((entry) => ({
          ...entry,
          prerequisites:
            entry?.prerequisites &&
            typeof entry.prerequisites === "object" &&
            !Array.isArray(entry.prerequisites)
              ? entry.prerequisites
              : {
                  enabled: false,
                  conditions: []
                },
          completionConditions: Array.isArray(
            entry?.completionConditions
          )
            ? entry.completionConditions
            : [],
          rewards: Array.isArray(entry?.rewards)
            ? entry.rewards
            : []
        }))
      : []
  };
}

function migrateVersion5ToVersion6(document) {
  return {
    ...document,
    schemaVersion: 6,
    quests: Array.isArray(document.quests)
      ? document.quests.map((entry) => ({
          ...entry,
          prerequisites: Array.isArray(entry?.prerequisites)
            ? entry.prerequisites
            : Array.isArray(entry?.prerequisites?.conditions)
              ? entry.prerequisites.conditions
              : []
        }))
      : []
  };
}

function migrateVersion6ToVersion7(document) {
  return {
    ...document,
    schemaVersion: 7,
    characters: Array.isArray(document.characters)
      ? document.characters
      : []
  };
}

function migrateVersion7ToVersion8(document) {
  return {
    ...document,
    schemaVersion: 8,
    characters: Array.isArray(document.characters)
      ? document.characters.map((entry) => ({
          ...entry,
          attributes:
            entry?.attributes &&
            typeof entry.attributes === "object" &&
            !Array.isArray(entry.attributes)
              ? entry.attributes
              : createDefaultCharacterAttributes(),
          animationBindings: Array.isArray(entry?.animationBindings)
            ? entry.animationBindings
            : []
        }))
      : []
  };
}

function migrateAttackRangeToPolygon(attackRange) {
  if (!attackRange || typeof attackRange !== "object") {
    return attackRange ?? null;
  }
  if (Array.isArray(attackRange.points)) {
    return attackRange;
  }
  const x = Number(attackRange.x) || 0;
  const y = Number(attackRange.y) || 0;
  const width = Math.max(0, Number(attackRange.width) || 0);
  const height = Math.max(0, Number(attackRange.height) || 0);
  return {
    points: [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height }
    ],
    segments: Array.from({ length: 4 }, () => ({
      type: "line",
      control: null
    }))
  };
}

function migrateVersion8ToVersion9(document) {
  return {
    ...document,
    schemaVersion: 9,
    characters: Array.isArray(document.characters)
      ? document.characters.map((character) => ({
          ...character,
          animationBindings: Array.isArray(
            character?.animationBindings
          )
            ? character.animationBindings.map((binding) => ({
                ...binding,
                attackRange: migrateAttackRangeToPolygon(
                  binding?.attackRange
                )
              }))
            : []
        }))
      : []
  };
}

function normalizeItemTypeName(value) {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ")
    : "";
}

function normalizeItemPrice(value) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function normalizeItemEffect(value) {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  return {
    mode: source.mode === "script" ? "script" : "description",
    description:
      typeof source.description === "string"
        ? source.description
        : "",
    script:
      typeof source.script === "string" ? source.script.trim() : ""
  };
}

function normalizeItemIllustration(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const relativePath =
    typeof value.relativePath === "string"
      ? value.relativePath.trim()
      : "";
  if (!relativePath) {
    return null;
  }
  const fileName =
    typeof value.fileName === "string" ? value.fileName : "";
  return {
    assetId:
      typeof value.assetId === "string" ? value.assetId : "",
    fileName,
    displayName:
      typeof value.displayName === "string" && value.displayName
        ? value.displayName
        : fileName,
    relativePath,
    folderId:
      typeof value.folderId === "string" && value.folderId
        ? value.folderId
        : null,
    folderPath:
      typeof value.folderPath === "string"
        ? value.folderPath
        : "",
    revision:
      typeof value.revision === "string" ? value.revision : ""
  };
}

function normalizeItemFields(source) {
  const stackLimit = Math.round(Number(source?.stackLimit));
  return {
    primaryType: normalizeItemTypeName(source?.primaryType),
    secondaryType: normalizeItemTypeName(source?.secondaryType),
    rarity: normalizeItemTypeName(source?.rarity),
    stackLimit:
      Number.isFinite(stackLimit) && stackLimit > 0
        ? Math.min(stackLimit, ITEM_STACK_LIMIT_MAX)
        : 1,
    tradeable: source?.tradeable !== false,
    buyPrice: normalizeItemPrice(source?.buyPrice),
    sellPrice: normalizeItemPrice(source?.sellPrice),
    effect: normalizeItemEffect(source?.effect),
    illustration: normalizeItemIllustration(source?.illustration)
  };
}

export function normalizeItemTypeLibrary(value) {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  const primaryTypes = [];
  const primaryByKey = new Map();
  for (const primary of Array.isArray(source.primaryTypes)
    ? source.primaryTypes
    : []) {
    const name = normalizeItemTypeName(primary?.name);
    if (!name) {
      continue;
    }
    const key = name.toLowerCase();
    let record = primaryByKey.get(key);
    if (!record) {
      record = { name, secondaryTypes: [] };
      primaryByKey.set(key, record);
      primaryTypes.push(record);
    }
    const secondaryKeys = new Set(
      record.secondaryTypes.map((item) => item.toLowerCase())
    );
    for (const secondary of Array.isArray(primary?.secondaryTypes)
      ? primary.secondaryTypes
      : []) {
      const secondaryName = normalizeItemTypeName(secondary);
      if (
        !secondaryName ||
        secondaryKeys.has(secondaryName.toLowerCase())
      ) {
        continue;
      }
      secondaryKeys.add(secondaryName.toLowerCase());
      record.secondaryTypes.push(secondaryName);
    }
  }

  const rarities = [];
  const rarityKeys = new Set();
  for (const rarity of Array.isArray(source.rarities)
    ? source.rarities
    : []) {
    const name = normalizeItemTypeName(rarity);
    if (!name || rarityKeys.has(name.toLowerCase())) {
      continue;
    }
    rarityKeys.add(name.toLowerCase());
    rarities.push(name);
  }

  return { primaryTypes, rarities };
}

function migrateVersion9ToVersion10(document) {
  return {
    ...document,
    schemaVersion: 10,
    itemTypeLibrary: normalizeItemTypeLibrary(
      document.itemTypeLibrary
    ),
    items: Array.isArray(document.items)
      ? document.items.map((entry) => ({
          ...entry,
          ...normalizeItemFields(entry)
        }))
      : []
  };
}

function migrateVersion10ToVersion11(document) {
  return {
    ...document,
    schemaVersion: 11,
    items: Array.isArray(document.items)
      ? document.items.map((entry) => ({
          ...entry,
          illustration: normalizeItemIllustration(
            entry?.illustration
          )
        }))
      : [],
    characters: Array.isArray(document.characters)
      ? document.characters.map((character) => ({
          ...character,
          animationBindings: Array.isArray(
            character?.animationBindings
          )
            ? character.animationBindings.map((binding) => ({
                ...binding,
                source: {
                  ...binding?.source,
                  folderId:
                    typeof binding?.source?.folderId === "string" &&
                    binding.source.folderId
                      ? binding.source.folderId
                      : null,
                  folderPath:
                    typeof binding?.source?.folderPath === "string"
                      ? binding.source.folderPath
                      : ""
                }
              }))
            : []
        }))
      : []
  };
}

function migrateVersion11ToVersion12(document) {
  return {
    ...document,
    schemaVersion: 12,
    characters: Array.isArray(document.characters)
      ? document.characters.map((character) => ({
          ...character,
          animationBindings: Array.isArray(
            character?.animationBindings
          )
            ? character.animationBindings.map((binding) => ({
                ...binding,
                triggers: normalizeCharacterTriggers(
                  binding?.triggers,
                  binding?.direction
                )
              }))
            : []
        }))
      : []
  };
}

function migrateVersion12ToVersion13(document) {
  return {
    ...document,
    schemaVersion: 13
  };
}

function migrateVersion13ToVersion14(document) {
  return {
    ...document,
    schemaVersion: 14,
    characters: Array.isArray(document.characters)
      ? document.characters.map((character) => ({
          ...character,
          animationBindings: Array.isArray(
            character?.animationBindings
          )
            ? character.animationBindings.map((binding) => ({
                ...binding,
                frameSound: normalizeCharacterFrameSound(
                  binding?.frameSound
                )
              }))
            : []
        }))
      : []
  };
}

function migrateVersion14ToVersion15(document) {
  return {
    ...document,
    schemaVersion: 15,
    characters: Array.isArray(document.characters)
      ? document.characters.map((character) => ({
          ...character,
          collisionBody: normalizeCharacterCollisionBody(
            character?.collisionBody
          ),
          animationBindings: Array.isArray(
            character?.animationBindings
          )
            ? character.animationBindings.map((binding) => ({
                ...binding,
                note:
                  typeof binding?.note === "string"
                    ? binding.note
                    : ""
              }))
            : []
        }))
      : []
  };
}

function migrateVersion15ToVersion16(document) {
  return {
    ...document,
    schemaVersion: 16,
    characters: Array.isArray(document.characters)
      ? document.characters.map((character) => ({
          ...character,
          animationBindings: Array.isArray(
            character?.animationBindings
          )
            ? character.animationBindings.map((binding) => {
                const { attackRange, ...rest } = binding ?? {};
                if (Array.isArray(rest.attackRanges)) {
                  return rest;
                }
                return {
                  ...rest,
                  attackRanges: attackRange
                    ? [
                        {
                          frame: rest.attackFrame ?? 1,
                          ...attackRange
                        }
                      ]
                    : []
                };
              })
            : []
        }))
      : []
  };
}

export function migrateContentDocument(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("内容文件必须是 JSON 对象");
  }
  const sourceVersion = input.schemaVersion;
  if (
    sourceVersion !== undefined &&
    (!Number.isInteger(sourceVersion) ||
      sourceVersion < 1 ||
      sourceVersion > CURRENT_CONTENT_SCHEMA_VERSION)
  ) {
    throw new Error(
      `不支持的内容 schemaVersion：${sourceVersion}；当前版本为 ${CURRENT_CONTENT_SCHEMA_VERSION}`
    );
  }
  let migrated = clone(input);
  let version = sourceVersion ?? 1;
  if (version <= 1) {
    migrated = migrateVersion1ToVersion2(migrated);
    version = 2;
  }
  if (version <= 2) {
    migrated = migrateVersion2ToVersion3(migrated);
    version = 3;
  }
  if (version <= 3) {
    migrated = migrateVersion3ToVersion4(migrated);
    version = 4;
  }
  if (version <= 4) {
    migrated = migrateVersion4ToVersion5(migrated);
    version = 5;
  }
  if (version <= 5) {
    migrated = migrateVersion5ToVersion6(migrated);
    version = 6;
  }
  if (version <= 6) {
    migrated = migrateVersion6ToVersion7(migrated);
    version = 7;
  }
  if (version <= 7) {
    migrated = migrateVersion7ToVersion8(migrated);
    version = 8;
  }
  if (version <= 8) {
    migrated = migrateVersion8ToVersion9(migrated);
    version = 9;
  }
  if (version <= 9) {
    migrated = migrateVersion9ToVersion10(migrated);
    version = 10;
  }
  if (version <= 10) {
    migrated = migrateVersion10ToVersion11(migrated);
    version = 11;
  }
  if (version <= 11) {
    migrated = migrateVersion11ToVersion12(migrated);
    version = 12;
  }
  if (version <= 12) {
    migrated = migrateVersion12ToVersion13(migrated);
    version = 13;
  }
  if (version <= 13) {
    migrated = migrateVersion13ToVersion14(migrated);
    version = 14;
  }
  if (version <= 14) {
    migrated = migrateVersion14ToVersion15(migrated);
    version = 15;
  }
  if (version <= 15) {
    migrated = migrateVersion15ToVersion16(migrated);
  }
  return normalizeContentDocument({
    ...migrated,
    schemaVersion: CURRENT_CONTENT_SCHEMA_VERSION
  });
}

export function normalizeContentDocument(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("内容文件必须是 JSON 对象");
  }

  const defaults = createEmptyContentDocument();
  const content = {
    ...defaults,
    ...clone(input),
    schemaVersion: CURRENT_CONTENT_SCHEMA_VERSION
  };

  for (const definition of CONTENT_MODULES) {
    content[definition.key] = Array.isArray(input[definition.key])
      ? input[definition.key].map((entry) => {
          const cloned = clone(entry);
          const normalized = {
            ...cloned,
            id:
              typeof cloned?.id === "string"
                ? cloned.id
                : String(cloned?.id ?? ""),
            name:
              typeof cloned?.name === "string"
                ? cloned.name
                : String(cloned?.name ?? ""),
            description:
              typeof cloned?.description === "string"
                ? cloned.description
                : String(cloned?.description ?? "")
          };
          normalized.folderId =
            typeof cloned?.folderId === "string" &&
            cloned.folderId
              ? cloned.folderId
              : null;
          if (definition.key === "conversations") {
            normalized.dialogue = Array.isArray(cloned?.dialogue)
              ? cloned.dialogue.map((line, index) => ({
                  ...clone(line),
                  id:
                    typeof line?.id === "string" && line.id
                      ? line.id
                      : `line-${index + 1}`,
                  role:
                    typeof line?.role === "string"
                      ? line.role
                      : String(line?.role ?? ""),
                  content:
                    typeof line?.content === "string"
                      ? line.content
                      : String(line?.content ?? "")
                }))
              : [];
          } else {
            delete normalized.dialogue;
          }
          if (definition.key === "quests") {
            normalized.prerequisites = normalizeQuestPrerequisites(
              cloned?.prerequisites
            );
            normalized.completionConditions =
              normalizeQuestCompletionConditions(
                cloned?.completionConditions
              );
            normalized.rewards = normalizeQuestRewards(
              cloned?.rewards
            );
          }
          if (definition.key === "characters") {
            normalized.attributes = normalizeCharacterAttributes(
              cloned?.attributes
            );
            normalized.collisionBody =
              normalizeCharacterCollisionBody(
                cloned?.collisionBody
              );
            normalized.animationBindings =
              normalizeCharacterAnimationBindings(
                cloned?.animationBindings,
                normalized.id
              );
          } else {
            delete normalized.attributes;
            delete normalized.animationBindings;
            delete normalized.collisionBody;
          }
          if (definition.key === "items") {
            Object.assign(normalized, normalizeItemFields(cloned));
          } else {
            for (const field of [
              "primaryType",
              "secondaryType",
              "rarity",
              "stackLimit",
              "tradeable",
              "buyPrice",
              "sellPrice",
              "effect",
              "illustration"
            ]) {
              delete normalized[field];
            }
          }
          return normalized;
        })
      : [];
  }

  const suppliedFolders =
    input.contentFolders &&
    typeof input.contentFolders === "object" &&
    !Array.isArray(input.contentFolders)
      ? input.contentFolders
      : {};
  content.contentFolders = Object.fromEntries(
    CONTENT_MODULES.map((definition) => {
      const source =
        definition.key === "conversations" &&
        !Array.isArray(suppliedFolders.conversations) &&
        Array.isArray(input.conversationFolders)
          ? input.conversationFolders
          : suppliedFolders[definition.key];
      const folders = Array.isArray(source)
        ? source.map((folder) => {
            const cloned = clone(folder);
            return {
              ...cloned,
              id:
                typeof cloned?.id === "string"
                  ? cloned.id
                  : String(cloned?.id ?? ""),
              name:
                typeof cloned?.name === "string"
                  ? cloned.name
                  : String(cloned?.name ?? ""),
              parentId:
                typeof cloned?.parentId === "string" &&
                cloned.parentId
                  ? cloned.parentId
                  : null
            };
          })
        : [];
      return [definition.key, folders];
    })
  );
  delete content.conversationFolders;

  content.itemTypeLibrary = normalizeItemTypeLibrary(
    input.itemTypeLibrary
  );

  const conversationIds = new Set(
    content.conversations.map((entry) => entry.id)
  );
  const recentIds = [];
  for (const id of Array.isArray(input.recentConversationIds)
    ? input.recentConversationIds
    : []) {
    if (
      typeof id !== "string" ||
      !conversationIds.has(id) ||
      recentIds.includes(id)
    ) {
      continue;
    }
    recentIds.push(id);
    if (recentIds.length === MAX_RECENT_CONVERSATIONS) {
      break;
    }
  }
  content.recentConversationIds = recentIds;

  const suppliedCounters =
    input.idCounters &&
    typeof input.idCounters === "object" &&
    !Array.isArray(input.idCounters)
      ? input.idCounters
      : {};
  content.idCounters = Object.fromEntries(
    CONTENT_MODULES.map((definition) => {
      const highestId = content[definition.key].reduce(
        (highest, entry) => {
          const match = new RegExp(
            `^${definition.prefix}-([0-9]{4})$`
          ).exec(entry?.id);
          return match
            ? Math.max(highest, Number(match[1]))
            : highest;
        },
        0
      );
      const counter = Number(suppliedCounters[definition.key]);
      return [
        definition.key,
        Math.max(
          highestId,
          Number.isInteger(counter) && counter >= 0
            ? counter
            : 0
        )
      ];
    })
  );

  const suppliedFolderCounters =
    input.folderIdCounters &&
    typeof input.folderIdCounters === "object" &&
    !Array.isArray(input.folderIdCounters)
      ? input.folderIdCounters
      : {};
  content.folderIdCounters = Object.fromEntries(
    CONTENT_MODULES.map((definition) => {
      const pattern = new RegExp(
        `^${definition.prefix}-folder-([0-9]{4})$`
      );
      const highestFolderId = (
        content.contentFolders[definition.key] ?? []
      ).reduce((highest, folder) => {
        const match = pattern.exec(folder?.id);
        return match
          ? Math.max(highest, Number(match[1]))
          : highest;
      }, 0);
      const stored = Number(
        suppliedFolderCounters[definition.key]
      );
      return [
        definition.key,
        Math.max(
          highestFolderId,
          Number.isInteger(stored) && stored >= 0 ? stored : 0
        )
      ];
    })
  );

  return content;
}

function normalizeQuestPrerequisites(value) {
  const conditions = Array.isArray(value)
    ? value
    : Array.isArray(value?.conditions)
      ? value.conditions
      : [];
  return conditions.map((condition) => ({
        ...clone(condition),
        taskId:
          typeof condition?.taskId === "string"
            ? condition.taskId
            : String(condition?.taskId ?? ""),
        status:
          typeof condition?.status === "string"
            ? condition.status
            : String(condition?.status ?? "inactive")
      }));
}

function normalizeQuestCompletionConditions(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((condition) => {
    const cloned = clone(condition);
    return {
      ...cloned,
      type:
        typeof cloned?.type === "string"
          ? cloned.type
          : String(cloned?.type ?? ""),
      itemId:
        typeof cloned?.itemId === "string"
          ? cloned.itemId
          : String(cloned?.itemId ?? ""),
      quantity: Number(cloned?.quantity)
    };
  });
}

function normalizeQuestRewards(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((reward) => {
    const cloned = clone(reward);
    return {
      ...cloned,
      itemId:
        typeof cloned?.itemId === "string"
          ? cloned.itemId
          : String(cloned?.itemId ?? ""),
      quantity: Number(cloned?.quantity)
    };
  });
}

function normalizeFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeCharacterAttributes(value) {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  return Object.fromEntries(
    Object.entries(createDefaultCharacterAttributes()).map(
      ([key, fallback]) => [
        key,
        normalizeFiniteNumber(source[key], fallback)
      ]
    )
  );
}

function normalizeCharacterContentBounds(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return {
    x: normalizeFiniteNumber(value.x),
    y: normalizeFiniteNumber(value.y),
    width: Math.max(1, normalizeFiniteNumber(value.width, 1)),
    height: Math.max(1, normalizeFiniteNumber(value.height, 1))
  };
}

function normalizeCharacterCollisionBody(value) {
  const fallback = createDefaultCharacterCollisionBody();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback;
  }
  const x = Math.min(
    0.98,
    Math.max(0, normalizeFiniteNumber(value.x, fallback.x))
  );
  const y = Math.min(
    0.98,
    Math.max(0, normalizeFiniteNumber(value.y, fallback.y))
  );
  const width = Math.min(
    1 - x,
    Math.max(
      0.02,
      normalizeFiniteNumber(value.width, fallback.width)
    )
  );
  const height = Math.min(
    1 - y,
    Math.max(
      0.02,
      normalizeFiniteNumber(value.height, fallback.height)
    )
  );
  return { x, y, width, height };
}

function normalizeCharacterAnimationSource(value) {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  return {
    assetId:
      typeof source.assetId === "string"
        ? source.assetId
        : String(source.assetId ?? ""),
    fileName:
      typeof source.fileName === "string"
        ? source.fileName
        : String(source.fileName ?? ""),
    relativePath:
      typeof source.relativePath === "string"
        ? source.relativePath
        : String(source.relativePath ?? ""),
    url:
      typeof source.url === "string"
        ? source.url
        : String(source.url ?? ""),
    folderId:
      typeof source.folderId === "string" && source.folderId
        ? source.folderId
        : null,
    folderPath:
      typeof source.folderPath === "string"
        ? source.folderPath
        : "",
    imageWidth: Math.max(
      1,
      Math.round(normalizeFiniteNumber(source.imageWidth, 1))
    ),
    imageHeight: Math.max(
      1,
      Math.round(normalizeFiniteNumber(source.imageHeight, 1))
    ),
    frameWidth: Math.max(
      1,
      Math.round(normalizeFiniteNumber(source.frameWidth, 1))
    ),
    frameHeight: Math.max(
      1,
      Math.round(normalizeFiniteNumber(source.frameHeight, 1))
    ),
    frameCount: Math.max(
      1,
      Math.round(normalizeFiniteNumber(source.frameCount, 1))
    ),
    contentBounds: normalizeCharacterContentBounds(
      source.contentBounds
    )
  };
}

function normalizeCharacterAttackRange(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const source = migrateAttackRangeToPolygon(value);
  const points = Array.isArray(source?.points)
    ? source.points
        .slice(0, 12)
        .map((point) => ({
          x: normalizeFiniteNumber(point?.x),
          y: normalizeFiniteNumber(point?.y)
        }))
    : [];
  if (points.length < 3) {
    return null;
  }
  const suppliedSegments = Array.isArray(source?.segments)
    ? source.segments
    : [];
  const segments = points.map((point, index) => {
    const segment = suppliedSegments[index];
    const type = segment?.type === "curve" ? "curve" : "line";
    const next = points[(index + 1) % points.length];
    const control =
      type === "curve"
        ? {
            x: normalizeFiniteNumber(
              segment?.control?.x,
              (point.x + next.x) / 2
            ),
            y: normalizeFiniteNumber(
              segment?.control?.y,
              (point.y + next.y) / 2
            )
          }
        : null;
    return { type, control };
  });
  return { points, segments };
}

function normalizeCharacterAttackRanges(value, frameCount) {
  if (!Array.isArray(value)) {
    return [];
  }
  const limit = Math.max(
    1,
    Math.round(normalizeFiniteNumber(frameCount, 1))
  );
  const frames = new Set();
  const ranges = [];
  for (const entry of value) {
    const frame = Math.round(
      normalizeFiniteNumber(entry?.frame, 0)
    );
    if (
      !Number.isInteger(frame) ||
      frame < 1 ||
      frame > limit ||
      frames.has(frame)
    ) {
      continue;
    }
    const range = normalizeCharacterAttackRange(entry);
    if (!range) {
      continue;
    }
    frames.add(frame);
    ranges.push({ frame, ...range });
  }
  return ranges.sort((left, right) => left.frame - right.frame);
}

function normalizeCharacterFrameSound(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const requiredStrings = ["assetId", "fileName", "relativePath", "url"];
  if (
    requiredStrings.some(
      (key) =>
        typeof value[key] !== "string" || !value[key].trim()
    )
  ) {
    return null;
  }
  const relativePath = value.relativePath.trim();
  if (
    relativePath.startsWith("/") ||
    relativePath.includes("..")
  ) {
    return null;
  }
  const volume = Math.min(
    1,
    Math.max(0, normalizeFiniteNumber(value.volume, 1))
  );
  return {
    assetId: value.assetId.trim(),
    fileName: value.fileName.trim(),
    displayName:
      typeof value.displayName === "string" &&
      value.displayName.trim()
        ? value.displayName.trim()
        : value.fileName.trim(),
    relativePath,
    url: value.url.trim(),
    folderId:
      typeof value.folderId === "string" && value.folderId
        ? value.folderId
        : null,
    folderPath:
      typeof value.folderPath === "string"
        ? value.folderPath
        : "",
    volume,
    loop: value.loop === true
  };
}

function normalizeCharacterTriggers(
  value,
  fallbackDirection = "right"
) {
  if (!Array.isArray(value)) {
    return [];
  }
  const fallback =
    fallbackDirection === "left" ? "left" : "right";
  return value.map((trigger) => ({
    device:
      typeof trigger?.device === "string"
        ? trigger.device
        : String(trigger?.device ?? ""),
    code:
      typeof trigger?.code === "string"
        ? trigger.code
        : String(trigger?.code ?? ""),
    label:
      typeof trigger?.label === "string"
        ? trigger.label
        : String(trigger?.label ?? ""),
    direction:
      trigger?.direction === "left" ||
      trigger?.direction === "right"
        ? trigger.direction
        : fallback
  }));
}

function normalizeCharacterAnimationBindings(value, characterId) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((binding, index) => {
    const source = normalizeCharacterAnimationSource(
      binding?.source
    );
    const attackFrame = Math.min(
      source.frameCount,
      Math.max(
        1,
        Math.round(
          normalizeFiniteNumber(binding?.attackFrame, 1)
        )
      )
    );
    const direction =
      binding?.direction === "left" ? "left" : "right";
    return {
      id:
        typeof binding?.id === "string" && binding.id
          ? binding.id
          : `${characterId}-animation-${String(
              index + 1
            ).padStart(4, "0")}`,
      type:
        typeof binding?.type === "string"
          ? binding.type
          : String(binding?.type ?? ""),
      source,
      direction,
      frameRate: Math.min(
        60,
        Math.max(
          1,
          Math.round(
            normalizeFiniteNumber(binding?.frameRate, 8)
          )
        )
      ),
      attackFrame,
      attackRanges: normalizeCharacterAttackRanges(
        binding?.attackRanges,
        source.frameCount
      ),
      frameSound: normalizeCharacterFrameSound(
        binding?.frameSound
      ),
      note:
        typeof binding?.note === "string" ? binding.note : "",
      triggers: normalizeCharacterTriggers(
        binding?.triggers,
        direction
      )
    };
  });
}
