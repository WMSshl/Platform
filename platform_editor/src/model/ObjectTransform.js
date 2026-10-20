const MIN_OBJECT_SIZE = 8;
const MIN_WORLD_WIDTH = 320;
const MIN_WORLD_HEIGHT = 240;
const CORNER_HANDLES = Object.freeze([
  { name: "nw", dx: -1, dy: -1 },
  { name: "ne", dx: 1, dy: -1 },
  { name: "se", dx: 1, dy: 1 },
  { name: "sw", dx: -1, dy: 1 }
]);
const EDGE_HANDLES = Object.freeze([
  { name: "n", dx: 0, dy: -1 },
  { name: "e", dx: 1, dy: 0 },
  { name: "s", dx: 0, dy: 1 },
  { name: "w", dx: -1, dy: 0 }
]);

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clampPositive(value) {
  return Math.max(MIN_OBJECT_SIZE, Math.round(value));
}

function getActorSize(object, catalogs) {
  const appearance =
    catalogs?.actors?.[object?.actorId]?.appearance ?? {};
  const legacyScale = Math.max(
    0.01,
    finiteNumber(object?.scale, 1)
  );
  const scaleX = Math.max(
    0.01,
    finiteNumber(object?.scaleX, legacyScale)
  );
  const scaleY = Math.max(
    0.01,
    finiteNumber(object?.scaleY, legacyScale)
  );
  const baseScale = Math.max(
    0.01,
    finiteNumber(appearance.spriteScale, 1)
  );
  return {
    width: Math.max(
      MIN_OBJECT_SIZE,
      finiteNumber(appearance.width, 44) * baseScale * scaleX
    ),
    height: Math.max(
      MIN_OBJECT_SIZE,
      finiteNumber(appearance.height, 72) * baseScale * scaleY
    )
  };
}

function getItemSize(object, catalogs) {
  const appearance =
    catalogs?.items?.[object?.itemId]?.appearance ?? {};
  return {
    width: Math.max(
      MIN_OBJECT_SIZE,
      finiteNumber(object?.width, finiteNumber(appearance.width, 26))
    ),
    height: Math.max(
      MIN_OBJECT_SIZE,
      finiteNumber(object?.height, finiteNumber(appearance.height, 26))
    )
  };
}

export function getObjectDisplaySize(section, object, catalogs = {}) {
  if (!object || !Number.isFinite(Number(object.x))) {
    return null;
  }
  if (section === "actors") {
    return getActorSize(object, catalogs);
  }
  if (section === "items") {
    return getItemSize(object, catalogs);
  }
  if (section === "solids" || section === "mechanisms") {
    return {
      width: Math.max(
        MIN_OBJECT_SIZE,
        finiteNumber(object.width, MIN_OBJECT_SIZE)
      ),
      height: Math.max(
        MIN_OBJECT_SIZE,
        finiteNumber(object.height, MIN_OBJECT_SIZE)
      )
    };
  }
  return null;
}

export function getObjectVisualBounds(
  section,
  object,
  catalogs = {}
) {
  if (!object || !Number.isFinite(Number(object.y))) {
    return null;
  }
  const size = getObjectDisplaySize(section, object, catalogs);
  if (!size) {
    return null;
  }
  const x = Number(object.x);
  const y = Number(object.y);
  return {
    left: x - size.width / 2,
    top: y - size.height / 2,
    right: x + size.width / 2,
    bottom: y + size.height / 2,
    width: size.width,
    height: size.height,
    x,
    y
  };
}

export function getResizePolicy() {
  return {
    uniformOnly: false,
    handles: [...CORNER_HANDLES, ...EDGE_HANDLES]
  };
}

export function getResizeCursor(handle) {
  if (!handle) {
    return "default";
  }
  if (handle.dx !== 0 && handle.dy !== 0) {
    return handle.dx === handle.dy
      ? "nwse-resize"
      : "nesw-resize";
  }
  return handle.dy !== 0 ? "ns-resize" : "ew-resize";
}

