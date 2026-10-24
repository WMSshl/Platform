import {
  CURRENT_LEVEL_SCHEMA_VERSION,
  LEVEL_SECTIONS,
  MECHANISM_TYPES,
  SOLID_TERRAIN_TYPES,
  getMechanismTypeDefinition,
  getSectionDefinition
} from "./schema.js";

const colorPattern = /^#[0-9a-fA-F]{6}$/;
const mechanismTypes = new Set(MECHANISM_TYPES);
const solidTerrainTypes = new Set(SOLID_TERRAIN_TYPES);
const assetPathPattern = /^(?!\/)(?!.*(?:^|\/)\.\.?(?:\/|$))[^\\]+$/;

export class ContractValidationError extends Error {
  constructor(issues) {
    const errors = issues.filter((issue) => issue.severity === "error");
    super(
      `contract 校验失败（${errors.length} 个错误）：\n${errors
        .map((issue) => `- ${issue.message}`)
        .join("\n")}`
    );
    this.name = "ContractValidationError";
    this.issues = issues;
  }
}

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function pushIssue(issues, severity, message, selection = null) {
  issues.push({ severity, message, selection });
}

function isSafeAssetPath(value) {
  return (
    typeof value === "string" &&
    assetPathPattern.test(value) &&
    !value.includes("://")
  );
}

function validateTiledBackground(issues, backgroundMap) {
  if (
    !backgroundMap ||
    typeof backgroundMap !== "object" ||
    Array.isArray(backgroundMap)
  ) {
    pushIssue(
      issues,
      "error",
      "关卡背景地图描述必须是对象",
      { section: "level" }
    );
    return;
  }

  for (const pathField of ["sourcePath", "mapPath"]) {
    if (!isSafeAssetPath(backgroundMap[pathField])) {
      pushIssue(
        issues,
        "error",
        `背景地图 ${pathField} 必须是安全的项目相对路径`,
        { section: "level" }
      );
    }
  }
  for (const textField of ["id", "fileName", "revision"]) {
    if (
      typeof backgroundMap[textField] !== "string" ||
      !backgroundMap[textField]
    ) {
      pushIssue(
        issues,
        "error",
        `背景地图 ${textField} 不能为空`,
        { section: "level" }
      );
    }
  }
  for (const dimension of [
    "sourceWidth",
    "sourceHeight",
    "tileWidth",
    "tileHeight"
  ]) {
    if (
      !isFiniteNumber(backgroundMap[dimension]) ||
      Number(backgroundMap[dimension]) <= 0
    ) {
      pushIssue(
        issues,
        "error",
        `背景地图 ${dimension} 必须大于 0`,
        { section: "level" }
      );
    }
  }
  if (!Array.isArray(backgroundMap.tilesets)) {
    pushIssue(
      issues,
      "error",
      "背景地图 tilesets 必须是数组",
      { section: "level" }
    );
  } else if (backgroundMap.tilesets.length === 0) {
    pushIssue(
      issues,
      "error",
      "背景地图至少需要一个 tileset",
      { section: "level" }
    );
  } else {
    const tilesetNames = new Set();
    for (const [index, tileset] of backgroundMap.tilesets.entries()) {
      const label = `背景地图 tileset「${tileset?.name ?? index + 1}」`;
      if (
        !tileset?.name ||
        !Number.isInteger(Number(tileset.firstGid)) ||
        Number(tileset.firstGid) <= 0
      ) {
        pushIssue(
          issues,
          "error",
          `${label}缺少 name 或 firstGid`,
          { section: "level" }
        );
      }
      if (tileset?.name) {
        if (tilesetNames.has(tileset.name)) {
          pushIssue(
            issues,
            "error",
            `背景地图 tileset 名称重复：${tileset.name}`,
            { section: "level" }
          );
        }
        tilesetNames.add(tileset.name);
      }
      if (!isSafeAssetPath(tileset?.imagePath)) {
        pushIssue(
          issues,
          "error",
          `${label}的 imagePath 不安全`,
          { section: "level" }
        );
      }
      for (const dimension of [
        "imageWidth",
        "imageHeight",
        "tileWidth",
        "tileHeight",
        "columns",
        "tileCount"
      ]) {
        if (
          !isFiniteNumber(tileset?.[dimension]) ||
          Number(tileset[dimension]) <= 0
        ) {
          pushIssue(
            issues,
            "error",
            `${label}的 ${dimension} 必须大于 0`,
            { section: "level" }
          );
        }
      }
      for (const offset of ["margin", "spacing"]) {
        if (
          tileset?.[offset] !== undefined &&
          (!isFiniteNumber(tileset[offset]) ||
            Number(tileset[offset]) < 0)
        ) {
          pushIssue(
            issues,
            "error",
            `${label}的 ${offset} 不能为负数`,
            { section: "level" }
          );
        }
      }
      if (tileset?.animations !== undefined) {
        if (!Array.isArray(tileset.animations)) {
          pushIssue(
            issues,
            "error",
            `${label}的 animations 必须是数组`,
            { section: "level" }
          );
        } else {
          for (const animation of tileset.animations) {
            if (
              !Number.isInteger(Number(animation?.tileId)) ||
              Number(animation.tileId) < 0 ||
              !Array.isArray(animation.frames) ||
              animation.frames.length === 0
            ) {
              pushIssue(
                issues,
                "error",
                `${label}包含无效动画瓦片`,
                { section: "level" }
              );
              continue;
            }
            for (const frame of animation.frames) {
              if (
                !Number.isInteger(Number(frame?.tileId)) ||
                Number(frame.tileId) < 0 ||
                !isFiniteNumber(frame?.duration) ||
                Number(frame.duration) <= 0
              ) {
                pushIssue(
                  issues,
                  "error",
                  `${label}的动画帧无效`,
                  { section: "level" }
                );
              }
            }
          }
        }
      }
    }
  }

  if (!Array.isArray(backgroundMap.collisions)) {
    pushIssue(
      issues,
      "error",
      "背景地图 collisions 必须是数组",
      { section: "level" }
    );
    return;
  }
  const collisionIds = new Set();
  for (const [index, collision] of backgroundMap.collisions.entries()) {
    const label = `背景地图碰撞「${collision?.id || index + 1}」`;
    if (!collision?.id) {
      pushIssue(
        issues,
        "error",
        `${label}缺少 ID`,
        { section: "level" }
      );
    } else if (collisionIds.has(collision.id)) {
      pushIssue(
        issues,
        "error",
        `${label}的 ID 重复`,
        { section: "level" }
      );
    }
    if (collision?.id) {
      collisionIds.add(collision.id);
    }
    for (const dimension of ["width", "height"]) {
      if (
        !isFiniteNumber(collision?.[dimension]) ||
        Number(collision[dimension]) <= 0
      ) {
        pushIssue(
          issues,
          "error",
          `${label}的 ${dimension} 必须大于 0`,
          { section: "level" }
        );
      }
    }
    if (
      !isFiniteNumber(collision?.x) ||
      !isFiniteNumber(collision?.y)
    ) {
      pushIssue(
        issues,
        "error",
        `${label}坐标无效`,
        { section: "level" }
      );
    }
    if (!solidTerrainTypes.has(collision?.terrainType)) {
      pushIssue(
        issues,
        "error",
        `${label}的 terrainType 必须是 ground 或 platform`,
        { section: "level" }
      );
    }
  }
}

