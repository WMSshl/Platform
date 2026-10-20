import { RegistryKeys } from "../../constants/RegistryKeys.js";
import {
  assertLevelsValid,
  normalizeLevel
} from "../../contract/index.js";

export const DATA_CACHE_KEYS = Object.freeze({
  ACTORS: "config:actors",
  SKILLS: "config:skills",
  ITEMS: "config:items",
  TALENTS: "config:talents"
});

export function getLevelCacheKey(levelId) {
  return `level:${levelId}`;
}

export class ContractGameDataRepository {
  constructor(game) {
    this.game = game;
    this.levels = new Map();
  }

  getActors() {
    return this.game.cache.json.get(DATA_CACHE_KEYS.ACTORS);
  }

  getActor(actorId) {
    const actor = this.getActors()?.[actorId];
    if (!actor) {
      throw new Error(`找不到角色定义：${actorId}`);
    }
    return structuredClone(actor);
  }

  getSkills() {
    return this.game.cache.json.get(DATA_CACHE_KEYS.SKILLS);
  }

  getSkill(skillId) {
    const skill = this.getSkills()?.[skillId];
    if (!skill) {
      throw new Error(`找不到技能定义：${skillId}`);
    }
    return structuredClone(skill);
  }

  getItems() {
    return this.game.cache.json.get(DATA_CACHE_KEYS.ITEMS);
  }

  getItem(itemId) {
    const item = this.getItems()?.[itemId];
    if (!item) {
      throw new Error(`找不到道具定义：${itemId}`);
    }
    return structuredClone(item);
  }

  getTalents() {
    return this.game.cache.json.get(DATA_CACHE_KEYS.TALENTS);
  }

  getTalent(talentId) {
    const talent = this.getTalents()?.[talentId];
    if (!talent) {
      throw new Error(`找不到天赋定义：${talentId}`);
    }
    return structuredClone(talent);
  }

  getLevel(levelId) {
    let level = this.levels.get(levelId);
    if (!level) {
      const cached = this.game.cache.json.get(
        getLevelCacheKey(levelId)
      );
      if (!cached) {
        throw new Error(`找不到关卡数据：${levelId}`);
      }
      level = normalizeLevel(cached);
      this.levels.set(levelId, level);
    }
    return structuredClone(level);
  }

  getLevelIds() {
    const context = this.game.registry.get(RegistryKeys.CONTEXT);
    return [...(context?.levelIds ?? [])];
  }

  getPortalLocation(portalType, portalId) {
    for (const levelId of this.getLevelIds()) {
      const level = this.getLevel(levelId);
      const portal = (level.mechanisms ?? []).find(
        (mechanism) =>
          mechanism.type === portalType &&
          mechanism.id === portalId
      );
      if (portal) {
        return { levelId, portal };
      }
    }
    throw new Error(`找不到 ${portalType} ${portalId}`);
  }

  getExitLocation(exitId) {
    return this.getPortalLocation("exit", exitId);
  }

  validate() {
    const actors = this.getActors();
    const skills = this.getSkills();
    const items = this.getItems();
    const talents = this.getTalents();
    const levels = this.getLevelIds().map((levelId) =>
      this.getLevel(levelId)
    );

    const issues = assertLevelsValid({
      actors,
      skills,
      items,
      talents,
      levels
    });
    return issues;
  }
}
