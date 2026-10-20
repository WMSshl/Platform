import { BaseScene } from "../../core/scene/BaseScene.js";
import { APP_CONFIG } from "../../config/appConfig.js";
import { SceneKeys } from "../../constants/SceneKeys.js";
import { PauseView } from "../../ui/views/PauseView.js";

/**
 * 暂停弹窗场景。
 */
export class PauseScene extends BaseScene {
  constructor() {
    super(SceneKeys.PAUSE);
  }

  create() {
    this.view = new PauseView(this, {
      onResume: () => this.ctx.router.resumeRun(this),
      onSave: () => this.saveGame(),
      onTalents: () => this.ctx.router.openTalents(this, SceneKeys.PAUSE),
      onMainMenu: () => this.ctx.router.returnToMenu(this)
    });

    this.input.keyboard.on("keydown-ESC", this.handleResume, this);
    this.addDisposable(() => {
      this.input.keyboard.off("keydown-ESC", this.handleResume, this);
    });
  }

  handleResume() {
    if (this.scene.isActive(SceneKeys.TALENTS)) {
      return;
    }
    this.ctx.router.resumeRun(this);
  }

  saveGame() {
    try {
      const gameScene = this.scene.get(SceneKeys.GAME);
      const snapshot = gameScene.createSaveSnapshot();
      const envelope = this.saveService.save(
        APP_CONFIG.defaultSaveSlot,
        snapshot
      );
      const savedAt = new Date(envelope.savedAt).toLocaleTimeString("zh-CN");
      this.view.setSaveStatus(`存档成功：${savedAt}`);
    } catch (error) {
      console.error(error);
      this.view.setSaveStatus(`存档失败：${error.message}`, true);
    }
  }
}
