import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  rm
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildTiledMapBundle,
  listTiledMapCandidates
} from "../tools/tiled-map-import.mjs";
import {
  copyTiledMapAsset,
  deleteTiledMapAsset,
  getTiledMapNameConflicts,
  importTiledMapToGame,
  listTiledMapAssets,
  publishTiledMapBundle,
  renameTiledMapAsset
} from "../tools/tiled-asset-repository.mjs";

const embeddedPng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function embeddedMap() {
  return {
    type: "map",
    version: "1.10",
    tiledversion: "1.11.0",
    orientation: "orthogonal",
    renderorder: "right-down",
    width: 2,
    height: 2,
    tilewidth: 16,
    tileheight: 16,
    infinite: false,
    nextlayerid: 3,
    nextobjectid: 2,
    layers: [
      {
        id: 1,
        name: "背景",
        type: "tilelayer",
        width: 2,
        height: 2,
        x: 0,
        y: 0,
        visible: true,
        opacity: 1,
        data: [1, 0, 0, 1]
      },
      {
        id: 2,
        name: "collision",
        type: "objectgroup",
        visible: false,
        opacity: 1,
        x: 0,
        y: 0,
        objects: [
          {
            id: 1,
            x: 20,
            y: 4,
            width: 12,
            height: 8,
            visible: true,
            properties: [
              { name: "oneWay", type: "bool", value: true }
            ]
          }
        ]
      }
    ],
    tilesets: [
      {
        firstgid: 1,
        name: "ground",
        tilewidth: 16,
        tileheight: 16,
        tilecount: 1,
        columns: 1,
        margin: 0,
        spacing: 0,
        image: embeddedPng,
        imagewidth: 16,
        imageheight: 16,
        tiles: [
          {
            id: 0,
            properties: [
              { name: "collides", type: "bool", value: true }
            ]
          }
        ]
      }
    ]
  };
}

function externalTsxMap() {
  return {
    ...embeddedMap(),
    layers: [
      {
        ...embeddedMap().layers[0],
        data: [1, 2, 0, 1]
      },
      embeddedMap().layers[1]
    ],
    tilesets: [{ firstgid: 1, source: "tiles/ground.tsx" }]
  };
}

const externalTsx = `<?xml version="1.0" encoding="UTF-8"?>
<tileset version="1.10" tiledversion="1.11.0" name="ground"
  tilewidth="16" tileheight="16" tilecount="2" columns="2">
  <image source="ground.png" width="32" height="16"/>
  <tile id="0">
    <objectgroup draworder="index">
      <object id="1" x="4" y="4" width="8" height="8"/>
    </objectgroup>
  </tile>
  <tile id="1">
    <properties>
      <property name="collides" type="bool" value="true"/>
    </properties>
  </tile>
</tileset>`;

test("folder import resolves external TSX and extracts collisions", () => {
  const bundle = buildTiledMapBundle({
    mapPath: "project/maps/courtyard.tmj",
    files: [
      {
        path: "project/maps/courtyard.tmj",
        content: Buffer.from(JSON.stringify(externalTsxMap()))
      },
      {
        path: "project/maps/tiles/ground.tsx",
        content: Buffer.from(externalTsx)
      },
      {
        path: "project/maps/tiles/ground.png",
        content: Buffer.from("png")
      }
    ]
  });

  assert.equal(bundle.manifest.name, "courtyard");
  assert.equal(bundle.manifest.fileName, "courtyard.tmj");
  assert.equal(bundle.manifest.sourceWidth, 32);
  assert.equal(bundle.manifest.sourceHeight, 32);
  assert.equal(bundle.manifest.tilesetCount, 1);
  assert.equal(bundle.manifest.collisions.length, 4);
  assert.equal(
    bundle.manifest.collisions.filter(
      (collision) => collision.terrainType === "ground"
    ).length,
    3
  );
  assert.equal(
    bundle.files.some(
      (file) => file.path === "source/project/maps/tiles/ground.tsx"
    ),
    true
  );

  const mapJson = JSON.parse(
    bundle.files
      .find((file) => file.path === "map.json")
      .content.toString("utf8")
  );
  assert.deepEqual(mapJson.layers[0].data, [1, 2, 0, 1]);
  assert.equal(
    mapJson.tilesets[0].image,
    "project/maps/tiles/ground.png"
  );
});

test("embedded data URI tilesets are accepted and named from the map file", () => {
  const bundle = buildTiledMapBundle({
    mapPath: "courtyard.json",
    files: [
      {
        path: "courtyard.json",
        content: Buffer.from(JSON.stringify(embeddedMap()))
      }
    ]
  });
  assert.equal(bundle.manifest.name, "courtyard");
  assert.equal(bundle.manifest.fileName, "courtyard.json");
  assert.equal(bundle.manifest.collisions.length, 3);
  assert.equal(
    bundle.files.some((file) =>
      file.path.endsWith("_embedded/tileset-1.png")
    ),
    true
  );
});

test("duplicate tileset names are normalized without changing GIDs", () => {
  const map = embeddedMap();
  const gids = [1, 257, 513, 769, 1025, 1281, 1537, 1793];
  map.width = 9;
  map.height = 1;
  map.layers[0].width = 9;
  map.layers[0].height = 1;
  map.layers[0].data = [...gids, 0];
  map.tilesets = gids.map((firstgid) => ({
    ...embeddedMap().tilesets[0],
    firstgid
  }));
  const bundle = buildTiledMapBundle({
    mapPath: "duplicate-tileset.json",
    files: [
      {
        path: "duplicate-tileset.json",
        content: Buffer.from(JSON.stringify(map))
      }
    ]
  });
  const mapJson = JSON.parse(
    bundle.files
      .find((file) => file.path === "map.json")
      .content.toString("utf8")
  );
  assert.deepEqual(mapJson.layers[0].data, [...gids, 0]);
  assert.deepEqual(
    mapJson.tilesets.map((tileset) => tileset.name),
    [
      "ground",
      "ground-2",
      "ground-3",
      "ground-4",
      "ground-5",
      "ground-6",
      "ground-7",
      "ground-8"
    ]
  );
});

