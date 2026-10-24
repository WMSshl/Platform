import assert from "node:assert/strict";
import test from "node:test";
import {
  CONTENT_MODULES,
  CURRENT_CONTENT_SCHEMA_VERSION,
  areQuestPrerequisitesMet,
  createDefaultCharacterAttributes,
  createDefaultCharacterCollisionBody,
  createEmptyContentDocument,
  isQuestCompletionMet,
  migrateContentDocument,
  normalizeContentDocument,
  resolveQuestOnItemAcquired,
  validateContentDocument
} from "../src/index.js";

function createContentDocument() {
  const content = createEmptyContentDocument();
  content.conversations.push({
    id: "00-0001",
    name: "入口",
    description: "进入场景后的第一段会话"
  });
  content.quests.push({
    id: "01-0001",
    name: "寻找出口",
    description: "抵达当前地图出口",
    prerequisites: [],
    completionConditions: [],
    rewards: []
  });
  content.items.push({
    id: "02-0001",
    name: "旧钥匙",
    description: "可以开启庭院大门"
  });
  content.animations.push({
    id: "03-0001",
    name: "开门",
    description: "播放一次开门演绎"
  });
  content.characters.push({
    id: "04-0001",
    name: "守门人",
    description: "角色结构测试",
    attributes: createDefaultCharacterAttributes(),
    animationBindings: []
  });
  content.idCounters = {
    conversations: 1,
    quests: 1,
    items: 1,
    animations: 1,
    characters: 1
  };
  return content;
}

function createCharacterBinding(overrides = {}) {
  const { suffix = "0001", ...bindingOverrides } = overrides;
  const defaultSource = {
    assetId: "entity:后跑.png",
    fileName: "后跑.png",
    relativePath: "map/entities/后跑.png",
    url: "/assets/map/entities/%E5%90%8E%E8%B7%91.png",
    imageWidth: 320,
    imageHeight: 80,
    frameWidth: 80,
    frameHeight: 80,
    frameCount: 4,
    contentBounds: {
      x: 4,
      y: 2,
      width: 70,
      height: 76
    }
  };
  return {
    id: `04-0001-animation-${suffix}`,
    type: "attack",
    source: defaultSource,
    direction: "right",
    frameRate: 11,
    attackFrame: 2,
    attackRanges: [
      {
        frame: 2,
        points: [
          { x: 36, y: 18 },
          { x: 84, y: 18 },
          { x: 84, y: 50 },
          { x: 36, y: 50 }
        ],
        segments: [
          { type: "line", control: null },
          { type: "curve", control: { x: 96, y: 34 } },
          { type: "line", control: null },
          { type: "curve", control: { x: 24, y: 34 } }
        ]
      }
    ],
    triggers: [
      {
        device: "keyboard",
        code: "KeyJ",
        label: "J",
        direction: "right"
      }
    ],
    ...bindingOverrides,
    source: bindingOverrides.source ?? defaultSource
  };
}

test("五个内容模块使用固定 ID 前缀并通过校验", () => {
  assert.deepEqual(
    CONTENT_MODULES.map((definition) => definition.prefix),
    ["00", "01", "02", "03", "04"]
  );

  const content = createContentDocument();
  const issues = validateContentDocument(content);
  assert.equal(
    issues.filter((issue) => issue.severity === "error").length,
    0
  );
});

test("内容 ID 必须符合所属模块前缀且全局唯一", () => {
  const content = createContentDocument();
  content.quests[0].id = "00-0001";
  content.items.push({ ...content.conversations[0] });

  const messages = validateContentDocument(content)
    .filter((issue) => issue.severity === "error")
    .map((issue) => issue.message);

  assert.ok(messages.some((message) => message.includes("前缀")));
  assert.ok(messages.some((message) => message.includes("重复")));
});

test("V1 内容文档迁移到当前版本并补齐内容目录与任务字段", () => {
  const legacy = {
    schemaVersion: 1,
    idCounters: {
      conversations: 1,
      quests: 0,
      items: 0,
      animations: 0
    },
    conversations: [
      {
        id: "00-0001",
        name: "旧会话",
        description: "迁移前数据"
      }
    ],
    quests: [],
    items: [],
    animations: []
  };

  const migrated = migrateContentDocument(legacy);
  assert.equal(
    migrated.schemaVersion,
    CURRENT_CONTENT_SCHEMA_VERSION
  );
  assert.deepEqual(migrated.contentFolders.conversations, []);
  assert.deepEqual(migrated.contentFolders.quests, []);
  assert.deepEqual(migrated.contentFolders.characters, []);
  assert.deepEqual(migrated.recentConversationIds, []);
  assert.equal(migrated.conversations[0].folderId, null);
  assert.deepEqual(migrated.conversations[0].dialogue, []);
  assert.deepEqual(migrated.quests, []);
  assert.deepEqual(migrated.characters, []);
  assert.equal(validateContentDocument(migrated).length, 0);
});

