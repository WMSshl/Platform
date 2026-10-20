/**
 * 游戏入口文件。
 *
 * 这里故意保持非常短：入口只负责组装“全局依赖”和“Phaser 游戏实例”。
 * 以后增加登录、云存档或平台 SDK 时，应优先修改 bootstrap 目录，
 * 而不是把越来越多逻辑塞进入口文件。
 */
import { createGameContext } from "./bootstrap/createGameContext.js";
import { createGame } from "./bootstrap/createGame.js";

const fallbackLevelIds = ["level-001", "level-002"];

/**
 * 关卡清单由地图编辑器维护。
 * 游戏启动前先读取清单，再把这些关卡交给 PreloadScene 加载。
 */
async function loadLevelIds() {
  try {
    const response = await fetch("data/levels/manifest.json", {
      cache: "no-store"
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const manifest = await response.json();
    const levelIds = Array.isArray(manifest.levels)
      ? manifest.levels.filter(
          (levelId) =>
            typeof levelId === "string" && levelId.trim().length > 0
        )
      : [];
    if (levelIds.length === 0) {
      throw new Error("manifest.levels 为空");
    }
    return [...new Set(levelIds)];
  } catch (error) {
    console.warn(
      "关卡清单读取失败，使用默认关卡列表：",
      error
    );
    return fallbackLevelIds;
  }
}

const levelIds = await loadLevelIds();
const gameContext = createGameContext({ levelIds });
const game = createGame(gameContext);

// 调试时可以在浏览器控制台通过 window.__PLATFORM_DOME_GAME__ 查看 Phaser 实例。
globalThis.__PLATFORM_DOME_GAME__ = game;
