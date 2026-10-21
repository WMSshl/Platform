import { SpriteSheetAnimator } from "./SpriteSheetAnimator.js";
import {
  getOpaqueContentBounds,
  ImageThumbnail,
  loadAssetImage
} from "./AssetThumbnail.js";
import { TiledMapImportController } from "./TiledMapImportController.js";
import { TiledMapThumbnail } from "./TiledMapThumbnail.js";

const DEFAULT_MAX_FILE_BYTES = 20 * 1024 * 1024;
const ALL_IMAGE_EXTENSIONS = [
  ".gif",
  ".jpeg",
  ".jpg",
  ".png",
  ".svg",
  ".webp"
];
const TILED_EXTENSIONS = [
  ".json",
  ".tmj",
  ".tsx",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif"
];
const MIN_VIEWER_SCALE = 0.2;
const MAX_VIEWER_SCALE = 8;
const CATEGORY_META = {
  background: {
    parentLabel: "地图",
    label: "背景",
    allowedExtensions: ALL_IMAGE_EXTENSIONS
  },
  entity: {
    parentLabel: "地图",
    label: "动画",
    allowedExtensions: ALL_IMAGE_EXTENSIONS
  },
  static: {
    parentLabel: "地图",
    label: "静态贴图",
    allowedExtensions: [".png"]
  },
  tiled: {
    parentLabel: "地图",
    label: "Tiled 地图",
    allowedExtensions: TILED_EXTENSIONS
  }
};
const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit"
});

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatBytes(value) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : dateFormatter.format(date);
}

function splitAssetFileName(fileName) {
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex <= 0) {
    return { stem: fileName, extension: "" };
  }
  return {
    stem: fileName.slice(0, dotIndex),
    extension: fileName.slice(dotIndex)
  };
}

function formatExtensionLabel(extensions) {
  return extensions
    .map((extension) => extension.slice(1).toUpperCase())
    .join("、");
}

function usesNativeImagePreview(asset) {
  return (
    asset.mimeType === "image/gif" ||
    asset.mimeType === "image/svg+xml"
  );
}

