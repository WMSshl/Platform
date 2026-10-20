import test from "node:test";
import assert from "node:assert/strict";
import { APP_CONFIG } from "../../src/config/appConfig.js";
import { SaveService } from "../../src/services/save/SaveService.js";

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

  removeItem(key) {
    this.values.delete(key);
  }
}

test("版本 1 存档会迁移到当前版本并保留原有数据", () => {
  const storage = new MemoryStorage();
  storage.setItem(
    "platform-dome.save.slot-0",
    JSON.stringify({
      version: 1,
      savedAt: "2026-01-01T00:00:00.000Z",
      data: {
        levelId: "level-001",
        player: {
          currentHealth: 80,
          maxHealth: 100
        },
        story: {},
        world: {}
      }
    })
  );

  const envelope = new SaveService(storage).load(0);

  assert.equal(envelope.version, APP_CONFIG.saveVersion);
  assert.equal(envelope.data.levelId, "level-001");
  assert.equal(envelope.data.player.currentHealth, 80);
  assert.equal(envelope.data.player.currentStamina, null);
});