function getObjectSelection(section, object) {
  const definition = getSectionDefinition(section);
  if (!definition) {
    return null;
  }
  return { section, id: object?.[definition.idField] };
}

function validateUniqueIds(issues, level, sectionKey) {
  const definition = getSectionDefinition(sectionKey);
  const seen = new Set();
  for (const object of level[sectionKey] ?? []) {
    const id = object?.[definition.idField];
    if (!id) {
      continue;
    }
    if (seen.has(id)) {
      pushIssue(
        issues,
        "error",
        `${sectionKey} 中存在重复编号「${id}」`,
        getObjectSelection(sectionKey, object)
      );
    }
    seen.add(id);
  }
}

function validateRectangle(issues, object, label, selection) {
  if (!isFiniteNumber(object.x) || !isFiniteNumber(object.y)) {
    pushIssue(issues, "error", `${label}的坐标无效`, selection);
  }
  if (!isFiniteNumber(object.width) || Number(object.width) <= 0) {
    pushIssue(issues, "error", `${label}的 width 必须大于 0`, selection);
  }
  if (!isFiniteNumber(object.height) || Number(object.height) <= 0) {
    pushIssue(issues, "error", `${label}的 height 必须大于 0`, selection);
  }
  if (object.color && !colorPattern.test(object.color)) {
    pushIssue(
      issues,
      "error",
      `${label}的 color 必须是 #RRGGBB 格式`,
      selection
    );
  }
}

