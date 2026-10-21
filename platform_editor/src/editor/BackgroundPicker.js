import { TiledMapThumbnail } from "./TiledMapThumbnail.js";
import { buildFolderBreadcrumbPath } from "./folder-breadcrumb.js";

const BACKGROUND_CATEGORIES = [
  {
    id: "background",
    label: "静态背景",
    emptyDescription:
      "请先在素材库的“关卡背景 → 静态背景”中上传图片。",
    actionLabel: "使用此静态背景"
  },
  {
    id: "tiled",
    label: "Tiled 背景",
    emptyDescription:
      "请先在素材库的“关卡背景 → Tiled 背景”中导入 Tiled 地图。",
    actionLabel: "作为 Tiled 背景导入"
  }
];

function getBackgroundCategories(payload) {
  const metadata = (payload.categories ?? [])
    .flatMap((group) => group.children ?? [])
    .filter(
      (category) => category.group?.id === "level-background"
    );

  return BACKGROUND_CATEGORIES.map((fallback) => {
    const category = metadata.find(
      (candidate) => candidate.id === fallback.id
    );
    return {
      ...fallback,
      label: category?.label ?? fallback.label
    };
  });
}

function getCategoryForBackground(currentAssetId) {
  return String(currentAssetId ?? "").startsWith("map/tiled/")
    ? "tiled"
    : "background";
}

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

function getAssetDisplayName(asset) {
  return asset.displayName ?? asset.fileName;
}

export class BackgroundPicker {
  constructor({ onSelect } = {}) {
    this.onSelect = onSelect;
    this.dialog = document.getElementById(
      "background-picker-dialog"
    );
    this.closeButton = document.getElementById(
      "close-background-picker"
    );
    this.refreshButton = document.getElementById(
      "refresh-background-picker"
    );
    this.categoryList = document.getElementById(
      "background-picker-categories"
    );
    this.breadcrumb = document.getElementById(
      "background-picker-breadcrumb"
    );
    this.categorySummary = document.getElementById(
      "background-picker-category-summary"
    );
    this.grid = document.getElementById(
      "background-picker-grid"
    );
    this.empty = document.getElementById(
      "background-picker-empty"
    );
    this.emptyTitle = document.getElementById(
      "background-picker-empty-title"
    );
    this.emptyDescription = document.getElementById(
      "background-picker-empty-description"
    );
    this.status = document.getElementById(
      "background-picker-status"
    );
    this.categories = [...BACKGROUND_CATEGORIES];
    this.assets = [];
    this.foldersByCategory = {};
    this.assetsByCategory = Object.fromEntries(
      this.categories.map((category) => [category.id, []])
    );
    this.activeCategory = "background";
    this.activeFolderId = null;
    this.currentAssetId = "";
    this.isSelecting = false;
    this.previewGeneration = 0;
    this.bindEvents();
  }

  bindEvents() {
    this.closeButton.addEventListener("click", () => this.close());
    this.dialog.addEventListener("click", (event) => {
      if (event.target === this.dialog) {
        this.close();
      }
    });
    this.refreshButton.addEventListener("click", () => this.refresh());
    this.categoryList.addEventListener("click", (event) => {
      const button = event.target.closest(
        "[data-background-category]"
      );
      if (button) {
        this.setCategory(button.dataset.backgroundCategory);
      }
    });
    this.breadcrumb.addEventListener("click", (event) => {
      const target = event.target.closest(
        "[data-background-breadcrumb-folder]"
      );
      if (!target) {
        return;
      }
      const folderId =
        target.dataset.backgroundBreadcrumbFolder || null;
      if (!folderId) {
        this.activeFolderId = null;
        this.render();
        return;
      }
      this.setFolder(folderId);
    });
    this.grid.addEventListener("click", (event) => {
      const folderChoice = event.target.closest(
        "[data-background-folder-id]"
      );
      if (folderChoice) {
        this.setFolder(folderChoice.dataset.backgroundFolderId);
        return;
      }
      const choice = event.target.closest("[data-background-id]");
      if (!choice) {
        return;
      }
      const asset = this.getActiveAssets().find(
        (item) => item.relativePath === choice.dataset.backgroundId
      );
      if (asset) {
        this.select(asset);
      }
    });
  }