test("V2 内容文档迁移到当前版本并保留多轮对话", () => {
  const legacy = createContentDocument();
  legacy.schemaVersion = 2;
  legacy.conversations[0].dialogue = [
    {
      id: "line-1",
      role: "守卫",
      content: "站住。"
    }
  ];

  const migrated = migrateContentDocument(legacy);
  assert.equal(
    migrated.schemaVersion,
    CURRENT_CONTENT_SCHEMA_VERSION
  );
  assert.equal(migrated.conversations[0].dialogue[0].role, "守卫");
  assert.equal(validateContentDocument(migrated).length, 0);
});

test("最近会话去重、过滤失效引用并只保留 10 项", () => {
  const content = createEmptyContentDocument();
  for (let index = 1; index <= 12; index += 1) {
    content.conversations.push({
      id: `00-${String(index).padStart(4, "0")}`,
      name: `会话 ${index}`,
      description: "",
      folderId: null
    });
  }
  content.idCounters.conversations = 12;
  content.recentConversationIds = [
    "00-0001",
    "00-0002",
    "00-0002",
    "00-9999",
    ...Array.from(
      { length: 9 },
      (_, index) =>
        `00-${String(index + 3).padStart(4, "0")}`
    )
  ];

  const normalized = normalizeContentDocument(content);
  assert.equal(normalized.recentConversationIds.length, 10);
  assert.deepEqual(normalized.recentConversationIds.slice(0, 2), [
    "00-0001",
    "00-0002"
  ]);
  assert.equal(
    normalized.recentConversationIds.includes("00-9999"),
    false
  );
  assert.equal(
    new Set(normalized.recentConversationIds).size,
    normalized.recentConversationIds.length
  );
});

test("内容文件夹校验父目录、循环引用与内容归档位置", () => {
  const content = createContentDocument();
  content.contentFolders.conversations = [
    {
      id: "00-folder-0001",
      name: "第一章",
      parentId: "00-folder-0002"
    },
    {
      id: "00-folder-0002",
      name: "开场",
      parentId: "00-folder-0001"
    }
  ];
  content.folderIdCounters.conversations = 2;
  content.conversations[0].folderId = "00-folder-9999";
  content.contentFolders.quests = [
    {
      id: "01-folder-0001",
      name: "主线",
      parentId: null
    }
  ];
  content.folderIdCounters.quests = 1;
  content.quests[0].folderId = "01-folder-0001";

  const messages = validateContentDocument(content)
    .filter((issue) => issue.severity === "error")
    .map((issue) => issue.message);

  assert.ok(messages.some((message) => message.includes("循环目录")));
  assert.ok(messages.some((message) => message.includes("folderId")));
});

test("V3 会话目录迁移为所有模块共享的目录结构", () => {
  const legacy = createContentDocument();
  legacy.schemaVersion = 3;
  legacy.conversationFolders = [
    {
      id: "00-folder-0001",
      name: "第一章",
      parentId: null
    }
  ];
  legacy.folderIdCounters = {
    conversations: 1
  };
  legacy.conversations[0].folderId = "00-folder-0001";
  delete legacy.contentFolders;

  const migrated = migrateContentDocument(legacy);
  assert.equal(
    migrated.schemaVersion,
    CURRENT_CONTENT_SCHEMA_VERSION
  );
  assert.equal(
    migrated.contentFolders.conversations[0].name,
    "第一章"
  );
  assert.deepEqual(migrated.contentFolders.items, []);
  assert.equal(
    migrated.conversations[0].folderId,
    "00-folder-0001"
  );
});

test("V4 任务迁移到当前版本时补齐可选任务结构", () => {
  const legacy = createContentDocument();
  legacy.schemaVersion = 4;
  delete legacy.quests[0].prerequisites;
  delete legacy.quests[0].completionConditions;
  delete legacy.quests[0].rewards;

  const migrated = migrateContentDocument(legacy);
  assert.equal(
    migrated.schemaVersion,
    CURRENT_CONTENT_SCHEMA_VERSION
  );
  assert.deepEqual(migrated.quests[0].prerequisites, []);
  assert.deepEqual(migrated.quests[0].completionConditions, []);
  assert.deepEqual(migrated.quests[0].rewards, []);
  assert.equal(validateContentDocument(migrated).length, 0);
});

