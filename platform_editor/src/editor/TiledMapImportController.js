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

/**
 * Tiled 地图文件夹导入交互。
 *
 * 负责候选扫描、选择弹窗和分阶段上传，不负责素材列表渲染。
 */
export class TiledMapImportController {
  constructor({
    onNotify,
    onStatus,
    onBusyChange,
    onImported,
    getMaxFileBytes,
    onResolveConflict,
    getTargetFolderId
  }) {
    this.onNotify = onNotify;
    this.onStatus = onStatus;
    this.onBusyChange = onBusyChange;
    this.onImported = onImported;
    this.getMaxFileBytes = getMaxFileBytes;
    this.onResolveConflict = onResolveConflict;
    this.getTargetFolderId = getTargetFolderId;
    this.folderButton = document.getElementById(
      "upload-tiled-folder"
    );
    this.folderInput = document.getElementById(
      "asset-tiled-folder-input"
    );
    this.dialog = document.getElementById(
      "tiled-map-select-dialog"
    );
    this.list = document.getElementById(
      "tiled-map-candidate-list"
    );
    this.selectAll = document.getElementById(
      "select-all-tiled-maps"
    );
    this.confirmButton = document.getElementById(
      "confirm-tiled-map-select"
    );
    this.cancelButton = document.getElementById(
      "cancel-tiled-map-select"
    );
    this.closeButton = document.getElementById(
      "close-tiled-map-select"
    );
    this.pendingFiles = [];
    this.pendingCandidates = [];
    this.busy = false;
    this.apiAvailable = true;
    this.bindEvents();
  }

  bindEvents() {
    this.folderButton.addEventListener("click", () => {
      if (!this.folderButton.disabled) {
        this.folderInput.click();
      }
    });
    this.folderInput.addEventListener("change", () => {
      const files = [...(this.folderInput.files ?? [])];
      this.folderInput.value = "";
      this.prepare(files);
    });
    this.cancelButton.addEventListener("click", () =>
      this.cancelSelection()
    );
    this.closeButton.addEventListener("click", () =>
      this.cancelSelection()
    );
    this.selectAll.addEventListener("change", () => {
      for (const input of this.list.querySelectorAll(
        'input[type="checkbox"]'
      )) {
        input.checked = this.selectAll.checked;
      }
    });
    this.list.addEventListener("change", () => {
      const inputs = [
        ...this.list.querySelectorAll('input[type="checkbox"]')
      ];
      const selected = inputs.filter((input) => input.checked);
      this.selectAll.checked =
        inputs.length > 0 && selected.length === inputs.length;
      this.selectAll.indeterminate =
        selected.length > 0 && selected.length < inputs.length;
    });
    this.confirmButton.addEventListener("click", () =>
      this.confirmSelection()
    );
    this.dialog.addEventListener("click", (event) => {
      if (event.target === this.dialog) {
        this.cancelSelection();
      }
    });
  }

  setVisible(visible) {
    this.folderButton.hidden = !visible;
  }

  setAvailability(apiAvailable) {
    this.apiAvailable = apiAvailable;
    this.syncBusy();
  }

  setBusy(busy) {
    this.busy = busy;
    this.syncBusy();
  }

  syncBusy() {
    this.folderButton.disabled =
      this.busy || !this.apiAvailable;
    this.folderButton.textContent = this.busy
      ? "正在导入…"
      : "导入文件夹";
  }

  cancel() {
    this.cancelSelection();
  }

  async prepare(files) {
    if (!this.apiAvailable) {
      this.onNotify(
        "素材库服务未连接，请通过 npm start 启动编辑器。",
        true
      );
      return;
    }
    if (this.busy || files.length === 0) {
      return;
    }
    const maxFileBytes = this.getMaxFileBytes();
    const invalidFile = files.find(
      (file) =>
        file.size === 0 || file.size > maxFileBytes
    );
    if (invalidFile) {
      this.onNotify(
        `${invalidFile.name}：内容为空或超过 ${formatBytes(
          maxFileBytes
        )}`,
        true
      );
      return;
    }

    const candidates = [];
    for (const file of files) {
      const extension = file.name.includes(".")
        ? `.${file.name.split(".").at(-1).toLowerCase()}`
        : "";
      if (![".json", ".tmj"].includes(extension)) {
        continue;
      }
      try {
        const document = JSON.parse(await file.text());
        if (
          document &&
          document.orientation &&
          Array.isArray(document.layers)
        ) {
          candidates.push({
            path: file.webkitRelativePath || file.name,
            name: file.name.replace(/\.(?:json|tmj)$/i, ""),
            fileName: file.name,
            width:
              Number(document.width) *
              Number(document.tilewidth),
            height:
              Number(document.height) *
              Number(document.tileheight)
          });
        }
      } catch {
        // 普通 JSON 不是 Tiled 地图候选。
      }
    }
    if (candidates.length === 0) {
      this.onNotify(
        "所选文件夹中没有可导入的 Tiled JSON/TMJ 地图。",
        true
      );
      return;
    }
    if (candidates.length === 1) {
      await this.import(files, [candidates[0].path]);
      return;
    }

    this.pendingFiles = files;
    this.pendingCandidates = candidates;
    this.selectAll.checked = true;
    this.selectAll.indeterminate = false;
    this.list.innerHTML = candidates
      .map(
        (candidate) => `
          <label class="tiled-map-candidate">
            <input
              type="checkbox"
              value="${escapeHtml(candidate.path)}"
              checked
            />
            <span>
              <strong>${escapeHtml(candidate.fileName)}</strong>
              <small>${escapeHtml(
                `${candidate.width} × ${candidate.height} · ${candidate.path}`
              )}</small>
            </span>
          </label>
        `
      )
      .join("");
    if (!this.dialog.open) {
      this.dialog.showModal();
    }
    this.onStatus(
      `发现 ${candidates.length} 个 Tiled 地图，请选择要导入的文件。`
    );
  }

