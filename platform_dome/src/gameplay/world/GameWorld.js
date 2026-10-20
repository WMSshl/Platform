import { DepthLayers } from "../../constants/DepthLayers.js";
import { EventNames } from "../../events/EventNames.js";
import { createEmptyRunState } from "../../state/initialState.js";
import { CombatSystem } from "../combat/CombatSystem.js";
import { Enemy } from "../entities/Enemy.js";
import { Pickup } from "../entities/Pickup.js";
import { Player } from "../entities/Player.js";
import {
  installGameplaySystems,
  updateGameplaySystems
} from "../systems/GameplaySystemRegistry.js";
import {
  getActorInstanceScale,
  getLevelBackgroundAsset,
  getLevelBackgroundTextureKey,
  getSolidTerrainType
} from "../../data/levels/LevelPresentation.js";

/**
 * 一局游戏的世界管理器。
 *
 * GameScene 只负责启动、暂停和场景切换；
 * GameWorld 负责地图对象、实体、战斗、机关、任务和存档快照。
 */
export class GameWorld {
  constructor(scene, level, context, input, options = {}) {
    this.scene = scene;
    this.level = level;
    this.ctx = context;
    this.input = input;
    this.handlers = options.handlers ?? {};
    this.dataRepository = context.dataRepository;

    this.runState = options.runState
      ? structuredClone(options.runState)
      : createEmptyRunState();
    this.normalizeRunState();
    this.runState.levelId = level.id;
    this.arrivalExitId = options.arrivalExitId ?? null;
    const arrivalExit = this.arrivalExitId
      ? (level.mechanisms ?? []).find(
          (mechanism) =>
            mechanism.type === "exit" &&
            mechanism.id === this.arrivalExitId
        )
      : null;
    this.spawnPoint =
      arrivalExit ??
      options.spawnPoint ??
      level.spawnPoints?.find(
        (spawn) => spawn.id === level.initialSpawnId
      ) ??
      level.spawnPoints?.[0];

    this.transitioning = false;
    this.suppressedEntrances = new Set();
    this.platformDropThroughUntil = 0;
    this.platformDropThroughTarget = null;

    this.scene.physics.world.setBounds(
      0,
      0,
      level.world.width,
      level.world.height
    );
    this.scene.cameras.main.setBackgroundColor(level.world.backgroundColor);
    this.scene.cameras.main.setBounds(
      0,
      0,
      level.world.width,
      level.world.height
    );

    this.backgroundImage = this.createBackground();
    this.solidObjects = this.createSolids();
    installGameplaySystems(this);

    this.createPlayer(options.resetPlayerPosition);
    this.createEnemies();
    this.createPickups();
    this.createEntrances();
    this.createCollisions();
    this.configureCamera();
    this.publishState();
    this.emitInitialUiState();
  }

  normalizeRunState() {
    this.runState.story ??= { chapterId: null, flags: {} };
    this.runState.story.flags ??= {};
    this.runState.quests ??= {};
    this.runState.world ??= {};
    this.runState.world.mechanismStates ??= {};
    this.runState.world.defeatedEnemyIds ??= [];
    this.runState.world.collectedItemIds ??= [];
  }

  createBackground() {
    const asset = getLevelBackgroundAsset(this.level);
    if (!asset) {
      return null;
    }
    const textureKey = getLevelBackgroundTextureKey(
      this.level.id,
      asset
    );
    if (!this.scene.textures.exists(textureKey)) {
      console.warn(`关卡背景纹理未加载：${asset.path}`);
      return null;
    }

    return this.scene.add
      .image(0, 0, textureKey)
      .setOrigin(0)
      .setDisplaySize(
        this.level.world.width,
        this.level.world.height
      )
      .setDepth(DepthLayers.BACKGROUND);
  }

  createSolids() {
    this.groundObjects = [];
    this.platformObjects = [];
    return this.level.solids.map((solid) => {
      const rectangle = this.scene.add
        .rectangle(
          solid.x,
          solid.y,
          solid.width,
          solid.height,
          Number.parseInt(solid.color.replace("#", ""), 16),
          1
        )
        .setDepth(DepthLayers.SOLID)
        .setVisible(false);

      // 地形只参与碰撞，不在游戏画面中显示；编辑器仍保留可视化编辑。
      this.scene.physics.add.existing(rectangle, true);
      const terrainType = getSolidTerrainType(solid);
      rectangle.terrainType = terrainType;
      if (terrainType === "platform") {
        rectangle.body.checkCollision.down = false;
        rectangle.body.checkCollision.left = false;
        rectangle.body.checkCollision.right = false;
        this.platformObjects.push(rectangle);
      } else {
        this.groundObjects.push(rectangle);
      }
      return rectangle;
    });
  }

