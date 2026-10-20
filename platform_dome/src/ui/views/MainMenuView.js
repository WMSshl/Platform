import { BaseView } from "../../core/ui/BaseView.js";
import { APP_CONFIG } from "../../config/appConfig.js";
import { GameButton } from "../components/GameButton.js";
import { UI_THEME } from "../theme.js";

/**
 * 主菜单视图。
 *
 * 视图只创建界面，并把“开始”“继续”交给 MainMenuScene 处理。
 */
export class MainMenuView extends BaseView {
  constructor(scene, callbacks) {
    super(scene);

    this.add(
      scene.add
        .rectangle(0, 0, APP_CONFIG.width, APP_CONFIG.height, 0x020617)
        .setOrigin(0)
    );

    // 纯色几何装饰用于在没有正式美术时建立空间层次。
    this.add(
      scene.add
        .rectangle(120, 110, 8, 500, UI_THEME.colors.primary, 0.65)
        .setOrigin(0)
    );
    this.add(
      scene.add
        .circle(1030, 220, 180, 0x0f172a, 0.75)
        .setStrokeStyle(2, 0x1e3a5f, 0.6)
    );
    this.add(
      scene.add
        .circle(1080, 570, 250, 0x082f49, 0.28)
        .setStrokeStyle(2, 0x0e7490, 0.3)
    );

    this.add(
      scene.add.text(170, 120, "穹顶回响", {
        fontFamily: UI_THEME.fontFamily,
        fontSize: "72px",
        fontStyle: "bold",
        color: UI_THEME.colors.text
      })
    );

    this.add(
      scene.add.text(174, 214, "ECHOES UNDER THE DOME", {
        fontFamily: UI_THEME.fontFamily,
        fontSize: "18px",
        letterSpacing: 6,
        color: "#38bdf8"
      })
    );

    this.add(
      scene.add.text(
        174,
        272,
        "横版剧情动作原型 · 数据驱动角色与地图 · 手动存档",
        {
          fontFamily: UI_THEME.fontFamily,
          fontSize: "18px",
          color: UI_THEME.colors.muted
        }
      )
    );

    this.newGameButton = new GameButton(scene, {
      x: 320,
      y: 390,
      label: "开始新游戏",
      onClick: callbacks.onNewGame
    });
    this.add(this.newGameButton.container);

    this.continueButton = new GameButton(scene, {
      x: 320,
      y: 468,
      label: "继续游戏",
      primary: false,
      onClick: callbacks.onContinue
    });
    this.add(this.continueButton.container);

    this.talentsButton = new GameButton(scene, {
      x: 320,
      y: 546,
      label: "天赋",
      primary: false,
      onClick: callbacks.onTalents
    });
    this.add(this.talentsButton.container);

    this.saveInfoText = this.add(
      scene.add.text(490, 468, "尚未找到手动存档", {
        fontFamily: UI_THEME.fontFamily,
        fontSize: "16px",
        color: UI_THEME.colors.muted
      }).setOrigin(0, 0.5)
    );

    this.add(
      scene.add.text(
        172,
        630,
        "移动：A / D    加速：Shift    跳跃：Space / W    攻击：J / 左键    防御：K    交互：E    暂停：Esc",
        {
          fontFamily: UI_THEME.fontFamily,
          fontSize: "16px",
          color: "#64748b"
        }
      )
    );

    this.add(
      scene.add.text(
        APP_CONFIG.width - 36,
        APP_CONFIG.height - 30,
        `原型版本 ${APP_CONFIG.version}`,
        {
          fontFamily: UI_THEME.fontFamily,
          fontSize: "14px",
          color: "#475569"
        }
      ).setOrigin(1, 1)
    );
  }

  setSaveSummary(saveSummary) {
    const hasSave = Boolean(saveSummary);
    this.continueButton.setEnabled(hasSave);

    if (!hasSave) {
      this.saveInfoText.setText("尚未找到手动存档");
      return;
    }

    const savedAt = new Date(saveSummary.savedAt).toLocaleString("zh-CN");
    this.saveInfoText.setText(`最近存档：${savedAt}`);
  }

  setStatus(message, isError = false) {
    this.saveInfoText.setText(message);
    this.saveInfoText.setColor(
      isError ? UI_THEME.colors.danger : UI_THEME.colors.muted
    );
  }
}
