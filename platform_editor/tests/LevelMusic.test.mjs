import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync(
  new URL("../index.html", import.meta.url),
  "utf8"
);
const inspectorSource = readFileSync(
  new URL("../src/editor/Inspector.js", import.meta.url),
  "utf8"
);
const appSource = readFileSync(
  new URL("../src/editor/EditorApp.js", import.meta.url),
  "utf8"
);
const styles = readFileSync(
  new URL("../styles.css", import.meta.url),
  "utf8"
);

test("关卡设置提供背景音乐导入和移除入口", () => {
  assert.match(
    inspectorSource,
    /data-action="import-background-music"/
  );
  assert.match(
    inspectorSource,
    /data-action="clear-background-music"/
  );
  assert.match(inspectorSource, /关卡音乐/);
  assert.match(inspectorSource, /backgroundMusic/);
  assert.match(inspectorSource, /进入关卡后循环播放/);
  assert.match(styles, /\.level-music-glyph/);
});

test("关卡音乐导入后提供音量、循环和试听", () => {
  assert.match(
    inspectorSource,
    /data-level-music-volume/
  );
  assert.match(
    inspectorSource,
    /data-level-music-loop/
  );
  assert.match(inspectorSource, /关卡音乐默认循环/);
  assert.match(
    inspectorSource,
    /data-action="preview-background-music"/
  );
  assert.match(styles, /\.level-music-volume/);
  assert.match(styles, /\.level-music-loop/);
  assert.match(appSource, /toggleBackgroundMusicPreview/);
});

test("关卡音乐窗口只浏览环境音并保留文件夹", () => {
  assert.match(html, /id="level-music-dialog"/);
  assert.match(html, /素材库 \/ 音效 \/ 环境音/);
  assert.match(html, /id="level-music-categories"/);
  assert.match(html, /id="level-music-breadcrumb"/);
  assert.match(html, /id="level-music-grid"/);
  assert.match(html, /文件夹/);
  assert.match(appSource, /id: "ambient"/);
  assert.match(appSource, /\/api\/audio\/import/);
  assert.match(appSource, /folderPath: asset\.folderPath/);
});

test("关卡音乐复用音频卡片的三角试听按钮", () => {
  assert.match(appSource, /renderAudioAssetPreview/);
  assert.match(appSource, /levelMusicPicker/);
  assert.match(appSource, /importBackgroundMusic/);
});
