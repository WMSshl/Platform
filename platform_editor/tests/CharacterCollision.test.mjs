import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  resizeCharacterCollisionBody,
  setCharacterFrameAttackRange
} from "../src/editor/CharacterContentEditor.js";

const html = readFileSync(
  new URL("../index.html", import.meta.url),
  "utf8"
);
const editorSource = readFileSync(
  new URL(
    "../src/editor/CharacterContentEditor.js",
    import.meta.url
  ),
  "utf8"
);

const start = {
  x: 0.2,
  y: 0.1,
  width: 0.4,
  height: 0.8
};

test("拖动碰撞体内部时整体移动并限制在帧内", () => {
  assert.deepEqual(
    resizeCharacterCollisionBody(
      start,
      { kind: "move" },
      0.1,
      -0.05
    ),
    { x: 0.3, y: 0.05, width: 0.4, height: 0.8 }
  );
  assert.deepEqual(
    resizeCharacterCollisionBody(
      start,
      { kind: "move" },
      0.8,
      0.8
    ),
    { x: 0.6, y: 0.2, width: 0.4, height: 0.8 }
  );
});

test("拖动边只缩放对应方向，拖动角同时缩放宽高", () => {
  assert.deepEqual(
    resizeCharacterCollisionBody(
      start,
      { kind: "resize", edges: { right: true } },
      0.15,
      0
    ),
    { x: 0.2, y: 0.1, width: 0.55, height: 0.8 }
  );
  assert.deepEqual(
    resizeCharacterCollisionBody(
      start,
      { kind: "resize", edges: { left: true } },
      0.1,
      0
    ),
    { x: 0.3, y: 0.1, width: 0.3, height: 0.8 }
  );
  assert.deepEqual(
    resizeCharacterCollisionBody(
      start,
      {
        kind: "resize",
        edges: { left: true, bottom: true }
      },
      -0.05,
      0.1
    ),
    { x: 0.15, y: 0.1, width: 0.45, height: 0.9 }
  );
});

test("碰撞体缩放保留最小尺寸且不越出帧边界", () => {
  assert.deepEqual(
    resizeCharacterCollisionBody(
      start,
      { kind: "resize", edges: { right: true } },
      -1,
      0
    ),
    { x: 0.2, y: 0.1, width: 0.02, height: 0.8 }
  );
  assert.deepEqual(
    resizeCharacterCollisionBody(
      start,
      { kind: "resize", edges: { top: true } },
      0,
      -1
    ),
    { x: 0.2, y: 0, width: 0.4, height: 0.9 }
  );
});

test("帧设置提供淡黄色碰撞体编辑模式和共享说明", () => {
  assert.match(html, /data-frame-edit-mode="collision"/);
  assert.match(html, /id="character-frame-collision-controls"/);
  assert.match(html, /id="character-collision-stats"/);
  assert.match(html, /所有动画帧共享/);
  assert.match(html, /淡黄色/);
  assert.match(editorSource, /rgba\(250, 204, 21, 0\.13\)/);
  assert.match(editorSource, /COLLISION_HANDLE_RADIUS/);
});

test("攻击范围按帧独立保存，不会沿用到其它帧", () => {
  const range = {
    points: [
      { x: 30, y: 10 },
      { x: 60, y: 10 },
      { x: 60, y: 50 }
    ],
    segments: [
      { type: "line", control: null },
      { type: "line", control: null },
      { type: "curve", control: { x: 30, y: 30 } }
    ]
  };
  let ranges = setCharacterFrameAttackRange([], 2, range);
  assert.deepEqual(
    ranges.map((entry) => entry.frame),
    [2]
  );
  assert.deepEqual(ranges[0].points, range.points);

  const other = structuredClone(range);
  other.points[0].x = 40;
  ranges = setCharacterFrameAttackRange(ranges, 4, other);
  assert.deepEqual(
    ranges.map((entry) => entry.frame),
    [2, 4]
  );

  ranges = setCharacterFrameAttackRange(ranges, 2, null);
  assert.deepEqual(
    ranges.map((entry) => entry.frame),
    [4]
  );
});

test("帧设置按当前帧读取和保存攻击范围", () => {
  assert.match(editorSource, /attackRanges/);
  assert.match(
    editorSource,
    /range\.frame === binding\.attackFrame/
  );
  assert.match(
    editorSource,
    /binding\.attackRanges = setCharacterFrameAttackRange/
  );
  assert.match(html, /攻击范围只对当前帧生效/);
});

test("动画卡片提供备注栏", () => {
  assert.match(editorSource, /动画备注/);
  assert.match(editorSource, /data-character-field="note"/);
  assert.match(editorSource, /binding\.note = event\.target\.value/);
  const triggersIndex = editorSource.indexOf(
    'class="character-triggers"'
  );
  const noteIndex = editorSource.indexOf(
    "character-animation-note"
  );
  assert.ok(triggersIndex > 0);
  assert.ok(noteIndex > triggersIndex);
});
