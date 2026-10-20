/**
 * 主角精灵表与动画定义。
 *
 * 每张图都是横向排列的 112×96 帧。角色原始像素高度约 35 像素，
 * 显示时放大 3 倍，既匹配现有 102 像素高的物理体型，也保持像素硬边缘。
 *
 * 攻击范围在 skills.json 中配置。数值按伤害判定帧的非透明像素边界
 * 换算到 3 倍显示尺寸，并加上目标体型容差，不使用固定旧范围。
 */
export const PLAYER_SPRITE_CONFIG = Object.freeze({
  frameWidth: 112,
  frameHeight: 96,
  scale: 3
});

export const PLAYER_ANIMATION_DEFINITIONS = Object.freeze({
  idle: {
    file: "assets/player/idle.png",
    frames: 14,
    frameRate: 8,
    repeat: -1
  },
  walk: {
    file: "assets/player/walk.png",
    frames: 8,
    frameRate: 10,
    repeat: -1
  },
  run: {
    file: "assets/player/run.png",
    frames: 8,
    frameRate: 14,
    repeat: -1
  },
  jump: {
    file: "assets/player/jump.png",
    frames: 3,
    frameRate: 12,
    repeat: 0
  },
  air: {
    file: "assets/player/air.png",
    frames: 3,
    frameRate: 10,
    repeat: -1
  },
  fall: {
    file: "assets/player/fall.png",
    frames: 3,
    frameRate: 10,
    repeat: -1
  },
  guard: {
    file: "assets/player/guard.png",
    frames: 6,
    frameRate: 12,
    repeat: 0
  },
  "guard-counter": {
    file: "assets/player/guard-counter.png",
    frames: 11,
    frameRate: 8,
    repeat: 0
  },
  "attack-1": {
    file: "assets/player/attack-1.png",
    frames: 8,
    frameRate: 18,
    repeat: 0
  },
  "attack-2": {
    file: "assets/player/attack-2.png",
    frames: 9,
    frameRate: 20,
    repeat: 0
  },
  "attack-3": {
    file: "assets/player/attack-3.png",
    frames: 11,
    frameRate: 18,
    repeat: 0
  },
  hurt: {
    file: "assets/player/hurt.png",
    frames: 8,
    frameRate: 14,
    repeat: 0
  },
  death: {
    file: "assets/player/death.png",
    frames: 15,
    frameRate: 10,
    repeat: 0
  }
});

export const PLAYER_GUARD_ANIMATION_KEYS = Object.freeze({
  enter: "player:guard-enter",
  hold: "player:guard-hold",
  success: "player:guard-success",
  counter: "player:guard-counter"
});

export const PLAYER_GUARD_SUCCESS_DURATION_MS = (4 / 14) * 1000;

export function getPlayerTextureKey(name) {
  return `player:${name}`;
}

export function getPlayerAnimationKey(name) {
  return `player:${name}`;
}

export function getPlayerAnimationDurationMs(name) {
  const definition = PLAYER_ANIMATION_DEFINITIONS[name];
  if (!definition) {
    return 0;
  }

  return (definition.frames / definition.frameRate) * 1000;
}

export function getPlayerAnimationFrameRate(name) {
  return PLAYER_ANIMATION_DEFINITIONS[name]?.frameRate ?? 12;
}

/**
 * 在资源加载完成后注册主角动画。
 * Phaser 的动画管理器是全局的，因此只需注册一次。
 */
export function createPlayerAnimations(scene) {
  Object.entries(PLAYER_ANIMATION_DEFINITIONS).forEach(
    ([name, definition]) => {
      const textureKey = getPlayerTextureKey(name);
      if (!scene.textures.exists(textureKey)) {
        throw new Error(`主角精灵表未加载：${textureKey}`);
      }

      const animationKey = getPlayerAnimationKey(name);
      if (scene.anims.exists(animationKey)) {
        return;
      }

      scene.anims.create({
        key: animationKey,
        frames: scene.anims.generateFrameNumbers(textureKey, {
          start: 0,
          end: definition.frames - 1
        }),
        frameRate: definition.frameRate,
        repeat: definition.repeat
      });
    }
  );

  createGuardAnimations(scene);
}

function createGuardAnimations(scene) {
  const guardTextureKey = getPlayerTextureKey("guard");

  if (!scene.anims.exists(PLAYER_GUARD_ANIMATION_KEYS.enter)) {
    scene.anims.create({
      key: PLAYER_GUARD_ANIMATION_KEYS.enter,
      frames: [{ key: guardTextureKey, frame: 0 }],
      frameRate: 1,
      repeat: 0
    });
  }

  if (!scene.anims.exists(PLAYER_GUARD_ANIMATION_KEYS.hold)) {
    scene.anims.create({
      key: PLAYER_GUARD_ANIMATION_KEYS.hold,
      frames: [{ key: guardTextureKey, frame: 1 }],
      frameRate: 1,
      repeat: 0
    });
  }

  if (!scene.anims.exists(PLAYER_GUARD_ANIMATION_KEYS.success)) {
    scene.anims.create({
      key: PLAYER_GUARD_ANIMATION_KEYS.success,
      frames: scene.anims.generateFrameNumbers(guardTextureKey, {
        start: 2,
        end: 5
      }),
      frameRate: 14,
      repeat: 0
    });
  }
}
