import assert from "node:assert/strict";
import test from "node:test";
import {
  CHARACTER_ANIMATION_TYPES,
  CHARACTER_ATTRIBUTE_DEFINITIONS,
  addItemRarity,
  addItemType,
  createEmptyContentDocument,
  createItemIllustration,
  duplicateConversationFolder,
  duplicateContentFolder,
  duplicateContentEntry,
  getContentFolderPath,
  getConversationFolderPath,
  getItemIllustrationUrl,
  getItemPrimaryTypeNames,
  getItemRarityNames,
  getItemSecondaryTypeNames,
  getItemTypeSummary,
  insertConversationFolder,
  insertContentEntry,
  insertContentFolder,
  moveConversationEntry,
  moveConversationFolder,
  moveContentEntry,
  moveContentFolder,
  removeConversationFolder,
  removeContentEntry,
  reorderRecentConversation,
  touchRecentConversation,
  validateContentDocument
} from "../src/model/ContentModel.js";
import { getAvailableCharacterAnimationTypes } from "../src/editor/CharacterContentEditor.js";

test("五个模块分别使用 00、01、02、03、04 前缀分配稳定 ID", () => {
  const content = createEmptyContentDocument();
  const ids = [
    insertContentEntry(content, "conversations").entry.id,
    insertContentEntry(content, "quests").entry.id,
    insertContentEntry(content, "items").entry.id,
    insertContentEntry(content, "animations").entry.id,
    insertContentEntry(content, "characters").entry.id
  ];

  assert.deepEqual(ids, [
    "00-0001",
    "01-0001",
    "02-0001",
    "03-0001",
    "04-0001"
  ]);
  assert.equal(validateContentDocument(content).length, 0);
});

test("删除后不复用编号，复制会分配新编号", () => {
  const content = createEmptyContentDocument();
  const first = insertContentEntry(content, "conversations");
  const second = insertContentEntry(content, "conversations");
  assert.equal(first.entry.id, "00-0001");
  assert.equal(second.entry.id, "00-0002");

  removeContentEntry(content, first.selection);
  assert.equal(
    insertContentEntry(content, "conversations").entry.id,
    "00-0003"
  );

  const copied = duplicateContentEntry(content, second.selection);
  assert.equal(copied.entry.id, "00-0004");
  assert.equal(copied.entry.name, "新会话 副本");
});

test("删除当前最大编号后也不会复用", () => {
  const content = createEmptyContentDocument();
  insertContentEntry(content, "quests");
  const latest = insertContentEntry(content, "quests");
  removeContentEntry(content, latest.selection);

  assert.equal(
    insertContentEntry(content, "quests").entry.id,
    "01-0003"
  );
});

test("新建任务包含可编辑的前置、完成条件和奖励结构", () => {
  const content = createEmptyContentDocument();
  const { entry } = insertContentEntry(content, "quests");

  assert.deepEqual(entry.prerequisites, []);
  assert.deepEqual(entry.completionConditions, []);
  assert.deepEqual(entry.rewards, []);

  entry.completionConditions.push({
    type: "item_quantity",
    itemId: "relic-shard",
    quantity: 2
  });
  entry.rewards.push({
    itemId: "healing-herb",
    quantity: 1
  });
  assert.equal(validateContentDocument(content).length, 0);
});

test("新建角色包含零值属性和空动画绑定", () => {
  const content = createEmptyContentDocument();
  const { entry } = insertContentEntry(content, "characters");

  assert.deepEqual(
    Object.keys(entry.attributes),
    CHARACTER_ATTRIBUTE_DEFINITIONS.map(
      (definition) => definition.key
    )
  );
  assert.ok(
    Object.values(entry.attributes).every((value) => value === 0)
  );
  assert.equal(entry.attributes.attack, 0);
  assert.deepEqual(entry.collisionBody, {
    x: 0.3,
    y: 0.14,
    width: 0.4,
    height: 0.82
  });
  assert.deepEqual(entry.animationBindings, []);
  assert.equal(validateContentDocument(content).length, 0);
});

test("角色动画类型中包含唯一槽位和可重复的其它动画", () => {
  const repeatable = CHARACTER_ANIMATION_TYPES.filter(
    (definition) => definition.repeatable
  );
  assert.deepEqual(
    repeatable.map((definition) => definition.key),
    ["other"]
  );
  assert.equal(
    CHARACTER_ANIMATION_TYPES.filter(
      (definition) => !definition.repeatable
    ).length,
    11
  );
  assert.ok(
    CHARACTER_ANIMATION_TYPES.some(
      (definition) =>
        definition.key === "death" &&
        definition.label === "死亡动画"
    )
  );
});

