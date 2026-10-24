import {
  MECHANISM_KINDS,
  SOLID_TERRAIN_TYPES,
  TOOL_DEFINITIONS,
  createEmptyLevel,
  duplicateSelection as duplicateSelectedObject,
  getMechanismKind,
  getObjectDisplayName,
  getSectionDefinition,
  getSelectedObject,
  getSolidTerrainType,
  insertPlacedObject,
  nudgeSelection,
  removeSelection,
  restoreLevelBackgroundAspect,
  selectionKey,
  setLevelBackground,
  setPathValue
} from "../model/LevelModel.js";
import {
  hasBlockingErrors,
  validateLevel
} from "../model/Validation.js";
import {
  createEmptyContentDocument,
  hasContentErrors,
  normalizeContentDocument,
  validateContentDocument
} from "../model/ContentModel.js";
import { AssetLibrary } from "./AssetLibrary.js";
import {
  AssetPickerDialog,
  renderAudioAssetPreview
} from "./AssetBrowser.js";
import { BackgroundPicker } from "./BackgroundPicker.js";
import { ContentStore } from "./ContentStore.js";
import { ContentWorkspace } from "./ContentWorkspace.js";
import { EditorStore } from "./EditorStore.js";
import { Inspector } from "./Inspector.js";
import { MAP_SCENE_KEY, MapScene } from "./MapScene.js";

const Phaser = globalThis.Phaser;
const systemFont = '"Microsoft YaHei", "PingFang SC", sans-serif';

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
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

function gameAssetUrl(relativePath, revision = "") {
  const path = String(relativePath ?? "")
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const version = revision
    ? `?v=${encodeURIComponent(revision)}`
    : "";
  return `/game/${path}${version}`;
}

function basename(path) {
  return String(path ?? "").split(/[\\/]/).at(-1) ?? "";
}

function isTypingTarget(target) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target?.isContentEditable
  );
}

export class EditorApp {
  constructor() {
    this.store = null;
    this.contentStore = null;
    this.contentWorkspace = null;
    this.inspector = null;
    this.mapScene = null;
    this.assetLibrary = null;
    this.backgroundPicker = null;
    this.levelMusicPicker = null;
    this.levelMusicPreviewAudio = null;
    this.game = null;
    this.project = null;
    this.catalogs = { actors: {}, items: {} };
    this.knownLevelIds = [];
    this.currentLevelId = "";
    this.currentIssues = [];
    this.apiAvailable = false;
    this.activeActorId = "";
    this.activeItemId = "";
    this.activeMechanismKind = "switch";
    this.activeTerrainType = "ground";
    this.isSaving = false;
    this.isSavingContent = false;
    this.contentApiAvailable = false;
    this.activeView = "map";
    this.loaded = false;
  }

  cacheElements() {
    const ids = [
      "save-state",
      "module-map",
      "editor-workspace",
      "level-select",
      "new-level",
      "open-level",
      "save-level",
      "save-content",
      "content-workspace",
      "open-help",
      "open-asset-library",
      "close-help",
      "shortcut-dialog",
      "tool-grid",
      "palette-title",
      "palette-hint",
      "palette-content",
      "select-level-settings",
      "layer-list",
      "document-title",
      "document-id",
      "snap-control",
      "toggle-snap",
      "grid-size",
      "undo",
      "redo",
      "fit-view",
      "tool-help",
      "canvas-coordinates",
      "zoom-out",
      "zoom-value",
      "zoom-in",
      "canvas-empty",
      "status-message",
      "viewport-size",
      "save-as",
      "selection-kind",
      "selection-title",
      "focus-selection",
      "inspector",
      "validation-panel",
      "toggle-validation",
      "validation-count",
      "validation-list",
      "file-input",
      "toast-stack"
    ];
    this.els = Object.fromEntries(
      ids.map((id) => [
        id.replaceAll("-", "_"),
        document.getElementById(id)
      ])
    );
  }

  async start() {
    this.cacheElements();
    this.assetLibrary = new AssetLibrary({
      onNotify: (message, isError) =>
        this.showToast(message, isError)
    });
    this.backgroundPicker = new BackgroundPicker({
      onSelect: (asset) => this.importBackgroundAsset(asset)
    });
    this.levelMusicPicker = new AssetPickerDialog({
      dialog: document.getElementById("level-music-dialog"),
      closeButton: document.getElementById(
        "close-level-music"
      ),
      refreshButton: document.getElementById(
        "refresh-level-music"
      ),
      status: document.getElementById("level-music-status"),
      categories: [
        {
          id: "ambient",
          label: "环境音",
          actionLabel: "使用此音乐",
          emptyDescription:
            "请先在素材库的“音效 / 环境音”中上传音频。"
        }
      ],
      browser: {
        categoryList: document.getElementById(
          "level-music-categories"
        ),
        breadcrumb: document.getElementById(
          "level-music-breadcrumb"
        ),
        summary: document.getElementById(
          "level-music-summary"
        ),
        grid: document.getElementById("level-music-grid"),
        empty: document.getElementById("level-music-empty"),
        emptyTitle: document.getElementById(
          "level-music-empty-title"
        ),
        emptyDescription: document.getElementById(
          "level-music-empty-description"
        ),
        renderPreview: (asset) =>
          renderAudioAssetPreview(asset),
        getAssetMeta: (asset) =>
          `${asset.audioFormat || "音频"} · ${formatAssetSize(
            asset.size
          )}`
      }
    });
    this.bindStaticEvents();

    try {
      this.project = await this.loadProjectSnapshot();
      this.catalogs = this.project.configs;
      this.knownLevelIds = this.project.levels.map((level) => level.id);
      this.activeActorId =
        Object.values(this.catalogs.actors).find(
          (actor) => actor.type !== "player"
        )?.id ?? "";
      this.activeItemId =
        Object.keys(this.catalogs.items)[0] ?? "";

      const initialLevelId =
        this.project.manifest?.levels?.[0] ??
        this.project.levels[0]?.id;
      const initialLevel = initialLevelId
        ? await this.loadProjectLevelDocument(initialLevelId)
        : createEmptyLevel();
      const initialContent = await this.loadContentDocument();

      this.store = new EditorStore(initialLevel);
      this.contentStore = new ContentStore(initialContent);
      this.currentLevelId = initialLevel.id;
      this.inspector = new Inspector(this.els.inspector);
      this.inspector.setContext({
        catalogs: this.catalogs,
        knownLevels: this.getKnownLevels()
      });
      this.store.subscribe((reason) =>
        this.handleStoreChange(reason)
      );
      this.contentWorkspace = new ContentWorkspace(
        this.contentStore,
        {
          onNotify: (message, isError) =>
            this.showToast(message, isError),
          onStateChange: (reason) =>
            this.handleContentStoreChange(reason)
        }
      );
      this.createPhaser();
      this.renderAll();
      this.renderContentHeader();
      this.els.canvas_empty.hidden = true;
      this.loaded = true;
      this.setStatus(
        this.apiAvailable
          ? `已连接游戏项目 · ${this.project.levels.length} 个关卡`
          : "项目 API 未连接，当前仅能导出 JSON"
      );
      requestAnimationFrame(() => {
        if (this.mapScene?.cameras?.main) {
          this.mapScene.fitView();
        }
      });
      globalThis.__PLATFORM_DOME_EDITOR__ = this;
    } catch (error) {
      console.error(error);
      this.setStatus(`编辑器启动失败：${error.message}`);
      this.showToast(`编辑器启动失败：${error.message}`, true);
      this.els.document_title.textContent = "无法加载项目";
      this.els.save_state.textContent = "连接失败";
      this.els.save_state.className = "save-state is-error";
    }
  }

