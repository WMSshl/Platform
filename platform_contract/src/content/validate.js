import {
  CHARACTER_ATTRIBUTE_DEFINITIONS,
  CONTENT_FOLDER_ID_PATTERN,
  CONTENT_ID_PATTERN,
  CONTENT_MODULES,
  CURRENT_CONTENT_SCHEMA_VERSION,
  ITEM_STACK_LIMIT_MAX,
  MAX_RECENT_CONVERSATIONS,
  getCharacterAnimationTypeDefinition,
  getContentModuleForId,
  isCharacterAnimationType,
  isCharacterTriggerDevice,
  isCharacterTriggerDirection,
  isItemEffectMode,
  isQuestCompletionConditionType,
  isQuestStatus
} from "./schema.js";

function pushIssue(issues, severity, message, selection = null) {
  issues.push({ severity, message, selection });
}

export function getContentEntry(content, id) {
  const definition = getContentModuleForId(id);
  if (!definition || !Array.isArray(content?.[definition.key])) {
    return null;
  }
  return (
    content[definition.key].find((entry) => entry?.id === id) ?? null
  );
}

export function getAllContentEntries(content) {
  return CONTENT_MODULES.flatMap((definition) =>
    (content?.[definition.key] ?? []).map((entry) => ({
      moduleKey: definition.key,
      moduleDefinition: definition,
      entry
    }))
  );
}

