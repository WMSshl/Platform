import { SceneKeys } from "../../constants/SceneKeys.js";

/**
 * 场景流程控制器。
 *
 * 把“暂停游戏并打开弹窗”“返回主菜单”等流程集中在这里，
 * 避免每个 UI 文件都自己拼接 scene.stop / scene.start 的顺序。
 */
export class SceneRouter {
  startRun(scene, options = {}) {
    scene.scene.stop(SceneKeys.HUD);
    scene.scene.stop(SceneKeys.PAUSE);
    scene.scene.stop(SceneKeys.RESULT);
    scene.scene.launch(SceneKeys.HUD);
    scene.scene.start(SceneKeys.GAME, options);
  }

  openPause(scene) {
    const gameScene = scene.scene.get(SceneKeys.GAME);
    if (gameScene?.setGameplayInputEnabled) {
      gameScene.setGameplayInputEnabled(false);
    }

    if (!scene.scene.isActive(SceneKeys.PAUSE)) {
      scene.scene.pause(SceneKeys.GAME);
      scene.scene.launch(SceneKeys.PAUSE);
    }
  }

  openTalents(scene, returnSceneKey) {
    if (scene.scene.isActive(SceneKeys.TALENTS)) {
      return;
    }

    scene.scene.pause(returnSceneKey);
    scene.scene.launch(SceneKeys.TALENTS, { returnSceneKey });
  }

  resumeRun(scene) {
    const gameScene = scene.scene.get(SceneKeys.GAME);
    scene.scene.stop(SceneKeys.PAUSE);
    scene.scene.resume(SceneKeys.GAME);

    if (gameScene?.setGameplayInputEnabled) {
      gameScene.setGameplayInputEnabled(true);
    }
  }

  returnToMenu(scene) {
    scene.scene.stop(SceneKeys.PAUSE);
    scene.scene.stop(SceneKeys.RESULT);
    scene.scene.stop(SceneKeys.HUD);
    scene.scene.stop(SceneKeys.GAME);
    scene.scene.start(SceneKeys.MAIN_MENU);
  }

  showResult(scene, resultData) {
    const gameScene = scene.scene.get(SceneKeys.GAME);
    if (gameScene?.setGameplayInputEnabled) {
      gameScene.setGameplayInputEnabled(false);
    }

    scene.scene.pause(SceneKeys.GAME);
    scene.scene.launch(SceneKeys.RESULT, resultData);
  }
}
