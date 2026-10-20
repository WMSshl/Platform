import test from "node:test";
import assert from "node:assert/strict";
import { TalentService } from "../../src/services/talents/TalentService.js";

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, value);
  }
}

test("天赋开关会持久化并恢复", () => {
  const storage = new MemoryStorage();
  const first = new TalentService(storage);

  assert.equal(first.isEnabled("guard-duration"), false);
  assert.equal(first.toggle("guard-duration"), true);
  assert.equal(first.setEnabled("guard-counter", true), true);

  const restored = new TalentService(storage);
  assert.equal(restored.isEnabled("guard-duration"), true);
  assert.equal(restored.isEnabled("guard-counter"), true);
});
