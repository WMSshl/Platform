import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { APP_CONFIG } from "../../src/config/appConfig.js";

const actors = JSON.parse(
  await readFile(
    new URL("../../data/configs/actors.json", import.meta.url),
    "utf8"
  )
);
const skills = JSON.parse(
  await readFile(
    new URL("../../data/configs/skills.json", import.meta.url),
    "utf8"
  )
);

test("all character definitions use a 1.5x display scale", () => {
  assert.equal(actors.player.appearance.spriteScale, 3);
  assert.equal(actors.guard.appearance.spriteScale, 1.5);
  assert.equal(actors["npc-guide"].appearance.spriteScale, 1.5);
  assert.equal(actors.player.physics.bodyWidth, 51);
  assert.equal(actors.player.physics.bodyHeight, 102);
});

test("melee skill ranges scale by 1.5", () => {
  assert.equal(skills["player-melee-strike"].range, 138);
  assert.equal(
    skills["player-melee-strike"].verticalRange,
    123
  );
  assert.deepEqual(
    skills["player-melee-strike"].combo.stages.map(
      (stage) => [stage.range, stage.verticalRange]
    ),
    [
      [114, 99],
      [111, 99],
      [123, 105]
    ]
  );
  assert.equal(skills["enemy-melee-slash"].range, 144);
  assert.equal(
    skills["enemy-melee-slash"].verticalRange,
    108
  );
});

test("jump velocity produces 1.5x the previous jump height", () => {
  const oldHeight =
    (720 * 720) / (2 * APP_CONFIG.gravityY);
  const currentVelocity = actors.player.stats.jumpVelocity;
  const currentHeight =
    (currentVelocity * currentVelocity) /
    (2 * APP_CONFIG.gravityY);

  assert.ok(
    Math.abs(currentHeight / oldHeight - 1.5) < 0.001
  );
});
