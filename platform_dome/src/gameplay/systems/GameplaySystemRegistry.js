import { MechanismSystem } from "./MechanismSystem.js";

const definitions = [];

export function registerGameplaySystem(definition) {
  if (!definition?.id || typeof definition.create !== "function") {
    throw new Error("玩法系统注册必须提供 id 与 create");
  }
  if (definitions.some((item) => item.id === definition.id)) {
    throw new Error(`玩法系统 ${definition.id} 已经注册`);
  }
  definitions.push(Object.freeze(definition));
  return definition;
}

registerGameplaySystem({
  id: "mechanism",
  create(world) {
    return new MechanismSystem(
      world.scene,
      world.level,
      world.runState,
      world.ctx.eventBus
    );
  },
  install(world, system) {
    world.solidObjects.push(...system.solidObjects);
  },
  update(world) {
    const system = world.gameplaySystems.mechanism;
    let activated = false;
    if (world.input.justDown("interact")) {
      activated = Boolean(system.tryActivate(world.player));
    }
    system.refreshPrompt(world.player);
    return activated;
  }
});

export function installGameplaySystems(world) {
  const systems = (world.gameplaySystems = {});
  for (const definition of definitions) {
    const system = definition.create(world);
    systems[definition.id] = system;
    definition.install?.(world, system);
  }
  return systems;
}

export function updateGameplaySystems(world) {
  let activated = false;
  for (const definition of definitions) {
    if (definition.update?.(world)) {
      activated = true;
    }
  }
  return activated;
}
