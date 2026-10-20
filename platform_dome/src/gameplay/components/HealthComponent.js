/**
 * 生命值组件。
 *
 * 组件只关心“当前生命、最大生命、受伤和死亡”，不知道 Sprite 是否存在。
 * 这样 NPC、玩家、敌人以及以后可能出现的建筑都可以复用。
 */
export class HealthComponent {
  constructor({ maxHealth, currentHealth, onChange, onDeath }) {
    this.maxHealth = Number(maxHealth);
    this.currentHealth = Math.min(
      this.maxHealth,
      Math.max(0, Number(currentHealth ?? maxHealth))
    );
    this.onChange = onChange;
    this.onDeath = onDeath;
    this.dead = this.currentHealth <= 0;
  }

  get isDead() {
    return this.dead;
  }

  damage(amount) {
    if (this.dead || amount <= 0) {
      return 0;
    }

    const appliedDamage = Math.min(this.currentHealth, Math.max(0, amount));
    this.currentHealth -= appliedDamage;
    this.onChange?.(this.currentHealth, this.maxHealth);

    if (this.currentHealth <= 0 && !this.dead) {
      this.dead = true;
      this.onDeath?.();
    }

    return appliedDamage;
  }

  heal(amount) {
    if (this.dead || amount <= 0) {
      return 0;
    }

    const before = this.currentHealth;
    this.currentHealth = Math.min(this.maxHealth, this.currentHealth + amount);
    const appliedHealing = this.currentHealth - before;

    if (appliedHealing > 0) {
      this.onChange?.(this.currentHealth, this.maxHealth);
    }

    return appliedHealing;
  }
}
