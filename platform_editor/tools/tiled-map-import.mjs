import {
  basename,
  extname,
  posix
} from "node:path";
import { XMLParser } from "fast-xml-parser";
import { AssetStorageError } from "./asset-storage.mjs";
import {
  getUniqueTiledTilesetNames
} from "../src/contract/index.js";

export const TILED_GROUP_SEGMENTS = ["map", "tiled"];
const MAP_EXTENSIONS = new Set([".json", ".tmj"]);
const IMAGE_EXTENSIONS = new Set([
  ".gif",
  ".jpeg",
  ".jpg",
  ".png",
  ".webp"
]);
const COLLISION_LAYER_PATTERN =
  /(?:^|[-_\s])(collision|collider|collides|solid|碰撞)(?:$|[-_\s])/i;
const XML_PARSER = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true
});

function asArray(value) {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function integer(value, fallback = 0) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? number : fallback;
}

function truthy(value) {
  if (typeof value === "boolean") {
    return value;
  }
  return /^(?:1|true|yes|on)$/i.test(String(value ?? "").trim());
}

function extensionOf(fileName) {
  return extname(String(fileName ?? "")).toLowerCase();
}

export function normalizeTiledAssetName(value) {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 100);
}

export function normalizeTiledFilePath(rawPath) {
  const value = String(rawPath ?? "")
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "");
  if (
    !value ||
    value.startsWith("/") ||
    value.includes("\0") ||
    /^[a-z]+:/i.test(value)
  ) {
    throw new AssetStorageError(400, "Tiled 文件路径不合法");
  }
  const normalized = posix.normalize(value);
  if (
    normalized === "." ||
    normalized.startsWith("../") ||
    normalized === ".." ||
    normalized.split("/").some((segment) => !segment || segment === ".")
  ) {
    throw new AssetStorageError(
      400,
      "Tiled 文件路径不能越过导入目录"
    );
  }
  return normalized;
}

function resolveTiledReference(reference, fromPath, filesByPath) {
  const normalizedReference = String(reference ?? "")
    .replaceAll("\\", "/");
  if (/^data:/i.test(normalizedReference)) {
    return { dataUri: normalizedReference };
  }
  const resolved = posix.normalize(
    posix.join(posix.dirname(fromPath), normalizedReference)
  );
  const file = filesByPath.get(resolved);
  if (!file) {
    throw new AssetStorageError(
      400,
      `Tiled 依赖文件不存在：${resolved}`
    );
  }
  return { file, path: resolved };
}

function decodeDataUri(dataUri) {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/is.exec(dataUri);
  if (!match) {
    throw new AssetStorageError(400, "Tiled 内嵌图片 data URI 无效");
  }
  const mimeType = match[1] || "application/octet-stream";
  const payload = match[2]
    ? Buffer.from(match[3], "base64")
    : Buffer.from(decodeURIComponent(match[3]), "utf8");
  const extension =
    {
      "image/gif": ".gif",
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "image/webp": ".webp"
    }[mimeType] ?? "";
  if (!IMAGE_EXTENSIONS.has(extension)) {
    throw new AssetStorageError(
      400,
      `Tiled 内嵌图片格式不受支持：${mimeType}`
    );
  }
  return { mimeType, extension, content: payload };
}

function parseXmlProperties(node) {
  const container = node?.properties;
  const properties = {};
  for (const property of asArray(container?.property)) {
    const name = property?.["@_name"];
    if (!name) {
      continue;
    }
    let value =
      property?.["@_value"] ??
      property?.["#text"] ??
      "";
    const type = property?.["@_type"] ?? "string";
    if (type === "bool") {
      value = truthy(value);
    } else if (type === "int" || type === "float") {
      value = Number(value);
    }
    properties[name] = value;
  }
  return properties;
}

function parseJsonProperties(properties) {
  const result = {};
  for (const property of asArray(properties)) {
    if (property?.name) {
      result[property.name] = property.value;
    }
  }
  return result;
}

