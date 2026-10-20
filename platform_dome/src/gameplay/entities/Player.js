import { BaseEntity } from "../../core/entity/BaseEntity.js";
import { DepthLayers } from "../../constants/DepthLayers.js";
import { TalentIds } from "../../constants/TalentIds.js";
import { EventNames } from "../../events/EventNames.js";
import { HealthComponent } from "../components/HealthComponent.js";
import { PlaceholderTextureService } from "../../services/assets/PlaceholderTextureService.js";
import {
  PLAYER_GUARD_ANIMATION_KEYS,
  PLAYER_GUARD_SUCCESS_DURATION_MS,
  getPlayerAnimationDurationMs,
  getPlayerAnimationFrameRate,
  getPlayerAnimationKey
} from "../../config/playerAnimations.js";

const GUARD_ENTER_MS = 50;

/**
 * 玩家实体。
 *
 * 玩家的基础数值来自角色的已保存状态或 actors.json。
 * 移动、耐力、防御、连击和动作动画都在这里统一管理；
 * 具体命中结算仍交给 GameWorld，避免实体直接依赖敌人列表。
 */
export class Player extends BaseEntity {
  constructor(
    scene,
    x,
    y,
    definition,
    savedState,
    attackSkill,
    counterSkill,
    eventBus,
    talentService,
    handlers = {}
  ) {
    super(
      scene,
      x,
      y,
      definition.appearance?.textureKey ??
        PlaceholderTextureService.getActorTextureKey(definition.id),
      definition,
      DepthLayers.ACTOR
    );

    this.eventBus = eventBus;
    this.attackSkill = attackSkill;
    this.counterSkill = counterSkill;
    this.talentService = talentService;
    this.comboConfig = attackSkill.combo;
    this.defenseConfig = {
      staminaCost: 15,
      activeMs: 200,
      cooldownMs: 300,
      ...(definition.defense ?? {})
    };
    this.onStateChanged = handlers.onStateChanged;
    this.onDeath = handlers.onDeath;

    // 已保存的数值优先，保证读档后属性与保存时完全一致。
    this.stats.maxHealth =
      savedState?.maxHealth ?? definition.stats.maxHealth;
    this.stats.attack = savedState?.attack ?? definition.stats.attack;
    this.stats.defense = savedState?.defense ?? definition.stats.defense;
    this.stats.moveSpeed =
      savedState?.moveSpeed ?? definition.stats.moveSpeed;
    this.stats.maxStamina =
      savedState?.maxStamina ?? definition.stats.maxStamina ?? 100;
    this.stats.staminaRegenPerSecond =
      definition.stats.staminaRegenPerSecond ?? 20;
    this.stats.staminaRegenDelayMs =
      definition.stats.staminaRegenDelayMs ?? 600;
    this.stats.sprintCostPerSecond =
      definition.stats.sprintCostPerSecond ?? 5;
    this.stats.sprintSpeedMultiplier =
      definition.stats.sprintSpeedMultiplier ?? 1.6;

    this.maxStamina = this.stats.maxStamina;
    this.stamina = clamp(
      savedState?.currentStamina ?? this.maxStamina,
      0,
      this.maxStamina
    );
    this.lastStaminaUseAt = Number.NEGATIVE_INFINITY;
    this.lastEmittedStamina = Math.round(this.stamina);

    this.health = new HealthComponent({
      maxHealth: this.stats.maxHealth,
      currentHealth: savedState?.currentHealth,
      onChange: () => {
        this.emitStats();
        this.onStateChanged?.();
      },
      onDeath: () => this.handleDeath()
    });

    this.inventory = {
      ...(savedState?.inventory ?? definition.startingInventory ?? {})
    };
    this.facing = savedState?.facing === -1 ? -1 : 1;
    this.setFlipX(this.facing === -1);

    this.invulnerableUntil = 0;
    this.isHurt = false;
    this.hurtUntil = 0;
    this.isGuarding = false;
    this.guardSucceeded = false;
    this.guardActiveUntil = 0;
    this.guardActionUntil = 0;
    this.guardEnterEndsAt = 0;
    this.guardReadyAt = 0;
    this.currentAttack = null;
    this.counterAttack = null;
    this.comboStage = 0;
    this.comboExpiresAt = 0;
    this.deathAnimationStarted = false;
    this.deathNotified = false;

    this.playAnimation("idle", true);
    this.emitStats();
  }

  get currentHealth() {
    return this.health.currentHealth;
  }