export function validateContentDocument(content) {
  const issues = [];
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    return [
      {
        severity: "error",
        message: "没有可校验的内容文档",
        selection: null
      }
    ];
  }

  if (content.schemaVersion !== CURRENT_CONTENT_SCHEMA_VERSION) {
    pushIssue(
      issues,
      "error",
      `内容 schemaVersion 必须为 ${CURRENT_CONTENT_SCHEMA_VERSION}`
    );
  }
  if (
    !content.idCounters ||
    typeof content.idCounters !== "object" ||
    Array.isArray(content.idCounters)
  ) {
    pushIssue(
      issues,
      "error",
      "内容 idCounters 必须是对象"
    );
  }

  const folderIdsByModule = new Map();
  const suppliedFolders =
    content.contentFolders &&
    typeof content.contentFolders === "object" &&
    !Array.isArray(content.contentFolders)
      ? content.contentFolders
      : {};
  for (const definition of CONTENT_MODULES) {
    const folders = suppliedFolders[definition.key];
    const folderIds = new Set();
    folderIdsByModule.set(definition.key, folderIds);
    if (!Array.isArray(folders)) {
      pushIssue(
        issues,
        "error",
        `内容 contentFolders.${definition.key} 必须是数组`
      );
      continue;
    }
    for (const folder of folders) {
      const folderId = folder?.id;
      const match =
        typeof folderId === "string"
          ? CONTENT_FOLDER_ID_PATTERN.exec(folderId)
          : null;
      if (
        !match ||
        match[1] !== definition.prefix
      ) {
        pushIssue(
          issues,
          "error",
          `${definition.label}文件夹 ID「${folderId || "无 ID"}」必须符合 ${definition.prefix}-folder-0000 格式`
        );
        continue;
      }
      if (folderIds.has(folderId)) {
        pushIssue(
          issues,
          "error",
          `${definition.label}文件夹 ID「${folderId}」重复`
        );
      }
      folderIds.add(folderId);
      if (
        typeof folder.name !== "string" ||
        !folder.name.trim()
      ) {
        pushIssue(
          issues,
          "error",
          `${definition.label}文件夹「${folderId}」的名称不能为空`
        );
      }
    }

    const foldersById = new Map(
      folders.map((folder) => [folder?.id, folder])
    );
    for (const folder of folders) {
      if (!folder?.parentId) {
        continue;
      }
      if (!foldersById.has(folder.parentId)) {
        pushIssue(
          issues,
          "error",
          `${definition.label}文件夹「${folder.id}」的父文件夹不存在`
        );
        continue;
      }
      const visited = new Set([folder.id]);
      let parent = foldersById.get(folder.parentId);
      while (parent) {
        if (visited.has(parent.id)) {
          pushIssue(
            issues,
            "error",
            `${definition.label}文件夹「${folder.id}」不能形成循环目录`
          );
          break;
        }
        visited.add(parent.id);
        parent = parent.parentId
          ? foldersById.get(parent.parentId)
          : null;
      }
    }
  }

  const itemLibrary = validateItemTypeLibrary(
    issues,
    content.itemTypeLibrary
  );

  const usedIds = new Set();
  for (const definition of CONTENT_MODULES) {
    const entries = content[definition.key];
    if (!Array.isArray(entries)) {
      pushIssue(
        issues,
        "error",
        `内容字段 ${definition.key} 必须是数组`,
        { moduleKey: definition.key, id: null }
      );
      continue;
    }

    for (const entry of entries) {
      const selection = {
        moduleKey: definition.key,
        id: entry?.id ?? null
      };
      const label = `${definition.label}「${entry?.id || "无 ID"}」`;
      if (!isValidContentId(entry?.id)) {
        pushIssue(
          issues,
          "error",
          `${label}的 ID 必须符合 ${definition.prefix}-0000 格式`,
          selection
        );
        continue;
      }
      const idModule = getContentModuleForId(entry.id);
      if (idModule?.key !== definition.key) {
        pushIssue(
          issues,
          "error",
          `${label}的 ID 前缀应为 ${definition.prefix}`,
          selection
        );
      }
      if (usedIds.has(entry.id)) {
        pushIssue(
          issues,
          "error",
          `内容 ID「${entry.id}」重复`,
          selection
        );
      }
      usedIds.add(entry.id);
      if (typeof entry.name !== "string" || !entry.name.trim()) {
        pushIssue(
          issues,
          "error",
          `${label}的名称不能为空`,
          selection
        );
      }
      if (
        entry.description !== undefined &&
        typeof entry.description !== "string"
      ) {
        pushIssue(
          issues,
          "error",
          `${label}的 description 必须是字符串`,
          selection
        );
      }
      if (
        entry.data !== undefined &&
        (!entry.data ||
          typeof entry.data !== "object" ||
          Array.isArray(entry.data))
      ) {
        pushIssue(
          issues,
          "error",
          `${label}的 data 必须是对象`,
          selection
        );
      }
      if (
        entry.folderId !== null &&
        entry.folderId !== undefined &&
        !folderIdsByModule
          .get(definition.key)
          ?.has(entry.folderId)
      ) {
        pushIssue(
          issues,
          "error",
          `${label}的 folderId 指向不存在的${definition.label}文件夹`,
          selection
        );
      }
      if (definition.key === "conversations") {
        if (entry.dialogue !== undefined) {
          if (!Array.isArray(entry.dialogue)) {
            pushIssue(
              issues,
              "error",
              `${label}的 dialogue 必须是数组`,
              selection
            );
          } else {
            const dialogueIds = new Set();
            for (const [index, line] of entry.dialogue.entries()) {
              const lineLabel = `${label}第 ${index + 1} 行对话`;
              if (
                typeof line?.id !== "string" ||
                !line.id.trim()
              ) {
                pushIssue(
                  issues,
                  "error",
                  `${lineLabel}的 id 不能为空`,
                  selection
                );
              } else if (dialogueIds.has(line.id)) {
                pushIssue(
                  issues,
                  "error",
                  `${lineLabel}的 id「${line.id}」重复`,
                  selection
                );
              } else {
                dialogueIds.add(line.id);
              }
              if (typeof line?.role !== "string") {
                pushIssue(
                  issues,
                  "error",
                  `${lineLabel}的 role 必须是字符串`,
                  selection
                );
              }
              if (typeof line?.content !== "string") {
                pushIssue(
                  issues,
                  "error",
                  `${lineLabel}的 content 必须是字符串`,
                  selection
                );
              }
            }
          }
        }
      }
      if (definition.key === "quests") {
        validateQuest(issues, entry, entries, label, selection);
      }
      if (definition.key === "characters") {
        validateCharacter(issues, entry, label, selection);
      }
      if (definition.key === "items") {
        validateItem(
          issues,
          entry,
          label,
          selection,
          itemLibrary
        );
      }
    }
    const highestId = entries.reduce((highest, entry) => {
      const match = new RegExp(
        `^${definition.prefix}-([0-9]{4})$`
      ).exec(entry?.id);
      return match ? Math.max(highest, Number(match[1])) : highest;
    }, 0);
    const counter = content.idCounters?.[definition.key];
    if (!Number.isInteger(counter) || counter < 0) {
      pushIssue(
        issues,
        "error",
        `内容 idCounters.${definition.key} 必须是非负整数`
      );
    } else if (counter < highestId) {
      pushIssue(
        issues,
        "error",
        `内容 idCounters.${definition.key} 不能小于已使用的最大编号 ${highestId}`
      );
    }
  }

  const conversationIds = new Set(
    (content.conversations ?? []).map((entry) => entry?.id)
  );
  if (!Array.isArray(content.recentConversationIds)) {
    pushIssue(
      issues,
      "error",
      "内容 recentConversationIds 必须是数组"
    );
  } else {
    if (
      content.recentConversationIds.length >
      MAX_RECENT_CONVERSATIONS
    ) {
      pushIssue(
        issues,
        "error",
        `最近会话最多保存 ${MAX_RECENT_CONVERSATIONS} 项`
      );
    }
    const recentIds = new Set();
    for (const id of content.recentConversationIds) {
      if (!conversationIds.has(id)) {
        pushIssue(
          issues,
          "error",
          `最近会话「${id}」不存在`
        );
      }
      if (recentIds.has(id)) {
        pushIssue(
          issues,
          "error",
          `最近会话「${id}」重复`
        );
      }
      recentIds.add(id);
    }
  }

  for (const definition of CONTENT_MODULES) {
    const folderCounter =
      content.folderIdCounters?.[definition.key];
    const pattern = new RegExp(
      `^${definition.prefix}-folder-([0-9]{4})$`
    );
    const highestFolderId = [
      ...(folderIdsByModule.get(definition.key) ?? [])
    ].reduce((highest, id) => {
      const match = pattern.exec(id);
      return match
        ? Math.max(highest, Number(match[1]))
        : highest;
    }, 0);
    if (!Number.isInteger(folderCounter) || folderCounter < 0) {
      pushIssue(
        issues,
        "error",
        `内容 folderIdCounters.${definition.key} 必须是非负整数`
      );
    } else if (folderCounter < highestFolderId) {
      pushIssue(
        issues,
        "error",
        `内容 folderIdCounters.${definition.key} 不能小于已使用的最大编号 ${highestFolderId}`
      );
    }
  }
  return issues;
}

