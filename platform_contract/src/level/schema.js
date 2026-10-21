export const CURRENT_LEVEL_SCHEMA_VERSION = 3;

export const LEVEL_SECTIONS = Object.freeze([
  {
    key: "solids",
    idField: "id"
  },
  {
    key: "actors",
    idField: "instanceId"
  },
  {
    key: "items",
    idField: "instanceId"
  },
  {
    key: "mechanisms",
    idField: "id"
  }
]);

export const SOLID_TERRAIN_TYPES = Object.freeze([
  "ground",
  "platform"
]);

const MECHANISM_DEFINITIONS = Object.freeze([
  {
    type: "switch",
    rectangular: true,
    validator: validateSwitch
  },
  {
    type: "gate",
    rectangular: true,
    validator: validateGate
  },
  {
    type: "entrance",
    rectangular: true,
    validator: validateEntrance
  },
  {
    type: "exit",
    rectangular: true,
    validator: validateExit
  }
]);

export const MECHANISM_TYPES = Object.freeze(
  MECHANISM_DEFINITIONS.map((definition) => definition.type)
);

const mechanismDefinitionMap = new Map(
  MECHANISM_DEFINITIONS.map((definition) => [
    definition.type,
    definition
  ])
);

const sectionDefinitionMap = new Map(
  LEVEL_SECTIONS.map((definition) => [
    definition.key,
    definition
  ])
);

export function getSectionDefinition(sectionKey) {
  return sectionDefinitionMap.get(sectionKey) ?? null;
}

export function getMechanismTypeDefinition(type) {
  return mechanismDefinitionMap.get(type) ?? null;
}

export function normalizeSolidTerrainType(value) {
  return value === "platform" ? "platform" : "ground";
}

function validateSwitch(context) {
  const {
    mechanism,
    gateIds,
    label,
    selection,
    pushIssue,
    isFiniteNumber
  } = context;

  if (
    !isFiniteNumber(mechanism.interactionRange) ||
    Number(mechanism.interactionRange) <= 0
  ) {
    pushIssue(
      "error",
      `${label}的 interactionRange 必须大于 0`,
      selection
    );
  }
  if (!mechanism.targetGateId) {
    pushIssue("warning", `${label}没有关联闸门`, selection);
  } else if (!gateIds.has(mechanism.targetGateId)) {
    pushIssue(
      "error",
      `${label}指向不存在的闸门 ${mechanism.targetGateId}`,
      selection
    );
  }
}

function validateGate() {
  // 闸门当前只依赖通用矩形字段。
}

function validateEntrance(context) {
  const { mechanism, label, selection, pushIssue } = context;
  if (mechanism.activation !== "player-center-touch") {
    pushIssue(
      "error",
      `${label}的激活条件必须是 player-center-touch`,
      selection
    );
  }
  if (!mechanism.targetExitId) {
    pushIssue("warning", `${label}尚未绑定出口`, selection);
  }
}

function validateExit() {
  // 出口是被动目标，当前只依赖通用矩形字段与全局唯一 ID。
}
