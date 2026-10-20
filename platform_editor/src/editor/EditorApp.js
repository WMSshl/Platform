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
  selectionKey,
  setPathValue
} from "../model/LevelModel.js";
import {
  hasBlockingErrors,
  validateLevel
} from "../model/Validation.js";
import { AssetLibrary } from "./AssetLibrary.js";
import { BackgroundPicker } from "./BackgroundPicker.js";
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
    this.inspector = null;
    this.mapScene = null;
    this.assetLibrary = null;
    this.backgroundPicker = null;
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
    this.loaded = false;
  }

  cacheElements() {
    const ids = [
      "save-state",
      "level-select",
      "new-level",
      "open-level",
      "save-level",
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

      this.store = new EditorStore(initialLevel);
      this.currentLevelId = initialLevel.id;
      this.inspector = new Inspector(this.els.inspector);
      this.inspector.setContext({
        catalogs: this.catalogs,
        knownLevels: this.getKnownLevels()
      });
      this.store.subscribe((reason) =>
        this.handleStoreChange(reason)
      );
      this.createPhaser();
      this.renderAll();
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
      if (this.store?.dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    });
  }

  handleStoreChange(reason) {
    this.renderAll();
    if (reason === "tool-changed") {
      this.mapScene?.handleToolChanged();
    }
    if (reason === "document-replaced") {
      requestAnimationFrame(() => this.mapScene?.fitView());
    }
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
        this.store.document.world.backgroundAsset?.id ?? ""
      );
      return;
    }
    if (action === "clear-background") {
      this.store.update((draft) => {
        delete draft.world.backgroundAsset;
      });
      this.inspector.render(this.store, { force: true });
      this.setStatus("已移除关卡背景素材");
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
        assetId: asset.relativePath
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        payload.error ?? `导入失败（${response.status}）`
      );
    }

    this.store.update((draft) => {
      draft.world.backgroundAsset = payload.backgroundAsset;
    });
    this.inspector.render(this.store, { force: true });
    this.setStatus(`已导入关卡背景：${asset.fileName}`);
    this.showToast(`已导入关卡背景 ${asset.fileName}`);
    return payload.backgroundAsset;
  }

  handleKeyboard(event) {
    if (
      !this.store ||
      isTypingTarget(event.target) ||
      document.querySelector("dialog[open]")
    ) {
      return;
    }
    const modifier = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();

    if (modifier && key === "s") {
      event.preventDefault();
      this.saveToGame();
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
