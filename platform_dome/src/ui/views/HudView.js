import { BaseView } from "../../core/ui/BaseView.js";
import { APP_CONFIG } from "../../config/appConfig.js";
import { UI_THEME } from "../theme.js";

/**
 * 游戏内 HUD。
 *
 * HUD 只读取传入的数据并绘制，不直接访问玩家实体。
 * 后续做触屏版时，这套信息层可以原样复用。
 */
export class HudView extends BaseView {
  constructor(scene, dataRepository) {
    super(scene);
    this.dataRepository = dataRepository;
    this.toastTimer = null;

    this.add(
      scene.add
        .rectangle(24, 18, 420, 238, 0x020617, 0.82)
        .setOrigin(0)
        .setStrokeStyle(2, UI_THEME.colors.border, 0.9)
    );

    this.healthBarGraphics = this.add(scene.add.graphics());
    this.staminaBarGraphics = this.add(scene.add.graphics());

    this.healthText = this.add(
      scene.add.text(42, 34, "生命 100 / 100", {
        fontFamily: UI_THEME.fontFamily,
        fontSize: "20px",
        fontStyle: "bold",
        color: UI_THEME.colors.text
      })
    );

    this.statsText = this.add(
      scene.add.text(42, 150, "攻击 0    防御 0    速度 0", {
        fontFamily: UI_THEME.fontFamily,
        fontSize: "16px",
        color: UI_THEME.colors.muted
      })
    );

    this.staminaText = this.add(
      scene.add.text(42, 92, "耐力 100 / 100", {
        fontFamily: UI_THEME.fontFamily,
        fontSize: "18px",
        color: UI_THEME.colors.text
      })
    );

    this.inventoryText = this.add(
      scene.add.text(42, 180, "背包：空", {
        fontFamily: UI_THEME.fontFamily,
        fontSize: "16px",
        color: UI_THEME.colors.text,
        wordWrap: { width: 374 }
      })
    );

    this.add(
      scene.add
        .rectangle(APP_CONFIG.width - 350, 18, 326, 150, 0x020617, 0.82)
        .setOrigin(0)
        .setStrokeStyle(2, UI_THEME.colors.border, 0.9)
    );

    this.objectiveTitle = this.add(
      scene.add.text(APP_CONFIG.width - 326, 34, "当前目标", {
        fontFamily: UI_THEME.fontFamily,
        fontSize: "16px",
        fontStyle: "bold",
        color: UI_THEME.colors.warning
      })
    );

    this.objectiveText = this.add(
      scene.add.text(APP_CONFIG.width - 326, 64, "正在读取任务……", {
        fontFamily: UI_THEME.fontFamily,
        fontSize: "17px",
        color: UI_THEME.colors.text,
        wordWrap: { width: 276 },
        lineSpacing: 5
      })
    );

    this.promptBackground = this.add(
      scene.add
        .rectangle(APP_CONFIG.width / 2, 604, 460, 46, 0x020617, 0.88)
        .setStrokeStyle(2, UI_THEME.colors.warning, 0.65)
        .setVisible(false)
    );

    this.promptText = this.add(
      scene.add
        .text(APP_CONFIG.width / 2, 604, "", {
          fontFamily: UI_THEME.fontFamily,
          fontSize: "18px",
          color: "#fef3c7"
        })
        .setOrigin(0.5)
        .setVisible(false)
    );

    this.toastBackground = this.add(
      scene.add
        .rectangle(APP_CONFIG.width / 2, 536, 520, 44, 0x0f172a, 0.94)
        .setStrokeStyle(2, UI_THEME.colors.primary, 0.5)
        .setVisible(false)
    );

    this.toastText = this.add(
      scene.add
        .text(APP_CONFIG.width / 2, 536, "", {
          fontFamily: UI_THEME.fontFamily,
          fontSize: "17px",
          color: UI_THEME.colors.text
        })
        .setOrigin(0.5)
        .setVisible(false)
    );

    this.add(
      scene.add.text(
        24,
        APP_CONFIG.height - 34,
        "A / D 移动    Shift 加速    Space 跳跃    J / 鼠标左键攻击    K 防御    E 交互    Esc 暂停",
        {
          fontFamily: UI_THEME.fontFamily,
          fontSize: "15px",
          color: "#64748b"
        }
      )
    );

    this.setPlayerStats({
      currentHealth: 0,
      maxHealth: 0,
      currentStamina: 0,
      maxStamina: 0,
      attack: 0,
      defense: 0,
      moveSpeed: 0
    });
  }

