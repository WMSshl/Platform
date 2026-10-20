import test from "node:test";
import assert from "node:assert/strict";
import { CombatSystem } from "../../src/gameplay/combat/CombatSystem.js";
import { HealthComponent } from "../../src/gameplay/components/HealthComponent.js";

test("伤害至少为 1，避免高防御时完全无法造成伤害", () => {
  const damage = CombatSystem.calculateDamage(
    { attack: 5 },
    { defense: 30 },
    1
  );
  assert.equal(damage, 1);
});

test("技能倍率参与伤害计算", () => {
  const damage = CombatSystem.calculateDamage(
    { attack: 20 },
    { defense: 4 },
    1.5
  );
  assert.equal(damage, 26);
});

test("近战攻击只命中面向一侧、且处于技能范围内的目标", () => {
  const attacker = { x: 100, y: 100 };
  const inFront = { x: 160, y: 100, active: true, isDead: false };
  const behind = { x: 40, y: 100, active: true, isDead: false };
  const tooHigh = { x: 160, y: 220, active: true, isDead: false };
  const skill = { range: 80, verticalRange: 60 };

  assert.equal(
    CombatSystem.isTargetInMeleeRange(attacker, inFront, skill, 1),
    true
  );
  assert.equal(
    CombatSystem.isTargetInMeleeRange(attacker, behind, skill, 1),
    false
  );
  assert.equal(
    CombatSystem.isTargetInMeleeRange(attacker, tooHigh, skill, 1),
    false
  );
});

test("生命组件在生命归零时只触发一次死亡回调", () => {
  let deathCount = 0;
  const health = new HealthComponent({
    maxHealth: 30,
    currentHealth: 30,
    onDeath: () => {
      deathCount += 1;
    }
  });

  health.damage(20);
  health.damage(20);
  health.damage(5);

  assert.equal(health.currentHealth, 0);
  assert.equal(deathCount, 1);
});