  createPlayer(resetPlayerPosition) {
    const playerDefinition = this.dataRepository.getActor("player");
    const playerSkill = this.dataRepository.getSkill(
      playerDefinition.combat.attackSkillId
    );
    const counterSkill = this.dataRepository.getSkill(
      playerDefinition.combat.counterSkillId
    );

    if (!this.runState.player) {
      this.runState.player = {
        actorId: playerDefinition.id,
        x: this.spawnPoint.x,
        y: this.spawnPoint.y,
        facing: 1,
        currentHealth: playerDefinition.stats.maxHealth,
        maxHealth: playerDefinition.stats.maxHealth,
        currentStamina: playerDefinition.stats.maxStamina,
        maxStamina: playerDefinition.stats.maxStamina,
        attack: playerDefinition.stats.attack,
        defense: playerDefinition.stats.defense,
        moveSpeed: playerDefinition.stats.moveSpeed,
        inventory: { ...(playerDefinition.startingInventory ?? {}) }
      };
    }

    if (resetPlayerPosition) {
      this.runState.player.x = this.spawnPoint.x;
      this.runState.player.y = this.spawnPoint.y;
    }

    this.player = new Player(
      this.scene,
      this.runState.player.x,
      this.runState.player.y,
      playerDefinition,
      this.runState.player,
      playerSkill,
      counterSkill,
      this.ctx.eventBus,
      this.ctx.talentService,
      {
        onStateChanged: () => this.handlePlayerStateChanged(),
        onDeath: () => this.handlers.onPlayerDeath?.()
      }
    );
  }

  createEnemies() {
    this.enemies = [];

    (this.level.actors ?? []).forEach((actorSpawn) => {
      const actorDefinition = this.dataRepository.getActor(actorSpawn.actorId);
      if (actorDefinition.type !== "enemy") {
        return;
      }

      const persistentId = `${this.level.id}:${actorSpawn.instanceId}`;
      if (
        this.runState.world.defeatedEnemyIds.includes(persistentId)
      ) {
        return;
      }

      const skill = this.dataRepository.getSkill(
        actorDefinition.combat.attackSkillId
      );
      const actorScale = getActorInstanceScale(actorSpawn);
      const enemy = new Enemy(
        this.scene,
        actorSpawn.x,
        actorSpawn.y,
        actorDefinition,
        skill,
        persistentId,
        {
          onAttackPlayer: (damage, enemy) =>
            this.handleEnemyAttack(damage, enemy),
          onDefeated: (instanceId) =>
            this.handleEnemyDefeated(instanceId, actorDefinition.name)
        },
        {
          scaleX: actorScale.x,
          scaleY: actorScale.y
        }
      );

      this.enemies.push(enemy);
    });
  }

  createPickups() {
    this.pickups = [];

    (this.level.items ?? []).forEach((mapItem) => {
      const persistentId = `${this.level.id}:${mapItem.instanceId}`;
      if (
        this.runState.world.collectedItemIds.includes(persistentId)
      ) {
        return;
      }

      const itemDefinition = this.dataRepository.getItem(mapItem.itemId);
      const pickup = new Pickup(this.scene, mapItem, itemDefinition);
      pickup.persistentId = persistentId;
      this.pickups.push(pickup);
    });
  }

  createEntrances() {
    this.entrances = (this.level.mechanisms ?? [])
      .filter((mechanism) => mechanism.type === "entrance")
      .map((entranceData) => {
        const entrance = {
          data: entranceData,
          key: entranceData.id,
          bounds: {
            left: entranceData.x - entranceData.width / 2,
            right: entranceData.x + entranceData.width / 2,
            top: entranceData.y - entranceData.height / 2,
            bottom: entranceData.y + entranceData.height / 2
          }
        };
        if (this.isPointInsideEntrance(this.spawnPoint, entrance)) {
          this.suppressedEntrances.add(entrance.key);
        }
        return entrance;
      });
  }

