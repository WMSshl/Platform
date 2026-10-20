import { BaseView } from "../../core/ui/BaseView.js";
import { APP_CONFIG } from "../../config/appConfig.js";
import { GameButton } from "../components/GameButton.js";
import { UI_THEME } from "../theme.js";

/**
 * 结算弹窗视图。
 */
export class ResultView extends BaseView {
  constructor(scene, resultData, callbacks) {
    super(scene);

    this.add(
      scene.add
        .rectangle(
          0,
          0,
          APP_CONFIG.width,
          APP_CONFIG.height,
          0x020617,
          0.78
        )
        .setOrigin(0)
        .setInteractive()
    );

    this.add(
      scene.add
        .rectangle(
          APP_CONFIG.width / 2,
          APP_CONFIG.height / 2,
          650,
          450,
          UI_THEME.colors.panel,
          0.99
        )
        .setStrokeStyle(3, UI_THEME.colors.success, 0.7)
    );

    this.add(
      scene.add
        .text(
          APP_CONFIG.width / 2,
          168,
          resultData.title ?? "试玩完成",
          {
            fontFamily: UI_THEME.fontFamily,
            fontSize: "42px",
            fontStyle: "bold",
            color: UI_THEME.colors.success
          }
        )
        .setOrigin(0.5)
    );

    this.add(
      scene.add
        .text(
          APP_CONFIG.width / 2,
          224,
          resultData.subtitle ?? "当前剧情段落已经完成。",
          {
            fontFamily: UI_THEME.fontFamily,
            fontSize: "18px",
            color: UI_THEME.colors.muted
          }
        )
        .setOrigin(0.5)
    );

    const lines = resultData.lines ?? [];
    this.add(
      scene.add.text(390, 280, lines.join("\n"), {
        fontFamily: UI_THEME.fontFamily,
        fontSize: "19px",
        color: UI_THEME.colors.text,
        lineSpacing: 12
      })
    );

    this.add(
      scene.add
        .text(
          APP_CONFIG.width / 2,
          430,
          "本原型采用手动存档；本次结算不会自动覆盖已有存档。",
          {
            fontFamily: UI_THEME.fontFamily,
            fontSize: "15px",
            color: "#64748b"
          }
        )
        .setOrigin(0.5)
    );

    this.add(
      new GameButton(scene, {
        x: APP_CONFIG.width / 2,
        y: 505,
        label: "返回主菜单",
        onClick: callbacks.onMainMenu
      }).container
    );
  }
}