function tiledPropertyType(value) {
  if (typeof value === "boolean") {
    return "bool";
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? "int" : "float";
  }
  return "string";
}

function toTiledProperties(properties) {
  return Object.entries(properties).map(([name, value]) => ({
    name,
    type: tiledPropertyType(value),
    value
  }));
}

function isOneWay(properties) {
  return (
    truthy(properties.oneWay) ||
    truthy(properties["one-way"]) ||
    truthy(properties.platform) ||
    String(properties.terrainType ?? "").toLowerCase() ===
      "platform"
  );
}

function terrainTypeFor(properties) {
  return isOneWay(properties) ? "platform" : "ground";
}

function isCollisionLayer(layer) {
  const properties = parseJsonProperties(layer?.properties);
  const className = layer?.class ?? layer?.type ?? "";
  return (
    truthy(properties.collides) ||
    truthy(properties.collision) ||
    truthy(properties.solid) ||
    /^(?:collision|collider|solid)$/i.test(String(className)) ||
    COLLISION_LAYER_PATTERN.test(String(layer?.name ?? ""))
  );
}

function objectIsCollision(object) {
  const className = object?.class ?? object?.type ?? "";
  const properties = parseJsonProperties(object?.properties);
  return (
    /^(?:collision|collider|solid)$/i.test(String(className)) ||
    truthy(properties.collides) ||
    truthy(properties.collision) ||
    truthy(properties.solid)
  );
}

function pointInPolygon(x, y, points) {
  let inside = false;
  for (
    let index = 0, previous = points.length - 1;
    index < points.length;
    previous = index, index += 1
  ) {
    const currentPoint = points[index];
    const previousPoint = points[previous];
    const intersects =
      currentPoint.y > y !== previousPoint.y > y &&
      x <
        ((previousPoint.x - currentPoint.x) *
          (y - currentPoint.y)) /
          (previousPoint.y - currentPoint.y) +
          currentPoint.x;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

function rasterizePolygon(
  polygon,
  objectX,
  objectY,
  cellWidth,
  cellHeight,
  terrainType
) {
  const minX = Math.min(...polygon.map((point) => point.x));
  const maxX = Math.max(...polygon.map((point) => point.x));
  const minY = Math.min(...polygon.map((point) => point.y));
  const maxY = Math.max(...polygon.map((point) => point.y));
  const rectangles = [];
  for (
    let row = Math.floor(minY / cellHeight);
    row < Math.ceil(maxY / cellHeight);
    row += 1
  ) {
    for (
      let column = Math.floor(minX / cellWidth);
      column < Math.ceil(maxX / cellWidth);
      column += 1
    ) {
      if (
        pointInPolygon(
          (column + 0.5) * cellWidth,
          (row + 0.5) * cellHeight,
          polygon
        )
      ) {
        rectangles.push({
          x: objectX + column * cellWidth + cellWidth / 2,
          y: objectY + row * cellHeight + cellHeight / 2,
          width: cellWidth,
          height: cellHeight,
          terrainType
        });
      }
    }
  }
  return rectangles;
}

function objectToCollisionRectangles(
  object,
  {
    offsetX = 0,
    offsetY = 0,
    cellWidth,
    cellHeight,
    terrainType
  }
) {
  const x = finiteNumber(object?.x) + offsetX;
  const y = finiteNumber(object?.y) + offsetY;
  const width = finiteNumber(object?.width);
  const height = finiteNumber(object?.height);
  if (object?.point) {
    return [];
  }
  if (Array.isArray(object?.polygon) && object.polygon.length >= 3) {
    return rasterizePolygon(
      object.polygon,
      x,
      y,
      cellWidth,
      cellHeight,
      terrainType
    );
  }
  if (Array.isArray(object?.polyline) && object.polyline.length > 0) {
    const xs = object.polyline.map((point) => finiteNumber(point.x));
    const ys = object.polyline.map((point) => finiteNumber(point.y));
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return [
      {
        x: x + (minX + maxX) / 2,
        y: y + (minY + maxY) / 2,
        width: Math.max(cellWidth, maxX - minX),
        height: Math.max(cellHeight, maxY - minY),
        terrainType
      }
    ];
  }
  if (object?.ellipse) {
    const columns = Math.max(1, Math.ceil(width / cellWidth));
    const rows = Math.max(1, Math.ceil(height / cellHeight));
    const rectangles = [];
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const sampleX = x + (column + 0.5) * (width / columns);
        const sampleY = y + (row + 0.5) * (height / rows);
        const normalizedX = (sampleX - centerX) / (width / 2);
        const normalizedY = (sampleY - centerY) / (height / 2);
        if (
          normalizedX * normalizedX +
            normalizedY * normalizedY <=
          1
        ) {
          rectangles.push({
            x: sampleX,
            y: sampleY,
            width: width / columns,
            height: height / rows,
            terrainType
          });
        }
      }
    }
    return rectangles;
  }
  if (!(width > 0) || !(height > 0)) {
    return [];
  }
  return [
    {
      x: x + width / 2,
      y: y + height / 2,
      width,
      height,
      terrainType
    }
  ];
}

