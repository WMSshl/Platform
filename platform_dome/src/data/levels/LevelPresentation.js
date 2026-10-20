function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0
    ? number
    : fallback;
}

/**
 * 关卡表现数据解析。
 *
 * 编辑器写入的视觉字段统一在这里解释，GameWorld 和 PreloadScene
 * 不直接猜测 JSON 字段，后续扩展更多表现属性时只需修改本模块。
 */
export function getLevelBackgroundAsset(level) {
  const asset = level?.world?.backgroundAsset;
  if (!asset || typeof asset.path !== "string" || !asset.path) {
    return null;
  }
  return {
    id: typeof asset.id === "string" ? asset.id : asset.path,
    path: asset.path.replace(/^\/+/, ""),
    revision:
      typeof asset.revision === "string" ? asset.revision : "",
    fit: asset.fit === "stretch" ? "stretch" : "stretch"
  };
}

export function getLevelBackgroundTextureKey(levelId, asset) {
  return `level-background:${levelId}:${asset.revision || asset.path}`;
}

export function getLevelBackgroundUrl(asset) {
  const encodedPath = asset.path
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const revision = asset.revision
    ? `?v=${encodeURIComponent(asset.revision)}`
    : "";
  return `${encodedPath}${revision}`;
}

export function getActorInstanceScale(actorSpawn) {
  const legacyScale = positiveNumber(actorSpawn?.scale, 1);
  return {
    x: positiveNumber(actorSpawn?.scaleX, legacyScale),
    y: positiveNumber(actorSpawn?.scaleY, legacyScale)
  };
}

export function getPickupDisplaySize(mapItem, definition) {
  const appearance = definition?.appearance ?? {};
  return {
    width: positiveNumber(mapItem?.width, appearance.width ?? 26),
    height: positiveNumber(mapItem?.height, appearance.height ?? 26)
  };
}

export function getSolidTerrainType(solid) {
  return solid?.terrainType === "platform" ? "platform" : "ground";
}
