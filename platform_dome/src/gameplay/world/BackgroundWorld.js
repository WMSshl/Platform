import { DepthLayers } from "../../constants/DepthLayers.js";
import {
  getTiledBackgroundBounds,
  getTiledBackgroundCollisionRects,
  getUniqueTiledTilesetNames,
  TiledTileAnimations
} from "../../contract/index.js";
import {
  getLevelBackground,
  getLevelBackgroundMapKey,
  getLevelBackgroundMapTilesetKey,
  getLevelBackgroundTextureKey
} from "../../data/levels/LevelPresentation.js";

/**
 * 关卡背景的统一运行时边界。
 *
 * GameWorld 只接收“背景显示对象”和“背景碰撞矩形”，不再关心
 * 当前背景是单图还是 Tiled 地图。
 */
export class BackgroundWorld {
  constructor(scene, level) {
    this.scene = scene;
    this.level = level;
    this.background = getLevelBackground(level);
    this.tileAnimations = null;
  }

  createDisplayObjects() {
    if (this.background?.type === "image") {
      return {
        image: this.createImage(),
        tileLayers: []
      };
    }
    if (this.background?.type === "tiled") {
      return {
        image: null,
        tileLayers: this.createTileLayers()
      };
    }
    return { image: null, tileLayers: [] };
  }

  getCollisionRects() {
    if (this.background?.type !== "tiled") {
      return [];
    }
    return getTiledBackgroundCollisionRects(this.background, {
      worldWidth: this.level.world.width,
      worldHeight: this.level.world.height
    });
  }

  createImage() {
    const textureKey = getLevelBackgroundTextureKey(
      this.level.id,
      this.background
    );
    if (!this.scene.textures.exists(textureKey)) {
      throw new Error(
        `关卡背景纹理未加载：${this.background.path}`
      );
    }
    return this.scene.add
      .image(0, 0, textureKey)
      .setOrigin(0)
      .setDisplaySize(
        this.level.world.width,
        this.level.world.height
      )
      .setDepth(DepthLayers.BACKGROUND);
  }

  createTileLayers() {
    const background = this.background;
    const mapKey = getLevelBackgroundMapKey(
      this.level.id,
      background
    );
    if (!this.scene.cache.tilemap.exists(mapKey)) {
      throw new Error(
        `关卡 Tiled 背景数据未加载：${background.mapPath}`
      );
    }
    const tilemap = this.scene.make.tilemap({ key: mapKey });
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
      const textureKey = getLevelBackgroundMapTilesetKey(
        this.level.id,
        background,
        tileset
      );
      if (!this.scene.textures.exists(textureKey)) {
        throw new Error(
          `关卡背景 tileset 纹理未加载：${tileset.imagePath}`
        );
      }
      const runtimeTileset = runtimeTilesets.get(
        tileset.firstGid
      );
      if (runtimeTileset) {
        runtimeTileset.name = tilesetNames[index];
      }
      return tilemap.addTilesetImage(
        tilesetNames[index],
        textureKey,
        tileset.tileWidth,
        tileset.tileHeight,
        tileset.margin,
        tileset.spacing,
        tileset.firstGid
      );
    });
    if (tilesets.some((tileset) => !tileset)) {
      throw new Error("关卡背景 tileset 无法绑定");
    }

    const bounds = getTiledBackgroundBounds(background, {
      worldWidth: this.level.world.width,
      worldHeight: this.level.world.height
    });
    if (!bounds) {
      throw new Error("Tiled 背景尺寸无效");
    }
    const layers = [];
    for (let index = 0; index < tilemap.layers.length; index += 1) {
      const layer = tilemap.createLayer(index, tilesets, 0, 0);
      if (!layer) {
        continue;
      }
      layer
        .setPosition(bounds.left, bounds.top)
        .setScale(
          bounds.width / background.sourceWidth,
          bounds.height / background.sourceHeight
        )
        .setDepth(DepthLayers.BACKGROUND + index * 0.001);
      layers.push(layer);
    }
    if (layers.length === 0) {
      throw new Error("Tiled 背景没有可显示瓦片图层");
    }
    this.tileAnimations = new TiledTileAnimations(
      background.tilesets,
      layers,
      this.scene.time.now
    );
    return layers;
  }

  update(now) {
    this.tileAnimations?.update(now);
  }
}
