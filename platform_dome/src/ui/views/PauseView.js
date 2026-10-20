import { BaseView } from "../../core/ui/BaseView.js";
import { APP_CONFIG } from "../../config/appConfig.js";
import { GameButton } from "../components/GameButton.js";
import { UI_THEME } from "../theme.js";

/**
 * 暂停菜单视图。
 */
export class PauseView extends BaseView {
  constructor(scene, callbacks) {
    super(scene);

    this.add(
      scene.add
        .rectangle(
          0,
          0,
          APP_CONFIG.width,
          APP_CONFIG.height,
          0x020617,
          0.72
        )
        .setOrigin(0)
        .setInteractive()
    );

    this.add(
      scene.add
        .rectangle(
          APP_CONFIG.width / 2,
          APP_CONFIG.height / 2,
          520,
          520,
          UI_THEME.colors.panel,
          0.98
        )
        .setStrokeStyle(2, UI_THEME.colors.border, 1)
    );

    this.add(
      scene.add
        .text(APP_CONFIG.width / 2, 150, "游戏暂停", {
          fontFamily: UI_THEME.fontFamily,
          fontSize: "38px",
          fontStyle: "bold",
          color: UI_THEME.colors.text
        })
        .setOrigin(0.5)
    );

    this.add(
      scene.add
        .text(APP_CONFIG.width / 2, 194, "手动存档会记录当前角色位置与世界状态", {
          fontFamily: UI_THEME.fontFamily,
          fontSize: "16px",
          color: UI_THEME.colors.muted
        })
        .setOrigin(0.5)
    );

    this.add(
      new GameButton(scene, {
        x: APP_CONFIG.width / 2,
        y: 270,
        label: "继续游戏",
        onClick: callbacks.onResume
      }).container
    );

    this.add(
      new GameButton(scene, {
        x: APP_CONFIG.width / 2,
        y: 342,
        label: "保存到手动存档位 1",
        primary: false,
        onClick: callbacks.onSave
      }).container
    );

    this.add(
      new GameButton(scene, {
        x: APP_CONFIG.width / 2,
        y: 414,
        label: "天赋",
        primary: false,
        onClick: callbacks.onTalents
      }).container
    );

    this.add(
      new GameButton(scene, {
        x: APP_CONFIG.width / 2,
        y: 486,
        label: "返回主菜单",
        primary: false,
        onClick: callbacks.onMainMenu
      }).container
    );

    this.saveStatusText = this.add(
      scene.add
        .text(APP_CONFIG.width / 2, 556, "Esc 可继续游戏", {
          fontFamily: UI_THEME.fontFamily,
          fontSize: "16px",
          color: UI_THEME.colors.muted
        })
        .setOrigin(0.5)
    );
  }

  setSaveStatus(message, isError = false) {
    this.saveStatusText.setText(message);
    this.saveStatusText.setColor(
      isError ? UI_THEME.colors.danger : UI_THEME.colors.success
    );
  }
}