test("已绑定的非其它动画会从角色动画选择列表中屏蔽", () => {
  const available = getAvailableCharacterAnimationTypes([
    { type: "move" },
    { type: "attack" },
    { type: "other" },
    { type: "other" }
  ]);
  const keys = available.map((definition) => definition.key);

  assert.equal(keys.includes("move"), false);
  assert.equal(keys.includes("attack"), false);
  assert.equal(keys.includes("hurt"), true);
  assert.equal(keys.includes("other"), true);
});

test("新会话加入最近列表顶部，满 10 项时移除最下面一项", () => {
  const content = createEmptyContentDocument();
  const ids = Array.from({ length: 10 }, () =>
    insertContentEntry(content, "conversations").entry.id
  );
  for (const id of [...ids].reverse()) {
    touchRecentConversation(content, id);
    assert.equal(content.recentConversationIds[0], id);
  }

  const previouslyOpened = ids[9];
  touchRecentConversation(content, previouslyOpened);
  assert.equal(content.recentConversationIds[0], ids[0]);

  const newest = insertContentEntry(
    content,
    "conversations"
  ).entry.id;
  touchRecentConversation(content, newest);
  assert.equal(content.recentConversationIds.length, 10);
  assert.equal(content.recentConversationIds[0], newest);
  assert.equal(
    content.recentConversationIds.includes(previouslyOpened),
    false
  );
});

test("最近会话拖拽调整顺序", () => {
  const content = createEmptyContentDocument();
  const first = insertContentEntry(
    content,
    "conversations"
  ).entry.id;
  const second = insertContentEntry(
    content,
    "conversations"
  ).entry.id;
  content.recentConversationIds = [first, second];

  assert.equal(
    reorderRecentConversation(content, second, first, "before"),
    true
  );
  assert.deepEqual(content.recentConversationIds, [second, first]);
});

test("会话文件夹支持嵌套、移动、路径和循环保护", () => {
  const content = createEmptyContentDocument();
  const chapter = insertConversationFolder(content, {
    name: "第一章"
  });
  const scene = insertConversationFolder(content, {
    name: "开场",
    parentId: chapter.id
  });
  const entry = insertContentEntry(
    content,
    "conversations"
  ).entry;

  assert.equal(
    moveConversationEntry(content, entry.id, scene.id),
    true
  );
  assert.equal(entry.folderId, scene.id);
  assert.deepEqual(
    getConversationFolderPath(content, scene.id).map(
      (folder) => folder.name
    ),
    ["第一章", "开场"]
  );
  assert.equal(
    moveConversationFolder(content, chapter.id, scene.id),
    false
  );
  assert.equal(validateContentDocument(content).length, 0);
});

test("复制文件夹会复制子目录和会话，删除文件夹会递归删除", () => {
  const content = createEmptyContentDocument();
  const chapter = insertConversationFolder(content, {
    name: "第一章"
  });
  const scene = insertConversationFolder(content, {
    name: "开场",
    parentId: chapter.id
  });
  const entry = insertContentEntry(
    content,
    "conversations"
  ).entry;
  entry.folderId = scene.id;
  content.recentConversationIds = [entry.id];

  const copied = duplicateConversationFolder(
    content,
    chapter.id
  );
  assert.equal(copied.folder.name, "第一章 副本");
  assert.equal(copied.selections.length, 1);
  assert.notEqual(copied.selections[0].id, entry.id);
  assert.equal(validateContentDocument(content).length, 0);

  const removed = removeConversationFolder(
    content,
    copied.folder.id
  );
  assert.equal(removed.removedFolderIds.length, 2);
  assert.equal(removed.removedConversationIds.length, 1);
  assert.equal(
    content.conversations.some(
      (conversation) =>
        conversation.id === copied.selections[0].id
    ),
    false
  );
  assert.deepEqual(content.recentConversationIds, [entry.id]);
});

test("复制会话会保留多轮对话内容", () => {
  const content = createEmptyContentDocument();
  const entry = insertContentEntry(
    content,
    "conversations"
  ).entry;
  entry.dialogue = [
    {
      id: "line-1",
      role: "守卫",
      content: "站住。"
    }
  ];

  const copied = duplicateContentEntry(content, {
    moduleKey: "conversations",
    id: entry.id
  });
  assert.deepEqual(copied.entry.dialogue, entry.dialogue);
  assert.notEqual(copied.entry.id, entry.id);
  assert.equal(validateContentDocument(content).length, 0);
});

