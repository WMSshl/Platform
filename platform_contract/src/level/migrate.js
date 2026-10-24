import {
  CURRENT_LEVEL_SCHEMA_VERSION,
  normalizeSolidTerrainType
} from "./schema.js";

function clone(value) {
  return structuredClone(value);
}

export function createEmptyLevel(levelId = "level-003") {
  return {
    schemaVersion: CURRENT_LEVEL_SCHEMA_VERSION,
    id: levelId,
    name: "未命名关卡",
    world: {
      width: 2400,
      height: 1200,
      backgroundColor: "#0f172a"
    },
    camera: {
      lerpX: 0.1,
      lerpY: 0.12,
      deadzoneWidth: 180,
      deadzoneHeight: 110
    },
    backgroundMusic: null,
    spawnPoints: [
      {
        id: "spawn-start",
        name: "默认出生点",
        x: 160,
        y: 1020
      }
    ],
    initialSpawnId: "spawn-start",
    solids: [
      {
        id: "ground",
        x: 1200,
        y: 1150,
        width: 2400,
        height: 100,
        terrainType: "ground",
        color: "#334155"
      }
    ],
    actors: [],
    items: [],
    mechanisms: []
  };
}

function migrateVersion3ToVersion4(level) {
  return {
    ...level,
    backgroundMusic: level.backgroundMusic ?? null
  };
}

function normalizeBackgroundMusic(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value ?? null;
  }
  const volume = Number(value.volume);
  return {
    ...value,
    volume: Number.isFinite(volume)
      ? Math.min(1, Math.max(0, volume))
      : 1,
    loop: typeof value.loop === "boolean" ? value.loop : true
  };
}

function migrateVersion4ToVersion5(level) {
  return {
    ...level,
    backgroundMusic: normalizeBackgroundMusic(
      level.backgroundMusic
    )
  };
}

export function migrateLevelDocument(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("关卡文件必须是 JSON 对象");
  }
  const sourceVersion = input.schemaVersion;
  if (
    sourceVersion !== undefined &&
    (!Number.isInteger(sourceVersion) ||
      sourceVersion < 1 ||
      sourceVersion > CURRENT_LEVEL_SCHEMA_VERSION)
  ) {
    throw new Error(
      `不支持的关卡 schemaVersion：${sourceVersion}；当前版本为 ${CURRENT_LEVEL_SCHEMA_VERSION}`
    );
  }
  let migrated = clone(input);
  let version = migrated.schemaVersion ?? 1;
  if (version <= 3) {
    migrated = migrateVersion3ToVersion4(migrated);
    version = 4;
  }
  if (version <= 4) {
    migrated = migrateVersion4ToVersion5(migrated);
  }
  migrated.schemaVersion = CURRENT_LEVEL_SCHEMA_VERSION;
  return normalizeLevel(migrated);
}

