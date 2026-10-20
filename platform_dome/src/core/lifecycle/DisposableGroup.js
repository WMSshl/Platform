/**
 * 批量销毁工具。
 *
 * 场景重新开始时，事件监听、输入服务和定时器都需要被清理。
 * 把清理函数统一交给这个对象，可以降低“离开场景后还在执行旧逻辑”的风险。
 */
export class DisposableGroup {
  constructor() {
    this.disposers = [];
    this.disposed = false;
  }

  add(disposer) {
    if (typeof disposer !== "function") {
      return;
    }

    if (this.disposed) {
      disposer();
      return;
    }

    this.disposers.push(disposer);
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.disposers.splice(0).forEach((disposer) => {
      try {
        disposer();
      } catch (error) {
        console.warn("清理资源时发生错误：", error);
      }
    });
  }
}