export function hasContentErrors(issues) {
  return issues.some((issue) => issue.severity === "error");
}

function isValidContentId(value) {
  return typeof value === "string" && CONTENT_ID_PATTERN.test(value);
}

function validateItemTypeLibrary(issues, value) {
  const primaryTypes = new Map();
  const rarities = new Set();
  if (value === undefined) {
    return { available: false, primaryTypes, rarities };
  }
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    pushIssue(
      issues,
      "error",
      "物品类型库 itemTypeLibrary 必须是对象"
    );
    return { available: false, primaryTypes, rarities };
  }

  if (!Array.isArray(value.primaryTypes)) {
    pushIssue(
      issues,
      "error",
      "物品类型库 primaryTypes 必须是数组"
    );
  } else {
    for (const [index, primary] of value.primaryTypes.entries()) {
      const name =
        typeof primary?.name === "string"
          ? primary.name.trim()
          : "";
      if (!name) {
        pushIssue(
          issues,
          "error",
          `物品一级类型 ${index + 1} 的名称不能为空`
        );
        continue;
      }
      const key = name.toLowerCase();
      if (primaryTypes.has(key)) {
        pushIssue(
          issues,
          "error",
          `物品一级类型「${name}」重复`
        );
        continue;
      }
      if (!Array.isArray(primary?.secondaryTypes)) {
        pushIssue(
          issues,
          "error",
          `物品一级类型「${name}」的 secondaryTypes 必须是数组`
        );
        primaryTypes.set(key, {
          name,
          secondaryTypes: new Set()
        });
        continue;
      }
      const secondaryKeys = new Set();
      for (const secondary of primary.secondaryTypes) {
        const secondaryName =
          typeof secondary === "string" ? secondary.trim() : "";
        if (!secondaryName) {
          pushIssue(
            issues,
            "error",
            `物品一级类型「${name}」包含空的二级类型`
          );
          continue;
        }
        const secondaryKey = secondaryName.toLowerCase();
        if (secondaryKeys.has(secondaryKey)) {
          pushIssue(
            issues,
            "error",
            `物品一级类型「${name}」的二级类型「${secondaryName}」重复`
          );
          continue;
        }
        secondaryKeys.add(secondaryKey);
      }
      primaryTypes.set(key, {
        name,
        secondaryTypes: secondaryKeys
      });
    }
  }

  if (!Array.isArray(value.rarities)) {
    pushIssue(
      issues,
      "error",
      "物品类型库 rarities 必须是数组"
    );
  } else {
    for (const rarity of value.rarities) {
      const name = typeof rarity === "string" ? rarity.trim() : "";
      if (!name) {
        pushIssue(
          issues,
          "error",
          "物品稀有度名称不能为空"
        );
        continue;
      }
      const key = name.toLowerCase();
      if (rarities.has(key)) {
        pushIssue(
          issues,
          "error",
          `物品稀有度「${name}」重复`
        );
        continue;
      }
      rarities.add(key);
    }
  }

  return { available: true, primaryTypes, rarities };
}

