import assert from "node:assert/strict";
import test from "node:test";
import {
  CURRENT_LEVEL_SCHEMA_VERSION,
  createEmptyLevel,
  getTiledBackgroundBounds,
  getTiledBackgroundCollisionRects,
  getUniqueTiledTilesetNames,
  TiledTileAnimations,
  migrateLevelDocument,
  normalizeLevel,
  validateLevel,
  validateManifest
} from "../src/index.js";

const catalogs = {
  actors: {
    player: { id: "player" },
    guard: { id: "guard" }
  },
  items: {
    herb: { id: "herb" }
  }
};

function createValidLevel() {
  const level = createEmptyLevel("level-test");
  level.actors.push({
    instanceId: "guard-1",
    actorId: "guard",
    x: 300,
    y: 1100
  });
  level.items.push({
    instanceId: "pickup-1",
    itemId: "herb",
    quantity: 1,
    x: 400,
    y: 1100
  });
  level.mechanisms.push({
    id: "level-test-exit",
    type: "exit",
    x: 500,
    y: 1100,
    width: 80,
    height: 140,
    color: "#34d399"
  });
  return level;
}

test("旧关卡会迁移到当前 schema 版本", () => {
  const legacy = {
    id: "level-legacy",
    name: "旧关卡",
    world: { width: 1200, height: 800 },
    playerSpawn: { x: 100, y: 700 },
    gates: [
      {
        id: "gate-old",
        x: 500,
        y: 700,
        width: 40,
        height: 160
      }
    ],
    story: { chapterId: "old" }
  };

  const migrated = migrateLevelDocument(legacy);

  assert.equal(
    migrated.schemaVersion,
    CURRENT_LEVEL_SCHEMA_VERSION
  );
  assert.equal(migrated.spawnPoints[0].id, "spawn-start");
  assert.equal(migrated.mechanisms[0].type, "gate");
  assert.equal(migrated.story, undefined);
  assert.equal(migrated.gates, undefined);
});

test("当前 schema 的有效关卡没有错误", () => {
  const level = createValidLevel();
  const issues = validateLevel(level, {
    catalogs,
    knownLevels: [level]
  });

  assert.equal(
    issues.filter((issue) => issue.severity === "error").length,
    0
  );
});

test("重复对象 ID、错误地形和未知机关类型会被拒绝", () => {
  const level = normalizeLevel(createValidLevel());
  level.solids.push({ ...level.solids[0] });
  level.solids[0].terrainType = "water";
  level.mechanisms.push({
    id: "unknown-1",
    type: "unknown",
    x: 200,
    y: 200,
    width: 20,
    height: 20
  });

  const issues = validateLevel(level, { catalogs });
  const messages = issues
    .filter((issue) => issue.severity === "error")
    .map((issue) => issue.message);

  assert.ok(messages.some((message) => message.includes("重复编号")));
  assert.ok(messages.some((message) => message.includes("地形")));
  assert.ok(messages.some((message) => message.includes("未知类型")));
});

test("跨关卡出口唯一性与入口绑定由 contract 校验", () => {
  const source = createValidLevel();
  source.id = "level-source";
  source.name = "源关卡";
  source.mechanisms = [];
  const target = createValidLevel();
  target.id = "level-target";
  target.name = "目标关卡";
  target.mechanisms[0].id = "target-exit";
  source.mechanisms.push(
    {
      id: "entrance-1",
      type: "entrance",
      x: 300,
      y: 900,
      width: 80,
      height: 120,
      color: "#22d3ee",
      activation: "player-center-touch",
      targetExitId: "target-exit"
    },
    {
      id: "entrance-2",
      type: "entrance",
      x: 400,
      y: 900,
      width: 80,
      height: 120,
      color: "#22d3ee",
      activation: "player-center-touch",
      targetExitId: "target-exit"
    }
  );

  const issues = validateLevel(source, {
    catalogs,
    knownLevels: [source, target]
  });

  assert.ok(
    issues.some((issue) => issue.message.includes("被多个入口绑定"))
  );
});

test("manifest 校验包含缺失与多余条目", () => {
  const issues = validateManifest(
    { levels: ["level-a", "level-c"] },
    ["level-a", "level-b"]
  );
  assert.ok(issues.some((issue) => issue.message.includes("level-c")));
  assert.ok(issues.some((issue) => issue.message.includes("level-b")));
});

test("版本 1 关卡迁移到当前版本并统一背景模型", () => {
  const legacy = createValidLevel();
  legacy.schemaVersion = 1;
  legacy.world.backgroundAsset = {
    id: "map/backgrounds/demo.png",
    path: "assets/map/backgrounds/demo.png",
    fileName: "demo.png",
    mimeType: "image/png",
    fit: "stretch",
    revision: "legacy"
  };

  const migrated = migrateLevelDocument(legacy);
  assert.equal(migrated.schemaVersion, CURRENT_LEVEL_SCHEMA_VERSION);
  assert.equal(
    migrated.world.background.path,
    "assets/map/backgrounds/demo.png"
  );
  assert.equal(migrated.world.background.type, "image");
  assert.equal(migrated.world.backgroundAsset, undefined);
  assert.equal(migrated.world.backgroundMap, undefined);
});

