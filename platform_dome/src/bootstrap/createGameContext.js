import { EventBus } from "../core/events/EventBus.js";
import { GameStore } from "../core/state/Store.js";
import { SceneRouter } from "../core/scene/SceneRouter.js";
import { SaveService } from "../services/save/SaveService.js";
import { TalentService } from "../services/talents/TalentService.js";
import { createEmptyRunState } from "../state/initialState.js";

/**
 * 创建全局依赖。
 *
 * GameContext 是场景共享的“服务工具箱”。
 * dataRepository 会在 PreloadScene 读取 JSON 后挂到同一个对象上。
 */
export function createGameContext({
  levelIds = ["level-001", "level-002"]
} = {}) {
  return {
    levelIds: [...levelIds],
    eventBus: new EventBus(),
    store: new GameStore(createEmptyRunState()),
    saveService: new SaveService(),
    talentService: new TalentService(),
    router: new SceneRouter(),
    dataRepository: null
  };
}