  createCollisions() {
    this.scene.physics.add.collider(
      this.player,
      this.groundObjects
    );
    this.scene.physics.add.collider(
      this.player,
      this.platformObjects,
      null,
      (player, platform) =>
        this.shouldCollideWithPlatform(player, platform)
    );

    this.enemies.forEach((enemy) => {
      this.scene.physics.add.collider(
        enemy,
        this.groundObjects
      );
      this.scene.physics.add.collider(
        enemy,
        this.platformObjects,
        null,
        (character, platform) =>
          this.shouldCollideWithPlatform(character, platform)
      );
    });

    this.scene.physics.add.overlap(
      this.player,
      this.pickups,
      (_player, pickup) => this.collectPickup(pickup)
    );

  }

  shouldCollideWithPlatform(character, platform) {
    const body = character?.body;
    const platformBody = platform?.body;
    if (!body || !platformBody) {
      return false;
    }
    if (
      character === this.player &&
      platform === this.platformDropThroughTarget &&
      this.scene.time.now < this.platformDropThroughUntil
    ) {
      return false;
    }
    if (body.velocity.y < 0) {
      return false;
    }

    const previousBottom =
      (body.prev?.y ?? body.y) + body.height;
    return previousBottom <= platformBody.top + 2;
  }

  findSupportingPlatform(character) {
    const body = character?.body;
    if (!body) {
      return null;
    }
    return (
      this.platformObjects.find((platform) => {
        const platformBody = platform.body;
        const horizontallyOverlapping =
          body.right > platformBody.left + 1 &&
          body.left < platformBody.right - 1;
        return (
          horizontallyOverlapping &&
          Math.abs(body.bottom - platformBody.top) <= 4
        );
      }) ?? null
    );
  }

  updatePlatformDropThrough(now) {
    if (
      !this.input.justDown("down") ||
      !this.player.isOnGround()
    ) {
      return;
    }
    const platform = this.findSupportingPlatform(this.player);
    if (!platform) {
      return;
    }
    this.platformDropThroughTarget = platform;
    this.platformDropThroughUntil = now + 280;
    this.player.setVelocityY(
      Math.max(60, this.player.body.velocity.y)
    );
  }

  configureCamera() {
    const cameraConfig = this.level.camera ?? {};
    const camera = this.scene.cameras.main;

    camera.startFollow(
      this.player,
      true,
      cameraConfig.lerpX ?? 0.1,
      cameraConfig.lerpY ?? 0.1
    );
    camera.setDeadzone(
      cameraConfig.deadzoneWidth ?? 160,
      cameraConfig.deadzoneHeight ?? 100
    );

    /*
     * 平滑跟随会先产生小数滚动值。这里显式保证相机在 preRender 阶段
     * 把最终位置取整，避免角色和背景落在半像素上。
     */
    camera.setRoundPixels(true);
  }

  emitInitialUiState() {
    this.ctx.eventBus.emit(
      EventNames.PLAYER_STATS_CHANGED,
      this.player.getRuntimeState()
    );
    this.ctx.eventBus.emit(EventNames.QUEST_CHANGED, null);
    this.ctx.eventBus.emit(
      EventNames.INVENTORY_CHANGED,
      this.player.getRuntimeState().inventory
    );
    this.ctx.eventBus.emit(EventNames.INTERACTION_PROMPT, null);
  }

  update(now, delta = 0) {
    if (this.player.isDead || this.transitioning) {
      return;
    }

    if (this.input.justDown("guard")) {
      this.player.tryStartGuard(now);
    }

    if (this.input.consumeAttack()) {
      this.player.requestAttack(now);
    }

    this.updatePlatformDropThrough(now);
    const attackHit = this.player.update(this.input, now, delta);
    if (attackHit) {
      this.resolvePlayerAttack(attackHit);
    }

    const gameplayActivated = updateGameplaySystems(this);
    if (gameplayActivated) {
      this.publishState();
    }

    for (const enemy of this.enemies) {
      if (enemy.active) {
        enemy.updateAI(this.player, now);
      }
    }

    this.updateEntrances();
  }

