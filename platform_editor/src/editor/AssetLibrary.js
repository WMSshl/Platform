import { SpriteSheetAnimator } from "./SpriteSheetAnimator.js";

const DEFAULT_MAX_FILE_BYTES = 20 * 1024 * 1024;
const SUPPORTED_EXTENSION = /\.(gif|jpe?g|png|svg|webp)$/i;
const MIN_VIEWER_SCALE = 0.2;
const MAX_VIEWER_SCALE = 8;
const CATEGORY_META = {
  background: {
    parentLabel: "地图",
    label: "背景"
  },
  entity: {
    parentLabel: "地图",
    label: "动画"
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
    this.viewerSpriteAnimator = null;
    this.frameRatePreviewAnimator = null;
    this.frameRateAsset = null;
    this.pendingFrameRate = 8;
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
      this.dragDepth = 0;
      this.dropZone.classList.remove("is-dragging");
      this.closeContextMenu();
      this.closeViewer();
      this.closeFrameRatePanel();
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
          candidate.fileName === card.dataset.assetFile
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
      this.closeContextMenu();
      if (action === "view") {
        this.openViewer(asset);
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
    this.closeContextMenu();
    this.activeCategory = categoryId;
    this.render();
    const count = this.assets[categoryId]?.length ?? 0;
    this.setStatus(
      count > 0
        ? `当前分类有 ${count} 个素材。`
        : "当前分类还没有素材，可以拖入图片或点击上传。"
    );
  }

  setBusy() {
    const busy =
      this.isLoading || this.isUploading || this.isDeleting;
    this.dialog.setAttribute("aria-busy", String(busy));
    this.refreshButton.disabled = busy;
    this.uploadButton.disabled =
      busy || !this.apiAvailable || this.isLoading;
    this.uploadButton.textContent = this.isUploading
      ? "正在上传…"
      : "上传素材";
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
      filename: asset.fileName
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
    for (const animator of this.animators) {
      animator.stop();
    }
    this.animators.clear();
  }

  startPreviewAnimators() {
    this.stopPreviewAnimators();
    const assets = this.assets[this.activeCategory] ?? [];
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
      const animator = new SpriteSheetAnimator(canvas, asset);
      animator.assetFileName = asset.fileName;
      this.animators.add(animator);
      animator.start().catch((error) => {
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
    this.renderCategoryButtons();
    this.breadcrumb.textContent = `${meta.parentLabel} / ${meta.label}`;
    this.categoryTitle.textContent = `${meta.label}素材`;

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
        "将图片拖到这里，或使用右上角“上传素材”。";
      return;
    }

    this.emptyState.hidden = true;
    this.grid.innerHTML = assets
      .map((asset) => {
        const preview = asset.isSpriteSheet
          ? `
            <canvas
              class="asset-sprite-canvas"
              data-sprite-preview="${escapeHtml(asset.fileName)}"
              aria-label="${escapeHtml(asset.fileName)} 动画预览"
            ></canvas>
          `
          : `
            <img src="${escapeHtml(
              asset.url
            )}" alt="${escapeHtml(
              asset.fileName
            )}" loading="lazy" />
          `;
        return `
          <article class="asset-card" data-asset-file="${escapeHtml(
            asset.fileName
          )}" title="${escapeHtml(
            `${asset.fileName} · 右键查看更多操作`
          )}">
            <div class="asset-preview">
              ${preview}
              <span class="asset-extension">${escapeHtml(
                asset.fileName.split(".").at(-1)?.toUpperCase() ??
                  ""
              )}${asset.isSpriteSheet ? ` · ${asset.frameCount} 帧` : ""}</span>
            </div>
            <div class="asset-card-copy">
              <strong>${escapeHtml(asset.fileName)}</strong>
              <small>${formatBytes(asset.size)} · ${escapeHtml(
                formatDate(asset.modifiedAt)
              )}</small>
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
            label: category.label
          };
        }
      }
      this.storagePath.textContent = `存储位置：${
        payload.storageRoot ?? "当前工作区"
      }`;
      this.apiState.textContent = "本地工作区";
      this.apiState.className = "asset-api-state is-connected";
      this.dropHint.textContent =
        "将图片拖到这里，或点击“上传素材” · 右键素材可查看或删除";
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
    if (!SUPPORTED_EXTENSION.test(file.name)) {
      return "仅支持 PNG、JPG、WebP、GIF 和 SVG 图片";
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
      category: asset.categoryId,
      filename: asset.fileName
    });
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