  cancelSelection() {
    if (this.dialog.open) {
      this.dialog.close();
    }
    this.pendingFiles = [];
    this.pendingCandidates = [];
    this.list.innerHTML = "";
  }

  async confirmSelection() {
    const mapPaths = [
      ...this.list.querySelectorAll(
        'input[type="checkbox"]:checked'
      )
    ].map((input) => input.value);
    if (mapPaths.length === 0) {
      this.onStatus("请至少选择一个 Tiled 地图。", true);
      return;
    }
    const files = this.pendingFiles;
    this.cancelSelection();
    await this.import(files, mapPaths);
  }

  async import(files, mapPaths) {
    if (
      this.busy ||
      files.length === 0 ||
      mapPaths.length === 0
    ) {
      return;
    }
    const maxFileBytes = this.getMaxFileBytes();
    const invalidFile = files.find(
      (file) =>
        file.size === 0 || file.size > maxFileBytes
    );
    if (invalidFile) {
      this.onNotify(
        `${invalidFile.name}：内容为空或超过 ${formatBytes(
          maxFileBytes
        )}`,
        true
      );
      return;
    }

    let importId = "";
    this.onBusyChange(true);
    this.onStatus(
      `正在创建 Tiled 导入批次：${mapPaths.length} 个地图`
    );
    try {
      const beginResponse = await fetch(
        "/api/tiled-maps/imports",
        { method: "POST" }
      );
      const beginPayload = await beginResponse
        .json()
        .catch(() => ({}));
      if (!beginResponse.ok || !beginPayload.importId) {
        throw new Error(
          beginPayload.error ??
            `无法创建导入批次（${beginResponse.status}）`
        );
      }
      importId = beginPayload.importId;

      for (const [index, file] of files.entries()) {
        const relativePath =
          file.webkitRelativePath || file.name;
        this.onStatus(
          `正在上传 Tiled 文件 ${index + 1}/${files.length}：${relativePath}`
        );
        const query = new URLSearchParams({
          path: relativePath
        });
        const response = await fetch(
          `/api/tiled-maps/imports/${encodeURIComponent(
            importId
          )}/files?${query.toString()}`,
          {
            method: "PUT",
            headers: {
              "Content-Type":
                file.type || "application/octet-stream"
            },
            body: file
          }
        );
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            payload.error ??
              `${relativePath} 上传失败（${response.status}）`
          );
        }
      }

      let completePayload = {};
      const overwriteNames = [];
      const renameNames = {};
      while (true) {
        const completeResponse = await fetch(
          `/api/tiled-maps/imports/${encodeURIComponent(
            importId
          )}/complete`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              mapPaths,
              overwriteNames,
              renameNames,
              folderId: this.getTargetFolderId?.() ?? null
            })
          }
        );
        completePayload = await completeResponse
          .json()
          .catch(() => ({}));
        if (
          completeResponse.status === 409 &&
          completePayload.code === "TILED_NAME_CONFLICT" &&
          overwriteNames.length === 0 &&
          Object.keys(renameNames).length === 0
        ) {
          const conflicts = completePayload.conflicts ?? [];
          for (const conflict of conflicts) {
            const decision = await this.onResolveConflict({
              title: "目标文件夹已有同名 Tiled 背景",
              description: `“${conflict.name}”已存在，请选择处理方式。`,
              suggestedName:
                conflict.suggestedName ?? conflict.name,
              itemKind: "asset",
              cancelLabel: "不导入"
            });
            if (decision.action === "cancel") {
              throw new Error("已取消导入同名素材");
            }
            if (decision.action === "overwrite") {
              overwriteNames.push(conflict.name);
            } else if (decision.action === "rename") {
              renameNames[conflict.name] =
                decision.name;
            }
          }
          continue;
        }
        if (!completeResponse.ok) {
          throw new Error(
            completePayload.error ??
              `Tiled 导入失败（${completeResponse.status}）`
          );
        }
        break;
      }
      importId = "";
      this.onBusyChange(false);
      const importedNames = (completePayload.assets ?? [])
        .map((asset) => asset.name)
        .join("、");
      await this.onImported();
      this.onStatus(
        `已导入 Tiled 地图：${importedNames || `${mapPaths.length} 个文件`}`
      );
      this.onNotify("Tiled 地图已加入素材库");
    } catch (error) {
      if (importId) {
        fetch(
          `/api/tiled-maps/imports/${encodeURIComponent(importId)}`,
          { method: "DELETE" }
        ).catch(() => {});
      }
      this.onStatus(`Tiled 导入失败：${error.message}`, true);
      this.onNotify(
        `Tiled 导入失败：${error.message}`,
        true
      );
    } finally {
      this.onBusyChange(false);
    }
  }
}
