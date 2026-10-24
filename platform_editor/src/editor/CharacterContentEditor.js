import {
  CHARACTER_ANIMATION_TYPES,
  CHARACTER_ATTRIBUTE_DEFINITIONS,
  CHARACTER_TRIGGER_DIRECTIONS,
  createDefaultCharacterCollisionBody,
  getCharacterAnimationTypeDefinition,
  getContentEntry
} from "../model/ContentModel.js";
import {
  getOpaqueContentBounds,
  loadAssetImage
} from "./AssetThumbnail.js";
import {
  AssetBrowser,
  AssetPickerDialog,
  renderAudioAssetPreview
} from "./AssetBrowser.js";
import {
  SpriteSheetAnimator,
  hasReachedAnimationFrame
} from "./SpriteSheetAnimator.js";

const MIN_ATTACK_RANGE_POINTS = 3;
const MAX_ATTACK_RANGE_POINTS = 12;
const RANGE_HANDLE_RADIUS = 7;
const RANGE_CONTROL_RADIUS = 6;
const COLLISION_HANDLE_RADIUS = 9;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function formatKeyLabel(event) {
  const labels = {
    Space: "空格",
    ShiftLeft: "左 Shift",
    ShiftRight: "右 Shift",
    ControlLeft: "左 Ctrl",
    ControlRight: "右 Ctrl",
    AltLeft: "左 Alt",
    AltRight: "右 Alt",
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    Escape: "Esc",
    Enter: "Enter",
    Tab: "Tab",
    Backspace: "Backspace"
  };
  if (labels[event.code]) {
    return labels[event.code];
  }
  if (event.code.startsWith("Key")) {
    return event.code.slice(3);
  }
  if (event.code.startsWith("Digit")) {
    return event.code.slice(5);
  }
  return event.key || event.code;
}

function getTriggerDirectionLabel(direction) {
  return (
    CHARACTER_TRIGGER_DIRECTIONS.find(
      (item) => item.value === direction
    )?.label ?? "向右"
  );
}

function formatMouseLabel(button) {
  return (
    {
      0: "鼠标左键",
      1: "鼠标中键",
      2: "鼠标右键",
      3: "鼠标侧键 1",
      4: "鼠标侧键 2"
    }[button] ?? `鼠标按钮 ${button}`
  );
}

function formatAssetSize(value) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getFrameSoundFormat(sound) {
  const fileName = String(sound?.fileName ?? "");
  const dot = fileName.lastIndexOf(".");
  return dot >= 0 && dot < fileName.length - 1
    ? fileName.slice(dot + 1).toUpperCase()
    : "音频";
}

export function createCharacterFrameSound(
  asset,
  previous = null
) {
  return {
    assetId: String(
      asset?.id ?? asset?.assetId ?? asset?.fileName ?? ""
    ),
    fileName: String(asset?.fileName ?? ""),
    displayName: String(
      asset?.displayName ?? asset?.fileName ?? ""
    ),
    relativePath: String(asset?.relativePath ?? ""),
    url: String(asset?.url ?? ""),
    folderId:
      typeof asset?.folderId === "string"
        ? asset.folderId
        : null,
    folderPath:
      typeof asset?.folderPath === "string"
        ? asset.folderPath
        : "",
    volume:
      Number.isFinite(previous?.volume) &&
      previous.volume >= 0 &&
      previous.volume <= 1
        ? previous.volume
        : 1,
    loop: previous?.loop === true
  };
}

function createDefaultAttackRange(frameWidth, frameHeight) {
  const left = frameWidth * 0.56;
  const top = frameHeight * 0.28;
  const right = frameWidth * 0.94;
  const bottom = frameHeight * 0.68;
  return {
    points: [
      { x: left, y: top },
      { x: right, y: top },
      { x: right, y: bottom },
      { x: left, y: bottom }
    ],
    segments: Array.from({ length: 4 }, () => ({
      type: "line",
      control: null
    }))
  };
}

function resizeAttackRangePoints(range, pointCount) {
  const count = Math.min(
    MAX_ATTACK_RANGE_POINTS,
    Math.max(MIN_ATTACK_RANGE_POINTS, Math.round(pointCount))
  );
  const source = range?.points ?? [];
  if (source.length === count) {
    return range;
  }
  const xs = source.map((point) => point.x);
  const ys = source.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const radiusX = Math.max(1, (maxX - minX) / 2);
  const radiusY = Math.max(1, (maxY - minY) / 2);
  const points = Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / count;
    return {
      x: centerX + Math.cos(angle) * radiusX,
      y: centerY + Math.sin(angle) * radiusY
    };
  });
  const segments = Array.from({ length: count }, (_, index) => {
    const previous = range?.segments?.[index];
    if (previous?.type === "curve") {
      return {
        type: "curve",
        control: {
          x: previous.control?.x ?? (points[index].x + points[(index + 1) % count].x) / 2,
          y: previous.control?.y ?? (points[index].y + points[(index + 1) % count].y) / 2
        }
      };
    }
    return { type: "line", control: null };
  });
  return { points, segments };
}

function createCurveControl(start, end) {
  const midpointX = (start.x + end.x) / 2;
  const midpointY = (start.y + end.y) / 2;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  const offset = Math.min(40, length * 0.18);
  return {
    x: midpointX - (dy / length) * offset,
    y: midpointY + (dx / length) * offset
  };
}

function distanceToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }
  const t = Math.min(
    1,
    Math.max(
      0,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) /
        lengthSquared
    )
  );
  return Math.hypot(
    point.x - (start.x + t * dx),
    point.y - (start.y + t * dy)
  );
}