  async loadProjectSnapshot() {
    try {
      const response = await fetch("/api/project", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`API 返回 ${response.status}`);
      }
      const project = await response.json();
      this.apiAvailable = true;
      return project;
    } catch (apiError) {
      console.warn("项目 API 不可用，改用静态样例数据。", apiError);
      this.apiAvailable = false;
      return this.loadFallbackProject();
    }
  }

  async loadContentDocument() {
    try {
      const response = await fetch("/api/content", {
        cache: "no-store"
      });
      if (!response.ok) {
        throw new Error(`内容 API 返回 ${response.status}`);
      }
      const payload = await response.json();
      this.contentApiAvailable = true;
      return normalizeContentDocument(payload.content);
    } catch (apiError) {
      console.warn(
        "内容 API 不可用，改用编辑器内静态内容文档。",
        apiError
      );
      this.contentApiAvailable = false;
      try {
        const response = await fetch(
          "../data/content/content.json",
          { cache: "no-store" }
        );
        if (response.ok) {
          return normalizeContentDocument(await response.json());
        }
      } catch (fallbackError) {
        console.warn("无法读取静态内容文档。", fallbackError);
      }
      return createEmptyContentDocument();
    }
  }

  async loadFallbackProject() {
    const [actors, items, levelA, levelB] = await Promise.all([
      fetch("../data/configs/actors.json", { cache: "no-store" }).then(
        (response) => response.json()
      ),
      fetch("../data/configs/items.json", { cache: "no-store" }).then(
        (response) => response.json()
      ),
      fetch("../data/levels/level-001.json", { cache: "no-store" }).then(
        (response) => response.json()
      ),
      fetch("../data/levels/level-002.json", { cache: "no-store" }).then(
        (response) => response.json()
      )
    ]);

    return {
      gameRoot: "本地样例数据",
      levelDirectory: "data/levels",
      levels: [levelA, levelB].map((level) => ({
        id: level.id,
        name: level.name,
        filename: `${level.id}.json`,
        width: level.world.width,
        height: level.world.height,
        spawnPoints: level.spawnPoints ?? [],
        mechanisms: level.mechanisms ?? []
      })),
      manifest: { levels: [levelA.id, levelB.id] },
      configs: { actors, items }
    };
  }

  async loadProjectLevelDocument(levelId) {
    if (!this.apiAvailable) {
      const candidates = [
        this.project.levels.find((entry) => entry.id === levelId),
        this.project.levels[0]
      ].filter(Boolean);
      const matched =
        candidates.find((entry) => entry.id === levelId) ?? candidates[0];
      if (matched) {
        const response = await fetch(
          `../data/levels/${matched.filename ?? `${matched.id}.json`}`,
          { cache: "no-store" }
        );
        if (response.ok) {
          return response.json();
        }
      }
      throw new Error(`无法读取关卡 ${levelId}`);
    }

    const response = await fetch(
      `/api/levels/${encodeURIComponent(levelId)}`,
      { cache: "no-store" }
    );
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error ?? `无法读取关卡 ${levelId}`);
    }
    const payload = await response.json();
    return payload.level;
  }

  createPhaser() {
    this.mapScene = new MapScene(this.store, this.catalogs);
    this.mapScene.setUiHandlers({
      onCreate: (tool, payload) => this.handleCreate(tool, payload),
      onDelete: (selection) => this.deleteSelection(selection),
      getPlacementPayload: (tool) =>
        this.getPlacementPayload(tool),
      onPointerWorldChanged: ({ x, y }) => {
        this.els.canvas_coordinates.textContent = `X ${x}   Y ${y}`;
      },
      onZoomChanged: (zoom) => {
        this.els.zoom_value.textContent = `${Math.round(zoom * 100)}%`;
      }
    });

    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: "map-canvas",
      width: document.getElementById("map-canvas").clientWidth || 960,
      height: document.getElementById("map-canvas").clientHeight || 600,
      backgroundColor: "#050810",
      // 缩放统一使用最近邻采样，避免像素素材被平滑插值。
      pixelArt: true,
      render: {
        antialias: false,
        antialiasGL: false,
        roundPixels: true
      },
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.NO_CENTER
      },
      physics: {
        default: "arcade",
        arcade: { debug: false }
      },
      scene: [this.mapScene],
      audio: { noAudio: true }
    });

    window.addEventListener("resize", () => {
      requestAnimationFrame(() => this.mapScene?.renderGrid());
    });
  }

  bindStaticEvents() {
    this.els.module_map.addEventListener("click", () =>
      this.switchView("map")
    );
    for (const button of document.querySelectorAll(
      "[data-content-module]"
    )) {
      button.addEventListener("click", () =>
        this.switchView(
          "content",
          button.dataset.contentModule
        )
      );
    }

    this.els.tool_grid.addEventListener("click", (event) => {
      const button = event.target.closest("[data-tool]");
      if (button) {
        this.store?.setTool(button.dataset.tool);
      }
    });

    this.els.palette_content.addEventListener("click", (event) => {
      const card = event.target.closest("[data-palette-id]");
      if (!card) {
        return;
      }
      if (card.dataset.paletteType === "actor") {
        this.activeActorId = card.dataset.paletteId;
        this.store.setTool("actor");
      } else if (card.dataset.paletteType === "item") {
        this.activeItemId = card.dataset.paletteId;
        this.store.setTool("item");
      } else if (card.dataset.paletteType === "mechanism") {
        this.activeMechanismKind = card.dataset.paletteId;
        this.store.setTool("mechanism");
      } else if (card.dataset.paletteType === "terrain") {
        this.activeTerrainType = card.dataset.paletteId;
        this.store.setTool("solid");
      }
      this.renderPalette();
    });

    this.els.layer_list.addEventListener("click", (event) => {
      const row = event.target.closest("[data-section]");
      if (!row) {
        return;
      }
      const section = row.dataset.section;
      this.store.setSelection(
        section === "spawnPoint"
          ? { section, id: row.dataset.id }
          : { section, id: row.dataset.id }
      );
    });

    this.els.select_level_settings.addEventListener("click", () => {
      this.store.setSelection({ section: "level" });
    });

    this.els.inspector.addEventListener("input", (event) => {
      if (this.handleLevelMusicInput(event)) {
        return;
      }
      if (event.target.matches("[data-path]")) {
        this.handleInspectorEdit(event);
      }
    });
    this.els.inspector.addEventListener("click", (event) => {
      const button = event.target.closest("[data-action]");
      if (button) {
        this.handleInspectorAction(button.dataset.action);
      }
    });
    this.els.inspector.addEventListener("change", (event) => {
      if (this.handleLevelMusicChange(event)) {
        return;
      }
      const levelFilter = event.target.closest?.(
        "[data-target-level-filter]"
      );
      if (levelFilter) {
        this.inspector.setTargetLevelFilter(
          levelFilter.value,
          this.store.selection?.id
        );
        this.inspector.render(this.store, { force: true });
        return;
      }
      if (event.target.matches("[data-path]")) {
        this.handleInspectorEdit(event);
      }
    });

    this.els.level_select.addEventListener("change", () => {
      const levelId = this.els.level_select.value;
      if (levelId && !levelId.startsWith("__")) {
        this.loadLevel(levelId);
      }
    });

    this.els.new_level.addEventListener("click", () =>
      this.createNewLevel()
    );
    this.els.open_level.addEventListener("click", () => {
      this.els.file_input.click();
    });
    this.els.file_input.addEventListener("change", () =>
      this.openLocalFile()
    );
    this.els.save_level.addEventListener("click", () =>
      this.saveToGame()
    );
    this.els.save_content.addEventListener("click", () =>
      this.saveContent()
    );
    this.els.save_as.addEventListener("click", () =>
      this.exportJson()
    );
    this.els.undo.addEventListener("click", () => this.store?.undo());
    this.els.redo.addEventListener("click", () => this.store?.redo());
    this.els.fit_view.addEventListener("click", () =>
      this.mapScene?.fitView()
    );
    this.els.zoom_in.addEventListener("click", () =>
      this.mapScene?.zoomBy(1.18)
    );
    this.els.zoom_out.addEventListener("click", () =>
      this.mapScene?.zoomBy(1 / 1.18)
    );
    this.els.toggle_snap.addEventListener("click", () =>
      this.store?.toggleSnap()
    );
    this.els.grid_size.addEventListener("change", () =>
      this.store?.setGridSize(this.els.grid_size.value)
    );
    this.els.focus_selection.addEventListener("click", () =>
      this.mapScene?.focusSelection()
    );
    this.els.toggle_validation.addEventListener("click", () => {
      const list = this.els.validation_list;
      const collapsed = list.classList.toggle("is-collapsed");
      this.els.toggle_validation.setAttribute(
        "aria-expanded",
        String(!collapsed)
      );
    });
    this.els.validation_list.addEventListener("click", (event) => {
      const item = event.target.closest("[data-issue-index]");
      if (!item) {
        return;
      }
      const issue = this.currentIssues[Number(item.dataset.issueIndex)];
      if (!issue?.selection) {
        return;
      }
      this.store.setSelection(issue.selection);
      if (issue.selection.section !== "level") {
        requestAnimationFrame(() =>
          this.mapScene?.focusSelection()
        );
      }
    });

    this.els.open_help.addEventListener("click", () => {
      this.els.shortcut_dialog.showModal();
    });
    this.els.open_asset_library.addEventListener("click", () => {
      this.assetLibrary.open();
    });
    this.els.close_help.addEventListener("click", () => {
      this.els.shortcut_dialog.close();
    });

    window.addEventListener("keydown", (event) =>
      this.handleKeyboard(event)
    );
    window.addEventListener("beforeunload", (event) => {
      if (this.store?.dirty || this.contentStore?.dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    });
  }

  handleStoreChange(reason) {
    if (
      reason === "document-replaced" ||
      reason === "history-changed" ||
      (reason === "selection-changed" &&
        this.store.selection?.section !== "level")
    ) {
      this.stopBackgroundMusicPreview();
    }
    this.renderAll();
    this.updateBackgroundMusicPreviewButton();
    if (reason === "tool-changed") {
      this.mapScene?.handleToolChanged();
    }
    if (reason === "document-replaced") {
      requestAnimationFrame(() => this.mapScene?.fitView());
    }
  }

  handleContentStoreChange() {
    this.renderContentHeader();
  }

  switchView(view, moduleKey = null) {
    this.stopBackgroundMusicPreview();
    const showContent = view === "content";
    this.activeView = showContent ? "content" : "map";
    if (showContent) {
      this.game?.loop?.sleep();
    }
    this.els.editor_workspace.hidden = showContent;
    this.els.content_workspace.hidden = !showContent;
    this.els.save_level.hidden = showContent;
    this.els.save_content.hidden = !showContent;
    for (const element of document.querySelectorAll(".map-only")) {
      element.hidden = showContent;
    }
    for (const button of document.querySelectorAll(".module-tab")) {
      button.classList.remove("is-active");
      button.removeAttribute("aria-current");
    }
    this.els.module_map.classList.toggle("is-active", !showContent);
    if (!showContent) {
      this.els.module_map.setAttribute("aria-current", "page");
    }

    if (showContent) {
      const activeButton = document.querySelector(
        `[data-content-module="${moduleKey}"]`
      );
      activeButton?.classList.add("is-active");
      activeButton?.setAttribute("aria-current", "page");
      this.contentWorkspace?.setModule(moduleKey);
      this.renderContentHeader();
      return;
    }

    this.renderHeader();
    this.game?.loop?.wake();
    requestAnimationFrame(() => this.mapScene?.fitView());
  }

  renderAll() {
    if (!this.store) {
      return;
    }
    this.renderHeader();
    this.renderToolState();
    this.renderPalette();
    this.renderLayers();
    this.renderSelectionHeader();
    this.inspector.updateKnownLevels(this.getKnownLevels());
    this.inspector.render(this.store);
    this.renderValidation();
    this.renderLevelSelect();
  }

  renderContentHeader() {
    if (
      !this.contentStore ||
      this.activeView !== "content"
    ) {
      return;
    }
    let badge = "内容已同步";
    let className = "save-state";
    if (this.isSavingContent) {
      badge = "正在保存…";
    } else if (this.contentStore.dirty) {
      badge = "内容有未保存修改";
      className += " is-dirty";
    } else if (!this.contentApiAvailable) {
      badge = "内容 API 未连接";
      className += " is-error";
    } else {
      className += " is-saved";
    }
    this.els.save_state.textContent = badge;
    this.els.save_state.className = className;
    this.els.save_content.disabled = this.isSavingContent;
  }

  renderHeader() {
    const level = this.store.document;
    this.els.document_title.textContent = level.name || "未命名关卡";
    this.els.document_id.textContent = level.id;
    this.els.viewport_size.textContent =
      `世界 ${level.world.width} × ${level.world.height}`;

    let badge = "未保存";
    let className = "save-state";
    if (this.store.dirty) {
      badge = "有未保存修改";
      className += " is-dirty";
    } else if (this.apiAvailable) {
      badge = "已同步到游戏";
      className += " is-saved";
    } else {
      badge = "未连接项目";
      className += " is-error";
    }
    this.els.save_state.textContent = this.isSaving ? "正在保存…" : badge;
    this.els.save_state.className = className;
    this.els.save_level.disabled = this.isSaving;
  }

  renderToolState() {
    for (const button of this.els.tool_grid.querySelectorAll("[data-tool]")) {
      button.classList.toggle(
        "is-active",
        button.dataset.tool === this.store.tool
      );
    }
    this.els.tool_help.textContent =
      TOOL_DEFINITIONS[this.store.tool]?.help ?? "";
    this.els.toggle_snap.classList.toggle(
      "is-active",
      this.store.snapEnabled
    );
    this.els.toggle_snap.textContent = this.store.snapEnabled
      ? `吸附 ${this.store.gridSize}px`
      : "关闭吸附";
    this.els.grid_size.value = String(this.store.gridSize);
    this.els.undo.disabled = !this.store.history.length;
    this.els.redo.disabled = !this.store.future.length;
  }

  renderPalette() {
    if (!this.store) {
      return;
    }
    const tool = this.store.tool;
    if (tool === "solid") {
      if (
        !SOLID_TERRAIN_TYPES.some(
          (terrain) => terrain.key === this.activeTerrainType
        )
      ) {
        this.activeTerrainType = "ground";
      }
      this.els.palette_title.textContent = "地形类型";
      this.els.palette_hint.textContent = "选择后绘制";
      this.els.palette_content.innerHTML = SOLID_TERRAIN_TYPES.map(
        (terrain) => `
          <button class="palette-card ${
            terrain.key === this.activeTerrainType ? "is-active" : ""
          }" type="button" data-palette-type="terrain" data-palette-id="${terrain.key}">
            <span class="palette-swatch" style="background:${terrain.color}"></span>
            <span class="palette-copy">
              <strong>${escapeHtml(terrain.label)}</strong>
              <small>${escapeHtml(terrain.description)}</small>
            </span>
            <span class="palette-tag">拖拽</span>
          </button>
        `
      ).join("");
      return;
    }
    if (tool === "actor") {
      const actors = Object.values(this.catalogs.actors).filter(
        (actor) => actor.type !== "player"
      );
      if (
        !actors.some((actor) => actor.id === this.activeActorId)
      ) {
        this.activeActorId = actors[0]?.id ?? "";
      }
      this.els.palette_title.textContent = "角色素材";
      this.els.palette_hint.textContent = "单击放置";
      this.els.palette_content.innerHTML =
        actors.length > 0
          ? actors
              .map(
                (actor) => `
                  <button class="palette-card ${
                    actor.id === this.activeActorId ? "is-active" : ""
                  }" type="button" data-palette-type="actor" data-palette-id="${escapeHtml(actor.id)}">
                    <span class="palette-swatch" style="background:${escapeHtml(
                      actor.appearance?.color ?? "#fb7185"
                    )}"></span>
                    <span class="palette-copy">
                      <strong>${escapeHtml(actor.name)}</strong>
                      <small>${escapeHtml(actor.id)}</small>
                    </span>
                    <span class="palette-tag">${
                      actor.type === "npc" ? "NPC" : "敌人"
                    }</span>
                  </button>
                `
              )
              .join("")
          : '<p class="palette-empty">角色配置为空。</p>';
      return;
    }

    if (tool === "item") {
      const items = Object.values(this.catalogs.items);
      if (!items.some((item) => item.id === this.activeItemId)) {
        this.activeItemId = items[0]?.id ?? "";
      }
      this.els.palette_title.textContent = "道具素材";
      this.els.palette_hint.textContent = "单击放置";
      this.els.palette_content.innerHTML =
        items.length > 0
          ? items
              .map(
                (item) => `
                  <button class="palette-card ${
                    item.id === this.activeItemId ? "is-active" : ""
                  }" type="button" data-palette-type="item" data-palette-id="${escapeHtml(item.id)}">
                    <span class="palette-swatch" style="background:${escapeHtml(
                      item.appearance?.color ?? "#22c55e"
                    )}"></span>
                    <span class="palette-copy">
                      <strong>${escapeHtml(item.name)}</strong>
                      <small>${escapeHtml(item.id)}</small>
                    </span>
                    <span class="palette-tag">${escapeHtml(item.type)}</span>
                  </button>
                `
              )
              .join("")
          : '<p class="palette-empty">道具配置为空。</p>';
      return;
    }

    if (tool === "mechanism") {
      this.els.palette_title.textContent = "机关类型";
      this.els.palette_hint.textContent = "选择后放置";
      this.els.palette_content.innerHTML = MECHANISM_KINDS.map(
        (kind) => `
          <button class="palette-card ${
            kind.key === this.activeMechanismKind ? "is-active" : ""
          }" type="button" data-palette-type="mechanism" data-palette-id="${kind.key}">
            <span class="palette-swatch" style="background:${kind.color}"></span>
            <span class="palette-copy">
              <strong>${escapeHtml(kind.label)}</strong>
              <small>${escapeHtml(kind.description)}</small>
            </span>
            <span class="palette-tag">${
              kind.rectangle ? "拖拽" : "单击"
            }</span>
          </button>
        `
      ).join("");
      return;
    }

    const tips = {
      select: "拖动对象移动；四角等比、四边单轴缩放；上方左右和右侧上下箭头每次微调 1 像素。",
      pan: "拖动画布平移视图；滚轮缩放始终可用。",
      solid: "拖动绘制矩形地形；单击可生成 260 × 32 的默认地块。",
      spawn: "单击画布设置玩家出生点。每个关卡只有一个出生点。",
      mechanism: "选择开关、闸门、入口或出口后放置。开关单击放置，其余类型可拖拽尺寸。",
      erase: "单击任意地图对象立即删除。也可以选中后按 Delete。"
    };
    this.els.palette_title.textContent = "工具说明";
    this.els.palette_hint.textContent = "当前工具";
    this.els.palette_content.innerHTML = `<p class="palette-tip">${escapeHtml(
      tips[tool] ?? ""
    )}</p>`;
  }

  renderLayers() {
    const document = this.store.document;
    const selection = this.store.selection ?? { section: "level" };
    const rows = [];
    const buildRows = (section) => {
      const objects = document[section.key] ?? [];
      return objects
        .map((object) => {
          const id = object[section.idField];
          const active =
            selection.section === section.key &&
            selection.id === id;
          const name = getObjectDisplayName(
            section.key,
            object,
            this.catalogs
          );
          const label = name;
          const meta =
            section.key === "items"
              ? `×${object.quantity ?? 1}`
              : Number.isFinite(Number(object.x))
                ? `${Math.round(object.x)}, ${Math.round(object.y)}`
                : "";
          return `
            <button class="layer-row ${active ? "is-active" : ""}" type="button" data-section="${
              section.key
            }" data-id="${escapeHtml(id)}">
              <span class="layer-dot" style="background:${escapeHtml(
                this.getLayerColor(section.key, object)
              )}"></span>
              <span class="layer-name">${escapeHtml(label)}</span>
              <span class="layer-meta">${escapeHtml(meta)}</span>
            </button>
          `;
        })
        .join("");
    };

    for (const sectionKey of ["solids", "actors", "items"]) {
      const section = getSectionDefinition(sectionKey);
      const objects = document[sectionKey] ?? [];
      rows.push(`
        <div class="layer-group">
          <div class="layer-group-title">
            <span>${escapeHtml(section.label)}</span>
            <span class="layer-count">${objects.length}</span>
          </div>
          ${buildRows(section) || '<span class="palette-empty">暂无对象</span>'}
        </div>
      `);
    }

    const specialSections = [getSectionDefinition("mechanisms")];
    const specialCount = specialSections.reduce(
      (total, section) => total + (document[section.key]?.length ?? 0),
      0
    );
    const specialRows = specialSections
      .map((section) => buildRows(section))
      .join("");
    rows.push(`
      <div class="layer-group">
        <div class="layer-group-title">
          <span>机关</span>
          <span class="layer-count">${specialCount}</span>
        </div>
        ${specialRows || '<span class="palette-empty">暂无机关类对象</span>'}
      </div>
    `);

    this.els.layer_list.innerHTML = rows.join("");
  }

  getLayerColor(sectionKey, object) {
    if (sectionKey === "actors") {
      return (
        this.catalogs.actors?.[object.actorId]?.appearance?.color ??
        "#fb7185"
      );
    }
    if (sectionKey === "items") {
      return (
        this.catalogs.items?.[object.itemId]?.appearance?.color ??
        "#22c55e"
      );
    }
    return object.color ?? getSectionDefinition(sectionKey)?.color ?? "#64748b";
  }

  renderSelectionHeader() {
    const selection = this.store.selection;
    const document = this.store.document;
    if (!selection || selection.section === "level") {
      this.els.selection_kind.textContent = "关卡";
      this.els.selection_title.textContent = "关卡设置";
      this.els.focus_selection.disabled = true;
      return;
    }
    if (selection.section === "spawnPoint") {
      this.els.selection_kind.textContent = "出生点";
      this.els.selection_title.textContent =
        getSelectedObject(document, selection)?.name ?? "出生点";
      this.els.focus_selection.disabled = false;
      return;
    }
    const section = getSectionDefinition(selection.section);
    const object = getSelectedObject(document, selection);
    this.els.selection_kind.textContent = section?.label ?? "对象";
    this.els.selection_title.textContent = getObjectDisplayName(
      selection.section,
      object,
      this.catalogs
    );
    this.els.focus_selection.disabled = false;
  }

  renderValidation() {
    this.currentIssues = validateLevel(this.store.document, {
      catalogs: this.catalogs,
      knownLevels: this.getKnownLevels()
    });
    const errors = this.currentIssues.filter(
      (issue) => issue.severity === "error"
    ).length;
    const warnings = this.currentIssues.length - errors;
    this.els.validation_panel.classList.toggle(
      "has-errors",
      errors > 0
    );
    this.els.validation_panel.classList.toggle(
      "has-warnings",
      errors === 0 && warnings > 0
    );
    this.els.validation_count.textContent = errors
      ? `${errors} 个错误`
      : warnings
        ? `${warnings} 个提醒`
        : "通过";

    if (this.currentIssues.length === 0) {
      this.els.validation_list.innerHTML =
        '<div class="validation-ok">关卡数据可以保存并被游戏读取。</div>';
      return;
    }

    this.els.validation_list.innerHTML = this.currentIssues
      .slice(0, 12)
      .map(
        (issue, index) => `
          <button class="validation-item ${
            issue.severity === "error" ? "is-error" : ""
          }" type="button" data-issue-index="${index}">
            ${escapeHtml(issue.message)}
          </button>
        `
      )
      .join("");
  }

  renderLevelSelect() {
    const current = this.store.document.id;
    const choices = [...this.project.levels];
    if (!choices.some((level) => level.id === current)) {
      choices.push({
        id: current,
        name: `${this.store.document.name}（本地草稿）`
      });
    }
    choices.sort((a, b) => a.id.localeCompare(b.id, "zh-CN"));
    this.els.level_select.innerHTML = choices
      .map(
        (level) =>
          `<option value="${escapeHtml(level.id)}" ${
            level.id === current ? "selected" : ""
          }>${escapeHtml(level.id)} · ${escapeHtml(level.name)}</option>`
      )
      .join("");
  }

  handleLevelMusicInput(event) {
    const input = event.target.closest?.(
      "[data-level-music-volume]"
    );
    if (!input) {
      return false;
    }
    const percent = Math.min(
      100,
      Math.max(0, Number(input.value) || 0)
    );
    const output = input
      .closest(".level-music-volume")
      ?.querySelector("[data-level-music-volume-output]");
    if (output) {
      output.textContent = `${Math.round(percent)}%`;
    }
    if (this.levelMusicPreviewAudio) {
      this.levelMusicPreviewAudio.volume = percent / 100;
    }
    return true;
  }

  handleLevelMusicChange(event) {
    const volume = event.target.closest?.(
      "[data-level-music-volume]"
    );
    if (volume) {
      const value =
        Math.min(
          100,
          Math.max(0, Number(volume.value) || 0)
        ) / 100;
      this.store.update(
        (draft) => {
          if (draft.backgroundMusic) {
            draft.backgroundMusic.volume = value;
          }
        },
        { coalesceKey: "level-music-volume" }
      );
      if (this.levelMusicPreviewAudio) {
        this.levelMusicPreviewAudio.volume = value;
      }
      this.inspector.render(this.store, { force: true });
      this.updateBackgroundMusicPreviewButton();
      return true;
    }
    const loop = event.target.closest?.("[data-level-music-loop]");
    if (loop) {
      this.store.update((draft) => {
        if (draft.backgroundMusic) {
          draft.backgroundMusic.loop = loop.checked;
        }
      });
      if (this.levelMusicPreviewAudio) {
        this.levelMusicPreviewAudio.loop = loop.checked;
      }
      this.inspector.render(this.store, { force: true });
      this.updateBackgroundMusicPreviewButton();
      return true;
    }
    return false;
  }

  toggleBackgroundMusicPreview() {
    const music = this.store?.document?.backgroundMusic;
    if (!music?.path) {
      return;
    }
    if (this.levelMusicPreviewAudio) {
      this.stopBackgroundMusicPreview();
      return;
    }
    const audio = new Audio(
      gameAssetUrl(music.path, music.revision)
    );
    audio.volume = Math.min(
      1,
      Math.max(0, Number(music.volume) || 0)
    );
    audio.loop = music.loop !== false;
    audio.addEventListener("ended", () => {
      if (this.levelMusicPreviewAudio === audio) {
        this.levelMusicPreviewAudio = null;
        this.updateBackgroundMusicPreviewButton();
      }
    });
    this.levelMusicPreviewAudio = audio;
    this.updateBackgroundMusicPreviewButton();
    audio.play().catch((error) => {
      console.warn("关卡音乐试听失败", error);
      this.stopBackgroundMusicPreview();
      this.showToast(`关卡音乐试听失败：${error.message}`, true);
    });
  }

  stopBackgroundMusicPreview() {
    if (this.levelMusicPreviewAudio) {
      this.levelMusicPreviewAudio.pause();
      this.levelMusicPreviewAudio.currentTime = 0;
    }
    this.levelMusicPreviewAudio = null;
    this.updateBackgroundMusicPreviewButton();
  }

  updateBackgroundMusicPreviewButton() {
    const button = this.els.inspector?.querySelector(
      '[data-action="preview-background-music"]'
    );
    if (button) {
      button.textContent = this.levelMusicPreviewAudio
        ? "停止"
        : "试听";
    }
  }

  handleInspectorEdit(event) {
    if (!this.store) {
      return;
    }
    const input = event.target;
    const path = input.dataset.path;
    const selection = this.store.selection ?? { section: "level" };
    const section = getSectionDefinition(selection.section);
    const idField =
      selection.section === "level"
        ? "id"
        : selection.section === "spawnPoint"
          ? "id"
          : section?.idField;
    let value = input.value;

    if (input.dataset.valueType === "number") {
      if (value.trim() === "") {
        return;
      }
      value = Number(value);
      if (!Number.isFinite(value)) {
        return;
      }
    } else if (
      input.dataset.nullable === "true" ||
      path === "targetGateId" ||
      path === "targetExitId"
    ) {
      if (value === "" || value === "__null__") {
        value = null;
      }
    }

    const beforeSelection = structuredClone(selection);
    const spawnIdMatch = /^spawnPoints\.(\d+)\.id$/.exec(path);
    const previousSpawnId = spawnIdMatch
      ? this.store.document.spawnPoints[
          Number(spawnIdMatch[1])
        ]?.id
      : null;
    const changed = this.store.update(
      (draft) => {
        const target =
          beforeSelection.section === "level"
            ? draft
            : getSelectedObject(draft, beforeSelection);
        if (target) {
          setPathValue(target, path, value);
        }
        if (
          previousSpawnId &&
          previousSpawnId === draft.initialSpawnId
        ) {
          draft.initialSpawnId = String(value);
        }
      },
      {
        coalesceKey: `inspector:${selectionKey(
          beforeSelection
        )}:${path}`
      }
    );

    if (
      changed &&
      idField &&
      path === idField &&
      (section || selection.section === "spawnPoint")
    ) {
      this.store.setSelection({
        ...beforeSelection,
        id: String(value)
      });
    }

    if (changed && event.type === "change") {
      this.inspector.render(this.store, { force: true });
    }
  }

  handleInspectorAction(action) {
    if (!this.store) {
      return;
    }
    if (action === "import-background") {
      this.backgroundPicker.open(
        this.store.document.world.background?.id ?? ""
      );
      return;
    }
    if (action === "import-background-music") {
      this.stopBackgroundMusicPreview();
      this.levelMusicPicker.open({
        currentAssetId:
          this.store.document.backgroundMusic?.id ?? "",
        onSelect: (asset) => this.importBackgroundMusic(asset)
      });
      return;
    }
    if (action === "preview-background-music") {
      this.toggleBackgroundMusicPreview();
      return;
    }
    if (action === "clear-background-music") {
      this.stopBackgroundMusicPreview();
      this.store.update((draft) => {
        draft.backgroundMusic = null;
      });
      this.store.setSelection({ section: "level" });
      this.inspector.render(this.store, { force: true });
      this.setStatus("已移除关卡背景音乐");
      return;
    }
    if (action === "clear-background") {
      this.store.update((draft) => {
        delete draft.world.background;
      });
      this.store.setSelection({ section: "level" });
      this.inspector.render(this.store, { force: true });
      this.setStatus("已移除关卡背景素材");
      return;
    }
    if (action === "restore-background-aspect") {
      this.store.update((draft) => {
        restoreLevelBackgroundAspect(draft);
      });
      this.inspector.render(this.store, { force: true });
      this.setStatus(
        "已按当前世界宽度和素材比例调整世界高度"
      );
      return;
    }
  }

  async importBackgroundAsset(asset) {
    if (!this.apiAvailable) {
      throw new Error("请通过 npm start 启动编辑器项目服务");
    }
    const response = await fetch("/api/backgrounds/import", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        kind:
          asset.categoryId === "tiled"
            ? "tiled-map"
            : "image",
        assetId:
          asset.categoryId === "tiled"
            ? asset.id
            : asset.relativePath
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        payload.error ?? `导入失败（${response.status}）`
      );
    }

    const background = {
      ...payload.background,
      fileName:
        asset.displayName ??
        payload.background.fileName
    };
    this.store.update((draft) => {
      setLevelBackground(draft, background);
    });
    this.inspector.render(this.store, { force: true });
    this.setStatus(
      `已导入关卡${
        background.type === "tiled" ? " Tiled 背景地图" : "背景"
      }：${asset.displayName ?? asset.fileName}`
    );
    this.showToast(
      `已导入关卡${
        background.type === "tiled" ? " Tiled 背景地图" : "背景"
      } ${asset.displayName ?? asset.fileName}`
    );
    return background;
  }

  async importBackgroundMusic(asset) {
    if (!this.apiAvailable) {
      throw new Error("请通过 npm start 启动编辑器项目服务");
    }
    this.stopBackgroundMusicPreview();
    const response = await fetch("/api/audio/import", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        assetId: asset.relativePath
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        payload.error ?? `导入失败（${response.status}）`
      );
    }
    if (!payload.music) {
      throw new Error("导入接口未返回音乐信息");
    }

    const previous = this.store.document.backgroundMusic;
    const music = {
      ...payload.music,
      displayName:
        asset.displayName ?? payload.music.fileName,
      folderId: asset.folderId ?? null,
      folderPath: asset.folderPath ?? "",
      volume:
        Number.isFinite(previous?.volume) &&
        previous.volume >= 0 &&
        previous.volume <= 1
          ? previous.volume
          : 1,
      loop:
        typeof previous?.loop === "boolean"
          ? previous.loop
          : true
    };
    this.store.update((draft) => {
      draft.backgroundMusic = music;
    });
    this.inspector.render(this.store, { force: true });
    this.setStatus(
      `已导入关卡背景音乐：${music.displayName}`
    );
    this.showToast(
      `已导入关卡背景音乐 ${music.displayName}`
    );
    return music;
  }

  handleKeyboard(event) {
    if (
      !this.store ||
      document.querySelector("dialog[open]")
    ) {
      return;
    }
    const modifier = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();

    if (modifier && key === "s") {
      event.preventDefault();
      if (this.activeView === "content") {
        this.saveContent();
      } else {
        this.saveToGame();
      }
      return;
    }
    if (this.activeView === "content") {
      if (modifier && key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          this.contentStore?.redo();
        } else {
          this.contentStore?.undo();
        }
      } else if (modifier && key === "y") {
        event.preventDefault();
        this.contentStore?.redo();
      }
      return;
    }
    if (
      isTypingTarget(event.target)
    ) {
      return;
    }
    if (modifier && key === "z") {
      event.preventDefault();
      if (event.shiftKey) {
        this.store.redo();
      } else {
        this.store.undo();
      }
      return;
    }
    if (modifier && key === "y") {
      event.preventDefault();
      this.store.redo();
      return;
    }
    if (modifier && key === "d") {
      event.preventDefault();
      this.duplicateSelection();
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      this.deleteSelection(this.store.selection);
      return;
    }
    if (event.key.startsWith("Arrow")) {
      if (!this.store.selection) {
        return;
      }
      event.preventDefault();
      const unit = event.shiftKey
        ? 10
        : this.store.snapEnabled
          ? this.store.gridSize
          : 1;
      const delta = {
        ArrowLeft: [-unit, 0],
        ArrowRight: [unit, 0],
        ArrowUp: [0, -unit],
        ArrowDown: [0, unit]
      }[event.key];
      this.store.update(
        (draft) => {
          nudgeSelection(
            draft,
            this.store.selection,
            delta[0],
            delta[1]
          );
        },
        {
          coalesceKey: `nudge:${selectionKey(this.store.selection)}:${event.key}`
        }
      );
      return;
    }
    if (key === "0") {
      this.mapScene?.fitView();
      return;
    }
    if (key === "escape") {
      this.store.setTool("select");
      this.store.setSelection(null);
      return;
    }
    const shortcuts = {
      v: "select",
      r: "solid",
      a: "actor",
      i: "item",
      m: "mechanism",
      d: "erase"
    };
    if (shortcuts[key]) {
      this.store.setTool(shortcuts[key]);
    }
  }

  getPlacementPayload(tool) {
    if (tool === "solid") {
      return { terrainType: this.activeTerrainType };
    }
    if (tool === "actor") {
      return { actorId: this.activeActorId };
    }
    if (tool === "item") {
      return { itemId: this.activeItemId, quantity: 1 };
    }
    if (tool === "mechanism") {
      return { type: this.activeMechanismKind };
    }
    return {};
  }

  handleCreate(tool, payload) {
    if (!this.store) {
      return;
    }
    if (!["solid", "actor", "item", "mechanism"].includes(tool)) {
      return;
    }

    let newSelection = null;
    this.store.update((draft) => {
      const result = insertPlacedObject(draft, tool, payload);
      newSelection = result.selection;
    });
    if (newSelection) {
      this.store.setSelection(newSelection);
    }
    const placedLabel =
      tool === "mechanism"
        ? getMechanismKind(payload.type).label
        : tool === "solid"
          ? getSolidTerrainType(payload.terrainType).label
        : TOOL_DEFINITIONS[tool]?.label;
    this.setStatus(`已放置${placedLabel ?? "对象"}`);
  }

  deleteSelection(selection = this.store.selection) {
    if (
      !selection ||
      selection.section === "level" ||
      selection.section === "spawnPoint"
    ) {
      return;
    }
    this.store.update((draft) => {
      removeSelection(draft, selection);
    });
    this.store.setSelection(null);
    this.setStatus("已删除选中对象");
  }

  duplicateSelection() {
    if (!this.store.selection) {
      return;
    }
    let newSelection = null;
    this.store.update((draft) => {
      newSelection = duplicateSelectedObject(
        draft,
        this.store.selection
      );
    });
    if (newSelection) {
      this.store.setSelection(newSelection);
      this.setStatus("已复制选中对象");
    }
  }

  async createNewLevel() {
    if (this.store.dirty && !window.confirm("当前修改尚未保存，仍要新建关卡吗？")) {
      return;
    }
    let index = 3;
    const existing = new Set(this.getKnownLevelIds());
    while (existing.has(`level-${String(index).padStart(3, "0")}`)) {
      index += 1;
    }
    const levelId = `level-${String(index).padStart(3, "0")}`;
    const level = createEmptyLevel(levelId);
    level.name = `新关卡 ${index}`;
    this.store.replaceDocument(level, { dirty: true });
    this.currentLevelId = levelId;
    this.store.setSelection({ section: "level" });
    this.renderAll();
    this.setStatus(`已新建 ${levelId}，保存后会写入游戏目录`);
  }

  async loadLevel(levelId) {
    if (levelId === this.store.document.id) {
      return;
    }
    if (this.store.dirty && !window.confirm("当前修改尚未保存，仍要切换关卡吗？")) {
      this.renderLevelSelect();
      return;
    }
    try {
      const level = await this.loadProjectLevelDocument(levelId);
      this.store.replaceDocument(level);
      this.currentLevelId = level.id;
      this.store.setSelection({ section: "level" });
      this.renderAll();
      this.setStatus(`已载入 ${levelId}`);
    } catch (error) {
      this.showToast(`载入失败：${error.message}`, true);
      this.renderLevelSelect();
    }
  }

  async openLocalFile() {
    const file = this.els.file_input.files?.[0];
    if (!file) {
      return;
    }
    if (this.store.dirty && !window.confirm("当前修改尚未保存，仍要打开文件吗？")) {
      this.els.file_input.value = "";
      return;
    }
    try {
      const parsed = JSON.parse(await file.text());
      this.store.replaceDocument(parsed, { dirty: true });
      this.currentLevelId = parsed.id ?? "";
      this.store.setSelection({ section: "level" });
      this.renderAll();
      this.setStatus(`已打开本地文件 ${file.name}`);
    } catch (error) {
      this.showToast(`无法打开文件：${error.message}`, true);
    } finally {
      this.els.file_input.value = "";
    }
  }

  async saveContent() {
    if (!this.contentStore || this.isSavingContent) {
      return;
    }
    const content = normalizeContentDocument(
      this.contentStore.document
    );
    const issues = validateContentDocument(content);
    if (hasContentErrors(issues)) {
      const firstError = issues.find(
        (issue) => issue.severity === "error"
      );
      this.contentStore.setSelection(
        firstError?.selection?.moduleKey
          ? firstError.selection
          : null
      );
      this.contentWorkspace?.setStatus(firstError.message);
      this.showToast(
        `内容存在错误，无法保存：${firstError.message}`,
        true
      );
      return;
    }

    if (!this.contentApiAvailable) {
      this.contentWorkspace?.exportJson();
      this.showToast(
        "内容 API 不可用，已改为下载 content.json。",
        true
      );
      return;
    }

    this.isSavingContent = true;
    this.renderContentHeader();
    try {
      const response = await fetch("/api/content", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(content)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          payload.error ?? `保存失败（${response.status}）`
        );
      }
      this.contentStore.markSaved();
      this.contentWorkspace?.setStatus(
        `已写入 ${basename(payload.savedTo)}`
      );
      this.showToast("内容已保存到游戏项目。");
    } catch (error) {
      this.els.save_state.textContent = "内容保存失败";
      this.els.save_state.className = "save-state is-error";
      this.showToast(`内容保存失败：${error.message}`, true);
    } finally {
      this.isSavingContent = false;
      this.renderContentHeader();
    }
  }

  async saveToGame() {
    if (!this.store || this.isSaving) {
      return;
    }
    const level = this.store.document;
    const issues = validateLevel(level, {
      catalogs: this.catalogs,
      knownLevels: this.getKnownLevels()
    });
    this.currentIssues = issues;
    if (hasBlockingErrors(issues)) {
      this.renderValidation();
      const firstError = issues.find(
        (issue) => issue.severity === "error"
      );
      if (firstError?.selection) {
        this.store.setSelection(firstError.selection);
      }
      this.showToast(
        `存在 ${issues.filter((issue) => issue.severity === "error").length} 个错误，请先修正后再保存。`,
        true
      );
      return;
    }

    if (!this.apiAvailable) {
      this.exportJson();
      this.showToast(
        "项目写入 API 不可用，已改为下载 JSON。请通过 npm start 启动编辑器。",
        true
      );
      return;
    }

    this.isSaving = true;
    this.renderHeader();
    try {
      const response = await fetch(
        `/api/levels/${encodeURIComponent(level.id)}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(level)
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? `保存失败（${response.status}）`);
      }

      this.project.levels = payload.levels ?? this.project.levels;
      this.knownLevelIds = this.project.levels.map(
        (item) => item.id
      );
      this.inspector.setContext({
        catalogs: this.catalogs,
        knownLevels: this.getKnownLevels()
      });
      this.store.markSaved();
      this.renderAll();
      this.inspector.render(this.store, { force: true });
      const backupText = payload.backupPath
        ? `，旧版本备份于 ${basename(payload.backupPath)}`
        : "";
      this.setStatus(
        `已写入 ${basename(payload.savedTo)}${backupText}`
      );
      this.showToast(
        `关卡已保存到 game 项目，刷新游戏即可读取${backupText}。`
      );
    } catch (error) {
      this.els.save_state.textContent = "保存失败";
      this.els.save_state.className = "save-state is-error";
      this.showToast(`保存失败：${error.message}`, true);
    } finally {
      this.isSaving = false;
      this.renderHeader();
    }
  }

  exportJson() {
    if (!this.store) {
      return;
    }
    const body = `${JSON.stringify(this.store.document, null, 2)}\n`;
    const blob = new Blob([body], {
      type: "application/json;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${this.store.document.id || "level"}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.setStatus(`已导出 ${anchor.download}`);
  }

  getKnownLevelIds() {
    return this.getKnownLevels().map((level) => level.id);
  }

  getKnownLevels() {
    const levels = new Map(
      (this.project?.levels ?? []).map((level) => [level.id, level])
    );
    const current = this.store?.document;
    if (current) {
      levels.set(current.id, {
        id: current.id,
        name: current.name,
        spawnPoints: current.spawnPoints ?? [],
        mechanisms: current.mechanisms ?? []
      });
    }
    return [...levels.values()].sort((a, b) =>
      a.id.localeCompare(b.id, "zh-CN")
    );
  }

  setStatus(message) {
    this.els.status_message.textContent = message;
  }

  showToast(message, isError = false) {
    const toast = document.createElement("div");
    toast.className = `toast ${isError ? "is-error" : ""}`;
    toast.textContent = message;
    this.els.toast_stack.append(toast);
    setTimeout(() => toast.remove(), 3600);
  }
}
