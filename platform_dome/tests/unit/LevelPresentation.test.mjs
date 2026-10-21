import assert from "node:assert/strict";
import test from "node:test";
import {
  getActorInstanceScale,
  getLevelBackground,
  getLevelBackgroundAsset,
  getLevelBackgroundMap,
  getLevelBackgroundMapKey,
  getLevelBackgroundMapTilesetKey,
  getLevelBackgroundMapUrl,
  getLevelBackgroundTextureKey,
  getLevelBackgroundUrl,
  getPickupDisplaySize,
  getSolidTerrainType
} from "../../src/data/levels/LevelPresentation.js";

test("background assets are resolved into a stable texture identity", () => {
  const level = {
    id: "level-test",
    world: {
      background: {
        type: "image",
        id: "map/backgrounds/庭院.png",
        path: "assets/map/backgrounds/庭院.png",
        revision: "revision-1",
        fit: "stretch"
      }
    }
  };
  const asset = getLevelBackgroundAsset(level);
  assert.equal(getLevelBackground(level).type, "image");

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

test("background tilemaps expose stable map and tileset identities", () => {
  const backgroundMap = {
    type: "tiled",
    id: "map/tiled/courtyard",
    mapPath: "assets/map/tiled/courtyard/map.json",
    revision: "revision-map",
    tilesets: [
      {
        name: "ground",
        firstGid: 1,
        imagePath: "assets/map/tiled/courtyard/source/地面.png"
      }
    ]
  };
  const level = {
    id: "level-test",
    world: { background: backgroundMap }
  };
  assert.equal(getLevelBackgroundMap(level), backgroundMap);
  assert.equal(
    getLevelBackgroundMapKey(level.id, backgroundMap),
    "level-tilemap:level-test:map/tiled/courtyard:revision-map"
  );
  assert.equal(
    getLevelBackgroundMapTilesetKey(
      level.id,
      backgroundMap,
      backgroundMap.tilesets[0]
    ),
    "level-tilemap-tileset:level-test:map/tiled/courtyard:revision-map:1"
  );
  assert.equal(
    getLevelBackgroundMapUrl(
      backgroundMap.tilesets[0].imagePath,
      backgroundMap.revision
    ),
    "assets/map/tiled/courtyard/source/%E5%9C%B0%E9%9D%A2.png?v=revision-map"
  );
});