test("Tiled tile animation metadata is preserved", () => {
  const map = embeddedMap();
  map.tilesets[0].imagewidth = 32;
  map.tilesets[0].tilecount = 2;
  map.tilesets[0].columns = 2;
  map.tilesets[0].tiles[0].animation = [
    { tileid: 1, duration: 120 },
    { tileid: 0, duration: 180 }
  ];
  const bundle = buildTiledMapBundle({
    mapPath: "animated.json",
    files: [
      {
        path: "animated.json",
        content: Buffer.from(JSON.stringify(map))
      }
    ]
  });
  assert.deepEqual(
    bundle.manifest.tilesets[0].animations,
    [
      {
        tileId: 0,
        frames: [
          { tileId: 1, duration: 120 },
          { tileId: 0, duration: 180 }
        ]
      }
    ]
  );
});

test("folder scan finds multiple Tiled maps and ignores ordinary JSON", () => {
  const files = [
    {
      path: "project/one.tmj",
      content: Buffer.from(JSON.stringify(embeddedMap()))
    },
    {
      path: "project/two.json",
      content: Buffer.from(JSON.stringify(embeddedMap()))
    },
    {
      path: "project/config.json",
      content: Buffer.from('{"enabled":true}')
    }
  ];
  const candidates = listTiledMapCandidates(files);
  assert.deepEqual(
    candidates.map((candidate) => candidate.fileName),
    ["one.tmj", "two.json"]
  );
});

test("published Tiled JSON map can be copied into the game project", async (t) => {
  const root = await mkdtemp(
    join(tmpdir(), "platform-editor-tiled-json-")
  );
  const assetRoot = join(root, "editor-assets");
  const gameRoot = join(root, "game");
  t.after(() => rm(root, { recursive: true, force: true }));

  const bundle = buildTiledMapBundle({
    mapPath: "project/courtyard.json",
    files: [
      {
        path: "project/courtyard.json",
        content: Buffer.from(JSON.stringify(embeddedMap()))
      }
    ]
  });
  const published = await publishTiledMapBundle({ assetRoot, bundle });
  const assets = await listTiledMapAssets(assetRoot);
  const conflicts = await getTiledMapNameConflicts(
    assetRoot,
    [bundle]
  );
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].name, "courtyard");
  await assert.rejects(
    () => publishTiledMapBundle({ assetRoot, bundle }),
    (error) => error.code === "TILED_NAME_CONFLICT"
  );
  const overwritten = await publishTiledMapBundle({
    assetRoot,
    bundle,
    overwrite: true
  });
  assert.equal(overwritten.id, published.id);
  assert.equal((await listTiledMapAssets(assetRoot)).length, 1);
  assert.equal(assets[0].id, published.id);

  const copied = await copyTiledMapAsset(assetRoot, {
    assetId: published.id
  });
  assert.notEqual(copied.id, published.id);
  assert.equal(copied.name, "courtyard");
  assert.equal((await listTiledMapAssets(assetRoot)).length, 2);
  await deleteTiledMapAsset(assetRoot, copied.id);

  await renameTiledMapAsset(assetRoot, {
    assetId: published.id,
    newName: "courtyard-renamed"
  });
  const [renamedAsset] = await listTiledMapAssets(assetRoot);
  assert.equal(renamedAsset.name, "courtyard-renamed");
  assert.equal(renamedAsset.fileName, "courtyard-renamed.json");
  assert.equal(renamedAsset.sourceFile, "project/courtyard.json");

  const backgroundMap = await importTiledMapToGame({
    assetRoot,
    gameRoot,
    assetId: published.id,
    revision: "2026-10-21T01:02:03.000Z"
  });
  assert.match(
    backgroundMap.mapPath,
    /^assets\/map\/tiled\/.+\/map\.json$/
  );
  assert.equal(backgroundMap.type, "tiled");
  assert.equal(backgroundMap.x, undefined);
  assert.equal(backgroundMap.y, undefined);
  assert.equal(backgroundMap.collisions.length, 3);
  assert.equal(
    JSON.parse(
      await readFile(
        join(gameRoot, ...backgroundMap.mapPath.split("/")),
        "utf8"
      )
    ).width,
    2
  );
  await deleteTiledMapAsset(assetRoot, overwritten.id);
  assert.equal((await listTiledMapAssets(assetRoot)).length, 0);
});

test("Tiled import rejects traversal, missing dependencies and infinite maps", () => {
  assert.throws(
    () =>
      buildTiledMapBundle({
        mapPath: "../escape.json",
        files: []
      }),
    /不能越过/
  );
  assert.throws(
    () =>
      buildTiledMapBundle({
        mapPath: "map.tmj",
        files: [
          {
            path: "map.tmj",
            content: Buffer.from(JSON.stringify(externalTsxMap()))
          }
        ]
      }),
    /依赖文件不存在/
  );
  assert.throws(
    () =>
      buildTiledMapBundle({
        mapPath: "map.json",
        files: [
          {
            path: "map.json",
            content: Buffer.from(
              JSON.stringify({
                ...embeddedMap(),
                infinite: true
              })
            )
          }
        ]
      }),
    /暂不支持 infinite/
  );
});
