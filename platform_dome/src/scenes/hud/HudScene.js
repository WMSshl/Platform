import { BaseScene } from "../../core/scene/BaseScene.js";
import { SceneKeys } from "../../constants/SceneKeys.js";
import { EventNames } from "../../events/EventNames.js";
import { HudView } from "../../ui/views/HudView.js";

/**
 * HUD 场景。
 *
 * 它独立于 GameScene，因此暂停、结算或切换关卡时，
 * 界面层和世界模拟层可以分别控制生命周期。
 */
export class HudScene extends BaseScene {
  constructor() {
    super(SceneKeys.HUD);
  }

  create() {
    this.view = new HudView(this, this.ctx.dataRepository);

    const state = this.store.getState();
    this.view.setPlayerStats(state.player);
    this.view.setInventory(state.player?.inventory ?? {});
    this.view.setObjective(state.currentQuest ?? null);

    this.addManagedListener(
      this.eventBus,
      EventNames.PLAYER_STATS_CHANGED,
      (player) => this.view.setPlayerStats(player)
    );

    this.addManagedListener(
      this.eventBus,
      EventNames.INVENTORY_CHANGED,
      (inventory) => this.view.setInventory(inventory)
    );

    this.addManagedListener(
      this.eventBus,
      EventNames.QUEST_CHANGED,
      (quest) => this.view.setObjective(quest)
    );

    this.addManagedListener(
      this.eventBus,
      EventNames.INTERACTION_PROMPT,
      (prompt) => this.view.setPrompt(prompt)
    );

    this.addManagedListener(
      this.eventBus,
      EventNames.UI_TOAST,
      (payload) => this.view.showToast(payload)
    );
  }
}
