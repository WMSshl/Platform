import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CURRENT_LEVEL_SCHEMA_VERSION
} from "../src/contract/index.js";
import {
  MECHANISM_KINDS,
  createEmptyLevel,
  createPlacedObject,
  duplicateSelection,
  insertPlacedObject,
  normalizeLevel,
  removeSelection
} from "../src/model/LevelModel.js";
import { validateLevel } from "../src/model/Validation.js";

const level = JSON.parse(
  await readFile(
    new URL("../data/levels/level-001.json", import.meta.url),
    "utf8"
  )
);
const levelTwo = JSON.parse(
  await readFile(
    new URL("../data/levels/level-002.json", import.meta.url),
    "utf8"
  )
);
const actors = JSON.parse(
  await readFile(
    new URL("../data/configs/actors.json", import.meta.url),
    "utf8"
  )
);
const items = JSON.parse(
  await readFile(
    new URL("../data/configs/items.json", import.meta.url),
    "utf8"
  )
);

test("normalizeLevel keeps the game level schema and fills missing arrays", () => {
  const normalized = normalizeLevel({
    id: "level-test",
    name: "测试关卡",
    world: { width: 1200, height: 800 },
    spawnPoints: [{ id: "start", name: "起点", x: 100, y: 700 }],
    initialSpawnId: "start",
    story: { chapterId: "legacy" },
    quest: { id: "legacy-quest" }
  });

  assert.equal(normalized.id, "level-test");
  assert.equal(
    normalized.schemaVersion,
    CURRENT_LEVEL_SCHEMA_VERSION
  );
  assert.equal(normalized.world.backgroundColor, "#0f172a");
  assert.deepEqual(normalized.solids, []);
  assert.deepEqual(normalized.actors, []);
  assert.equal(normalized.spawnPoints[0].id, "start");
  assert.equal(normalized.playerSpawn, undefined);
  assert.equal(normalized.story, undefined);
  assert.equal(normalized.quest, undefined);
});

test("机关类型通过 registry 提供放置元数据", () => {
  assert.deepEqual(
    MECHANISM_KINDS.map((kind) => kind.type),
    ["switch", "gate", "entrance", "exit"]
  );
  for (const kind of MECHANISM_KINDS) {
    assert.equal(typeof kind.idPrefix, "function");
    assert.equal(typeof kind.createFields, "function");
  }
});

test("placed actor and item ids are unique inside their section", () => {
  const draft = createEmptyLevel("level-test");
  const first = insertPlacedObject(draft, "actor", {
    x: 100,
    y: 200,
    actorId: "guard"
  });
  const second = insertPlacedObject(draft, "actor", {
    x: 200,
    y: 300,
    actorId: "npc-guide"
  });
  const item = insertPlacedObject(draft, "item", {
    x: 300,
    y: 400,
    itemId: "healing-herb"
  });

  assert.equal(first.selection.id, "actor-1");
  assert.equal(second.selection.id, "actor-2");
  assert.equal(item.selection.id, "pickup-1");
  assert.equal(draft.actors.length, 2);
  assert.equal(draft.items.length, 1);
});

test("duplicateSelection creates a stable copy and removeSelection deletes it", () => {
  const draft = createEmptyLevel("level-test");
  const placed = insertPlacedObject(draft, "mechanism", {
    type: "gate",
    x: 600,
    y: 400,
    width: 40,
    height: 180
  });
  const duplicate = duplicateSelection(draft, placed.selection);

  assert.equal(duplicate.id, "gate-2");
  assert.equal(draft.mechanisms.length, 2);
  assert.equal(removeSelection(draft, duplicate), true);
  assert.equal(draft.mechanisms.length, 1);
});

test("existing game level passes validation with live catalogs", () => {
  const first = normalizeLevel(level);
  const second = normalizeLevel(levelTwo);
  const issues = validateLevel(first, {
    catalogs: { actors, items },
    knownLevels: [first, second]
  });

  assert.equal(
    issues.filter((issue) => issue.severity === "error").length,
    0
  );
});

test("validation reports broken switch and entrance references", () => {
  const draft = normalizeLevel(level);
  const switchMechanism = draft.mechanisms.find(
    (mechanism) => mechanism.type === "switch"
  );
  const entranceMechanism = draft.mechanisms.find(
    (mechanism) => mechanism.type === "entrance"
  );
  switchMechanism.targetGateId = "missing-gate";
  entranceMechanism.targetExitId = "missing-exit";
  const issues = validateLevel(draft, {
    catalogs: { actors, items },
    knownLevelIds: ["level-001", "level-002"]
  });

  assert.equal(
    issues.filter((issue) => issue.severity === "error").length,
    2
  );
});

test("createPlacedObject uses the same rectangle coordinate convention as the game", () => {
  const gate = createPlacedObject(
    createEmptyLevel("level-test"),
    "mechanism",
    {
      type: "gate",
      x: 520,
      y: 360,
      width: 48,
      height: 160
    }
  );

  assert.deepEqual(
    { x: gate.x, y: gate.y, width: gate.width, height: gate.height },
    { x: 520, y: 360, width: 48, height: 160 }
  );
});

test("solid terrain distinguishes ground and one-way platforms", () => {
  const draft = createEmptyLevel("level-test");
  const platform = insertPlacedObject(draft, "solid", {
    x: 400,
    y: 300,
    width: 180,
    height: 24,
    terrainType: "platform"
  }).object;

  assert.equal(draft.solids[0].terrainType, "ground");
  assert.equal(platform.terrainType, "platform");
  assert.equal(platform.color, "#38bdf8");

  const normalized = normalizeLevel({
    ...createEmptyLevel("level-legacy"),
    solids: [
      {
        id: "legacy-ground",
        x: 100,
        y: 100,
        width: 200,
        height: 40,
        color: "#334155"
      }
    ]
  });
  assert.equal(normalized.solids[0].terrainType, "ground");
});

test("all special object types share the mechanisms collection", () => {
  const draft = createEmptyLevel("level-test");
  for (const type of ["switch", "gate", "entrance", "exit"]) {
    insertPlacedObject(draft, "mechanism", {
      type,
      x: 300,
      y: 300
    });
  }

  assert.deepEqual(
    draft.mechanisms.map((mechanism) => mechanism.type),
    ["switch", "gate", "entrance", "exit"]
  );
  assert.equal(draft.gates, undefined);
  assert.equal(draft.exits, undefined);
});

test("validation rejects two entrances binding the same exit", () => {
  const source = createEmptyLevel("level-source");
  const target = createEmptyLevel("level-target");
  insertPlacedObject(target, "mechanism", {
    type: "exit",
    x: 200,
    y: 800,
    width: 80,
    height: 140
  });
  for (let index = 0; index < 2; index += 1) {
    insertPlacedObject(source, "mechanism", {
      type: "entrance",
      x: 500 + index * 100,
      y: 900,
      targetExitId: "level-target-exit-1"
    });
  }
  const issues = validateLevel(source, {
    catalogs: { actors, items },
    knownLevels: [target]
  });

  assert.ok(
    issues.some((issue) =>
      issue.message.includes("被多个入口绑定")
    )
  );
});
