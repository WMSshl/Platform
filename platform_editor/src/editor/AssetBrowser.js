import { buildFolderBreadcrumbPath } from "./folder-breadcrumb.js";

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

function defaultPreview(asset) {
  return `
    <img
      src="${escapeHtml(asset.url)}"
      alt="${escapeHtml(asset.displayName ?? asset.fileName)}"
      loading="lazy"
    />
  `;
}

export function renderAudioAssetPreview(asset) {
  return `
    <span class="background-choice-audio">
      <span class="background-choice-audio-glyph" aria-hidden="true">♪</span>
      <small>${escapeHtml(asset.audioFormat || "音频")}</small>
    </span>
  `;
}

/**
 * 素材库文件夹浏览器。
 *
 * 只负责读取 /api/assets、切换分类与文件夹、渲染素材卡片；
 * 选中素材后通过 onChoose 交给调用方决定是立即使用还是继续配置。
 * 物品插图和角色动画绑定共用这一套浏览体验。
 */
export class AssetBrowser {
  constructor({
    categoryList = null,
    breadcrumb,
    summary,
    grid,
    empty = null,
    emptyTitle = null,
    emptyDescription = null,
    status = null,
    categories,
    onChoose = () => {},
    prepareAsset = async (asset) => asset,
    renderPreview = defaultPreview,
    getAssetLabel = (asset) =>
      asset.displayName ?? asset.fileName,
    getAssetMeta = (asset) => formatBytes(asset.size),
    getAssetAction = (asset, category) =>
      category.actionLabel ?? "",
    onAfterRender = () => {}
  }) {
    this.categoryList = categoryList;
    this.breadcrumb = breadcrumb;
    this.summary = summary;
    this.grid = grid;
    this.empty = empty;
    this.emptyTitle = emptyTitle;
    this.emptyDescription = emptyDescription;
    this.status = status;
    this.categories = categories;
    this.onChoose = onChoose;
    this.prepareAsset = prepareAsset;
    this.renderPreview = renderPreview;
    this.getAssetLabel = getAssetLabel;
    this.getAssetMeta = getAssetMeta;
    this.getAssetAction = getAssetAction;
    this.onAfterRender = onAfterRender;
    this.assetsByCategory = {};
    this.foldersByCategory = {};
    this.activeCategory = categories[0]?.id ?? "";
    this.activeFolderId = null;
    this.currentAssetId = "";
    this.selectedAsset = null;
    this.previewAudio = null;
    this.previewAudioAsset = null;
    this.loading = false;
    this.bindEvents();
  }

  bindEvents() {
    this.categoryList?.addEventListener("click", (event) => {
      const button = event.target.closest(
        "[data-asset-browser-category]"
      );
      if (button) {
        this.setCategory(button.dataset.assetBrowserCategory);
      }
    });
    this.breadcrumb.addEventListener("click", (event) => {
      const target = event.target.closest(
        "[data-asset-browser-breadcrumb]"
      );
      if (!target) {
        return;
      }
      this.setFolder(
        target.dataset.assetBrowserBreadcrumb || null
      );
    });
    this.grid.addEventListener("click", (event) => {
      const audioButton = event.target.closest(
        "[data-asset-browser-audio-play]"
      );
      if (audioButton) {
        event.preventDefault();
        event.stopPropagation();
        this.toggleAudioPreview(audioButton);
        return;
      }
      const folder = event.target.closest(
        "[data-asset-browser-folder]"
      );
      if (folder) {
        this.setFolder(folder.dataset.assetBrowserFolder);
        return;
      }
      const card = event.target.closest(
        "[data-asset-browser-asset]"
      );
      if (!card) {
        return;
      }
      const asset = this.getActiveAssets().find(
        (item) =>
          item.relativePath ===
          card.dataset.assetBrowserAsset
      );
      if (asset) {
        this.selectAsset(asset);
      }
    });
  }

  reset() {
    this.stopAudioPreview();
    this.activeCategory = this.categories[0]?.id ?? "";
    this.activeFolderId = null;
    this.currentAssetId = "";
    this.selectedAsset = null;
  }

