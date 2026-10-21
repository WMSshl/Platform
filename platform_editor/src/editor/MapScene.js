import {
  LEVEL_SECTIONS,
  TOOL_DEFINITIONS,
  getMechanismKind,
  getSelectedObject,
  getSolidTerrainType,
  isRectangleMechanism,
  isRectangleTool,
  nudgeSelection,
  selectionKey
} from "../model/LevelModel.js";
import {
  applyWorldResize,
  getObjectDisplaySize,
  getObjectVisualBounds,
  getResizeCursor,
  getResizePolicy,
  resizeObject,
  resizeWorldBounds
} from "../model/ObjectTransform.js";
import { TiledBackgroundView } from "./TiledBackgroundView.js";

const Phaser = globalThis.Phaser;
export const MAP_SCENE_KEY = "MapScene";

const fallbackColors = {
  solids: "#475569",
  actors: "#fb7185",
  items: "#22c55e",
  mechanisms: "#facc15"
};

function colorToNumber(value, fallback = "#64748b") {
  const matched = /^#?([0-9a-f]{6})$/i.exec(String(value ?? ""));
  return Number.parseInt(matched?.[1] ?? fallback.replace("#", ""), 16);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getBackgroundTextureKey(asset) {
  return `level-background:${asset.id}:${asset.revision ?? ""}`;
}

function getBackgroundAssetUrl(asset) {
  const path = String(asset.id ?? "")
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const version = asset.revision
    ? `?v=${encodeURIComponent(asset.revision)}`
    : "";
  return `/assets/${path}${version}`;
}

export class MapScene extends Phaser.Scene {
  constructor(store, catalogs) {
    super({ key: MAP_SCENE_KEY });
    this.store = store;
    this.catalogs = catalogs;
    this.handlers = {};
    this.hitTargets = [];
    this.panState = null;
    this.dragState = null;
    this.resizeState = null;
    this.drawState = null;
    this.backgroundImage = null;
    this.tiledBackground = null;
    this.backgroundTextureRequests = new Set();
    this.backgroundTextureErrors = new Set();
    this.selectionBounds = null;
    this.resizeHandles = [];
    this.nudgeButtons = [];
    this.hoveredResizeHandle = null;
    this.hoveredNudgeButton = null;
    this.lastCameraSignature = "";
    this.cameraBoundsKey = "";
    this.sceneReady = false;
  }

  setUiHandlers(handlers) {
    this.handlers = handlers;
  }

  create() {
    this.cameras.main.setBackgroundColor(0x050810);
    this.input.mouse?.disableContextMenu();

    this.backgroundGraphics = this.add.graphics().setDepth(0);
    this.tiledBackground = new TiledBackgroundView(
      this,
      () => this.render()
    );
    this.gridGraphics = this.add.graphics().setDepth(1);
    this.objectGraphics = this.add.graphics().setDepth(10);
    this.overlayGraphics = this.add.graphics().setDepth(30);
    this.labelLayer = this.add.container(0, 0).setDepth(20);

    this.setupPointerInput();
    this.unsubscribe = this.store.subscribe(() => this.render());
    this.sceneReady = true;
    this.render();
    this.fitView();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribe?.();
    });
  }

  setupPointerInput() {
    this.input.on("pointerdown", this.handlePointerDown, this);
    this.input.on("pointermove", this.handlePointerMove, this);
    this.input.on("pointerup", this.handlePointerUp, this);
    this.input.on("pointerupoutside", this.handlePointerUp, this);
    this.input.on(
      "wheel",
      (pointer, _over, _deltaX, deltaY) => {
        this.zoomAtPointer(pointer, deltaY > 0 ? 0.9 : 1.1);
      },
      this
    );
    this.input.setDefaultCursor("default");
  }

  update(time = this.time.now) {
    if (!this.sceneReady) {
      return;
    }
    this.tiledBackground?.update(time);
    this.updateCameraBounds();
    const camera = this.cameras.main;
    const signature = [
      camera.scrollX,
      camera.scrollY,
      camera.zoom,
      camera.width,
      camera.height
    ]
      .map((value) => Math.round(value * 1000) / 1000)
      .join(":");

    if (signature !== this.lastCameraSignature) {
      this.lastCameraSignature = signature;
      this.renderGrid();
      this.handlers.onZoomChanged?.(camera.zoom);
    }
  }

  get document() {
    return this.store.document;
  }

  updateCameraBounds() {
    const camera = this.cameras.main;
    const world = this.document.world;
    const minMargin = 320;
    const viewWidth = camera.width / camera.zoom;
    const viewHeight = camera.height / camera.zoom;
    const margin = Math.max(
      minMargin,
      viewWidth / 2,
      viewHeight / 2
    );
    const width = Math.max(
      world.width + minMargin * 2,
      viewWidth + margin * 2
    );
    const height = Math.max(
      world.height + minMargin * 2,
      viewHeight + margin * 2
    );
    const x = world.width / 2 - width / 2;
    const y = world.height / 2 - height / 2;
    const key = [x, y, width, height]
      .map((value) => Math.round(value * 100) / 100)
      .join(":");
    if (key === this.cameraBoundsKey) {
      return;
    }
    this.cameraBoundsKey = key;
    camera.setBounds(x, y, width, height);
  }

  render() {
    if (!this.sceneReady) {
      return;
    }
    this.updateCameraBounds();
    this.drawBackground();
    this.renderGrid();
    this.objectGraphics.clear();
    this.overlayGraphics.clear();
    this.labelLayer.removeAll(true);
    this.hitTargets = [];

    this.tiledBackground.drawCollisions(
      this.objectGraphics,
      this.document.world
    );
    this.document.solids.forEach((solid) =>
      this.drawSolid(solid)
    );
    this.document.mechanisms.forEach((mechanism) => {
      const kind = getMechanismKind(mechanism.type);
      this[kind.renderMethod](mechanism);
    });
    this.document.items.forEach((item) => this.drawItem(item));
    this.document.actors.forEach((actor) => this.drawActor(actor));
    this.document.spawnPoints.forEach((spawn) =>
      this.drawSpawnPoint(spawn)
    );
    this.drawSelectionOverlay();
  }

  drawBackground() {
    const { world } = this.document;
    const camera = this.cameras.main;
    this.backgroundGraphics.clear();
    this.backgroundGraphics.fillStyle(
      colorToNumber(world.backgroundColor, "#0f172a"),
      1
    );
    this.backgroundGraphics.fillRect(0, 0, world.width, world.height);
    this.backgroundGraphics.lineStyle(
      2 / camera.zoom,
      0x38bdf8,
      0.18
    );
    this.backgroundGraphics.strokeRect(
      0,
      0,
      world.width,
      world.height
    );

    const backgroundMap =
      world.background?.type === "tiled"
        ? world.background
        : null;
    if (backgroundMap) {
      this.backgroundImage?.setVisible(false);
      this.tiledBackground.draw(backgroundMap, world);
      return;
    }
    this.tiledBackground.hide();

    const asset =
      world.background?.type === "image"
        ? world.background
        : null;
    if (!asset?.id) {
      this.backgroundImage?.setVisible(false);
      return;
    }
    const textureKey = getBackgroundTextureKey(asset);
    if (!this.textures.exists(textureKey)) {
      this.backgroundImage?.setVisible(false);
      this.loadBackgroundTexture(asset, textureKey);
      return;
    }

    if (!this.backgroundImage) {
      this.backgroundImage = this.add
        .image(0, 0, textureKey)
        .setOrigin(0)
        .setDepth(0.5);
    } else {
      this.backgroundImage.setTexture(textureKey);
    }
    this.backgroundImage
      .setPosition(0, 0)
      .setDisplaySize(world.width, world.height)
      .setVisible(true);
  }

  loadBackgroundTexture(asset, textureKey) {
    if (
      this.backgroundTextureRequests.has(textureKey) ||
      this.backgroundTextureErrors.has(textureKey)
    ) {
      return;
    }
    this.backgroundTextureRequests.add(textureKey);

    const complete = () => {
      this.backgroundTextureRequests.delete(textureKey);
      this.render();
    };
    const failed = (file) => {
      if (file.key === textureKey) {
        this.backgroundTextureErrors.add(textureKey);
      }
    };

    this.load.once(Phaser.Loader.Events.COMPLETE, complete);
    this.load.once(Phaser.Loader.Events.FILE_LOAD_ERROR, failed);
    this.load.image(textureKey, getBackgroundAssetUrl(asset));
    this.load.start();
  }

  renderGrid() {
    if (!this.gridGraphics || !this.document) {
      return;
    }

    const camera = this.cameras.main;
    const zoom = camera.zoom;
    /*
     * 直接根据 scroll 与 zoom 计算可视区域。
     * camera.getWorldPoint() 依赖上一帧的 worldView，在 fitView /
     * setZoom 后立即调用会得到旧视口，导致网格只覆盖左上角。
     */
    const viewWidth = camera.width / zoom;
    const viewHeight = camera.height / zoom;
    const topLeft = {
      x: camera.scrollX + camera.width / 2 - viewWidth / 2,
      y: camera.scrollY + camera.height / 2 - viewHeight / 2
    };
    const bottomRight = {
      x: topLeft.x + viewWidth,
      y: topLeft.y + viewHeight
    };
    let step = this.store.gridSize;
    while (step * zoom < 9) {
      step *= 2;
    }

    const world = this.document.world;
    const startX = Math.max(0, Math.floor(topLeft.x / step) * step);
    const endX = Math.min(
      Number(world.width),
      Math.ceil(bottomRight.x / step) * step
    );
    const startY = Math.max(0, Math.floor(topLeft.y / step) * step);
    const endY = Math.min(
      Number(world.height),
      Math.ceil(bottomRight.y / step) * step
    );
    const lineWidth = 1 / zoom;

    this.gridGraphics.clear();
    this.gridGraphics.lineStyle(lineWidth, 0x94a3b8, 0.065);
    for (let x = startX; x <= endX; x += step) {
      this.gridGraphics.lineBetween(x, startY, x, endY);
    }
    for (let y = startY; y <= endY; y += step) {
      this.gridGraphics.lineBetween(startX, y, endX, y);
    }

    const majorStep = step * 4;
    const majorStartX = Math.max(
      0,
      Math.floor(topLeft.x / majorStep) * majorStep
    );
    const majorStartY = Math.max(
      0,
      Math.floor(topLeft.y / majorStep) * majorStep
    );
    this.gridGraphics.lineStyle(lineWidth, 0x7dd3fc, 0.11);
    for (let x = majorStartX; x <= endX; x += majorStep) {
      this.gridGraphics.lineBetween(x, startY, x, endY);
    }
    for (let y = majorStartY; y <= endY; y += majorStep) {
      this.gridGraphics.lineBetween(startX, y, endX, y);
    }

    this.gridGraphics.lineStyle(lineWidth * 1.4, 0x38bdf8, 0.2);
    this.gridGraphics.strokeRect(0, 0, world.width, world.height);
  }

  drawSolid(solid) {
    const camera = this.cameras.main;
    const selected = this.matchesSelection("solids", solid);
    const x = Number(solid.x);
    const y = Number(solid.y);
    const width = Math.max(1, Number(solid.width));
    const height = Math.max(1, Number(solid.height));
    const color = colorToNumber(solid.color, fallbackColors.solids);
    const terrain = getSolidTerrainType(solid.terrainType);
    const isPlatform = terrain.key === "platform";

    this.objectGraphics.fillStyle(
      color,
      isPlatform ? (selected ? 0.48 : 0.34) : selected ? 0.82 : 0.72
    );
    this.objectGraphics.fillRect(
      x - width / 2,
      y - height / 2,
      width,
      height
    );
    this.objectGraphics.lineStyle(
      1 / camera.zoom,
      0x94a3b8,
      selected ? 0.9 : 0.3
    );
    this.objectGraphics.strokeRect(
      x - width / 2,
      y - height / 2,
      width,
      height
    );
    if (isPlatform) {
      this.objectGraphics.lineStyle(
        3 / camera.zoom,
        0x7dd3fc,
        selected ? 1 : 0.82
      );
      this.objectGraphics.lineBetween(
        x - width / 2,
        y - height / 2,
        x + width / 2,
        y - height / 2
      );
    }

    this.hitTargets.push({
      section: "solids",
      id: solid.id,
      x,
      y,
      bounds: {
        left: x - width / 2,
        top: y - height / 2,
        right: x + width / 2,
        bottom: y + height / 2
      },
      visualBounds: {
        left: x - width / 2,
        top: y - height / 2,
        right: x + width / 2,
        bottom: y + height / 2,
        width,
        height,
        x,
        y
      }
    });

    if (
      selected ||
      (width * camera.zoom > 72 && height * camera.zoom > 16)
    ) {
      this.addWorldLabel(
        x,
        y - height / 2 - 4 / camera.zoom,
        solid.id,
        selected
          ? "#bae6fd"
          : isPlatform
            ? "#7dd3fc"
            : "#94a3b8",
        0.5,
        1
      );
    }
  }

  drawGate(gate) {
    const camera = this.cameras.main;
    const selected = this.matchesSelection("mechanisms", gate);
    const x = Number(gate.x);
    const y = Number(gate.y);
    const width = Math.max(1, Number(gate.width));
    const height = Math.max(1, Number(gate.height));
    const color = colorToNumber(gate.color, fallbackColors.gates);

    this.objectGraphics.fillStyle(color, 0.38);
    this.objectGraphics.fillRect(
      x - width / 2,
      y - height / 2,
      width,
      height
    );
    this.objectGraphics.lineStyle(
      2 / camera.zoom,
      color,
      selected ? 1 : 0.82
    );
    this.objectGraphics.strokeRect(
      x - width / 2,
      y - height / 2,
      width,
      height
    );

    for (
      let stripeX = x - width / 2 + 6 / camera.zoom;
      stripeX < x + width / 2;
      stripeX += 10 / camera.zoom
    ) {
      this.objectGraphics.lineStyle(
        1 / camera.zoom,
        color,
        0.42
      );
      this.objectGraphics.lineBetween(
        stripeX,
        y - height / 2 + 3 / camera.zoom,
        stripeX,
        y + height / 2 - 3 / camera.zoom
      );
    }

    this.pushRectangleHit("mechanisms", gate, x, y, width, height);
    this.addWorldLabel(
      x,
      y - height / 2 - 5 / camera.zoom,
      `闸门 ${gate.id}`,
      "#fde68a",
      0.5,
      1
    );
  }

  drawExit(exit) {
    const camera = this.cameras.main;
    const selected = this.matchesSelection("mechanisms", exit);
    const x = Number(exit.x);
    const y = Number(exit.y);
    const width = Math.max(1, Number(exit.width));
    const height = Math.max(1, Number(exit.height));
    const color = colorToNumber(exit.color, fallbackColors.exits);

    this.objectGraphics.fillStyle(color, selected ? 0.22 : 0.11);
    this.objectGraphics.fillRect(
      x - width / 2,
      y - height / 2,
      width,
      height
    );
    this.objectGraphics.lineStyle(
      2 / camera.zoom,
      color,
      selected ? 1 : 0.78
    );
    this.objectGraphics.strokeRect(
      x - width / 2,
      y - height / 2,
      width,
      height
    );

    const arrowSize = Math.min(20 / camera.zoom, height * 0.24);
    this.objectGraphics.lineStyle(
      2 / camera.zoom,
      color,
      0.9
    );
    this.objectGraphics.lineBetween(
      x - arrowSize,
      y,
      x + arrowSize,
      y
    );
    this.objectGraphics.lineBetween(
      x + arrowSize * 0.3,
      y - arrowSize * 0.55,
      x + arrowSize,
      y
    );
    this.objectGraphics.lineBetween(
      x + arrowSize * 0.3,
      y + arrowSize * 0.55,
      x + arrowSize,
      y
    );

    this.pushRectangleHit("mechanisms", exit, x, y, width, height);
    this.addWorldLabel(
      x,
      y - height / 2 - 5 / camera.zoom,
      `出口 ${exit.id}`,
      "#a7f3d0",
      0.5,
      1
    );
  }

  drawEntrance(entrance) {
    const camera = this.cameras.main;
    const selected = this.matchesSelection("mechanisms", entrance);
    const x = Number(entrance.x);
    const y = Number(entrance.y);
    const width = Math.max(1, Number(entrance.width));
    const height = Math.max(1, Number(entrance.height));
    const color = colorToNumber(entrance.color, "#22d3ee");

    this.objectGraphics.fillStyle(color, selected ? 0.24 : 0.13);
    this.objectGraphics.fillRect(
      x - width / 2,
      y - height / 2,
      width,
      height
    );
    this.objectGraphics.lineStyle(
      2 / camera.zoom,
      color,
      selected ? 1 : 0.82
    );
    this.objectGraphics.strokeRect(
      x - width / 2,
      y - height / 2,
      width,
      height
    );

    const inset = Math.min(width * 0.18, 14 / camera.zoom);
    this.objectGraphics.lineStyle(
      2 / camera.zoom,
      color,
      0.95
    );
    this.objectGraphics.lineBetween(
      x - width / 2 + inset,
      y + height / 2 - inset,
      x - width / 2 + inset,
      y - height / 2 + inset
    );
    this.objectGraphics.lineBetween(
      x - width / 2 + inset,
      y - height / 2 + inset,
      x + width / 2 - inset,
      y - height / 2 + inset
    );
    this.objectGraphics.lineBetween(
      x + width / 2 - inset,
      y - height / 2 + inset,
      x + width / 2 - inset,
      y + height / 2 - inset
    );

    this.pushRectangleHit("mechanisms", entrance, x, y, width, height);
    this.addWorldLabel(
      x,
      y - height / 2 - 5 / camera.zoom,
      `入口 ${entrance.id}`,
      "#a5f3fc",
      0.5,
      1
    );
  }

  drawMechanism(mechanism) {
    const camera = this.cameras.main;
    const selected = this.matchesSelection(
      "mechanisms",
      mechanism
    );
    const x = Number(mechanism.x);
    const y = Number(mechanism.y);
    const width = Math.max(1, Number(mechanism.width));
    const height = Math.max(1, Number(mechanism.height));
    const color = colorToNumber(
      mechanism.color,
      fallbackColors.mechanisms
    );

    this.objectGraphics.fillStyle(color, 0.9);
    this.objectGraphics.fillRect(
      x - width / 2,
      y - height / 2,
      width,
      height
    );
    this.objectGraphics.lineStyle(
      2 / camera.zoom,
      0xfff7d6,
      selected ? 1 : 0.72
    );
    this.objectGraphics.strokeRect(
      x - width / 2,
      y - height / 2,
      width,
      height
    );
    this.objectGraphics.fillStyle(0x111827, 0.85);
    this.objectGraphics.fillCircle(
      x,
      y - height * 0.13,
      Math.max(2, width * 0.12)
    );

    this.pushRectangleHit(
      "mechanisms",
      mechanism,
      x,
      y,
      width,
      height
    );
    this.addWorldLabel(
      x,
      y - height / 2 - 5 / camera.zoom,
      `机关 ${mechanism.id}`,
      "#fef08a",
      0.5,
      1
    );
  }

  drawItem(item) {
    const camera = this.cameras.main;
    const selected = this.matchesSelection("items", item);
    const x = Number(item.x);
    const y = Number(item.y);
    const appearance = this.catalogs.items?.[item.itemId]?.appearance ?? {};
    const size = getObjectDisplaySize(
      "items",
      item,
      this.catalogs
    );
    const width = size.width;
    const height = size.height;
    const visualBounds = getObjectVisualBounds(
      "items",
      item,
      this.catalogs
    );
    const color = colorToNumber(
      appearance.color ?? fallbackColors.items,
      fallbackColors.items
    );

    this.objectGraphics.fillStyle(color, 0.28);
    this.objectGraphics.fillCircle(
      x,
      y,
      Math.max(width, height) / 2 + 6 / camera.zoom
    );
    this.objectGraphics.fillStyle(color, 0.9);
    this.objectGraphics.beginPath();
    this.objectGraphics.moveTo(x, y - height / 2);
    this.objectGraphics.lineTo(x + width / 2, y);
    this.objectGraphics.lineTo(x, y + height / 2);
    this.objectGraphics.lineTo(x - width / 2, y);
    this.objectGraphics.closePath();
    this.objectGraphics.fillPath();
    this.objectGraphics.lineStyle(
      1.5 / camera.zoom,
      0xecfdf5,
      selected ? 1 : 0.5
    );
    this.objectGraphics.strokePath();

    this.hitTargets.push({
      section: "items",
      id: item.instanceId,
      x,
      y,
      bounds: {
        left: visualBounds.left - 8 / camera.zoom,
        top: visualBounds.top - 8 / camera.zoom,
        right: visualBounds.right + 8 / camera.zoom,
        bottom: visualBounds.bottom + 8 / camera.zoom
      },
      visualBounds
    });

    const name =
      this.catalogs.items?.[item.itemId]?.name ?? item.itemId;
    this.addWorldLabel(
      x + width / 2 + 8 / camera.zoom,
      y,
      name,
      selected ? "#dcfce7" : "#86efac",
      0,
      0.5
    );
  }

  drawActor(actor) {
    const camera = this.cameras.main;
    const selected = this.matchesSelection("actors", actor);
    const definition = this.catalogs.actors?.[actor.actorId] ?? {};
    const appearance = definition.appearance ?? {};
    const size = getObjectDisplaySize(
      "actors",
      actor,
      this.catalogs
    );
    const width = size.width;
    const height = size.height;
    const visualBounds = getObjectVisualBounds(
      "actors",
      actor,
      this.catalogs
    );
    const x = Number(actor.x);
    const y = Number(actor.y);
    const color = colorToNumber(
      appearance.color ?? fallbackColors.actors,
      fallbackColors.actors
    );
    const accent = colorToNumber(
      appearance.accentColor ?? "#fecdd3",
      "#fecdd3"
    );
    const bodyWidth = Math.max(10, width * 0.62);
    const bodyHeight = Math.max(12, height * 0.66);

    this.objectGraphics.fillStyle(0x020617, 0.3);
    this.objectGraphics.fillEllipse(
      x,
      y + height / 2 - 3 / camera.zoom,
      width * 0.9,
      9 / camera.zoom
    );
    this.objectGraphics.fillStyle(color, 0.92);
    this.objectGraphics.fillRoundedRect(
      x - bodyWidth / 2,
      y - height / 2 + height * 0.26,
      bodyWidth,
      bodyHeight,
      Math.min(7, bodyWidth / 3)
    );
    this.objectGraphics.fillStyle(accent, 0.96);
    this.objectGraphics.fillCircle(
      x,
      y - height / 2 + height * 0.19,
      Math.max(6, width * 0.17)
    );
    this.objectGraphics.lineStyle(
      1.5 / camera.zoom,
      0xffffff,
      selected ? 0.85 : 0.2
    );
    this.objectGraphics.strokeRoundedRect(
      x - bodyWidth / 2,
      y - height / 2 + height * 0.26,
      bodyWidth,
      bodyHeight,
      Math.min(7, bodyWidth / 3)
    );

    this.hitTargets.push({
      section: "actors",
      id: actor.instanceId,
      x,
      y,
      bounds: {
        left: visualBounds.left - 5 / camera.zoom,
        top: visualBounds.top - 5 / camera.zoom,
        right: visualBounds.right + 5 / camera.zoom,
        bottom: visualBounds.bottom + 5 / camera.zoom
      },
      visualBounds
    });

    const name = definition.name ?? actor.actorId;
    const typeLabel =
      definition.type === "npc"
        ? "NPC"
        : definition.type === "enemy"
          ? "敌人"
          : "角色";
    this.addWorldLabel(
      x,
      y - height / 2 - 7 / camera.zoom,
      `${name} · ${typeLabel}`,
      selected ? "#fecdd3" : "#fda4af",
      0.5,
      1
    );
    this.addWorldLabel(
      x,
      y + height / 2 + 4 / camera.zoom,
      actor.instanceId,
      "#667792",
      0.5,
      0
    );
  }

  drawSpawnPoint(spawn) {
    const camera = this.cameras.main;
    const selected =
      this.store.selection?.section === "spawnPoint" &&
      this.store.selection?.id === spawn.id;
    const x = Number(spawn.x);
    const y = Number(spawn.y);
    const radius = 18 - 3 / camera.zoom;

    this.objectGraphics.fillStyle(0x38bdf8, 0.11);
    this.objectGraphics.fillCircle(x, y, radius + 9 / camera.zoom);
    this.objectGraphics.lineStyle(
      2 / camera.zoom,
      0x7dd3fc,
      selected ? 1 : 0.8
    );
    this.objectGraphics.strokeCircle(x, y, radius);
    this.objectGraphics.lineBetween(
      x - radius - 6 / camera.zoom,
      y,
      x + radius + 6 / camera.zoom,
      y
    );
    this.objectGraphics.lineBetween(
      x,
      y - radius - 6 / camera.zoom,
      x,
      y + radius + 6 / camera.zoom
    );
    this.objectGraphics.fillStyle(0xbae6fd, 0.95);
    this.objectGraphics.fillCircle(x, y, 3 / camera.zoom);

    this.hitTargets.push({
      section: "spawnPoint",
      id: spawn.id,
      x,
      y,
      bounds: {
        left: x - radius - 8 / camera.zoom,
        top: y - radius - 8 / camera.zoom,
        right: x + radius + 8 / camera.zoom,
        bottom: y + radius + 8 / camera.zoom
      }
    });

    this.addWorldLabel(
      x,
      y - radius - 9 / camera.zoom,
      spawn.name ?? spawn.id,
      "#bae6fd",
      0.5,
      1
    );
  }

  pushRectangleHit(section, object, x, y, width, height) {
    const definition = LEVEL_SECTIONS.find(
      (entry) => entry.key === section
    );
    this.hitTargets.push({
      section,
      id: object[definition.idField],
      x,
      y,
      bounds: {
        left: x - width / 2,
        top: y - height / 2,
        right: x + width / 2,
        bottom: y + height / 2
      },
      visualBounds: {
        left: x - width / 2,
        top: y - height / 2,
        right: x + width / 2,
        bottom: y + height / 2,
        width,
        height,
        x,
        y
      }
    });
  }

  addWorldLabel(x, y, text, color, originX, originY) {
    const zoom = this.cameras.main.zoom;
    const label = this.add
      .text(x, y, text, {
        fontFamily: '"Microsoft YaHei", "PingFang SC", sans-serif',
        fontSize: `${Math.max(6, 10 / zoom)}px`,
        color
      })
      .setOrigin(originX, originY)
      .setStroke("#050810", Math.max(2, 3.5 / zoom));
    this.labelLayer.add(label);
  }

  matchesSelection(section, object) {
    const definition = LEVEL_SECTIONS.find(
      (entry) => entry.key === section
    );
    return (
      this.store.selection?.section === section &&
      this.store.selection?.id === object[definition.idField]
    );
  }

  drawSelectionOverlay() {
    this.selectionBounds = null;
    this.resizeHandles = [];
    this.nudgeButtons = [];
    const selection = this.store.selection;
    if (!selection) {
      return;
    }
    if (selection.section === "level") {
      const world = this.document.world;
      const bounds = {
        left: 0,
        top: 0,
        right: Number(world.width),
        bottom: Number(world.height),
        width: Number(world.width),
        height: Number(world.height),
        x: Number(world.width) / 2,
        y: Number(world.height) / 2
      };
      this.selectionBounds = bounds;
      const zoom = this.cameras.main.zoom;
      this.overlayGraphics.lineStyle(
        2 / zoom,
        0x7dd3fc,
        0.9
      );
      this.overlayGraphics.strokeRect(
        0,
        0,
        bounds.width,
        bounds.height
      );
      this.drawResizeHandles(bounds, { emphasis: true });
      return;
    }
    const hit = this.hitTargets.find(
      (target) =>
        target.section === selection.section &&
        target.id === selection.id
    );
    if (!hit) {
      return;
    }
    const object = getSelectedObject(this.document, selection);
    if (!object) {
      return;
    }

    const camera = this.cameras.main;
    const zoom = camera.zoom;
    const { left, top, right, bottom } = hit.bounds;
    const padding = 5 / zoom;
    const corner = Math.min(11 / zoom, (right - left) * 0.3);
    this.overlayGraphics.lineStyle(2 / zoom, 0x7dd3fc, 1);
    this.overlayGraphics.strokeRect(
      left - padding,
      top - padding,
      right - left + padding * 2,
      bottom - top + padding * 2
    );
    this.overlayGraphics.lineStyle(3 / zoom, 0xe0f2fe, 1);
    this.overlayGraphics.lineBetween(
      left - padding,
      top - padding,
      left - padding + corner,
      top - padding
    );
    this.overlayGraphics.lineBetween(
      left - padding,
      top - padding,
      left - padding,
      top - padding + corner
    );
    this.overlayGraphics.lineBetween(
      right + padding,
      top - padding,
      right + padding - corner,
      top - padding
    );
    this.overlayGraphics.lineBetween(
      right + padding,
      top - padding,
      right + padding,
      top - padding + corner
    );
    this.overlayGraphics.lineBetween(
      left - padding,
      bottom + padding,
      left - padding + corner,
      bottom + padding
    );
    this.overlayGraphics.lineBetween(
      left - padding,
      bottom + padding,
      left - padding,
      bottom + padding - corner
    );
    this.overlayGraphics.lineBetween(
      right + padding,
      bottom + padding,
      right + padding - corner,
      bottom + padding
    );
    this.overlayGraphics.lineBetween(
      right + padding,
      bottom + padding,
      right + padding,
      bottom + padding - corner
    );

    if (!hit.visualBounds) {
      return;
    }
    this.selectionBounds = { ...hit.visualBounds };
    this.drawResizeHandles(hit.visualBounds);
    this.drawNudgeButtons(hit.visualBounds);
  }

  drawResizeHandles(visual, { emphasis = false } = {}) {
    const camera = this.cameras.main;
    const zoom = camera.zoom;
    const policy = getResizePolicy();
    const handlePoints = {
      nw: [visual.left, visual.top],
      n: [(visual.left + visual.right) / 2, visual.top],
      ne: [visual.right, visual.top],
      e: [visual.right, (visual.top + visual.bottom) / 2],
      se: [visual.right, visual.bottom],
      s: [(visual.left + visual.right) / 2, visual.bottom],
      sw: [visual.left, visual.bottom],
      w: [visual.left, (visual.top + visual.bottom) / 2]
    };

    for (const handle of policy.handles) {
      const [x, y] = handlePoints[handle.name];
      const cornerHandle = handle.dx !== 0 && handle.dy !== 0;
      const size =
        (cornerHandle
          ? emphasis
            ? 13
            : 9
          : emphasis
            ? 10
            : 7) / zoom;
      this.overlayGraphics.fillStyle(
        emphasis ? 0x7dd3fc : 0x07111d,
        1
      );
      this.overlayGraphics.fillRect(
        x - size / 2,
        y - size / 2,
        size,
        size
      );
      this.overlayGraphics.lineStyle(
        1.5 / zoom,
        emphasis
          ? 0xf0f9ff
          : cornerHandle
            ? 0xe0f2fe
            : 0x7dd3fc,
        1
      );
      this.overlayGraphics.strokeRect(
        x - size / 2,
        y - size / 2,
        size,
        size
      );
      this.resizeHandles.push({
        ...handle,
        x,
        y,
        cursor: getResizeCursor(handle)
      });
    }
  }

  drawNudgeButtons(bounds) {
    const zoom = this.cameras.main.zoom;
    const size = 24 / zoom;
    const gap = 3 / zoom;
    const offset = 29 / zoom;
    const centerX = (bounds.left + bounds.right) / 2;
    const centerY = (bounds.top + bounds.bottom) / 2;
    const step = (size + gap) / 2;
    const buttons = [
      {
        name: "left",
        x: centerX - step,
        y: bounds.top - offset - size / 2,
        dx: -1,
        dy: 0
      },
      {
        name: "right",
        x: centerX + step,
        y: bounds.top - offset - size / 2,
        dx: 1,
        dy: 0
      },
      {
        name: "up",
        x: bounds.right + offset + size / 2,
        y: centerY - step,
        dx: 0,
        dy: -1
      },
      {
        name: "down",
        x: bounds.right + offset + size / 2,
        y: centerY + step,
        dx: 0,
        dy: 1
      }
    ];

    for (const button of buttons) {
      this.drawNudgeButton(button, size, zoom);
      this.nudgeButtons.push({
        ...button,
        left: button.x - size / 2,
        top: button.y - size / 2,
        right: button.x + size / 2,
        bottom: button.y + size / 2
      });
    }
  }

  drawNudgeButton(button, size, zoom) {
    const half = size / 2;
    this.overlayGraphics.fillStyle(0x07111d, 0.96);
    this.overlayGraphics.fillRect(
      button.x - half,
      button.y - half,
      size,
      size
    );
    this.overlayGraphics.lineStyle(1.5 / zoom, 0x38bdf8, 1);
    this.overlayGraphics.strokeRect(
      button.x - half,
      button.y - half,
      size,
      size
    );

    const arrow = size * 0.24;
    const tip = size * 0.18;
    let points;
    if (button.dx < 0) {
      points = [
        [button.x - tip, button.y],
        [button.x + arrow, button.y - arrow],
        [button.x + arrow, button.y + arrow]
      ];
    } else if (button.dx > 0) {
      points = [
        [button.x + tip, button.y],
        [button.x - arrow, button.y - arrow],
        [button.x - arrow, button.y + arrow]
      ];
    } else if (button.dy < 0) {
      points = [
        [button.x, button.y - tip],
        [button.x - arrow, button.y + arrow],
        [button.x + arrow, button.y + arrow]
      ];
    } else {
      points = [
        [button.x, button.y + tip],
        [button.x - arrow, button.y - arrow],
        [button.x + arrow, button.y - arrow]
      ];
    }
    this.overlayGraphics.fillStyle(0x7dd3fc, 1);
    this.overlayGraphics.fillTriangle(
      points[0][0],
      points[0][1],
      points[1][0],
      points[1][1],
      points[2][0],
      points[2][1]
    );
  }

  pointerWorld(pointer) {
    return this.cameras.main.getWorldPoint(pointer.x, pointer.y);
  }

  snapValue(value) {
    if (!this.store.snapEnabled) {
      return Math.round(value);
    }
    const size = this.store.gridSize;
    return Math.round(value / size) * size;
  }

  snapPoint(point) {
    return {
      x: this.snapValue(point.x),
      y: this.snapValue(point.y)
    };
  }

  handlePointerDown(pointer) {
    if (pointer.middleButtonDown()) {
      this.startPan(pointer);
      return;
    }
    if (!pointer.leftButtonDown()) {
      return;
    }

    const world = this.pointerWorld(pointer);
    const point = this.snapPoint(world);
    const tool = this.store.tool;

    if (tool === "select") {
      const nudgeButton = this.findNudgeButton(world);
      if (nudgeButton) {
        this.nudgeSelectedObject(nudgeButton);
        return;
      }
      const handle = this.findResizeHandle(world);
      if (handle) {
        this.startObjectResize(handle);
        return;
      }
      const hit = this.findHit(world);
      const worldWidth = Number(this.document.world.width);
      const worldHeight = Number(this.document.world.height);
      const insideWorld =
        world.x >= 0 &&
        world.x <= worldWidth &&
        world.y >= 0 &&
        world.y <= worldHeight;
      const selection = hit
        ? { section: hit.section, id: hit.id }
        : insideWorld
          ? { section: "level" }
          : null;
      this.store.setSelection(selection);
      if (hit) {
        this.startObjectDrag(hit, world);
      } else {
        this.startPan(pointer);
      }
      return;
    }

    if (tool === "erase") {
      const hit = this.findHit(world);
      if (hit) {
        this.handlers.onDelete?.({ section: hit.section, id: hit.id });
      }
      return;
    }

    if (isRectangleTool(tool)) {
      const payload =
        this.handlers.getPlacementPayload?.(tool) ?? {};
      this.drawState = {
        tool,
        payload,
        start: point,
        current: point
      };
      this.drawRectanglePreview();
      return;
    }

    if (["actor", "item", "mechanism"].includes(tool)) {
      const payload = this.handlers.getPlacementPayload?.(tool) ?? {};
      if (
        tool === "mechanism" &&
        payload.type &&
        isRectangleMechanism(payload.type)
      ) {
        this.drawState = {
          tool,
          mechanismType: payload.type,
          payload,
          start: point,
          current: point
        };
        this.drawRectanglePreview();
        return;
      }
      this.handlers.onCreate?.(tool, { ...payload, ...point });
    }
  }

  startPan(pointer) {
    const camera = this.cameras.main;
    this.panState = {
      pointerX: pointer.x,
      pointerY: pointer.y,
      scrollX: camera.scrollX,
      scrollY: camera.scrollY
    };
    this.input.setDefaultCursor("grabbing");
  }

  startObjectDrag(hit, world) {
    const object = getSelectedObject(this.document, {
      section: hit.section,
      id: hit.id
    });
    if (!object) {
      return;
    }
    this.dragState = {
      selection: { section: hit.section, id: hit.id },
      start: world,
      originalX: Number(object.x),
      originalY: Number(object.y)
    };
    this.input.setDefaultCursor("move");
  }

  startObjectResize(handle) {
    const selection = this.store.selection;
    if (!selection || !this.selectionBounds) {
      return;
    }
    if (selection.section === "level") {
      this.resizeState = {
        kind: "level",
        selection: { ...selection },
        handle,
        bounds: { ...this.selectionBounds },
        startWorld: structuredClone(this.document.world),
        startLevel: structuredClone(this.document)
      };
      this.input.setDefaultCursor(handle.cursor);
      return;
    }
    const object = getSelectedObject(
      this.document,
      selection
    );
    if (!object) {
      return;
    }
    this.resizeState = {
      kind: "object",
      selection: { ...selection },
      handle,
      bounds: { ...this.selectionBounds },
      startObject: structuredClone(object)
    };
    this.input.setDefaultCursor(handle.cursor);
  }

  handlePointerMove(pointer) {
    const world = this.pointerWorld(pointer);
    this.handlers.onPointerWorldChanged?.({
      x: Math.round(world.x),
      y: Math.round(world.y)
    });

    if (this.panState) {
      const camera = this.cameras.main;
      const zoom = camera.zoom;
      camera.scrollX =
        this.panState.scrollX -
        (pointer.x - this.panState.pointerX) / zoom;
      camera.scrollY =
        this.panState.scrollY -
        (pointer.y - this.panState.pointerY) / zoom;
      this.renderGrid();
      return;
    }

    if (this.resizeState) {
      const resize = this.resizeState;
      const point = this.snapPoint(world);
      if (resize.kind === "level") {
        const result = resizeWorldBounds(
          resize.startWorld,
          resize.handle,
          point
        );
        if (result) {
          this.store.update(
            (draft) => {
              applyWorldResize(draft, result, {
                baseLevel: resize.startLevel
              });
            },
            {
              coalesceKey: `resize:level:${resize.handle.name}`
            }
          );
        }
        return;
      }
      const result = resizeObject(
        resize.selection.section,
        resize.startObject,
        resize.handle,
        point,
        resize.bounds,
        this.catalogs
      );
      if (result) {
        this.store.update(
          (draft) => {
            const object = getSelectedObject(
              draft,
              resize.selection
            );
            if (object) {
              Object.assign(object, result);
            }
          },
          {
            coalesceKey: `resize:${selectionKey(
              resize.selection
            )}:${resize.handle.name}`
          }
        );
      }
      return;
    }

    if (this.dragState) {
      const drag = this.dragState;
      const deltaX = world.x - drag.start.x;
      const deltaY = world.y - drag.start.y;
      const nextX = this.snapValue(drag.originalX + deltaX);
      const nextY = this.snapValue(drag.originalY + deltaY);
      this.store.update(
        (draft) => {
          const object = getSelectedObject(draft, drag.selection);
          if (object) {
            object.x = nextX;
            object.y = nextY;
          }
        },
        {
          coalesceKey: `drag:${selectionKey(drag.selection)}`
        }
      );
      return;
    }

    if (this.drawState) {
      this.drawState.current = this.snapPoint(world);
      this.drawRectanglePreview();
      return;
    }

    const nudgeButton = this.findNudgeButton(world);
    if (nudgeButton) {
      this.hoveredNudgeButton = nudgeButton.name;
      this.hoveredResizeHandle = null;
      this.input.setDefaultCursor("pointer");
      return;
    }
    if (this.hoveredNudgeButton) {
      this.hoveredNudgeButton = null;
      this.setToolCursor();
    }

    const handle = this.findResizeHandle(world);
    if (handle) {
      this.hoveredResizeHandle = handle.name;
      this.input.setDefaultCursor(handle.cursor);
    } else if (this.hoveredResizeHandle) {
      this.hoveredResizeHandle = null;
      this.setToolCursor();
    }
  }

  handlePointerUp() {
    if (this.panState) {
      this.panState = null;
      this.setToolCursor();
      return;
    }
    if (this.dragState) {
      this.dragState = null;
      this.setToolCursor();
      return;
    }
    if (this.resizeState) {
      this.resizeState = null;
      this.setToolCursor();
      return;
    }
    if (this.drawState) {
      const {
        tool,
        mechanismType,
        payload = {},
        start,
        current
      } = this.drawState;
      this.drawState = null;
      this.overlayGraphics.clear();

      let width = Math.abs(current.x - start.x);
      let height = Math.abs(current.y - start.y);
      let centerX = (start.x + current.x) / 2;
      let centerY = (start.y + current.y) / 2;
      if (width < 8 && height < 8) {
        const size = this.getDefaultSize(tool, mechanismType);
        width = size.width;
        height = size.height;
        centerX = start.x;
        centerY = start.y;
      }
      this.handlers.onCreate?.(tool, {
        ...payload,
        x: Math.round(centerX),
        y: Math.round(centerY),
        width: Math.max(8, Math.round(width)),
        height: Math.max(8, Math.round(height)),
        ...(mechanismType ? { type: mechanismType } : {})
      });
    }
  }

  drawRectanglePreview() {
    const { start, current, tool, mechanismType } = this.drawState;
    const camera = this.cameras.main;
    const left = Math.min(start.x, current.x);
    const top = Math.min(start.y, current.y);
    const width = Math.abs(current.x - start.x);
    const height = Math.abs(current.y - start.y);
    const color =
      tool === "solid"
        ? 0x38bdf8
        : mechanismType === "gate"
          ? 0xfacc15
          : mechanismType === "entrance"
            ? 0x22d3ee
            : 0x34d399;

    this.overlayGraphics.clear();
    this.overlayGraphics.fillStyle(color, 0.15);
    this.overlayGraphics.fillRect(left, top, width, height);
    this.overlayGraphics.lineStyle(1.5 / camera.zoom, color, 1);
    this.overlayGraphics.strokeRect(left, top, width, height);
  }

  getDefaultSize(tool, mechanismType = "") {
    if (tool === "solid") {
      return { width: 260, height: 32 };
    }
    if (mechanismType === "gate") {
      return { width: 36, height: 180 };
    }
    if (mechanismType === "entrance") {
      return { width: 100, height: 140 };
    }
    return { width: 100, height: 140 };
  }

  findResizeHandle(world) {
    if (!this.selectionBounds) {
      return null;
    }
    const radius = 7 / this.cameras.main.zoom;
    for (const handle of this.resizeHandles) {
      if (
        Math.abs(world.x - handle.x) <= radius &&
        Math.abs(world.y - handle.y) <= radius
      ) {
        return handle;
      }
    }
    return null;
  }

  findNudgeButton(world) {
    return (
      this.nudgeButtons.find(
        (button) =>
          world.x >= button.left &&
          world.x <= button.right &&
          world.y >= button.top &&
          world.y <= button.bottom
      ) ?? null
    );
  }

  nudgeSelectedObject(button) {
    const selection = this.store.selection;
    if (!selection || selection.section === "level") {
      return;
    }
    this.store.update(
      (draft) => {
        nudgeSelection(
          draft,
          selection,
          button.dx,
          button.dy
        );
      },
      {
        coalesceKey: `nudge-buttons:${selectionKey(
          selection
        )}:${button.name}`
      }
    );
  }

  findHit(world) {
    for (let index = this.hitTargets.length - 1; index >= 0; index -= 1) {
      const target = this.hitTargets[index];
      const { left, top, right, bottom } = target.bounds;
      if (
        world.x >= left &&
        world.x <= right &&
        world.y >= top &&
        world.y <= bottom
      ) {
        return target;
      }
    }
    return null;
  }

  setToolCursor() {
    const tool = this.store.tool;
    if (tool === "select") {
      this.input.setDefaultCursor("default");
    } else if (tool === "erase") {
      this.input.setDefaultCursor("not-allowed");
    } else {
      this.input.setDefaultCursor("crosshair");
    }
  }

  zoomAtPointer(pointer, factor) {
    const camera = this.cameras.main;
    const nextZoom = clamp(camera.zoom * factor, 0.12, 4);
    if (nextZoom === camera.zoom) {
      return;
    }

    const offsetX = pointer.x - camera.width / 2;
    const offsetY = pointer.y - camera.height / 2;
    const pointerWorldX =
      camera.midPoint.x + offsetX / camera.zoom;
    const pointerWorldY =
      camera.midPoint.y + offsetY / camera.zoom;

    camera.setZoom(nextZoom);
    this.updateCameraBounds();
    /*
     * 按新缩放计算相机中心，使鼠标所指的世界坐标固定在原屏幕位置。
     * 相机边界也会随缩放扩展，避免纵向视口过大时被强制回中。
     */
    camera.centerOn(
      pointerWorldX - offsetX / nextZoom,
      pointerWorldY - offsetY / nextZoom
    );
    this.renderGrid();
    this.handlers.onZoomChanged?.(nextZoom);
  }

  zoomBy(factor) {
    const camera = this.cameras.main;
    const center = {
      x: camera.midPoint.x,
      y: camera.midPoint.y
    };
    camera.setZoom(clamp(camera.zoom * factor, 0.12, 4));
    this.updateCameraBounds();
    camera.centerOn(center.x, center.y);
    this.renderGrid();
    this.handlers.onZoomChanged?.(camera.zoom);
  }

  fitView() {
    if (!this.cameras?.main) {
      return;
    }
    const camera = this.cameras.main;
    const { width, height } = this.document.world;
    const padding = 72;
    const zoom = clamp(
      Math.min(
        (camera.width - padding * 2) / width,
        (camera.height - padding * 2) / height
      ),
      0.12,
      2
    );
    camera.setZoom(zoom);
    this.updateCameraBounds();
    camera.centerOn(width / 2, height / 2);
    this.renderGrid();
    this.handlers.onZoomChanged?.(zoom);
  }

  focusSelection() {
    if (!this.cameras?.main) {
      return;
    }
    const object = getSelectedObject(
      this.document,
      this.store.selection
    );
    if (!object || !Number.isFinite(Number(object.x))) {
      this.fitView();
      return;
    }
    this.cameras.main.centerOn(Number(object.x), Number(object.y));
  }

  handleToolChanged() {
    if (!this.sceneReady) {
      return;
    }
    this.setToolCursor();
  }

  getToolHelp() {
    return TOOL_DEFINITIONS[this.store.tool]?.help ?? "";
  }
}
