import assert from "node:assert/strict";
import test from "node:test";
import {
  CharacterContentEditor,
  groupCharacterTriggers
} from "../src/editor/CharacterContentEditor.js";

test("触发键按左右方向分组并保留原数组下标", () => {
  const grouped = groupCharacterTriggers([
    {
      device: "keyboard",
      code: "KeyD",
      label: "D",
      direction: "right"
    },
    {
      device: "keyboard",
      code: "KeyA",
      label: "A",
      direction: "left"
    },
    {
      device: "mouse",
      code: "Mouse2",
      label: "鼠标右键",
      direction: "left"
    }
  ]);

  assert.deepEqual(
    grouped.right.map(({ trigger }) => trigger.label),
    ["D"]
  );
  assert.deepEqual(
    grouped.left.map(({ trigger }) => trigger.label),
    ["A", "鼠标右键"]
  );
  assert.deepEqual(
    grouped.left.map(({ index }) => index),
    [1, 2]
  );
});

test("旧触发键缺少方向时跟随动画预览方向分组", () => {
  const grouped = groupCharacterTriggers(
    [
      {
        device: "keyboard",
        code: "KeyJ",
        label: "J"
      }
    ],
    "left"
  );

  assert.equal(grouped.left.length, 1);
  assert.equal(grouped.right.length, 0);
  assert.equal(grouped.left[0].index, 0);
});

test("空触发键返回两个空分组", () => {
  const grouped = groupCharacterTriggers();

  assert.deepEqual(grouped.right, []);
  assert.deepEqual(grouped.left, []);
});

test("每个方向分组有独立加号和正确的删除下标", () => {
  const editor = Object.create(
    CharacterContentEditor.prototype
  );
  const html = editor.renderTriggerGroup(
    { id: "04-0001-animation-0001" },
    "left",
    [
      {
        trigger: {
          device: "keyboard",
          code: "KeyA",
          label: "A",
          direction: "left"
        },
        index: 3
      }
    ]
  );

  assert.match(html, /向左镜像/);
  assert.match(html, /data-trigger-direction="left"/);
  assert.match(html, /data-trigger-index="3"/);
  assert.match(html, /删除向左镜像触发键 A/);
});
