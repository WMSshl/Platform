/**
 * 跨模块事件名称。
 *
 * 事件用于“一个模块发生变化，其他模块需要知道”的场景。
 * 例如玩家掉血后，HUD、音效和成就系统都可以响应。
 *
 * 高频数据（例如每一帧的坐标）不要走事件总线，直接在系统内部读取。
 */
export const EventNames = Object.freeze({
  PLAYER_STATS_CHANGED: "player:stats-changed",
  PLAYER_HEALTH_CHANGED: "player:health-changed",
  PLAYER_DIED: "player:died",
  INVENTORY_CHANGED: "inventory:changed",
  QUEST_CHANGED: "quest:changed",
  MECHANISM_CHANGED: "mechanism:changed",
  INTERACTION_PROMPT: "interaction:prompt",
  LEVEL_EXITED: "level:exited",
  SAVE_COMPLETED: "save:completed",
  UI_TOAST: "ui:toast"
});