function applyTileFlip(rectangles, tileX, tileY, tileWidth, tileHeight, gid) {
  const flipX = Boolean(gid & 0x80000000);
  const flipY = Boolean(gid & 0x40000000);
  const flipDiagonal = Boolean(gid & 0x20000000);
  return rectangles.map((rectangle) => {
    let x = rectangle.x;
    let y = rectangle.y;
    let width = rectangle.width;
    let height = rectangle.height;
    if (flipDiagonal) {
      [x, y] = [y, x];
      [width, height] = [height, width];
    }
    if (flipX) {
      x = tileWidth - x;
    }
    if (flipY) {
      y = tileHeight - y;
    }
    return {
      ...rectangle,
      x: tileX + x,
      y: tileY + y,
      width,
      height
    };
  });
}

function normalizeTileDefinitions(tile) {
  const properties = parseJsonProperties(tile.properties);
  const collisionObjects = asArray(tile.objectgroup?.objects);
  return {
    properties,
    collisionObjects,
    hasTileCollision:
      collisionObjects.length > 0 ||
      truthy(properties.collides) ||
      truthy(properties.solid) ||
      truthy(properties.collision)
  };
}

function normalizeTilesetAnimations(tiles) {
  return asArray(tiles)
    .filter(
      (tile) =>
        Number.isInteger(Number(tile?.id)) &&
        asArray(tile?.animation).length > 0
    )
    .map((tile) => ({
      tileId: Number(tile.id),
      frames: asArray(tile.animation)
        .map((frame) => ({
          tileId: integer(frame?.tileid, -1),
          duration: integer(frame?.duration)
        }))
        .filter(
          (frame) =>
            frame.tileId >= 0 && frame.duration > 0
        )
    }))
    .filter((animation) => animation.frames.length > 0);
}

function collectTilesetDefinitions(tileset) {
  const definitions = new Map();
  for (const tile of asArray(tileset.tiles)) {
    const id = integer(tile.id, -1);
    if (id >= 0) {
      definitions.set(id, normalizeTileDefinitions(tile));
    }
  }
  return definitions;
}

function xmlObjectToJson(object) {
  const parsePoints = (value) =>
    String(value ?? "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((pair) => {
        const [x, y] = pair.split(",").map(Number);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          throw new AssetStorageError(400, "TSX 碰撞点坐标无效");
        }
        return { x, y };
      });
  return {
    id: integer(object?.["@_id"]),
    name: String(object?.["@_name"] ?? ""),
    type: String(object?.["@_class"] ?? object?.["@_type"] ?? ""),
    x: finiteNumber(object?.["@_x"]),
    y: finiteNumber(object?.["@_y"]),
    width: finiteNumber(object?.["@_width"]),
    height: finiteNumber(object?.["@_height"]),
    rotation: finiteNumber(object?.["@_rotation"]),
    ...(object?.polygon
      ? { polygon: parsePoints(object.polygon["@_points"]) }
      : {}),
    ...(object?.polyline
      ? { polyline: parsePoints(object.polyline["@_points"]) }
      : {}),
    ...(object?.ellipse ? { ellipse: true } : {}),
    ...(object?.point ? { point: true } : {}),
    properties: toTiledProperties(parseXmlProperties(object))
  };
}

