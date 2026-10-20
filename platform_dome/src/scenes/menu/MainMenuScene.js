import { BaseScene } from "../../core/scene/BaseScene.js";
import { APP_CONFIG } from "../../config/appConfig.js";
import { SceneKeys } from "../../constants/SceneKeys.js";
import { MainMenuView } from "../../ui/views/MainMenuView.js";

/**
 * 主菜单场景。
 */
export class MainMenuScene extends BaseScene {
  constructor() {
    super(SceneKeys.MAIN_MENU);
  }

  create() {
    this.view = new MainMenuView(this, {
      onNewGame: () => this.startNewGame(),
      onContinue: () => this.continueGame(),
      onTalents: () => this.ctx.router.openTalents(this, SceneKeys.MAIN_MENU)
    });

    this.view.setSaveSummary(
      this.saveService.getSummary(APP_CONFIG.defaultSaveSlot)
    );
    this.cameras.main.fadeIn(220, 0, 0, 0);
  }

  startNewGame() {
    this.ctx.router.startRun(this, {
      levelId: APP_CONFIG.initialLevelId,
      resetPlayerPosition: true
    });
  }

  continueGame() {
    const envelope = this.saveService.load(APP_CONFIG.defaultSaveSlot);
    if (!envelope) {
      this.view.setStatus("没有可读取的手动存档。", true);
      return;
    }

    try {
      this.ctx.dataRepository.getLevel(envelope.data.levelId);
    } catch (error) {
      this.view.setStatus(`存档引用的关卡不存在：${error.message}`, true);
      return;
    }

    this.ctx.router.startRun(this, {
      levelId: envelope.data.levelId,
      runState: envelope.data,
      resetPlayerPosition: false
    });
  }
}
