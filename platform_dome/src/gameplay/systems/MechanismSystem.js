import { DepthLayers } from "../../constants/DepthLayers.js";
import { EventNames } from "../../events/EventNames.js";

/**
 * 机关与闸门系统。
 *
 * 机关状态使用“关卡 ID + 机关 ID”作为键保存。
 * 这样不同关卡里即使出现同名机关，也不会互相覆盖。
 */
export class MechanismSystem {
  constructor(scene, level, runState, eventBus) {
    this.scene = scene;
    this.level = level;
    this.runState = runState;
    this.eventBus = eventBus;
    this.switches = new Map();
    this.gates = new Map();
    this.solidObjects = [];
    this.lastPrompt = undefined;

    this.createGates();
    this.createSwitches();
    this.restoreStates();
  }

  getStateKey(mechanismId) {
    return `${this.level.id}:${mechanismId}`;
  }

  createGates() {
    (this.level.mechanisms ?? [])
      .filter((mechanism) => mechanism.type === "gate")
      .forEach((gateData) => {
        const gate = this.scene.add
          .rectangle(
            gateData.x,
            gateData.y,
            gateData.width,
            gateData.height,
            Number.parseInt(gateData.color.replace("#", ""), 16),
            0.92
          )
          .setStrokeStyle(3, 0xfef08a, 0.8)
          .setDepth(DepthLayers.SOLID);

        this.scene.physics.add.existing(gate, true);
        this.gates.set(gateData.id, gate);
        this.solidObjects.push(gate);
      });
  }

  createSwitches() {
    (this.level.mechanisms ?? [])
      .filter((mechanism) => mechanism.type === "switch")
      .forEach((mechanismData) => {
        const switchObject = this.scene.add
          .rectangle(
            mechanismData.x,
            mechanismData.y,
            mechanismData.width,
            mechanismData.height,
            Number.parseInt(mechanismData.color.replace("#", ""), 16),
            1
          )
          .setStrokeStyle(3, 0xfefce8, 0.9)
          .setDepth(DepthLayers.ITEM);

        this.switches.set(mechanismData.id, {
          mechanismId: mechanismData.id,
          data: mechanismData,
          object: switchObject
        });
      });
  }

  restoreStates() {
    (this.level.mechanisms ?? [])
      .filter((mechanism) => mechanism.type === "switch")
      .forEach((mechanismData) => {
        if (this.isMechanismActive(mechanismData.id)) {
          this.applyActiveVisual(mechanismData.id);
          this.openGate(mechanismData.targetGateId, false);
        }
      });
  }

  isMechanismActive(mechanismId) {
    return Boolean(
      this.runState.world.mechanismStates[this.getStateKey(mechanismId)]
    );
  }

  findAvailableMechanism(player) {
    let nearest = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    this.switches.forEach((entry, mechanismId) => {
      if (this.isMechanismActive(mechanismId)) {
        return;
      }

      const distance = Math.hypot(
        player.x - entry.data.x,
        player.y - entry.data.y
      );

      if (
        distance <= entry.data.interactionRange &&
        distance < nearestDistance
      ) {
        nearest = entry;
        nearestDistance = distance;
      }
    });

    return nearest;
  }

  refreshPrompt(player) {
    const available = this.findAvailableMechanism(player);
    const prompt = available?.data.prompt ?? null;

    if (prompt === this.lastPrompt) {
      return;
    }

    this.lastPrompt = prompt;
    this.eventBus.emit(EventNames.INTERACTION_PROMPT, prompt);
  }

  tryActivate(player) {
    const available = this.findAvailableMechanism(player);
    if (!available) {
      return null;
    }

    const { mechanismId, data } = available;
    const stateKey = this.getStateKey(mechanismId);
    this.runState.world.mechanismStates[stateKey] = true;

    if (data.storyFlag) {
      this.runState.story.flags[data.storyFlag] = true;
    }

    this.applyActiveVisual(mechanismId);
    this.openGate(data.targetGateId, true);
    this.lastPrompt = undefined;

    this.eventBus.emit(EventNames.MECHANISM_CHANGED, {
      mechanismId,
      targetGateId: data.targetGateId ?? null,
      storyFlag: data.storyFlag ?? null
    });
    this.eventBus.emit(EventNames.UI_TOAST, {
      message: "机关已经启动，闸门正在打开。",
      duration: 1800
    });

    return available;
  }

  applyActiveVisual(mechanismId) {
    const entry = this.switches.get(mechanismId);
    if (!entry) {
      return;
    }

    entry.object.setFillStyle(0x22c55e, 0.6);
    entry.object.setStrokeStyle(3, 0xdcfce7, 1);
  }

  openGate(gateId, animated) {
    const gate = this.gates.get(gateId);
    if (!gate) {
      return;
    }

    if (gate.body) {
      gate.body.enable = false;
    }

    if (!animated) {
      gate.setVisible(false);
      return;
    }

    this.scene.tweens.add({
      targets: gate,
      alpha: 0,
      duration: 260,
      onComplete: () => gate.setVisible(false)
    });
  }
}