function parseTsx(file, firstGid) {
  let root;
  try {
    root = XML_PARSER.parse(file.content.toString("utf8"))?.tileset;
  } catch {
    throw new AssetStorageError(400, `TSX 解析失败：${file.path}`);
  }
  if (!root) {
    throw new AssetStorageError(400, `TSX 缺少 tileset 根节点：${file.path}`);
  }
  const image = asArray(root.image)[0];
  return {
    firstgid: firstGid,
    name: String(root["@_name"] ?? basename(file.path, ".tsx")),
    tilewidth: integer(root["@_tilewidth"]),
    tileheight: integer(root["@_tileheight"]),
    spacing: integer(root["@_spacing"]),
    margin: integer(root["@_margin"]),
    columns: integer(root["@_columns"]),
    tilecount: integer(root["@_tilecount"]),
    image: String(image?.["@_source"] ?? ""),
    imagewidth: integer(image?.["@_width"]),
    imageheight: integer(image?.["@_height"]),
    tiles: asArray(root.tile).map((tile) => ({
      id: integer(tile?.["@_id"]),
      properties: toTiledProperties(parseXmlProperties(tile)),
      ...(tile?.objectgroup
        ? {
            objectgroup: {
              objects: asArray(tile.objectgroup.object).map(
                xmlObjectToJson
              )
            }
          }
        : {}),
      ...(tile?.animation
        ? {
            animation: asArray(tile.animation.frame).map(
              (frame) => ({
                tileid: integer(frame?.["@_tileid"]),
                duration: integer(frame?.["@_duration"])
              })
            )
          }
        : {})
    }))
  };
}

function resolveTileset({
  tileset,
  mapPath,
  filesByPath,
  virtualFiles,
  index
}) {
  let resolvedTileset = tileset;
  let referenceBase = mapPath;
  if (tileset?.source) {
    const resolved = resolveTiledReference(
      tileset.source,
      mapPath,
      filesByPath
    );
    if (!resolved.file) {
      throw new AssetStorageError(
        400,
        "外部 tileset 必须是文件夹中的 TSX 文件"
      );
    }
    resolvedTileset = parseTsx(
      resolved.file,
      integer(tileset.firstgid, 1)
    );
    referenceBase = resolved.path;
  }
  if (!resolvedTileset?.image) {
    throw new AssetStorageError(
      400,
      `tileset「${resolvedTileset?.name ?? index + 1}」缺少图片`
    );
  }
  let imagePath;
  let isEmbeddedImage = false;
  if (/^data:/i.test(resolvedTileset.image)) {
    isEmbeddedImage = true;
    const decoded = decodeDataUri(resolvedTileset.image);
    imagePath = posix.join(
      posix.dirname(mapPath),
      "_embedded",
      `tileset-${index + 1}${decoded.extension}`
    );
    virtualFiles.push({ path: imagePath, content: decoded.content });
  } else {
    const resolved = resolveTiledReference(
      resolvedTileset.image,
      referenceBase,
      filesByPath
    );
    if (!resolved.file) {
      throw new AssetStorageError(400, "tileset 图片不能使用 data URI");
    }
    if (!IMAGE_EXTENSIONS.has(extensionOf(resolved.path))) {
      throw new AssetStorageError(
        400,
        `tileset 图片格式不受支持：${resolved.path}`
      );
    }
    imagePath = resolved.path;
  }
  const tileWidth = integer(resolvedTileset.tilewidth);
  const tileHeight = integer(resolvedTileset.tileheight);
  const imageWidth = integer(resolvedTileset.imagewidth);
  const imageHeight = integer(resolvedTileset.imageheight);
  const margin = integer(resolvedTileset.margin);
  const spacing = integer(resolvedTileset.spacing);
  const columns =
    integer(resolvedTileset.columns) ||
    Math.floor(
      (imageWidth - margin * 2 + spacing) /
        (tileWidth + spacing)
    );
  const tileCount =
    integer(resolvedTileset.tilecount) ||
    columns *
      Math.floor(
        (imageHeight - margin * 2 + spacing) /
          (tileHeight + spacing)
      );
  if (
    !(tileWidth > 0) ||
    !(tileHeight > 0) ||
    !(imageWidth > 0) ||
    !(imageHeight > 0) ||
    !(columns > 0) ||
    !(tileCount > 0)
  ) {
    throw new AssetStorageError(
      400,
      `tileset「${resolvedTileset.name}」尺寸无效`
    );
  }
  const normalized = {
    firstgid: integer(resolvedTileset.firstgid, 1),
    name: String(resolvedTileset.name ?? `tileset-${index + 1}`),
    tilewidth: tileWidth,
    tileheight: tileHeight,
    spacing,
    margin,
    columns,
    tilecount: tileCount,
    image: imagePath,
    imagewidth: imageWidth,
    imageheight: imageHeight,
    ...(resolvedTileset.tiles?.length
      ? { tiles: resolvedTileset.tiles }
      : {})
  };
  const animations = normalizeTilesetAnimations(
    resolvedTileset.tiles
  );
  return {
    ...normalized,
    imagePath,
    isEmbeddedImage,
    animations,
    definitions: collectTilesetDefinitions(normalized)
  };
}

