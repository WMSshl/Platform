import {
  LEVEL_SECTIONS as CONTRACT_LEVEL_SECTIONS,
  MECHANISM_TYPES,
  createEmptyLevel,
  normalizeLevel
} from "../contract/index.js";
import {
  mechanismTypeRegistry,
  placementTypeRegistry
} from "./EditorTypeRegistry.js";

export { createEmptyLevel, normalizeLevel };

const SECTION_PRESENTATION = Object.freeze({
  solids: {
    label: "地形",
    idPrefix: "solid",
    color: "#475569"
  },
  actors: {
    label: "角色实例",
    idPrefix: "actor",
    color: "#fb7185"
  },
  items: {
    label: "道具",
    idPrefix: "pickup",
    color: "#22c55e"
  },
  mechanisms: {
    label: "机关与特效对象",
    idPrefix: "mechanism",
    color: "#facc15"
  }
});

export const LEVEL_SECTIONS = Object.freeze(
  CONTRACT_LEVEL_SECTIONS.map((section) => ({
    ...section,
    ...SECTION_PRESENTATION[section.key]
  }))
);

const MECHANISM_PRESENTATION = Object.freeze({
  switch: {
    label: "机关开关",
    description: "靠近后按 E 启动",
    color: "#facc15",
    rectangle: false,
    renderMethod: "drawMechanism",
    inspectorMethod: "buildMechanismFields"
  },
  gate: {
    label: "闸门",
    description: "默认阻挡，可由机关打开",
    color: "#eab308",
    rectangle: true,
    renderMethod: "drawGate",
    inspectorMethod: "buildGateFields"
  },
  entrance: {
    label: "入口",
    description: "角色中点接触边缘后传送",
    color: "#22d3ee",
    rectangle: true,
    renderMethod: "drawEntrance",
    inspectorMethod: "buildEntranceFields"
  },
  exit: {
    label: "出口",
    description: "入口传送的目标位置",
    color: "#34d399",
    rectangle: true,
    renderMethod: "drawExit",
    inspectorMethod: "buildExitFields"
  }
});

export let MECHANISM_KINDS = Object.freeze(
  MECHANISM_TYPES.map((type) => ({
    key: type,
    section: "mechanisms",
    type,
    ...MECHANISM_PRESENTATION[type]
  }))
);

export const SOLID_TERRAIN_TYPES = Object.freeze([
  {
    key: "ground",
    label: "地面",
    description: "四周都有碰撞，不能从任何方向穿透",
    color: "#475569"
  },
  {
    key: "platform",
    label: "平台",
    description: "可从下方跳穿，能够站立，按 S / ↓ 下落",
    color: "#38bdf8"
  }
]);

export function normalizeSolidTerrainType(value) {
  return value === "platform" ? "platform" : "ground";
}

export function getSolidTerrainType(terrainType) {
  return (
    SOLID_TERRAIN_TYPES.find(
      (terrain) => terrain.key === terrainType
    ) ?? SOLID_TERRAIN_TYPES[0]
  );
}

export const TOOL_DEFINITIONS = Object.freeze({
  select: {
    label: "选择",
    help: "拖对象移动；四角等比、四边单轴缩放；上方左右、右侧上下箭头每次微调 1 像素"
  },
  solid: {
    label: "地形",
    help: "先选择地面或平台，再在画布上拖动矩形；单击生成默认地块"
  },
  actor: { label: "角色", help: "从左侧素材库选择，再单击地图放置" },
  item: { label: "道具", help: "从左侧素材库选择，再单击地图放置" },
  mechanism: {
    label: "机关",
    help: "先选择机关、闸门、入口或出口，再在地图上放置"
  },
  erase: { label: "删除", help: "单击地图对象将其删除" }
});

const RECTANGLE_TOOLS = new Set(["solid"]);

export function isRectangleTool(tool) {
  return RECTANGLE_TOOLS.has(tool);
}

export function getSectionDefinition(sectionKey) {
  return LEVEL_SECTIONS.find((section) => section.key === sectionKey) ?? null;
}

export function getMechanismKind(kindKey) {
  return (
    MECHANISM_KINDS.find((kind) => kind.key === kindKey) ??
    MECHANISM_KINDS[0]
  );
}

export function isRectangleMechanism(kindKey) {
  return Boolean(getMechanismKind(kindKey).rectangle);
}

export function selectionKey(selection) {
  if (!selection || selection.section === "level") {
    return "level";
  }
  if (selection.section === "spawnPoint") {
    return `spawnPoint:${selection.id}`;
  }
  return `${selection.section}:${selection.id}`;
}

export function getSelectedObject(level, selection) {
  if (!level || !selection) {
    return null;
  }
  if (selection.section === "spawnPoint") {
    return (
      level.spawnPoints?.find((spawn) => spawn.id === selection.id) ??
      null
    );
  }
  const definition = getSectionDefinition(selection.section);
  if (!definition) {
    return null;
  }
  return (
    level[selection.section]?.find(
      (item) => item[definition.idField] === selection.id
    ) ?? null
  );
}