  get maxHealth() {
    return this.health.maxHealth;
  }

  get isDead() {
    return this.health.isDead;
  }

  /**
   * 处理移动、防御、连击、耐力和动画状态。
   * 返回本帧需要结算的玩家攻击；命中判定本身由 GameWorld 执行。
   */
  update(input, now, delta = 0) {
    if (this.isDead) {
      this.setVelocityX(0);
      return null;
    }

    this.updateStatusTimers(now);

    if (this.counterAttack) {
      this.setVelocityX(0);
      const counterHit = this.updateCounterAttack(now);
      this.updateStamina(now, delta, false);
      this.updateAnimation(input, now, true, 0, false);
      return counterHit;
    }

    if (this.isHurt) {
      this.setVelocityX(0);
      this.updateStamina(now, delta, false);
      this.updateAnimation(input, now, true, 0, false);
      return null;
    }

    if (this.isGuarding) {
      this.setVelocityX(0);
      this.updateGuard(now);
      this.updateStamina(now, delta, false);
      this.updateAnimation(input, now, true, 0, false);
      return null;
    }

    const onGround = this.isOnGround();
    let direction = 0;
    if (input.isDown("left")) {
      direction -= 1;
    }
    if (input.isDown("right")) {
      direction += 1;
    }

    const sprinting =
      input.isDown("sprint") && direction !== 0 && this.stamina > 0;
    const speed =
      this.stats.moveSpeed *
      (sprinting ? this.stats.sprintSpeedMultiplier : 1);
    const attackLocksGroundMovement =
      onGround && Boolean(this.currentAttack);
    this.setVelocityX(
      attackLocksGroundMovement ? 0 : direction * speed
    );

    if (direction !== 0 && !this.currentAttack) {
      this.facing = direction;
      this.setFlipX(direction < 0);
    }

    if (
      input.justDown("jump") &&
      onGround &&
      !attackLocksGroundMovement
    ) {
      this.setVelocityY(this.definition.stats.jumpVelocity);
    }

    const attackHit = this.updateAttack(now);
    this.updateAnimation(input, now, onGround, direction, sprinting);
    this.updateStamina(
      now,
      delta,
      attackLocksGroundMovement ? false : sprinting
    );
    return attackHit;
  }

  updateStatusTimers(now) {
    if (this.isHurt && now >= this.hurtUntil) {
      this.isHurt = false;
    }

    if (this.isGuarding && now >= this.guardActionUntil) {
      this.isGuarding = false;
    }
  }

  updateGuard(now) {
    if (
      !this.isGuarding ||
      this.guardSucceeded ||
      now < this.guardEnterEndsAt
    ) {
      return;
    }

    this.playAnimationKey(PLAYER_GUARD_ANIMATION_KEYS.hold);
  }

  /**
   * 按一次防御键开启一个 0.2 秒防御窗口。
   * 防御动作期间不能移动或攻击；只有地面可以使用。
   */
  tryStartGuard(now) {
    if (
      this.isDead ||
      this.isHurt ||
      this.isGuarding ||
      this.currentAttack ||
      this.counterAttack ||
      !this.isOnGround() ||
      now < this.guardReadyAt ||
      this.stamina < this.defenseConfig.staminaCost
    ) {
      return false;
    }

    this.stamina -= this.defenseConfig.staminaCost;
    this.lastStaminaUseAt = now;
    this.guardSucceeded = false;
    this.isGuarding = true;
    const durationBonus = this.talentService?.isEnabled(
      TalentIds.GUARD_DURATION
    )
      ? this.defenseConfig.guardDurationTalentBonusMs ?? 100
      : 0;
    this.guardActiveUntil =
      now + this.defenseConfig.activeMs + durationBonus;
    this.guardActionUntil = this.guardActiveUntil;
    this.guardEnterEndsAt = now + GUARD_ENTER_MS;
    this.guardReadyAt =
      this.guardActiveUntil + this.defenseConfig.cooldownMs;
    this.setVelocityX(0);
    this.playAnimationKey(PLAYER_GUARD_ANIMATION_KEYS.enter, true);
    this.emitStaminaIfChanged();
    return true;
  }

  isGuardActive(now) {
    return this.isGuarding && now < this.guardActiveUntil;
  }

