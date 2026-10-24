import {
  getContentEntry,
  getContentModuleDefinition,
  insertContentEntry,
  duplicateContentEntry as duplicateContent,
  removeContentEntry,
  validateContentDocument
} from "../model/ContentModel.js";

const moduleNotes = Object.freeze({
  conversations: {
    title: "会话节点",
    copy:
      "保存一段会话内容与基础说明。发言者、对白行等专用字段会在后续 contract 版本中扩展。"
  },
  quests: {
    title: "任务结构",
    copy:
      "保存任务前置、物品完成条件与完成奖励；任务激活流程由后续运行时系统接入。"
  },
  items: {
    title: "物品结构",
    copy:
      "配置一级/二级类型、稀有度、堆叠上限、买卖价格、描述与特殊效果实现；类型库在整个物品模块内共享，暂不接入游戏运行时。"
  },
  animations: {
    title: "动画演绎节点",
    copy:
      "保存一段动画演绎内容。素材绑定与播放参数会在后续 contract 版本中扩展。"
  },
  characters: {
    title: "角色编辑结构",
    copy:
      "保存角色属性、动画资源、方向、帧速、攻击帧与键鼠触发绑定；当前只设计数据结构，暂不与游戏运行时联动。"
  }
});

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

class LegacyContentWorkspace {
  constructor(store, { onNotify = () => {}, onStateChange = () => {} } = {}) {
    this.store = store;
    this.onNotify = onNotify;
    this.onStateChange = onStateChange;
    this.activeModule = "conversations";
    this.els = {
      moduleTitle: document.getElementById("content-module-title"),
      modulePrefix: document.getElementById(
        "content-module-prefix"
      ),
      newEntry: document.getElementById("new-content-entry"),
      emptyNewEntry: document.getElementById(
        "empty-new-content-entry"
      ),
      duplicateEntry: document.getElementById(
        "duplicate-content-entry"
      ),
      entryList: document.getElementById("content-entry-list"),
      editorEyebrow: document.getElementById(
        "content-editor-eyebrow"
      ),
      entryTitle: document.getElementById("content-entry-title"),
      entryId: document.getElementById("content-entry-id"),
      undo: document.getElementById("undo-content"),
      redo: document.getElementById("redo-content"),
      empty: document.getElementById("content-empty"),
      form: document.getElementById("content-form"),
      idField: document.getElementById("content-id-field"),
      nameField: document.getElementById("content-name-field"),
      descriptionField: document.getElementById(
        "content-description-field"
      ),
      modulePrefixNote: document.getElementById(
        "content-module-prefix-note"
      ),
      moduleNoteTitle: document.getElementById(
        "content-module-note-title"
      ),
      moduleNoteCopy: document.getElementById(
        "content-module-note-copy"
      ),
      deleteEntry: document.getElementById("delete-content-entry"),
      status: document.getElementById("content-status-message"),
      count: document.getElementById("content-entry-count"),
      exportJson: document.getElementById("export-content")
    };
    this.bindEvents();
    this.store.subscribe((reason) => {
      this.render();
      this.onStateChange(reason);
    });
    this.render();
  }

  setModule(moduleKey) {
    const definition = getContentModuleDefinition(moduleKey);
    if (!definition) {
      return;
    }
    this.activeModule = moduleKey;
    const selection = this.store.selection;
    if (selection?.moduleKey !== moduleKey) {
      const first = this.store.document[moduleKey]?.[0];
      this.store.setSelection(
        first ? { moduleKey, id: first.id } : null
      );
    }
    this.render();
  }

  bindEvents() {
    this.els.newEntry.addEventListener("click", () =>
      this.createEntry()
    );
    this.els.emptyNewEntry.addEventListener("click", () =>
      this.createEntry()
    );
    this.els.duplicateEntry.addEventListener("click", () =>
      this.duplicateEntry()
    );
    this.els.entryList.addEventListener("click", (event) => {
      const card = event.target.closest("[data-content-id]");
      if (!card) {
        return;
      }
      this.store.setSelection({
        moduleKey: this.activeModule,
        id: card.dataset.contentId
      });
    });
    this.els.form.addEventListener("submit", (event) =>
      event.preventDefault()
    );
    this.els.form.addEventListener("input", (event) => {
      const field = event.target.dataset.contentField;
      const selection = this.store.selection;
      if (!field || !selection) {
        return;
      }
      this.store.update(
        (draft) => {
          const entry = getContentEntry(draft, selection.id);
          if (entry) {
            entry[field] = event.target.value;
          }
        },
        {
          coalesceKey: `content:${selection.id}:${field}`
        }
      );
    });
    this.els.deleteEntry.addEventListener("click", () =>
      this.deleteEntry()
    );
    this.els.undo.addEventListener("click", () => this.store.undo());
    this.els.redo.addEventListener("click", () => this.store.redo());
    this.els.exportJson.addEventListener("click", () =>
      this.exportJson()
    );
  }

