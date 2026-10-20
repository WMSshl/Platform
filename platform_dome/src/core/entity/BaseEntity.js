const Phaser = globalThis.Phaser;

/**
 * 玩家、NPC 和敌人共用的物理实体基类。
 *
 * 角色的“数值”来自 JSON 定义，基类只保存通用引用并配置物理刚体。
 * 具体角色通过子类增加移动、攻击或 AI 行为。
 */
export class BaseEntity extends Phaser.Physics.Arcade.Sprite {
  constructor(
    scene,
    x,
    y,
    textureKey,
    definition,
    depth,
    options = {}
  ) {
    super(scene, x, y, textureKey);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.actorId = definition.id;
    this.actorType = definition.type;
    this.definition = definition;
    this.stats = { ...definition.stats };
    this.setDepth(depth);

    const appearance = definition.appearance ?? {};
    const spriteScale = appearance.spriteScale ?? 1;
    const legacyScale = Math.max(
      0.05,
      Number(options.scale) || 1
    );
    const instanceScaleX = Math.max(
      0.05,
      Number(options.scaleX) || legacyScale
    );
    const instanceScaleY = Math.max(
      0.05,
      Number(options.scaleY) || legacyScale
    );
    const renderScaleX = spriteScale * instanceScaleX;
    const renderScaleY = spriteScale * instanceScaleY;
    this.instanceScaleX = instanceScaleX;
    this.instanceScaleY = instanceScaleY;
    if (renderScaleX !== 1 || renderScaleY !== 1) {
      this.setScale(renderScaleX, renderScaleY);
    }

    const body = this.body;
    body.updateBounds?.();
    /*
     * Arcade Body 的尺寸按“源像素 × 精灵缩放”计算。
     * 因此这里先把世界尺寸换算回源像素，再按帧尺寸设置默认居中偏移。
     */
    const sourceBodyWidth = definition.physics.bodyWidth / spriteScale;
    const sourceBodyHeight = definition.physics.bodyHeight / spriteScale;
    body.setSize(sourceBodyWidth, sourceBodyHeight, false);

    const frameWidth = appearance.frameWidth ?? this.width;
    const frameHeight = appearance.frameHeight ?? this.height;
    body.setOffset(
      appearance.bodyOffsetX ?? (frameWidth - sourceBodyWidth) / 2,
      appearance.bodyOffsetY ?? (frameHeight - sourceBodyHeight) / 2
    );
    body.setCollideWorldBounds(true);
  }
}
