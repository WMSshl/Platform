import { BaseScene } from "../../core/scene/BaseScene.js";
import { APP_CONFIG } from "../../config/appConfig.js";
import { SceneKeys } from "../../constants/SceneKeys.js";
import {
  DATA_CACHE_KEYS,
  ContractGameDataRepository
} from "../../data/repositories/ContractGameDataRepository.js";
import {
  PLAYER_ANIMATION_DEFINITIONS,
  PLAYER_SPRITE_CONFIG,
  createPlayerAnimations,
  getPlayerTextureKey
} from "../../config/playerAnimations.js";
import { PlaceholderTextureService } from "../../services/assets/PlaceholderTextureService.js";
import {
  getLevelBackgroundAsset,
  getLevelBackgroundTextureKey,
  getLevelBackgroundUrl
} from "../../data/levels/LevelPresentation.js";
import { UI_THEME } from "../../ui/theme.js";

/**
 * 公共资源加载场景。
 *
 * 第一版主要加载 JSON 配置，然后根据角色尺寸和颜色生成纯色占位纹理。
 * 后续增加真实图片、音频时，也在这里或按关卡加载器中登记资源。
 */
export class PreloadScene extends BaseScene {
  constructor() {
    super(SceneKeys.PRELOAD);
    this.hasLoadError = false;
    this.startupScheduled = false;
  }

  preload() {
    this.createLoadingUi();

    this.load.on("progress", (progress) => {
      this.loadingFill.scaleX = Math.max(0.01, progress);
      this.progressText.setText(`${Math.round(progress * 100)}%`);
    });

    this.load.on("loaderror", (file) => {
      this.hasLoadError = true;
      this.statusText.setText(`资源加载失败：${file.src}`);
      this.statusText.setColor(UI_THEME.colors.danger);
    });

    this.load.json(DATA_CACHE_KEYS.ACTORS, "data/configs/actors.json");
    this.load.json(DATA_CACHE_KEYS.SKILLS, "data/configs/skills.json");
    this.load.json(DATA_CACHE_KEYS.ITEMS, "data/configs/items.json");
    this.load.json(DATA_CACHE_KEYS.TALENTS, "data/configs/talents.json");
    this.ctx.levelIds.forEach((levelId) => {
      this.load.json(
        `level:${levelId}`,
        `data/levels/${levelId}.json`
      );
    });

    Object.entries(PLAYER_ANIMATION_DEFINITIONS).forEach(
      ([name, definition]) => {
        this.load.spritesheet(getPlayerTextureKey(name), definition.file, {
          frameWidth: PLAYER_SPRITE_CONFIG.frameWidth,
          frameHeight: PLAYER_SPRITE_CONFIG.frameHeight
        });
      }
    );
  }

  create() {
    if (this.hasLoadError) {
      return;
    }

    try {
      const repository = new ContractGameDataRepository(this.game);
      repository.validate();
      this.ctx.dataRepository = repository;

      createPlayerAnimations(this);
      PlaceholderTextureService.generateActorTextures(
        this,
        repository.getActors()
      );
      this.loadLevelBackgrounds(repository);
    } catch (error) {
      console.error(error);
      this.statusText.setText(`配置错误：${error.message}`);
      this.statusText.setColor(UI_THEME.colors.danger);
    }
  }

  loadLevelBackgrounds(repository) {
    let pending = 0;
    repository.getLevelIds().forEach((levelId) => {
      const level = repository.getLevel(levelId);
      const asset = getLevelBackgroundAsset(level);
      if (!asset) {
        return;
      }
      const textureKey = getLevelBackgroundTextureKey(
        levelId,
        asset
      );
      if (this.textures.exists(textureKey)) {
        return;
      }
      this.load.image(
        textureKey,
        getLevelBackgroundUrl(asset)
      );
      pending += 1;
    });

    if (pending === 0) {
      this.finishStartup();
      return;
    }

    this.statusText.setText("正在加载关卡背景……");
    this.load.once("complete", () => this.finishStartup());
    this.load.start();
  }

  finishStartup() {
    if (this.startupScheduled) {
      return;
    }
    this.startupScheduled = true;
    this.statusText.setText("配置检查完成，正在进入主菜单……");
    this.time.delayedCall(120, () => {
      this.scene.start(SceneKeys.MAIN_MENU);
    });
  }

  createLoadingUi() {
    this.add
      .rectangle(
        0,
        0,
        APP_CONFIG.width,
        APP_CONFIG.height,
        UI_THEME.colors.background
      )
      .setOrigin(0);

    this.add
      .text(APP_CONFIG.width / 2, 260, "穹顶回响", {
        fontFamily: UI_THEME.fontFamily,
        fontSize: "52px",
        fontStyle: "bold",
        color: UI_THEME.colors.text
      })
      .setOrigin(0.5);

    this.add.rectangle(
      APP_CONFIG.width / 2,
      370,
      800,
      20,
      0x1e293b,
      1
    );

    this.loadingFill = this.add
      .rectangle(
        APP_CONFIG.width / 2 - 400,
        370,
        800,
        20,
        UI_THEME.colors.primary,
        1
      )
      .setOrigin(0, 0.5);
    this.loadingFill.scaleX = 0.01;

    this.progressText = this.add
      .text(APP_CONFIG.width / 2, 410, "0%", {
        fontFamily: UI_THEME.fontFamily,
        fontSize: "16px",
        color: UI_THEME.colors.muted
      })
      .setOrigin(0.5);

    this.statusText = this.add
      .text(APP_CONFIG.width / 2, 460, "正在加载角色、技能与关卡配置……", {
        fontFamily: UI_THEME.fontFamily,
        fontSize: "18px",
        color: UI_THEME.colors.muted
      })
      .setOrigin(0.5);
  }
}