  createEntry() {
    let selection = null;
    this.store.update((draft) => {
      selection = insertContentEntry(
        draft,
        this.activeModule
      ).selection;
    });
    if (selection) {
      this.store.setSelection(selection);
      const definition = getContentModuleDefinition(
        this.activeModule
      );
      this.setStatus(
        `已新建${definition.label} ${selection.id}`
      );
      requestAnimationFrame(() => this.els.nameField.select());
    }
  }

  duplicateEntry() {
    if (!this.store.selection) {
      return;
    }
    let result = null;
    this.store.update((draft) => {
      result = duplicateContent(draft, this.store.selection);
    });
    if (result) {
      this.store.setSelection(result.selection);
      this.setStatus(`已复制为 ${result.entry.id}`);
    }
  }

  deleteEntry() {
    const selection = this.store.selection;
    if (!selection) {
      return;
    }
    const entry = getContentEntry(
      this.store.document,
      selection.id
    );
    if (
      !window.confirm(
        `确定删除「${entry?.name || selection.id}」吗？该 ID 不会再次分配。`
      )
    ) {
      return;
    }
    this.store.update((draft) => {
      removeContentEntry(draft, selection);
    });
    const next =
      this.store.document[this.activeModule]?.[0] ?? null;
    this.store.setSelection(
      next
        ? { moduleKey: this.activeModule, id: next.id }
        : null
    );
    this.setStatus(`已删除 ${selection.id}`);
  }

  render() {
    const definition =
      getContentModuleDefinition(this.activeModule) ??
      getContentModuleDefinition("conversations");
    const entries = this.store.document[definition.key] ?? [];
    const selection = this.store.selection;
    const selected =
      selection?.moduleKey === definition.key
        ? getContentEntry(this.store.document, selection.id)
        : null;
    const note = moduleNotes[definition.key];

    this.els.moduleTitle.textContent = definition.label;
    this.els.modulePrefix.textContent = definition.prefix;
    this.els.newEntry.textContent = `新建${definition.entryLabel}`;
    this.els.emptyNewEntry.textContent =
      `新建${definition.entryLabel}`;
    this.els.editorEyebrow.textContent =
      `${definition.prefix} · ${definition.label}`;
    this.els.modulePrefixNote.textContent =
      `${definition.prefix} · ${definition.label}`;
    this.els.moduleNoteTitle.textContent = note.title;
    this.els.moduleNoteCopy.textContent = note.copy;
    this.els.count.textContent = `${entries.length} 项`;
    this.els.duplicateEntry.disabled = !selected;
    this.els.undo.disabled = this.store.history.length === 0;
    this.els.redo.disabled = this.store.future.length === 0;

    this.renderEntryList(entries, selected);

    this.els.empty.hidden = Boolean(selected);
    this.els.form.hidden = !selected;
    if (!selected) {
      this.els.entryTitle.textContent = entries.length
        ? "选择一个内容项"
        : `还没有${definition.label}`;
      this.els.entryId.textContent = "";
      this.els.idField.value = "";
      this.els.nameField.value = "";
      this.els.descriptionField.value = "";
      return;
    }

    this.els.entryTitle.textContent =
      selected.name || "未命名内容";
    this.els.entryId.textContent = selected.id;
    if (this.els.idField.value !== selected.id) {
      this.els.idField.value = selected.id;
    }
    if (this.els.nameField.value !== selected.name) {
      this.els.nameField.value = selected.name;
    }
    if (
      this.els.descriptionField.value !==
      (selected.description ?? "")
    ) {
      this.els.descriptionField.value =
        selected.description ?? "";
    }
  }

  renderEntryList(entries, selected) {
    if (entries.length === 0) {
      this.els.entryList.innerHTML = `
        <div class="content-list-empty">
          当前模块为空
        </div>
      `;
      return;
    }
    this.els.entryList.innerHTML = entries
      .map(
        (entry) => `
          <button
            class="content-entry-card ${
              selected?.id === entry.id ? "is-active" : ""
            }"
            type="button"
            data-content-id="${escapeHtml(entry.id)}"
          >
            <span class="content-entry-card-id">${escapeHtml(
              entry.id
            )}</span>
            <strong>${escapeHtml(entry.name || "未命名")}</strong>
            <small>${escapeHtml(
              entry.description || "暂无说明"
            )}</small>
          </button>
        `
      )
      .join("");
  }

  exportJson() {
    const errors = validateContentDocument(
      this.store.document
    ).filter((issue) => issue.severity === "error");
    if (errors.length > 0) {
      this.onNotify(errors[0].message, true);
      return;
    }
    const body = `${JSON.stringify(
      this.store.document,
      null,
      2
    )}\n`;
    const blob = new Blob([body], {
      type: "application/json;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "content.json";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.setStatus("已导出 content.json");
  }

  setStatus(message) {
    this.els.status.textContent = message;
  }
}

export {
  ConversationContentWorkspace as ContentWorkspace
} from "./ConversationContentWorkspace.js";