function tiledMapPreviewDataUrl(asset) {
  const width = Math.max(1, Number(asset.sourceWidth) || 1);
  const height = Math.max(1, Number(asset.sourceHeight) || 1);
  const details = `${width} × ${height} · ${asset.tileLayerCount ?? 0} 图层 · ${asset.collisionCount ?? 0} 碰撞`;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="960" height="540">
      <defs>
        <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
          <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#334155" stroke-width="1"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="#07111d"/>
      <rect width="100%" height="100%" fill="url(#grid)" opacity="0.65"/>
      <rect x="120" y="150" width="720" height="240" rx="18" fill="#0f172a" stroke="#f59e0b" stroke-width="4"/>
      <text x="480" y="270" text-anchor="middle" fill="#fbbf24" font-family="Consolas, monospace" font-size="52" letter-spacing="8">TILED JSON</text>
      <text x="480" y="325" text-anchor="middle" fill="#cbd5e1" font-family="Microsoft YaHei, sans-serif" font-size="24">${escapeHtml(details)}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    svg
  )}`;
}

export class AssetLibrary {
  constructor({ onNotify } = {}) {
    this.onNotify = onNotify ?? (() => {});
    this.dialog = document.getElementById("asset-library-dialog");
    this.closeButton = document.getElementById(
      "close-asset-library"
    );
    this.refreshButton = document.getElementById(
      "refresh-assets"
    );
    this.uploadButton = document.getElementById(
      "upload-assets"
    );
    this.fileInput = document.getElementById(
      "asset-file-input"
    );
    this.storagePath = document.getElementById(
      "asset-storage-path"
    );
    this.apiState = document.getElementById("asset-api-state");
    this.categoryTitle = document.getElementById(
      "asset-category-title"
    );
    this.breadcrumb = document.getElementById(
      "asset-breadcrumb"
    );
    this.categoryButtons = [
      ...this.dialog.querySelectorAll("[data-asset-category]")
    ];
    this.grid = document.getElementById("asset-grid");
    this.emptyState = document.getElementById("asset-empty");
    this.emptyTitle = document.getElementById(
      "asset-empty-title"
    );
    this.emptyDescription = document.getElementById(
      "asset-empty-description"
    );
    this.status = document.getElementById("asset-status");
    this.supportedFormats = document.getElementById(
      "asset-supported-formats"
    );
    this.dropZone = document.getElementById("asset-drop-zone");
    this.dropHint = document.getElementById("asset-drop-hint");
    this.contextMenu = document.getElementById(
      "asset-context-menu"
    );
    this.contextActions = [
      ...this.contextMenu.querySelectorAll("[data-asset-action]")
    ];
    this.viewer = document.getElementById(
      "asset-image-viewer"
    );
    this.viewerName = document.getElementById(
      "asset-viewer-name"
    );
    this.viewerMeta = document.getElementById(
      "asset-viewer-meta"
    );
    this.viewerCanvas = document.getElementById(
      "asset-viewer-canvas"
    );
    this.viewerImage = document.getElementById(
      "asset-viewer-image"
    );
    this.viewerSprite = document.getElementById(
      "asset-viewer-sprite"
    );
    this.viewerZoom = document.getElementById(
      "asset-viewer-zoom"
    );
    this.viewerZoomOut = document.getElementById(
      "asset-viewer-zoom-out"
    );
    this.viewerZoomIn = document.getElementById(
      "asset-viewer-zoom-in"
    );
    this.viewerFit = document.getElementById(
      "asset-viewer-fit"
    );
    this.closeViewerButton = document.getElementById(
      "close-asset-viewer"
    );
    this.frameRateAction = this.contextMenu.querySelector(
      '[data-asset-action="frame-rate"]'
    );
    this.renameAction = this.contextMenu.querySelector(
      '[data-asset-action="rename"]'
    );
    this.contextFrameRate = document.getElementById(
      "asset-context-frame-rate"
    );
    this.frameRatePanel = document.getElementById(
      "asset-frame-rate-panel"
    );
    this.frameRateName = document.getElementById(
      "asset-frame-rate-name"
    );
    this.frameRateDetail = document.getElementById(
      "asset-frame-rate-detail"
    );
    this.frameRateRange = document.getElementById(
      "asset-frame-rate-range"
    );
    this.frameRateNumber = document.getElementById(
      "asset-frame-rate-number"
    );
    this.frameRatePreview = document.getElementById(
      "asset-frame-rate-preview"
    );
    this.increaseFrameRateButton = document.getElementById(
      "increase-frame-rate"
    );
    this.decreaseFrameRateButton = document.getElementById(
      "decrease-frame-rate"
    );
    this.confirmFrameRateButton = document.getElementById(
      "confirm-frame-rate"
    );
    this.activeCategory = "background";
    this.assets = {};
    this.categoryMeta = { ...CATEGORY_META };
    this.maxFileBytes = DEFAULT_MAX_FILE_BYTES;
    this.isUploading = false;
    this.isLoading = false;
    this.isDeleting = false;
    this.isRenaming = false;
    this.apiAvailable = true;
    this.dragDepth = 0;
    this.contextAsset = null;
    this.contextTarget = null;
    this.viewerAsset = null;
    this.viewerOpen = false;
    this.viewerScale = 1;
    this.viewerX = 0;
    this.viewerY = 0;
    this.isPanning = false;
    this.panPointerId = null;
    this.panStart = null;
    this.animators = new Set();
    this.previewGeneration = 0;
    this.viewerSpriteAnimator = null;
    this.frameRatePreviewAnimator = null;
    this.frameRateAsset = null;
    this.pendingFrameRate = 8;
    this.renameEditor = null;
    this.tiledImporter = new TiledMapImportController({
      onNotify: (message, isError) =>
        this.showNotification(message, isError),
      onStatus: (message, isError) =>
        this.setStatus(message, isError),
      onBusyChange: (busy) => {
        this.isUploading = busy;
        this.setBusy();
      },
      onImported: async () => {
        this.activeCategory = "tiled";
        await this.refresh();
      },
      getMaxFileBytes: () => this.maxFileBytes
    });
    this.syncUploadConstraints();
    this.bindEvents();
  }

  bindEvents() {
    this.closeButton.addEventListener("click", () => this.close());
    this.dialog.addEventListener("click", (event) => {
      if (event.target === this.dialog) {
        this.close();
      }
    });
    this.dialog.addEventListener("close", () => {
      this.fileInput.value = "";
      this.tiledImporter.cancel();
      this.dragDepth = 0;
      this.dropZone.classList.remove("is-dragging");
      this.closeContextMenu();
      this.closeViewer();
      this.closeFrameRatePanel();
      this.cancelRename({ rerender: false });
      this.stopPreviewAnimators();
    });
    this.dialog.addEventListener("pointerdown", (event) => {
      if (
        !this.contextMenu.hidden &&
        !this.contextMenu.contains(event.target)
      ) {
        this.closeContextMenu();
      }
    });
    this.dialog.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") {
        return;
      }
      if (!this.frameRatePanel.hidden) {
        event.preventDefault();
        event.stopPropagation();
        this.closeFrameRatePanel();
      } else if (this.viewerOpen) {
        event.preventDefault();
        event.stopPropagation();
        this.closeViewer();
      } else if (!this.contextMenu.hidden) {
        event.preventDefault();
        event.stopPropagation();
        this.closeContextMenu();
      }
    });

    for (const button of this.categoryButtons) {
      button.addEventListener("click", () => {
        this.setCategory(button.dataset.assetCategory);
      });
    }

    this.refreshButton.addEventListener("click", () => {
      this.refresh({ announce: true });
    });
    this.uploadButton.addEventListener("click", () => {
      if (!this.uploadButton.disabled) {
        this.fileInput.click();
      }
    });
    this.fileInput.addEventListener("change", () => {
      const files = [...(this.fileInput.files ?? [])];
      this.fileInput.value = "";
      this.uploadFiles(files);
    });
    this.dialog.addEventListener("dragover", (event) => {
      event.preventDefault();
    });
    this.dialog.addEventListener("drop", (event) => {
      event.preventDefault();
    });
    this.dropZone.addEventListener("dragenter", (event) => {
      if (!this.hasDraggedFiles(event)) {
        return;
      }
      event.preventDefault();
      this.dragDepth += 1;
      this.dropZone.classList.add("is-dragging");
    });
    this.dropZone.addEventListener("dragover", (event) => {
      if (this.hasDraggedFiles(event)) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }
    });
    this.dropZone.addEventListener("dragleave", () => {
      this.dragDepth = Math.max(0, this.dragDepth - 1);
      if (this.dragDepth === 0) {
        this.dropZone.classList.remove("is-dragging");
      }
    });
    this.dropZone.addEventListener("drop", (event) => {
      event.preventDefault();
      this.dragDepth = 0;
      this.dropZone.classList.remove("is-dragging");
      this.uploadFiles([
        ...(event.dataTransfer?.files ?? [])
      ]);
    });

    this.grid.addEventListener("contextmenu", (event) => {
      const card = event.target.closest("[data-asset-file]");
      if (!card) {
        return;
      }
      const asset = (this.assets[this.activeCategory] ?? []).find(
        (candidate) =>
          (candidate.categoryId === "tiled"
            ? candidate.id
            : candidate.fileName) === card.dataset.assetFile
      );
      if (!asset) {
        return;
      }
      event.preventDefault();
      this.openContextMenu(
        asset,
        card,
        event.clientX,
        event.clientY
      );
    });
    this.contextMenu.addEventListener("click", (event) => {
      const action = event.target.closest("[data-asset-action]")
        ?.dataset.assetAction;
      if (!action || !this.contextAsset) {
        return;
      }
      const asset = this.contextAsset;
      const card = this.contextTarget;
      this.closeContextMenu();
      if (action === "view") {
        this.openViewer(asset);
      } else if (action === "rename") {
        this.beginRename(asset, card);
      } else if (action === "delete") {
        this.deleteAsset(asset);
      } else if (action === "frame-rate") {
        this.openFrameRatePanel(asset);
      }
    });

    this.frameRateRange.addEventListener("input", () => {
      this.setPendingFrameRate(this.frameRateRange.value, "range");
    });
    this.frameRateNumber.addEventListener("input", () => {
      this.setPendingFrameRate(
        this.frameRateNumber.value,
        "number"
      );
    });
    this.increaseFrameRateButton.addEventListener("click", () => {
      this.setPendingFrameRate(this.pendingFrameRate + 1, "number");
    });
    this.decreaseFrameRateButton.addEventListener("click", () => {
      this.setPendingFrameRate(this.pendingFrameRate - 1, "number");
    });
    this.confirmFrameRateButton.addEventListener("click", () =>
      this.saveFrameRate()
    );
    this.frameRatePanel.addEventListener("click", (event) => {
      if (event.target === this.frameRatePanel) {
        this.closeFrameRatePanel();
      }
    });

    this.closeViewerButton.addEventListener("click", () =>
      this.closeViewer()
    );
    this.viewerZoomOut.addEventListener("click", () =>
      this.zoomViewer(1 / 1.25)
    );
    this.viewerZoomIn.addEventListener("click", () =>
      this.zoomViewer(1.25)
    );
    this.viewerFit.addEventListener("click", () =>
      this.resetViewer()
    );
    this.viewerCanvas.addEventListener(
      "wheel",
      (event) => {
        if (!this.viewerOpen) {
          return;
        }
        event.preventDefault();
        const factor = Math.exp(-event.deltaY * 0.0015);
        this.zoomViewerAt(
          factor,
          event.clientX,
          event.clientY
        );
      },
      { passive: false }
    );
    this.viewerCanvas.addEventListener("pointerdown", (event) => {
      if (!this.viewerOpen || event.button !== 0) {
        return;
      }
      event.preventDefault();
      this.isPanning = true;
      this.panPointerId = event.pointerId;
      this.panStart = {
        clientX: event.clientX,
        clientY: event.clientY,
        x: this.viewerX,
        y: this.viewerY
      };
      this.viewerCanvas.setPointerCapture(event.pointerId);
      this.viewerCanvas.classList.add("is-dragging");
    });
    this.viewerCanvas.addEventListener("pointermove", (event) => {
      if (
        !this.isPanning ||
        event.pointerId !== this.panPointerId ||
        !this.panStart
      ) {
        return;
      }
      this.viewerX =
        this.panStart.x + event.clientX - this.panStart.clientX;
      this.viewerY =
        this.panStart.y + event.clientY - this.panStart.clientY;
      this.applyViewerTransform();
    });
    const finishPan = (event) => {
      if (event.pointerId !== this.panPointerId) {
        return;
      }
      this.isPanning = false;
      this.panPointerId = null;
      this.panStart = null;
      this.viewerCanvas.classList.remove("is-dragging");
      if (this.viewerCanvas.hasPointerCapture(event.pointerId)) {
        this.viewerCanvas.releasePointerCapture(event.pointerId);
      }
    };
    this.viewerCanvas.addEventListener(
      "pointerup",
      finishPan
    );
    this.viewerCanvas.addEventListener(
      "pointercancel",
      finishPan
    );
    this.viewerCanvas.addEventListener("dblclick", () =>
      this.resetViewer()
    );
    window.addEventListener("resize", () =>
      this.closeContextMenu()
    );
  }

  hasDraggedFiles(event) {
    return [...(event.dataTransfer?.types ?? [])].includes(
      "Files"
    );
  }

  async open() {
    if (!this.dialog.open) {
      this.dialog.showModal();
    }
    await this.refresh();
  }

  close() {
    if (this.dialog.open) {
      this.dialog.close();
    }
  }

  setCategory(categoryId) {
    if (!CATEGORY_META[categoryId]) {
      return;
    }
    this.cancelRename({ rerender: false });
    this.closeContextMenu();
    this.activeCategory = categoryId;
    this.syncUploadConstraints();
    this.render();
    const count = this.assets[categoryId]?.length ?? 0;
    this.setStatus(
      count > 0
        ? `当前分类有 ${count} 个素材。`
        : categoryId === "tiled"
          ? "当前分类还没有素材，可导入包含 JSON/TMJ、TSX 与图片的文件夹。"
          : "当前分类还没有素材，可以拖入图片或点击上传。"
    );
  }

  setBusy() {
    const busy =
      this.isLoading ||
      this.isUploading ||
      this.isDeleting ||
      this.isRenaming;
    this.dialog.setAttribute("aria-busy", String(busy));
    this.refreshButton.disabled = busy;
    this.uploadButton.disabled =
      busy || !this.apiAvailable || this.isLoading;
    this.uploadButton.textContent = this.isUploading
      ? "正在上传…"
      : "上传素材";
    this.tiledImporter.setBusy(this.isUploading);
    this.tiledImporter.setAvailability(this.apiAvailable);
  }

  getActiveCategoryMeta() {
    return (
      this.categoryMeta[this.activeCategory] ??
      CATEGORY_META[this.activeCategory]
    );
  }

  syncUploadConstraints() {
    const meta = this.getActiveCategoryMeta();
    const extensions =
      meta?.allowedExtensions ?? ALL_IMAGE_EXTENSIONS;
    const isTiledMap = this.activeCategory === "tiled";
    this.uploadButton.hidden = isTiledMap;
    this.tiledImporter.setVisible(isTiledMap);
    this.fileInput.accept = extensions.join(",");
    if (this.supportedFormats) {
      this.supportedFormats.textContent =
        this.activeCategory === "tiled"
          ? `文件夹导入支持 JSON/TMJ、TSX 与图片 · 单个不超过 ${formatBytes(
              this.maxFileBytes
            )}`
          : `支持 ${formatExtensionLabel(extensions)} · 单个不超过 ${formatBytes(
              this.maxFileBytes
            )}`;
    }
  }

  setStatus(message, isError = false) {
    this.status.textContent = message;
    this.status.classList.toggle("is-error", isError);
  }

  openContextMenu(asset, card, clientX, clientY) {
    this.closeContextMenu();
    this.contextAsset = asset;
    this.contextTarget = card;
    card.classList.add("is-context-target");
    const supportsFrameRate =
      asset.categoryId === "entity" && asset.isSpriteSheet;
    this.frameRateAction.hidden = !supportsFrameRate;
    this.renameAction.hidden = asset.categoryId === "tiled";
    this.contextFrameRate.textContent =
      `${asset.frameRate ?? 8} FPS · ${asset.frameCount ?? 1} 帧`;
    this.contextMenu.hidden = false;

    const menuRect = this.contextMenu.getBoundingClientRect();
    const dialogRect = this.dialog.getBoundingClientRect();
    const margin = 8;
    const maxLeft =
      dialogRect.right - menuRect.width - margin;
    const maxTop =
      dialogRect.bottom - menuRect.height - margin;
    const left = Math.max(
      dialogRect.left + margin,
      Math.min(clientX, maxLeft)
    );
    const preferredTop =
      clientY + menuRect.height > dialogRect.bottom
        ? clientY - menuRect.height
        : clientY;
    const top = Math.max(
      dialogRect.top + margin,
      Math.min(preferredTop, maxTop)
    );

    this.contextMenu.style.left = `${Math.round(left)}px`;
    this.contextMenu.style.top = `${Math.round(top)}px`;
    requestAnimationFrame(() => {
      const firstVisible = this.contextActions.find(
        (action) => !action.hidden
      );
      firstVisible?.focus({ preventScroll: true });
    });
  }

  closeContextMenu() {
    this.contextTarget?.classList.remove(
      "is-context-target"
    );
    this.contextTarget = null;
    this.contextAsset = null;
    this.contextMenu.hidden = true;
  }

  beginRename(asset, card) {
    if (
      !asset ||
      !card ||
      !this.apiAvailable ||
      this.isLoading ||
      this.isUploading ||
      this.isDeleting ||
      this.isRenaming
    ) {
      return;
    }
    this.cancelRename({ rerender: false });

    const nameRow = card.querySelector(".asset-name-row");
    if (!nameRow) {
      return;
    }
    const parts = splitAssetFileName(asset.fileName);
    const input = document.createElement("input");
    input.className = "asset-rename-input";
    input.type = "text";
    input.value = parts.stem;
    input.maxLength = 100;
    input.spellcheck = false;
    input.autocomplete = "off";
    input.setAttribute(
      "aria-label",
      `重命名 ${asset.fileName}，文件后缀不可修改`
    );
    const extension = document.createElement("span");
    extension.className = "asset-file-extension";
    extension.textContent = parts.extension;
    nameRow.replaceChildren(input, extension);

    const editor = {
      asset,
      card,
      input,
      extension: parts.extension,
      originalFileName: asset.fileName,
      saving: false
    };
    this.renameEditor = editor;
    card.classList.add("is-renaming");
    this.setStatus(
      `正在重命名 ${asset.fileName} · Enter 保存 · Esc 取消`
    );

    input.addEventListener("keydown", (event) => {
      if (event.isComposing || event.keyCode === 229) {
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        this.commitRename({ keepEditingOnInvalid: true });
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        this.cancelRename();
      }
    });
    input.addEventListener("input", () => {
      input.classList.remove("is-invalid");
      this.setStatus(
        `正在重命名 ${asset.fileName} · Enter 保存 · Esc 取消`
      );
    });
    input.addEventListener("blur", () => {
      if (this.renameEditor === editor && !editor.saving) {
        this.commitRename();
      }
    });

    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  }

  cancelRename({ rerender = true } = {}) {
    if (!this.renameEditor) {
      return;
    }
    this.renameEditor = null;
    if (rerender) {
      this.render();
    }
  }

  showRenameError(message, { keepEditing = false } = {}) {
    this.setStatus(`重命名失败：${message}`, true);
    this.showNotification(`重命名失败：${message}`, true);
    const editor = this.renameEditor;
    if (!editor) {
      return;
    }
    editor.input.classList.add("is-invalid");
    if (keepEditing) {
      requestAnimationFrame(() => {
        editor.input.focus();
        editor.input.select();
      });
    } else {
      this.cancelRename();
    }
  }

  async commitRename({ keepEditingOnInvalid = false } = {}) {
    const editor = this.renameEditor;
    if (!editor || editor.saving) {
      return;
    }

    const stem = editor.input.value
      .trim()
      .replace(/\s+/g, " ");
    if (!stem) {
      this.showRenameError("名称不能为空", {
        keepEditing: keepEditingOnInvalid
      });
      return;
    }
    if (
      /[<>:"/\\|?*\u0000-\u001f]/.test(stem) ||
      stem.startsWith(".") ||
      stem.endsWith(".")
    ) {
      this.showRenameError(
        "名称不能包含路径字符，也不能以句点开头或结尾",
        { keepEditing: keepEditingOnInvalid }
      );
      return;
    }

    const nextFileName = `${stem}${editor.extension}`;
    if (nextFileName === editor.originalFileName) {
      this.cancelRename();
      this.setStatus(`素材名称未改变：${editor.originalFileName}`);
      return;
    }

    editor.saving = true;
    this.isRenaming = true;
    editor.input.disabled = true;
    editor.card.classList.add("is-saving");
    this.setBusy();
    this.setStatus(`正在保存名称：${nextFileName}`);

    const isTiledMap = editor.asset.categoryId === "tiled";
    const query = new URLSearchParams({
      category: editor.asset.categoryId,
      filename: isTiledMap
        ? editor.asset.id
        : editor.originalFileName
    });
    let renamed = false;
    try {
      const response = await fetch(
        `/api/assets?${query.toString()}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            action: "rename",
            newFileName: isTiledMap ? stem : nextFileName,
            ...(isTiledMap ? { assetId: editor.asset.id } : {})
          })
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          payload.error ?? `重命名失败（${response.status}）`
        );
      }
      renamed = true;
    } catch (error) {
      if (this.renameEditor === editor) {
        editor.saving = false;
        editor.input.disabled = false;
        editor.card.classList.remove("is-saving");
        this.setStatus(`重命名失败：${error.message}`, true);
        this.showNotification(
          `重命名失败：${error.message}`,
          true
        );
        editor.input.classList.add("is-invalid");
      }
    } finally {
      this.isRenaming = false;
      this.setBusy();
    }

    if (renamed) {
      const previousFileName = editor.originalFileName;
      this.renameEditor = null;
      await this.refresh();
      this.setStatus(
        `已将 ${previousFileName} 重命名为 ${nextFileName}`
      );
      this.showNotification("素材名称已修改");
    }
  }

  openFrameRatePanel(asset) {
    if (!asset?.isSpriteSheet) {
      return;
    }
    this.frameRateAsset = asset;
    const frameRate = Math.max(
      1,
      Math.min(60, Number(asset.frameRate) || 8)
    );
    this.frameRateName.textContent = asset.fileName;
    this.frameRateDetail.textContent =
      `${asset.frameCount} 帧 · 帧宽 ${asset.frameWidth}px · 帧高 ${asset.frameHeight}px`;
    this.frameRateRange.value = String(frameRate);
    this.frameRateNumber.value = String(frameRate);
    this.pendingFrameRate = frameRate;
    this.frameRatePreviewAnimator?.stop();
    this.frameRatePreviewAnimator = new SpriteSheetAnimator(
      this.frameRatePreview,
      { ...asset, frameRate }
    );
    this.frameRatePreviewAnimator
      .start()
      .catch((error) =>
        console.warn("帧速预览加载失败", error)
      );
    this.frameRatePanel.hidden = false;
    requestAnimationFrame(() =>
      this.frameRateRange.focus({ preventScroll: true })
    );
  }

  closeFrameRatePanel({ restore = true } = {}) {
    this.frameRatePreviewAnimator?.stop();
    this.frameRatePreviewAnimator = null;
    if (restore && this.frameRateAsset) {
      this.setCardAnimatorFrameRate(
        this.frameRateAsset.fileName,
        this.frameRateAsset.frameRate
      );
    }
    this.frameRatePanel.hidden = true;
    this.frameRateAsset = null;
  }

  setPendingFrameRate(value, source = "range") {
    const frameRate = Math.min(
      60,
      Math.max(1, Math.round(Number(value) || 1))
    );
    this.pendingFrameRate = frameRate;
    if (source !== "range") {
      this.frameRateRange.value = String(frameRate);
    }
    if (source !== "number") {
      this.frameRateNumber.value = String(frameRate);
    }
    this.frameRatePreviewAnimator?.setFrameRate(frameRate);
    if (this.frameRateAsset) {
      this.setCardAnimatorFrameRate(
        this.frameRateAsset.fileName,
        frameRate
      );
    }
  }

  setCardAnimatorFrameRate(fileName, frameRate) {
    for (const animator of this.animators) {
      if (animator.assetFileName === fileName) {
        animator.setFrameRate(frameRate);
      }
    }
  }

  async saveFrameRate() {
    const asset = this.frameRateAsset;
    if (!asset) {
      return;
    }
    const frameRate = this.pendingFrameRate;
    const query = new URLSearchParams({
      category: asset.categoryId,
      filename:
        asset.categoryId === "tiled"
          ? asset.id
          : asset.fileName
    });
    this.confirmFrameRateButton.disabled = true;
    this.confirmFrameRateButton.textContent = "正在保存…";

    try {
      const response = await fetch(
        `/api/assets?${query.toString()}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ frameRate })
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          payload.error ?? `帧速保存失败（${response.status}）`
        );
      }
      asset.frameRate = frameRate;
      this.closeFrameRatePanel({ restore: false });
      this.render();
      this.setStatus(
        `已将 ${asset.fileName} 的帧速调整为 ${frameRate} FPS`
      );
      this.showNotification(`帧速已调整为 ${frameRate} FPS`);
    } catch (error) {
      this.setStatus(`帧速保存失败：${error.message}`, true);
      this.showNotification(
        `帧速保存失败：${error.message}`,
        true
      );
    } finally {
      this.confirmFrameRateButton.disabled = false;
      this.confirmFrameRateButton.textContent = "确认";
    }
  }

  openViewer(asset) {
    this.closeContextMenu();
    this.viewerSpriteAnimator?.stop();
    this.viewerSpriteAnimator = null;
    this.viewerAsset = asset;
    this.viewerOpen = true;
    this.viewerName.textContent = asset.fileName;
    if (asset.categoryId === "tiled") {
      this.viewerMeta.textContent =
        `Tiled JSON · ${asset.sourceWidth} × ${asset.sourceHeight} · ` +
        `${asset.tileWidth} × ${asset.tileHeight} 瓦片 · ` +
        `${asset.collisionCount ?? 0} 个碰撞 · 滚轮缩放 · 拖动平移 · 双击复位`;
      this.viewerImage.hidden = false;
      this.viewerSprite.hidden = true;
      this.viewerImage.src = tiledMapPreviewDataUrl(asset);
      this.viewerImage.alt = asset.fileName;
      this.viewer.hidden = false;
      this.resetViewer();
      requestAnimationFrame(() =>
        this.closeViewerButton.focus({ preventScroll: true })
      );
      return;
    }
    const animationDetail = asset.isSpriteSheet
      ? ` · ${asset.frameCount} 帧 · ${asset.frameRate} FPS`
      : "";
    this.viewerMeta.textContent = `${
      this.categoryMeta[asset.categoryId]?.label ?? "地图"
    } · ${formatBytes(asset.size)}${animationDetail} · 滚轮缩放 · 拖动平移 · 双击复位`;
    this.viewerImage.hidden = Boolean(asset.isSpriteSheet);
    this.viewerSprite.hidden = !asset.isSpriteSheet;
    if (asset.isSpriteSheet) {
      this.viewerSpriteAnimator = new SpriteSheetAnimator(
        this.viewerSprite,
        asset
      );
      this.viewerSpriteAnimator
        .start()
        .catch((error) =>
          console.warn("动画素材查看器加载失败", error)
        );
      this.viewerImage.removeAttribute("src");
    } else {
      this.viewerImage.src = asset.url;
      this.viewerImage.alt = asset.fileName;
    }
    this.viewer.hidden = false;
    this.resetViewer();
    requestAnimationFrame(() =>
      this.closeViewerButton.focus({ preventScroll: true })
    );
  }

  closeViewer() {
    if (this.viewer.hidden && !this.viewerOpen) {
      return;
    }
    this.viewerOpen = false;
    this.isPanning = false;
    this.panPointerId = null;
    this.panStart = null;
    this.viewerCanvas.classList.remove("is-dragging");
    this.viewer.hidden = true;
    this.viewerSpriteAnimator?.stop();
    this.viewerSpriteAnimator = null;
    this.viewerImage.removeAttribute("src");
    this.viewerImage.alt = "";
    this.viewerSprite.hidden = true;
    this.viewerImage.hidden = false;
    this.viewerAsset = null;
  }

  resetViewer() {
    if (!this.viewerOpen) {
      return;
    }
    this.viewerScale = 1;
    this.viewerX = 0;
    this.viewerY = 0;
    this.applyViewerTransform();
  }

  applyViewerTransform() {
    const transform =
      `translate(${this.viewerX}px, ${this.viewerY}px) ` +
      `scale(${this.viewerScale})`;
    this.viewerImage.style.transform = transform;
    this.viewerSprite.style.transform = transform;
    this.viewerZoom.textContent =
      `${Math.round(this.viewerScale * 100)}%`;
  }

  zoomViewer(factor) {
    if (!this.viewerOpen) {
      return;
    }
    const rect = this.viewerCanvas.getBoundingClientRect();
    this.zoomViewerAt(
      factor,
      rect.left + rect.width / 2,
      rect.top + rect.height / 2
    );
  }

  zoomViewerAt(factor, clientX, clientY) {
    if (!this.viewerOpen || !Number.isFinite(factor)) {
      return;
    }
    const currentScale = this.viewerScale;
    const nextScale = Math.min(
      MAX_VIEWER_SCALE,
      Math.max(MIN_VIEWER_SCALE, currentScale * factor)
    );
    if (Math.abs(nextScale - currentScale) < 0.0001) {
      return;
    }

    const rect = this.viewerCanvas.getBoundingClientRect();
    const pointerX =
      clientX - (rect.left + rect.width / 2);
    const pointerY =
      clientY - (rect.top + rect.height / 2);
    const ratio = nextScale / currentScale;
    this.viewerX =
      pointerX - (pointerX - this.viewerX) * ratio;
    this.viewerY =
      pointerY - (pointerY - this.viewerY) * ratio;
    this.viewerScale = nextScale;
    this.applyViewerTransform();
  }

  stopPreviewAnimators() {
    this.previewGeneration += 1;
    for (const animator of this.animators) {
      animator.stop();
    }
    this.animators.clear();
  }

  startPreviewAnimators() {
    this.stopPreviewAnimators();
    const generation = this.previewGeneration;
    const assets = this.assets[this.activeCategory] ?? [];
    for (const canvas of this.grid.querySelectorAll(
      "[data-image-preview]"
    )) {
      const asset = assets.find(
        (item) =>
          item.fileName === canvas.dataset.imagePreview
      );
      if (!asset) {
        continue;
      }
      const thumbnail = new ImageThumbnail(canvas, asset);
      thumbnail.start().catch((error) => {
        console.warn("素材缩略图加载失败", error);
      });
    }
    for (const canvas of this.grid.querySelectorAll(
      "[data-tiled-preview]"
    )) {
      const asset = assets.find(
        (item) => item.id === canvas.dataset.tiledPreview
      );
      if (!asset) {
        continue;
      }
      const thumbnail = new TiledMapThumbnail(canvas, asset);
      thumbnail.start().catch((error) => {
        canvas.dataset.previewError = "true";
        console.warn("Tiled 地图缩略图加载失败", error);
      });
    }
    for (const canvas of this.grid.querySelectorAll(
      "[data-sprite-preview]"
    )) {
      const asset = assets.find(
        (item) =>
          item.fileName === canvas.dataset.spritePreview
      );
      if (!asset?.isSpriteSheet) {
        continue;
      }
      loadAssetImage(asset.url)
        .then((image) => {
          if (
            generation !== this.previewGeneration ||
            !canvas.isConnected
          ) {
            return null;
          }
          const contentBounds = getOpaqueContentBounds(
            image,
            asset
          );
          const animator = new SpriteSheetAnimator(canvas, {
            ...asset,
            contentBounds
          });
          animator.assetFileName = asset.fileName;
          this.animators.add(animator);
          return animator.start();
        })
        .catch((error) => {
          console.warn("动画素材预览加载失败", error);
        });
    }
  }

  renderCategoryButtons() {
    for (const button of this.categoryButtons) {
      const categoryId = button.dataset.assetCategory;
      const count = this.assets[categoryId]?.length ?? 0;
      button.classList.toggle(
        "is-active",
        categoryId === this.activeCategory
      );
      const countElement = button.querySelector(
        "[data-asset-count]"
      );
      if (countElement) {
        countElement.textContent = String(count);
      }
    }
  }

  render() {
    this.closeContextMenu();
    this.stopPreviewAnimators();
    const meta =
      this.categoryMeta[this.activeCategory] ??
      CATEGORY_META[this.activeCategory];
    const assets = this.assets[this.activeCategory] ?? [];
    this.syncUploadConstraints();
    this.renderCategoryButtons();
    this.breadcrumb.textContent = `${meta.parentLabel} / ${meta.label}`;
    this.categoryTitle.textContent = `${meta.label}素材`;
    this.dropHint.textContent =
      this.activeCategory === "tiled"
        ? "使用“导入文件夹”读取 JSON/TMJ、TSX 与图片；名称取对应 JSON/TMJ 文件名"
        : meta.allowedExtensions?.length === 1
          ? `仅支持 PNG 图片 · 右键素材可查看、重命名或删除`
          : "将图片拖到这里，或点击“上传素材” · 右键素材可查看、重命名或删除";

    if (!this.apiAvailable) {
      this.grid.innerHTML = "";
      this.emptyState.hidden = false;
      this.emptyTitle.textContent = "素材库服务未连接";
      this.emptyDescription.textContent =
        "请通过 npm start 启动编辑器后重试。";
      return;
    }

    if (assets.length === 0) {
      this.grid.innerHTML = "";
      this.emptyState.hidden = false;
      this.emptyTitle.textContent = `还没有${meta.label}素材`;
      this.emptyDescription.textContent =
        this.activeCategory === "tiled"
          ? "使用右上角“导入文件夹”选择 Tiled 地图项目。"
          : "将图片拖到这里，或使用右上角“上传素材”。";
      return;
    }

    this.emptyState.hidden = true;
    this.grid.innerHTML = assets
      .map((asset) => {
        const nameParts = splitAssetFileName(asset.fileName);
        let preview;
        if (asset.categoryId === "tiled") {
          preview = `
            <canvas
              class="asset-tiled-canvas"
              data-tiled-preview="${escapeHtml(asset.id)}"
              aria-label="${escapeHtml(asset.fileName)} 地图预览"
            ></canvas>
          `;
        } else if (asset.isSpriteSheet) {
          preview = `
            <canvas
              class="asset-sprite-canvas"
              data-sprite-preview="${escapeHtml(asset.fileName)}"
              aria-label="${escapeHtml(asset.fileName)} 动画预览"
            ></canvas>
          `;
        } else if (usesNativeImagePreview(asset)) {
          preview = `
            <img
              src="${escapeHtml(asset.url)}"
              alt="${escapeHtml(asset.fileName)}"
              loading="lazy"
            />
          `;
        } else {
          preview = `
            <canvas
              class="asset-image-canvas"
              data-image-preview="${escapeHtml(asset.fileName)}"
              aria-label="${escapeHtml(asset.fileName)} 图片预览"
            ></canvas>
          `;
        }
        return `
          <article class="asset-card" data-asset-file="${escapeHtml(
            asset.categoryId === "tiled"
              ? asset.id
              : asset.fileName
          )}" title="${escapeHtml(
            `${asset.fileName} · 右键查看更多操作`
          )}">
            <div class="asset-preview">
              ${preview}
              <span class="asset-extension">${escapeHtml(
                asset.categoryId === "tiled"
                  ? "TILED"
                  : asset.fileName
                      .split(".")
                      .at(-1)
                      ?.toUpperCase() ?? ""
              )}${asset.isSpriteSheet ? ` · ${asset.frameCount} 帧` : ""}${
                asset.categoryId === "tiled"
                  ? ` · ${asset.collisionCount ?? 0} 碰撞`
                  : ""
              }</span>
            </div>
            <div class="asset-card-copy">
              <div class="asset-name-row">
                <strong class="asset-file-name" title="${escapeHtml(
                  asset.fileName
                )}">${escapeHtml(nameParts.stem)}</strong><span class="asset-file-extension">${escapeHtml(
                  nameParts.extension
                )}</span>
              </div>
              <small>${
                asset.categoryId === "tiled"
                  ? `${asset.tileWidth ?? 0} × ${
                      asset.tileHeight ?? 0
                    } 瓦片 · `
                  : `${formatBytes(asset.size)} · `
              }${escapeHtml(formatDate(asset.modifiedAt))}</small>
            </div>
          </article>
        `;
      })
      .join("");
    this.startPreviewAnimators();
  }

  async refresh({ announce = false } = {}) {
    if (this.isLoading || this.isUploading || this.isDeleting) {
      return;
    }
    this.isLoading = true;
    this.grid.setAttribute("aria-busy", "true");
    this.setStatus("正在读取工作区素材…");
    this.emptyState.hidden = true;
    this.grid.innerHTML =
      '<div class="asset-loading">正在载入素材…</div>';
    this.setBusy();

    try {
      const response = await fetch("/api/assets", {
        cache: "no-store"
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          payload.error ?? `素材接口返回 ${response.status}`
        );
      }

      this.apiAvailable = true;
      this.assets = payload.assets ?? {};
      this.maxFileBytes =
        Number(payload.maxFileBytes) || DEFAULT_MAX_FILE_BYTES;
      for (const group of payload.categories ?? []) {
        for (const category of group.children ?? []) {
          this.categoryMeta[category.id] = {
            parentLabel: group.label,
            label: category.label,
            allowedExtensions:
              category.allowedExtensions ??
              ALL_IMAGE_EXTENSIONS
          };
        }
      }
      this.storagePath.textContent = `存储位置：${
        payload.storageRoot ?? "当前工作区"
      }`;
      this.apiState.textContent = "本地工作区";
      this.apiState.className = "asset-api-state is-connected";
      this.render();

      const count = this.assets[this.activeCategory]?.length ?? 0;
      this.setStatus(
        count > 0
          ? `已载入 ${count} 个${this.categoryMeta[this.activeCategory].label}素材。`
          : `当前分类还没有${this.categoryMeta[this.activeCategory].label}素材。`
      );
      if (announce) {
        this.showNotification("素材库已刷新");
      }
    } catch (error) {
      this.apiAvailable = false;
      this.assets = {};
      this.storagePath.textContent =
        "存储位置：当前工作区 / assets";
      this.apiState.textContent = "未连接";
      this.apiState.className = "asset-api-state is-offline";
      this.dropHint.textContent =
        "启动本地编辑器服务后可上传素材";
      this.render();
      this.setStatus(`读取失败：${error.message}`, true);
      if (announce) {
        this.showNotification(
          `素材库读取失败：${error.message}`,
          true
        );
      }
    } finally {
      this.isLoading = false;
      this.grid.setAttribute("aria-busy", "false");
      this.setBusy();
    }
  }

  validateFile(file) {
    const meta = this.getActiveCategoryMeta();
    const allowedExtensions =
      meta?.allowedExtensions ?? ALL_IMAGE_EXTENSIONS;
    const extension = file.name.includes(".")
      ? `.${file.name.split(".").at(-1).toLowerCase()}`
      : "";
    if (!allowedExtensions.includes(extension)) {
      return `${meta?.label ?? "当前分类"}仅支持 ${formatExtensionLabel(
        allowedExtensions
      )} 图片`;
    }
    if (file.size === 0) {
      return "文件内容为空";
    }
    if (file.size > this.maxFileBytes) {
      return `文件超过 ${formatBytes(this.maxFileBytes)}`;
    }
    return "";
  }

  async deleteAsset(asset) {
    if (!asset || !this.apiAvailable) {
      this.showNotification(
        "素材库服务未连接，无法删除素材。",
        true
      );
      return;
    }
    if (
      !window.confirm(
        `确定删除素材“${asset.fileName}”吗？删除后无法恢复。`
      )
    ) {
      return;
    }

    const query = new URLSearchParams({
      category: asset.categoryId
    });
    if (asset.categoryId === "tiled") {
      query.set("assetId", asset.id);
    } else {
      query.set("filename", asset.fileName);
    }
    this.isDeleting = true;
    this.setBusy();
    this.setStatus(`正在删除：${asset.fileName}`);
    let deleted = false;

    try {
      const response = await fetch(
        `/api/assets?${query.toString()}`,
        { method: "DELETE" }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          payload.error ?? `删除失败（${response.status}）`
        );
      }
      deleted = true;
    } catch (error) {
      this.setStatus(`删除失败：${error.message}`, true);
      this.showNotification(
        `删除失败：${error.message}`,
        true
      );
    } finally {
      this.isDeleting = false;
      this.setBusy();
    }

    if (deleted) {
      await this.refresh();
      this.setStatus(`已删除素材：${asset.fileName}`);
      this.showNotification("素材已删除");
    }
  }

  async uploadFiles(files) {
    if (!this.apiAvailable) {
      this.showNotification(
        "素材库服务未连接，请通过 npm start 启动编辑器。",
        true
      );
      return;
    }
    if (this.isUploading || files.length === 0) {
      return;
    }
    if (this.activeCategory === "tiled") {
      this.showNotification(
        "请使用“导入文件夹”选择 Tiled 地图项目。",
        true
      );
      return;
    }

    const errors = [];
    let uploaded = 0;
    const targetCategory = this.activeCategory;
    this.isUploading = true;
    this.setBusy();

    try {
      for (const [index, file] of files.entries()) {
        const validationError = this.validateFile(file);
        if (validationError) {
          errors.push(`${file.name}：${validationError}`);
          continue;
        }

        this.setStatus(
          `正在上传 ${index + 1}/${files.length}：${file.name}`
        );
        const query = new URLSearchParams({
          category: targetCategory,
          filename: file.name
        });

        try {
          const response = await fetch(
            `/api/assets?${query.toString()}`,
            {
              method: "POST",
              headers: {
                "Content-Type":
                  file.type || "application/octet-stream"
              },
              body: file
            }
          );
          const payload = await response
            .json()
            .catch(() => ({}));
          if (!response.ok) {
            throw new Error(
              payload.error ?? `上传失败（${response.status}）`
            );
          }
          uploaded += 1;
        } catch (error) {
          errors.push(`${file.name}：${error.message}`);
        }
      }
    } finally {
      this.isUploading = false;
      this.setBusy();
    }

    await this.refresh();
    if (uploaded > 0) {
      this.setStatus(
        `已上传 ${uploaded} 个素材到 ${
          this.categoryMeta[targetCategory].label
        }。`
      );
      this.showNotification(`已上传 ${uploaded} 个素材`);
    }
    if (errors.length > 0) {
      this.setStatus(
        `${uploaded > 0 ? `已上传 ${uploaded} 个；` : ""}${errors.join("；")}`,
        true
      );
      this.showNotification(
        `${errors.length} 个文件上传失败`,
        true
      );
    }
  }

  showNotification(message, isError = false) {
    this.onNotify(message, isError);
  }
}
