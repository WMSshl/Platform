import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync(
  new URL("../index.html", import.meta.url),
  "utf8"
);
const styles = readFileSync(
  new URL("../styles.css", import.meta.url),
  "utf8"
);
const script = readFileSync(
  new URL("../src/editor/AssetLibrary.js", import.meta.url),
  "utf8"
);
const server = readFileSync(
  new URL("../tools/dev-server.mjs", import.meta.url),
  "utf8"
);

test("音频卡片使用三角播放键，查看器使用自定义播放器", () => {
  assert.match(
    script,
    /class="asset-audio-play"[\s\S]*?asset-audio-play-glyph/
  );
  assert.match(
    html,
    /id="asset-audio-seek"[\s\S]*?type="range"/
  );
  assert.match(
    html,
    /id="asset-audio-play"[\s\S]*?asset-audio-play-glyph-large/
  );
  assert.doesNotMatch(
    html,
    /id="asset-viewer-audio"[\s\S]{0,200}?controls/
  );
});

test("音频播放条可拖动，播放键位于进度条下方", () => {
  assert.match(styles, /\.asset-audio-player\s*\{/);
  assert.match(styles, /\.asset-audio-seek[^{]*\{/);
  assert.match(styles, /\.asset-audio-play-large\s*\{/);
  assert.match(styles, /\.asset-audio-seek::-webkit-slider-thumb/);
});

test("从卡片试听打开查看器时续播原进度", () => {
  assert.match(script, /resumePreviewAudio/);
  assert.match(script, /audioResume/);
  assert.match(script, /applyAudioResume/);
});

test("静态资源支持 Range，音频进度才能定位", () => {
  assert.match(server, /parseByteRange/);
  assert.match(server, /Accept-Ranges/);
  assert.match(server, /Content-Range/);
});