  async open(currentAssetId = "") {
    this.currentAssetId = currentAssetId;
    this.activeCategory =
      getCategoryForBackground(currentAssetId);
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

  setStatus(message, isError = false) {
    this.status.textContent = message;
    this.status.classList.toggle("is-error", isError);
  }

  getActiveCategory() {
    return (
      this.categories.find(
        (category) => category.id === this.activeCategory
      ) ?? this.categories[0]
    );
  }

  getFolders() {
    return (
      this.foldersByCategory[this.activeCategory] ?? []
    );
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

  getCategoryAssets() {
    return this.assetsByCategory[this.activeCategory] ?? [];
  }

  getActiveAssets() {
    return this.getCategoryAssets().filter(
      (asset) =>
        (asset.folderId ?? null) === this.activeFolderId
    );
  }

  getCountsMessage() {
    return this.categories
      .map((category) => {
        const count =
          this.assetsByCategory[category.id]?.length ?? 0;
        return `${category.label} ${count} 个`;
      })
      .join(" · ");
  }

  setCategory(categoryId) {
    if (
      this.isSelecting ||
      !this.categories.some(
        (category) => category.id === categoryId
      )
    ) {
      return;
    }
    this.activeCategory = categoryId;
    this.activeFolderId = null;
    this.renderCategories();
    this.render();
    const category = this.getActiveCategory();
    const count = this.getCategoryAssets().length;
    this.setStatus(
      count > 0
        ? `${category.label}分类共有 ${count} 个素材。`
        : `${category.label}分类还没有素材。`
    );
  }

  setFolder(folderId) {
    if (
      this.isSelecting ||
      !this.getFolders().some(
        (folder) => folder.id === folderId
      )
    ) {
      return;
    }
    this.activeFolderId = folderId;
    this.render();
  }

  async refresh() {
    if (this.isSelecting) {
      return;
    }
    this.refreshButton.disabled = true;
    this.renderCategories();
    this.grid.innerHTML =
      '<div class="background-picker-loading">正在读取背景素材…</div>';
    this.empty.hidden = true;

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
      this.categories = getBackgroundCategories(payload);
      this.assetsByCategory = Object.fromEntries(
        this.categories.map((category) => [
          category.id,
          payload.assets?.[category.id] ?? []
        ])
      );
      this.foldersByCategory = Object.fromEntries(
        this.categories.map((category) => [
          category.id,
          payload.folders?.[category.id] ?? []
        ])
      );
      this.assets = this.categories.flatMap(
        (category) => this.assetsByCategory[category.id]
      );
      const currentAsset = this.getCategoryAssets().find(
        (asset) =>
          asset.relativePath === this.currentAssetId
      );
      this.activeFolderId =
        currentAsset?.folderId ?? null;
      this.renderCategories();
      this.render();
      this.setStatus(
        this.assets.length > 0
          ? this.getCountsMessage()
          : "素材库中还没有静态背景或 Tiled 背景"
      );
    } catch (error) {
      this.assets = [];
      this.assetsByCategory = Object.fromEntries(
        this.categories.map((category) => [category.id, []])
      );
      this.foldersByCategory = Object.fromEntries(
        this.categories.map((category) => [category.id, []])
      );
      this.activeFolderId = null;
      this.renderCategories();
      this.render();
      this.setStatus(`读取失败：${error.message}`, true);
    } finally {
      this.refreshButton.disabled = false;
    }
  }

  renderCategories() {
    if (this.categories.length === 0) {
      this.categoryList.innerHTML = "";
      return;
    }
    this.categoryList.innerHTML = this.categories
      .map((category) => {
        const count =
          this.assetsByCategory[category.id]?.length ?? 0;
        const isActive = category.id === this.activeCategory;
        return `
          <button
            class="background-picker-category ${
              isActive ? "is-active" : ""
            }"
            type="button"
            data-background-category="${escapeHtml(category.id)}"
            aria-pressed="${String(isActive)}"
          >
            <span>
              <i class="asset-subcategory-dot is-${escapeHtml(
                category.id
              )}"></i>
              ${escapeHtml(category.label)}
            </span>
            <span>${count}</span>
          </button>
        `;
      })
      .join("");
  }

  render() {
    this.previewGeneration += 1;
    const category = this.getActiveCategory();
    const folders = this.getVisibleFolders();
    const assets = this.getActiveAssets();
    const activeFolder = this.getActiveFolder();
    const breadcrumbPath = buildFolderBreadcrumbPath(
      this.getFolders(),
      this.activeFolderId,
      category.label
    );
    this.breadcrumb.innerHTML = breadcrumbPath
      .map(
        (segment, index) => `
          ${index > 0 ? '<span aria-hidden="true">/</span>' : ""}
          <button
            type="button"
            data-background-breadcrumb-folder="${escapeHtml(
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
    this.categorySummary.textContent = activeFolder
      ? `${assets.length} 个直接素材 · 共 ${
          activeFolder.assetCount ?? assets.length
        } 个`
      : `${assets.length} 个未分类素材`;
    this.emptyTitle.textContent = activeFolder
      ? `文件夹“${activeFolder.name}”还是空的`
      : `还没有${category.label}素材`;
    this.emptyDescription.textContent =
      category.emptyDescription;

    if (assets.length === 0 && folders.length === 0) {
      this.grid.innerHTML = "";
      this.empty.hidden = false;
      return;
    }

    this.empty.hidden = true;
    this.grid.innerHTML = [
      ...folders.map(
        (folder) => `
          <button
            class="background-folder-choice"
            type="button"
            data-background-folder-id="${escapeHtml(folder.id)}"
          >
            <span class="background-folder-icon" aria-hidden="true">▱</span>
            <span class="background-folder-copy">
              <strong>${escapeHtml(folder.name)}</strong>
              <small>${folder.assetCount ?? 0} 个素材</small>
            </span>
            <span class="background-folder-action">打开</span>
          </button>
        `
      ),
      ...assets
      .map(
        (asset) => {
          const isTiledMap = asset.categoryId === "tiled";
          const displayName = getAssetDisplayName(asset);
          const isCurrent =
            asset.relativePath === this.currentAssetId;
          return `
          <button
            class="background-choice ${
              isCurrent ? "is-current" : ""
            }"
            type="button"
            data-background-id="${escapeHtml(asset.relativePath)}"
          >
            <span class="background-choice-preview">
              ${
                isTiledMap
                  ? `
                    <canvas
                      class="background-choice-tiled-canvas"
                      data-background-tiled-preview="${escapeHtml(
                        asset.id
                      )}"
                      aria-label="${escapeHtml(
                        displayName
                      )} 地图预览"
                    ></canvas>
                  `
                  : `
                    <img src="${escapeHtml(
                      asset.url
                    )}" alt="${escapeHtml(
                        displayName
                    )}" loading="lazy" />
                  `
              }
              ${
                isCurrent
                  ? '<span class="background-choice-badge">当前</span>'
                  : ""
              }
            </span>
            <span class="background-choice-copy">
              <strong>${escapeHtml(displayName)}</strong>
              <small>${
                isTiledMap
                  ? `${asset.tileLayerCount ?? 0} 图层 · ${
                      asset.collisionCount ?? 0
                    } 碰撞`
                  : formatBytes(asset.size)
              }</small>
            </span>
            <span class="background-choice-action">${
              category.actionLabel
            }</span>
          </button>
        `;
        }
      )
    ].join("");
    this.startTiledPreviews();
  }

  startTiledPreviews() {
    const generation = this.previewGeneration;
    const assets = this.getActiveAssets();
    for (const canvas of this.grid.querySelectorAll(
      "[data-background-tiled-preview]"
    )) {
      const asset = assets.find(
        (item) =>
          item.categoryId === "tiled" &&
          item.id === canvas.dataset.backgroundTiledPreview
      );
      if (!asset) {
        continue;
      }
      const thumbnail = new TiledMapThumbnail(canvas, asset);
      thumbnail.start().catch((error) => {
        if (
          generation === this.previewGeneration &&
          canvas.isConnected
        ) {
          canvas.dataset.previewError = "true";
        }
        console.warn("背景 Tiled 地图预览加载失败", error);
      });
    }
  }

  async select(asset) {
    if (this.isSelecting || !this.onSelect) {
      return;
    }
    this.isSelecting = true;
    this.grid
      .querySelectorAll("button")
      .forEach((button) => (button.disabled = true));
    this.setStatus(
      `正在导入：${getAssetDisplayName(asset)}`
    );

    try {
      await this.onSelect(asset);
      this.close();
    } catch (error) {
      this.setStatus(`导入失败：${error.message}`, true);
    } finally {
      this.isSelecting = false;
      this.grid
        .querySelectorAll("button")
        .forEach((button) => (button.disabled = false));
    }
  }
}