function validateItem(
  issues,
  entry,
  label,
  selection,
  library
) {
  const primaryType = entry?.primaryType;
  const secondaryType = entry?.secondaryType;
  const rarity = entry?.rarity;
  for (const [field, value] of [
    ["primaryType", primaryType],
    ["secondaryType", secondaryType],
    ["rarity", rarity]
  ]) {
    if (value !== undefined && typeof value !== "string") {
      pushIssue(
        issues,
        "error",
        `${label}的 ${field} 必须是字符串`,
        selection
      );
    }
  }

  const primaryKey =
    typeof primaryType === "string"
      ? primaryType.trim().toLowerCase()
      : "";
  const secondaryKey =
    typeof secondaryType === "string"
      ? secondaryType.trim().toLowerCase()
      : "";
  const rarityKey =
    typeof rarity === "string" ? rarity.trim().toLowerCase() : "";

  if (primaryKey) {
    if (!library.available) {
      pushIssue(
        issues,
        "error",
        `${label}设置了一级类型，但内容文档缺少 itemTypeLibrary`,
        selection
      );
    } else {
      const primary = library.primaryTypes.get(primaryKey);
      if (!primary) {
        pushIssue(
          issues,
          "error",
          `${label}引用了一级类型库中不存在的类型「${primaryType}」`,
          selection
        );
      } else if (
        secondaryKey &&
        !primary.secondaryTypes.has(secondaryKey)
      ) {
        pushIssue(
          issues,
          "error",
          `${label}的二级类型「${secondaryType}」不属于一级类型「${primary.name}」`,
          selection
        );
      }
    }
  } else if (secondaryKey) {
    pushIssue(
      issues,
      "error",
      `${label}设置二级类型前必须先设置一级类型`,
      selection
    );
  }

  if (rarityKey) {
    if (!library.available) {
      pushIssue(
        issues,
        "error",
        `${label}设置了稀有度，但内容文档缺少 itemTypeLibrary`,
        selection
      );
    } else if (!library.rarities.has(rarityKey)) {
      pushIssue(
        issues,
        "error",
        `${label}引用了稀有度库中不存在的稀有度「${rarity}」`,
        selection
      );
    }
  }

  if (
    entry?.stackLimit !== undefined &&
    (!Number.isInteger(entry.stackLimit) ||
      entry.stackLimit < 1 ||
      entry.stackLimit > ITEM_STACK_LIMIT_MAX)
  ) {
    pushIssue(
      issues,
      "error",
      `${label}的 stackLimit 必须是 1–${ITEM_STACK_LIMIT_MAX} 的整数`,
      selection
    );
  }
  if (
    entry?.tradeable !== undefined &&
    typeof entry.tradeable !== "boolean"
  ) {
    pushIssue(
      issues,
      "error",
      `${label}的 tradeable 必须是布尔值`,
      selection
    );
  }
  for (const [field, value] of [
    ["buyPrice", entry?.buyPrice],
    ["sellPrice", entry?.sellPrice]
  ]) {
    if (
      value !== undefined &&
      (!Number.isInteger(value) || value < 0)
    ) {
      pushIssue(
        issues,
        "error",
        `${label}的 ${field} 必须是非负整数`,
        selection
      );
    }
  }

  if (
    entry?.illustration !== undefined &&
    entry.illustration !== null
  ) {
    const illustration = entry.illustration;
    if (
      !illustration ||
      typeof illustration !== "object" ||
      Array.isArray(illustration)
    ) {
      pushIssue(
        issues,
        "error",
        `${label}的 illustration 必须是对象或 null`,
        selection
      );
    } else {
      for (const key of ["assetId", "fileName", "relativePath"]) {
        if (
          typeof illustration[key] !== "string" ||
          !illustration[key].trim()
        ) {
          pushIssue(
            issues,
            "error",
            `${label}的 illustration.${key} 不能为空`,
            selection
          );
        }
      }
      if (
        illustration.folderId !== undefined &&
        illustration.folderId !== null &&
        typeof illustration.folderId !== "string"
      ) {
        pushIssue(
          issues,
          "error",
          `${label}的 illustration.folderId 必须是字符串或 null`,
          selection
        );
      }
      for (const key of [
        "displayName",
        "folderPath",
        "revision"
      ]) {
        if (
          illustration[key] !== undefined &&
          typeof illustration[key] !== "string"
        ) {
          pushIssue(
            issues,
            "error",
            `${label}的 illustration.${key} 必须是字符串`,
            selection
          );
        }
      }
      if (
        typeof illustration.relativePath === "string" &&
        (illustration.relativePath.startsWith("/") ||
          illustration.relativePath.includes(".."))
      ) {
        pushIssue(
          issues,
          "error",
          `${label}的 illustration.relativePath 必须是项目相对路径`,
          selection
        );
      }
    }
  }

  if (entry?.effect === undefined) {
    return;
  }
  const effect = entry.effect;
  if (
    !effect ||
    typeof effect !== "object" ||
    Array.isArray(effect)
  ) {
    pushIssue(
      issues,
      "error",
      `${label}的 effect 必须是对象`,
      selection
    );
    return;
  }
  if (!isItemEffectMode(effect.mode)) {
    pushIssue(
      issues,
      "error",
      `${label}的 effect.mode 必须是 description 或 script`,
      selection
    );
  }
  if (typeof effect.description !== "string") {
    pushIssue(
      issues,
      "error",
      `${label}的 effect.description 必须是字符串`,
      selection
    );
  }
  if (typeof effect.script !== "string") {
    pushIssue(
      issues,
      "error",
      `${label}的 effect.script 必须是字符串`,
      selection
    );
  }
}