function createBackgroundMap() {
  return {
    type: "tiled",
    id: "map/tiled/test/map.json",
    sourcePath: "assets/map/tiled/test/source/map.json",
    mapPath: "assets/map/tiled/test/map.json",
    fileName: "map.json",
    revision: "test-revision",
    sourceWidth: 64,
    sourceHeight: 32,
    tileWidth: 16,
    tileHeight: 16,
    tilesets: [
      {
        name: "tiles",
        firstGid: 1,
        imagePath: "assets/map/tiled/test/tiles.png",
        imageWidth: 32,
        imageHeight: 16,
        tileWidth: 16,
        tileHeight: 16,
        margin: 0,
        spacing: 0,
        columns: 2,
        tileCount: 2
      }
    ],
    collisions: [
      {
        id: "collision-1",
        x: 8,
        y: 24,
        width: 16,
        height: 16,
        terrainType: "ground"
      },
      {
        id: "collision-2",
        x: 24,
        y: 24,
        width: 16,
        height: 16,
        terrainType: "ground"
      },
      {
        id: "collision-3",
        x: 40,
        y: 24,
        width: 16,
        height: 16,
        terrainType: "platform"
      }
    ]
  };
}

test("统一背景校验 tiled 碰撞和未知类型", () => {
  const level = createValidLevel();
  level.world.background = createBackgroundMap();
  let issues = validateLevel(level, {
    catalogs,
    knownLevels: [level]
  });
  assert.equal(
    issues.filter((issue) => issue.severity === "error").length,
    0
  );

  level.world.background.type = "video";
  issues = validateLevel(level, { catalogs });
  const messages = issues.map((issue) => issue.message);
  assert.ok(messages.some((message) => message.includes("type")));

  level.world.background.type = "tiled";
  level.world.background.collisions[0].terrainType = "water";
  issues = validateLevel(level, { catalogs });
  assert.ok(
    issues.some((issue) => issue.message.includes("terrainType"))
  );
});

test("Tiled 背景碰撞随世界尺寸拉伸、裁剪并合并", () => {
  const backgroundMap = createBackgroundMap();

  const bounds = getTiledBackgroundBounds(backgroundMap, {
    worldWidth: 80,
    worldHeight: 40
  });
  assert.deepEqual(bounds, {
    x: 40,
    y: 20,
    width: 80,
    height: 40,
    left: 0,
    top: 0,
    right: 80,
    bottom: 40
  });

  const rectangles = getTiledBackgroundCollisionRects(
    backgroundMap,
    { worldWidth: 80, worldHeight: 40 }
  );
  assert.equal(rectangles.length, 2);
  assert.deepEqual(rectangles[0], {
    id: "tilemap-collision-merged-1",
    x: 20,
    y: 30,
    width: 40,
    height: 20,
    terrainType: "ground"
  });
  assert.equal(rectangles[1].terrainType, "platform");
  assert.equal(rectangles[1].x, 50);
});

test("Tiled tileset 重名会生成稳定且大小写无关的唯一名称", () => {
  assert.deepEqual(
    getUniqueTiledTilesetNames([
      { name: "Ground" },
      { name: "ground" },
      { name: "Ground-2" },
      { name: "Ground" }
    ]),
    ["Ground", "ground-2", "Ground-2-2", "Ground-3"]
  );
});

test("Tiled 动画瓦片会按帧时长更新并保留翻转位", () => {
  const tile = { index: 0x80000001 };
  const layers = [{ layer: { data: [[tile]] } }];
  const animations = new TiledTileAnimations(
    [
      {
        firstGid: 1,
        animations: [
          {
            tileId: 0,
            frames: [
              { tileId: 1, duration: 100 },
              { tileId: 0, duration: 100 }
            ]
          }
        ]
      }
    ],
    layers,
    0
  );
  animations.update(99);
  assert.equal(tile.index, 0x80000001);
  animations.update(100);
  assert.equal(tile.index, 0x80000002);
  animations.update(200);
  assert.equal(tile.index, 0x80000001);
});

test("版本 2 的 Tiled 变换字段会迁移为世界绑定背景", () => {
  const oldLevel = createValidLevel();
  oldLevel.schemaVersion = 2;
  oldLevel.world.backgroundMap = {
    ...createBackgroundMap(),
    x: 300,
    y: 200,
    scaleX: 1.5,
    scaleY: 2
  };
  delete oldLevel.world.backgroundMap.type;

  const migrated = migrateLevelDocument(oldLevel);
  assert.equal(migrated.schemaVersion, CURRENT_LEVEL_SCHEMA_VERSION);
  assert.equal(migrated.world.background.type, "tiled");
  assert.equal(migrated.world.background.x, undefined);
  assert.equal(migrated.world.background.y, undefined);
  assert.equal(migrated.world.background.scaleX, undefined);
  assert.equal(migrated.world.background.scaleY, undefined);
  assert.equal(migrated.world.backgroundMap, undefined);
});