  resolvePlayerAttack(attackHit) {
    for (const enemy of this.enemies) {
      if (
        enemy.active &&
        !enemy.isDead &&
        CombatSystem.isTargetInMeleeRange(
          this.player,
          enemy,
          attackHit,
          attackHit.facing
        )
      ) {
        const damage = CombatSystem.calculateDamage(
          this.player.stats,
          enemy.stats,
          attackHit.damageMultiplier
        );
        enemy.receiveDamage(
          damage,
          attackHit.facing,
          attackHit.knockback,
          this.scene.time.now
        );
      }
    }
  }

  collectPickup(pickup) {
    if (!pickup.active || this.transitioning) {
      return;
    }

    const itemDefinition = this.dataRepository.getItem(pickup.itemId);
    const currentQuantity = this.player.inventory[pickup.itemId] ?? 0;
    this.player.inventory[pickup.itemId] =
      currentQuantity + pickup.quantity;

    addUnique(
      this.runState.world.collectedItemIds,
      pickup.persistentId
    );

    this.ctx.eventBus.emit(
      EventNames.UI_TOAST,
      `获得 ${itemDefinition.name} ×${pickup.quantity}`
    );
    this.ctx.eventBus.emit(
      EventNames.INVENTORY_CHANGED,
      { ...this.player.inventory }
    );
    pickup.destroy();
    this.pickups = this.pickups.filter((item) => item !== pickup);

    this.syncPlayerState();
    this.publishState();
  }

  handleEnemyAttack(damage, enemy) {
    const now = this.scene.time.now;
    const blockResult = this.player.tryBlockAttack(now, enemy);
    if (blockResult?.blocked) {
      this.ctx.eventBus.emit(
        EventNames.UI_TOAST,
        blockResult.counter ? "格挡反击" : "防御成功"
      );
      return;
    }

    const appliedDamage = this.player.takeDamage(
      damage,
      now
    );

    if (appliedDamage > 0) {
      this.ctx.eventBus.emit(
        EventNames.UI_TOAST,
        `受到 ${appliedDamage} 点伤害`
      );
      this.syncPlayerState();
      this.publishState();
    }
  }

  handleEnemyDefeated(instanceId, enemyName) {
    addUnique(
      this.runState.world.defeatedEnemyIds,
      instanceId
    );
    this.syncPlayerState();
    this.publishState();
    this.ctx.eventBus.emit(
      EventNames.UI_TOAST,
      `${enemyName}已被击败`
    );
  }

  handlePlayerStateChanged() {
    this.syncPlayerState();
    this.publishState();
  }

  isPointInsideEntrance(point, entrance) {
    return (
      point.x >= entrance.bounds.left &&
      point.x <= entrance.bounds.right &&
      point.y >= entrance.bounds.top &&
      point.y <= entrance.bounds.bottom
    );
  }

  updateEntrances() {
    if (this.transitioning) {
      return;
    }

    for (const entrance of this.entrances) {
      const inside = this.isPointInsideEntrance(this.player, entrance);
      if (!inside) {
        this.suppressedEntrances.delete(entrance.key);
        continue;
      }
      if (this.suppressedEntrances.has(entrance.key)) {
        continue;
      }
      if (
        entrance.data.activation !== "player-center-touch" ||
        !entrance.data.targetExitId
      ) {
        continue;
      }

      const target = this.dataRepository.getExitLocation(
        entrance.data.targetExitId
      );
      this.transitioning = true;

      this.ctx.eventBus.emit(EventNames.LEVEL_EXITED, {
        levelId: this.level.id,
        nextLevelId: target.levelId,
        exitId: target.portal.id
      });

      this.handlers.onEntranceTransition?.({
        levelId: target.levelId,
        exit: target.portal
      });
      return;
    }
  }

  syncPlayerState() {
    this.runState.player = {
      ...this.runState.player,
      ...this.player.getRuntimeState()
    };
  }

  publishState() {
    this.ctx.store.setState(structuredClone(this.runState));
  }

  createSaveSnapshot() {
    this.syncPlayerState();
    this.publishState();
    return structuredClone(this.runState);
  }

  getSummary() {
    return {
      levelName: this.level.name,
      currentHealth: this.player.currentHealth,
      maxHealth: this.player.maxHealth,
      inventory: { ...this.player.inventory }
    };
  }
}

function addUnique(array, value) {
  if (!array.includes(value)) {
    array.push(value);
  }
}