function findTilesetForGid(tilesets, gid) {
  let matched = null;
  for (const tileset of tilesets) {
    if (tileset.firstgid <= gid) {
      matched = tileset;
    } else {
      break;
    }
  }
  return matched;
}

function tileCollisionRectangles(tileset, tileId, gid, tileX, tileY, map) {
  const definition = tileset.definitions.get(tileId);
  if (!definition) {
    return [];
  }
  const terrainType = terrainTypeFor(definition.properties);
  const rectangles =
    definition.collisionObjects.length > 0
      ? definition.collisionObjects.flatMap((object) =>
          objectToCollisionRectangles(object, {
            cellWidth: map.tilewidth,
            cellHeight: map.tileheight,
            terrainType
          })
        )
      : definition.hasTileCollision
        ? [
            {
              x: map.tilewidth / 2,
              y: map.tileheight / 2,
              width: map.tilewidth,
              height: map.tileheight,
              terrainType
            }
          ]
        : [];
  return applyTileFlip(
    rectangles,
    tileX,
    tileY,
    map.tilewidth,
    map.tileheight,
    gid
  );
}

function extractCollisions(map, tilesets) {
  const collisions = [];
  let nextId = 1;
  const append = (rectangles, source) => {
    for (const rectangle of rectangles) {
      collisions.push({
        id: `tilemap-collision-${nextId}`,
        ...rectangle,
        source
      });
      nextId += 1;
    }
  };

  for (const layer of map.layers.filter(
    (entry) => entry.type === "tilelayer"
  )) {
    for (let index = 0; index < layer.data.length; index += 1) {
      const gid = layer.data[index];
      if (!gid) {
        continue;
      }
      const baseGid = gid & 0x1fffffff;
      const tileset = findTilesetForGid(tilesets, baseGid);
      if (!tileset) {
        continue;
      }
      append(
        tileCollisionRectangles(
          tileset,
          baseGid - tileset.firstgid,
          gid,
          (index % map.width) * map.tilewidth,
          Math.floor(index / map.width) * map.tileheight,
          map
        ),
        `tile:${layer.id}:${index}`
      );
    }
  }

  for (const layer of map.layers.filter(
    (entry) => entry.type === "objectgroup"
  )) {
    const layerIsCollision = isCollisionLayer(layer);
    const layerProperties = parseJsonProperties(layer.properties);
    for (const object of asArray(layer.objects)) {
      if (!layerIsCollision && !objectIsCollision(object)) {
        continue;
      }
      const properties = {
        ...layerProperties,
        ...parseJsonProperties(object.properties)
      };
      append(
        objectToCollisionRectangles(object, {
          offsetX: finiteNumber(layer.x),
          offsetY: finiteNumber(layer.y),
          cellWidth: map.tilewidth,
          cellHeight: map.tileheight,
          terrainType: terrainTypeFor(properties)
        }),
        `object:${integer(object.id)}`
      );
    }
  }
  return collisions;
}

