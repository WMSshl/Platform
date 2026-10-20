import assert from "node:assert/strict";
import test from "node:test";
import {
  getActorInstanceScale,
  getLevelBackgroundAsset,
  getLevelBackgroundTextureKey,
  getLevelBackgroundUrl,
  getPickupDisplaySize,
  getSolidTerrainType
} from "../../src/data/levels/LevelPresentation.js";

test("background assets are resolved into a stable texture identity", () => {
  const level = {
    id: "level-test",
    world: {
      backgroundAsset: {
        id: "map/backgrounds/庭院.png",
        path: "assets/map/backgrounds/庭院.png",
        revision: "revision-1",
        fit: "stretch"
      }
    }
  };
  const asset = getLevelBackgroundAsset(level);

  assert.equal(asset.path, "assets/map/backgrounds/庭院.png");
  assert.equal(
    getLevelBackgroundTextureKey(level.id, asset),
    "level-background:level-test:revision-1"
  );
  assert.equal(
    getLevelBackgroundUrl(asset),
    "assets/map/backgrounds/%E5%BA%AD%E9%99%A2.png?v=revision-1"
  );
});

test("actor scale and pickup dimensions use instance overrides", () => {
  assert.deepEqual(
    getActorInstanceScale({ scaleX: 2.5, scaleY: 0.75 }),
    { x: 2.5, y: 0.75 }
  );
  assert.deepEqual(getActorInstanceScale({ scale: 2.5 }), {
    x: 2.5,
    y: 2.5
  });
  assert.deepEqual(getActorInstanceScale({}), { x: 1, y: 1 });
  assert.deepEqual(
    getPickupDisplaySize(
      { width: 64, height: 48 },
      { appearance: { width: 26, height: 26 } }
    ),
    { width: 64, height: 48 }
  );
});

test("solid terrain defaults to ground and recognizes platforms", () => {
  assert.equal(getSolidTerrainType({}), "ground");
  assert.equal(
    getSolidTerrainType({ terrainType: "platform" }),
    "platform"
  );
});
