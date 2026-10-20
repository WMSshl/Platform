/**
 * Phaser Registry 中使用的键名。
 *
 * Registry 是 Phaser 提供给多个场景共享对象的容器。
 * 我们只把完整的 GameContext 放进去，避免散落大量隐式全局变量。
 */
export const RegistryKeys = Object.freeze({
  CONTEXT: "platform-dome.game-context"
});
