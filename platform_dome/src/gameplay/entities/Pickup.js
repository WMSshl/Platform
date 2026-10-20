import { DepthLayers } from "../../constants/DepthLayers.js";
import { getPickupDisplaySize } from "../../data/levels/LevelPresentation.js";

const Phaser = globalThis.Phaser;

/**
 * 地面掉落物。
 *
 * 使用稳定 instanceId 标记是否已经拾取，避免读档后反复刷出同一个道具。
 */
export class Pickup extends Phaser.GameObjects.Rectangle {
  constructor(scene, mapItem, itemDefinition) {
    const { width, height } = getPickupDisplaySize(
      mapItem,
      itemDefinition
    );
    super(
      scene,
      mapItem.x,
      mapItem.y,
      width,
      height,
      Number.parseInt(itemDefinition.appearance.color.replace("#", ""), 16),
      1
    );

    scene.add.existing(this);
    scene.physics.add.existing(this, true);
    this.setDepth(DepthLayers.ITEM);
    this.setStrokeStyle(2, 0xf8fafc, 0.85);

    this.instanceId = mapItem.instanceId;
    this.itemId = mapItem.itemId;
    this.quantity = mapItem.quantity ?? 1;
  }
}
