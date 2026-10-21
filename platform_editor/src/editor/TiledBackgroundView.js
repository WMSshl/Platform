import {
  getTiledBackgroundBounds,
  getTiledBackgroundCollisionRects,
  getUniqueTiledTilesetNames,
  TiledTileAnimations
} from "../contract/index.js";

const Phaser = globalThis.Phaser;

function assetUrl(path, revision = "") {
  const encodedPath = String(path ?? "")
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const version = revision
    ? `?v=${encodeURIComponent(revision)}`
    : "";
  return `/game/${encodedPath}${version}`;
}

function mapKey(background) {
  return `editor-background-map:${background.id}:${background.revision}`;
}

function tilesetKey(background, tileset) {
  return `editor-background-tileset:${background.id}:${
    background.revision
  }:${tileset.firstGid}`;
}

/**
 * 编辑器中的 Tiled 背景视图。
 *
 * 只负责 Phaser 资源加载、显示和碰撞覆盖层，不参与关卡文档修改。
 */
export class TiledBackgroundView {
  constructor(scene, onReady) {
    this.scene = scene;
    this.onReady = onReady;
    this.layers = [];
    this.currentKey = "";
    this.maskShape = null;
    this.mask = null;
    this.tileAnimations = null;
    this.requests = new Set();
    this.errors = new Set();
  }

  draw(background, world) {
    const key = mapKey(background);
    if (key !== this.currentKey && this.layers.length > 0) {
      this.destroyLayers();
    }
    this.currentKey = key;

    if (
      !this.scene.cache.tilemap.exists(key) ||
      background.tilesets.some(
        (tileset) =>
          !this.scene.textures.exists(
            tilesetKey(background, tileset)
          )
      )
    ) {
      this.load(background, key);
      this.hide();
      return;
    }
    if (this.layers.length === 0) {
      this.createLayers(background, key);
    }
    this.position(background, world);
  }

  hide() {
    for (const layer of this.layers) {
      layer.setVisible(false);
    }
  }

  update(now) {
    this.tileAnimations?.update(now);
  }

  drawCollisions(graphics, world) {
    const background = world.background;
    if (background?.type !== "tiled") {
      return;
    }
    const camera = this.scene.cameras.main;
    const collisions = getTiledBackgroundCollisionRects(
      background,
      {
        worldWidth: world.width,
        worldHeight: world.height
      }
    );
    for (const collision of collisions) {
      const left = collision.x - collision.width / 2;
      const top = collision.y - collision.height / 2;
      const color =
        collision.terrainType === "platform"
          ? 0xbbf7d0
          : 0x86efac;
      graphics.fillStyle(color, 0.16);
      graphics.fillRect(
        left,
        top,
        collision.width,
        collision.height
      );
      graphics.lineStyle(1.5 / camera.zoom, color, 0.72);
      graphics.strokeRect(
        left,
        top,
        collision.width,
        collision.height
      );
    }
  }

  load(background, key) {
    if (this.requests.has(key) || this.errors.has(key)) {
      return;
    }
    this.requests.add(key);
    for (const tileset of background.tilesets) {
      const keyForTileset = tilesetKey(background, tileset);
      if (!this.scene.textures.exists(keyForTileset)) {
        this.scene.load.image(
          keyForTileset,
          assetUrl(tileset.imagePath, background.revision)
        );
      }
    }
    this.scene.load.tilemapTiledJSON(
      key,
      assetUrl(background.mapPath, background.revision)
    );
    this.scene.load.once(Phaser.Loader.Events.COMPLETE, () => {
      this.requests.delete(key);
      this.onReady?.();
    });
    this.scene.load.once(
      Phaser.Loader.Events.FILE_LOAD_ERROR,
      (file) => {
        if (
          file.key === key ||
          file.key.startsWith(
            `editor-background-tileset:${background.id}:`
          )
        ) {
          this.errors.add(key);
          this.requests.delete(key);
        }
      }
    );
    this.scene.load.start();
  }

  createLayers(background, key) {
    try {
      const tilemap = this.scene.make.tilemap({ key });
      const tilesetNames = getUniqueTiledTilesetNames(
        background.tilesets
      );
      const runtimeTilesets = new Map(
        tilemap.tilesets.map((tileset) => [
          tileset.firstgid,
          tileset
        ])
      );
      const tilesets = background.tilesets.map((tileset, index) => {
        const runtimeTileset = runtimeTilesets.get(
          tileset.firstGid
        );
        if (runtimeTileset) {
          runtimeTileset.name = tilesetNames[index];
        }
        return tilemap.addTilesetImage(
          tilesetNames[index],
          tilesetKey(background, tileset),
          tileset.tileWidth,
          tileset.tileHeight,
          tileset.margin,
          tileset.spacing,
          tileset.firstGid
        );
      });
      if (tilesets.some((tileset) => !tileset)) {
        throw new Error("Tiled tileset 纹理无法绑定");
      }
      for (let index = 0; index < tilemap.layers.length; index += 1) {
        const layer = tilemap.createLayer(index, tilesets, 0, 0);
        if (layer) {
          layer
            .setDepth(0.35 + index * 0.001)
            .setName(`Tiled 背景图层 ${index + 1}`);
          this.layers.push(layer);
        }
      }
      if (this.layers.length === 0) {
        throw new Error("Tiled 地图没有可显示瓦片图层");
      }
      this.tileAnimations = new TiledTileAnimations(
        background.tilesets,
        this.layers,
        this.scene.time.now
      );
    } catch (error) {
      this.errors.add(key);
      console.warn("Tiled 背景地图加载失败", error);
    }
  }

  position(background, world) {
    const bounds = getTiledBackgroundBounds(background, {
      worldWidth: world.width,
      worldHeight: world.height
    });
    if (!bounds) {
      return;
    }
    if (!this.maskShape) {
      this.maskShape = this.scene.make.graphics({ add: false });
      this.mask = this.maskShape.createGeometryMask();
    }
    this.maskShape
      .clear()
      .fillStyle(0xffffff, 1)
      .fillRect(0, 0, world.width, world.height);
    const scaleX = bounds.width / background.sourceWidth;
    const scaleY = bounds.height / background.sourceHeight;
    for (const layer of this.layers) {
      layer
        .setPosition(bounds.left, bounds.top)
        .setScale(scaleX, scaleY)
        .setMask(this.mask)
        .setVisible(true);
    }
  }

  destroyLayers() {
    for (const layer of this.layers) {
      layer.destroy();
    }
    this.layers = [];
    this.tileAnimations = null;
  }
}