test("V5 任务前置对象迁移为条件数组并保留已有条件", () => {
  const legacy = createContentDocument();
  legacy.schemaVersion = 5;
  legacy.quests[0].prerequisites = {
    enabled: true,
    conditions: [
      {
        taskId: "01-0002",
        status: "active"
      }
    ]
  };
  legacy.quests.push({
    id: "01-0002",
    name: "后续任务",
    description: "",
    prerequisites: [],
    completionConditions: [],
    rewards: []
  });
  legacy.idCounters.quests = 2;

  const migrated = migrateContentDocument(legacy);
  assert.equal(
    migrated.schemaVersion,
    CURRENT_CONTENT_SCHEMA_VERSION
  );
  assert.deepEqual(migrated.quests[0].prerequisites, [
    {
      taskId: "01-0002",
      status: "active"
    }
  ]);
});

test("V6 内容文档迁移到当前版本时新增空角色模块并保留既有数据", () => {
  const legacy = createContentDocument();
  legacy.schemaVersion = 6;
  delete legacy.characters;
  delete legacy.contentFolders.characters;
  delete legacy.folderIdCounters.characters;
  delete legacy.idCounters.characters;

  const migrated = migrateContentDocument(legacy);

  assert.equal(
    migrated.schemaVersion,
    CURRENT_CONTENT_SCHEMA_VERSION
  );
  assert.deepEqual(migrated.characters, []);
  assert.deepEqual(migrated.contentFolders.characters, []);
  assert.equal(migrated.idCounters.characters, 0);
  assert.equal(migrated.folderIdCounters.characters, 0);
  assert.equal(migrated.items[0].name, "旧钥匙");
  assert.equal(validateContentDocument(migrated).length, 0);
});

test("V7 角色迁移到当前版本时补齐零值属性和空动画绑定", () => {
  const legacy = createContentDocument();
  legacy.schemaVersion = 7;
  delete legacy.characters[0].attributes;
  delete legacy.characters[0].animationBindings;

  const migrated = migrateContentDocument(legacy);

  assert.equal(
    migrated.schemaVersion,
    CURRENT_CONTENT_SCHEMA_VERSION
  );
  assert.deepEqual(
    migrated.characters[0].attributes,
    createDefaultCharacterAttributes()
  );
  assert.deepEqual(migrated.characters[0].animationBindings, []);
  assert.equal(validateContentDocument(migrated).length, 0);
});

test("V8 矩形攻击范围迁移为四点闭合多边形", () => {
  const legacy = createContentDocument();
  legacy.schemaVersion = 8;
  const binding = createCharacterBinding({
    attackRange: {
      x: 10,
      y: 20,
      width: 30,
      height: 40
    }
  });
  delete binding.attackRanges;
  legacy.characters[0].animationBindings = [binding];

  const migrated = migrateContentDocument(legacy);
  const frameRange =
    migrated.characters[0].animationBindings[0].attackRanges[0];

  assert.equal(
    migrated.schemaVersion,
    CURRENT_CONTENT_SCHEMA_VERSION
  );
  assert.equal(frameRange.frame, 2);
  assert.deepEqual(frameRange.points, [
    { x: 10, y: 20 },
    { x: 40, y: 20 },
    { x: 40, y: 60 },
    { x: 10, y: 60 }
  ]);
  assert.deepEqual(
    frameRange.segments.map((segment) => segment.type),
    ["line", "line", "line", "line"]
  );
  assert.equal(validateContentDocument(migrated).length, 0);
});

test("多边形攻击范围支持逐段曲线控制点", () => {
  const content = createContentDocument();
  content.characters[0].animationBindings = [
    createCharacterBinding()
  ];

  assert.equal(validateContentDocument(content).length, 0);
  content.characters[0].animationBindings[0].attackRanges[0].segments[1]
    .control = null;

  const messages = validateContentDocument(content)
    .filter((issue) => issue.severity === "error")
    .map((issue) => issue.message);
  assert.ok(
    messages.some((message) => message.includes("曲线控制点"))
  );
});

test("角色属性包含攻击力并给旧角色补零", () => {
  const attributes = createDefaultCharacterAttributes();
  assert.equal(attributes.attack, 0);

  const legacy = {
    schemaVersion: 14,
    characters: [
      {
        id: "04-0001",
        name: "旧角色",
        attributes: { maxHealth: 12 },
        animationBindings: []
      }
    ]
  };
  const migrated = migrateContentDocument(legacy);
  assert.equal(migrated.characters[0].attributes.attack, 0);
});

test("角色共用碰撞体和动画备注随 V14 迁移补齐", () => {
  const legacy = {
    schemaVersion: 14,
    characters: [
      {
        id: "04-0001",
        name: "旧角色",
        animationBindings: [
          {
            id: "04-0001-animation-0001",
            type: "attack",
            direction: "right",
            source: {
              assetId: "entity:run.png",
              fileName: "run.png",
              relativePath: "map/entities/run.png",
              url: "/assets/map/entities/run.png",
              imageWidth: 80,
              imageHeight: 80,
              frameWidth: 80,
              frameHeight: 80,
              frameCount: 4
            },
            attackFrame: 1,
            triggers: []
          }
        ]
      }
    ]
  };
  const migrated = migrateContentDocument(legacy);
  const character = migrated.characters[0];

  assert.deepEqual(
    character.collisionBody,
    createDefaultCharacterCollisionBody()
  );
  assert.equal(
    character.animationBindings[0].note,
    ""
  );
  assert.deepEqual(
    character.animationBindings[0].attackRanges,
    []
  );
});

