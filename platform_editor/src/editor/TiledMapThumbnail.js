import { loadAssetImage } from "./AssetThumbnail.js";

const MAX_PREVIEW_SIZE = 512;
const imageCache = new Map();

function loadImage(url) {
  if (!imageCache.has(url)) {
    imageCache.set(
      url,
      loadAssetImage(url).catch((error) => {
        imageCache.delete(url);
        throw error;
      })
    );
  }
  return imageCache.get(url);
}

function findTileset(tilesets, gid) {
  let matched = null;
  for (const tileset of tilesets) {
    if (tileset.firstGid <= gid) {
      matched = tileset;
    } else {
      break;
    }
  }
  return matched;
}

function drawTile(
  context,
  image,
  tileset,
  gid,
  x,
  y,
  width,
  height
) {
  const baseGid = gid & 0x1fffffff;
  const tileId = baseGid - tileset.firstGid;
  const column = tileId % tileset.columns;
  const row = Math.floor(tileId / tileset.columns);
  const sourceX =
    tileset.margin + column * (tileset.tileWidth + tileset.spacing);
  const sourceY =
    tileset.margin + row * (tileset.tileHeight + tileset.spacing);
  const flipX = Boolean(gid & 0x80000000);
  const flipY = Boolean(gid & 0x40000000);
  const flipDiagonal = Boolean(gid & 0x20000000);

  context.save();
  context.translate(x + width / 2, y + height / 2);
  if (flipDiagonal) {
    context.rotate(Math.PI / 2);
  }
  context.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  context.drawImage(
    image,
    sourceX,
    sourceY,
    tileset.tileWidth,
    tileset.tileHeight,
    -width / 2,
    -height / 2,
    width,
    height
  );
  context.restore();
}

/**
 * 将 Tiled 地图合成到素材卡片 canvas。
 */
export class TiledMapThumbnail {
  constructor(canvas, asset, { maxSize = MAX_PREVIEW_SIZE } = {}) {
    this.canvas = canvas;
    this.asset = asset;
    this.maxSize = Math.max(
      1,
      Number(maxSize) || MAX_PREVIEW_SIZE
    );
  }

  async start() {
    const [map, ...tilesetImages] = await Promise.all([
      fetch(this.asset.mapUrl, { cache: "no-store" }).then(
        (response) => {
          if (!response.ok) {
            throw new Error(`地图读取失败：${response.status}`);
          }
          return response.json();
        }
      ),
      ...this.asset.tilesets.map((tileset) =>
        loadImage(tileset.url)
      )
    ]);
    const imagesByFirstGid = new Map(
      this.asset.tilesets.map((tileset, index) => [
        tileset.firstGid,
        tilesetImages[index]
      ])
    );
    const tilesets = [...this.asset.tilesets].sort(
      (left, right) => left.firstGid - right.firstGid
    );
    const sourceWidth = map.width * map.tilewidth;
    const sourceHeight = map.height * map.tileheight;
    const scale = Math.min(
      1,
      this.maxSize / Math.max(sourceWidth, sourceHeight)
    );
    this.canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    this.canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const context = this.canvas.getContext("2d");
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    context.setTransform(scale, 0, 0, scale, 0, 0);

    for (const layer of map.layers ?? []) {
      if (layer.visible === false) {
        continue;
      }
      context.globalAlpha =
        Number.isFinite(Number(layer.opacity))
          ? Number(layer.opacity)
          : 1;
      if (layer.type === "tilelayer") {
        const layerX = Number(layer.x) || 0;
        const layerY = Number(layer.y) || 0;
        for (let index = 0; index < layer.data.length; index += 1) {
          const gid = layer.data[index];
          if (!gid) {
            continue;
          }
          const tileset = findTileset(
            tilesets,
            gid & 0x1fffffff
          );
          const image = tileset
            ? imagesByFirstGid.get(tileset.firstGid)
            : null;
          if (!tileset || !image) {
            continue;
          }
          drawTile(
            context,
            image,
            tileset,
            gid,
            layerX + (index % map.width) * map.tilewidth,
            layerY +
              Math.floor(index / map.width) * map.tileheight,
            map.tilewidth,
            map.tileheight
          );
        }
      } else if (layer.type === "objectgroup") {
        const layerX = Number(layer.x) || 0;
        const layerY = Number(layer.y) || 0;
        for (const object of layer.objects ?? []) {
          if (!object.gid) {
            continue;
          }
          const tileset = findTileset(
            tilesets,
            object.gid & 0x1fffffff
          );
          const image = tileset
            ? imagesByFirstGid.get(tileset.firstGid)
            : null;
          if (!tileset || !image) {
            continue;
          }
          const width = Number(object.width) || tileset.tileWidth;
          const height = Number(object.height) || tileset.tileHeight;
          drawTile(
            context,
            image,
            tileset,
            object.gid,
            layerX + (Number(object.x) || 0),
            layerY + (Number(object.y) || 0) - height,
            width,
            height
          );
        }
      }
    }
    context.globalAlpha = 1;
    this.canvas.dataset.previewReady = "true";
  }
}