  /**
   * 防御成功时只播放一次后续防御帧。
   * 只挡正面攻击；成功动画可以延伸视觉动作，但不会延长实际防御窗口。
   */
  tryBlockAttack(now, attacker) {
    if (!this.isGuardActive(now)) {
      return null;
    }

    const attackerDirection = Math.sign(attacker.x - this.x);
    if (attackerDirection !== 0 && attackerDirection !== this.facing) {
      return null;
    }

    const useCounter =
      this.talentService?.isEnabled(TalentIds.GUARD_COUNTER) &&
      Boolean(this.counterSkill);

    if (useCounter) {
      if (this.counterAttack) {
        return { blocked: true, counter: true };
      }

      const durationMs = getPlayerAnimationDurationMs("guard-counter");
      const frameRate = getPlayerAnimationFrameRate("guard-counter");
      const hitFrame = this.counterSkill.hitFrame ?? 5;

      this.guardSucceeded = true;
      this.guardActionUntil = Math.max(
        this.guardActionUntil,
        now + durationMs
      );
      this.counterAttack = {
        startedAt: now,
        durationMs,
        hitAtMs: ((hitFrame - 1) / frameRate) * 1000,
        hitResolved: false,
        facing: this.facing,
        config: this.counterSkill
      };
      this.playAnimationKey(PLAYER_GUARD_ANIMATION_KEYS.counter, true);
      return { blocked: true, counter: true };
    }

    if (!this.guardSucceeded) {
      this.guardSucceeded = true;
      this.guardActionUntil = Math.max(
        this.guardActionUntil,
        now + PLAYER_GUARD_SUCCESS_DURATION_MS
      );
      this.playAnimationKey(PLAYER_GUARD_ANIMATION_KEYS.success, true);
    }

    return { blocked: true, counter: false };
  }

  /**
   * 格挡反击只在一个动画帧触发伤害，其余帧仅播放动作。
   */
  updateCounterAttack(now) {
    if (!this.counterAttack) {
      return null;
    }

    const counter = this.counterAttack;
    let hit = null;

    if (
      !counter.hitResolved &&
      now >= counter.startedAt + counter.hitAtMs
    ) {
      counter.hitResolved = true;
      hit = {
        ...counter.config,
        facing: counter.facing
      };
    }

    if (now >= counter.startedAt + counter.durationMs) {
      this.counterAttack = null;
      this.isGuarding = false;
    }

    return hit;
  }

  /**
   * 请求一次攻击。攻击进行中再次按键会缓存下一段连击。
   * 第一段结束后未继续攻击的 0.45 秒内，仍可接第二段。
   */
  requestAttack(now) {
    if (this.isDead || this.isHurt || this.isGuarding) {
      return false;
    }

    if (this.currentAttack) {
      if (this.currentAttack.stage < this.comboConfig.stages.length) {
        this.currentAttack.buffered = true;
      }
      return true;
    }

    const canContinue =
      this.comboStage > 0 &&
      this.comboStage < this.comboConfig.stages.length &&
      now <= this.comboExpiresAt;
    const stage = canContinue ? this.comboStage + 1 : 1;
    this.startAttackStage(stage, now);
    return true;
  }

  startAttackStage(stageIndex, now) {
    const stage = this.comboConfig.stages[stageIndex - 1];
    const frameRate = getPlayerAnimationFrameRate(stage.animation);
    const durationMs = getPlayerAnimationDurationMs(stage.animation);

    this.currentAttack = {
      stage: stageIndex,
      config: stage,
      startedAt: now,
      durationMs,
      hitAtMs: ((stage.hitFrame - 1) / frameRate) * 1000,
      hitResolved: false,
      buffered: false,
      facing: this.facing
    };
    this.playAnimation(stage.animation, true);
  }

  /**
   * 每段攻击只有命中帧返回一次伤害事件。
   */
  updateAttack(now) {
    if (!this.currentAttack) {
      return null;
    }

    const attack = this.currentAttack;
    let hit = null;

    if (
      !attack.hitResolved &&
      now >= attack.startedAt + attack.hitAtMs
    ) {
      attack.hitResolved = true;
      hit = {
        ...attack.config,
        facing: attack.facing
      };
    }

    if (now >= attack.startedAt + attack.durationMs) {
      const finishedStage = attack.stage;
      if (
        attack.buffered &&
        finishedStage < this.comboConfig.stages.length
      ) {
        this.startAttackStage(finishedStage + 1, now);
      } else {
        this.comboStage =
          finishedStage >= this.comboConfig.stages.length
            ? 0
            : finishedStage;
        this.comboExpiresAt = now + this.comboConfig.windowMs;
        this.currentAttack = null;
      }
    }

    return hit;
  }