export function getObjectSelection(section, object) {
  if (section === "spawnPoint") {
    return { section: "spawnPoint", id: object.id };
  }
  const definition = getSectionDefinition(section);
  if (!definition) {
    return null;
  }
  return {
    section,
    id: object[definition.idField]
  };
}

export function nextUniqueId(level, sectionKey, prefix) {
  const definition = getSectionDefinition(sectionKey);
  const values = new Set(
    (level[sectionKey] ?? []).map(
      (item) => String(item[definition.idField] ?? "")
    )
  );
  let index = 1;
  while (values.has(`${prefix}-${index}`)) {
    index += 1;
  }
  return `${prefix}-${index}`;
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function placementPoint(payload) {
  return {
    x: Math.round(finiteNumber(payload.x, 0)),
    y: Math.round(finiteNumber(payload.y, 0))
  };
}

export function registerPlacementType(definition) {
  return placementTypeRegistry.register(definition);
}

export function registerMechanismType(definition) {
  const registered = mechanismTypeRegistry.register({
    section: "mechanisms",
    key: definition.type,
    ...definition
  });
  MECHANISM_KINDS = Object.freeze(mechanismTypeRegistry.values());
  return registered;
}

registerPlacementType({
  tool: "solid",
  section: "solids",
  create({ level, payload, point }) {
    const terrainType = normalizeSolidTerrainType(
      payload.terrainType
    );
    return {
      id: nextUniqueId(level, "solids", "solid"),
      x: point.x,
      y: point.y,
      width: Math.max(8, Math.round(payload.width ?? 260)),
      height: Math.max(8, Math.round(payload.height ?? 32)),
      terrainType,
      color:
        payload.color ??
        getSolidTerrainType(terrainType).color
    };
  }
});

registerPlacementType({
  tool: "actor",
  section: "actors",
  create({ level, payload, point }) {
    return {
      instanceId: nextUniqueId(level, "actors", "actor"),
      actorId: payload.actorId ?? "guard",
      scaleX: payload.scaleX ?? 1,
      scaleY: payload.scaleY ?? 1,
      x: point.x,
      y: point.y
    };
  }
});

registerPlacementType({
  tool: "item",
  section: "items",
  create({ level, payload, point }) {
    return {
      instanceId: nextUniqueId(level, "items", "pickup"),
      itemId: payload.itemId ?? "healing-herb",
      quantity: Math.max(1, Math.round(payload.quantity ?? 1)),
      x: point.x,
      y: point.y
    };
  }
});

registerPlacementType({
  tool: "mechanism",
  section: "mechanisms",
  create({ level, payload, point }) {
    const type = payload.type ?? "switch";
    const kind = getMechanismKind(type);
    const base = {
      id: nextUniqueId(
        level,
        "mechanisms",
        kind.idPrefix(level)
      ),
      type: kind.type,
      x: point.x,
      y: point.y,
      width: Math.max(
        8,
        Math.round(payload.width ?? kind.defaultWidth)
      ),
      height: Math.max(
        8,
        Math.round(payload.height ?? kind.defaultHeight)
      ),
      color: payload.color ?? kind.color
    };
    return kind.createFields(base, payload);
  }
});

for (const type of MECHANISM_TYPES) {
  const presentation = MECHANISM_PRESENTATION[type];
  const defaults = {
    switch: {
      idPrefix: () => "switch",
      defaultWidth: 36,
      defaultHeight: 64,
      createFields(base, payload) {
        return {
          ...base,
          interactionRange: Math.max(
            1,
            Math.round(payload.interactionRange ?? 100)
          ),
          targetGateId: payload.targetGateId ?? null,
          storyFlag: payload.storyFlag ?? "",
          prompt: payload.prompt ?? "按 E 启动机关"
        };
      }
    },
    gate: {
      idPrefix: () => "gate",
      defaultWidth: 36,
      defaultHeight: 180,
      createFields(base) {
        return base;
      }
    },
    entrance: {
      idPrefix: (level) => `${level.id}-entrance`,
      defaultWidth: 100,
      defaultHeight: 140,
      createFields(base, payload) {
        return {
          ...base,
          activation:
            payload.activation ?? "player-center-touch",
          targetExitId: payload.targetExitId ?? null
        };
      }
    },
    exit: {
      idPrefix: (level) => `${level.id}-exit`,
      defaultWidth: 100,
      defaultHeight: 140,
      createFields(base) {
        return base;
      }
    }
  }[type];

  registerMechanismType({
    type,
    section: "mechanisms",
    ...presentation,
    ...defaults
  });
}

export function createPlacedObject(level, tool, payload = {}) {
  const definition = placementTypeRegistry.get(tool);
  if (!definition) {
    throw new Error(`不支持的地图工具：${tool}`);
  }
  const point = placementPoint(payload);
  return definition.create({ level, payload, point });
}

export function insertPlacedObject(level, tool, payload = {}) {
  const object = createPlacedObject(level, tool, payload);
  const definition = placementTypeRegistry.get(tool);
  const section = definition.section;
  if (!level[section]) {
    throw new Error(`未知对象集合：${section}`);
  }
  level[section].push(object);
  return { object, selection: getObjectSelection(section, object) };
}

/**
 * 背景只替换素材，不决定关卡世界尺寸。
 * 图片和 Tiled 地图都以当前 world 为唯一尺寸来源。
 */
export function setLevelBackground(level, background) {
  if (!level?.world || !background?.type) {
    return false;
  }
  level.world.background = structuredClone(background);
  return true;
}

export function restoreLevelBackgroundAspect(level) {
  const background = level?.world?.background;
  const width = Number(level?.world?.width);
  const sourceWidth = Number(background?.sourceWidth);
  const sourceHeight = Number(background?.sourceHeight);
  if (
    background?.type !== "tiled" ||
    !(width > 0) ||
    !(sourceWidth > 0) ||
    !(sourceHeight > 0)
  ) {
    return false;
  }
  level.world.height = Math.max(
    240,
    Math.round(width * (sourceHeight / sourceWidth))
  );
  delete background.fit;
  return true;
}

export function setSpawnPointPosition(level, spawnId, x, y) {
  const spawn = level.spawnPoints?.find((item) => item.id === spawnId);
  if (!spawn) {
    return false;
  }
  spawn.x = Math.round(finiteNumber(x, 0));
  spawn.y = Math.round(finiteNumber(y, 0));
  return true;
}

export function removeSelection(level, selection) {
  if (!selection || selection.section === "level") {
    return false;
  }
  if (selection.section === "spawnPoint") {
    return false;
  }
  const definition = getSectionDefinition(selection.section);
  const items = level[selection.section];
  if (!definition || !Array.isArray(items)) {
    return false;
  }
  const index = items.findIndex(
    (item) => item[definition.idField] === selection.id
  );
  if (index < 0) {
    return false;
  }
  items.splice(index, 1);
  return true;
}

export function nudgeSelection(level, selection, deltaX, deltaY) {
  const object = getSelectedObject(level, selection);
  if (!object || !Number.isFinite(object.x) || !Number.isFinite(object.y)) {
    return false;
  }
  object.x = Math.round(object.x + deltaX);
  object.y = Math.round(object.y + deltaY);
  return true;
}

export function duplicateSelection(level, selection) {
  if (
    !selection ||
    selection.section === "level" ||
    selection.section === "spawnPoint"
  ) {
    return null;
  }

  const definition = getSectionDefinition(selection.section);
  const source = getSelectedObject(level, selection);
  if (!definition || !source) {
    return null;
  }

  const duplicate = structuredClone(source);
  const prefix =
    selection.section === "mechanisms"
      ? getMechanismKind(source.type).key
      : definition.idPrefix;
  duplicate[definition.idField] = nextUniqueId(
    level,
    selection.section,
    prefix
  );
  duplicate.x = Math.round((duplicate.x ?? 0) + 32);
  duplicate.y = Math.round((duplicate.y ?? 0) + 32);
  level[selection.section].push(duplicate);
  return getObjectSelection(selection.section, duplicate);
}

export function getPathValue(target, path) {
  return path
    .split(".")
    .reduce((value, key) => (value == null ? undefined : value[key]), target);
}

export function setPathValue(target, path, value) {
  const keys = path.split(".");
  let cursor = target;
  for (const key of keys.slice(0, -1)) {
    if (!cursor[key] || typeof cursor[key] !== "object") {
      cursor[key] = {};
    }
    cursor = cursor[key];
  }
  cursor[keys.at(-1)] = value;
}

export function getObjectDisplayName(section, object, catalogs = {}) {
  if (section === "actors") {
    return catalogs.actors?.[object.actorId]?.name ?? object.actorId ?? "角色";
  }
  if (section === "items") {
    return catalogs.items?.[object.itemId]?.name ?? object.itemId ?? "道具";
  }
  if (section === "spawnPoint") {
    return object?.name ?? object?.id ?? "出生点";
  }
  if (section === "mechanisms") {
    return `${getMechanismKind(object?.type).label} ${object?.id ?? ""}`.trim();
  }
  if (section === "level") {
    return "关卡设置";
  }
  const definition = getSectionDefinition(section);
  return object?.[definition?.idField] ?? definition?.label ?? "对象";
}

export function summarizeCoordinates(object) {
  if (!object || !Number.isFinite(object.x) || !Number.isFinite(object.y)) {
    return "";
  }
  return `${Math.round(object.x)}, ${Math.round(object.y)}`;
}
