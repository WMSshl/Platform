import { BaseScene } from "../../core/scene/BaseScene.js";
import { APP_CONFIG } from "../../config/appConfig.js";
import { SceneKeys } from "../../constants/SceneKeys.js";
import { EventNames } from "../../events/EventNames.js";
import { GameWorld } from "../../gameplay/world/GameWorld.js";
import { InputService } from "../../services/input/InputService.js";

const Phaser = globalThis.Phaser;

/**
 * 游戏主场景。
 *
 * 场景本身只负责启动 GameWorld、处理暂停和关卡流程。
 * 移动、战斗、机关和存档数据都由 World 与各系统完成。
 */
export class GameScene extends BaseScene {
  constructor() {
    super(SceneKeys.GAME);
    this.world = null;
    this.inputService = null;
    this.isHandlingDeath = false;
    this.isCompletingStory = false;
  }

  create() {
    this.isHandlingDeath = false;
    this.isCompletingStory = false;

    const levelId =
      this.sceneData.levelId ?? APP_CONFIG.initialLevelId;
    const level = this.ctx.dataRepository.getLevel(levelId);
    const arrivalExitId = this.sceneData.arrivalExitId ?? null;
    const entrance = arrivalExitId
      ? (level.mechanisms ?? []).find(
          (mechanism) =>
            mechanism.type === "exit" &&
            mechanism.id === arrivalExitId
        )
      : null;
    const spawnPoint =
      entrance ??
      level.spawnPoints?.find(
        (spawn) => spawn.id === level.initialSpawnId
      ) ??
      level.spawnPoints?.[0];

    this.inputService = new InputService(this);
    this.addDisposable(() => this.inputService?.destroy());

    const resetPlayerPosition =
      this.sceneData.resetPlayerPosition ??
      !this.sceneData.runState;

    this.world = new GameWorld(this, level, this.ctx, this.inputService, {
      runState: this.sceneData.runState,
      resetPlayerPosition,
      spawnPoint,
      arrivalExitId,
      handlers: {
        onEntranceTransition: ({ levelId, exit }) =>
          this.handleEntranceTransition(levelId, exit),
        onStoryComplete: () => this.handleStoryComplete(),
        onPlayerDeath: () => this.handlePlayerDeath()
      }
    });

    this.cameras.main.fadeIn(220, 0, 0, 0);
  }

  update(time, delta) {
    if (!this.world || this.isHandlingDeath) {
      return;
    }

    if (this.inputService.justDown("pause")) {
      this.ctx.router.openPause(this);
      return;
    }

    this.world.update(time, delta);
  }

  setGameplayInputEnabled(enabled) {
    this.inputService?.setEnabled(enabled);
  }

  createSaveSnapshot() {
    if (!this.world) {
      throw new Error("游戏世界尚未创建，无法存档");
    }
    return this.world.createSaveSnapshot();
  }

  handleEntranceTransition(nextLevelId, exit) {
    /*
     * 进入下一关时保留生命、背包、剧情和机关状态，
     * 但把玩家位置重置到下一关出生点。
     */
    const runState = this.world.createSaveSnapshot();
    runState.levelId = nextLevelId;
    this.inputService.setEnabled(false);

    this.cameras.main.fadeOut(260, 0, 0, 0);
    this.cameras.main.once(
      Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
      () => {
        this.scene.restart({
          levelId: nextLevelId,
          runState,
          resetPlayerPosition: true,
          arrivalExitId: exit.id
        });
      }
    );
  }

  handleStoryComplete() {
    if (this.isCompletingStory) {
      return;
    }

    this.isCompletingStory = true;
    const summary = this.world.getSummary();
    const inventoryLines = Object.entries(summary.inventory)
      .filter(([, quantity]) => quantity > 0)
      .map(([itemId, quantity]) => {
        const item = this.ctx.dataRepository.getItem(itemId);
        return `${item.name} ×${quantity}`;
      });

    this.ctx.router.showResult(this, {
      title: "试玩段落完成",
      subtitle: "你穿过了低语庭院，并抵达回声高塔顶部。",
      lines: [
        `所在关卡：${summary.levelName}`,
        `当前生命：${summary.currentHealth} / ${summary.maxHealth}`,
        `背包物品：${inventoryLines.join("、") || "空"}`
      ]
    });
  }

  handlePlayerDeath() {
    if (this.isHandlingDeath) {
      return;
    }

    /*
     * 死亡不自动覆盖手动存档。
     * 淡出后直接回主菜单，玩家可以重新开始或读取上一次手动存档。
     */
    this.isHandlingDeath = true;
    this.inputService.setEnabled(false);
    this.ctx.eventBus.emit(
      EventNames.UI_TOAST,
      "角色已经倒下，正在返回主菜单……"
    );

    this.cameras.main.fadeOut(520, 0, 0, 0);
    this.cameras.main.once(
      Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
      () => {
        this.ctx.router.returnToMenu(this);
      }
    );
  }
}
