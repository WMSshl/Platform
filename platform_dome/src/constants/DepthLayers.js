/**
 * 世界内的绘制层级。
 *
 * 数值越大越靠前。集中管理可以避免角色被背景挡住、
 * 或者特效盖住暂停界面这类难以排查的问题。
 */
export const DepthLayers = Object.freeze({
  BACKGROUND: 0,
  SOLID: 10,
  ITEM: 20,
  ACTOR: 30,
  ATTACK_EFFECT: 40,
  HUD: 100
});
