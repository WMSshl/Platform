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
    this.grid = document.getElementById(
      "background-picker-grid"
    );
    this.empty = document.getElementById(
      "background-picker-empty"
    );
    this.status = document.getElementById(
      "background-picker-status"
    );
    this.assets = [];
    this.currentAssetId = "";
    this.isSelecting = false;
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
    this.grid.addEventListener("click", (event) => {
      const choice = event.target.closest("[data-background-id]");
      if (!choice) {
        return;
      }
      const asset = this.assets.find(
        (item) => item.relativePath === choice.dataset.backgroundId
      );
      if (asset) {
        this.select(asset);
      }
    });
  }

  async open(currentAssetId = "") {
    this.currentAssetId = currentAssetId;
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

  async refresh() {
    if (this.isSelecting) {
      return;
    }
    this.refreshButton.disabled = true;
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
      this.assets = payload.assets?.background ?? [];
      this.render();
      this.setStatus(
        this.assets.length > 0
          ? `共 ${this.assets.length} 个背景素材`
          : "素材库中还没有背景素材"
      );
    } catch (error) {
      this.assets = [];
      this.render();
      this.setStatus(`读取失败：${error.message}`, true);
    } finally {
      this.refreshButton.disabled = false;
    }
  }

  render() {
    if (this.assets.length === 0) {
      this.grid.innerHTML = "";
      this.empty.hidden = false;
      return;
    }

    this.empty.hidden = true;
    this.grid.innerHTML = this.assets
      .map(
        (asset) => `
          <button
            class="background-choice ${
              asset.relativePath === this.currentAssetId
                ? "is-current"
                : ""
            }"
            type="button"
            data-background-id="${escapeHtml(asset.relativePath)}"
          >
            <span class="background-choice-preview">
              <img src="${escapeHtml(
                asset.url
              )}" alt="${escapeHtml(
                asset.fileName
              )}" loading="lazy" />
              ${
                asset.relativePath === this.currentAssetId
                  ? '<span class="background-choice-badge">当前</span>'
                  : ""
              }
            </span>
            <span class="background-choice-copy">
              <strong>${escapeHtml(asset.fileName)}</strong>
              <small>${formatBytes(asset.size)}</small>
            </span>
            <span class="background-choice-action">使用此背景</span>
          </button>
        `
      )
      .join("");
  }

  async select(asset) {
    if (this.isSelecting || !this.onSelect) {
      return;
    }
    this.isSelecting = true;
    this.grid
      .querySelectorAll("button")
      .forEach((button) => (button.disabled = true));
    this.setStatus(`正在导入：${asset.fileName}`);

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
