import { APP_CONFIG } from "../../config/appConfig.js";

const Phaser = globalThis.Phaser;

/**
 * 键盘鼠标输入适配器。
 *
 * 游戏逻辑只调用 isDown("left")、justDown("jump")、consumeAttack()，
 * 不直接读取键盘码。以后增加触屏时，可以实现同接口的 TouchInputService。
 */
export class InputService {
  constructor(scene, bindings = APP_CONFIG.inputBindings) {
    this.scene = scene;
    this.enabled = true;
    this.keysByAction = new Map();
    this.pointerAttackQueued = false;

    Object.entries(bindings).forEach(([action, keyNames]) => {
      const keys = keyNames.map((keyName) =>
        scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes[keyName])
      );
      this.keysByAction.set(action, keys);
    });

    // 阻止空格和方向键滚动页面，保证游戏操作稳定。
    scene.input.keyboard.addCapture([
      "SPACE",
      "LEFT",
      "RIGHT",
      "S",
      "UP",
      "DOWN",
      "SHIFT"
    ]);

    this.handlePointerDown = (pointer) => {
      if (this.enabled && pointer.leftButtonDown()) {
        this.pointerAttackQueued = true;
      }
    };

    scene.input.on("pointerdown", this.handlePointerDown);
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) {
      this.pointerAttackQueued = false;
    }
  }

  isDown(action) {
    if (!this.enabled) {
      return false;
    }

    return (this.keysByAction.get(action) ?? []).some((key) => key.isDown);
  }

  justDown(action) {
    if (!this.enabled) {
      return false;
    }

    return (this.keysByAction.get(action) ?? []).some((key) =>
      Phaser.Input.Keyboard.JustDown(key)
    );
  }

  /**
   * 键盘 J 和鼠标左键共用同一个“攻击动作”。
   * 鼠标请求使用一次性标记，避免按住鼠标时每一帧都触发攻击。
   */
  consumeAttack() {
    if (!this.enabled) {
      return false;
    }

    const keyboardAttack = this.justDown("attack");
    const pointerAttack = this.pointerAttackQueued;
    this.pointerAttackQueued = false;
    return keyboardAttack || pointerAttack;
  }

  destroy() {
    this.scene.input.off("pointerdown", this.handlePointerDown);

    this.keysByAction.forEach((keys) => {
      keys.forEach((key) => this.scene.input.keyboard.removeKey(key));
    });
    this.keysByAction.clear();
  }
}