function checkBounds(issues, level, object, label, selection, rectangle) {
  const width = Number(level.world?.width);
  const height = Number(level.world?.height);
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return;
  }
  const objectWidth = rectangle ? Number(object.width ?? 0) : 0;
  const objectHeight = rectangle ? Number(object.height ?? 0) : 0;
  const left = Number(object.x) - objectWidth / 2;
  const right = Number(object.x) + objectWidth / 2;
  const top = Number(object.y) - objectHeight / 2;
  const bottom = Number(object.y) + objectHeight / 2;
  if (left < 0 || top < 0 || right > width || bottom > height) {
    pushIssue(
      issues,
      "warning",
      `${label}超出世界边界`,
      selection
    );
  }
}

function validateBackgroundMusic(issues, backgroundMusic) {
  if (backgroundMusic === undefined || backgroundMusic === null) {
    return;
  }
  if (
    !backgroundMusic ||
    typeof backgroundMusic !== "object" ||
    Array.isArray(backgroundMusic)
  ) {
    pushIssue(
      issues,
      "error",
      "关卡背景音乐必须是对象或 null",
      { section: "level" }
    );
    return;
  }
  for (const field of ["id", "path", "fileName", "revision"]) {
    if (
      typeof backgroundMusic[field] !== "string" ||
      !backgroundMusic[field].trim()
    ) {
      pushIssue(
        issues,
        "error",
        `关卡背景音乐 ${field} 不能为空`,
        { section: "level" }
      );
    }
  }
  if (!isSafeAssetPath(backgroundMusic.path)) {
    pushIssue(
      issues,
      "error",
      "关卡背景音乐 path 必须是安全的项目相对路径",
      { section: "level" }
    );
  } else if (!/\.(wav|ogg|mp3)$/i.test(backgroundMusic.path)) {
    pushIssue(
      issues,
      "error",
      "关卡背景音乐必须是 WAV、OGG 或 MP3",
      { section: "level" }
    );
  }
  for (const field of [
    "displayName",
    "mimeType",
    "folderPath"
  ]) {
    if (
      backgroundMusic[field] !== undefined &&
      typeof backgroundMusic[field] !== "string"
    ) {
      pushIssue(
        issues,
        "error",
        `关卡背景音乐 ${field} 必须是字符串`,
        { section: "level" }
      );
    }
  }
  if (
    backgroundMusic.folderId !== undefined &&
    backgroundMusic.folderId !== null &&
    typeof backgroundMusic.folderId !== "string"
  ) {
    pushIssue(
      issues,
      "error",
      "关卡背景音乐 folderId 必须是字符串或 null",
      { section: "level" }
    );
  }
  if (
    !isFiniteNumber(backgroundMusic.volume) ||
    Number(backgroundMusic.volume) < 0 ||
    Number(backgroundMusic.volume) > 1
  ) {
    pushIssue(
      issues,
      "error",
      "关卡背景音乐 volume 必须是 0–1 的数字",
      { section: "level" }
    );
  }
  if (typeof backgroundMusic.loop !== "boolean") {
    pushIssue(
      issues,
      "error",
      "关卡背景音乐 loop 必须是布尔值",
      { section: "level" }
    );
  }
}