test("V15 动画攻击范围迁移为按帧保存", () => {
  const legacy = createContentDocument();
  legacy.schemaVersion = 15;
  const binding = createCharacterBinding();
  const range = binding.attackRanges[0];
  delete binding.attackRanges;
  binding.attackRange = {
    points: range.points,
    segments: range.segments
  };
  legacy.characters[0].animationBindings = [binding];

  const migrated = migrateContentDocument(legacy);
  const migratedBinding =
    migrated.characters[0].animationBindings[0];

  assert.equal(
    migrated.schemaVersion,
    CURRENT_CONTENT_SCHEMA_VERSION
  );
  assert.equal("attackRange" in migratedBinding, false);
  assert.deepEqual(
    migratedBinding.attackRanges.map((entry) => entry.frame),
    [2]
  );
  assert.deepEqual(
    migratedBinding.attackRanges[0].points,
    range.points
  );
  assert.equal(validateContentDocument(migrated).length, 0);
});

test("同一动画可为不同帧分别保存攻击范围", () => {
  const content = createContentDocument();
  const binding = createCharacterBinding();
  const secondRange = structuredClone(binding.attackRanges[0]);
  secondRange.frame = 4;
  secondRange.points = secondRange.points.map((point) => ({
    x: point.x + 4,
    y: point.y
  }));
  binding.attackRanges.push(secondRange);
  content.characters[0].animationBindings = [binding];

  assert.equal(validateContentDocument(content).length, 0);

  binding.attackRanges[1].frame = 2;
  const messages = validateContentDocument(content)
    .filter((issue) => issue.severity === "error")
    .map((issue) => issue.message);
  assert.ok(
    messages.some((message) =>
      message.includes("不能重复绑定第 2 帧")
    )
  );
});

test("角色碰撞体校验归一化范围和边界", () => {
  const content = createContentDocument();
  const binding = createCharacterBinding();
  content.characters[0].animationBindings = [binding];
  content.characters[0].collisionBody = {
    x: 0.2,
    y: 0.1,
    width: 0.5,
    height: 0.8
  };
  binding.note = "攻击帧备注";
  assert.equal(validateContentDocument(content).length, 0);

  content.characters[0].collisionBody = {
    x: 0.8,
    y: 0.2,
    width: 0.5,
    height: 0.9
  };
  binding.note = 42;
  const messages = validateContentDocument(content)
    .filter((issue) => issue.severity === "error")
    .map((issue) => issue.message);
  assert.ok(
    messages.some((message) =>
      message.includes("超出帧宽度")
    )
  );
  assert.ok(
    messages.some((message) =>
      message.includes("超出帧高度")
    )
  );
  assert.ok(
    messages.some((message) => message.includes("note"))
  );
});

test("角色动画类型包含死亡动画并可正常校验", () => {
  const content = createContentDocument();
  content.characters[0].animationBindings = [
    createCharacterBinding({ type: "death" })
  ];

  const errors = validateContentDocument(content).filter(
    (issue) => issue.severity === "error"
  );
  assert.deepEqual(errors, []);
});

test("角色非其它动画类型只能绑定一次，其它动画允许重复", () => {
  const content = createContentDocument();
  content.characters[0].animationBindings = [
    createCharacterBinding({ suffix: "0001", type: "attack" }),
    createCharacterBinding({ suffix: "0002", type: "attack" }),
    createCharacterBinding({ suffix: "0003", type: "other" }),
    createCharacterBinding({ suffix: "0004", type: "other" })
  ];

  const messages = validateContentDocument(content)
    .filter((issue) => issue.severity === "error")
    .map((issue) => issue.message);

  assert.equal(
    messages.filter((message) => message.includes("只能绑定一次"))
      .length,
    1
  );
  assert.equal(
    messages.some(
      (message) => message.includes("其它动画") &&
        message.includes("只能绑定一次")
    ),
    false
  );
});