function validateCharacter(issues, entry, label, selection) {
  const attributes = entry?.attributes;
  if (
    !attributes ||
    typeof attributes !== "object" ||
    Array.isArray(attributes)
  ) {
    pushIssue(
      issues,
      "error",
      `${label}的 attributes 必须是对象`,
      selection
    );
  } else {
    for (const definition of CHARACTER_ATTRIBUTE_DEFINITIONS) {
      if (!Number.isFinite(attributes[definition.key])) {
        pushIssue(
          issues,
          "error",
          `${label}的属性「${definition.label}」必须是有效数字`,
          selection
        );
      }
    }
  }

  const bindings = entry?.animationBindings;
  if (!Array.isArray(bindings)) {
    pushIssue(
      issues,
      "error",
      `${label}的 animationBindings 必须是数组`,
      selection
    );
    return;
  }
  validateCharacterCollisionBody(
    issues,
    entry?.collisionBody,
    label,
    selection
  );

  const bindingIds = new Set();
  const singleUseTypes = new Set();
  for (const [index, binding] of bindings.entries()) {
    const bindingLabel = `${label}动画绑定 ${index + 1}`;
    if (
      typeof binding?.id !== "string" ||
      !binding.id.trim()
    ) {
      pushIssue(
        issues,
        "error",
        `${bindingLabel}的 id 不能为空`,
        selection
      );
    } else if (bindingIds.has(binding.id)) {
      pushIssue(
        issues,
        "error",
        `${bindingLabel}的 id「${binding.id}」重复`,
        selection
      );
    } else {
      bindingIds.add(binding.id);
    }

    if (!isCharacterAnimationType(binding?.type)) {
      pushIssue(
        issues,
        "error",
        `${bindingLabel}的动画类型无效`,
        selection
      );
    } else {
      const typeDefinition = getCharacterAnimationTypeDefinition(
        binding.type
      );
      if (!typeDefinition?.repeatable) {
        if (singleUseTypes.has(binding.type)) {
          pushIssue(
            issues,
            "error",
            `${label}的「${typeDefinition.label}」只能绑定一次`,
            selection
          );
        } else {
          singleUseTypes.add(binding.type);
        }
      }
    }

    validateCharacterAnimationSource(
      issues,
      binding?.source,
      bindingLabel,
      selection
    );

    if (
      binding?.note !== undefined &&
      typeof binding.note !== "string"
    ) {
      pushIssue(
        issues,
        "error",
        `${bindingLabel}的 note 必须是字符串`,
        selection
      );
    }
    if (!["right", "left"].includes(binding?.direction)) {
      pushIssue(
        issues,
        "error",
        `${bindingLabel}的 direction 必须为 right 或 left`,
        selection
      );
    }
    if (
      !Number.isInteger(binding?.frameRate) ||
      binding.frameRate < 1 ||
      binding.frameRate > 60
    ) {
      pushIssue(
        issues,
        "error",
        `${bindingLabel}的 frameRate 必须是 1–60 的整数`,
        selection
      );
    }
    const frameCount = Number(binding?.source?.frameCount);
    if (
      !Number.isInteger(binding?.attackFrame) ||
      binding.attackFrame < 1 ||
      (Number.isInteger(frameCount) &&
        binding.attackFrame > frameCount)
    ) {
      pushIssue(
        issues,
        "error",
        `${bindingLabel}的 attackFrame 必须指向有效帧`,
        selection
      );
    }
    validateCharacterAttackRanges(
      issues,
      binding?.attackRanges,
      bindingLabel,
      frameCount,
      selection
    );
    validateCharacterFrameSound(
      issues,
      binding?.frameSound,
      bindingLabel,
      selection
    );
    validateCharacterTriggers(
      issues,
      binding?.triggers,
      bindingLabel,
      selection
    );
  }
}

