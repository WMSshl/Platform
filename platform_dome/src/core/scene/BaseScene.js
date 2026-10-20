import { DisposableGroup } from "../lifecycle/DisposableGroup.js";
import { RegistryKeys } from "../../constants/RegistryKeys.js";

const Phaser = globalThis.Phaser;

/**
 * 所有场景的基类。
 *
 * 它完成两件重复工作：
 * 1. 从 Phaser Registry 取得共享依赖 GameContext；
 * 2. 在场景关闭时自动清理事件监听和外部服务。
 */
export class BaseScene extends Phaser.Scene {
  constructor(sceneKey) {
    super(sceneKey);
    this.ctx = null;
    this.sceneData = {};
    this.disposables = new DisposableGroup();
  }

  init(data = {}) {
    this.ctx = this.game.registry.get(RegistryKeys.CONTEXT);
    this.sceneData = data;

    // 场景可以被重复启动，因此每次 init 都创建一套新的清理器。
    this.disposables = new DisposableGroup();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.disposables.dispose();
    });
  }

  addDisposable(disposer) {
    this.disposables.add(disposer);
  }

  addManagedListener(target, eventName, handler, context = this) {
    const result = target.on(eventName, handler, context);
    if (typeof result === "function") {
      this.addDisposable(result);
      return;
    }

    this.addDisposable(() => target.off(eventName, handler, context));
  }

  get eventBus() {
    return this.ctx.eventBus;
  }

  get store() {
    return this.ctx.store;
  }

  get saveService() {
    return this.ctx.saveService;
  }
}
