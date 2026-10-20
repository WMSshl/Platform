import assert from "node:assert/strict";
import test from "node:test";
import {
  applyWorldResize,
  getObjectDisplaySize,
  getObjectVisualBounds,
  getResizePolicy,
  resizeObject,
  resizeWorldBounds
} from "../src/model/ObjectTransform.js";

const catalogs = {
  actors: {
    guard: {
      appearance: { width: 48, height: 70 }
    }
  },
  items: {
    herb: {
      appearance: { width: 26, height: 26 }
    }
  }
};

test("rectangular objects expose corner and edge resize handles", () => {
  const solid = { id: "ground", x: 200, y: 100, width: 120, height: 40 };
  const policy = getResizePolicy("solids", solid);

  assert.equal(policy.uniformOnly, false);
  assert.equal(policy.handles.length, 8);
});

test("actors expose corner and edge resize handles", () => {
  const actor = {
    instanceId: "guard-1",
    actorId: "guard",
    x: 200,
    y: 100,
    scale: 2
  };
  const policy = getResizePolicy("actors", actor);
  const bounds = getObjectVisualBounds("actors", actor, catalogs);

  assert.equal(policy.uniformOnly, false);
  assert.equal(policy.handles.length, 8);
  assert.equal(bounds.width, 96);
  assert.equal(bounds.height, 140);
});

test("actor catalog spriteScale contributes to editor display size", () => {
  const size = getObjectDisplaySize(
    "actors",
    { actorId: "scaled-guard", x: 100, y: 100, scale: 1 },
    {
      actors: {
        "scaled-guard": {
          appearance: {
            width: 48,
            height: 70,
            spriteScale: 1.5
          }
        }
      }
    }
  );

  assert.deepEqual(size, { width: 72, height: 105 });
});

test("imported assets no longer restrict resize axes", () => {
  const object = {
    x: 100,
    y: 100,
    width: 80,
    height: 40,
    assetId: "entity:demo"
  };

  assert.equal(getResizePolicy("mechanisms", object).uniformOnly, false);
  assert.equal(getResizePolicy("mechanisms", object).handles.length, 8);
});

test("corner resizing preserves aspect ratio and anchors the opposite corner", () => {
  const actor = {
    instanceId: "guard-1",
    actorId: "guard",
    x: 100,
    y: 100
  };
  const bounds = getObjectVisualBounds("actors", actor, catalogs);
  const result = resizeObject(
    "actors",
    actor,
    { name: "se", dx: 1, dy: 1 },
    { x: bounds.left + 96, y: bounds.top + 140 },
    bounds,
    catalogs
  );

  assert.equal(result.scaleX, 2);
  assert.equal(result.scaleY, 2);
  assert.equal(result.x, 124);
  assert.equal(result.y, 135);
});

test("character edge resizing changes one scale axis", () => {
  const actor = {
    instanceId: "guard-1",
    actorId: "guard",
    x: 100,
    y: 100,
    scaleX: 1,
    scaleY: 1
  };
  const bounds = getObjectVisualBounds("actors", actor, catalogs);
  const result = resizeObject(
    "actors",
    actor,
    { name: "e", dx: 1, dy: 0 },
    { x: 172, y: 100 },
    bounds,
    catalogs
  );

  assert.equal(result.scaleX, 2);
  assert.equal(result.scaleY, 1);
});

test("edge resizing changes only one rectangular dimension", () => {
  const solid = {
    id: "ground",
    x: 200,
    y: 100,
    width: 120,
    height: 40
  };
  const bounds = getObjectVisualBounds("solids", solid);
  const result = resizeObject(
    "solids",
    solid,
    { name: "e", dx: 1, dy: 0 },
    { x: 300, y: 100 },
    bounds
  );

  assert.equal(result.width, 160);
  assert.equal(result.height, 40);
  assert.equal(result.x, 220);
  assert.equal(result.y, 100);
});

test("world bounds resize from edges and shift content from west or north", () => {
  const world = { width: 1000, height: 600 };
  const edge = resizeWorldBounds(
    world,
    { name: "e", dx: 1, dy: 0 },
    { x: 1200, y: 300 }
  );
  assert.deepEqual(edge, {
    width: 1200,
    height: 600,
    shiftX: 0,
    shiftY: 0
  });

  const level = {
    world: { width: 1000, height: 600 },
    spawnPoints: [{ id: "spawn", x: 100, y: 100 }],
    solids: [],
    actors: [],
    items: [],
    mechanisms: []
  };
  const west = resizeWorldBounds(
    world,
    { name: "w", dx: -1, dy: 0 },
    { x: 200, y: 300 }
  );
  applyWorldResize(level, west);

  assert.equal(level.world.width, 800);
  assert.equal(level.spawnPoints[0].x, -100);
});
