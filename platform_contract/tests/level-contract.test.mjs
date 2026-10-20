import assert from "node:assert/strict";
import test from "node:test";
import {
  CURRENT_LEVEL_SCHEMA_VERSION,
  createEmptyLevel,
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