function parseMapFile(file) {
  let map;
  try {
    map = JSON.parse(file.content.toString("utf8"));
  } catch {
    throw new AssetStorageError(
      400,
      `Tiled JSON 解析失败：${file.path}`
    );
  }
  if (
    !map ||
    typeof map !== "object" ||
    !Array.isArray(map.layers) ||
    !map.orientation
  ) {
    throw new AssetStorageError(
      400,
      `文件不是 Tiled 地图：${file.path}`
    );
  }
  return map;
}

export function listTiledMapCandidates(files) {
  const candidates = [];
  for (const file of files) {
    if (!MAP_EXTENSIONS.has(extensionOf(file.path))) {
      continue;
    }
    try {
      const map = parseMapFile({
        ...file,
        content: Buffer.isBuffer(file.content)
          ? file.content
          : Buffer.from(file.content ?? [])
      });
      candidates.push({
        path: normalizeTiledFilePath(file.path),
        fileName: basename(file.path),
        name: basename(file.path, extname(file.path)),
        width: integer(map.width),
        height: integer(map.height),
        tileWidth: integer(map.tilewidth),
        tileHeight: integer(map.tileheight)
      });
    } catch {
      // 同目录的普通 JSON 不是地图候选。
    }
  }
  return candidates;
}

function stripCollisionInternals(collision) {
  const { source: _source, ...contractCollision } = collision;
  return contractCollision;
}