test("角色动画触发键支持键鼠多绑定且拒绝同一按键重复", () => {
  const content = createContentDocument();
  const valid = createCharacterBinding({
    triggers: [
      {
        device: "keyboard",
        code: "KeyJ",
        label: "J"
      },
      {
        device: "mouse",
        code: "Mouse0",
        label: "鼠标左键"
      }
    ]
  });
  content.characters[0].animationBindings = [valid];
  assert.equal(validateContentDocument(content).length, 0);

  valid.triggers.push({
    device: "keyboard",
    code: "KeyJ",
    label: "J"
  });
  const messages = validateContentDocument(content)
    .filter((issue) => issue.severity === "error")
    .map((issue) => issue.message);
  assert.ok(messages.some((message) => message.includes("重复的触发按键")));
});

test("角色触发键按左右方向分开保存并校验方向", () => {
  const content = createContentDocument();
  const binding = createCharacterBinding({
    triggers: [
      {
        device: "keyboard",
        code: "KeyD",
        label: "D",
        direction: "right"
      },
      {
        device: "keyboard",
        code: "KeyA",
        label: "A",
        direction: "left"
      }
    ]
  });
  content.characters[0].animationBindings = [binding];
  assert.equal(validateContentDocument(content).length, 0);

  binding.triggers[1].direction = "up";
  const messages = validateContentDocument(content)
    .filter((issue) => issue.severity === "error")
    .map((issue) => issue.message);
  assert.ok(
    messages.some((message) =>
      message.includes("方向必须为 left 或 right")
    )
  );
});

test("多轮对话校验行 ID 唯一性以及角色和内容类型", () => {
  const content = createContentDocument();
  content.conversations[0].dialogue = [
    {
      id: "line-1",
      role: "守卫",
      content: "站住。"
    },
    {
      id: "line-1",
      role: 1,
      content: null
    }
  ];

  const messages = validateContentDocument(content)
    .filter((issue) => issue.severity === "error")
    .map((issue) => issue.message);

  assert.ok(messages.some((message) => message.includes("重复")));
  assert.ok(messages.some((message) => message.includes("role")));
  assert.ok(messages.some((message) => message.includes("content")));
});

test("任务前置按任务 ID 分组，组内 OR、组间 AND", () => {
  const quest = {
    id: "01-0003",
    prerequisites: [
      { taskId: "01-0001", status: "inactive" },
      { taskId: "01-0001", status: "active" },
      { taskId: "01-0002", status: "completed" }
    ]
  };

  assert.equal(
    areQuestPrerequisitesMet(quest, {
      "01-0001": "active",
      "01-0002": "completed"
    }),
    true
  );
  assert.equal(
    areQuestPrerequisitesMet(quest, {
      "01-0001": "completed",
      "01-0002": "completed"
    }),
    false
  );
  assert.equal(
    areQuestPrerequisitesMet(
      {
        prerequisites: []
      },
      {}
    ),
    true
  );
});

test("物品完成条件全部满足时才可完成任务", () => {
  const quest = {
    completionConditions: [
      {
        type: "item_quantity",
        itemId: "relic-shard",
        quantity: 3
      },
      {
        type: "item_quantity",
        itemId: "healing-herb",
        quantity: 2
      }
    ]
  };

  assert.equal(
    isQuestCompletionMet(quest, {
      "relic-shard": 3,
      "healing-herb": 2
    }, "active"),
    true
  );
  assert.equal(
    isQuestCompletionMet(quest, {
      "relic-shard": 3,
      "healing-herb": 1
    }, "active"),
    false
  );
  assert.equal(
    isQuestCompletionMet(
      { completionConditions: [] },
      { "relic-shard": 99 },
      "active"
    ),
    false
  );
});

test("获得物品仅让进行中的任务完成并返回一次奖励", () => {
  const quest = {
    completionConditions: [
      {
        type: "item_quantity",
        itemId: "relic-shard",
        quantity: 2
      }
    ],
    rewards: [
      {
        itemId: "healing-herb",
        quantity: 3
      }
    ]
  };
  const inventory = { "relic-shard": 2 };

  assert.deepEqual(
    resolveQuestOnItemAcquired(quest, "active", inventory),
    {
      status: "completed",
      rewards: [
        {
          itemId: "healing-herb",
          quantity: 3
        }
      ]
    }
  );
  assert.deepEqual(
    resolveQuestOnItemAcquired(
      quest,
      "completed",
      inventory
    ),
    {
      status: "completed",
      rewards: []
    }
  );
  assert.deepEqual(
    resolveQuestOnItemAcquired(quest, "inactive", inventory),
    {
      status: "inactive",
      rewards: []
    }
  );
});

test("任务完成条件和获得物品都禁止重复物品 ID", () => {
  const content = createContentDocument();
  content.quests[0].completionConditions = [
    {
      type: "item_quantity",
      itemId: "relic-shard",
      quantity: 1
    },
    {
      type: "item_quantity",
      itemId: "relic-shard",
      quantity: 2
    }
  ];
  content.quests[0].rewards = [
    { itemId: "healing-herb", quantity: 1 },
    { itemId: "healing-herb", quantity: 2 }
  ];

  const messages = validateContentDocument(content)
    .filter((issue) => issue.severity === "error")
    .map((issue) => issue.message);

  assert.ok(
    messages.some(
      (message) =>
        message.includes("完成条件") &&
        message.includes("重复")
    )
  );
  assert.ok(
    messages.some(
      (message) =>
        message.includes("获得物品") &&
        message.includes("重复")
    )
  );
});

