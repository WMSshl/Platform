import { BaseEntity } from "../../core/entity/BaseEntity.js";
import { DepthLayers } from "../../constants/DepthLayers.js";
import { HealthComponent } from "../components/HealthComponent.js";
import { CombatSystem } from "../combat/CombatSystem.js";
import { PlaceholderTextureService } from "../../services/assets/PlaceholderTextureService.js";

/**
 * 敌人实体。
 *
 * 当前实现包含巡逻、发现玩家、追击、攻击前摇、命中判定和冷却。
 * 敌人不会因为身体接触玩家而扣血，只有攻击技能结算时才会造成伤害。
 */
export class Enemy extends BaseEntity {
  constructor(
    scene,
    x,
    y,
    definition,
    attackSkill,
    instanceId,
    handlers = {},
    options = {}
  ) {
    super(
      scene,
      x,
      y,
      PlaceholderTextureService.getActorTextureKey(definition.id),
      definition,
      DepthLayers.ACTOR,
      options
    );

    this.instanceId = instanceId;
    this.attackSkill = attackSkill;
    this.behavior = definition.behavior;
    this.onAttackPlayer = handlers.onAttackPlayer;
    this.onDefeated = handlers.onDefeated;

    this.health = new HealthComponent({
      maxHealth: definition.stats.maxHealth,
      currentHealth: definition.stats.maxHealth,
      onChange: () => this.updateHealthBar(),
      onDeath: () => this.handleDeath()
    });

    this.patrolOriginX = x;
    this.patrolDirection = -1;
    this.patrolPauseUntil = 0;
    this.attackPhase = "idle";
    this.windupEndsAt = 0;
    this.recoveryEndsAt = 0;
    this.cooldownUntil = 0;
    this.stunnedUntil = 0;
    this.attackFacing = -1;
    this.telegraph = null;
    this.facing = -1;
    this.setFlipX(true);

    this.healthBarWidth = Math.max(42, this.displayWidth);
    this.healthBarOffsetY = this.displayHeight / 2 + 13;
    this.healthBarBackground = scene.add
      .rectangle(
        this.x,
        this.y - this.healthBarOffsetY,
        this.healthBarWidth,
        7,
        0x020617,
        0.9
      )
      .setDepth(DepthLayers.ACTOR + 1);
    this.healthBarFill = scene.add
      .rectangle(
        this.x - this.healthBarWidth / 2,
        this.y - this.healthBarOffsetY,
        this.healthBarWidth,
        5,
        0xef4444,
        1
      )
      .setOrigin(0, 0.5)
      .setDepth(DepthLayers.ACTOR + 2);
  }

  get isDead() {
    return this.health.isDead;
  }

  updateAI(player, now) {
    if (this.isDead || player.isDead) {
      this.setVelocityX(0);
      return;
    }

    this.updateHealthBarPosition();

    if (now < this.stunnedUntil) {
      return;
    }

    if (this.attackPhase === "windup") {
      this.setVelocityX(0);
      this.updateTelegraphPosition();

      if (now >= this.windupEndsAt) {
        this.resolveAttack(player, now);
      }
      return;
    }

    if (this.attackPhase === "recovery") {
      this.setVelocityX(0);
      if (now >= this.recoveryEndsAt) {
        this.attackPhase = "idle";
      }
      return;
    }

    const horizontalDistance = player.x - this.x;
    const verticalDistance = Math.abs(player.y - this.y);
    const totalDistance = Math.hypot(horizontalDistance, verticalDistance);

    if (totalDistance <= this.behavior.detectionRange) {
      this.updateFacing(horizontalDistance);

      const inAttackRange =
        Math.abs(horizontalDistance) <= this.attackSkill.range * 0.92 &&
        verticalDistance <= this.attackSkill.verticalRange;

      if (inAttackRange && now >= this.cooldownUntil) {
        this.startAttack(now);
        return;
      }

      if (Math.abs(horizontalDistance) > this.attackSkill.range * 0.72) {
        this.setVelocityX(
          Math.sign(horizontalDistance) * this.stats.moveSpeed
        );
      } else {
        this.setVelocityX(0);
      }
      return;
    }

    this.updatePatrol(now);
  }

  updateFacing(horizontalDistance) {
    if (horizontalDistance === 0) {
      return;
    }

    this.facing = Math.sign(horizontalDistance);
    this.setFlipX(this.facing < 0);
  }