  updateAnimation(input, now, onGround, direction, sprinting) {
    if (
      this.isHurt ||
      this.isGuarding ||
      this.currentAttack ||
      this.counterAttack
    ) {
      return;
    }

    if (onGround) {
      this.playAnimation(
        direction !== 0 ? (sprinting ? "run" : "walk") : "idle"
      );
      return;
    }

    const horizontalSpeed = Math.abs(this.body.velocity.x);
    const verticalSpeed = this.body.velocity.y;
    if (horizontalSpeed > 10 && Math.abs(verticalSpeed) < 260) {
      this.playAnimation("air");
    } else if (verticalSpeed < 0) {
      this.playAnimation("jump");
    } else {
      this.playAnimation("fall");
    }
  }

  playAnimation(name, force = false) {
    this.playAnimationKey(getPlayerAnimationKey(name), force);
  }

  playAnimationKey(key, force = false) {
    if (!this.scene.anims.exists(key)) {
      return;
    }

    const currentKey = this.anims.currentAnim?.key;
    if (!force && currentKey === key) {
      return;
    }

    this.play(key, true);
  }

  updateStamina(now, delta, sprinting) {
    if (delta <= 0) {
      return;
    }

    const elapsedSeconds = Math.min(delta, 100) / 1000;
    if (sprinting) {
      this.stamina = Math.max(
        0,
        this.stamina - this.stats.sprintCostPerSecond * elapsedSeconds
      );
      this.lastStaminaUseAt = now;
    } else if (
      now - this.lastStaminaUseAt >= this.stats.staminaRegenDelayMs
    ) {
      this.stamina = Math.min(
        this.maxStamina,
        this.stamina +
          this.stats.staminaRegenPerSecond * elapsedSeconds
      );
    }

    this.emitStaminaIfChanged();
  }

  emitStaminaIfChanged() {
    const rounded = Math.round(this.stamina);
    if (rounded === this.lastEmittedStamina) {
      return;
    }

    this.lastEmittedStamina = rounded;
    this.emitStats();
  }

  takeDamage(amount, now) {
    if (this.isDead || now < this.invulnerableUntil) {
      return 0;
    }

    this.invulnerableUntil =
      now + (this.attackSkill.invulnerabilityMs ?? 700);
    const appliedDamage = this.health.damage(amount);

    if (appliedDamage > 0 && !this.isDead) {
      this.isHurt = true;
      this.hurtUntil = now + getPlayerAnimationDurationMs("hurt");
      this.isGuarding = false;
      this.guardSucceeded = false;
      this.currentAttack = null;
      this.counterAttack = null;
      this.comboStage = 0;
      this.comboExpiresAt = 0;
      this.setVelocityX(0);
      this.playAnimation("hurt", true);
    }

    return appliedDamage;
  }

  handleDeath() {
    if (this.deathAnimationStarted) {
      return;
    }

    this.deathAnimationStarted = true;
    this.isGuarding = false;
    this.isHurt = false;
    this.currentAttack = null;
    this.counterAttack = null;
    this.setVelocity(0, 0);
    this.playAnimation("death", true);

    const deathDurationMs =
      getPlayerAnimationDurationMs("death") + 100;
    this.scene.time.delayedCall(deathDurationMs, () => {
      if (this.deathNotified) {
        return;
      }

      this.deathNotified = true;
      this.onDeath?.();
    });
  }

  isOnGround() {
    return Boolean(this.body?.blocked.down || this.body?.touching.down);
  }

  emitStats() {
    this.lastEmittedStamina = Math.round(this.stamina);
    this.eventBus.emit(
      EventNames.PLAYER_STATS_CHANGED,
      this.getRuntimeState()
    );
    this.eventBus.emit(EventNames.PLAYER_HEALTH_CHANGED, {
      currentHealth: this.currentHealth,
      maxHealth: this.maxHealth
    });
  }

  /**
   * 将运行时数据转换为普通对象。
   * 存档和高频物理对象之间通过这个边界隔离。
   */
  getRuntimeState() {
    return {
      actorId: this.actorId,
      x: this.x,
      y: this.y,
      facing: this.facing,
      currentHealth: this.currentHealth,
      maxHealth: this.maxHealth,
      currentStamina: this.stamina,
      maxStamina: this.maxStamina,
      attack: this.stats.attack,
      defense: this.stats.defense,
      moveSpeed: this.stats.moveSpeed,
      inventory: { ...this.inventory }
    };
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
