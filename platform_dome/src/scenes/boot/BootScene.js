import { BaseScene } from "../../core/scene/BaseScene.js";
import { SceneKeys } from "../../constants/SceneKeys.js";

/**
 * 启动场景。
 *
 * 这里只做最小初始化，然后把控制权交给资源加载场景。
 * 启动场景不应加载大型图片或执行复杂玩法逻辑。
 */
export class BootScene extends BaseScene {
  constructor() {
    super(SceneKeys.BOOT);
  }

  create() {
    this.scene.start(SceneKeys.PRELOAD);
  }
}
