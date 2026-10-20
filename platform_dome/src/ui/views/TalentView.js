import { BaseView } from "../../core/ui/BaseView.js";
import { APP_CONFIG } from "../../config/appConfig.js";
import { GameButton } from "../components/GameButton.js";
import { UI_THEME } from "../theme.js";

/**
 * 天赋页视图。
 *
 * 当前只列出格挡系的两个开关；后续新增天赋时，
 * 继续从 talents.json 生成行即可。
 */
export class TalentView extends BaseView {
  constructor(scene, talents, talentService, callbacks) {
    super(scene);
    this.talents = Object.values(talents ?? {});
    this.talentService = talentService;
    this.callbacks = callbacks;
    this.toggleWidgets = new Map();

    this.add(
      scene.add
        .rectangle(
          0,
          0,
          APP_CONFIG.width,
          APP_CONFIG.height,
          0x020617,
          0.84
        )
        .setOrigin(0)
        .setInteractive()
    );

    this.add(
      scene.add
        .rectangle(
          APP_CONFIG.width / 2,
          APP_CONFIG.height / 2,
          760,
          500,
          UI_THEME.colors.panel,
          0.99
        )
        .setStrokeStyle(3, UI_THEME.colors.primary, 0.7)
    );

    this.add(
      scene.add
        .text(APP_CONFIG.width / 2, 150, "天赋", {
          fontFamily: UI_THEME.fontFamily,
          fontSize: "42px",
          fontStyle: "bold",
          color: UI_THEME.colors.text
        })
        .setOrigin(0.5)
    );

    this.add(
      scene.add
        .text(
          APP_CONFIG.width / 2,
          196,
          "格挡强化 · 开关会立即生效并自动保存",
          {
            fontFamily: UI_THEME.fontFamily,
            fontSize: "16px",
            color: UI_THEME.colors.muted
          }
        )
        .setOrigin(0.5)
    );

    this.talents.forEach((talent, index) => {
      this.createTalentRow(talent, 286 + index * 112);
    });

    this.add(
      new GameButton(scene, {
        x: APP_CONFIG.width / 2,
        y: 548,
        label: "返回",
        onClick: callbacks.onClose
      }).container
    );

    this.add(
      scene.add
        .text(
          APP_CONFIG.width / 2,
          618,
          "Esc 返回上一页",
          {
            fontFamily: UI_THEME.fontFamily,
            fontSize: "15px",
            color: "#64748b"
          }
        )
        .setOrigin(0.5)
    );
  }

  createTalentRow(talent, y) {
    const centerX = APP_CONFIG.width / 2;
    const enabled = this.talentService.isEnabled(talent.id);

    this.add(
      this.scene.add
        .rectangle(centerX, y, 660, 96, 0x1e293b, 1)
        .setStrokeStyle(2, UI_THEME.colors.border, 1)
    );

    this.add(
      this.scene.add
        .text(350, y - 20, talent.name, {
          fontFamily: UI_THEME.fontFamily,
          fontSize: "24px",
          fontStyle: "bold",
          color: UI_THEME.colors.text
        })
        .setOrigin(0, 0.5)
    );

    this.add(
      this.scene.add
        .text(350, y + 14, talent.description, {
          fontFamily: UI_THEME.fontFamily,
          fontSize: "16px",
          color: UI_THEME.colors.muted,
          wordWrap: { width: 420 }
        })
        .setOrigin(0, 0.5)
    );

    const toggleX = 850;
    const toggleBackground = this.scene.add
      .rectangle(
        toggleX,
        y,
        92,
        40,
        enabled ? 0x166534 : 0x334155,
        1
      )
      .setStrokeStyle(2, enabled ? 0x4ade80 : 0x64748b, 0.9)
      .setInteractive({ useHandCursor: true });
    const knob = this.scene.add.circle(
      toggleX + (enabled ? 24 : -24),
      y,
      14,
      enabled ? 0xbbf7d0 : 0xcbd5e1,
      1
    );
    const stateText = this.scene.add
      .text(toggleX, y + 38, enabled ? "已开启" : "未开启", {
        fontFamily: UI_THEME.fontFamily,
        fontSize: "14px",
        color: enabled ? UI_THEME.colors.success : UI_THEME.colors.muted
      })
      .setOrigin(0.5);

    this.add(toggleBackground);
    this.add(knob);
    this.add(stateText);

    this.toggleWidgets.set(talent.id, {
      background: toggleBackground,
      knob,
      stateText
    });

    toggleBackground.on("pointerup", () => {
      this.callbacks.onToggle(
        talent.id,
        !this.talentService.isEnabled(talent.id)
      );
    });
  }

  setTalentEnabled(talentId, enabled) {
    const widget = this.toggleWidgets.get(talentId);
    if (!widget) {
      return;
    }

    widget.background.setFillStyle(
      enabled ? 0x166534 : 0x334155,
      1
    );
    widget.background.setStrokeStyle(
      2,
      enabled ? 0x4ade80 : 0x64748b,
      0.9
    );
    widget.knob.setPosition(850 + (enabled ? 24 : -24), widget.knob.y);
    widget.knob.setFillStyle(enabled ? 0xbbf7d0 : 0xcbd5e1, 1);
    widget.stateText.setText(enabled ? "已开启" : "未开启");
    widget.stateText.setColor(
      enabled ? UI_THEME.colors.success : UI_THEME.colors.muted
    );
  }
}