  async open({
    categoryId = this.categories[0]?.id ?? "",
    currentAssetId = ""
  } = {}) {
    this.stopAudioPreview();
    this.activeCategory = categoryId;
    this.activeFolderId = null;
    this.currentAssetId = currentAssetId;
    this.selectedAsset = null;
    await this.refresh();
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

  getCategoryAssets() {
    return this.assetsByCategory[this.activeCategory] ?? [];
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

  getActiveAssets() {
    return this.getCategoryAssets().filter(
      (asset) =>
        (asset.folderId ?? null) === this.activeFolderId
    );
  }

  getFolderPath(folderId) {
    const folders = this.getFolders();
    const names = [];
    const visited = new Set();
    let folder = folders.find((item) => item.id === folderId);
    while (folder && !visited.has(folder.id)) {
      visited.add(folder.id);
      names.unshift(folder.name);
      folder = folder.parentId
        ? folders.find((item) => item.id === folder.parentId)
        : null;
    }
    return names.join(" / ");
  }

  setStatus(message, isError = false) {
    if (!this.status) {
      return;
    }
    this.status.textContent = message;
    this.status.classList.toggle("is-error", isError);
  }

  setCategory(categoryId) {
    if (
      !this.categories.some(
        (category) => category.id === categoryId
      )
    ) {
      return;
    }
    this.activeCategory = categoryId;
    this.activeFolderId = null;
    this.selectedAsset = null;
    this.stopAudioPreview();
    this.renderCategories();
    this.render();
  }

  setFolder(folderId) {
    if (
      folderId &&
      !this.getFolders().some((folder) => folder.id === folderId)
    ) {
      return;
    }
    this.activeFolderId = folderId || null;
    this.stopAudioPreview();
    this.render();
  }

  async refresh() {
    if (this.loading) {
      return;
    }
    this.stopAudioPreview();
    this.loading = true;
    this.setStatus("正在读取素材…");
    if (this.grid) {
      this.grid.innerHTML =
        '<div class="background-picker-loading">正在读取素材…</div>';
    }
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

      this.assetsByCategory = {};
      for (const category of this.categories) {
        const rawAssets = payload.assets?.[category.id] ?? [];
        this.assetsByCategory[category.id] = await Promise.all(
          rawAssets.map((asset) => this.prepareAsset(asset))
        );
      }
      this.foldersByCategory = Object.fromEntries(
        this.categories.map((category) => [
          category.id,
          payload.folders?.[category.id] ?? []
        ])
      );

      if (this.currentAssetId) {
        const currentAsset = this.getCategoryAssets().find(
          (asset) =>
            asset.relativePath === this.currentAssetId
        );
        this.activeFolderId =
          currentAsset?.folderId ?? null;
      }

      this.renderCategories();
      this.render();
      const total = this.categories.reduce(
        (count, category) =>
          count +
          (this.assetsByCategory[category.id]?.length ?? 0),
        0
      );
      this.setStatus(
        total > 0
          ? this.categories
              .map(
                (category) =>
                  `${category.label} ${
                    this.assetsByCategory[category.id]?.length ??
                    0
                  } 个`
              )
              .join(" · ")
          : "素材库中还没有可用素材"
      );
    } catch (error) {
      this.assetsByCategory = {};
      this.foldersByCategory = {};
      this.activeFolderId = null;
      this.renderCategories();
      this.render();
      this.setStatus(`读取失败：${error.message}`, true);
    } finally {
      this.loading = false;
    }
  }

  renderCategories() {
    if (!this.categoryList) {
      return;
    }
    this.categoryList.innerHTML = this.categories
      .map((category) => {
        const count =
          this.assetsByCategory[category.id]?.length ?? 0;
        const isActive =
          category.id === this.activeCategory;
        return `
          <button
            class="background-picker-category ${
              isActive ? "is-active" : ""
            }"
            type="button"
            data-asset-browser-category="${escapeHtml(
              category.id
            )}"
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
    const category = this.getActiveCategory();
    if (!category) {
      return;
    }
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
            data-asset-browser-breadcrumb="${escapeHtml(
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

    if (this.summary) {
      this.summary.textContent = activeFolder
        ? `文件夹“${activeFolder.name}” · ${assets.length} 个素材`
        : `${assets.length} 个未分类素材`;
    }
    if (this.emptyTitle) {
      this.emptyTitle.textContent = activeFolder
        ? `文件夹“${activeFolder.name}”还是空的`
        : `还没有${category.label}素材`;
    }
    if (this.emptyDescription) {
      this.emptyDescription.textContent =
        category.emptyDescription ??
        `请先在素材库的“${category.label}”中上传素材。`;
    }

    if (assets.length === 0 && folders.length === 0) {
      this.grid.innerHTML = "";
      if (this.empty) {
        this.empty.hidden = false;
      }
      this.onAfterRender([]);
      return;
    }
    if (this.empty) {
      this.empty.hidden = true;
    }

    const folderCards = folders
      .map((folder) => {
        const assetCount = this.getCategoryAssets().filter(
          (asset) =>
            (asset.folderId ?? null) === folder.id
        ).length;
        return `
          <button
            class="background-folder-choice"
            type="button"
            data-asset-browser-folder="${escapeHtml(
              folder.id
            )}"
          >
            <span class="background-folder-icon" aria-hidden="true">▱</span>
            <span class="background-folder-copy">
              <strong>${escapeHtml(folder.name)}</strong>
              <small>${assetCount} 个素材</small>
            </span>
            <span class="background-folder-action">打开</span>
          </button>
        `;
      })
      .join("");

    const assetCards = assets
      .map((asset, index) => {
        const label = this.getAssetLabel(asset);
        const selected =
          this.selectedAsset?.relativePath ===
          asset.relativePath;
        const current =
          asset.relativePath === this.currentAssetId ||
          selected;
        const action = this.getAssetAction(asset, category);
        const card = `
          <button
            class="background-choice ${
              current ? "is-current" : ""
            }"
            type="button"
            data-asset-browser-asset="${escapeHtml(
              asset.relativePath
            )}"
            data-asset-browser-index="${index}"
          >
            <span class="background-choice-preview">
              ${this.renderPreview(asset, index)}
            </span>
            <span class="background-choice-copy">
              <strong>${escapeHtml(label)}</strong>
              <small>${escapeHtml(
                this.getAssetMeta(asset)
              )}</small>
            </span>
            ${
              action
                ? `<span class="background-choice-action">${escapeHtml(
                    action
                  )}</span>`
                : ""
            }
          </button>
        `;
        if (!this.isAudioAsset(asset)) {
          return card;
        }
        return `
          <div class="background-choice-wrap">
            ${card}
            <button
              class="background-choice-audio-play"
              type="button"
              data-asset-browser-audio-play="${escapeHtml(
                asset.relativePath
              )}"
              aria-label="试听 ${escapeHtml(label)}"
              title="试听"
            >
              <span
                class="asset-audio-play-glyph"
                aria-hidden="true"
              ></span>
            </button>
          </div>
        `;
      })
      .join("");

    this.grid.innerHTML = folderCards + assetCards;
    this.syncAudioPreviewButtons();
    this.onAfterRender(assets);
  }

  isAudioAsset(asset) {
    return Boolean(
      asset?.audioFormat ||
        String(asset?.mimeType ?? "").startsWith("audio/")
    );
  }

  toggleAudioPreview(button) {
    const asset = this.getActiveAssets().find(
      (candidate) =>
        candidate.relativePath ===
        button.dataset.assetBrowserAudioPlay
    );
    if (!asset) {
      return;
    }
    if (
      this.previewAudio &&
      this.previewAudioAsset?.relativePath === asset.relativePath
    ) {
      if (this.previewAudio.paused) {
        this.previewAudio
          .play()
          .catch((error) =>
            this.setStatus(`试听失败：${error.message}`, true)
          );
      } else {
        this.previewAudio.pause();
      }
      this.syncAudioPreviewButtons();
      return;
    }
    this.stopAudioPreview();
    const audio = new Audio(asset.url);
    this.previewAudio = audio;
    this.previewAudioAsset = asset;
    audio.addEventListener("play", () =>
      this.syncAudioPreviewButtons()
    );
    audio.addEventListener("pause", () =>
      this.syncAudioPreviewButtons()
    );
    audio.addEventListener("ended", () =>
      this.syncAudioPreviewButtons()
    );
    audio.play().catch((error) => {
      this.setStatus(`试听失败：${error.message}`, true);
      this.stopAudioPreview();
    });
    this.syncAudioPreviewButtons();
  }

  syncAudioPreviewButtons() {
    for (const button of this.grid.querySelectorAll(
      "[data-asset-browser-audio-play]"
    )) {
      const playing =
        this.previewAudioAsset?.relativePath ===
          button.dataset.assetBrowserAudioPlay &&
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

  selectAsset(asset) {
    this.selectedAsset = {
      ...asset,
      folderPath: this.getFolderPath(asset.folderId)
    };
    for (const card of this.grid.querySelectorAll(
      "[data-asset-browser-asset]"
    )) {
      card.classList.toggle(
        "is-current",
        card.dataset.assetBrowserAsset ===
          asset.relativePath
      );
    }
    this.onChoose(this.selectedAsset);
  }
}

/**
 * 把 AssetBrowser 包进一个独立 dialog，适合“选完立即生效”的场景。
 */
export class AssetPickerDialog {
  constructor({
    dialog,
    closeButton,
    refreshButton,
    categories,
    browser,
    status
  }) {
    this.dialog = dialog;
    this.closeButton = closeButton;
    this.refreshButton = refreshButton;
    this.status = status;
    this.onSelect = null;
    this.busy = false;
    this.browser = new AssetBrowser({
      categories,
      status,
      ...browser,
      onChoose: (asset) => this.choose(asset)
    });
    this.closeButton.addEventListener("click", () => this.close());
    this.dialog.addEventListener("close", () =>
      this.browser.stopAudioPreview()
    );
    this.dialog.addEventListener("click", (event) => {
      if (event.target === this.dialog) {
        this.close();
      }
    });
    this.refreshButton?.addEventListener("click", () =>
      this.browser.refresh()
    );
  }

  async open({
    currentAssetId = "",
    onSelect = this.onSelect
  } = {}) {
    this.onSelect = onSelect;
    if (!this.dialog.open) {
      this.dialog.showModal();
    }
    await this.browser.open({
      currentAssetId
    });
  }

  async choose(asset) {
    if (this.busy || !this.onSelect) {
      return;
    }
    this.busy = true;
    try {
      this.browser.stopAudioPreview();
      await this.onSelect(asset);
      this.close();
    } catch (error) {
      this.browser.setStatus(
        `导入失败：${error.message}`,
        true
      );
    } finally {
      this.busy = false;
    }
  }

  close() {
    this.browser.stopAudioPreview();
    if (this.dialog.open) {
      this.dialog.close();
    }
  }
}
