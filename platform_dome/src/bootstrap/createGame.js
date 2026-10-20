import { RegistryKeys } from "../constants/RegistryKeys.js";
import { APP_CONFIG } from "../config/appConfig.js";
import { BootScene } from "../scenes/boot/BootScene.js";
import { PreloadScene } from "../scenes/loading/PreloadScene.js";
import { MainMenuScene } from "../scenes/menu/MainMenuScene.js";
import { GameScene } from "../scenes/gameplay/GameScene.js";
import { HudScene } from "../scenes/hud/HudScene.js";
import { PauseScene } from "../scenes/modal/PauseScene.js";
import { ResultScene } from "../scenes/modal/ResultScene.js";
import { TalentScene } from "../scenes/menu/TalentScene.js";

const Phaser = globalThis.Phaser;

/**
 * 创建 Phaser 游戏并注册全部场景。
 *
 * 场景注册顺序代表基础启动链路：
 * 启动页 → 资源加载页 → 主菜单。
 */
export function createGame(context) {
  const config = {
    type: Phaser.AUTO,
    parent: "game-container",
    // 像素美术使用最近邻采样，避免纹理被平滑放大。
    pixelArt: true,
    width: APP_CONFIG.width,
    height: APP_CONFIG.height,
    backgroundColor: APP_CONFIG.backgroundColor,
    render: {
      antialias: false,
      roundPixels: true
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH
    },
    physics: {
      default: "arcade",
      arcade: {
        gravity: { x: 0, y: APP_CONFIG.gravityY },
        debug: APP_CONFIG.debugPhysics
      }
    },
    scene: [
      BootScene,
      PreloadScene,
      MainMenuScene,
      GameScene,
      HudScene,
      PauseScene,
      ResultScene,
      TalentScene
    ],
    callbacks: {
      preBoot: (game) => {
        // preBoot 发生在任何场景 create 之前，最适合注入共享依赖。
        game.registry.set(RegistryKeys.CONTEXT, context);
      }
    }
  };

  return new Phaser.Game(config);
}
