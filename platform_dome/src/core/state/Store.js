/**
 * 全局状态容器。
 *
 * 状态中只保存可序列化的普通数据，不保存 Phaser 的 Sprite、物理刚体等对象。
 * 这样同一份状态既可以直接给 UI 使用，也可以交给存档系统保存。
 */
export class GameStore {
  constructor(initialState) {
    this.state = structuredClone(initialState);
    this.listeners = new Set();
  }

  getState() {
    return this.state;
  }

  /**
   * 用新状态整体替换当前状态。
   * GameWorld 在玩家属性、任务或世界状态变化时调用这里。
   */
  setState(nextState) {
    this.state = nextState;
    this.listeners.forEach((listener) => listener(this.state));
  }

  /**
   * 更新顶层字段。
   * 对 player、story 等嵌套对象修改时，应传入一个完整的新对象，
   * 避免原地修改导致订阅者无法正确判断变化。
   */
  patch(partialState) {
    this.setState({
      ...this.state,
      ...partialState
    });
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  reset(initialState) {
    this.setState(structuredClone(initialState));
  }
}
