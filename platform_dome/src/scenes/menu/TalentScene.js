import { BaseScene } from "../../core/scene/BaseScene.js";
import { SceneKeys } from "../../constants/SceneKeys.js";
import { TalentView } from "../../ui/views/TalentView.js";

/**
 * 天赋页弹窗。
 *
 * 从主菜单或暂停菜单打开；打开时暂停来源场景，
 * 关闭后恢复来源场景，不改变游戏世界的暂停状态。
 */
export class TalentScene extends BaseScene {
  constructor() {
    super(SceneKeys.TALENTS);
    this.returnSceneKey = SceneKeys.MAIN_MENU;
  }

  create() {
    this.returnSceneKey =
      this.sceneData.returnSceneKey ?? SceneKeys.MAIN_MENU;

    this.view = new TalentView(
      this,
      this.ctx.dataRepository.getTalents(),
      this.ctx.talentService,
      {
        onToggle: (talentId, enabled) => {
          this.ctx.talentService.setEnabled(talentId, enabled);
          this.view.setTalentEnabled(talentId, enabled);
        },
        onClose: () => this.close()
      }
    );

    this.input.keyboard.on("keydown-ESC", this.handleClose, this);
    this.addDisposable(() => {
      this.input.keyboard.off("keydown-ESC", this.handleClose, this);
    });
  }

  handleClose() {
    this.close();
  }

  close() {
    this.scene.stop(SceneKeys.TALENTS);
    this.scene.resume(this.returnSceneKey);
  }
}