export function resizeObject(
  section,
  object,
  handle,
  point,
  bounds,
  catalogs = {}
) {
  if (!object || !handle || !bounds) {
    return null;
  }

  const dx = Math.sign(handle.dx);
  const dy = Math.sign(handle.dy);
  const uniform =
    (dx !== 0 && dy !== 0) ||
    getResizePolicy(section, object).uniformOnly;
  const anchorX = dx > 0 ? bounds.left : bounds.right;
  const anchorY = dy > 0 ? bounds.top : bounds.bottom;
  let nextWidth = bounds.width;
  let nextHeight = bounds.height;
  let centerX = bounds.x;
  let centerY = bounds.y;

  if (uniform) {
    const scale = Math.max(
      Math.abs(point.x - anchorX) / bounds.width,
      Math.abs(point.y - anchorY) / bounds.height,
      MIN_OBJECT_SIZE / bounds.width,
      MIN_OBJECT_SIZE / bounds.height
    );
    nextWidth = clampPositive(bounds.width * scale);
    nextHeight = clampPositive(bounds.height * scale);
    centerX = anchorX + dx * nextWidth / 2;
    centerY = anchorY + dy * nextHeight / 2;
  } else if (dx !== 0) {
    nextWidth = clampPositive(Math.abs(point.x - anchorX));
    centerX = anchorX + dx * nextWidth / 2;
  } else if (dy !== 0) {
    nextHeight = clampPositive(Math.abs(point.y - anchorY));
    centerY = anchorY + dy * nextHeight / 2;
  }

  const result = {
    x: Math.round(centerX),
    y: Math.round(centerY)
  };

  if (section === "actors") {
    const appearance =
      catalogs?.actors?.[object.actorId]?.appearance ?? {};
    const baseScale = Math.max(
      0.01,
      finiteNumber(appearance.spriteScale, 1)
    );
    const baseWidth = Math.max(
      MIN_OBJECT_SIZE,
      finiteNumber(appearance.width, 44) * baseScale
    );
    const baseHeight = Math.max(
      MIN_OBJECT_SIZE,
      finiteNumber(appearance.height, 72) * baseScale
    );
    result.scaleX = Number(
      Math.max(0.05, nextWidth / baseWidth).toFixed(3)
    );
    result.scaleY = Number(
      Math.max(0.05, nextHeight / baseHeight).toFixed(3)
    );
    return result;
  }

  result.width = nextWidth;
  result.height = nextHeight;
  return result;
}

export function resizeWorldBounds(world, handle, point) {
  if (!world || !handle) {
    return null;
  }
  const width = Math.max(
    MIN_WORLD_WIDTH,
    finiteNumber(world.width, MIN_WORLD_WIDTH)
  );
  const height = Math.max(
    MIN_WORLD_HEIGHT,
    finiteNumber(world.height, MIN_WORLD_HEIGHT)
  );
  const dx = Math.sign(handle.dx);
  const dy = Math.sign(handle.dy);
  const uniform = dx !== 0 && dy !== 0;
  const anchorX = dx > 0 ? 0 : width;
  const anchorY = dy > 0 ? 0 : height;
  let nextWidth = width;
  let nextHeight = height;

  if (uniform) {
    const scale = Math.max(
      Math.abs(point.x - anchorX) / width,
      Math.abs(point.y - anchorY) / height,
      MIN_WORLD_WIDTH / width,
      MIN_WORLD_HEIGHT / height
    );
    nextWidth = Math.round(width * scale);
    nextHeight = Math.round(height * scale);
  } else if (dx !== 0) {
    nextWidth = Math.round(
      Math.abs(point.x - anchorX)
    );
  } else if (dy !== 0) {
    nextHeight = Math.round(
      Math.abs(point.y - anchorY)
    );
  }

  nextWidth = Math.max(MIN_WORLD_WIDTH, nextWidth);
  nextHeight = Math.max(MIN_WORLD_HEIGHT, nextHeight);
  return {
    width: nextWidth,
    height: nextHeight,
    shiftX: dx < 0 ? nextWidth - width : 0,
    shiftY: dy < 0 ? nextHeight - height : 0
  };
}

export function applyWorldResize(
  level,
  result,
  { baseLevel = level } = {}
) {
  if (!level?.world || !result) {
    return false;
  }
  level.world.width = result.width;
  level.world.height = result.height;
  if (!result.shiftX && !result.shiftY) {
    return true;
  }

  for (const section of [
    "spawnPoints",
    "solids",
    "actors",
    "items",
    "mechanisms"
  ]) {
    const objects = level[section] ?? [];
    const sourceObjects = baseLevel[section] ?? objects;
    objects.forEach((object, index) => {
      const source = sourceObjects[index] ?? object;
      if (Number.isFinite(Number(source.x))) {
        object.x = Math.round(
          Number(source.x) + result.shiftX
        );
      }
      if (Number.isFinite(Number(source.y))) {
        object.y = Math.round(
          Number(source.y) + result.shiftY
        );
      }
    });
  }
  return true;
}
