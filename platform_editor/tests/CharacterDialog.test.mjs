import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const styles = readFileSync(
  new URL("../styles.css", import.meta.url),
  "utf8"
);

test("帧设置弹窗只在 open 状态使用 grid，关闭后不会继续占位", () => {
  assert.match(
    styles,
    /\.character-range-dialog\[open\]\s*\{[^}]*display:\s*grid/
  );
  assert.doesNotMatch(
    styles,
    /\.character-range-dialog\s*\{[^}]*display:\s*grid/
  );
});

test("物品插图选择窗口像素材库一样完整展示图片", () => {
  assert.match(
    styles,
    /\.background-choice-preview img\s*\{[^}]*position:\s*absolute[^}]*object-fit:\s*cover/
  );
  assert.match(
    styles,
    /\.item-illustration-dialog \.background-choice\s*\{[^}]*grid-template-rows:\s*200px/
  );
  assert.match(
    styles,
    /\.item-illustration-dialog \.background-choice-preview img\s*\{[^}]*object-fit:\s*contain/
  );
});