  setPlayerStats(player) {
    if (!player) {
      return;
    }

    const currentHealth = player.currentHealth ?? 0;
    const maxHealth = player.maxHealth ?? 0;
    const currentStamina = player.currentStamina ?? 0;
    const maxStamina = player.maxStamina ?? 0;
    this.healthText.setText(`生命 ${currentHealth} / ${maxHealth}`);
    this.staminaText.setText(
      `耐力 ${Math.round(currentStamina)} / ${Math.round(maxStamina)}`
    );
    this.statsText.setText(
      `攻击 ${player.attack ?? 0}    防御 ${player.defense ?? 0}    速度 ${player.moveSpeed ?? 0}`
    );
    this.drawHealthBar(currentHealth, maxHealth);
    this.drawStaminaBar(currentStamina, maxStamina);
  }

  drawHealthBar(currentHealth, maxHealth) {
    const x = 42;
    const y = 68;
    const width = 360;
    const height = 16;
    const ratio = maxHealth > 0 ? currentHealth / maxHealth : 0;

    this.healthBarGraphics.clear();
    this.healthBarGraphics.fillStyle(0x1e293b, 1);
    this.healthBarGraphics.fillRoundedRect(x, y, width, height, 5);
    this.healthBarGraphics.fillStyle(
      ratio <= 0.25 ? 0xef4444 : 0x22c55e,
      1
    );
    this.healthBarGraphics.fillRoundedRect(
      x,
      y,
      Math.max(0, width * ratio),
      height,
      5
    );
  }

  drawStaminaBar(currentStamina, maxStamina) {
    const x = 42;
    const y = 120;
    const width = 360;
    const height = 14;
    const ratio = maxStamina > 0 ? currentStamina / maxStamina : 0;

    this.staminaBarGraphics.clear();
    this.staminaBarGraphics.fillStyle(0x1e293b, 1);
    this.staminaBarGraphics.fillRoundedRect(x, y, width, height, 4);
    this.staminaBarGraphics.fillStyle(
      ratio <= 0.2 ? 0xf59e0b : 0x38bdf8,
      1
    );
    this.staminaBarGraphics.fillRoundedRect(
      x,
      y,
      Math.max(0, width * ratio),
      height,
      4
    );
  }

  setInventory(inventory) {
    const entries = Object.entries(inventory ?? {}).filter(
      ([, quantity]) => quantity > 0
    );

    if (entries.length === 0) {
      this.inventoryText.setText("背包：空");
      return;
    }

    const itemDescriptions = entries.map(([itemId, quantity]) => {
      try {
        const item = this.dataRepository.getItem(itemId);
        return `${item.name} ×${quantity}`;
      } catch {
        return `${itemId} ×${quantity}`;
      }
    });

    this.inventoryText.setText(`背包：${itemDescriptions.join("    ")}`);
  }

  setObjective(quest) {
    if (!quest) {
      this.objectiveTitle.setText("当前目标");
      this.objectiveText.setText("自由探索");
      return;
    }

    const completed = quest.status === "completed";
    this.objectiveTitle.setText(completed ? "任务已完成" : quest.title);
    this.objectiveTitle.setColor(
      completed ? UI_THEME.colors.success : UI_THEME.colors.warning
    );
    this.objectiveText.setText(quest.description);
  }

  setPrompt(text) {
    const visible = Boolean(text);
    this.promptBackground.setVisible(visible);
    this.promptText.setVisible(visible);
    this.promptText.setText(text ?? "");
  }

  showToast(payload) {
    const message =
      typeof payload === "string" ? payload : payload?.message ?? "";
    const duration =
      typeof payload === "object" ? payload.duration ?? 1600 : 1600;

    if (!message) {
      return;
    }

    if (this.toastTimer) {
      this.toastTimer.remove(false);
      this.toastTimer = null;
    }

    this.toastText.setText(message);
    this.toastBackground.setVisible(true);
    this.toastText.setVisible(true);
    this.toastBackground.setAlpha(0);
    this.toastText.setAlpha(0);

    this.scene.tweens.add({
      targets: [this.toastBackground, this.toastText],
      alpha: 1,
      duration: 120
    });

    this.toastTimer = this.scene.time.delayedCall(duration, () => {
      this.scene.tweens.add({
        targets: [this.toastBackground, this.toastText],
        alpha: 0,
        duration: 180,
        onComplete: () => {
          this.toastBackground.setVisible(false);
          this.toastText.setVisible(false);
        }
      });
      this.toastTimer = null;
    });
  }
}