function validateCharacterCollisionBody(
  issues,
  collisionBody,
  label,
  selection
) {
  if (collisionBody === undefined || collisionBody === null) {
    return;
  }
  if (
    !collisionBody ||
    typeof collisionBody !== "object" ||
    Array.isArray(collisionBody)
  ) {
    pushIssue(
      issues,
      "error",
      `${label}的 collisionBody 必须是对象或 null`,
      selection
    );
    return;
  }
  for (const key of ["x", "y", "width", "height"]) {
    if (
      !Number.isFinite(collisionBody[key]) ||
      collisionBody[key] < 0 ||
      collisionBody[key] > 1
    ) {
      pushIssue(
        issues,
        "error",
        `${label}的 collisionBody.${key} 必须是 0–1 的数字`,
        selection
      );
    }
  }
  if (
    Number.isFinite(collisionBody.width) &&
    collisionBody.width <= 0
  ) {
    pushIssue(
      issues,
      "error",
      `${label}的 collisionBody.width 必须大于 0`,
      selection
    );
  }
  if (
    Number.isFinite(collisionBody.height) &&
    collisionBody.height <= 0
  ) {
    pushIssue(
      issues,
      "error",
      `${label}的 collisionBody.height 必须大于 0`,
      selection
    );
  }
  if (
    Number.isFinite(collisionBody.x) &&
    Number.isFinite(collisionBody.width) &&
    collisionBody.x + collisionBody.width > 1.000001
  ) {
    pushIssue(
      issues,
      "error",
      `${label}的 collisionBody 超出帧宽度`,
      selection
    );
  }
  if (
    Number.isFinite(collisionBody.y) &&
    Number.isFinite(collisionBody.height) &&
    collisionBody.y + collisionBody.height > 1.000001
  ) {
    pushIssue(
      issues,
      "error",
      `${label}的 collisionBody 超出帧高度`,
      selection
    );
  }
}

function validateCharacterAnimationSource(
  issues,
  source,
  label,
  selection
) {
  if (
    !source ||
    typeof source !== "object" ||
    Array.isArray(source)
  ) {
    pushIssue(
      issues,
      "error",
      `${label}的 source 必须是对象`,
      selection
    );
    return;
  }
  for (const key of ["assetId", "fileName", "relativePath", "url"]) {
    if (typeof source[key] !== "string" || !source[key].trim()) {
      pushIssue(
        issues,
        "error",
        `${label}的 source.${key} 不能为空`,
        selection
      );
    }
  }
  if (
    source.folderId !== undefined &&
    source.folderId !== null &&
    typeof source.folderId !== "string"
  ) {
    pushIssue(
      issues,
      "error",
      `${label}的 source.folderId 必须是字符串或 null`,
      selection
    );
  }
  if (
    source.folderPath !== undefined &&
    typeof source.folderPath !== "string"
  ) {
    pushIssue(
      issues,
      "error",
      `${label}的 source.folderPath 必须是字符串`,
      selection
    );
  }
  for (const key of [
    "imageWidth",
    "imageHeight",
    "frameWidth",
    "frameHeight",
    "frameCount"
  ]) {
    if (!Number.isInteger(source[key]) || source[key] <= 0) {
      pushIssue(
        issues,
        "error",
        `${label}的 source.${key} 必须是正整数`,
        selection
      );
    }
  }
  if (source.contentBounds !== null) {
    const bounds = source.contentBounds;
    if (
      !bounds ||
      typeof bounds !== "object" ||
      Array.isArray(bounds)
    ) {
      pushIssue(
        issues,
        "error",
        `${label}的 source.contentBounds 必须是对象或 null`,
        selection
      );
    } else {
      for (const key of ["x", "y", "width", "height"]) {
        if (!Number.isFinite(bounds[key])) {
          pushIssue(
            issues,
            "error",
            `${label}的 source.contentBounds.${key} 必须是有效数字`,
            selection
          );
        }
      }
      if (bounds.width <= 0 || bounds.height <= 0) {
        pushIssue(
          issues,
          "error",
          `${label}的 source.contentBounds 宽高必须大于 0`,
          selection
        );
      }
    }
  }
}

function validateCharacterAttackRanges(
  issues,
  attackRanges,
  label,
  frameCount,
  selection
) {
  if (attackRanges === undefined) {
    return;
  }
  if (!Array.isArray(attackRanges)) {
    pushIssue(
      issues,
      "error",
      `${label}的 attackRanges 必须是数组`,
      selection
    );
    return;
  }
  const frames = new Set();
  for (const [index, attackRange] of attackRanges.entries()) {
    if (
      !attackRange ||
      typeof attackRange !== "object" ||
      Array.isArray(attackRange)
    ) {
      pushIssue(
        issues,
        "error",
        `${label}的 attackRanges 第 ${index + 1} 项必须是对象`,
        selection
      );
      continue;
    }
    const frame = attackRange.frame;
    if (
      !Number.isInteger(frame) ||
      frame < 1 ||
      (Number.isInteger(frameCount) && frame > frameCount)
    ) {
      pushIssue(
        issues,
        "error",
        `${label}的攻击范围帧号必须指向有效帧`,
        selection
      );
    } else if (frames.has(frame)) {
      pushIssue(
        issues,
        "error",
        `${label}的攻击范围不能重复绑定第 ${frame} 帧`,
        selection
      );
    } else {
      frames.add(frame);
    }
    validateCharacterAttackRange(
      issues,
      attackRange,
      `${label}第 ${frame} 帧`,
      selection
    );
  }
}