test("任务前置为空时不参与判断，存在条件时校验内容", () => {
  const content = createContentDocument();
  assert.equal(validateContentDocument(content).length, 0);
  content.quests[0].prerequisites = [
    {
      taskId: "",
      status: "inactive"
    }
  ];
  assert.ok(
    validateContentDocument(content).some((issue) =>
      issue.message.includes("任务 ID 必须符合")
    )
  );
});

test("V9 内容文档迁移到当前版本并补齐物品结构", () => {
  const legacy = {
    schemaVersion: 9,
    items: [
      {
        id: "02-0001",
        name: "旧钥匙",
        description: "可以开启庭院大门"
      }
    ]
  };

  const migrated = migrateContentDocument(legacy);
  const item = migrated.items[0];

  assert.equal(
    migrated.schemaVersion,
    CURRENT_CONTENT_SCHEMA_VERSION
  );
  assert.equal(item.name, "旧钥匙");
  assert.equal(item.primaryType, "");
  assert.equal(item.secondaryType, "");
  assert.equal(item.rarity, "");
  assert.equal(item.stackLimit, 1);
  assert.equal(item.tradeable, true);
  assert.equal(item.buyPrice, 0);
  assert.equal(item.sellPrice, 0);
  assert.deepEqual(item.effect, {
    mode: "description",
    description: "",
    script: ""
  });
  assert.deepEqual(migrated.itemTypeLibrary, {
    primaryTypes: [],
    rarities: []
  });
});

test("物品类型库会合并同名一级类型并去重二级类型", () => {
  const content = normalizeContentDocument({
    schemaVersion: 10,
    items: [],
    itemTypeLibrary: {
      primaryTypes: [
        {
          name: " 消耗品 ",
          secondaryTypes: ["恢复", " 恢复 "]
        },
        {
          name: "消耗品",
          secondaryTypes: ["增益"]
        },
        {
          name: "装备",
          secondaryTypes: []
        }
      ],
      rarities: ["普通", "普通", " 稀有 "]
    }
  });

  assert.deepEqual(content.itemTypeLibrary, {
    primaryTypes: [
      {
        name: "消耗品",
        secondaryTypes: ["恢复", "增益"]
      },
      {
        name: "装备",
        secondaryTypes: []
      }
    ],
    rarities: ["普通", "稀有"]
  });
});

test("物品类型、稀有度和效果字段通过校验并拒绝未知引用", () => {
  const content = createContentDocument();
  content.itemTypeLibrary = {
    primaryTypes: [
      {
        name: "消耗品",
        secondaryTypes: ["恢复"]
      }
    ],
    rarities: ["普通"]
  };
  Object.assign(content.items[0], {
    primaryType: "消耗品",
    secondaryType: "恢复",
    rarity: "普通",
    stackLimit: 20,
    tradeable: true,
    buyPrice: 10,
    sellPrice: 5,
    effect: {
      mode: "script",
      description: "使用后恢复生命",
      script: "scripts/items/heal.js"
    }
  });

  assert.equal(
    validateContentDocument(content).filter(
      (issue) => issue.severity === "error"
    ).length,
    0
  );

  content.items[0].secondaryType = "攻击";
  let messages = validateContentDocument(content)
    .filter((issue) => issue.severity === "error")
    .map((issue) => issue.message);
  assert.ok(
    messages.some((message) =>
      message.includes("不属于一级类型")
    )
  );

  content.items[0].secondaryType = "恢复";
  content.items[0].stackLimit = 0;
  content.items[0].effect.mode = "unknown";
  messages = validateContentDocument(content)
    .filter((issue) => issue.severity === "error")
    .map((issue) => issue.message);
  assert.ok(
    messages.some((message) => message.includes("stackLimit"))
  );
  assert.ok(
    messages.some((message) => message.includes("effect.mode"))
  );
});

