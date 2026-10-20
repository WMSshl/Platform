import { BaseScene } from "../../core/scene/BaseScene.js";
import { SceneKeys } from "../../constants/SceneKeys.js";
import { ResultView } from "../../ui/views/ResultView.js";

/**
 * 结算弹窗场景。
 */
export class ResultScene extends BaseScene {
  constructor() {
    super(SceneKeys.RESULT);
  }

  create() {
    this.view = new ResultView(this, this.sceneData, {
      onMainMenu: () => this.ctx.router.returnToMenu(this)
    });

    this.input.keyboard.on("keydown-ESC", this.handleMainMenu, this);
    this.addDisposable(() => {
      this.input.keyboard.off("keydown-ESC", this.handleMainMenu, this);
    });
  }

  handleMainMenu() {
    this.ctx.router.returnToMenu(this);
  }
}
