import { SpriteSheetAnimator } from "./SpriteSheetAnimator.js";
import {
  getOpaqueContentBounds,
  ImageThumbnail,
  loadAssetImage
} from "./AssetThumbnail.js";
import { TiledMapImportController } from "./TiledMapImportController.js";
import { TiledMapThumbnail } from "./TiledMapThumbnail.js";
import { buildFolderBreadcrumbPath } from "./folder-breadcrumb.js";

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
    groupLabel: "关卡背景",
    label: "静态背景",
    allowedExtensions: ALL_IMAGE_EXTENSIONS
  },
  entity: {
    label: "动画",
    allowedExtensions: ALL_IMAGE_EXTENSIONS
  },
  static: {
    label: "静态贴图",
    allowedExtensions: [".png"]
  },
  tiled: {
    groupLabel: "关卡背景",
    label: "Tiled 背景",
    allowedExtensions: TILED_EXTENSIONS
  },
  sfx: {
    groupLabel: "音效",
    label: "短音效",
    kind: "audio",
    allowedExtensions: [".wav", ".ogg", ".mp3"]
  },
  ambient: {
    groupLabel: "音效",
    label: "环境音",
    kind: "audio",
    allowedExtensions: [".wav", ".ogg", ".mp3"]
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

function getAssetDisplayName(asset) {
  return asset.displayName ?? asset.fileName;
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

function isAudioAsset(asset) {
  return String(asset?.mimeType ?? "").startsWith("audio/");
}

function formatAudioTime(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(
    total % 60
  ).padStart(2, "0")}`;
}

function getAudioFormatLabel(asset) {
  if (asset?.audioFormat) {
    return asset.audioFormat;
  }
  const extension = String(asset?.fileName ?? "")
    .split(".")
    .at(-1)
    ?.toUpperCase();
  return ["WAV", "OGG", "MP3"].includes(extension)
    ? extension
    : "音频";
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
    this.conflictPanel = document.getElementById(
      "asset-name-conflict-panel"
    );
    this.conflictTitle = document.getElementById(
      "asset-name-conflict-title"
    );
    this.conflictDescription = document.getElementById(
      "asset-name-conflict-description"
    );
    this.conflictInput = document.getElementById(
      "asset-name-conflict-input"
    );
    this.nameFixedSuffix = document.getElementById(
      "asset-name-fixed-suffix"
    );
    this.conflictCancel = document.getElementById(
      "asset-name-conflict-cancel"
    );
    this.conflictRename = document.getElementById(
      "asset-name-conflict-rename"
    );
    this.conflictOverwrite = document.getElementById(
      "asset-name-conflict-overwrite"
    );
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
    this.viewerTiled = document.getElementById(
      "asset-viewer-tiled"
    );
    this.viewerSprite = document.getElementById(
      "asset-viewer-sprite"
    );
    this.viewerAudio = document.getElementById(
      "asset-viewer-audio"
    );
    this.audioPlayer = document.getElementById(
      "asset-audio-player"
    );
    this.audioPlayButton = document.getElementById(
      "asset-audio-play"
    );
    this.audioSeek = document.getElementById("asset-audio-seek");
    this.audioCurrent = document.getElementById(
      "asset-audio-current"
    );
    this.audioDuration = document.getElementById(
      "asset-audio-duration"
    );
    this.audioRewind = document.getElementById(
      "asset-audio-rewind"
    );
    this.audioForward = document.getElementById(
      "asset-audio-forward"
    );
    this.audioMute = document.getElementById(
      "asset-audio-mute"
    );
    this.audioVolume = document.getElementById(
      "asset-audio-volume"
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
    this.newFolderAction = this.contextMenu.querySelector(
      '[data-asset-action="new-folder"]'
    );
    this.renameFolderAction = this.contextMenu.querySelector(
      '[data-asset-action="rename-folder"]'
    );
    this.deleteFolderAction = this.contextMenu.querySelector(
      '[data-asset-action="delete-folder"]'
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
    this.folders = {};
    this.activeFolderId = null;
    this.categoryMeta = { ...CATEGORY_META };
    this.maxFileBytes = DEFAULT_MAX_FILE_BYTES;
    this.isUploading = false;
    this.isLoading = false;
    this.isDeleting = false;
    this.isRenaming = false;
    this.isOrganizing = false;
    this.apiAvailable = true;
    this.dragDepth = 0;
    this.contextAsset = null;
    this.contextFolder = null;
    this.contextKind = "";
    this.contextTarget = null;
    this.draggedAsset = null;
    this.draggedFolder = null;
    this.clipboardItem = null;
    this.conflictResolver = null;
    this.viewerAsset = null;
    this.viewerOpen = false;
    this.viewerGeneration = 0;
    this.viewerScale = 1;
    this.viewerX = 0;
    this.viewerY = 0;
    this.isPanning = false;
    this.panPointerId = null;
    this.panStart = null;
    this.animators = new Set();
    this.previewAudio = null;
    this.previewAudioAsset = null;
    this.audioSeeking = false;
    this.audioResume = null;
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
      getMaxFileBytes: () => this.maxFileBytes,
      onResolveConflict: (options) =>
        this.askNameConflict(options),
      getTargetFolderId: () => this.activeFolderId
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
      this.resolveNameConflict({ action: "cancel" });
      this.cancelRename({ rerender: false });
      this.stopPreviewAnimators();
      this.stopAudioPreview();
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
      if (!this.conflictPanel.hidden) {
        event.preventDefault();
        event.stopPropagation();
        this.resolveNameConflict({ action: "cancel" });
      } else if (!this.frameRatePanel.hidden) {
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

    this.breadcrumb.addEventListener("click", (event) => {
      const target = event.target.closest(
        "[data-asset-breadcrumb-folder]"
      );
      if (!target) {
        return;
      }
      const folderId =
        target.dataset.assetBreadcrumbFolder || null;
      if (folderId) {
        this.navigateToFolder(folderId);
      } else {
        this.activeFolderId = null;
        this.render();
      }
    });
    this.breadcrumb.addEventListener("dragover", (event) => {
      const target = event.target.closest(
        "[data-asset-breadcrumb-folder]"
      );
      if (!this.draggedAsset && !this.draggedFolder) {
        return;
      }
      if (!target) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      target.classList.add("is-drop-target");
    });
    this.breadcrumb.addEventListener("dragleave", (event) => {
      event.target
        .closest("[data-asset-breadcrumb-folder]")
        ?.classList.remove("is-drop-target");
    });
    this.breadcrumb.addEventListener("drop", (event) => {
      const target = event.target.closest(
        "[data-asset-breadcrumb-folder]"
      );
      if (!target) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      target.classList.remove("is-drop-target");
      const folderId =
        target.dataset.assetBreadcrumbFolder || null;
      if (this.draggedFolder) {
        this.moveFolderToFolder(
          this.draggedFolder,
          folderId
        );
      } else {
        this.moveAssetToFolder(
          this.draggedAsset,
          folderId
        );
      }
    });
    this.grid.addEventListener("click", (event) => {
      const audioButton = event.target.closest(
        "[data-audio-play]"
      );
      if (audioButton) {
        event.preventDefault();
        event.stopPropagation();
        this.toggleAudioPreview(audioButton);
        return;
      }
      const folderCard = event.target.closest(
        "[data-asset-folder-id]"
      );
      if (!folderCard) {
        return;
      }
      this.navigateToFolder(folderCard.dataset.assetFolderId);
    });
    this.grid.addEventListener("dragstart", (event) => {
      const folderCard = event.target.closest(
        "[data-asset-folder-id]"
      );
      if (folderCard) {
        const folder = this.getFolders().find(
          (candidate) =>
            candidate.id ===
            folderCard.dataset.assetFolderId
        );
        if (!folder) {
          event.preventDefault();
          return;
        }
        this.draggedAsset = null;
        this.draggedFolder = folder;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", folder.id);
        folderCard.classList.add("is-dragging");
        return;
      }
      const card = event.target.closest("[data-asset-file]");
      const asset = card
        ? this.findAssetFromCard(card)
        : null;
      if (!asset) {
        event.preventDefault();
        return;
      }
      this.draggedFolder = null;
      this.draggedAsset = asset;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(
        "text/plain",
        asset.id
      );
      card.classList.add("is-dragging");
    });
    this.grid.addEventListener("dragend", () => {
      this.grid
        .querySelectorAll(".is-dragging, .is-drop-target")
        .forEach((element) =>
          element.classList.remove(
            "is-dragging",
            "is-drop-target"
          )
        );
      this.draggedAsset = null;
      this.draggedFolder = null;
    });
    this.grid.addEventListener("dragover", (event) => {
      const folderCard = event.target.closest(
        "[data-asset-folder-id]"
      );
      if (
        !folderCard ||
        (!this.draggedAsset && !this.draggedFolder)
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
      folderCard.classList.add("is-drop-target");
    });
    this.grid.addEventListener("dragleave", (event) => {
      const folderCard = event.target.closest(
        "[data-asset-folder-id]"
      );
      folderCard?.classList.remove("is-drop-target");
    });
    this.grid.addEventListener("drop", (event) => {
      const folderCard = event.target.closest(
        "[data-asset-folder-id]"
      );
      if (
        !folderCard ||
        (!this.draggedAsset && !this.draggedFolder)
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      folderCard.classList.remove("is-drop-target");
      if (this.draggedFolder) {
        this.moveFolderToFolder(
          this.draggedFolder,
          folderCard.dataset.assetFolderId
        );
      } else {
        this.moveAssetToFolder(
          this.draggedAsset,
          folderCard.dataset.assetFolderId
        );
      }
    });
    this.dropZone.addEventListener("contextmenu", (event) => {
      const folderCard = event.target.closest(
        "[data-asset-folder-id]"
      );
      if (folderCard) {
        event.preventDefault();
        const folder = this.getFolders().find(
          (candidate) =>
            candidate.id === folderCard.dataset.assetFolderId
        );
        if (folder) {
          this.openFolderContextMenu(
            folder,
            folderCard,
            event.clientX,
            event.clientY
          );
        }
        return;
      }
      const card = event.target.closest("[data-asset-file]");
      if (card) {
        const asset = this.findAssetFromCard(card);
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
        return;
      }
      event.preventDefault();
      this.openBlankContextMenu(event.clientX, event.clientY);
    });
    this.contextMenu.addEventListener("click", (event) => {
      const action = event.target.closest("[data-asset-action]")
        ?.dataset.assetAction;
      if (!action || !this.contextKind) {
        return;
      }
      const asset = this.contextAsset;
      const folder = this.contextFolder;
      const card = this.contextTarget;
      this.closeContextMenu();
      if (action === "new-folder") {
        this.createFolder();
      } else if (action === "paste") {
        this.pasteClipboard();
      } else if (
        action === "copy" ||
        action === "cut"
      ) {
        this.setClipboard(action, asset, folder);
      } else if (action === "rename-folder") {
        this.renameFolder(folder);
      } else if (action === "delete-folder") {
        this.deleteFolder(folder);
      } else if (action === "view" && asset) {
        this.openViewer(asset);
      } else if (action === "rename" && asset) {
        this.beginRename(asset, card);
      } else if (action === "delete" && asset) {
        this.deleteAsset(asset);
      } else if (action === "frame-rate" && asset) {
        this.openFrameRatePanel(asset);
      }
    });
    this.conflictOverwrite.addEventListener("click", () => {
      this.resolveNameConflict({ action: "overwrite" });
    });
    this.conflictRename.addEventListener("click", () => {
      const baseName = this.conflictInput.value.trim();
      if (!baseName) {
        this.conflictInput.classList.add("is-invalid");
        this.conflictInput.focus();
        return;
      }
      const suffix = this.nameFixedSuffix.textContent;
      const name =
        suffix && !baseName.toLowerCase().endsWith(
          suffix.toLowerCase()
        )
          ? `${baseName}${suffix}`
          : baseName;
      this.resolveNameConflict({
        action: "rename",
        name
      });
    });
    this.conflictCancel.addEventListener("click", () => {
      this.resolveNameConflict({ action: "cancel" });
    });
    this.conflictInput.addEventListener("input", () => {
      this.conflictInput.classList.remove("is-invalid");
    });
    this.conflictInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.conflictRename.click();
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
        if (
          !this.viewerOpen ||
          isAudioAsset(this.viewerAsset)
        ) {
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
      if (
        !this.viewerOpen ||
        event.button !== 0 ||
        isAudioAsset(this.viewerAsset)
      ) {
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
    this.viewerCanvas.addEventListener("dblclick", () => {
      if (!isAudioAsset(this.viewerAsset)) {
        this.resetViewer();
      }
    });
    this.audioPlayButton.addEventListener("click", () =>
      this.toggleViewerAudio()
    );
    this.audioRewind.addEventListener("click", () =>
      this.seekViewerAudioBy(-10)
    );
    this.audioForward.addEventListener("click", () =>
      this.seekViewerAudioBy(10)
    );
    this.audioMute.addEventListener("click", () =>
      this.toggleViewerAudioMute()
    );
    this.audioSeek.addEventListener("input", () =>
      this.handleViewerAudioSeek()
    );
    this.audioSeek.addEventListener("pointerdown", () => {
      this.audioSeeking = true;
    });
    this.audioSeek.addEventListener("pointerup", () => {
      this.audioSeeking = false;
      this.syncViewerAudioState();
    });
    this.audioSeek.addEventListener("pointercancel", () => {
      this.audioSeeking = false;
    });
    this.audioSeek.addEventListener("change", () => {
      this.audioSeeking = false;
      this.syncViewerAudioState();
    });
    this.audioVolume.addEventListener("input", () => {
      this.viewerAudio.volume = Number(this.audioVolume.value) || 0;
      this.viewerAudio.muted = false;
      this.syncViewerAudioState();
    });
    this.viewerAudio.addEventListener("loadedmetadata", () => {
      this.applyAudioResume();
      this.syncViewerAudioState();
    });
    this.viewerAudio.addEventListener("timeupdate", () => {
      this.syncViewerAudioState();
    });
    this.viewerAudio.addEventListener("play", () => {
      this.syncViewerAudioState();
    });
    this.viewerAudio.addEventListener("pause", () => {
      this.syncViewerAudioState();
    });
    this.viewerAudio.addEventListener("ended", () => {
      this.syncViewerAudioState();
    });
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
    this.activeFolderId = null;
    this.syncUploadConstraints();
    this.render();
    const count = this.assets[categoryId]?.length ?? 0;
    const meta = this.getActiveCategoryMeta();
    this.setStatus(
      count > 0
        ? `当前分类有 ${count} 个素材。`
        : categoryId === "tiled"
          ? "当前分类还没有素材，可导入包含 JSON/TMJ、TSX 与图片的文件夹。"
          : meta?.kind === "audio"
            ? "当前分类还没有音效，可以拖入音频文件或点击上传。"
            : "当前分类还没有素材，可以拖入图片或点击上传。"
    );
  }

  setBusy() {
    const busy =
      this.isLoading ||
      this.isUploading ||
      this.isDeleting ||
      this.isRenaming ||
      this.isOrganizing;
    this.dialog.setAttribute("aria-busy", String(busy));
    this.refreshButton.disabled = busy;
    this.uploadButton.disabled =
      busy || !this.apiAvailable || this.isLoading;
    const meta = this.getActiveCategoryMeta();
    this.uploadButton.textContent = this.isUploading
      ? "正在上传…"
      : meta?.kind === "audio"
        ? "上传音效"
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
    const isAudio = meta?.kind === "audio";
    this.uploadButton.hidden = isTiledMap;
    this.tiledImporter.setVisible(isTiledMap);
    this.fileInput.accept = extensions.join(",");
    if (this.supportedFormats) {
      this.supportedFormats.textContent =
        this.activeCategory === "tiled"
          ? `文件夹导入支持 JSON/TMJ、TSX 与图片 · 单个不超过 ${formatBytes(
              this.maxFileBytes
            )}`
          : isAudio
            ? `支持 WAV、OGG、MP3 · 单个不超过 ${formatBytes(
                this.maxFileBytes
              )}`
            : `支持 ${formatExtensionLabel(
                extensions
              )} 图片 · 单个不超过 ${formatBytes(
                this.maxFileBytes
              )}`;
    }
  }

  setStatus(message, isError = false) {
    this.status.textContent = message;
    this.status.classList.toggle("is-error", isError);
  }

  askNameConflict({
    title,
    description,
    suggestedName,
    itemKind = "asset",
    cancelLabel = "不导入"
  }) {
    this.resolveNameConflict({ action: "cancel" });
    this.conflictTitle.textContent = title;
    this.conflictDescription.textContent = description;
    const suffix =
      itemKind === "folder"
        ? ""
        : splitAssetFileName(suggestedName ?? "").extension;
    this.conflictInput.value =
      suffix && suggestedName.endsWith(suffix)
        ? suggestedName.slice(0, -suffix.length)
        : suggestedName ?? "";
    this.nameFixedSuffix.textContent = suffix;
    this.nameFixedSuffix.hidden = !suffix;
    this.conflictInput.classList.remove("is-invalid");
    this.conflictCancel.textContent = cancelLabel;
    this.conflictPanel.hidden = false;
    requestAnimationFrame(() => {
      this.conflictInput.focus();
      this.conflictInput.select();
    });
    return new Promise((resolve) => {
      this.conflictResolver = resolve;
    });
  }

  resolveNameConflict(result) {
    if (!this.conflictResolver) {
      this.conflictPanel.hidden = true;
      return;
    }
    const resolve = this.conflictResolver;
    this.conflictResolver = null;
    this.conflictPanel.hidden = true;
    resolve(result);
  }

  getFolders() {
    return this.folders[this.activeCategory] ?? [];
  }

  getActiveFolder() {
    return (
      this.getFolders().find(
        (folder) => folder.id === this.activeFolderId
      ) ?? null
    );
  }

  getVisibleFolders() {
    return this.getFolders().filter(
      (folder) =>
        (folder.parentId ?? null) === this.activeFolderId
    );
  }

  getVisibleAssets() {
    return (this.assets[this.activeCategory] ?? []).filter(
      (asset) => (asset.folderId ?? null) === this.activeFolderId
    );
  }

  findAssetFromCard(card) {
    return (this.assets[this.activeCategory] ?? []).find(
      (asset) =>
        (asset.categoryId === "tiled"
          ? asset.id
          : asset.fileName) === card.dataset.assetFile
    );
  }

  toggleAudioPreview(button) {
    const asset = (this.assets[this.activeCategory] ?? []).find(
      (candidate) => candidate.id === button.dataset.audioPlay
    );
    if (!asset) {
      return;
    }
    if (
      this.previewAudio &&
      this.previewAudioAsset?.id === asset.id
    ) {
      if (this.previewAudio.paused) {
        this.previewAudio.play().catch((error) => {
          this.setStatus(`试听失败：${error.message}`, true);
        });
      } else {
        this.previewAudio.pause();
      }
      this.syncAudioPreviewButtons();
      return;
    }
    this.stopAudioPreview();
    this.previewAudio = new Audio(asset.url);
    this.previewAudioAsset = asset;
    this.previewAudio.addEventListener("play", () => {
      this.syncAudioPreviewButtons();
    });
    this.previewAudio.addEventListener("pause", () => {
      this.syncAudioPreviewButtons();
    });
    this.previewAudio.addEventListener("ended", () => {
      this.syncAudioPreviewButtons();
    });
    this.previewAudio
      .play()
      .catch((error) =>
        this.setStatus(`试听失败：${error.message}`, true)
      );
    this.syncAudioPreviewButtons();
  }

  syncAudioPreviewButtons() {
    for (const button of this.grid.querySelectorAll(
      "[data-audio-play]"
    )) {
      const playing =
        this.previewAudioAsset?.id === button.dataset.audioPlay &&
        this.previewAudio &&
        !this.previewAudio.paused;
      button.classList.toggle("is-playing", Boolean(playing));
      button.setAttribute(
        "aria-label",
        playing ? "暂停试听" : "试听"
      );
      button.title = playing ? "暂停" : "试听";
    }
  }

  stopAudioPreview() {
    if (this.previewAudio) {
      this.previewAudio.pause();
      this.previewAudio.removeAttribute("src");
      this.previewAudio.load();
    }
    this.previewAudio = null;
    this.previewAudioAsset = null;
    this.syncAudioPreviewButtons();
  }

  applyAudioResume() {
    if (!this.audioResume) {
      return;
    }
    const { time, play } = this.audioResume;
    this.audioResume = null;
    if (Number.isFinite(this.viewerAudio.duration)) {
      this.viewerAudio.currentTime = Math.min(
        Math.max(0, time),
        this.viewerAudio.duration
      );
    }
    if (play) {
      this.viewerAudio.play().catch((error) => {
        this.setStatus(
          `继续播放失败：${error.message}`,
          true
        );
      });
    }
  }

  setContextActions(visibleActions) {
    const visible = new Set(visibleActions);
    for (const action of this.contextActions) {
      action.hidden = !visible.has(
        action.dataset.assetAction
      );
    }
  }

  showContextMenu(clientX, clientY) {
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

  openContextMenu(asset, card, clientX, clientY) {
    this.closeContextMenu();
    this.contextKind = "asset";
    this.contextAsset = asset;
    this.contextTarget = card;
    card.classList.add("is-context-target");
    const supportsFrameRate =
      asset.categoryId === "entity" && asset.isSpriteSheet;
    this.setContextActions([
      "view",
      "rename",
      "delete",
      "copy",
      "cut",
      ...(supportsFrameRate ? ["frame-rate"] : [])
    ]);
    this.contextFrameRate.textContent =
      `${asset.frameRate ?? 8} FPS · ${asset.frameCount ?? 1} 帧`;
    this.showContextMenu(clientX, clientY);
  }

  openFolderContextMenu(folder, card, clientX, clientY) {
    this.closeContextMenu();
    this.contextKind = "folder";
    this.contextFolder = folder;
    this.contextTarget = card;
    card.classList.add("is-context-target");
    this.setContextActions([
      "rename-folder",
      "delete-folder",
      "copy",
      "cut"
    ]);
    this.showContextMenu(clientX, clientY);
  }

  openBlankContextMenu(clientX, clientY) {
    this.closeContextMenu();
    this.contextKind = "blank";
    this.setContextActions([
      "new-folder",
      ...(this.clipboardItem?.categoryId ===
      this.activeCategory
        ? ["paste"]
        : [])
    ]);
    this.showContextMenu(clientX, clientY);
  }

  closeContextMenu() {
    this.contextTarget?.classList.remove(
      "is-context-target"
    );
    this.contextTarget = null;
    this.contextAsset = null;
    this.contextFolder = null;
    this.contextKind = "";
    this.contextMenu.hidden = true;
  }

  navigateToFolder(folderId) {
    if (
      !this.getFolders().some(
        (folder) => folder.id === folderId
      )
    ) {
      return;
    }
    this.activeFolderId = folderId;
    this.render();
  }

  setClipboard(mode, asset = null, folder = null) {
    if (mode !== "copy" && mode !== "cut") {
      return;
    }
    if (asset) {
      this.clipboardItem = {
        mode,
        kind: "asset",
        categoryId: this.activeCategory,
        itemId: asset.id,
        name: getAssetDisplayName(asset)
      };
    } else if (folder) {
      this.clipboardItem = {
        mode,
        kind: "folder",
        categoryId: this.activeCategory,
        itemId: folder.id,
        name: folder.name
      };
    } else {
      return;
    }
    this.setStatus(
      `已${mode === "copy" ? "复制" : "剪切"}：${
        this.clipboardItem.name
      }`
    );
    this.showNotification(
      mode === "copy" ? "已复制，可在空白处粘贴" : "已剪切，可在空白处粘贴"
    );
  }

  async pasteClipboard(
    clipboardOverride = null,
    options = {}
  ) {
    const clipboard = clipboardOverride ?? this.clipboardItem;
    const preserveClipboard =
      options.preserveClipboard === true;
    const targetFolderId = Object.hasOwn(
      options,
      "targetFolderId"
    )
      ? options.targetFolderId
      : this.activeFolderId;
    if (
      !clipboard ||
      !this.apiAvailable ||
      this.isOrganizing
    ) {
      return;
    }
    if (clipboard.categoryId !== this.activeCategory) {
      this.showNotification(
        "剪贴板素材与当前分类不匹配",
        true
      );
      return;
    }
    this.isOrganizing = true;
    this.setBusy();
    const body = {
      categoryId: this.activeCategory,
      clipboard,
      targetFolderId
    };
    try {
      while (true) {
        const response = await fetch(
          "/api/asset-clipboard/paste",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
          }
        );
        const payload = await response.json().catch(() => ({}));
        if (
          response.status === 409 &&
          payload.code === "ASSET_NAME_CONFLICT"
        ) {
          const decision = await this.askNameConflict({
            title:
              payload.itemKind === "folder"
                ? "目标位置已有同名文件夹"
                : "目标位置已有同名素材",
            description: `“${payload.name}”已存在，请选择处理方式。`,
            suggestedName: payload.suggestedName,
            itemKind: payload.itemKind,
            cancelLabel: "不粘贴"
          });
          if (decision.action === "cancel") {
            this.setStatus("已取消粘贴");
            return;
          }
          body.conflictAction = decision.action;
          if (decision.action === "rename") {
            body.renameTo = decision.name;
          }
          continue;
        }
        if (!response.ok) {
          throw new Error(
            payload.error ?? `粘贴失败（${response.status}）`
          );
        }
        await this.refresh();
        if (
          clipboard.mode === "cut" &&
          !preserveClipboard
        ) {
          this.clipboardItem = null;
        }
        const successVerb = preserveClipboard
          ? "移动"
          : "粘贴";
        this.setStatus(
          `已${successVerb}${
            payload.pasted.kind === "folder"
              ? "文件夹"
              : "素材"
          }`
        );
        this.showNotification(`${successVerb}完成`);
        return;
      }
    } catch (error) {
      this.setStatus(`粘贴失败：${error.message}`, true);
      this.showNotification(
        `粘贴失败：${error.message}`,
        true
      );
    } finally {
      this.isOrganizing = false;
      this.setBusy();
    }
  }

  async createFolder() {
    if (!this.apiAvailable || this.isOrganizing) {
      return;
    }
    const name = window.prompt("新建文件夹名称");
    if (!name?.trim()) {
      return;
    }
    this.isOrganizing = true;
    this.setBusy();
    try {
      const response = await fetch("/api/asset-folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: this.activeCategory,
          parentId: this.activeFolderId,
          name
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          payload.error ?? `创建失败（${response.status}）`
        );
      }
      await this.refresh();
      this.setStatus(`已创建文件夹：${payload.folder.name}`);
      this.showNotification("文件夹已创建");
    } catch (error) {
      this.setStatus(`创建文件夹失败：${error.message}`, true);
      this.showNotification(
        `创建文件夹失败：${error.message}`,
        true
      );
    } finally {
      this.isOrganizing = false;
      this.setBusy();
    }
  }

  async renameFolder(folder) {
    if (!folder || !this.apiAvailable || this.isOrganizing) {
      return;
    }
    const name = window.prompt("重命名文件夹", folder.name);
    if (!name?.trim() || name.trim() === folder.name) {
      return;
    }
    this.isOrganizing = true;
    this.setBusy();
    try {
      const response = await fetch("/api/asset-folders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: this.activeCategory,
          folderId: folder.id,
          name
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          payload.error ?? `重命名失败（${response.status}）`
        );
      }
      await this.refresh();
      this.setStatus(`文件夹已重命名为：${payload.folder.name}`);
      this.showNotification("文件夹已重命名");
    } catch (error) {
      this.setStatus(`重命名文件夹失败：${error.message}`, true);
      this.showNotification(
        `重命名文件夹失败：${error.message}`,
        true
      );
    } finally {
      this.isOrganizing = false;
      this.setBusy();
    }
  }

  async deleteFolder(folder) {
    if (!folder || !this.apiAvailable || this.isOrganizing) {
      return;
    }
    const confirmed = window.confirm(
      `确定删除文件夹“${folder.name}”吗？\n\n` +
        "其中的素材和所有子文件夹也会被永久删除，无法恢复。"
    );
    if (!confirmed) {
      return;
    }
    this.isOrganizing = true;
    this.setBusy();
    try {
      const query = new URLSearchParams({
        category: this.activeCategory,
        folderId: folder.id
      });
      const response = await fetch(
        `/api/asset-folders?${query.toString()}`,
        { method: "DELETE" }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          payload.error ?? `删除失败（${response.status}）`
        );
      }
      await this.refresh();
      this.setStatus(`已删除文件夹：${folder.name}`);
      this.showNotification("文件夹及其内容已删除");
    } catch (error) {
      this.setStatus(`删除文件夹失败：${error.message}`, true);
      this.showNotification(
        `删除文件夹失败：${error.message}`,
        true
      );
    } finally {
      this.isOrganizing = false;
      this.setBusy();
    }
  }

  async moveAssetToFolder(asset, folderId) {
    if (
      !asset ||
      !this.apiAvailable ||
      this.isOrganizing ||
      (asset.folderId ?? null) === (folderId ?? null)
    ) {
      this.draggedAsset = null;
      return;
    }
    const clipboard = {
      mode: "cut",
      kind: "asset",
      categoryId: this.activeCategory,
      itemId: asset.id,
      name: getAssetDisplayName(asset)
    };
    await this.pasteClipboard(clipboard, {
      preserveClipboard: true,
      targetFolderId: folderId ?? null
    });
    this.draggedAsset = null;
  }

  async moveFolderToFolder(folder, targetFolderId) {
    if (
      !folder ||
      !this.apiAvailable ||
      this.isOrganizing ||
      (folder.parentId ?? null) ===
        (targetFolderId ?? null)
    ) {
      this.draggedFolder = null;
      return;
    }
    const clipboard = {
      mode: "cut",
      kind: "folder",
      categoryId: this.activeCategory,
      itemId: folder.id,
      name: folder.name
    };
    await this.pasteClipboard(clipboard, {
      preserveClipboard: true,
      targetFolderId: targetFolderId ?? null
    });
    this.draggedFolder = null;
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
    const displayName = getAssetDisplayName(asset);
    const parts = splitAssetFileName(displayName);
    const input = document.createElement("input");
    input.className = "asset-rename-input";
    input.type = "text";
    input.value = parts.stem;
    input.maxLength = 100;
    input.spellcheck = false;
    input.autocomplete = "off";
    input.setAttribute(
      "aria-label",
      `重命名 ${displayName}，文件后缀不可修改`
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
      originalDisplayName: displayName,
      saving: false
    };
    this.renameEditor = editor;
    card.classList.add("is-renaming");
    this.setStatus(
      `正在重命名 ${displayName} · Enter 保存 · Esc 取消`
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
        `正在重命名 ${displayName} · Enter 保存 · Esc 取消`
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
    if (nextFileName === editor.originalDisplayName) {
      this.cancelRename();
      this.setStatus(
        `素材名称未改变：${editor.originalDisplayName}`
      );
      return;
    }

    editor.saving = true;
    this.isRenaming = true;
    editor.input.disabled = true;
    editor.card.classList.add("is-saving");
    this.setBusy();
    this.setStatus(`正在保存名称：${nextFileName}`);

    const query = new URLSearchParams({
      category: editor.asset.categoryId
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
            assetId: editor.asset.id,
            displayName: nextFileName
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
      const previousDisplayName =
        editor.originalDisplayName;
      this.renameEditor = null;
      await this.refresh();
      this.setStatus(
        `已将 ${previousDisplayName} 重命名为 ${nextFileName}`
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
    this.frameRateName.textContent =
      getAssetDisplayName(asset);
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
          : getAssetDisplayName(asset)
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
        `已将 ${getAssetDisplayName(
          asset
        )} 的帧速调整为 ${frameRate} FPS`
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

  toggleViewerAudio() {
    if (!isAudioAsset(this.viewerAsset)) {
      return;
    }
    if (this.viewerAudio.paused) {
      this.viewerAudio.play().catch((error) => {
        this.setStatus(`播放失败：${error.message}`, true);
      });
    } else {
      this.viewerAudio.pause();
    }
  }

  seekViewerAudioBy(seconds) {
    if (
      !isAudioAsset(this.viewerAsset) ||
      !Number.isFinite(this.viewerAudio.duration)
    ) {
      return;
    }
    this.viewerAudio.currentTime = Math.min(
      this.viewerAudio.duration,
      Math.max(0, this.viewerAudio.currentTime + seconds)
    );
    this.syncViewerAudioState();
  }

  handleViewerAudioSeek() {
    if (!isAudioAsset(this.viewerAsset)) {
      return;
    }
    this.audioSeeking = true;
    const value = Number(this.audioSeek.value);
    if (Number.isFinite(value)) {
      this.viewerAudio.currentTime = value;
      this.audioCurrent.textContent = formatAudioTime(value);
    }
  }

  toggleViewerAudioMute() {
    if (!isAudioAsset(this.viewerAsset)) {
      return;
    }
    this.viewerAudio.muted = !this.viewerAudio.muted;
    this.syncViewerAudioState();
  }

  syncViewerAudioState() {
    if (!this.audioPlayer || this.audioPlayer.hidden) {
      return;
    }
    const duration = Number.isFinite(this.viewerAudio.duration)
      ? this.viewerAudio.duration
      : 0;
    const current = Number.isFinite(this.viewerAudio.currentTime)
      ? this.viewerAudio.currentTime
      : 0;
    this.audioDuration.textContent = formatAudioTime(duration);
    this.audioCurrent.textContent = formatAudioTime(current);
    if (!this.audioSeeking) {
      this.audioSeek.max = String(duration);
      this.audioSeek.value = String(
        Math.min(current, duration)
      );
    }
    const playing =
      !this.viewerAudio.paused && !this.viewerAudio.ended;
    this.audioPlayButton.classList.toggle(
      "is-playing",
      playing
    );
    this.audioPlayButton.setAttribute(
      "aria-label",
      playing ? "暂停" : "播放"
    );
    this.audioMute.textContent = this.viewerAudio.muted
      ? "取消静音"
      : "静音";
    this.audioMute.setAttribute(
      "aria-pressed",
      String(this.viewerAudio.muted)
    );
    this.audioVolume.value = String(
      this.viewerAudio.muted ? 0 : this.viewerAudio.volume
    );
  }

  resetViewerAudio() {
    this.audioSeeking = false;
    this.viewerAudio.pause();
    this.viewerAudio.muted = false;
    this.viewerAudio.volume = 0.8;
    this.audioVolume.value = "0.8";
    this.audioSeek.max = "0";
    this.audioSeek.value = "0";
    this.audioCurrent.textContent = "0:00";
    this.audioDuration.textContent = "0:00";
    this.audioPlayButton.classList.remove("is-playing");
    this.audioPlayButton.setAttribute("aria-label", "播放");
    this.audioMute.textContent = "静音";
    this.audioMute.setAttribute("aria-pressed", "false");
  }

  openViewer(asset) {
    this.closeContextMenu();
    this.viewerGeneration += 1;
    const generation = this.viewerGeneration;
    this.viewerSpriteAnimator?.stop();
    this.viewerSpriteAnimator = null;
    this.viewerAsset = asset;
    this.viewerOpen = true;
    const resumePreviewAudio =
      isAudioAsset(asset) &&
      this.previewAudio &&
      !this.previewAudio.paused &&
      this.previewAudioAsset?.id === asset.id;
    const previewAudioTime = resumePreviewAudio
      ? this.previewAudio.currentTime
      : 0;
    this.audioResume = null;
    this.stopAudioPreview();
    this.viewerName.textContent =
      getAssetDisplayName(asset);
    this.viewerImage.hidden = true;
    this.viewerTiled.hidden = true;
    this.viewerSprite.hidden = true;
    this.audioPlayer.hidden = true;
    this.resetViewerAudio();
    this.viewerAudio.pause();
    this.viewerAudio.removeAttribute("src");
    this.viewerAudio.hidden = true;
    this.viewer.classList.toggle(
      "is-audio",
      isAudioAsset(asset)
    );
    if (isAudioAsset(asset)) {
      this.viewerMeta.textContent = `${
        this.categoryMeta[asset.categoryId]?.label ?? "音效"
      } · ${getAudioFormatLabel(asset)} · ${formatBytes(
        asset.size
      )} · 拖动进度条定位`;
      this.viewerImage.removeAttribute("src");
      this.audioResume = resumePreviewAudio
        ? { time: previewAudioTime, play: true }
        : null;
      this.viewerAudio.src = asset.url;
      this.viewerAudio.load();
      if (resumePreviewAudio) {
        this.viewerAudio.play().catch((error) => {
          this.setStatus(
            `继续播放失败：${error.message}`,
            true
          );
        });
      }
      this.viewerAudio.hidden = true;
      this.audioPlayer.hidden = false;
      this.viewer.hidden = false;
      this.viewerZoom.hidden = true;
      this.viewerZoomIn.hidden = true;
      this.viewerZoomOut.hidden = true;
      this.viewerFit.hidden = true;
      requestAnimationFrame(() =>
        this.closeViewerButton.focus({ preventScroll: true })
      );
      return;
    }
    this.viewerZoom.hidden = false;
    this.viewerZoomIn.hidden = false;
    this.viewerZoomOut.hidden = false;
    this.viewerFit.hidden = false;
    if (asset.categoryId === "tiled") {
      this.viewerMeta.textContent =
        `Tiled JSON · ${asset.sourceWidth} × ${asset.sourceHeight} · ` +
        `${asset.tileWidth} × ${asset.tileHeight} 瓦片 · ` +
        `${asset.collisionCount ?? 0} 个碰撞 · 滚轮缩放 · 拖动平移 · 双击复位`;
      this.viewerImage.removeAttribute("src");
      this.viewerTiled.width = 1;
      this.viewerTiled.height = 1;
      this.viewerTiled.hidden = false;
      delete this.viewerTiled.dataset.previewReady;
      delete this.viewerTiled.dataset.previewError;
      this.viewer.hidden = false;
      this.resetViewer();
      new TiledMapThumbnail(this.viewerTiled, asset, {
        maxSize: 4096
      })
        .start()
        .then(() => {
          if (
            generation === this.viewerGeneration &&
            this.viewerOpen
          ) {
            this.viewerTiled.dataset.previewReady = "true";
            this.resetViewer();
          }
        })
        .catch((error) => {
          if (
            generation === this.viewerGeneration &&
            this.viewerOpen
          ) {
            this.viewerTiled.dataset.previewError = "true";
            this.setStatus(
              `Tiled 地图预览加载失败：${error.message}`,
              true
            );
          }
          console.warn("Tiled 地图完整预览加载失败", error);
        });
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
      this.viewerImage.alt = getAssetDisplayName(asset);
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
    this.viewerGeneration += 1;
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
    this.viewerTiled.hidden = true;
    this.viewerTiled.width = 1;
    this.viewerTiled.height = 1;
    delete this.viewerTiled.dataset.previewReady;
    delete this.viewerTiled.dataset.previewError;
    this.viewerSprite.hidden = true;
    this.viewerImage.hidden = false;
    this.audioPlayer.hidden = true;
    this.resetViewerAudio();
    this.viewerAudio.removeAttribute("src");
    this.viewerAudio.load();
    this.viewerAudio.hidden = true;
    this.viewer.classList.remove("is-audio");
    this.viewerZoom.hidden = false;
    this.viewerZoomIn.hidden = false;
    this.viewerZoomOut.hidden = false;
    this.viewerFit.hidden = false;
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
    this.viewerTiled.style.transform = transform;
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
    this.stopAudioPreview();
    const meta =
      this.categoryMeta[this.activeCategory] ??
      CATEGORY_META[this.activeCategory];
    const folders = this.getVisibleFolders();
    const assets = this.getVisibleAssets();
    const activeFolder = this.getActiveFolder();
    const breadcrumbPath = buildFolderBreadcrumbPath(
      this.getFolders(),
      this.activeFolderId,
      meta.label
    );
    this.syncUploadConstraints();
    this.renderCategoryButtons();
    this.breadcrumb.innerHTML = breadcrumbPath
      .map(
        (segment, index) => `
          ${index > 0 ? '<span aria-hidden="true">/</span>' : ""}
          <button
            type="button"
            data-asset-breadcrumb-folder="${escapeHtml(
              segment.id ?? ""
            )}"
            ${index === breadcrumbPath.length - 1
              ? 'aria-current="page"'
              : ""}
          >
            ${escapeHtml(segment.label)}
          </button>
        `
      )
      .join("");
    this.dropHint.textContent =
      this.activeCategory === "tiled"
        ? "按住素材拖到文件夹可分类 · 空白处右键可新建文件夹 · 文件夹右键可管理"
        : meta.kind === "audio"
          ? "将音频拖到这里，或点击“上传音效” · 单击“试听”播放 · 右键可查看或删除"
          : meta.allowedExtensions?.length === 1
            ? "仅支持 PNG 图片 · 按住素材拖到文件夹可分类 · 空白处右键可新建文件夹"
            : "按住素材拖到文件夹可分类 · 空白处右键可新建文件夹 · 单击文件夹进入";

    if (!this.apiAvailable) {
      this.grid.innerHTML = "";
      this.emptyState.hidden = false;
      this.emptyTitle.textContent = "素材库服务未连接";
      this.emptyDescription.textContent =
        "请通过 npm start 启动编辑器后重试。";
      return;
    }

    if (assets.length === 0 && folders.length === 0) {
      this.grid.innerHTML = "";
      this.emptyState.hidden = false;
      this.emptyTitle.textContent = activeFolder
        ? `文件夹“${activeFolder.name}”还是空的`
        : `还没有${meta.label}素材`;
      this.emptyDescription.textContent =
        this.activeCategory === "tiled"
          ? "使用右上角“导入文件夹”选择 Tiled 地图项目。"
          : meta.kind === "audio"
            ? "将音频拖到这里，或使用右上角“上传音效”。"
            : "将图片拖到这里，或使用右上角“上传素材”。";
      return;
    }

    this.emptyState.hidden = true;
    this.grid.innerHTML = [
      ...folders.map(
        (folder) => `
          <article
            class="asset-folder-card"
            draggable="true"
            data-asset-folder-id="${escapeHtml(folder.id)}"
            tabindex="0"
            role="button"
            title="${escapeHtml(
              `${folder.name} · 单击进入 · 右键管理`
            )}"
          >
            <span class="asset-folder-icon" aria-hidden="true">▱</span>
            <span class="asset-folder-copy">
              <strong>${escapeHtml(folder.name)}</strong>
              <small>${folder.assetCount ?? 0} 个素材</small>
            </span>
            <span class="asset-folder-action">打开</span>
          </article>
        `
      ),
      ...assets.map((asset) => {
        const displayName = getAssetDisplayName(asset);
        const nameParts = splitAssetFileName(displayName);
        let preview;
        if (asset.categoryId === "tiled") {
          preview = `
            <canvas
              class="asset-tiled-canvas"
              data-tiled-preview="${escapeHtml(asset.id)}"
              aria-label="${escapeHtml(displayName)} 地图预览"
            ></canvas>
          `;
        } else if (isAudioAsset(asset)) {
          preview = `
            <div class="asset-audio-preview">
              <span class="asset-audio-mark" aria-hidden="true">♪</span>
              <span class="asset-audio-codec">${escapeHtml(
                getAudioFormatLabel(asset)
              )}</span>
              <button
                class="asset-audio-play"
                type="button"
                data-audio-play="${escapeHtml(asset.id)}"
                aria-label="试听 ${escapeHtml(displayName)}"
                title="试听"
              >
                <span
                  class="asset-audio-play-glyph"
                  aria-hidden="true"
                ></span>
              </button>
            </div>
          `;
        } else if (asset.isSpriteSheet) {
          preview = `
            <canvas
              class="asset-sprite-canvas"
              data-sprite-preview="${escapeHtml(asset.fileName)}"
              aria-label="${escapeHtml(displayName)} 动画预览"
            ></canvas>
          `;
        } else if (usesNativeImagePreview(asset)) {
          preview = `
            <img
              src="${escapeHtml(asset.url)}"
              alt="${escapeHtml(displayName)}"
              loading="lazy"
            />
          `;
        } else {
          preview = `
            <canvas
              class="asset-image-canvas"
              data-image-preview="${escapeHtml(asset.fileName)}"
              aria-label="${escapeHtml(displayName)} 图片预览"
            ></canvas>
          `;
        }
        return `
          <article class="asset-card" draggable="true" data-asset-file="${escapeHtml(
            asset.categoryId === "tiled"
              ? asset.id
              : asset.fileName
          )}" title="${escapeHtml(
            `${displayName} · 按住拖动到文件夹 · 右键查看更多操作`
          )}">
            <div class="asset-preview">
              ${preview}
              <span class="asset-extension">${escapeHtml(
                asset.categoryId === "tiled"
                  ? "TILED"
                  : displayName
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
                  displayName
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
    ].join("");
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
      this.folders = payload.folders ?? {};
      if (
        this.activeFolderId &&
        !this.getFolders().some(
          (folder) => folder.id === this.activeFolderId
        )
      ) {
        this.activeFolderId = null;
      }
      this.maxFileBytes =
        Number(payload.maxFileBytes) || DEFAULT_MAX_FILE_BYTES;
      for (const group of payload.categories ?? []) {
        for (const category of group.children ?? []) {
          this.categoryMeta[category.id] = {
            groupLabel: category.group?.label ?? "",
            label: category.label,
            kind: category.kind ?? "image",
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
      this.folders = {};
      this.activeFolderId = null;
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
      )} 文件`;
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
        `确定删除素材“${getAssetDisplayName(
          asset
        )}”吗？删除后无法恢复。`
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
    this.setStatus(
      `正在删除：${getAssetDisplayName(asset)}`
    );
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
      this.setStatus(
        `已删除素材：${getAssetDisplayName(asset)}`
      );
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
    let skipped = 0;
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
          filename: file.name,
          displayName: file.name
        });
        if (this.activeFolderId) {
          query.set("folderId", this.activeFolderId);
        }

        try {
          while (true) {
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
            if (
              response.status === 409 &&
              payload.code === "ASSET_NAME_CONFLICT"
            ) {
              const decision = await this.askNameConflict({
                title: "目标文件夹已有同名素材",
                description: `“${payload.name}”已存在，请选择处理方式。`,
                suggestedName: payload.suggestedName,
                itemKind: "asset",
                cancelLabel: "不导入"
              });
              if (decision.action === "cancel") {
                skipped += 1;
                break;
              }
              query.set("conflictAction", decision.action);
              if (decision.action === "rename") {
                query.set("renameTo", decision.name);
              }
              continue;
            }
            if (!response.ok) {
              throw new Error(
                payload.error ?? `上传失败（${response.status}）`
              );
            }
            uploaded += 1;
            break;
          }
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
        `已上传 ${uploaded} 个素材${
          skipped > 0 ? `，跳过 ${skipped} 个同名素材` : ""
        }到 ${
          this.categoryMeta[targetCategory].label
        }。`
      );
      this.showNotification(`已上传 ${uploaded} 个素材`);
    } else if (skipped > 0) {
      this.setStatus(`已跳过 ${skipped} 个同名素材。`);
      this.showNotification("未导入同名素材");
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