function validateCharacterAttackRange(
  issues,
  attackRange,
  label,
  selection
) {
  if (attackRange === null) {
    return;
  }
  if (
    !attackRange ||
    typeof attackRange !== "object" ||
    Array.isArray(attackRange)
  ) {
    pushIssue(
      issues,
      "error",
      `${label}的 attackRange 必须是对象或 null`,
      selection
    );
    return;
  }
  if (
    !Array.isArray(attackRange.points) ||
    attackRange.points.length < 3 ||
    attackRange.points.length > 12
  ) {
    pushIssue(
      issues,
      "error",
      `${label}的 attackRange.points 必须包含 3–12 个点`,
      selection
    );
    return;
  }
  for (const [index, point] of attackRange.points.entries()) {
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) {
      pushIssue(
        issues,
        "error",
        `${label}的攻击范围第 ${index + 1} 个点坐标无效`,
        selection
      );
    }
  }
  if (
    !Array.isArray(attackRange.segments) ||
    attackRange.segments.length !== attackRange.points.length
  ) {
    pushIssue(
      issues,
      "error",
      `${label}的 attackRange.segments 数量必须与顶点数量一致`,
      selection
    );
    return;
  }
  for (const [index, segment] of attackRange.segments.entries()) {
    if (!["line", "curve"].includes(segment?.type)) {
      pushIssue(
        issues,
        "error",
        `${label}的攻击范围第 ${index + 1} 段类型无效`,
        selection
      );
      continue;
    }
    if (
      segment.type === "curve" &&
      (!Number.isFinite(segment?.control?.x) ||
        !Number.isFinite(segment?.control?.y))
    ) {
      pushIssue(
        issues,
        "error",
        `${label}的攻击范围第 ${index + 1} 段缺少有效曲线控制点`,
        selection
      );
    }
  }
}

function validateCharacterFrameSound(
  issues,
  frameSound,
  label,
  selection
) {
  if (frameSound === undefined || frameSound === null) {
    return;
  }
  if (
    !frameSound ||
    typeof frameSound !== "object" ||
    Array.isArray(frameSound)
  ) {
    pushIssue(
      issues,
      "error",
      `${label}的 frameSound 必须是对象或 null`,
      selection
    );
    return;
  }
  for (const key of ["assetId", "fileName", "relativePath", "url"]) {
    if (
      typeof frameSound[key] !== "string" ||
      !frameSound[key].trim()
    ) {
      pushIssue(
        issues,
        "error",
        `${label}的 frameSound.${key} 不能为空`,
        selection
      );
    }
  }
  if (
    typeof frameSound.relativePath === "string" &&
    (frameSound.relativePath.startsWith("/") ||
      frameSound.relativePath.includes(".."))
  ) {
    pushIssue(
      issues,
      "error",
      `${label}的 frameSound.relativePath 必须是项目相对路径`,
      selection
    );
  }
  if (
    frameSound.folderId !== undefined &&
    frameSound.folderId !== null &&
    typeof frameSound.folderId !== "string"
  ) {
    pushIssue(
      issues,
      "error",
      `${label}的 frameSound.folderId 必须是字符串或 null`,
      selection
    );
  }
  for (const key of ["displayName", "folderPath"]) {
    if (
      frameSound[key] !== undefined &&
      typeof frameSound[key] !== "string"
    ) {
      pushIssue(
        issues,
        "error",
        `${label}的 frameSound.${key} 必须是字符串`,
        selection
      );
    }
  }
  if (
    !Number.isFinite(frameSound.volume) ||
    frameSound.volume < 0 ||
    frameSound.volume > 1
  ) {
    pushIssue(
      issues,
      "error",
      `${label}的 frameSound.volume 必须是 0–1 的数字`,
      selection
    );
  }
  if (typeof frameSound.loop !== "boolean") {
    pushIssue(
      issues,
      "error",
      `${label}的 frameSound.loop 必须是布尔值`,
      selection
    );
  }
}

