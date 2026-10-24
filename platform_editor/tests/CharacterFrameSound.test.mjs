import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createCharacterFrameSound } from "../src/editor/CharacterContentEditor.js";
import { hasReachedAnimationFrame } from "../src/editor/SpriteSheetAnimator.js";

const html = readFileSync(
  new URL("../index.html", import.meta.url),
  "utf8"
);
const styles = readFileSync(
  new URL("../styles.css", import.meta.url),
  "utf8"
);
const editorSource = readFileSync(
  new URL(
    "../src/editor/CharacterContentEditor.js",
    import.meta.url
  ),
  "utf8"
);
const browserSource = readFileSync(
  new URL("../src/editor/AssetBrowser.js", import.meta.url),
  "utf8"
);

test("攻击范围入口改为帧设置并同时展示范围与音效摘要", () => {
  assert.match(html, /id="character-frame-sound-panel"/);
  assert.match(html, /帧音效/);
  assert.match(html, /保存帧设置/);
  assert.match(editorSource, /默认不循环/);
  assert.match(
    html,
    /id="character-frame-sound-dialog"/
  );
  assert.match(
    html,
    /id="character-frame-sound-categories"/
  );
  assert.match(
    html,
    /id="character-frame-sound-breadcrumb"/
  );
});

test("帧音效导入沿用素材库文件夹浏览器并保存路径", () => {
  const sound = createCharacterFrameSound({
    id: "sfx:hit.wav",
    fileName: "hit.wav",
    displayName: "命中",
    relativePath: "audio/sfx/hit.wav",
    url: "/assets/audio/sfx/hit.wav",
    folderId: "sfx-folder-0001",
    folderPath: "战斗 / 命中"
  });

  assert.deepEqual(sound, {
    assetId: "sfx:hit.wav",
    fileName: "hit.wav",
    displayName: "命中",
    relativePath: "audio/sfx/hit.wav",
    url: "/assets/audio/sfx/hit.wav",
    folderId: "sfx-folder-0001",
    folderPath: "战斗 / 命中",
    volume: 1,
    loop: false
  });
});

test("更换帧音效保留音量和循环开关", () => {
  const sound = createCharacterFrameSound(
    {
      id: "sfx:step.ogg",
      fileName: "step.ogg",
      relativePath: "audio/sfx/step.ogg",
      url: "/assets/audio/sfx/step.ogg",
      folderPath: ""
    },
    {
      volume: 0.35,
      loop: true
    }
  );

  assert.equal(sound.volume, 0.35);
  assert.equal(sound.loop, true);
  assert.equal(sound.folderPath, "");
});

test("帧音效面板提供音量滑杆、循环开关和试听", () => {
  assert.match(
    styles,
    /\.character-frame-sound-volume input\[type="range"\]/
  );
  assert.match(styles, /\.character-frame-sound-loop/);
  assert.match(styles, /\.background-choice-audio-glyph/);
  assert.match(html, /动画播放到这一帧时触发/);
  assert.match(html, /文件夹与路径随动画帧设置保存/);
});

test("动画预览经过攻击帧时会触发帧音效", () => {
  assert.equal(
    hasReachedAnimationFrame(0, 1, 8, 1, 1),
    true
  );
  assert.equal(
    hasReachedAnimationFrame(2, 3, 8, 1, 1),
    false
  );
  assert.equal(
    hasReachedAnimationFrame(7, 0, 8, 0, 1),
    true
  );
  assert.equal(
    hasReachedAnimationFrame(3, 7, 8, 6, 4),
    true
  );
  assert.equal(
    hasReachedAnimationFrame(0, 0, 8, 3, 8),
    true
  );
  assert.equal(
    hasReachedAnimationFrame(0, 1, 8, 9, 1),
    false
  );
  assert.match(editorSource, /onFrameChange:/);
  assert.match(editorSource, /handleAnimationFrameChange/);
  assert.match(editorSource, /playAnimationFrameSound/);
  assert.match(editorSource, /stopAllAnimationFrameSounds/);
});

test("短音效导入窗口在文件卡片上半部分提供试听三角按钮", () => {
  assert.match(
    browserSource,
    /data-asset-browser-audio-play/
  );
  assert.match(browserSource, /toggleAudioPreview/);
  assert.match(browserSource, /stopAudioPreview/);
  assert.match(
    styles,
    /\.background-choice-audio-play\s*\{[^}]*position:\s*absolute[^}]*top:\s*66px/
  );
  assert.match(
    styles,
    /\.background-choice-audio-play\.is-playing/
  );
});