export function validateLevel(
  level,
  {
    catalogs = {},
    knownLevelIds = [],
    knownLevels = null
  } = {}
) {
  const issues = [];
  if (!level) {
    return [
      {
        severity: "error",
        message: "没有可校验的关卡",
        selection: null
      }
    ];
  }

  if (
    level.schemaVersion !== undefined &&
    level.schemaVersion !== CURRENT_LEVEL_SCHEMA_VERSION
  ) {
    pushIssue(
      issues,
      "error",
      `关卡 schemaVersion 必须为 ${CURRENT_LEVEL_SCHEMA_VERSION}`,
      { section: "level" }
    );
  }
  if (!level.id || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(level.id)) {
    pushIssue(
      issues,
      "error",
      "关卡 id 只能使用小写字母、数字和中划线，长度至少 2 个字符",
      { section: "level" }
    );
  }
  if (!level.name || typeof level.name !== "string") {
    pushIssue(
      issues,
      "error",
      "关卡名称不能为空",
      { section: "level" }
    );
  }
  if (
    !level.world ||
    !isFiniteNumber(level.world.width) ||
    !isFiniteNumber(level.world.height) ||
    Number(level.world.width) < 320 ||
    Number(level.world.height) < 240
  ) {
    pushIssue(
      issues,
      "error",
      "世界宽高必须有效，且至少为 320 × 240",
      { section: "level" }
    );
  }
  if (
    level.world?.backgroundColor &&
    !colorPattern.test(level.world.backgroundColor)
  ) {
    pushIssue(
      issues,
      "error",
      "世界背景色必须是 #RRGGBB 格式",
      { section: "level" }
    );
  }
  if (level.world?.background) {
    const background = level.world.background;
    if (!["image", "tiled"].includes(background.type)) {
      pushIssue(
        issues,
        "error",
        "背景 type 必须是 image 或 tiled",
        { section: "level" }
      );
    } else if (background.type === "image") {
      if (
        ["id", "path", "fileName", "revision"].some(
          (field) =>
            typeof background[field] !== "string" ||
            !background[field]
        ) ||
        background.fit !== "stretch"
      ) {
        pushIssue(
          issues,
          "error",
          "图片背景描述不完整",
          { section: "level" }
        );
      }
    } else {
      validateTiledBackground(issues, background);
    }
  }
  validateBackgroundMusic(issues, level.backgroundMusic);

  if (!Array.isArray(level.spawnPoints) || level.spawnPoints.length === 0) {
    pushIssue(
      issues,
      "error",
      "关卡至少需要一个出生点",
      { section: "level" }
    );
  } else {
    const spawnIds = new Set();
    level.spawnPoints.forEach((spawn, index) => {
      const selection = { section: "spawnPoint", id: spawn.id };
      const label = `出生点「${spawn.id || `#${index + 1}`}」`;
      if (!spawn.id) {
        pushIssue(issues, "error", `${label}缺少 ID`, selection);
      } else if (spawnIds.has(spawn.id)) {
        pushIssue(
          issues,
          "error",
          `出生点 ID「${spawn.id}」重复`,
          selection
        );
      }
      spawnIds.add(spawn.id);
      if (!spawn.name) {
        pushIssue(
          issues,
          "warning",
          `${label}缺少显示名称`,
          selection
        );
      }
      if (!isFiniteNumber(spawn.x) || !isFiniteNumber(spawn.y)) {
        pushIssue(issues, "error", `${label}坐标无效`, selection);
      } else {
        checkBounds(issues, level, spawn, label, selection, false);
      }
    });
    if (
      !level.initialSpawnId ||
      !level.spawnPoints.some(
        (spawn) => spawn.id === level.initialSpawnId
      )
    ) {
      pushIssue(
        issues,
        "error",
        "初始出生点必须引用当前关卡中的出生点 ID",
        { section: "level" }
      );
    }
  }

  for (const section of LEVEL_SECTIONS) {
    if (!Array.isArray(level[section.key])) {
      pushIssue(
        issues,
        "error",
        `关卡字段 ${section.key} 必须是数组`,
        { section: "level" }
      );
      continue;
    }
    validateUniqueIds(issues, level, section.key);
  }

  const actorsById = catalogs.actors ?? {};
  const itemsById = catalogs.items ?? {};

  for (const [index, solid] of (level.solids ?? []).entries()) {
    const selection = getObjectSelection("solids", solid);
    const label = `地形「${solid.id || `#${index + 1}`}」`;
    if (!solid.id) {
      pushIssue(issues, "error", `${label}缺少 ID`, selection);
    }
    validateRectangle(issues, solid, label, selection);
    if (!solidTerrainTypes.has(solid.terrainType)) {
      pushIssue(
        issues,
        "error",
        `${label}的 terrainType 必须是 ground 或 platform`,
        selection
      );
    }
    if (isFiniteNumber(solid.x) && isFiniteNumber(solid.y)) {
      checkBounds(issues, level, solid, label, selection, true);
    }
  }

  for (const [index, actor] of (level.actors ?? []).entries()) {
    const selection = getObjectSelection("actors", actor);
    const label = `角色实例「${actor.instanceId || `#${index + 1}`}」`;
    if (!actor.instanceId) {
      pushIssue(issues, "error", `${label}缺少实例 ID`, selection);
    }
    if (!actorsById[actor.actorId]) {
      pushIssue(
        issues,
        "error",
        `${label}引用了不存在的角色 ${actor.actorId}`,
        selection
      );
    }
    if (!isFiniteNumber(actor.x) || !isFiniteNumber(actor.y)) {
      pushIssue(issues, "error", `${label}坐标无效`, selection);
    } else {
      checkBounds(issues, level, actor, label, selection, false);
    }
    for (const scaleField of ["scale", "scaleX", "scaleY"]) {
      if (
        actor[scaleField] !== undefined &&
        (!isFiniteNumber(actor[scaleField]) ||
          Number(actor[scaleField]) <= 0)
      ) {
        pushIssue(
          issues,
          "error",
          `${label}的 ${scaleField} 必须大于 0`,
          selection
        );
      }
    }
  }

  for (const [index, item] of (level.items ?? []).entries()) {
    const selection = getObjectSelection("items", item);
    const label = `道具实例「${item.instanceId || `#${index + 1}`}」`;
    if (!item.instanceId) {
      pushIssue(issues, "error", `${label}缺少实例 ID`, selection);
    }
    if (!itemsById[item.itemId]) {
      pushIssue(
        issues,
        "error",
        `${label}引用了不存在的道具 ${item.itemId}`,
        selection
      );
    }
    if (!isFiniteNumber(item.quantity) || Number(item.quantity) <= 0) {
      pushIssue(
        issues,
        "error",
        `${label}的 quantity 必须大于 0`,
        selection
      );
    }
    if (!isFiniteNumber(item.x) || !isFiniteNumber(item.y)) {
      pushIssue(issues, "error", `${label}坐标无效`, selection);
    } else {
      checkBounds(issues, level, item, label, selection, false);
    }
    for (const dimension of ["width", "height"]) {
      if (
        item[dimension] !== undefined &&
        (!isFiniteNumber(item[dimension]) ||
          Number(item[dimension]) <= 0)
      ) {
        pushIssue(
          issues,
          "error",
          `${label}的 ${dimension} 必须大于 0`,
          selection
        );
      }
    }
  }

  const mechanisms = level.mechanisms ?? [];
  const gateIds = new Set(
    mechanisms
      .filter((mechanism) => mechanism.type === "gate")
      .map((gate) => gate.id)
  );
  for (const [index, mechanism] of mechanisms.entries()) {
    const selection = getObjectSelection("mechanisms", mechanism);
    const label = `机关对象「${mechanism.id || `#${index + 1}`}」`;
    if (!mechanism.id) {
      pushIssue(issues, "error", `${label}缺少 ID`, selection);
    }
    if (!mechanismTypes.has(mechanism.type)) {
      pushIssue(
        issues,
        "error",
        `${label}使用了未知类型 ${mechanism.type}`,
        selection
      );
      continue;
    }
    validateRectangle(issues, mechanism, label, selection);
    if (isFiniteNumber(mechanism.x) && isFiniteNumber(mechanism.y)) {
      checkBounds(issues, level, mechanism, label, selection, true);
    }
    getMechanismTypeDefinition(mechanism.type).validator({
      mechanism,
      gateIds,
      label,
      selection,
      isFiniteNumber,
      pushIssue: (severity, message, issueSelection) =>
        pushIssue(issues, severity, message, issueSelection)
    });
  }

  const levelCatalog = new Map(
    (knownLevels ?? []).map((knownLevel) => [
      knownLevel.id,
      {
        ...knownLevel,
        mechanisms: knownLevel.mechanisms ?? []
      }
    ])
  );
  levelCatalog.set(level.id, {
    id: level.id,
    name: level.name,
    spawnPoints: level.spawnPoints,
    mechanisms: level.mechanisms
  });
  for (const knownLevelId of knownLevelIds) {
    if (!levelCatalog.has(knownLevelId)) {
      levelCatalog.set(knownLevelId, {
        id: knownLevelId,
        mechanisms: []
      });
    }
  }

  const exitLocations = new Map();
  for (const knownLevel of levelCatalog.values()) {
    for (const exit of (knownLevel.mechanisms ?? []).filter(
      (mechanism) => mechanism.type === "exit"
    )) {
      const previous = exitLocations.get(exit.id);
      if (previous) {
        pushIssue(
          "error",
          `出口 ID「${exit.id}」在 ${previous.levelId} 和 ${knownLevel.id} 中重复`,
          knownLevel.id === level.id
            ? getObjectSelection("mechanisms", exit)
            : null
        );
      } else {
        exitLocations.set(exit.id, {
          levelId: knownLevel.id,
          exit
        });
      }
    }
  }

  for (const mechanism of mechanisms.filter(
    (item) => item.type === "entrance"
  )) {
    const selection = getObjectSelection("mechanisms", mechanism);
    if (
      mechanism.targetExitId &&
      !exitLocations.has(mechanism.targetExitId)
    ) {
      pushIssue(
        issues,
        "error",
        `入口「${mechanism.id}」指向不存在的出口 ${mechanism.targetExitId}`,
        selection
      );
    }
  }

  const bindingUsage = new Map();
  for (const knownLevel of levelCatalog.values()) {
    for (const entrance of (knownLevel.mechanisms ?? []).filter(
      (mechanism) => mechanism.type === "entrance"
    )) {
      if (!entrance.targetExitId) {
        continue;
      }
      const usage = bindingUsage.get(entrance.targetExitId) ?? [];
      usage.push(`${knownLevel.id}/${entrance.id}`);
      bindingUsage.set(entrance.targetExitId, usage);
    }
  }
  for (const [key, usage] of bindingUsage) {
    if (usage.length <= 1) {
      continue;
    }
    const currentEntrance = mechanisms.find(
      (mechanism) =>
        mechanism.type === "entrance" &&
        mechanism.targetExitId === key
    );
    pushIssue(
      issues,
      "error",
      `出口 ${key} 被多个入口绑定：${usage.join("、")}`,
      currentEntrance
        ? getObjectSelection("mechanisms", currentEntrance)
        : null
    );
  }

  if (!mechanisms.some((mechanism) => mechanism.type === "exit")) {
    pushIssue(
      issues,
      "warning",
      "关卡没有出口机关，玩家将无法通过正常流程离开",
      { section: "level" }
    );
  }

  return issues;
}