function validateCharacterTriggers(
  issues,
  triggers,
  label,
  selection
) {
  if (!Array.isArray(triggers)) {
    pushIssue(
      issues,
      "error",
      `${label}的 triggers 必须是数组`,
      selection
    );
    return;
  }
  const triggerKeys = new Set();
  for (const [index, trigger] of triggers.entries()) {
    const triggerLabel = `${label}触发键 ${index + 1}`;
    if (!isCharacterTriggerDevice(trigger?.device)) {
      pushIssue(
        issues,
        "error",
        `${triggerLabel}的设备类型无效`,
        selection
      );
    }
    if (
      typeof trigger?.code !== "string" ||
      !trigger.code.trim()
    ) {
      pushIssue(
        issues,
        "error",
        `${triggerLabel}的 code 不能为空`,
        selection
      );
    }
    if (
      typeof trigger?.label !== "string" ||
      !trigger.label.trim()
    ) {
      pushIssue(
        issues,
        "error",
        `${triggerLabel}的 label 不能为空`,
        selection
      );
    }
    if (
      trigger?.direction !== undefined &&
      !isCharacterTriggerDirection(trigger.direction)
    ) {
      pushIssue(
        issues,
        "error",
        `${triggerLabel}的方向必须为 left 或 right`,
        selection
      );
    }
    const triggerKey = `${trigger?.device}\u0000${trigger?.code}`;
    if (triggerKeys.has(triggerKey)) {
      pushIssue(
        issues,
        "error",
        `${label}存在重复的触发按键`,
        selection
      );
    }
    triggerKeys.add(triggerKey);
  }
}

function validateQuest(
  issues,
  entry,
  quests,
  label,
  selection
) {
  const prerequisites = entry?.prerequisites;
  if (!Array.isArray(prerequisites)) {
    pushIssue(
      issues,
      "error",
      `${label}的 prerequisites 必须是数组`,
      selection
    );
  } else {
    validateQuestPrerequisiteConditions(
      issues,
      entry,
      quests,
      label,
      selection
    );
  }

  validateUniqueQuestItems(
    issues,
    entry?.completionConditions,
    `${label}的完成条件`,
    selection,
    {
      validateType: true
    }
  );
  validateUniqueQuestItems(
    issues,
    entry?.rewards,
    `${label}的获得物品`,
    selection
  );
}

function validateQuestPrerequisiteConditions(
  issues,
  entry,
  quests,
  label,
  selection
) {
  const conditions = entry.prerequisites;
  if (!Array.isArray(conditions)) {
    pushIssue(
      issues,
      "error",
      `${label}的 prerequisites 必须是数组`,
      selection
    );
    return;
  }

  const questIds = new Set(
    quests.map((quest) => quest?.id)
  );
  const pairs = new Set();
  for (const [index, condition] of conditions.entries()) {
    const conditionLabel = `${label}前置条件 ${index + 1}`;
    if (
      typeof condition?.taskId !== "string" ||
      !/^01-[0-9]{4}$/.test(condition.taskId)
    ) {
      pushIssue(
        issues,
        "error",
        `${conditionLabel}的任务 ID 必须符合 01-0000 格式`,
        selection
      );
    } else {
      if (condition.taskId === entry.id) {
        pushIssue(
          issues,
          "error",
          `${conditionLabel}不能引用当前任务自身`,
          selection
        );
      } else if (!questIds.has(condition.taskId)) {
        pushIssue(
          issues,
          "error",
          `${conditionLabel}引用的任务 ${condition.taskId} 不存在`,
          selection
        );
      }
    }
    if (!isQuestStatus(condition?.status)) {
      pushIssue(
        issues,
        "error",
        `${conditionLabel}的状态无效`,
        selection
      );
    }
    const pair = `${condition?.taskId}\u0000${condition?.status}`;
    if (pairs.has(pair)) {
      pushIssue(
        issues,
        "error",
        `${conditionLabel}与已有条件的任务和状态完全重复`,
        selection
      );
    }
    pairs.add(pair);
  }
}

function validateUniqueQuestItems(
  issues,
  conditions,
  label,
  selection,
  { validateType = false } = {}
) {
  if (!Array.isArray(conditions)) {
    pushIssue(
      issues,
      "error",
      `${label}必须是数组`,
      selection
    );
    return;
  }
  const itemIds = new Set();
  for (const [index, condition] of conditions.entries()) {
    const conditionLabel = `${label}第 ${index + 1} 项`;
    if (validateType && !isQuestCompletionConditionType(condition?.type)) {
      pushIssue(
        issues,
        "error",
        `${conditionLabel}的类型无效`,
        selection
      );
    }
    if (
      typeof condition?.itemId !== "string" ||
      !condition.itemId.trim()
    ) {
      pushIssue(
        issues,
        "error",
        `${conditionLabel}的物品 ID 不能为空`,
        selection
      );
    } else if (itemIds.has(condition.itemId)) {
      pushIssue(
        issues,
        "error",
        `${conditionLabel}的物品 ID「${condition.itemId}」重复`,
        selection
      );
    } else {
      itemIds.add(condition.itemId);
    }
    if (
      !Number.isInteger(condition?.quantity) ||
      condition.quantity <= 0
    ) {
      pushIssue(
        issues,
        "error",
        `${conditionLabel}的数量必须是正整数`,
        selection
      );
    }
  }
}