export function buildTiledMapBundle({ files = [], mapPath }) {
  const normalizedFiles = files.map((file) => ({
    ...file,
    path: normalizeTiledFilePath(file.path),
    content: Buffer.isBuffer(file.content)
      ? file.content
      : Buffer.from(file.content ?? [])
  }));
  if (normalizedFiles.some((file) => file.content.length === 0)) {
    throw new AssetStorageError(400, "Tiled 地图素材组包含空文件");
  }
  const filesByPath = new Map();
  for (const file of normalizedFiles) {
    if (filesByPath.has(file.path)) {
      throw new AssetStorageError(
        400,
        `Tiled 素材组存在重复路径：${file.path}`
      );
    }
    filesByPath.set(file.path, file);
  }
  const selectedPath = mapPath
    ? normalizeTiledFilePath(mapPath)
    : listTiledMapCandidates(normalizedFiles)[0]?.path;
  if (
    !selectedPath ||
    !MAP_EXTENSIONS.has(extensionOf(selectedPath))
  ) {
    throw new AssetStorageError(
      400,
      "请选择要导入的 .json 或 .tmj 地图文件"
    );
  }
  const mapFile = filesByPath.get(selectedPath);
  if (!mapFile) {
    throw new AssetStorageError(404, `找不到地图文件：${selectedPath}`);
  }
  const map = parseMapFile(mapFile);
  if (map.orientation !== "orthogonal") {
    throw new AssetStorageError(
      400,
      "首版仅支持 orthogonal（正交）Tiled 地图"
    );
  }
  if (
    map.infinite ||
    map.layers.some(
      (layer) =>
        layer?.type === "group" || layer?.type === "imagelayer"
    )
  ) {
    throw new AssetStorageError(
      400,
      "暂不支持 infinite、group layer 或 image layer"
    );
  }
  if (
    !(integer(map.width) > 0) ||
    !(integer(map.height) > 0) ||
    !(integer(map.tilewidth) > 0) ||
    !(integer(map.tileheight) > 0)
  ) {
    throw new AssetStorageError(400, "Tiled 地图或瓦片尺寸无效");
  }
  for (const layer of map.layers) {
    if (
      layer.type === "tilelayer" &&
      (!Array.isArray(layer.data) ||
        layer.data.length !== map.width * map.height)
    ) {
      throw new AssetStorageError(
        400,
        `Tiled 图层数据不完整：${layer.name ?? layer.id}`
      );
    }
  }

  const virtualFiles = [];
  const referencedPaths = new Set([selectedPath]);
  const tilesets = asArray(map.tilesets)
    .map((tileset, index) => {
      if (tileset?.source) {
        const resolved = resolveTiledReference(
          tileset.source,
          selectedPath,
          filesByPath
        );
        if (resolved.path) {
          referencedPaths.add(resolved.path);
        }
      }
      const normalized = resolveTileset({
        tileset,
        mapPath: selectedPath,
        filesByPath,
        virtualFiles,
        index
      });
      if (!normalized.isEmbeddedImage) {
        referencedPaths.add(normalized.imagePath);
      }
      return normalized;
    })
    .sort((left, right) => left.firstgid - right.firstgid);
  if (tilesets.length === 0) {
    throw new AssetStorageError(400, "Tiled 地图至少需要一个 tileset");
  }
  const uniqueTilesetNames = getUniqueTiledTilesetNames(tilesets);
  tilesets.forEach((tileset, index) => {
    tileset.name = uniqueTilesetNames[index];
  });

  const collisions = extractCollisions(map, tilesets);
  const mapJson = {
    ...map,
    tilesets: tilesets.map((tileset) => {
      const {
        definitions: _definitions,
        imagePath,
        isEmbeddedImage: _isEmbeddedImage,
        animations: _animations,
        ...json
      } = tileset;
      return { ...json, image: imagePath };
    })
  };
  const outputFiles = [];
  for (const path of referencedPaths) {
    outputFiles.push({
      path: posix.join("source", path),
      content: filesByPath.get(path).content
    });
  }
  for (const virtualFile of virtualFiles) {
    outputFiles.push({
      path: posix.join("source", virtualFile.path),
      content: virtualFile.content
    });
  }
  outputFiles.push({
    path: "map.json",
    content: Buffer.from(
      `${JSON.stringify(mapJson, null, 2)}\n`,
      "utf8"
    )
  });

  const fileName = basename(selectedPath);
  const displayName =
    normalizeTiledAssetName(
      basename(selectedPath, extname(selectedPath))
    ) ||
    "Tiled 地图";
  const revision = new Date().toISOString();
  const manifest = {
    id: "",
    name: displayName,
    fileName,
    sourceFile: selectedPath,
    sourceWidth: map.width * map.tilewidth,
    sourceHeight: map.height * map.tileheight,
    tileWidth: map.tilewidth,
    tileHeight: map.tileheight,
    columns: map.width,
    rows: map.height,
    layerCount: map.layers.length,
    tileLayerCount: map.layers.filter(
      (layer) => layer.type === "tilelayer"
    ).length,
    tilesetCount: tilesets.length,
    collisionCount: collisions.length,
    revision,
    createdAt: revision,
    modifiedAt: revision,
    sourcePath: posix.join("source", selectedPath),
    mapPath: "map.json",
    tilesets: tilesets.map((tileset) => ({
      name: tileset.name,
      firstGid: tileset.firstgid,
      imagePath: posix.join("source", tileset.imagePath),
      imageWidth: tileset.imagewidth,
      imageHeight: tileset.imageheight,
      tileWidth: tileset.tilewidth,
      tileHeight: tileset.tileheight,
      margin: tileset.margin,
      spacing: tileset.spacing,
      columns: tileset.columns,
      tileCount: tileset.tilecount,
      ...(tileset.animations.length > 0
        ? { animations: tileset.animations }
        : {})
    })),
    collisions: collisions.map(stripCollisionInternals)
  };
  return { manifest, files: outputFiles };
}

