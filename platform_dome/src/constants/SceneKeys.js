/**
 * 所有场景编号。
 *
 * 场景名称集中定义后，代码中就不会出现 "GameScene" 这类容易拼错的裸字符串。
 */
export const SceneKeys = Object.freeze({
  BOOT: "BootScene",
  PRELOAD: "PreloadScene",
  MAIN_MENU: "MainMenuScene",
  GAME: "GameScene",
  HUD: "HudScene",
  PAUSE: "PauseScene",
  RESULT: "ResultScene",
  TALENTS: "TalentScene"
});
