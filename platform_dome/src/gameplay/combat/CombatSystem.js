/**
 * 战斗纯规则集合。
 *
 * 这些函数不依赖 Phaser，后续可以单独写单元测试。
 * 具体攻击力、防御力、技能倍率都来自配置，不在公式里写死。
 */
export class CombatSystem {
  static calculateDamage(attackerStats, defenderStats, damageMultiplier) {
    return Math.max(
      1,
      Math.round(attackerStats.attack * damageMultiplier - defenderStats.defense)
    );
  }

  /**
   * 判断目标是否位于攻击者面向一侧的近战范围内。
   * 水平和垂直方向都使用技能配置中的范围。
   */
  static isTargetInMeleeRange(attacker, target, skill, facing) {
    if (!target?.active || target.isDead) {
      return false;
    }

    const horizontalDistance = target.x - attacker.x;
    const verticalDistance = Math.abs(target.y - attacker.y);

    return (
      Math.sign(horizontalDistance) === facing &&
      Math.abs(horizontalDistance) <= skill.range &&
      verticalDistance <= skill.verticalRange
    );
  }
}
