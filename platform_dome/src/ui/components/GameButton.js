import { UI_THEME } from "../theme.js";

/**
 * 通用按钮。
 *
 * 按钮只负责视觉反馈和触发回调，不直接执行“开始游戏”或“保存”等业务。
 * 具体业务由场景传入 onClick，便于同一个按钮复用于不同界面。
 */
export class GameButton {
  constructor(scene, options) {
    this.scene = scene;
    this.enabled = true;
    this.options = {
      width: 310,
      height: 58,
      primary: true,
      ...options
    };

    const fillColor = this.options.primary
      ? UI_THEME.colors.primary
      : UI_THEME.colors.panelSoft;

    this.background = scene.add
      .rectangle(
        0,
        0,
        this.options.width,
        this.options.height,
        fillColor,
        0.95
      )
      .setStrokeStyle(2, 0x7dd3fc, 0.7)
      .setInteractive({ useHandCursor: true });

    this.label = scene.add
      .text(0, 0, this.options.label, {
        fontFamily: UI_THEME.fontFamily,
        fontSize: "22px",
        fontStyle: "bold",
        color: this.options.primary ? "#082f49" : UI_THEME.colors.text
      })
      .setOrigin(0.5);

    this.container = scene.add.container(
      this.options.x,
      this.options.y,
      [this.background, this.label]
    );

    this.background.on("pointerover", () => {
      if (this.enabled) {
        this.background.setFillStyle(
          this.options.primary
            ? UI_THEME.colors.primaryHover
            : UI_THEME.colors.border,
          1
        );
      }
    });

    this.background.on("pointerout", () => {
      this.restoreColor();
    });

    this.background.on("pointerup", () => {
      if (this.enabled) {
        this.options.onClick?.();
      }
    });
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (enabled) {
      this.background.setInteractive({ useHandCursor: true });
    } else {
      this.background.disableInteractive();
    }
    this.container.setAlpha(enabled ? 1 : 0.45);
    this.restoreColor();
  }

  setLabel(label) {
    this.label.setText(label);
  }

  restoreColor() {
    this.background.setFillStyle(
      this.options.primary
        ? UI_THEME.colors.primary
        : UI_THEME.colors.panelSoft,
      0.95
    );
  }

  destroy() {
    this.container.destroy();
  }
}
