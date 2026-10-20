/**
 * 应用级配置。
 *
 * 这里只放“引擎与开发工具相关”的参数，不放角色生命、攻击力等游戏数值。
 * 角色和技能数值应放在 data/configs 中，才能支持后续地图编辑器和内容扩充。
 */
export const APP_CONFIG = Object.freeze({
  title: "穹顶回响",
  version: "0.1.0",
  width: 1280,
  height: 720,
  backgroundColor: "#020617",
  gravityY: 1800,
  defaultSaveSlot: 0,
  saveVersion: 2,
  initialLevelId: "level-001",
  debugPhysics: false,

  /**
   * 物理按键与“游戏动作”的映射。
   * 角色代码只认识 left、jump、attack 等动作，不直接判断某个键。
   * 以后增加手柄或手机触屏时，只需要新增一种 InputService 适配器。
   */
  inputBindings: Object.freeze({
    left: ["A", "LEFT"],
    right: ["D", "RIGHT"],
    down: ["S", "DOWN"],
    jump: ["SPACE", "W", "UP"],
    attack: ["J"],
    guard: ["K"],
    sprint: ["SHIFT"],
    interact: ["E"],
    pause: ["ESC"]
  })
});
