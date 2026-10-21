const EPSILON = 0.0001;

function positiveNumber(value, fallback = 1) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0
    ? number
    : fallback;
}

function sameNumber(left, right) {
  return Math.abs(left - right) <= EPSILON;
}

function clipRect(rect, worldWidth, worldHeight) {
  const left = Math.max(0, rect.left);
  const top = Math.max(0, rect.top);
  const right = Math.min(worldWidth, rect.right);
  const bottom = Math.min(worldHeight, rect.bottom);
  if (right - left <= EPSILON || bottom - top <= EPSILON) {
    return null;
  }
  return {
    ...rect,
    left,
    top,
    right,
    bottom
  };
}

function mergeHorizontal(rectangles) {
  const sorted = [...rectangles].sort(
    (left, right) =>
      left.terrainType.localeCompare(right.terrainType) ||
      left.top - right.top ||
      left.bottom - right.bottom ||
      left.left - right.left
  );
  const merged = [];

  for (const rectangle of sorted) {
    const previous = merged.at(-1);
    if (
      previous &&
      previous.terrainType === rectangle.terrainType &&
      sameNumber(previous.top, rectangle.top) &&
      sameNumber(previous.bottom, rectangle.bottom) &&
      sameNumber(previous.right, rectangle.left)
    ) {
      previous.right = rectangle.right;
      continue;
    }
    merged.push({ ...rectangle });
  }

  return merged;
}

function mergeVertical(rectangles) {
  const sorted = [...rectangles].sort(
    (left, right) =>
      left.terrainType.localeCompare(right.terrainType) ||
      left.left - right.left ||
      left.right - right.right ||
      left.top - right.top
  );
  const merged = [];

  for (const rectangle of sorted) {
    const previous = merged.at(-1);
    if (
      previous &&
      previous.terrainType === rectangle.terrainType &&
      sameNumber(previous.left, rectangle.left) &&
      sameNumber(previous.right, rectangle.right) &&
      sameNumber(previous.bottom, rectangle.top)
    ) {
      previous.bottom = rectangle.bottom;
      continue;
    }
    merged.push({ ...rectangle });
  }

  return merged;
}

function toContractRectangles(rectangles) {
  return rectangles.map((rectangle, index) => {
    const width = rectangle.right - rectangle.left;
    const height = rectangle.bottom - rectangle.top;
    return {
      id: `tilemap-collision-merged-${index + 1}`,
      x: rectangle.left + width / 2,
      y: rectangle.top + height / 2,
      width,
      height,
      terrainType: rectangle.terrainType
    };
  });
}

export function getUniqueTiledTilesetNames(tilesets) {
  const used = new Set();
  return tilesets.map((tileset, index) => {
    const baseName =
      String(tileset?.name ?? `tileset-${index + 1}`).trim() ||
      `tileset-${index + 1}`;
    let name = baseName;
    let suffix = 2;
    while (used.has(name.toLowerCase())) {
      name = `${baseName}-${suffix}`;
      suffix += 1;
    }
    used.add(name.toLowerCase());
    return name;
  });
}

function buildAnimationDefinitions(tilesets) {
  const definitions = new Map();
  for (const tileset of tilesets ?? []) {
    for (const animation of tileset.animations ?? []) {
      const sourceGid =
        Number(tileset.firstGid) + Number(animation.tileId);
      const frames = animation.frames
        .map((frame) => ({
          gid:
            Number(tileset.firstGid) + Number(frame.tileId),
          duration: Number(frame.duration)
        }))
        .filter((frame) => frame.gid >= 0 && frame.duration > 0);
      if (frames.length > 0) {
        definitions.set(sourceGid, frames);
      }
    }
  }
  return definitions;
}

/**
 * 轻量 Tiled 动画瓦片控制器。
 *
 * Phaser 3 的 Tilemap 不自动驱动 Tiled tile animation。这里只修改
 * Tile.index，保留原始翻转位，不进入游戏每帧的临时对象分配路径。
 */
