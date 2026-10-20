import { DisposableGroup } from "../lifecycle/DisposableGroup.js";

/**
 * UI 视图基类。
 *
 * 视图只负责创建控件和展示数据，不直接修改角色属性。
 * 用户操作通过回调交回场景或 GameWorld 处理。
 */
export class BaseView {
  constructor(scene) {
    this.scene = scene;
    this.disposables = new DisposableGroup();
    this.gameObjects = [];
  }

  add(gameObject) {
    this.gameObjects.push(gameObject);
    return gameObject;
  }

  addDisposable(disposer) {
    this.disposables.add(disposer);
  }

  destroy() {
    this.disposables.dispose();
    this.gameObjects.splice(0).forEach((gameObject) => {
      if (gameObject?.active) {
        gameObject.destroy();
      }
    });
  }
}