test("V10 内容文档迁移到当前版本并保留插图与动画来源文件夹", () => {
  const legacy = {
    schemaVersion: 10,
    items: [
      {
        id: "02-0001",
        name: "旧物品",
        illustration: {
          assetId: "static:potion.png",
          fileName: "potion.png",
          displayName: "药剂插图",
          relativePath: "map/static-textures/potion.png",
          folderId: "static-folder-0001",
          folderPath: "图标 / 消耗品",
          revision: "rev-1"
        }
      }
    ],
    characters: [
      {
        id: "04-0001",
        name: "旧角色",
        animationBindings: [
          {
            id: "04-0001-animation-0001",
            type: "attack",
            source: {
              assetId: "entity:run.png",
              fileName: "run.png",
              relativePath: "map/entities/run.png",
              url: "/assets/map/entities/run.png",
              folderId: "entity-folder-0001",
              folderPath: "角色 / 玩家",
              imageWidth: 80,
              imageHeight: 80,
              frameWidth: 80,
              frameHeight: 80,
              frameCount: 1
            },
            direction: "right",
            frameRate: 8,
            attackFrame: 1,
            attackRange: null,
            triggers: []
          }
        ]
      }
    ]
  };

  const migrated = migrateContentDocument(legacy);

  assert.equal(
    migrated.schemaVersion,
    CURRENT_CONTENT_SCHEMA_VERSION
  );
  assert.equal(
    migrated.items[0].illustration.relativePath,
    "map/static-textures/potion.png"
  );
  assert.equal(
    migrated.items[0].illustration.folderId,
    "static-folder-0001"
  );
  assert.equal(
    migrated.items[0].illustration.folderPath,
    "图标 / 消耗品"
  );
  assert.equal(
    migrated.characters[0].animationBindings[0].source.folderId,
    "entity-folder-0001"
  );
  assert.equal(
    migrated.characters[0].animationBindings[0].source.folderPath,
    "角色 / 玩家"
  );
});

test("V12 内容文档迁移到当前版本并保留死亡动画绑定", () => {
  const legacy = {
    schemaVersion: 12,
    characters: [
      {
        id: "04-0001",
        name: "旧角色",
        animationBindings: [
          {
            id: "04-0001-animation-0001",
            type: "death",
            direction: "right",
            source: {
              assetId: "entity:death.png",
              fileName: "death.png",
              relativePath: "map/entities/death.png",
              url: "/assets/map/entities/death.png",
              imageWidth: 80,
              imageHeight: 80,
              frameWidth: 80,
              frameHeight: 80,
              frameCount: 1
            },
            triggers: []
          }
        ]
      }
    ]
  };

  const migrated = migrateContentDocument(legacy);

  assert.equal(
    migrated.schemaVersion,
    CURRENT_CONTENT_SCHEMA_VERSION
  );
  assert.equal(
    migrated.characters[0].animationBindings[0].type,
    "death"
  );
});

test("V13 内容文档迁移到当前版本并保留动画帧音效", () => {
  const legacy = {
    schemaVersion: 13,
    characters: [
      {
        id: "04-0001",
        name: "旧角色",
        animationBindings: [
          {
            id: "04-0001-animation-0001",
            type: "attack",
            direction: "right",
            source: {
              assetId: "entity:run.png",
              fileName: "run.png",
              relativePath: "map/entities/run.png",
              url: "/assets/map/entities/run.png",
              imageWidth: 80,
              imageHeight: 80,
              frameWidth: 80,
              frameHeight: 80,
              frameCount: 4
            },
            attackFrame: 2,
            frameSound: {
              assetId: "sfx:hit.wav",
              fileName: "hit.wav",
              displayName: "命中",
              relativePath: "audio/sfx/hit.wav",
              url: "/assets/audio/sfx/hit.wav",
              folderId: "sfx-folder-0001",
              folderPath: "战斗 / 命中",
              volume: 0.65
            },
            triggers: []
          }
        ]
      }
    ]
  };

  const migrated = migrateContentDocument(legacy);
  const binding =
    migrated.characters[0].animationBindings[0];

  assert.equal(
    migrated.schemaVersion,
    CURRENT_CONTENT_SCHEMA_VERSION
  );
  assert.deepEqual(binding.frameSound, {
    assetId: "sfx:hit.wav",
    fileName: "hit.wav",
    displayName: "命中",
    relativePath: "audio/sfx/hit.wav",
    url: "/assets/audio/sfx/hit.wav",
    folderId: "sfx-folder-0001",
    folderPath: "战斗 / 命中",
    volume: 0.65,
    loop: false
  });
});

test("动画帧音效默认不循环并校验音量、循环与路径", () => {
  const content = createContentDocument();
  const binding = createCharacterBinding();
  content.characters[0].animationBindings = [binding];

  assert.equal(binding.frameSound, undefined);
  assert.equal(validateContentDocument(content).length, 0);

  binding.frameSound = {
    assetId: "sfx:hit.wav",
    fileName: "hit.wav",
    displayName: "命中",
    relativePath: "audio/sfx/hit.wav",
    url: "/assets/audio/sfx/hit.wav",
    folderId: "sfx-folder-0001",
    folderPath: "战斗 / 命中",
    volume: 0.8,
    loop: false
  };
  assert.equal(validateContentDocument(content).length, 0);

  binding.frameSound.volume = 1.2;
  binding.frameSound.loop = "no";
  binding.frameSound.relativePath = "../hit.wav";
  const messages = validateContentDocument(content)
    .filter((issue) => issue.severity === "error")
    .map((issue) => issue.message);
  assert.ok(
    messages.some((message) =>
      message.includes("frameSound.volume")
    )
  );
  assert.ok(
    messages.some((message) =>
      message.includes("frameSound.loop")
    )
  );
  assert.ok(
    messages.some((message) =>
      message.includes("frameSound.relativePath")
    )
  );
});