export function normalizeLevel(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("关卡文件必须是 JSON 对象");
  }

  const defaults = createEmptyLevel(input.id ?? "level-003");
  const level = {
    ...defaults,
    ...clone(input),
    schemaVersion: CURRENT_LEVEL_SCHEMA_VERSION,
    world: {
      ...defaults.world,
      ...(input.world ?? {})
    },
    camera: {
      ...defaults.camera,
      ...(input.camera ?? {})
    }
  };
  level.backgroundMusic =
    input.backgroundMusic === undefined ||
    input.backgroundMusic === null
      ? null
      : normalizeBackgroundMusic(clone(input.backgroundMusic));
  const legacyBackgroundAsset = level.world.backgroundAsset;
  const legacyBackgroundMap = level.world.backgroundMap;
  if (level.world.background?.type === "tiled") {
    const {
      x: _legacyX,
      y: _legacyY,
      scaleX: _legacyScaleX,
      scaleY: _legacyScaleY,
      fit: _legacyFit,
      ...backgroundMap
    } = level.world.background;
    level.world.background = {
      ...backgroundMap,
      type: "tiled"
    };
  } else if (!level.world.background && legacyBackgroundMap) {
    const {
      x: _legacyX,
      y: _legacyY,
      scaleX: _legacyScaleX,
      scaleY: _legacyScaleY,
      fit: _legacyFit,
      ...backgroundMap
    } = legacyBackgroundMap;
    level.world.background = {
      ...backgroundMap,
      type: "tiled"
    };
  } else if (!level.world.background && legacyBackgroundAsset) {
    level.world.background = {
      ...legacyBackgroundAsset,
      type: "image"
    };
  }
  delete level.world.backgroundAsset;
  delete level.world.backgroundMap;

  delete level.story;
  delete level.quest;

  const legacySpawn = input.playerSpawn
    ? [
        {
          id: input.playerSpawn.id ?? "spawn-start",
          name: input.playerSpawn.name ?? "默认出生点",
          x: input.playerSpawn.x,
          y: input.playerSpawn.y
        }
      ]
    : [];
  level.spawnPoints = Array.isArray(input.spawnPoints)
    ? input.spawnPoints.map(clone)
    : clone(legacySpawn);
  if (level.spawnPoints.length === 0) {
    level.spawnPoints = clone(defaults.spawnPoints);
  }
  level.initialSpawnId =
    input.initialSpawnId &&
    level.spawnPoints.some((spawn) => spawn.id === input.initialSpawnId)
      ? input.initialSpawnId
      : level.spawnPoints[0].id;
  delete level.playerSpawn;

  const mechanismSources = [];
  if (Array.isArray(input.mechanisms)) {
    mechanismSources.push(
      ...input.mechanisms.map((item) => ({
        ...clone(item),
        type: item.type ?? "switch"
      }))
    );
  }
  for (const [legacyKey, type] of [
    ["gates", "gate"],
    ["entrances", "entrance"],
    ["exits", "exit"]
  ]) {
    if (Array.isArray(input[legacyKey])) {
      mechanismSources.push(
        ...input[legacyKey].map((item) => ({
          ...clone(item),
          type
        }))
      );
    }
  }

  const usedMechanismIds = new Set();
  level.mechanisms = mechanismSources.map((mechanism) => {
    let id = mechanism.id || "mechanism-1";
    let suffix = 2;
    while (usedMechanismIds.has(id)) {
      id = `${mechanism.id || "mechanism"}-${suffix}`;
      suffix += 1;
    }
    usedMechanismIds.add(id);
    if (mechanism.type === "exit") {
      return {
        ...mechanism,
        id,
        targetEntranceId: undefined,
        requiredMechanismId: undefined,
        nextLevelId: undefined,
        nextEntranceId: undefined
      };
    }
    if (mechanism.type === "entrance") {
      return {
        ...mechanism,
        id,
        activation: mechanism.activation ?? "player-center-touch",
        targetExitId: mechanism.targetExitId ?? null,
        targetEntranceId: undefined
      };
    }
    return { ...mechanism, id };
  });
  delete level.gates;
  delete level.entrances;
  delete level.exits;

  level.solids = Array.isArray(input.solids)
    ? input.solids.map(clone)
    : [];
  level.actors = Array.isArray(input.actors)
    ? input.actors.map(clone)
    : [];
  level.items = Array.isArray(input.items)
    ? input.items.map(clone)
    : [];

  level.solids = level.solids.map((solid) => ({
    ...solid,
    terrainType: normalizeSolidTerrainType(solid.terrainType)
  }));
  level.actors = level.actors.map((actor) => {
    const legacyScale =
      Number.isFinite(Number(actor.scale)) &&
      Number(actor.scale) > 0
        ? Number(actor.scale)
        : 1;
    const scaleX =
      Number.isFinite(Number(actor.scaleX)) &&
      Number(actor.scaleX) > 0
        ? Number(actor.scaleX)
        : legacyScale;
    const scaleY =
      Number.isFinite(Number(actor.scaleY)) &&
      Number(actor.scaleY) > 0
        ? Number(actor.scaleY)
        : legacyScale;
    const { scale: _legacyScale, ...rest } = actor;
    return { ...rest, scaleX, scaleY };
  });

  return level;
}