function clampUnit(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundUnit(value) {
  return Math.round(value * 10000) / 10000;
}

export function resizeCharacterCollisionBody(
  start,
  drag,
  deltaX,
  deltaY
) {
  const minSize = 0.02;
  if (drag.kind === "move") {
    return {
      x: roundUnit(
        clampUnit(start.x + deltaX, 0, 1 - start.width)
      ),
      y: roundUnit(
        clampUnit(start.y + deltaY, 0, 1 - start.height)
      ),
      width: start.width,
      height: start.height
    };
  }
  const edges = drag.edges ?? {};
  let left = start.x;
  let right = start.x + start.width;
  let top = start.y;
  let bottom = start.y + start.height;
  if (edges.left) {
    left = clampUnit(start.x + deltaX, 0, right - minSize);
  }
  if (edges.right) {
    right = clampUnit(
      start.x + start.width + deltaX,
      left + minSize,
      1
    );
  }
  if (edges.top) {
    top = clampUnit(start.y + deltaY, 0, bottom - minSize);
  }
  if (edges.bottom) {
    bottom = clampUnit(
      start.y + start.height + deltaY,
      top + minSize,
      1
    );
  }
  return {
    x: roundUnit(left),
    y: roundUnit(top),
    width: roundUnit(right - left),
    height: roundUnit(bottom - top)
  };
}

export function setCharacterFrameAttackRange(
  ranges,
  frame,
  range
) {
  const targetFrame = Math.round(Number(frame));
  const next = (Array.isArray(ranges) ? ranges : []).filter(
    (candidate) => Number(candidate?.frame) !== targetFrame
  );
  if (
    Number.isInteger(targetFrame) &&
    targetFrame >= 1 &&
    range?.points?.length >= 3
  ) {
    next.push({
      frame: targetFrame,
      points: structuredClone(range.points),
      segments: structuredClone(range.segments ?? [])
    });
  }
  return next.sort((left, right) => left.frame - right.frame);
}

function drawDiamond(context, x, y, radius, stroke, fill) {
  context.save();
  context.beginPath();
  context.moveTo(x, y - radius);
  context.lineTo(x + radius, y);
  context.lineTo(x, y + radius);
  context.lineTo(x - radius, y);
  context.closePath();
  context.fillStyle = fill;
  context.fill();
  context.strokeStyle = stroke;
  context.lineWidth = 2;
  context.stroke();
  context.restore();
}

export function groupCharacterTriggers(
  triggers = [],
  fallbackDirection = "right"
) {
  const fallback =
    fallbackDirection === "left" ? "left" : "right";
  const entries = (Array.isArray(triggers) ? triggers : []).map(
    (trigger, index) => ({ trigger, index })
  );
  return {
    right: entries.filter(
      ({ trigger }) =>
        (trigger?.direction ?? fallback) === "right"
    ),
    left: entries.filter(
      ({ trigger }) =>
        (trigger?.direction ?? fallback) === "left"
    )
  };
}

export function getAvailableCharacterAnimationTypes(bindings = []) {
  const usedTypes = new Set(
    bindings.map((binding) => binding?.type)
  );
  return CHARACTER_ANIMATION_TYPES.filter(
    (definition) =>
      definition.repeatable || !usedTypes.has(definition.key)
  );
}

export class CharacterContentEditor {
  constructor(
    store,
    {
      root,
      onStatus = () => {},
      onNotify = () => {}
    } = {}
  ) {
    this.store = store;
    this.root = root;
    this.onStatus = onStatus;
    this.onNotify = onNotify;
    this.selectedEntry = null;
    this.attributeCollapsed = false;
    this.expandedAnimationIds = new Set();
    this.playingAnimationIds = new Set();
    this.animators = new Map();
    this.pickerAnimators = [];
    this.selectedAnimationAsset = null;
    this.attackRangeAnimationId = null;
    this.attackRangeImage = null;
    this.attackRangeImageUrl = "";
    this.frameSoundDraft = null;
    this.frameSoundPreviewAudio = null;
    this.animationFrameAudios = new Map();
    this.animationFrameSoundSuspended = false;
    this.collisionDraft = null;
    this.collisionDrag = null;
    this.frameEditMode = "range";
    this.rangeDraft = null;
    this.rangeSelectedSegment = 0;
    this.rangeView = {
      scale: 1,
      fitScale: 1,
      offsetX: 0,
      offsetY: 0
    };
    this.rangeDrag = null;
    this.rangePointer = null;
    this.keyCaptureAnimationId = null;
    this.triggerDirection = "right";
    this.inputLock = false;
    this.els = {
      animationDialog: document.getElementById(
        "character-animation-dialog"
      ),
      animationType: document.getElementById(
        "character-animation-type"
      ),
      animationAssets: document.getElementById(
        "character-animation-assets"
      ),
      animationBreadcrumb: document.getElementById(
        "character-animation-breadcrumb"
      ),
      animationSummary: document.getElementById(
        "character-animation-summary"
      ),
      animationEmpty: document.getElementById(
        "character-animation-empty"
      ),
      animationEmptyTitle: document.getElementById(
        "character-animation-empty-title"
      ),
      animationEmptyDescription: document.getElementById(
        "character-animation-empty-description"
      ),
      animationStatus: document.getElementById(
        "character-animation-status"
      ),
      confirmAnimation: document.getElementById(
        "confirm-character-animation"
      ),
      closeAnimation: document.getElementById(
        "close-character-animation"
      ),
      cancelAnimation: document.getElementById(
        "cancel-character-animation"
      ),
      rangeDialog: document.getElementById(
        "character-attack-range-dialog"
      ),
      rangeForm: document.getElementById(
        "character-attack-range-form"
      ),
      rangeCanvas: document.getElementById(
        "character-attack-range-canvas"
      ),
      rangeFrame: document.getElementById(
        "character-attack-range-frame"
      ),
      rangePointCount: document.getElementById(
        "character-range-point-count"
      ),
      rangeSegmentList: document.getElementById(
        "character-range-segment-list"
      ),
      rangeControls: document.getElementById(
        "character-frame-range-controls"
      ),
      collisionControls: document.getElementById(
        "character-frame-collision-controls"
      ),
      collisionStats: document.getElementById(
        "character-collision-stats"
      ),
      frameSoundPanel: document.getElementById(
        "character-frame-sound-panel"
      ),
      frameSoundDialog: document.getElementById(
        "character-frame-sound-dialog"
      ),
      frameSoundCategories: document.getElementById(
        "character-frame-sound-categories"
      ),
      frameSoundBreadcrumb: document.getElementById(
        "character-frame-sound-breadcrumb"
      ),
      frameSoundSummary: document.getElementById(
        "character-frame-sound-summary"
      ),
      frameSoundGrid: document.getElementById(
        "character-frame-sound-grid"
      ),
      frameSoundEmpty: document.getElementById(
        "character-frame-sound-empty"
      ),
      frameSoundEmptyTitle: document.getElementById(
        "character-frame-sound-empty-title"
      ),
      frameSoundEmptyDescription: document.getElementById(
        "character-frame-sound-empty-description"
      ),
      frameSoundStatus: document.getElementById(
        "character-frame-sound-status"
      ),
      closeFrameSound: document.getElementById(
        "close-character-frame-sound"
      ),
      refreshFrameSound: document.getElementById(
        "refresh-character-frame-sound"
      ),
      rangeZoomValue: document.getElementById(
        "character-range-zoom-value"
      ),
      rangeZoomIn: document.getElementById(
        "character-range-zoom-in"
      ),
      rangeZoomOut: document.getElementById(
        "character-range-zoom-out"
      ),
      rangeZoomFit: document.getElementById(
        "character-range-zoom-fit"
      ),
      clearRange: document.getElementById(
        "clear-character-attack-range"
      ),
      cancelRange: document.getElementById(
        "cancel-character-attack-range"
      ),
      closeRange: document.getElementById(
        "close-character-attack-range"
      ),
      keyDialog: document.getElementById(
        "character-trigger-dialog"
      ),
      keyDialogEyebrow: document.getElementById(
        "character-trigger-eyebrow"
      ),
      keyDialogTitle: document.getElementById(
        "character-trigger-title"
      ),
      keyNote: document.getElementById("character-trigger-note"),
      keyCapture: document.getElementById(
        "character-trigger-capture"
      ),
      cancelKey: document.getElementById(
        "cancel-character-trigger"
      ),
      closeKey: document.getElementById(
        "close-character-trigger"
      )
    };
    this.animationBrowser = new AssetBrowser({
      breadcrumb: this.els.animationBreadcrumb,
      summary: this.els.animationSummary,
      grid: this.els.animationAssets,
      empty: this.els.animationEmpty,
      emptyTitle: this.els.animationEmptyTitle,
      emptyDescription:
        this.els.animationEmptyDescription,
      status: this.els.animationStatus,
      categories: [
        {
          id: "entity",
          label: "动画",
          actionLabel: "选择此动画",
          emptyDescription:
            "请先在素材库的“动画”分类中上传精灵表。"
        }
      ],
      prepareAsset: (asset) =>
        this.prepareAnimationAsset(asset),
      renderPreview: (asset, index) => `
        <canvas data-character-asset-preview="${index}"></canvas>
      `,
      getAssetLabel: (asset) =>
        asset.displayName || asset.fileName,
      getAssetMeta: (asset) =>
        `${asset.frameCount} 帧 · ${
          asset.frameRate || 8
        } FPS`,
      getAssetAction: () => "选择此动画",
      onChoose: (asset) =>
        this.selectAnimationAsset(asset),
      onAfterRender: (assets) =>
        this.startAnimationAssetPreviews(assets)
    });
    this.frameSoundPicker = new AssetPickerDialog({
      dialog: this.els.frameSoundDialog,
      closeButton: this.els.closeFrameSound,
      refreshButton: this.els.refreshFrameSound,
      status: this.els.frameSoundStatus,
      categories: [
        {
          id: "sfx",
          label: "短音效",
          actionLabel: "使用此音效",
          emptyDescription:
            "请先在素材库的“音效 / 短音效”中上传音频。"
        }
      ],
      browser: {
        categoryList: this.els.frameSoundCategories,
        breadcrumb: this.els.frameSoundBreadcrumb,
        summary: this.els.frameSoundSummary,
        grid: this.els.frameSoundGrid,
        empty: this.els.frameSoundEmpty,
        emptyTitle: this.els.frameSoundEmptyTitle,
        emptyDescription:
          this.els.frameSoundEmptyDescription,
        renderPreview: (asset) =>
          renderAudioAssetPreview(asset),
        getAssetMeta: (asset) =>
          `${asset.audioFormat || "音频"} · ${formatAssetSize(
            asset.size
          )}`
      }
    });
    this.bindEvents();
  }

  bindEvents() {
    this.root.addEventListener("click", (event) =>
      this.handleClick(event)
    );
    this.root.addEventListener("input", (event) =>
      this.handleInput(event)
    );
    this.root.addEventListener("change", (event) =>
      this.handleChange(event)
    );

    this.els.closeAnimation.addEventListener("click", () =>
      this.closeAnimationPicker()
    );
    this.els.cancelAnimation.addEventListener("click", () =>
      this.closeAnimationPicker()
    );
    this.els.confirmAnimation.addEventListener("click", () =>
      this.confirmAnimationSelection()
    );
    this.els.animationType.addEventListener("change", () => {
      this.refreshAnimationConfirmState();
    });
    this.els.animationDialog.addEventListener("close", () =>
      this.disposeAnimationPickerResources()
    );
    this.els.closeRange.addEventListener("click", () =>
      this.closeAttackRangeDialog()
    );
    this.els.cancelRange.addEventListener("click", () =>
      this.closeAttackRangeDialog()
    );
    this.els.clearRange.addEventListener("click", () =>
      this.clearAttackRange()
    );
    this.els.rangeForm.addEventListener("submit", (event) => {
      event.preventDefault();
      this.saveAttackRange();
    });
    this.els.rangeDialog.addEventListener("click", (event) =>
      this.handleFrameSoundAction(event)
    );
    this.els.rangeDialog.addEventListener("input", (event) =>
      this.handleFrameSoundInput(event)
    );
    this.els.rangeDialog.addEventListener("change", (event) =>
      this.handleFrameSoundChange(event)
    );
    this.els.rangePointCount.addEventListener("change", () =>
      this.setRangePointCount(this.els.rangePointCount.value)
    );
    this.els.rangeSegmentList.addEventListener("click", (event) =>
      this.handleRangeSegmentAction(event)
    );
    this.els.rangeCanvas.addEventListener(
      "pointerdown",
      (event) => this.handleRangePointerDown(event)
    );
    this.els.rangeCanvas.addEventListener(
      "pointermove",
      (event) => this.handleRangePointerMove(event)
    );
    this.els.rangeCanvas.addEventListener("pointerup", (event) =>
      this.handleRangePointerUp(event)
    );
    this.els.rangeCanvas.addEventListener("pointercancel", () =>
      this.endRangeDrag()
    );
    this.els.rangeCanvas.addEventListener(
      "wheel",
      (event) => this.handleRangeWheel(event),
      { passive: false }
    );
    this.els.rangeZoomIn.addEventListener("click", () =>
      this.zoomRangeView(1.2)
    );
    this.els.rangeZoomOut.addEventListener("click", () =>
      this.zoomRangeView(1 / 1.2)
    );
    this.els.rangeZoomFit.addEventListener("click", () =>
      this.fitRangeView()
    );
    this.els.rangeDialog.addEventListener("close", () => {
      this.animationFrameSoundSuspended = false;
      this.stopFrameSoundPreview();
      this.frameSoundDraft = null;
      this.frameSoundPicker.close();
      this.resetRangeEditor();
    });

    this.els.cancelKey.addEventListener("click", () =>
      this.closeTriggerDialog()
    );
    this.els.closeKey.addEventListener("click", () =>
      this.closeTriggerDialog()
    );
    this.els.keyCapture.addEventListener("keydown", (event) =>
      this.captureKeyboardTrigger(event)
    );
    this.els.keyCapture.addEventListener("mousedown", (event) =>
      this.captureMouseTrigger(event)
    );
  }

  render(entry = this.selectedEntry) {
    if (!entry || this.inputLock) {
      return;
    }
    this.selectedEntry = entry;
    this.stopAllAnimators();
    const bindings = entry.animationBindings ?? [];
    const bindingIds = new Set(bindings.map((binding) => binding.id));
    for (const id of this.expandedAnimationIds) {
      if (!bindingIds.has(id)) {
        this.expandedAnimationIds.delete(id);
        this.playingAnimationIds.delete(id);
      }
    }
    this.root.innerHTML = `
      <div class="character-editor-stack">
        ${this.renderAttributes(entry)}
        ${this.renderAnimations(entry)}
      </div>
    `;
    this.setupAnimationPreviews(entry);
  }

  renderAttributes(entry) {
    const attributes = entry.attributes ?? {};
    const expanded = !this.attributeCollapsed;
    return `
      <section class="character-panel">
        <button
          class="character-panel-heading"
          type="button"
          data-character-action="toggle-attributes"
          aria-expanded="${expanded}"
        >
          <span class="character-panel-arrow" aria-hidden="true">
            ${expanded ? "▾" : "▸"}
          </span>
          <span class="character-panel-copy">
            <strong>属性</strong>
            <small>${CHARACTER_ATTRIBUTE_DEFINITIONS.length} 项数值，默认均为 0</small>
          </span>
        </button>
        <div class="character-attributes" ${expanded ? "" : "hidden"}>
          ${CHARACTER_ATTRIBUTE_DEFINITIONS.map(
            (definition) => `
              <label class="character-attribute-field">
                <span>${escapeHtml(definition.label)}</span>
                <input
                  type="number"
                  step="any"
                  value="${escapeHtml(attributes[definition.key] ?? 0)}"
                  data-character-attribute="${escapeHtml(definition.key)}"
                  autocomplete="off"
                />
              </label>
            `
          ).join("")}
        </div>
      </section>
    `;
  }

  renderAnimations(entry) {
    const bindings = entry.animationBindings ?? [];
    return `
      <section class="character-panel character-animation-panel">
        <header class="character-animation-heading">
          <div class="character-panel-copy">
            <strong>角色动画</strong>
            <small>
              ${bindings.length} 个绑定 · 除“其它动画”外每类限一次
            </small>
          </div>
          <button
            class="character-add-button"
            type="button"
            data-character-action="add-animation"
            title="添加动画"
            aria-label="添加动画"
          >
            ＋
          </button>
        </header>
        <div class="character-animation-list">
          ${bindings.length > 0
            ? bindings.map((binding) =>
                this.renderAnimationCard(binding)
              ).join("")
            : `
              <div class="character-animation-empty">
                <strong>还没有角色动画</strong>
                <span>点击右上角加号，从资源库的动画中选择。</span>
              </div>
            `}
        </div>
      </section>
    `;
  }

  renderAnimationCard(binding) {
    const type =
      getCharacterAnimationTypeDefinition(binding.type) ??
      { label: binding.type || "未知动画" };
    const expanded = this.expandedAnimationIds.has(binding.id);
    const playing = this.playingAnimationIds.has(binding.id);
    const triggers = binding.triggers ?? [];
    const groupedTriggers = groupCharacterTriggers(
      triggers,
      binding.direction
    );
    const triggerGroups = ["right", "left"].map((direction) => ({
      direction,
      entries: groupedTriggers[direction]
    }));
    const attackRange = (binding.attackRanges ?? []).find(
      (range) => range.frame === binding.attackFrame
    );
    const rangeLabel = attackRange
      ? `${attackRange.points.length} 个点 · ${
          attackRange.segments.filter(
            (segment) => segment.type === "curve"
          ).length
        } 段曲线`
      : "此帧无攻击范围";
    const soundLabel = binding.frameSound
      ? `音效 ${binding.frameSound.displayName || binding.frameSound.fileName}`
      : "无音效";
    return `
      <article class="character-animation-card ${expanded ? "is-expanded" : ""}">
        <header class="character-animation-card-heading">
          <button
            class="character-animation-toggle"
            type="button"
            data-character-action="toggle-animation"
            data-animation-id="${escapeHtml(binding.id)}"
            aria-expanded="${expanded}"
          >
            <span class="character-panel-arrow" aria-hidden="true">
              ${expanded ? "▾" : "▸"}
            </span>
            <span class="character-animation-title">
              <strong>${escapeHtml(type.label)}</strong>
              <small>${escapeHtml(binding.source?.fileName || "未选择动画")}</small>
            </span>
            <span class="character-animation-badges">
              <span>预览 ${binding.direction === "left" ? "左镜像" : "右向"}</span>
              <span>${triggers.length} 个触发键</span>
            </span>
          </button>
          <button
            class="character-icon-button is-danger"
            type="button"
            data-character-action="delete-animation"
            data-animation-id="${escapeHtml(binding.id)}"
            title="删除动画"
            aria-label="删除${escapeHtml(type.label)}"
          >
            ×
          </button>
        </header>
        <div class="character-animation-body" ${expanded ? "" : "hidden"}>
          <div class="character-animation-preview-column">
            <div class="character-animation-preview">
              <canvas
                data-character-animation-canvas="${escapeHtml(binding.id)}"
                aria-label="${escapeHtml(type.label)}预览"
              ></canvas>
            </div>
            <div class="character-playback-bar">
              <button
                class="button button-quiet"
                type="button"
                data-character-action="toggle-play"
                data-animation-id="${escapeHtml(binding.id)}"
              >
                ${playing ? "暂停" : "播放"}
              </button>
              <span>
                第 ${binding.attackFrame} / ${binding.source?.frameCount ?? 1} 帧
              </span>
            </div>
            <div class="character-direction" role="group" aria-label="动画预览方向">
              <span>预览方向</span>
              <button
                type="button"
                class="${binding.direction === "right" ? "is-active" : ""}"
                data-character-action="direction-right"
                data-animation-id="${escapeHtml(binding.id)}"
              >
                右
              </button>
              <button
                type="button"
                class="${binding.direction === "left" ? "is-active" : ""}"
                data-character-action="direction-left"
                data-animation-id="${escapeHtml(binding.id)}"
              >
                左 · 镜像
              </button>
            </div>
          </div>
          <div class="character-animation-controls">
            <div class="character-animation-source">
              <span>动画资源</span>
              <strong>${escapeHtml(binding.source?.fileName || "未选择")}</strong>
              <small>
                ${binding.source?.frameWidth ?? 1}×${binding.source?.frameHeight ?? 1}
                · ${binding.source?.frameCount ?? 1} 帧
              </small>
            </div>
            <label class="character-control-field character-frame-rate-field">
              <span>
                帧速
                <output data-character-frame-rate-output="${escapeHtml(binding.id)}">
                  ${binding.frameRate} FPS
                </output>
              </span>
              <input
                type="range"
                min="1"
                max="60"
                step="1"
                value="${binding.frameRate}"
                data-character-field="frameRate"
                data-animation-id="${escapeHtml(binding.id)}"
              />
            </label>
            <div class="character-frame-row">
              <span>攻击帧</span>
              <button
                class="character-step-button"
                type="button"
                data-character-action="frame-prev"
                data-animation-id="${escapeHtml(binding.id)}"
                aria-label="上一帧"
              >
                −
              </button>
              <label>
                <span class="sr-only">第几帧</span>
                <input
                  type="number"
                  min="1"
                  max="${binding.source?.frameCount ?? 1}"
                  value="${binding.attackFrame}"
                  data-character-field="attackFrame"
                  data-animation-id="${escapeHtml(binding.id)}"
                />
              </label>
              <button
                class="character-step-button"
                type="button"
                data-character-action="frame-next"
                data-animation-id="${escapeHtml(binding.id)}"
                aria-label="下一帧"
              >
                ＋
              </button>
              <small>/ ${binding.source?.frameCount ?? 1} 帧</small>
            </div>
            <div class="character-frame-settings-row">
              <span>
                帧设置
                <small>
                  第 ${binding.attackFrame} 帧 · ${escapeHtml(rangeLabel)} · ${escapeHtml(soundLabel)}
                </small>
              </span>
              <button
                class="button button-quiet"
                type="button"
                data-character-action="edit-frame"
                data-animation-id="${escapeHtml(binding.id)}"
              >
                设置
              </button>
            </div>
            <div class="character-triggers">
              <header>
                <div>
                  <strong>触发按键</strong>
                  <small>向右、向左镜像分开绑定，可各绑定多个</small>
                </div>
              </header>
              ${triggerGroups
                .map((group) =>
                  this.renderTriggerGroup(
                    binding,
                    group.direction,
                    group.entries
                  )
                )
                .join("")}
            </div>
            <label class="character-control-field character-animation-note">
              <span>动画备注</span>
              <textarea
                rows="2"
                maxlength="500"
                placeholder="记录该动画的用途、触发时机或动作说明"
                data-character-field="note"
                data-animation-id="${escapeHtml(binding.id)}"
              >${escapeHtml(binding.note ?? "")}</textarea>
            </label>
          </div>
        </div>
      </article>
    `;
  }

  renderTriggerGroup(binding, direction, entries) {
    const label = getTriggerDirectionLabel(direction);
    return `
      <section class="character-trigger-group">
        <header class="character-trigger-group-heading">
          <span class="character-trigger-direction is-${escapeHtml(
            direction
          )}">${escapeHtml(label)}</span>
          <small>${entries.length} 个</small>
          <button
            class="character-add-button character-trigger-add"
            type="button"
            data-character-action="add-trigger"
            data-animation-id="${escapeHtml(binding.id)}"
            data-trigger-direction="${escapeHtml(direction)}"
            title="添加${escapeHtml(label)}触发键"
            aria-label="添加${escapeHtml(label)}触发键"
          >
            ＋
          </button>
        </header>
        ${entries.length > 0
          ? `
            <div class="character-trigger-list">
              ${entries
                .map(
                  ({ trigger, index }) => `
                    <span class="character-trigger">
                      <span>${trigger.device === "mouse" ? "鼠标" : "键盘"}</span>
                      <strong>${escapeHtml(trigger.label)}</strong>
                      <button
                        type="button"
                        data-character-action="remove-trigger"
                        data-animation-id="${escapeHtml(binding.id)}"
                        data-trigger-index="${index}"
                        aria-label="删除${escapeHtml(label)}触发键 ${escapeHtml(trigger.label)}"
                      >
                        ×
                      </button>
                    </span>
                  `
                )
                .join("")}
            </div>
          `
          : `<p class="character-inline-empty">尚未绑定${escapeHtml(
              label
            )}触发键。</p>`}
      </section>
    `;
  }

  handleClick(event) {
    const button = event.target.closest("[data-character-action]");
    if (!button) {
      return;
    }
    const action = button.dataset.characterAction;
    const animationId = button.dataset.animationId;
    if (action === "toggle-attributes") {
      this.attributeCollapsed = !this.attributeCollapsed;
      this.render();
      return;
    }
    if (action === "add-animation") {
      this.openAnimationPicker();
      return;
    }
    if (action === "toggle-animation") {
      if (this.expandedAnimationIds.has(animationId)) {
        this.expandedAnimationIds.delete(animationId);
        this.playingAnimationIds.delete(animationId);
        this.animators.get(animationId)?.stop();
        this.stopAnimationFrameSound(animationId);
      } else {
        this.expandedAnimationIds.add(animationId);
      }
      this.render();
      return;
    }
    if (action === "delete-animation") {
      this.deleteAnimation(animationId);
      return;
    }
    if (action === "toggle-play") {
      this.togglePlayback(animationId);
      return;
    }
    if (action === "direction-right" || action === "direction-left") {
      this.updateBinding(animationId, (binding) => {
        binding.direction =
          action === "direction-left" ? "left" : "right";
      });
      this.render();
      this.onStatus(
        action === "direction-left"
          ? "预览方向已设为左侧镜像"
          : "预览方向已设为右侧"
      );
      return;
    }
    if (action === "frame-prev" || action === "frame-next") {
      this.moveAttackFrame(
        animationId,
        action === "frame-prev" ? -1 : 1
      );
      return;
    }
    if (action === "edit-frame" || action === "edit-range") {
      this.openAttackRangeDialog(animationId);
      return;
    }
    if (action === "add-trigger") {
      this.openTriggerDialog(
        animationId,
        button.dataset.triggerDirection === "left"
          ? "left"
          : "right"
      );
      return;
    }
    if (action === "remove-trigger") {
      const index = Number(button.dataset.triggerIndex);
      this.updateBinding(animationId, (binding) => {
        binding.triggers.splice(index, 1);
      });
      this.render();
      this.onStatus("已删除触发按键");
    }
  }

  handleInput(event) {
    const attribute = event.target.dataset.characterAttribute;
    if (attribute) {
      const value =
        event.target.value === ""
          ? 0
          : toNumber(event.target.value);
      this.updateEntry(
        (entry) => {
          entry.attributes[attribute] = value;
        },
        {
          coalesceKey: `character:${this.selectedEntry.id}:attribute:${attribute}`
        }
      );
      return;
    }
    const field = event.target.dataset.characterField;
    if (field === "note") {
      const animationId = event.target.dataset.animationId;
      this.updateBinding(
        animationId,
        (binding) => {
          binding.note = event.target.value;
        },
        {
          coalesceKey: `character:${this.selectedEntry.id}:animation:${animationId}:note`
        }
      );
      return;
    }
    if (field !== "frameRate") {
      return;
    }
    const animationId = event.target.dataset.animationId;
    const frameRate = Math.min(
      60,
      Math.max(1, Math.round(toNumber(event.target.value, 8)))
    );
    this.updateBinding(
      animationId,
      (binding) => {
        binding.frameRate = frameRate;
      },
      {
        coalesceKey: `character:${this.selectedEntry.id}:animation:${animationId}:frameRate`
      }
    );
    this.animators.get(animationId)?.setFrameRate(frameRate);
    const card = event.target.closest(".character-animation-card");
    const output = card?.querySelector(
      "[data-character-frame-rate-output]"
    );
    if (output) {
      output.textContent = `${frameRate} FPS`;
    }
  }

  handleChange(event) {
    const field = event.target.dataset.characterField;
    if (field !== "attackFrame") {
      return;
    }
    const animationId = event.target.dataset.animationId;
    const binding = this.getBinding(animationId);
    if (!binding) {
      return;
    }
    const frameCount = Math.max(
      1,
      Number(binding.source?.frameCount) || 1
    );
    const attackFrame = Math.min(
      frameCount,
      Math.max(1, Math.round(toNumber(event.target.value, 1)))
    );
    event.target.value = String(attackFrame);
    this.updateBinding(animationId, (current) => {
      current.attackFrame = attackFrame;
    });
    const animator = this.animators.get(animationId);
    if (animator) {
      animator.frameIndex = attackFrame - 1;
      animator.draw();
    }
    this.refreshPlaybackFrameLabel(animationId, attackFrame, frameCount);
  }

  updateEntry(mutator, { coalesceKey = null } = {}) {
    const selection = this.store.selection;
    if (selection?.moduleKey !== "characters") {
      return false;
    }
    this.inputLock = true;
    let changed = false;
    try {
      changed = this.store.update(
        (draft) => {
          const entry = getContentEntry(draft, selection.id);
          if (!entry) {
            return;
          }
          entry.attributes ??= {};
          entry.animationBindings ??= [];
          mutator(entry);
        },
        { coalesceKey }
      );
    } finally {
      this.inputLock = false;
    }
    return changed;
  }

  updateBinding(animationId, mutator, options = {}) {
    return this.updateEntry((entry) => {
      const binding = entry.animationBindings.find(
        (candidate) => candidate.id === animationId
      );
      if (binding) {
        mutator(binding);
      }
    }, options);
  }

  getBinding(animationId) {
    const selection = this.store.selection;
    if (selection?.moduleKey !== "characters") {
      return null;
    }
    return (
      getContentEntry(
        this.store.document,
        selection.id
      )?.animationBindings?.find(
        (binding) => binding.id === animationId
      ) ?? null
    );
  }

  deleteAnimation(animationId) {
    const binding = this.getBinding(animationId);
    if (
      !binding ||
      !window.confirm(
        `确定删除动画「${binding.source?.fileName || binding.type}」吗？`
      )
    ) {
      return;
    }
    this.animators.get(animationId)?.stop();
    this.stopAnimationFrameSound(animationId);
    this.animators.delete(animationId);
    this.expandedAnimationIds.delete(animationId);
    this.playingAnimationIds.delete(animationId);
    this.updateEntry((entry) => {
      entry.animationBindings = entry.animationBindings.filter(
        (candidate) => candidate.id !== animationId
      );
    });
    this.render();
    this.onStatus("已删除角色动画");
  }

  moveAttackFrame(animationId, direction) {
    const binding = this.getBinding(animationId);
    if (!binding) {
      return;
    }
    const frameCount = Math.max(
      1,
      Number(binding.source?.frameCount) || 1
    );
    const nextFrame = Math.min(
      frameCount,
      Math.max(1, binding.attackFrame + direction)
    );
    if (nextFrame === binding.attackFrame) {
      return;
    }
    this.updateBinding(animationId, (current) => {
      current.attackFrame = nextFrame;
    });
    this.render();
    this.onStatus(`已选择第 ${nextFrame} 帧`);
  }

  togglePlayback(animationId) {
    const animator = this.animators.get(animationId);
    if (!animator) {
      return;
    }
    const button = this.root.querySelector(
      `[data-character-action="toggle-play"][data-animation-id="${CSS.escape(
        animationId
      )}"]`
    );
    if (this.playingAnimationIds.has(animationId)) {
      this.playingAnimationIds.delete(animationId);
      animator.stop();
      this.stopAnimationFrameSound(animationId);
      if (button) {
        button.textContent = "播放";
      }
    } else {
      this.playingAnimationIds.add(animationId);
      animator.start().catch((error) => {
        console.warn("角色动画播放失败", error);
        this.onNotify("角色动画播放失败", true);
      });
      if (button) {
        button.textContent = "暂停";
      }
    }
  }

  async setupAnimationPreviews(entry) {
    for (const binding of entry.animationBindings ?? []) {
      if (!this.expandedAnimationIds.has(binding.id)) {
        continue;
      }
      const canvas = this.root.querySelector(
        `[data-character-animation-canvas="${CSS.escape(
          binding.id
        )}"]`
      );
      if (!canvas) {
        continue;
      }
      const animator = new SpriteSheetAnimator(canvas, {
        url: binding.source?.url,
        frameWidth: binding.source?.frameWidth,
        frameHeight: binding.source?.frameHeight,
        frameCount: binding.source?.frameCount,
        frameRate: binding.frameRate,
        contentBounds: binding.source?.contentBounds,
        onFrameChange: (frameInfo) =>
          this.handleAnimationFrameChange(binding.id, frameInfo)
      });
      animator.frameIndex = Math.max(0, binding.attackFrame - 1);
      animator.setMirrored(binding.direction === "left");
      this.animators.set(binding.id, animator);
      try {
        await animator.ready;
        if (this.playingAnimationIds.has(binding.id)) {
          await animator.start();
        }
      } catch (error) {
        console.warn("角色动画预览加载失败", error);
        canvas.dataset.previewError = "true";
      }
    }
  }

  handleAnimationFrameChange(animationId, frameInfo) {
    if (this.animationFrameSoundSuspended) {
      return;
    }
    const binding = this.getBinding(animationId);
    if (!binding?.frameSound?.url) {
      return;
    }
    const frameCount = Math.max(
      1,
      Number(frameInfo?.frameCount) ||
        Number(binding.source?.frameCount) ||
        1
    );
    if (
      !hasReachedAnimationFrame(
        frameInfo?.previousFrameIndex,
        frameInfo?.frameIndex,
        frameCount,
        Math.max(0, Math.round(binding.attackFrame) - 1),
        frameInfo?.advance
      )
    ) {
      return;
    }
    this.playAnimationFrameSound(animationId, binding.frameSound);
  }

  playAnimationFrameSound(animationId, sound) {
    if (!sound?.url) {
      return;
    }
    this.stopAnimationFrameSound(animationId);
    const audio = new Audio(sound.url);
    audio.volume = Math.min(
      1,
      Math.max(0, Number(sound.volume) || 0)
    );
    audio.loop = sound.loop === true;
    audio.addEventListener("ended", () => {
      if (this.animationFrameAudios.get(animationId) === audio) {
        this.animationFrameAudios.delete(animationId);
      }
    });
    this.animationFrameAudios.set(animationId, audio);
    audio.play().catch((error) => {
      console.warn("动画帧音效播放失败", error);
      if (this.animationFrameAudios.get(animationId) === audio) {
        this.animationFrameAudios.delete(animationId);
      }
    });
  }

  stopAnimationFrameSound(animationId) {
    const audio = this.animationFrameAudios.get(animationId);
    if (!audio) {
      return;
    }
    audio.pause();
    audio.currentTime = 0;
    this.animationFrameAudios.delete(animationId);
  }

  stopAllAnimationFrameSounds() {
    for (const audio of this.animationFrameAudios.values()) {
      audio.pause();
      audio.currentTime = 0;
    }
    this.animationFrameAudios.clear();
  }

  stopAllAnimators() {
    this.stopAllAnimationFrameSounds();
    for (const animator of this.animators.values()) {
      animator.stop();
    }
    this.animators.clear();
  }

  refreshPlaybackFrameLabel(animationId, attackFrame, frameCount) {
    const button = this.root.querySelector(
      `[data-character-action="toggle-play"][data-animation-id="${CSS.escape(
        animationId
      )}"]`
    );
    const label = button?.parentElement?.querySelector("span");
    if (label) {
      label.textContent = `第 ${attackFrame} / ${frameCount} 帧`;
    }
  }

  openAnimationPicker() {
    const entry = this.selectedEntry;
    if (!entry) {
      return;
    }
    const availableTypes = getAvailableCharacterAnimationTypes(
      entry.animationBindings
    );
    this.els.animationType.innerHTML = availableTypes
      .map(
        (definition) => `
          <option value="${escapeHtml(definition.key)}">
            ${escapeHtml(definition.label)}
          </option>
        `
      )
      .join("");
    this.els.animationStatus.textContent =
      "选择精灵表后设置动画类型；支持按文件夹浏览。";
    this.selectedAnimationAsset = null;
    this.els.animationDialog.showModal();
    this.refreshAnimationConfirmState();
    this.animationBrowser
      .open({ categoryId: "entity" })
      .catch((error) => {
        this.els.animationStatus.textContent =
          `读取动画素材失败：${error.message}`;
      });
  }

  closeAnimationPicker() {
    if (this.els.animationDialog.open) {
      this.els.animationDialog.close();
    }
    this.disposeAnimationPickerResources();
  }

  disposeAnimationPickerResources() {
    this.stopPickerAnimators();
    this.selectedAnimationAsset = null;
  }

  selectAnimationAsset(asset) {
    this.selectedAnimationAsset = asset;
    this.refreshAnimationConfirmState();
  }

  async prepareAnimationAsset(asset) {
    try {
      const image = await loadAssetImage(asset.url);
      const imageWidth =
        asset.imageWidth || image.naturalWidth || 1;
      const imageHeight =
        asset.imageHeight || image.naturalHeight || 1;
      const frameHeight = asset.frameHeight || imageHeight;
      const frameWidth =
        asset.frameWidth ||
        Math.max(1, Math.min(imageWidth, frameHeight));
      const frameCount =
        asset.frameCount ||
        Math.max(1, Math.floor(imageWidth / frameHeight));
      return {
        ...asset,
        preparedImage: image,
        imageWidth,
        imageHeight,
        frameWidth,
        frameHeight,
        frameCount,
        contentBounds: getOpaqueContentBounds(image, {
          frameWidth,
          frameHeight,
          frameCount
        })
      };
    } catch (error) {
      console.warn("角色动画素材预览失败", error);
      return {
        ...asset,
        imageWidth: asset.imageWidth || 1,
        imageHeight: asset.imageHeight || 1,
        frameWidth: asset.frameWidth || 1,
        frameHeight: asset.frameHeight || 1,
        frameCount: asset.frameCount || 1,
        contentBounds: null
      };
    }
  }

  startAnimationAssetPreviews(assets) {
    this.stopPickerAnimators();
    if (!this.els.animationDialog.open) {
      return;
    }
    for (const canvas of this.els.animationAssets.querySelectorAll(
      "[data-character-asset-preview]"
    )) {
      const index = Number(
        canvas.dataset.characterAssetPreview
      );
      const asset = assets[index];
      if (!asset) {
        continue;
      }
      const animator = new SpriteSheetAnimator(canvas, {
        url: asset.url,
        frameWidth: asset.frameWidth,
        frameHeight: asset.frameHeight,
        frameCount: asset.frameCount,
        frameRate: asset.frameRate || 8,
        contentBounds: asset.contentBounds
      });
      this.pickerAnimators.push(animator);
      animator.start().catch((error) => {
        console.warn("角色动画素材预览播放失败", error);
      });
    }
  }

  stopPickerAnimators() {
    for (const animator of this.pickerAnimators) {
      animator.stop();
    }
    this.pickerAnimators = [];
  }

  refreshAnimationConfirmState() {
    this.els.confirmAnimation.disabled =
      !this.selectedAnimationAsset ||
      !this.els.animationType.value;
  }

  confirmAnimationSelection() {
    const entry = this.selectedEntry;
    const asset = this.selectedAnimationAsset;
    const type = this.els.animationType.value;
    if (!entry || !asset || !type) {
      return;
    }
    const definition = getCharacterAnimationTypeDefinition(type);
    if (
      !definition ||
      (!definition.repeatable &&
        entry.animationBindings.some(
          (binding) => binding.type === type
        ))
    ) {
      this.onNotify("该动画类型已经绑定，不能重复选择。", true);
      return;
    }
    const id = this.allocateAnimationId(entry);
    this.updateEntry((draft) => {
      draft.animationBindings.push({
        id,
        type,
        source: {
          assetId: asset.assetId ?? asset.id ?? `entity:${asset.fileName}`,
          fileName: asset.fileName,
          relativePath: asset.relativePath,
          url: asset.url,
          folderId: asset.folderId ?? null,
          folderPath: asset.folderPath ?? "",
          imageWidth: asset.imageWidth,
          imageHeight: asset.imageHeight,
          frameWidth: asset.frameWidth,
          frameHeight: asset.frameHeight,
          frameCount: asset.frameCount,
          contentBounds: asset.contentBounds
        },
        direction: "right",
        frameRate: asset.frameRate || 8,
        attackFrame: 1,
        attackRanges: [],
        frameSound: null,
        note: "",
        triggers: []
      });
    });
    this.expandedAnimationIds.add(id);
    this.closeAnimationPicker();
    this.render();
    this.onStatus(`已绑定${definition.label}：${asset.fileName}`);
  }

  allocateAnimationId(entry) {
    const prefix = `${entry.id}-animation-`;
    const highest = (entry.animationBindings ?? []).reduce(
      (result, binding) => {
        if (!String(binding.id).startsWith(prefix)) {
          return result;
        }
        const suffix = Number(binding.id.slice(prefix.length));
        return Number.isInteger(suffix)
          ? Math.max(result, suffix)
          : result;
      },
      0
    );
    return `${prefix}${String(highest + 1).padStart(4, "0")}`;
  }

  openAttackRangeDialog(animationId) {
    const binding = this.getBinding(animationId);
    if (!binding) {
      return;
    }
    this.attackRangeAnimationId = animationId;
    this.animationFrameSoundSuspended = true;
    this.stopAllAnimationFrameSounds();
    this.stopFrameSoundPreview({ render: false });
    this.frameSoundDraft = binding.frameSound
      ? structuredClone(binding.frameSound)
      : null;
    const frameWidth = binding.source.frameWidth;
    const frameHeight = binding.source.frameHeight;
    const frameAttackRange = (binding.attackRanges ?? []).find(
      (range) => range.frame === binding.attackFrame
    );
    this.rangeDraft =
      frameAttackRange?.points?.length >= 3
        ? structuredClone(frameAttackRange)
        : createDefaultAttackRange(frameWidth, frameHeight);
    this.rangeDraft.segments = this.rangeDraft.points.map(
      (point, index) => {
        const segment = this.rangeDraft.segments?.[index];
        const next =
          this.rangeDraft.points[
            (index + 1) % this.rangeDraft.points.length
          ];
        return {
          type: segment?.type === "curve" ? "curve" : "line",
          control:
            segment?.type === "curve"
              ? {
                  x: toNumber(segment.control?.x, (point.x + next.x) / 2),
                  y: toNumber(segment.control?.y, (point.y + next.y) / 2)
                }
              : null
        };
      }
    );
    this.rangeSelectedSegment = 0;
    this.frameEditMode = "range";
    this.collisionDrag = null;
    this.collisionDraft = structuredClone(
      this.selectedEntry?.collisionBody ??
        createDefaultCharacterCollisionBody()
    );
    this.els.rangePointCount.value = String(
      this.rangeDraft.points.length
    );
    this.els.rangeFrame.textContent =
      `第 ${binding.attackFrame} / ${binding.source.frameCount} 帧`;
    this.renderRangeSegmentList();
    this.renderFrameSoundPanel();
    this.renderCollisionControls();
    this.setFrameEditMode("range");
    this.els.rangeDialog.showModal();
    this.loadAttackRangeImage(binding);
  }

  closeAttackRangeDialog() {
    if (this.els.rangeDialog.open) {
      this.els.rangeDialog.close();
    }
    this.attackRangeAnimationId = null;
    this.resetRangeEditor();
  }

  resetRangeEditor() {
    this.rangeDraft = null;
    this.rangeSelectedSegment = 0;
    this.rangeDrag = null;
    this.rangePointer = null;
    this.collisionDraft = null;
    this.collisionDrag = null;
    this.frameEditMode = "range";
    this.rangeView.scale = 1;
    this.rangeView.fitScale = 1;
    this.rangeView.offsetX = 0;
    this.rangeView.offsetY = 0;
  }

  async loadAttackRangeImage(binding) {
    const url = binding.source?.url;
    if (!url) {
      return;
    }
    if (this.attackRangeImageUrl !== url) {
      try {
        this.attackRangeImage = await loadAssetImage(url);
        this.attackRangeImageUrl = url;
      } catch (error) {
        console.warn("攻击范围帧预览加载失败", error);
        this.attackRangeImage = null;
      }
    }
    if (
      !this.els.rangeDialog.open ||
      this.attackRangeAnimationId !== binding.id
    ) {
      return;
    }
    requestAnimationFrame(() => {
      this.fitRangeView();
    });
  }

  fitRangeView() {
    const binding = this.getBinding(this.attackRangeAnimationId);
    const canvas = this.els.rangeCanvas;
    if (!binding) {
      return;
    }
    const frameWidth = binding.source.frameWidth;
    const frameHeight = binding.source.frameHeight;
    const scale = Math.min(
      (canvas.width - 96) / frameWidth,
      (canvas.height - 96) / frameHeight
    );
    this.rangeView.scale = Math.max(0.05, scale);
    this.rangeView.fitScale = this.rangeView.scale;
    this.rangeView.offsetX =
      (canvas.width - frameWidth * this.rangeView.scale) / 2;
    this.rangeView.offsetY =
      (canvas.height - frameHeight * this.rangeView.scale) / 2;
    this.drawAttackRangeOverlay();
  }

  updateRangeZoomLabel() {
    const percent = Math.round(
      (this.rangeView.scale /
        Math.max(0.0001, this.rangeView.fitScale)) *
        100
    );
    this.els.rangeZoomValue.textContent = `${percent}%`;
  }

  zoomRangeView(factor, anchorX, anchorY) {
    const canvas = this.els.rangeCanvas;
    const currentScale = this.rangeView.scale;
    const minScale = Math.min(
      8,
      Math.max(0.05, this.rangeView.fitScale * 0.35)
    );
    const nextScale = Math.min(
      8,
      Math.max(minScale, currentScale * factor)
    );
    const x = anchorX ?? canvas.width / 2;
    const y = anchorY ?? canvas.height / 2;
    const worldX =
      (x - this.rangeView.offsetX) / currentScale;
    const worldY =
      (y - this.rangeView.offsetY) / currentScale;
    this.rangeView.scale = nextScale;
    this.rangeView.offsetX = x - worldX * nextScale;
    this.rangeView.offsetY = y - worldY * nextScale;
    this.drawAttackRangeOverlay();
  }

  getRangeCanvasPoint(event) {
    const rect = this.els.rangeCanvas.getBoundingClientRect();
    return {
      x:
        ((event.clientX - rect.left) / rect.width) *
        this.els.rangeCanvas.width,
      y:
        ((event.clientY - rect.top) / rect.height) *
        this.els.rangeCanvas.height
    };
  }

  rangeScreenToWorld(x, y, binding = this.getBinding(this.attackRangeAnimationId)) {
    const localX =
      (x - this.rangeView.offsetX) / this.rangeView.scale;
    const localY =
      (y - this.rangeView.offsetY) / this.rangeView.scale;
    return {
      x:
        binding?.direction === "left"
          ? binding.source.frameWidth - localX
          : localX,
      y: localY
    };
  }

  rangeWorldToScreen(point, binding = this.getBinding(this.attackRangeAnimationId)) {
    const localX =
      binding?.direction === "left"
        ? binding.source.frameWidth - point.x
        : point.x;
    return {
      x: this.rangeView.offsetX + localX * this.rangeView.scale,
      y: this.rangeView.offsetY + point.y * this.rangeView.scale
    };
  }

  handleRangeWheel(event) {
    if (!this.rangeDraft || !this.attackRangeImage) {
      return;
    }
    event.preventDefault();
    const point = this.getRangeCanvasPoint(event);
    this.zoomRangeView(
      event.deltaY < 0 ? 1.15 : 1 / 1.15,
      point.x,
      point.y
    );
  }

  handleRangePointerDown(event) {
    if (
      (!this.rangeDraft && !this.collisionDraft) ||
      !this.attackRangeImage
    ) {
      return;
    }
    const point = this.getRangeCanvasPoint(event);
    this.rangePointer = point;
    if (this.frameEditMode === "collision") {
      const collisionHit = this.hitTestCollision(point);
      if (collisionHit) {
        this.startCollisionDrag(collisionHit, point);
        this.els.rangeCanvas.setPointerCapture(event.pointerId);
        this.drawAttackRangeOverlay();
        return;
      }
      this.rangeDrag = {
        kind: "pan",
        startX: point.x,
        startY: point.y,
        offsetX: this.rangeView.offsetX,
        offsetY: this.rangeView.offsetY
      };
      this.els.rangeCanvas.classList.add("is-panning");
      this.els.rangeCanvas.setPointerCapture(event.pointerId);
      this.drawAttackRangeOverlay();
      return;
    }
    const hit = this.hitTestRange(point);
    if (hit?.kind === "control") {
      this.rangeSelectedSegment = hit.segmentIndex;
      this.rangeDrag = {
        kind: "control",
        segmentIndex: hit.segmentIndex
      };
      this.renderRangeSegmentList();
    } else if (hit?.kind === "point") {
      this.rangeSelectedSegment = hit.pointIndex;
      this.rangeDrag = {
        kind: "point",
        pointIndex: hit.pointIndex
      };
      this.renderRangeSegmentList();
    } else if (hit?.kind === "segment") {
      this.rangeSelectedSegment = hit.segmentIndex;
      this.renderRangeSegmentList();
    } else {
      this.rangeDrag = {
        kind: "pan",
        startX: point.x,
        startY: point.y,
        offsetX: this.rangeView.offsetX,
        offsetY: this.rangeView.offsetY
      };
      this.els.rangeCanvas.classList.add("is-panning");
    }
    this.els.rangeCanvas.setPointerCapture(event.pointerId);
    this.drawAttackRangeOverlay();
  }

  handleRangePointerMove(event) {
    if (!this.rangeDraft && !this.collisionDraft) {
      return;
    }
    const point = this.getRangeCanvasPoint(event);
    this.rangePointer = point;
    if (this.collisionDrag) {
      this.updateCollisionDrag(point);
      return;
    }
    if (!this.rangeDrag) {
      this.updateRangeCanvasCursor(point);
      return;
    }
    const binding = this.getBinding(this.attackRangeAnimationId);
    if (!binding) {
      return;
    }
    if (this.rangeDrag.kind === "pan") {
      this.rangeView.offsetX =
        this.rangeDrag.offsetX +
        point.x -
        this.rangeDrag.startX;
      this.rangeView.offsetY =
        this.rangeDrag.offsetY +
        point.y -
        this.rangeDrag.startY;
    } else {
      const world = this.rangeScreenToWorld(
        point.x,
        point.y,
        binding
      );
      const x = Math.min(
        binding.source.frameWidth,
        Math.max(0, world.x)
      );
      const y = Math.min(
        binding.source.frameHeight,
        Math.max(0, world.y)
      );
      if (this.rangeDrag.kind === "point") {
        this.rangeDraft.points[this.rangeDrag.pointIndex] = {
          x,
          y
        };
      } else {
        const segment =
          this.rangeDraft.segments[this.rangeDrag.segmentIndex];
        if (segment?.type === "curve") {
          segment.control = { x, y };
        }
      }
    }
    this.drawAttackRangeOverlay();
  }

  handleRangePointerUp(event) {
    if (this.els.rangeCanvas.hasPointerCapture?.(event.pointerId)) {
      this.els.rangeCanvas.releasePointerCapture(event.pointerId);
    }
    this.endRangeDrag();
  }

  endRangeDrag() {
    this.rangeDrag = null;
    this.collisionDrag = null;
    this.els.rangeCanvas.classList.remove("is-panning");
  }

  updateRangeCanvasCursor(point) {
    if (this.frameEditMode === "collision") {
      const hit = this.hitTestCollision(point);
      this.els.rangeCanvas.style.cursor =
        hit?.cursor ?? "grab";
      return;
    }
    const hit = this.hitTestRange(point);
    this.els.rangeCanvas.dataset.rangeCursor =
      hit?.kind === "point" || hit?.kind === "control"
        ? "move"
        : hit?.kind === "segment"
          ? "pointer"
          : "grab";
  }

  hitTestRange(point) {
    if (!this.rangeDraft) {
      return null;
    }
    const binding = this.getBinding(this.attackRangeAnimationId);
    for (const [segmentIndex, segment] of
      this.rangeDraft.segments.entries()) {
      if (segment.type !== "curve" || !segment.control) {
        continue;
      }
      const control = this.rangeWorldToScreen(
        segment.control,
        binding
      );
      if (
        Math.hypot(point.x - control.x, point.y - control.y) <=
        RANGE_CONTROL_RADIUS + 4
      ) {
        return { kind: "control", segmentIndex };
      }
    }
    for (const [pointIndex, rangePoint] of
      this.rangeDraft.points.entries()) {
      const screen = this.rangeWorldToScreen(rangePoint, binding);
      if (
        Math.hypot(point.x - screen.x, point.y - screen.y) <=
        RANGE_HANDLE_RADIUS + 4
      ) {
        return { kind: "point", pointIndex };
      }
    }
    for (let segmentIndex = 0; segmentIndex <
      this.rangeDraft.segments.length; segmentIndex += 1) {
      const samples = this.getRangeSegmentSamples(segmentIndex);
      for (let index = 1; index < samples.length; index += 1) {
        if (
          distanceToSegment(point, samples[index - 1], samples[index]) <=
          8
        ) {
          return { kind: "segment", segmentIndex };
        }
      }
    }
    return null;
  }

  getRangeSegmentSamples(segmentIndex) {
    const binding = this.getBinding(this.attackRangeAnimationId);
    const points = this.rangeDraft.points;
    const start = points[segmentIndex];
    const end = points[(segmentIndex + 1) % points.length];
    const segment = this.rangeDraft.segments[segmentIndex];
    if (segment?.type !== "curve" || !segment.control) {
      return [
        this.rangeWorldToScreen(start, binding),
        this.rangeWorldToScreen(end, binding)
      ];
    }
    const samples = [];
    for (let step = 0; step <= 24; step += 1) {
      const t = step / 24;
      samples.push(
        this.rangeWorldToScreen(
          {
            x:
              (1 - t) ** 2 * start.x +
              2 * (1 - t) * t * segment.control.x +
              t ** 2 * end.x,
            y:
              (1 - t) ** 2 * start.y +
              2 * (1 - t) * t * segment.control.y +
              t ** 2 * end.y
          },
          binding
        )
      );
    }
    return samples;
  }

  traceRangePath(context) {
    const binding = this.getBinding(this.attackRangeAnimationId);
    const points = this.rangeDraft.points;
    const first = this.rangeWorldToScreen(points[0], binding);
    context.moveTo(first.x, first.y);
    for (let index = 0; index < points.length; index += 1) {
      const end = this.rangeWorldToScreen(
        points[(index + 1) % points.length],
        binding
      );
      const segment = this.rangeDraft.segments[index];
      if (segment?.type === "curve" && segment.control) {
        const control = this.rangeWorldToScreen(
          segment.control,
          binding
        );
        context.quadraticCurveTo(
          control.x,
          control.y,
          end.x,
          end.y
        );
      } else {
        context.lineTo(end.x, end.y);
      }
    }
    context.closePath();
  }

  drawAttackRangeOverlay() {
    const binding = this.getBinding(this.attackRangeAnimationId);
    const canvas = this.els.rangeCanvas;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#050b13";
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (!binding || !this.rangeDraft) {
      return;
    }
    const frameWidth = binding.source.frameWidth;
    const frameHeight = binding.source.frameHeight;
    const scale = this.rangeView.scale;
    const drawWidth = frameWidth * scale;
    const drawHeight = frameHeight * scale;
    const sourceX = (binding.attackFrame - 1) * frameWidth;
    context.imageSmoothingEnabled = false;
    if (this.attackRangeImage) {
      if (binding.direction === "left") {
        context.save();
        context.translate(
          this.rangeView.offsetX + drawWidth,
          this.rangeView.offsetY
        );
        context.scale(-1, 1);
        context.drawImage(
          this.attackRangeImage,
          sourceX,
          0,
          frameWidth,
          frameHeight,
          0,
          0,
          drawWidth,
          drawHeight
        );
        context.restore();
      } else {
        context.drawImage(
          this.attackRangeImage,
          sourceX,
          0,
          frameWidth,
          frameHeight,
          this.rangeView.offsetX,
          this.rangeView.offsetY,
          drawWidth,
          drawHeight
        );
      }
    }
    context.strokeStyle = "rgba(148, 163, 184, 0.35)";
    context.lineWidth = 1;
    context.strokeRect(
      this.rangeView.offsetX,
      this.rangeView.offsetY,
      drawWidth,
      drawHeight
    );

    if (this.frameEditMode === "range") {
      this.drawCollisionBody(context, binding, {
        handles: false,
        label: false
      });
      context.save();
      context.beginPath();
      this.traceRangePath(context);
      context.fillStyle = "rgba(134, 239, 172, 0.24)";
      context.fill();
      context.strokeStyle = "rgba(134, 239, 172, 0.95)";
      context.lineWidth = 2;
      context.stroke();
      context.restore();

      const selectedSamples = this.getRangeSegmentSamples(
        this.rangeSelectedSegment
      );
      if (selectedSamples.length > 1) {
        context.save();
        context.beginPath();
        context.moveTo(selectedSamples[0].x, selectedSamples[0].y);
        for (let index = 1; index < selectedSamples.length; index += 1) {
          context.lineTo(selectedSamples[index].x, selectedSamples[index].y);
        }
        context.strokeStyle = "#bbf7d0";
        context.lineWidth = 3;
        context.stroke();
        context.restore();
      }

      for (const [index, segment] of this.rangeDraft.segments.entries()) {
        if (segment.type !== "curve" || !segment.control) {
          continue;
        }
        const start = this.rangeWorldToScreen(
          this.rangeDraft.points[index],
          binding
        );
        const end = this.rangeWorldToScreen(
          this.rangeDraft.points[
            (index + 1) % this.rangeDraft.points.length
          ],
          binding
        );
        const control = this.rangeWorldToScreen(segment.control, binding);
        context.save();
        context.setLineDash([4, 4]);
        context.strokeStyle = "rgba(187, 247, 208, 0.48)";
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(start.x, start.y);
        context.lineTo(control.x, control.y);
        context.lineTo(end.x, end.y);
        context.stroke();
        context.restore();
        drawDiamond(
          context,
          control.x,
          control.y,
          RANGE_CONTROL_RADIUS,
          "#86efac",
          "#052e16"
        );
      }

      for (const [index, rangePoint] of
        this.rangeDraft.points.entries()) {
        const screen = this.rangeWorldToScreen(rangePoint, binding);
        context.beginPath();
        context.arc(
          screen.x,
          screen.y,
          RANGE_HANDLE_RADIUS,
          0,
          Math.PI * 2
        );
        context.fillStyle = "#052e16";
        context.fill();
        context.strokeStyle =
          index === this.rangeSelectedSegment
            ? "#f0fdf4"
            : "#86efac";
        context.lineWidth = 2;
        context.stroke();
        context.fillStyle = "#dcfce7";
        context.font = "10px sans-serif";
        context.fillText(String(index + 1), screen.x + 10, screen.y - 8);
      }
    } else {
      context.save();
      context.beginPath();
      this.traceRangePath(context);
      context.fillStyle = "rgba(134, 239, 172, 0.08)";
      context.fill();
      context.strokeStyle = "rgba(134, 239, 172, 0.34)";
      context.lineWidth = 1;
      context.stroke();
      context.restore();
      this.drawCollisionBody(context, binding, {
        handles: true,
        label: true
      });
    }
    this.updateRangeZoomLabel();
  }

  setFrameEditMode(mode) {
    this.frameEditMode =
      mode === "collision" ? "collision" : "range";
    this.collisionDrag = null;
    this.els.rangeCanvas.style.cursor = "";
    this.els.rangeCanvas.dataset.rangeCursor =
      this.frameEditMode === "collision" ? "pointer" : "grab";
    if (this.els.rangeControls) {
      this.els.rangeControls.hidden =
        this.frameEditMode !== "range";
    }
    if (this.els.collisionControls) {
      this.els.collisionControls.hidden =
        this.frameEditMode !== "collision";
    }
    for (const button of this.els.rangeDialog.querySelectorAll(
      "[data-frame-edit-mode]"
    )) {
      const active =
        button.dataset.frameEditMode === this.frameEditMode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    }
    this.renderCollisionControls();
    this.drawAttackRangeOverlay();
  }

  renderCollisionControls() {
    if (!this.els.collisionStats) {
      return;
    }
    const body = this.collisionDraft;
    if (!body) {
      this.els.collisionStats.innerHTML = "";
      return;
    }
    const percent = (value) =>
      `${Math.round(Number(value) * 1000) / 10}%`;
    this.els.collisionStats.innerHTML = [
      ["左", percent(body.x)],
      ["上", percent(body.y)],
      ["宽", percent(body.width)],
      ["高", percent(body.height)]
    ]
      .map(
        ([label, value]) =>
          `<span>${label} ${value}</span>`
      )
      .join("");
  }

  getCollisionScreenRect(
    binding = this.getBinding(this.attackRangeAnimationId)
  ) {
    const body = this.collisionDraft;
    if (!body || !binding) {
      return null;
    }
    const frameWidth = binding.source.frameWidth;
    const frameHeight = binding.source.frameHeight;
    const scale = this.rangeView.scale;
    const localLeft = body.x * frameWidth;
    const localWidth = body.width * frameWidth;
    const visualLeft =
      binding.direction === "left"
        ? frameWidth - localLeft - localWidth
        : localLeft;
    return {
      left: this.rangeView.offsetX + visualLeft * scale,
      top:
        this.rangeView.offsetY +
        body.y * frameHeight * scale,
      width: localWidth * scale,
      height: body.height * frameHeight * scale
    };
  }

  getCollisionHandles(rect) {
    if (!rect) {
      return [];
    }
    const right = rect.left + rect.width;
    const bottom = rect.top + rect.height;
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    return [
      {
        name: "nw",
        x: rect.left,
        y: rect.top,
        edges: { left: true, top: true },
        cursor: "nwse-resize"
      },
      {
        name: "ne",
        x: right,
        y: rect.top,
        edges: { right: true, top: true },
        cursor: "nesw-resize"
      },
      {
        name: "sw",
        x: rect.left,
        y: bottom,
        edges: { left: true, bottom: true },
        cursor: "nesw-resize"
      },
      {
        name: "se",
        x: right,
        y: bottom,
        edges: { right: true, bottom: true },
        cursor: "nwse-resize"
      },
      {
        name: "n",
        x: centerX,
        y: rect.top,
        edges: { top: true },
        cursor: "ns-resize"
      },
      {
        name: "e",
        x: right,
        y: centerY,
        edges: { right: true },
        cursor: "ew-resize"
      },
      {
        name: "s",
        x: centerX,
        y: bottom,
        edges: { bottom: true },
        cursor: "ns-resize"
      },
      {
        name: "w",
        x: rect.left,
        y: centerY,
        edges: { left: true },
        cursor: "ew-resize"
      }
    ];
  }

  hitTestCollision(point) {
    const binding = this.getBinding(this.attackRangeAnimationId);
    const rect = this.getCollisionScreenRect(binding);
    if (!rect) {
      return null;
    }
    const mirror = binding?.direction === "left";
    const toStoredEdges = (edges) => ({
      left: mirror ? edges.right : edges.left,
      right: mirror ? edges.left : edges.right,
      top: edges.top,
      bottom: edges.bottom
    });
    const cornerHandles = this.getCollisionHandles(rect).slice(0, 4);
    for (const handle of cornerHandles) {
      if (
        Math.hypot(point.x - handle.x, point.y - handle.y) <=
        COLLISION_HANDLE_RADIUS + 4
      ) {
        return {
          kind: "resize",
          edges: toStoredEdges(handle.edges),
          cursor: handle.cursor
        };
      }
    }
    const right = rect.left + rect.width;
    const bottom = rect.top + rect.height;
    const threshold = COLLISION_HANDLE_RADIUS + 3;
    if (
      Math.abs(point.x - rect.left) <= threshold &&
      point.y >= rect.top - threshold &&
      point.y <= bottom + threshold
    ) {
      return {
        kind: "resize",
        edges: toStoredEdges({ left: true }),
        cursor: "ew-resize"
      };
    }
    if (
      Math.abs(point.x - right) <= threshold &&
      point.y >= rect.top - threshold &&
      point.y <= bottom + threshold
    ) {
      return {
        kind: "resize",
        edges: toStoredEdges({ right: true }),
        cursor: "ew-resize"
      };
    }
    if (
      Math.abs(point.y - rect.top) <= threshold &&
      point.x >= rect.left - threshold &&
      point.x <= right + threshold
    ) {
      return {
        kind: "resize",
        edges: toStoredEdges({ top: true }),
        cursor: "ns-resize"
      };
    }
    if (
      Math.abs(point.y - bottom) <= threshold &&
      point.x >= rect.left - threshold &&
      point.x <= right + threshold
    ) {
      return {
        kind: "resize",
        edges: toStoredEdges({ bottom: true }),
        cursor: "ns-resize"
      };
    }
    if (
      point.x > rect.left &&
      point.x < right &&
      point.y > rect.top &&
      point.y < bottom
    ) {
      return { kind: "move", cursor: "move" };
    }
    return null;
  }

  startCollisionDrag(hit, point) {
    if (!this.collisionDraft) {
      return;
    }
    this.collisionDrag = {
      kind: hit.kind,
      edges: hit.edges,
      start: structuredClone(this.collisionDraft),
      startPoint: { x: point.x, y: point.y }
    };
  }

  updateCollisionDrag(point) {
    const drag = this.collisionDrag;
    const binding = this.getBinding(this.attackRangeAnimationId);
    if (!drag || !binding) {
      return;
    }
    const scale = Math.max(0.0001, this.rangeView.scale);
    let deltaX =
      (point.x - drag.startPoint.x) /
      (binding.source.frameWidth * scale);
    if (binding.direction === "left") {
      deltaX = -deltaX;
    }
    const deltaY =
      (point.y - drag.startPoint.y) /
      (binding.source.frameHeight * scale);
    this.collisionDraft = resizeCharacterCollisionBody(
      drag.start,
      drag,
      deltaX,
      deltaY
    );
    this.renderCollisionControls();
    this.drawAttackRangeOverlay();
  }

  drawCollisionBody(
    context,
    binding,
    { handles = false, label = false } = {}
  ) {
    const rect = this.getCollisionScreenRect(binding);
    if (!rect) {
      return;
    }
    context.save();
    context.fillStyle = "rgba(250, 204, 21, 0.13)";
    context.fillRect(rect.left, rect.top, rect.width, rect.height);
    context.strokeStyle = "#fde047";
    context.lineWidth = handles ? 2.5 : 1.5;
    context.strokeRect(rect.left, rect.top, rect.width, rect.height);
    if (label) {
      context.fillStyle = "#fef08a";
      context.font = "11px sans-serif";
      const labelY = Math.max(14, rect.top - 7);
      context.fillText("碰撞体", rect.left, labelY);
    }
    if (handles) {
      for (const handle of this.getCollisionHandles(rect)) {
        const isCorner = ["nw", "ne", "sw", "se"].includes(
          handle.name
        );
        const size = isCorner ? 9 : 7;
        context.fillStyle = "#fef08a";
        context.strokeStyle = "#a16207";
        context.lineWidth = 1.5;
        context.fillRect(
          handle.x - size / 2,
          handle.y - size / 2,
          size,
          size
        );
        context.strokeRect(
          handle.x - size / 2,
          handle.y - size / 2,
          size,
          size
        );
      }
    }
    context.restore();
  }

  handleRangeSegmentAction(event) {
    const button = event.target.closest("[data-range-segment-action]");
    if (!button || !this.rangeDraft) {
      return;
    }
    const segmentIndex = Number(button.dataset.segmentIndex);
    const action = button.dataset.rangeSegmentAction;
    if (!Number.isInteger(segmentIndex)) {
      return;
    }
    if (action === "select") {
      this.rangeSelectedSegment = segmentIndex;
    } else if (action === "line" || action === "curve") {
      const segment = this.rangeDraft.segments[segmentIndex];
      if (!segment) {
        return;
      }
      if (action === "line") {
        segment.type = "line";
        segment.control = null;
      } else {
        segment.type = "curve";
        segment.control ??= createCurveControl(
          this.rangeDraft.points[segmentIndex],
          this.rangeDraft.points[
            (segmentIndex + 1) % this.rangeDraft.points.length
          ]
        );
      }
      this.rangeSelectedSegment = segmentIndex;
    }
    this.renderRangeSegmentList();
    this.drawAttackRangeOverlay();
  }

  setRangePointCount(value) {
    if (!this.rangeDraft) {
      return;
    }
    this.rangeDraft = resizeAttackRangePoints(
      this.rangeDraft,
      Number(value)
    );
    this.rangeSelectedSegment = Math.min(
      this.rangeSelectedSegment,
      this.rangeDraft.points.length - 1
    );
    this.renderRangeSegmentList();
    this.drawAttackRangeOverlay();
  }

  renderRangeSegmentList() {
    if (!this.rangeDraft) {
      this.els.rangeSegmentList.innerHTML = "";
      return;
    }
    this.els.rangePointCount.value = String(
      this.rangeDraft.points.length
    );
    this.els.rangeSegmentList.innerHTML =
      this.rangeDraft.segments
        .map((segment, index) => {
          const start = this.rangeDraft.points[index];
          const end =
            this.rangeDraft.points[
              (index + 1) % this.rangeDraft.points.length
            ];
          const angle = Math.round(
            (Math.atan2(end.y - start.y, end.x - start.x) * 180) /
              Math.PI
          );
          return `
            <article class="character-range-segment ${
              index === this.rangeSelectedSegment ? "is-selected" : ""
            }">
              <button
                type="button"
                data-range-segment-action="select"
                data-segment-index="${index}"
              >
                <strong>点 ${index + 1} → ${(index + 1) % this.rangeDraft.points.length + 1}</strong>
                <small>${angle}° · ${segment.type === "curve" ? "曲线" : "直线"}</small>
              </button>
              <div class="character-range-segment-actions">
                <button
                  type="button"
                  class="${segment.type === "line" ? "is-active" : ""}"
                  data-range-segment-action="line"
                  data-segment-index="${index}"
                >
                  直线
                </button>
                <button
                  type="button"
                  class="${segment.type === "curve" ? "is-active" : ""}"
                  data-range-segment-action="curve"
                  data-segment-index="${index}"
                >
                  曲线
                </button>
              </div>
            </article>
          `;
        })
        .join("");
  }

  saveAttackRange() {
    const animationId = this.attackRangeAnimationId;
    if (!animationId || !this.rangeDraft) {
      return;
    }
    this.updateEntry((entry) => {
      const binding = entry.animationBindings?.find(
        (candidate) => candidate.id === animationId
      );
      if (binding) {
        binding.attackRanges = setCharacterFrameAttackRange(
          binding.attackRanges,
          binding.attackFrame,
          this.rangeDraft
        );
        binding.frameSound = this.cloneFrameSoundDraft();
      }
      entry.collisionBody = structuredClone(
        this.collisionDraft ??
          createDefaultCharacterCollisionBody()
      );
    });
    this.stopFrameSoundPreview();
    this.closeAttackRangeDialog();
    this.render();
    this.onStatus("已保存帧设置");
  }

  clearAttackRange() {
    const animationId = this.attackRangeAnimationId;
    if (!animationId) {
      return;
    }
    this.updateEntry((entry) => {
      const binding = entry.animationBindings?.find(
        (candidate) => candidate.id === animationId
      );
      if (binding) {
        binding.attackRanges = setCharacterFrameAttackRange(
          binding.attackRanges,
          binding.attackFrame,
          null
        );
        binding.frameSound = this.cloneFrameSoundDraft();
      }
      entry.collisionBody = structuredClone(
        this.collisionDraft ??
          createDefaultCharacterCollisionBody()
      );
    });
    this.stopFrameSoundPreview();
    this.closeAttackRangeDialog();
    this.render();
    this.onStatus("已清除此帧攻击范围并保存帧设置");
  }

  cloneFrameSoundDraft() {
    return this.frameSoundDraft
      ? structuredClone(this.frameSoundDraft)
      : null;
  }

  renderFrameSoundPanel() {
    const panel = this.els.frameSoundPanel;
    if (!panel) {
      return;
    }
    const sound = this.frameSoundDraft;
    if (!sound) {
      panel.innerHTML = `
        <div class="character-frame-sound-empty">
          <span class="character-frame-sound-glyph" aria-hidden="true">♪</span>
          <div>
            <strong>未导入音效</strong>
            <small>从素材库的“音效 / 短音效”中选择。</small>
          </div>
          <button
            class="button button-quiet character-frame-sound-pick"
            type="button"
            data-frame-sound-action="pick"
          >
            导入短音效
          </button>
        </div>
      `;
      return;
    }
    const binding = this.getBinding(this.attackRangeAnimationId);
    const frame = binding?.attackFrame ?? 1;
    const volume = Math.round(
      Math.min(1, Math.max(0, Number(sound.volume) || 0)) * 100
    );
    const folder = sound.folderPath || "根目录";
    panel.innerHTML = `
      <div class="character-frame-sound-card">
        <span class="character-frame-sound-glyph" aria-hidden="true">♪</span>
        <div class="character-frame-sound-copy">
          <strong>${escapeHtml(
            sound.displayName || sound.fileName
          )}</strong>
          <small title="${escapeHtml(sound.relativePath)}">
            ${escapeHtml(folder)} · ${escapeHtml(sound.relativePath)}
          </small>
        </div>
        <span class="character-frame-sound-format">
          ${escapeHtml(getFrameSoundFormat(sound))}
        </span>
      </div>
      <div class="character-frame-sound-actions">
        <button
          class="button button-quiet"
          type="button"
          data-frame-sound-action="preview"
        >
          ${this.frameSoundPreviewAudio ? "停止" : "试听"}
        </button>
        <button
          class="button button-quiet"
          type="button"
          data-frame-sound-action="replace"
        >
          更换
        </button>
        <button
          class="button button-quiet is-danger"
          type="button"
          data-frame-sound-action="remove"
        >
          移除
        </button>
      </div>
      <label class="character-frame-sound-volume">
        <span>
          音量
          <output data-frame-sound-volume-output>${volume}%</output>
        </span>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value="${volume}"
          data-frame-sound-field="volume"
        />
      </label>
      <label class="character-frame-sound-loop">
        <input
          type="checkbox"
          data-frame-sound-field="loop"
          ${sound.loop ? "checked" : ""}
        />
        <span>
          循环播放
          <small>默认不循环</small>
        </span>
      </label>
      <p class="character-frame-sound-hint" data-frame-sound-hint>
        动画播放到第 ${frame} 帧时播放；当前${
          sound.loop ? "循环播放" : "只播放一次"
        }。
      </p>
    `;
  }

  applyFrameSoundAsset(asset) {
    const previous = this.frameSoundDraft;
    this.stopFrameSoundPreview({ render: false });
    this.frameSoundDraft = createCharacterFrameSound(
      asset,
      previous
    );
    this.renderFrameSoundPanel();
    this.onStatus(
      `已选择短音效：${this.frameSoundDraft.displayName}`
    );
  }

  openFrameSoundPicker() {
    if (!this.frameSoundPicker) {
      return;
    }
    this.stopFrameSoundPreview();
    this.frameSoundPicker
      .open({
        currentAssetId:
          this.frameSoundDraft?.relativePath ?? "",
        onSelect: (asset) => {
          this.applyFrameSoundAsset(asset);
        }
      })
      .catch((error) => {
        if (this.els.frameSoundStatus) {
          this.els.frameSoundStatus.textContent =
            `读取短音效失败：${error.message}`;
        }
      });
  }

  handleFrameSoundAction(event) {
    const modeButton = event.target.closest(
      "[data-frame-edit-mode]"
    );
    if (modeButton) {
      this.setFrameEditMode(modeButton.dataset.frameEditMode);
      return;
    }
    const collisionButton = event.target.closest(
      "[data-frame-collision-action]"
    );
    if (collisionButton) {
      if (
        collisionButton.dataset.frameCollisionAction === "reset"
      ) {
        this.collisionDraft =
          createDefaultCharacterCollisionBody();
        this.collisionDrag = null;
        this.renderCollisionControls();
        this.drawAttackRangeOverlay();
        this.onStatus("已恢复默认碰撞体，保存后生效");
      }
      return;
    }
    const button = event.target.closest(
      "[data-frame-sound-action]"
    );
    if (!button) {
      return;
    }
    const action = button.dataset.frameSoundAction;
    if (action === "pick" || action === "replace") {
      this.openFrameSoundPicker();
      return;
    }
    if (action === "remove") {
      this.stopFrameSoundPreview({ render: false });
      this.frameSoundDraft = null;
      this.renderFrameSoundPanel();
      this.onStatus("已移除帧音效，保存后生效");
      return;
    }
    if (action === "preview") {
      this.toggleFrameSoundPreview();
    }
  }

  handleFrameSoundInput(event) {
    if (
      event.target.dataset.frameSoundField !== "volume" ||
      !this.frameSoundDraft
    ) {
      return;
    }
    const volume = Math.min(
      1,
      Math.max(0, Number(event.target.value) / 100)
    );
    this.frameSoundDraft.volume = volume;
    if (this.frameSoundPreviewAudio) {
      this.frameSoundPreviewAudio.volume = volume;
    }
    const output = this.els.frameSoundPanel?.querySelector(
      "[data-frame-sound-volume-output]"
    );
    if (output) {
      output.textContent = `${Math.round(volume * 100)}%`;
    }
  }

  handleFrameSoundChange(event) {
    if (
      event.target.dataset.frameSoundField !== "loop" ||
      !this.frameSoundDraft
    ) {
      return;
    }
    this.frameSoundDraft.loop = event.target.checked;
    if (this.frameSoundPreviewAudio) {
      this.frameSoundPreviewAudio.loop = event.target.checked;
    }
    const hint = this.els.frameSoundPanel?.querySelector(
      "[data-frame-sound-hint]"
    );
    if (hint) {
      const frame =
        this.getBinding(this.attackRangeAnimationId)?.attackFrame ??
        1;
      hint.textContent = `动画播放到第 ${frame} 帧时播放；当前${
        event.target.checked ? "循环播放" : "只播放一次"
      }。`;
    }
  }

  toggleFrameSoundPreview() {
    if (this.frameSoundPreviewAudio) {
      this.stopFrameSoundPreview();
      return;
    }
    const sound = this.frameSoundDraft;
    if (!sound?.url) {
      return;
    }
    const audio = new Audio(sound.url);
    audio.volume = Math.min(
      1,
      Math.max(0, Number(sound.volume) || 0)
    );
    audio.loop = sound.loop === true;
    audio.addEventListener("ended", () => {
      if (this.frameSoundPreviewAudio !== audio) {
        return;
      }
      this.frameSoundPreviewAudio = null;
      this.renderFrameSoundPanel();
    });
    this.frameSoundPreviewAudio = audio;
    this.renderFrameSoundPanel();
    audio.play().catch((error) => {
      console.warn("帧音效试听失败", error);
      if (this.frameSoundPreviewAudio === audio) {
        this.stopFrameSoundPreview();
      }
      this.onNotify(`帧音效试听失败：${error.message}`, true);
    });
  }

  stopFrameSoundPreview({ render = true } = {}) {
    if (this.frameSoundPreviewAudio) {
      this.frameSoundPreviewAudio.pause();
      this.frameSoundPreviewAudio.currentTime = 0;
    }
    this.frameSoundPreviewAudio = null;
    if (render) {
      this.renderFrameSoundPanel();
    }
  }

  openTriggerDialog(animationId, direction = "right") {
    if (!this.getBinding(animationId)) {
      return;
    }
    this.keyCaptureAnimationId = animationId;
    this.triggerDirection = direction === "left" ? "left" : "right";
    const label = getTriggerDirectionLabel(this.triggerDirection);
    if (this.els.keyDialogEyebrow) {
      this.els.keyDialogEyebrow.textContent = `${label}触发键`;
    }
    if (this.els.keyDialogTitle) {
      this.els.keyDialogTitle.textContent = `捕获${label}触发按键`;
    }
    if (this.els.keyNote) {
      this.els.keyNote.textContent = `本次按键只绑定到${label}动画。点击下方区域后按键盘键，或直接点击鼠标按钮；按 Esc 取消。`;
    }
    this.els.keyDialog.showModal();
    requestAnimationFrame(() =>
      this.els.keyCapture.focus({ preventScroll: true })
    );
  }

  closeTriggerDialog() {
    if (this.els.keyDialog.open) {
      this.els.keyDialog.close();
    }
    this.keyCaptureAnimationId = null;
  }

  captureKeyboardTrigger(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      this.closeTriggerDialog();
      return;
    }
    if (event.repeat || !this.keyCaptureAnimationId) {
      return;
    }
    event.preventDefault();
    const code = event.code || `Key:${event.key}`;
    this.addTrigger(this.keyCaptureAnimationId, {
      device: "keyboard",
      code,
      label: formatKeyLabel(event),
      direction: this.triggerDirection
    });
  }

  captureMouseTrigger(event) {
    if (!this.keyCaptureAnimationId) {
      return;
    }
    event.preventDefault();
    this.addTrigger(this.keyCaptureAnimationId, {
      device: "mouse",
      code: `Mouse${event.button}`,
      label: formatMouseLabel(event.button),
      direction: this.triggerDirection
    });
  }

  addTrigger(animationId, trigger) {
    const binding = this.getBinding(animationId);
    if (!binding) {
      return;
    }
    const existingTrigger = (binding.triggers ?? []).find(
      (candidate) =>
        candidate.device === trigger.device &&
        candidate.code === trigger.code
    );
    if (existingTrigger) {
      this.onNotify(
        `触发键「${trigger.label}」已绑定到${getTriggerDirectionLabel(
          existingTrigger.direction ?? binding.direction
        )}。`,
        true
      );
      return;
    }
    this.updateBinding(animationId, (current) => {
      current.triggers ??= [];
      current.triggers.push(trigger);
    });
    this.closeTriggerDialog();
    this.render();
    this.onStatus(
      `已添加${getTriggerDirectionLabel(
        trigger.direction
      )}触发键：${trigger.label}`
    );
  }
}