test("任务、物品、动画演绎和角色支持相同的嵌套文件夹管理", () => {
  for (const moduleKey of [
    "quests",
    "items",
    "animations",
    "characters"
  ]) {
    const content = createEmptyContentDocument();
    const root = insertContentFolder(content, moduleKey, {
      name: "分组"
    });
    const child = insertContentFolder(content, moduleKey, {
      name: "子目录",
      parentId: root.id
    });
    const entry = insertContentEntry(content, moduleKey).entry;

    assert.equal(
      moveContentEntry(content, entry.id, child.id),
      true
    );
    assert.equal(entry.folderId, child.id);
    assert.deepEqual(
      getContentFolderPath(content, moduleKey, child.id).map(
        (folder) => folder.name
      ),
      ["分组", "子目录"]
    );
    assert.equal(
      moveContentFolder(
        content,
        moduleKey,
        root.id,
        child.id
      ),
      false
    );

    const copied = duplicateContentFolder(
      content,
      moduleKey,
      root.id
    );
    assert.equal(copied.folder.name, "分组 副本");
    assert.equal(copied.selections.length, 1);
    assert.equal(validateContentDocument(content).length, 0);
  }
});

test("新建物品包含类型、堆叠、买卖和效果默认结构", () => {
  const content = createEmptyContentDocument();
  const { entry } = insertContentEntry(content, "items");

  assert.equal(entry.primaryType, "");
  assert.equal(entry.secondaryType, "");
  assert.equal(entry.rarity, "");
  assert.equal(entry.stackLimit, 1);
  assert.equal(entry.tradeable, true);
  assert.equal(entry.buyPrice, 0);
  assert.equal(entry.sellPrice, 0);
  assert.deepEqual(entry.effect, {
    mode: "description",
    description: "",
    script: ""
  });
  assert.equal(entry.illustration, null);
  assert.deepEqual(content.itemTypeLibrary, {
    primaryTypes: [],
    rarities: []
  });
  assert.equal(validateContentDocument(content).length, 0);
});

test("自定义物品类型会合并同名一级类型并共享二级类型", () => {
  const content = createEmptyContentDocument();

  const first = addItemType(content, "消耗品", "恢复");
  const second = addItemType(content, " 消耗品 ", "增益");
  const duplicate = addItemType(content, "消耗品", "恢复");

  assert.equal(first.createdPrimary, true);
  assert.equal(first.createdSecondary, true);
  assert.equal(second.createdPrimary, false);
  assert.equal(second.createdSecondary, true);
  assert.equal(duplicate.createdPrimary, false);
  assert.equal(duplicate.createdSecondary, false);
  assert.deepEqual(getItemPrimaryTypeNames(content), ["消耗品"]);
  assert.deepEqual(
    getItemSecondaryTypeNames(content, "消耗品"),
    ["恢复", "增益"]
  );
  assert.deepEqual(
    getItemSecondaryTypeNames(content, "装备"),
    []
  );
});

test("自定义稀有度独立去重并可复用到物品", () => {
  const content = createEmptyContentDocument();
  const first = addItemRarity(content, "普通");
  const duplicate = addItemRarity(content, " 普通 ");
  const rare = addItemRarity(content, "稀有");
  const { entry } = insertContentEntry(content, "items");
  entry.rarity = rare.rarity;

  assert.equal(first.created, true);
  assert.equal(duplicate.created, false);
  assert.equal(duplicate.rarity, "普通");
  assert.equal(rare.created, true);
  assert.deepEqual(getItemRarityNames(content), [
    "普通",
    "稀有"
  ]);
  assert.equal(validateContentDocument(content).length, 0);
});

test("物品插图保留素材路径、文件夹和预览地址", () => {
  const illustration = createItemIllustration({
    id: "static:potion.png",
    assetId: "static:potion.png",
    fileName: "potion.png",
    displayName: "药剂插图",
    relativePath: "map/static-textures/icons/potion.png",
    folderId: "static-folder-0001",
    folderPath: "图标 / 消耗品",
    revision: "rev 1"
  });

  assert.deepEqual(illustration, {
    assetId: "static:potion.png",
    fileName: "potion.png",
    displayName: "药剂插图",
    relativePath: "map/static-textures/icons/potion.png",
    folderId: "static-folder-0001",
    folderPath: "图标 / 消耗品",
    revision: "rev 1"
  });
  assert.equal(
    getItemIllustrationUrl(illustration),
    "/assets/map/static-textures/icons/potion.png?v=rev%201"
  );
  assert.equal(
    createItemIllustration({ relativePath: "" }),
    null
  );
  assert.equal(
    createItemIllustration({
      relativePath: "map/static-textures/a.png"
    }).displayName,
    ""
  );
});

test("物品类型摘要用于文件卡片展示", () => {
  assert.equal(
    getItemTypeSummary({
      primaryType: "消耗品",
      secondaryType: "恢复",
      rarity: "普通"
    }),
    "消耗品 · 恢复 · 普通"
  );
  assert.equal(
    getItemTypeSummary({
      primaryType: "",
      secondaryType: "",
      rarity: ""
    }),
    ""
  );
});