test("帧音效未设置 loop 时归一化默认关闭", () => {
  const content = createContentDocument();
  content.characters[0].animationBindings = [
    createCharacterBinding({
      frameSound: {
        assetId: "sfx:hit.wav",
        fileName: "hit.wav",
        relativePath: "audio/sfx/hit.wav",
        url: "/assets/audio/sfx/hit.wav",
        volume: 0.4
      }
    })
  ];

  const normalized = normalizeContentDocument(content);
  const sound =
    normalized.characters[0].animationBindings[0].frameSound;

  assert.equal(sound.loop, false);
  assert.equal(sound.volume, 0.4);
  assert.equal(sound.folderId, null);
  assert.equal(sound.folderPath, "");
});

test("V11 触发键迁移时按动画方向补齐左右方向", () => {
  const legacy = {
    schemaVersion: 11,
    characters: [
      {
        id: "04-0001",
        name: "旧角色",
        animationBindings: [
          {
            id: "04-0001-animation-0001",
            type: "attack",
            direction: "left",
            source: {
              assetId: "entity:run.png",
              fileName: "run.png",
              relativePath: "map/entities/run.png",
              url: "/assets/map/entities/run.png",
              imageWidth: 80,
              imageHeight: 80,
              frameWidth: 80,
              frameHeight: 80,
              frameCount: 1
            },
            triggers: [
              {
                device: "keyboard",
                code: "KeyA",
                label: "A"
              }
            ]
          }
        ]
      }
    ]
  };

  const migrated = migrateContentDocument(legacy);

  assert.equal(
    migrated.schemaVersion,
    CURRENT_CONTENT_SCHEMA_VERSION
  );
  assert.equal(
    migrated.characters[0].animationBindings[0].triggers[0]
      .direction,
    "left"
  );
});

test("物品插图校验路径、文件夹和必填字段", () => {
  const content = createContentDocument();
  content.items[0].illustration = {
    assetId: "static:potion.png",
    fileName: "potion.png",
    displayName: "药剂插图",
    relativePath: "map/static-textures/potion.png",
    folderId: "static-folder-0001",
    folderPath: "图标 / 消耗品",
    revision: "rev-1"
  };

  assert.equal(
    validateContentDocument(content).filter(
      (issue) => issue.severity === "error"
    ).length,
    0
  );

  content.items[0].illustration.relativePath = "../escape.png";
  content.items[0].illustration.folderId = 42;
  const messages = validateContentDocument(content)
    .filter((issue) => issue.severity === "error")
    .map((issue) => issue.message);
  assert.ok(
    messages.some((message) =>
      message.includes("relativePath")
    )
  );
  assert.ok(
    messages.some((message) =>
      message.includes("folderId")
    )
  );
});

test("角色动画来源保留可选的文件夹信息", () => {
  const content = createContentDocument();
  content.characters[0].animationBindings = [
    createCharacterBinding()
  ];
  const source =
    content.characters[0].animationBindings[0].source;
  source.folderId = "entity-folder-0001";
  source.folderPath = "角色 / 玩家";

  assert.equal(
    validateContentDocument(content).filter(
      (issue) => issue.severity === "error"
    ).length,
    0
  );

  source.folderId = 42;
  const messages = validateContentDocument(content)
    .filter((issue) => issue.severity === "error")
    .map((issue) => issue.message);
  assert.ok(
    messages.some((message) =>
      message.includes("source.folderId")
    )
  );
});

test("物品类型库拒绝重复名称和空项", () => {
  const content = createContentDocument();
  content.itemTypeLibrary = {
    primaryTypes: [
      {
        name: "消耗品",
        secondaryTypes: ["恢复"]
      },
      {
        name: "消耗品",
        secondaryTypes: []
      }
    ],
    rarities: ["普通", "普通"]
  };

  const messages = validateContentDocument(content)
    .filter((issue) => issue.severity === "error")
    .map((issue) => issue.message);

  assert.ok(
    messages.some(
      (message) =>
        message.includes("一级类型") &&
        message.includes("重复")
    )
  );
  assert.ok(
    messages.some(
      (message) =>
        message.includes("稀有度") &&
        message.includes("重复")
    )
  );
});