export class TiledTileAnimations {
  constructor(tilesets, layers, now = 0) {
    this.entries = [];
    this.definitions = buildAnimationDefinitions(tilesets);
    for (const layer of layers) {
      const data = layer?.layer?.data ?? [];
      for (const row of data) {
        for (const tile of row ?? []) {
          if (!tile || !tile.index) {
            continue;
          }
          const rawIndex = Number(tile.index) >>> 0;
          const gid = rawIndex & 0x1fffffff;
          const frames = this.definitions.get(gid);
          if (!frames) {
            continue;
          }
          this.entries.push({
            tile,
            frames,
            flipBits: rawIndex & 0xe0000000,
            frameIndex: -1,
            nextAt: now + frames[0].duration
          });
        }
      }
    }
  }

  update(now) {
    for (const entry of this.entries) {
      if (now < entry.nextAt) {
        continue;
      }
      entry.frameIndex =
        (entry.frameIndex + 1) % entry.frames.length;
      const frame = entry.frames[entry.frameIndex];
      entry.tile.index =
        (entry.flipBits | frame.gid) >>> 0;
      entry.nextAt = now + frame.duration;
    }
  }
}

export function getTiledBackgroundBounds(
  background,
  { worldWidth, worldHeight } = {}
) {
  if (background?.type !== "tiled") {
    return null;
  }
  const sourceWidth = positiveNumber(
    background.sourceWidth,
    0
  );
  const sourceHeight = positiveNumber(
    background.sourceHeight,
    0
  );
  if (!sourceWidth || !sourceHeight) {
    return null;
  }
  const width = positiveNumber(worldWidth, sourceWidth);
  const height = positiveNumber(worldHeight, sourceHeight);
  const x = width / 2;
  const y = height / 2;
  return {
    x,
    y,
    width,
    height,
    left: x - width / 2,
    top: y - height / 2,
    right: x + width / 2,
    bottom: y + height / 2
  };
}

/**
 * 将 Tiled 背景的局部碰撞矩形转换到世界坐标。
 *
 * 局部坐标以地图左上角为原点，碰撞 x/y 是矩形中心。
 * 返回前会裁掉世界外部分，并合并同类型相邻矩形，减少
 * Arcade Physics 的静态体数量。
 */
export function getTiledBackgroundCollisionRects(
  background,
  {
    worldWidth,
    worldHeight,
    clipToWorld = true
  } = {}
) {
  if (background?.type !== "tiled" || !Array.isArray(background.collisions)) {
    return [];
  }
  const mapWidth = positiveNumber(background.sourceWidth, 0);
  const mapHeight = positiveNumber(background.sourceHeight, 0);
  if (!mapWidth || !mapHeight) {
    return [];
  }
  const safeWorldWidth = positiveNumber(worldWidth, Number.NaN);
  const safeWorldHeight = positiveNumber(worldHeight, Number.NaN);
  const mapBounds = getTiledBackgroundBounds(background, {
    worldWidth: safeWorldWidth,
    worldHeight: safeWorldHeight
  });
  if (!mapBounds) {
    return [];
  }
  const scaleX = mapBounds.width / mapWidth;
  const scaleY = mapBounds.height / mapHeight;
  const canClip =
    clipToWorld &&
    Number.isFinite(safeWorldWidth) &&
    Number.isFinite(safeWorldHeight);

  const transformed = [];
  for (const collision of background.collisions) {
    const width = Number(collision.width) * scaleX;
    const height = Number(collision.height) * scaleY;
    if (!(width > 0) || !(height > 0)) {
      continue;
    }
    const centerX =
      mapBounds.left +
      Number(collision.x) * scaleX;
    const centerY =
      mapBounds.top +
      Number(collision.y) * scaleY;
    let rectangle = {
      left: centerX - width / 2,
      top: centerY - height / 2,
      right: centerX + width / 2,
      bottom: centerY + height / 2,
      terrainType:
        collision.terrainType === "platform"
          ? "platform"
          : "ground"
    };
    if (canClip) {
      rectangle = clipRect(
        rectangle,
        safeWorldWidth,
        safeWorldHeight
      );
    }
    if (rectangle) {
      transformed.push(rectangle);
    }
  }

  return toContractRectangles(
    mergeVertical(mergeHorizontal(transformed))
  );
}