export function validateContent({
  actors,
  skills,
  items,
  talents,
  levels
}) {
  const issues = [];
  if (!actors?.player) {
    pushIssue(issues, "error", "actors 缺少 player 定义");
  }
  for (const actor of Object.values(actors ?? {})) {
    if (!actor.stats || !actor.appearance || !actor.physics) {
      pushIssue(
        issues,
        "error",
        `角色 ${actor.id ?? "未知"} 缺少 stats、appearance 或 physics`
      );
    }
    const attackSkillId = actor.combat?.attackSkillId;
    if (attackSkillId && !skills?.[attackSkillId]) {
      pushIssue(
        issues,
        "error",
        `角色 ${actor.id} 引用了不存在的技能 ${attackSkillId}`
      );
    }
  }
  for (const item of Object.values(items ?? {})) {
    if (!item.id || !item.name || !item.appearance) {
      pushIssue(
        issues,
        "error",
        `道具 ${item.id ?? "未知"} 配置不完整`
      );
    }
  }
  for (const talentId of ["guard-duration", "guard-counter"]) {
    const talent = talents?.[talentId];
    if (!talent?.id || !talent.name || !talent.description) {
      pushIssue(
        issues,
        "error",
        `天赋 ${talentId} 配置不完整`
      );
    }
  }

  const levelList = levels ?? [];
  for (const level of levelList) {
    issues.push(
      ...validateLevel(level, {
        catalogs: { actors, items },
        knownLevels: levelList
      }).map((issue) => ({
        ...issue,
        levelId: level.id
      }))
    );
  }
  return issues;
}

export function validateManifest(manifest, levelIds) {
  const issues = [];
  const currentIds = new Set(levelIds);
  if (!Array.isArray(manifest?.levels)) {
    return [
      {
        severity: "error",
        message: "manifest 缺少 levels 数组",
        selection: null
      }
    ];
  }
  const manifestIds = new Set(manifest.levels);
  for (const levelId of manifest.levels) {
    if (!currentIds.has(levelId)) {
      pushIssue(
        issues,
        "error",
        `关卡清单引用了不存在的关卡 ${levelId}`
      );
    }
  }
  for (const levelId of currentIds) {
    if (!manifestIds.has(levelId)) {
      pushIssue(
        issues,
        "error",
        `关卡 ${levelId} 未登记到 manifest.json`
      );
    }
  }
  return issues;
}

export function hasBlockingErrors(issues) {
  return issues.some((issue) => issue.severity === "error");
}

export function assertLevelsValid(options) {
  const issues = validateContent(options);
  if (hasBlockingErrors(issues)) {
    throw new ContractValidationError(issues);
  }
  return issues;
}