  updatePatrol(now) {
    const leftBound =
      this.patrolOriginX - this.behavior.patrolDistance;
    const rightBound =
      this.patrolOriginX + this.behavior.patrolDistance;

    if (now < this.patrolPauseUntil) {
      this.setVelocityX(0);
      return;
    }

    if (this.x <= leftBound) {
      this.patrolDirection = 1;
      this.patrolPauseUntil = now + this.behavior.patrolPauseMs;
    } else if (this.x >= rightBound) {
      this.patrolDirection = -1;
      this.patrolPauseUntil = now + this.behavior.patrolPauseMs;
    }

    this.facing = this.patrolDirection;
    this.setFlipX(this.facing < 0);
    this.setVelocityX(this.patrolDirection * this.stats.moveSpeed * 0.55);
  }

  startAttack(now) {
    this.attackPhase = "windup";
    this.attackFacing = this.facing;
    this.windupEndsAt = now + this.attackSkill.windupMs;
    this.setVelocityX(0);
    this.setTint(
      Number.parseInt(this.attackSkill.telegraphColor.replace("#", ""), 16)
    );

    const telegraphX =
      this.x + this.attackFacing * this.attackSkill.range * 0.5;
    this.telegraph = this.scene.add
      .rectangle(
        telegraphX,
        this.y,
        this.attackSkill.range,
        this.attackSkill.verticalRange * 1.5,
        Number.parseInt(this.attackSkill.telegraphColor.replace("#", ""), 16),
        0.16
      )
      .setDepth(DepthLayers.ATTACK_EFFECT);
  }

  resolveAttack(player, now) {
    const strikeX =
      this.x + this.attackFacing * this.attackSkill.range * 0.5;
    this.destroyTelegraph();
    this.clearTint();

    const strikeEffect = this.scene.add
      .rectangle(
        strikeX,
        this.y,
        this.attackSkill.range,
        this.attackSkill.verticalRange * 1.5,
        Number.parseInt(this.attackSkill.telegraphColor.replace("#", ""), 16),
        0.38
      )
      .setDepth(DepthLayers.ATTACK_EFFECT);

    this.scene.tweens.add({
      targets: strikeEffect,
      alpha: 0,
      duration: Math.max(120, this.attackSkill.activeMs),
      onComplete: () => strikeEffect.destroy()
    });

    /*
     * 命中判定发生在攻击真正挥出的瞬间。
     * 如果玩家在前摇期间离开范围，就不会受到伤害。
     */
    if (
      CombatSystem.isTargetInMeleeRange(
        this,
        player,
        this.attackSkill,
        this.attackFacing
      )
    ) {
      const damage = CombatSystem.calculateDamage(
        this.stats,
        player.stats,
        this.attackSkill.damageMultiplier
      );
      this.onAttackPlayer?.(damage, this);
    }

    this.cooldownUntil = now + this.attackSkill.cooldownMs;
    this.attackPhase = "recovery";
    this.recoveryEndsAt = now + this.attackSkill.recoveryMs;
  }

  receiveDamage(amount, knockbackDirection, knockbackStrength, now) {
    if (this.isDead) {
      return 0;
    }

    const appliedDamage = this.health.damage(amount);
    if (appliedDamage > 0 && !this.isDead) {
      this.stunnedUntil = now + 160;
      this.setVelocityX(knockbackDirection * knockbackStrength);
      this.setTint(0xffffff);
      this.scene.time.delayedCall(90, () => {
        if (this.active) {
          this.clearTint();
        }
      });
    }

    return appliedDamage;
  }

  handleDeath() {
    this.attackPhase = "dead";
    this.setVelocity(0, 0);
    this.destroyTelegraph();

    if (this.body) {
      this.body.enable = false;
    }

    this.healthBarBackground?.setVisible(false);
    this.healthBarFill?.setVisible(false);
    this.onDefeated?.(this.instanceId);

    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      duration: 240,
      onComplete: () => this.destroy()
    });
  }

  updateHealthBar() {
    if (!this.healthBarFill?.active) {
      return;
    }

    const ratio = Math.max(
      0,
      this.health.currentHealth / this.health.maxHealth
    );
    this.healthBarFill.displayWidth = this.healthBarWidth * ratio;
  }

  updateHealthBarPosition() {
    if (!this.healthBarBackground?.active) {
      return;
    }

    this.healthBarBackground.setPosition(
      this.x,
      this.y - this.healthBarOffsetY
    );
    this.healthBarFill.setPosition(
      this.x - this.healthBarWidth / 2,
      this.y - this.healthBarOffsetY
    );
  }

  updateTelegraphPosition() {
    if (!this.telegraph?.active) {
      return;
    }

    this.telegraph.setPosition(
      this.x + this.attackFacing * this.attackSkill.range * 0.5,
      this.y
    );
  }

  destroyTelegraph() {
    this.telegraph?.destroy();
    this.telegraph = null;
  }

  destroy(fromScene) {
    this.destroyTelegraph();
    this.healthBarBackground?.destroy();
    this.healthBarFill?.destroy();
    super.destroy(fromScene);
  }
}
