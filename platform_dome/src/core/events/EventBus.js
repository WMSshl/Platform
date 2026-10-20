/**
 * 与引擎无关的轻量事件总线。
 *
 * 使用自己的实现而不是直接暴露 Phaser EventEmitter，有两个好处：
 * 1. 以后可以把战斗逻辑放在非 Phaser 环境中测试；
 * 2. 可以在这里统一处理监听数量异常、调试日志等能力。
 */
export class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this.listeners = new Map();
  }

  /**
   * 订阅事件，返回取消订阅的函数。
   * 组件销毁时调用返回函数，可以避免场景重启后重复监听。
   */
  on(eventName, handler) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }

    const handlers = this.listeners.get(eventName);
    handlers.add(handler);

    return () => this.off(eventName, handler);
  }

  once(eventName, handler) {
    const unsubscribe = this.on(eventName, (payload) => {
      unsubscribe();
      handler(payload);
    });
    return unsubscribe;
  }

  off(eventName, handler) {
    const handlers = this.listeners.get(eventName);
    if (!handlers) {
      return;
    }

    handlers.delete(handler);
    if (handlers.size === 0) {
      this.listeners.delete(eventName);
    }
  }

  emit(eventName, payload) {
    const handlers = this.listeners.get(eventName);
    if (!handlers) {
      return;
    }

    // 复制一份再遍历，允许监听器在回调中取消订阅。
    [...handlers].forEach((handler) => handler(payload));
  }

  clear() {
    this.listeners.clear();
  }
}
