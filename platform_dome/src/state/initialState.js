/**
 * 一局游戏的最小状态结构。
 *
 * player 的具体数值会在 GameWorld 读取角色配置后填入。
 * story、quests 和 world 使用字典结构，后续增加剧情节点或机关时不需要改存档外层格式。
 */
export function createEmptyRunState() {
  return {
    levelId: null,
    player: null,
    story: {
      chapterId: null,
      flags: {}
    },
    quests: {},
    world: {
      mechanismStates: {},
      defeatedEnemyIds: [],
      collectedItemIds: []
    }
  };
}
