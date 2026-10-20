/**
 * 占位纹理生成器。
 *
 * 第一版不依赖任何图片文件，但角色仍然使用标准 Phaser 纹理。
 * 以后把 PNG 放入 assets 后，只需要复用同一个纹理键，不必改角色逻辑。
 */
export class PlaceholderTextureService {
  static generateActorTextures(scene, actors) {
    Object.values(actors).forEach((actor) => {
      const textureKey = PlaceholderTextureService.getActorTextureKey(actor.id);
      if (scene.textures.exists(textureKey)) {
        return;
      }

      const { width, height, color, accentColor } = actor.appearance;
      const graphics = scene.add.graphics();

      graphics.fillStyle(
        PlaceholderTextureService.colorToNumber(color),
        1
      );
      graphics.fillRect(0, 0, width, height);

      graphics.lineStyle(
        3,
        PlaceholderTextureService.colorToNumber(accentColor),
        1
      );
      graphics.strokeRect(2, 2, width - 4, height - 4);

      // 右侧的小色块用来表示角色当前面向，替换正式素材后会自动消失。
      graphics.fillStyle(
        PlaceholderTextureService.colorToNumber(accentColor),
        0.9
      );
      graphics.fillRect(width - 13, Math.round(height * 0.38), 6, 8);

      graphics.generateTexture(textureKey, width, height);
      graphics.destroy();
    });
  }

  static getActorTextureKey(actorId) {
    return `actor:${actorId}`;
  }

  static colorToNumber(color) {
    return Number.parseInt(color.replace("#", ""), 16);
  }
}
