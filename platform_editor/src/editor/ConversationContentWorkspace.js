import {
  CURRENT_CONTENT_SCHEMA_VERSION,
  MAX_RECENT_CONVERSATIONS
} from "../contract/index.js";
import {
  duplicateContentFolder,
  duplicateContentEntry,
  getContentEntry,
  getContentFolder,
  getContentFolderPath,
  getContentFolders,
  getContentModuleDefinition,
  getContentModuleForId,
  getItemTypeSummary,
  insertContentEntry,
  insertContentFolder,
  moveContentEntry,
  moveContentFolder,
  removeContentEntry,
  removeContentFolder,
  renameContentFolder,
  reorderRecentConversation,
  touchRecentConversation,
  validateContentDocument
} from "../model/ContentModel.js";
import { AssetPickerDialog } from "./AssetBrowser.js";
import { CharacterContentEditor } from "./CharacterContentEditor.js";
import { ItemContentEditor } from "./ItemContentEditor.js";
import { QuestContentEditor } from "./QuestContentEditor.js";

const moduleNotes = Object.freeze({
  conversations: {
    title: "会话文件",
    copy:
      "会话按文件夹组织；最近打开列表最多保留 10 项。"
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

function isTypingTarget(target) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target?.isContentEditable
  );
}

export class ConversationContentWorkspace {
  constructor(
    store,
    { onNotify = () => {}, onStateChange = () => {} } = {}
  ) {
    this.store = store;
    this.onNotify = onNotify;
    this.onStateChange = onStateChange;
    this.activeModule = "conversations";
    this.currentFolderId = null;
    this.clipboard = null;
    this.contextTarget = null;
    this.dragPayload = null;
    this.expandedDialogueIds = new Set();
    this.dialogueDragId = null;
    this.dialogueContextTarget = null;
    this.dialogueInputLock = false;
    this.els = {
      workspace: document.getElementById("content-workspace"),
      moduleTitle: document.getElementById("content-module-title"),
      sidebarEyebrow: document.getElementById(
        "content-sidebar-eyebrow"
      ),
      modulePrefix: document.getElementById(
        "content-module-prefix"
      ),
      newEntry: document.getElementById("new-content-entry"),
      emptyNewEntry: document.getElementById(
        "empty-new-content-entry"
      ),
      browserNewEntry: document.getElementById(
        "browser-new-content-entry"
      ),
      newFolder: document.getElementById("new-content-folder"),
      entryList: document.getElementById("content-entry-list"),
      sidebarNote: document.getElementById(
        "content-sidebar-note"
      ),
      explorer: document.getElementById("content-explorer"),
      toolbar: document.getElementById(
        "content-explorer-toolbar"
      ),
      editorScroll: document.getElementById(
        "content-editor-scroll"
      ),
      breadcrumb: document.getElementById("content-breadcrumb"),
      dropZone: document.getElementById(
        "content-browser-drop-zone"
      ),
      browserGrid: document.getElementById("content-browser-grid"),
      browserSummary: document.getElementById(
        "content-browser-summary"
      ),
      browserEmpty: document.getElementById(
        "content-browser-empty"
      ),
      browserEmptyTitle: document.getElementById(
        "content-browser-empty-title"
      ),
      browserEmptyCopy: document.getElementById(
        "content-browser-empty-copy"
      ),
      editorEyebrow: document.getElementById(
        "content-editor-eyebrow"
      ),
      entryTitle: document.getElementById("content-entry-title"),
      entryId: document.getElementById("content-entry-id"),
      undo: document.getElementById("undo-content"),
      redo: document.getElementById("redo-content"),
      empty: document.getElementById("content-empty"),
      emptyTitle: document.getElementById("content-empty-title"),
      emptyCopy: document.getElementById("content-empty-copy"),
      form: document.getElementById("content-form"),
      idField: document.getElementById("content-id-field"),
      idLabel: document.getElementById("content-id-label"),
      nameField: document.getElementById("content-name-field"),
      itemIllustrationButton: document.getElementById(
        "item-illustration-button"
      ),
      descriptionField: document.getElementById(
        "content-description-field"
      ),
      descriptionFieldWrap: document.getElementById(
        "content-description-field-wrap"
      ),
      nameLabel: document.getElementById("content-name-label"),
      descriptionLabel: document.getElementById(
        "content-description-label"
      ),
      schemaNote: document.getElementById("content-schema-note"),
      dialogueSection: document.getElementById(
        "content-dialogue-section"
      ),
      questSection: document.getElementById(
        "content-quest-section"
      ),
      itemSection: document.getElementById(
        "content-item-section"
      ),
      characterSection: document.getElementById(
        "content-character-section"
      ),
      dialogueList: document.getElementById(
        "content-dialogue-list"
      ),
      dialogueEmpty: document.getElementById(
        "content-dialogue-empty"
      ),
      dialogueCount: document.getElementById(
        "content-dialogue-count"
      ),
      addDialogueLine: document.getElementById(
        "add-content-dialogue-line"
      ),
      dialogueContextMenu: document.getElementById(
        "dialogue-context-menu"
      ),
      moduleSection: document.getElementById(
        "content-module-section"
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
      deleteEntry: document.getElementById(
        "delete-content-entry"
      ),
      dangerSection: document.getElementById(
        "content-danger-section"
      ),
      status: document.getElementById("content-status-message"),
      count: document.getElementById("content-entry-count"),
      exportJson: document.getElementById("export-content"),
      contextMenu: document.getElementById("content-context-menu")
    };
    this.questEditor = new QuestContentEditor(this.store, {
      root: this.els.questSection,
      onStatus: (message) => this.setStatus(message)
    });
    this.itemIllustrationPicker = new AssetPickerDialog({
      dialog: document.getElementById(
        "item-illustration-dialog"
      ),
      closeButton: document.getElementById(
        "close-item-illustration"
      ),
      refreshButton: document.getElementById(
        "refresh-item-illustration"
      ),
      status: document.getElementById(
        "item-illustration-status"
      ),
      categories: [
        {
          id: "static",
          label: "静态贴图",
          actionLabel: "使用此插图",
          emptyDescription:
            "请先在素材库的“静态贴图”中上传图片。"
        }
      ],
      browser: {
        categoryList: document.getElementById(
          "item-illustration-categories"
        ),
        breadcrumb: document.getElementById(
          "item-illustration-breadcrumb"
        ),
        summary: document.getElementById(
          "item-illustration-summary"
        ),
        grid: document.getElementById(
          "item-illustration-grid"
        ),
        empty: document.getElementById(
          "item-illustration-empty"
        ),
        emptyTitle: document.getElementById(
          "item-illustration-empty-title"
        ),
        emptyDescription: document.getElementById(
          "item-illustration-empty-description"
        )
      }
    });
    this.itemEditor = new ItemContentEditor(this.store, {
      root: this.els.itemSection,
      onStatus: (message) => this.setStatus(message),
      onNotify: (message, isError) =>
        this.onNotify(message, isError),
      illustrationButton:
        this.els.itemIllustrationButton,
      illustrationPicker: this.itemIllustrationPicker
    });
    this.characterEditor = new CharacterContentEditor(
      this.store,
      {
        root: this.els.characterSection,
        onStatus: (message) => this.setStatus(message),
        onNotify: (message, isError) =>
          this.onNotify(message, isError)
      }
    );
    this.bindEvents();
    this.store.subscribe((reason) => {
      this.render();
      this.onStateChange(reason);
    });
    this.render();
  }

  get isConversations() {
    return this.activeModule === "conversations";
  }

  setModule(moduleKey) {
    const definition = getContentModuleDefinition(moduleKey);
    if (!definition) {
      return;
    }
    if (this.activeModule !== moduleKey) {
      this.currentFolderId = null;
      this.clipboard = null;
      this.expandedDialogueIds.clear();
      this.closeContextMenu();
      this.closeDialogueContextMenu();
    }
    this.activeModule = moduleKey;
    const selection = this.store.selection;
    if (selection?.moduleKey !== moduleKey) {
      this.store.setSelection(null);
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
    this.els.browserNewEntry.addEventListener("click", () =>
      this.createEntry()
    );
    this.els.newFolder.addEventListener("click", () =>
      this.createFolder()
    );
    this.els.entryList.addEventListener("click", (event) =>
      this.handleSidebarClick(event)
    );
    this.els.browserGrid.addEventListener("click", (event) =>
      this.handleBrowserClick(event)
    );
    this.bindBreadcrumbEvents();
    this.bindRecentDragEvents();
    this.bindBrowserDragEvents();
    this.bindContextMenuEvents();

    this.els.form.addEventListener("submit", (event) =>
      event.preventDefault()
    );
    this.els.form.addEventListener("input", (event) =>
      this.handleFormInput(event)
    );
    this.bindDialogueEvents();
    this.els.deleteEntry.addEventListener("click", () => {
      if (this.isConversations && this.store.selection) {
        this.deleteTarget({
          kind: "entry",
          id: this.store.selection.id
        });
        return;
      }
      this.deleteEntry();
    });
    this.els.undo.addEventListener("click", () =>
      this.store.undo()
    );
    this.els.redo.addEventListener("click", () =>
      this.store.redo()
    );
    this.els.exportJson.addEventListener("click", () =>
      this.exportJson()
    );
    window.addEventListener("keydown", (event) =>
      this.handleKeyboard(event)
    );
  }

  bindBreadcrumbEvents() {
    this.els.breadcrumb.addEventListener("click", (event) => {
      const button = event.target.closest(
        "[data-content-breadcrumb-folder]"
      );
      if (button) {
        this.openFolder(
          button.dataset.contentBreadcrumbFolder
        );
      }
    });
    this.els.breadcrumb.addEventListener("dragover", (event) => {
      const button = event.target.closest(
        "[data-content-breadcrumb-folder]"
      );
      if (!button || this.dragPayload?.type === "recent") {
        return;
      }
      event.preventDefault();
      button.classList.add("is-drop-target");
    });
    this.els.breadcrumb.addEventListener("dragleave", (event) => {
      const button = event.target.closest(
        "[data-content-breadcrumb-folder]"
      );
      if (button && !button.contains(event.relatedTarget)) {
        button.classList.remove("is-drop-target");
      }
    });
    this.els.breadcrumb.addEventListener("drop", (event) => {
      const button = event.target.closest(
        "[data-content-breadcrumb-folder]"
      );
      if (!button) {
        return;
      }
      button.classList.remove("is-drop-target");
      const payload = this.readDragPayload(event);
      if (!payload || payload.type === "recent") {
        return;
      }
      event.preventDefault();
      this.moveDraggedNode(
        payload,
        button.dataset.contentBreadcrumbFolder
      );
    });
  }

  bindRecentDragEvents() {
    this.els.entryList.addEventListener("dragstart", (event) =>
      this.handleRecentDragStart(event)
    );
    this.els.entryList.addEventListener("dragover", (event) =>
      this.handleRecentDragOver(event)
    );
    this.els.entryList.addEventListener("dragleave", (event) => {
      const item = event.target.closest(".content-recent-item");
      if (item && !item.contains(event.relatedTarget)) {
        item.classList.remove(
          "is-drop-before",
          "is-drop-after"
        );
      }
    });
    this.els.entryList.addEventListener("drop", (event) =>
      this.handleRecentDrop(event)
    );
    this.els.entryList.addEventListener("dragend", () =>
      this.clearDragState()
    );
  }

  bindBrowserDragEvents() {
    this.els.browserGrid.addEventListener("dragstart", (event) =>
      this.handleBrowserDragStart(event)
    );
    this.els.browserGrid.addEventListener("dragover", (event) =>
      this.handleBrowserDragOver(event)
    );
    this.els.browserGrid.addEventListener("dragleave", (event) => {
      const card = event.target.closest(".content-file-card");
      if (card && !card.contains(event.relatedTarget)) {
        card.classList.remove("is-drop-target");
      }
    });
    this.els.browserGrid.addEventListener("drop", (event) =>
      this.handleBrowserDrop(event)
    );
    this.els.browserGrid.addEventListener("dragend", () =>
      this.clearDragState()
    );
    this.els.dropZone.addEventListener("dragover", (event) => {
      if (
        !this.dragPayload ||
        this.dragPayload.type === "recent" ||
        event.target.closest(".is-folder")
      ) {
        return;
      }
      event.preventDefault();
      this.els.dropZone.classList.add("is-dragging");
    });
    this.els.dropZone.addEventListener("dragleave", (event) => {
      if (!this.els.dropZone.contains(event.relatedTarget)) {
        this.els.dropZone.classList.remove("is-dragging");
      }
    });
    this.els.dropZone.addEventListener("drop", (event) => {
      if (event.target.closest(".is-folder")) {
        return;
      }
      const payload = this.readDragPayload(event);
      if (!payload || payload.type === "recent") {
        return;
      }
      event.preventDefault();
      this.els.dropZone.classList.remove("is-dragging");
      this.moveDraggedNode(payload, this.currentFolderId);
    });
    this.els.dropZone.addEventListener("dragend", () =>
      this.clearDragState()
    );
  }

  bindContextMenuEvents() {
    this.els.entryList.addEventListener("contextmenu", (event) =>
      this.handleSidebarContextMenu(event)
    );
    this.els.browserGrid.addEventListener("contextmenu", (event) =>
      this.handleBrowserContextMenu(event)
    );
    this.els.dropZone.addEventListener("contextmenu", (event) => {
      if (
        event.target.closest(
          ".content-file-card, #content-browser-empty"
        )
      ) {
        return;
      }
      event.preventDefault();
      this.showContextMenu(event, { kind: "background" });
    });
    this.els.contextMenu.addEventListener("click", (event) => {
      const button = event.target.closest(
        "[data-content-action]"
      );
      if (button) {
        this.handleContextAction(button.dataset.contentAction);
      }
    });
    document.addEventListener("pointerdown", (event) => {
      if (!this.els.contextMenu.contains(event.target)) {
        this.closeContextMenu();
      }
      if (
        !this.els.dialogueContextMenu.contains(event.target)
      ) {
        this.closeDialogueContextMenu();
      }
    });
    window.addEventListener("resize", () => {
      this.closeContextMenu();
      this.closeDialogueContextMenu();
    });
  }

  bindDialogueEvents() {
    this.els.addDialogueLine.addEventListener("click", () =>
      this.addDialogueLine()
    );
    this.els.dialogueList.addEventListener("click", (event) => {
      const toggle = event.target.closest(
        "[data-dialogue-toggle]"
      );
      if (!toggle) {
        return;
      }
      this.toggleDialogueLine(toggle.dataset.dialogueToggle);
    });
    this.els.dialogueList.addEventListener("input", (event) => {
      const field = event.target.dataset.dialogueField;
      const row = event.target.closest("[data-dialogue-id]");
      if (!field || !row) {
        return;
      }
      this.updateDialogueLine(
        row.dataset.dialogueId,
        field,
        event.target.value,
        row
      );
    });
    this.els.dialogueList.addEventListener(
      "dragstart",
      (event) => this.handleDialogueDragStart(event)
    );
    this.els.dialogueList.addEventListener("dragover", (event) =>
      this.handleDialogueDragOver(event)
    );
    this.els.dialogueList.addEventListener("dragleave", (event) => {
      const row = event.target.closest("[data-dialogue-id]");
      if (row && !row.contains(event.relatedTarget)) {
        row.classList.remove(
          "is-drop-before",
          "is-drop-after"
        );
      }
    });
    this.els.dialogueList.addEventListener("drop", (event) =>
      this.handleDialogueDrop(event)
    );
    this.els.dialogueList.addEventListener("dragend", () =>
      this.clearDialogueDragState()
    );
    this.els.dialogueList.addEventListener(
      "contextmenu",
      (event) => this.handleDialogueContextMenu(event)
    );
    this.els.dialogueContextMenu.addEventListener(
      "click",
      (event) => {
        const action = event.target.closest(
          "[data-dialogue-action]"
        )?.dataset.dialogueAction;
        if (action === "delete") {
          this.deleteDialogueLine();
        }
      }
    );
  }

  handleSidebarClick(event) {
    const recent = event.target.closest(
      "[data-recent-content-id]"
    );
    if (recent) {
      this.openContentEntry(recent.dataset.recentContentId);
      return;
    }
    const card = event.target.closest("[data-content-id]");
    if (!card) {
      return;
    }
    this.openContentEntry(card.dataset.contentId);
  }

  handleBrowserClick(event) {
    const folder = event.target.closest("[data-content-folder-id]");
    if (folder) {
      this.openFolder(folder.dataset.contentFolderId);
      return;
    }
    const file = event.target.closest(
      "[data-browser-content-id]"
    );
    if (file) {
      this.openContentEntry(file.dataset.browserContentId);
    }
  }

  handleSidebarContextMenu(event) {
    const target = event.target.closest(
      "[data-recent-content-id], [data-content-id]"
    );
    if (!target) {
      return;
    }
    event.preventDefault();
    this.showContextMenu(event, {
      kind: "entry",
      id:
        target.dataset.recentContentId ??
        target.dataset.contentId
    });
  }

  handleBrowserContextMenu(event) {
    const folder = event.target.closest("[data-content-folder-id]");
    if (folder) {
      event.preventDefault();
      this.showContextMenu(event, {
        kind: "folder",
        id: folder.dataset.contentFolderId
      });
      return;
    }
    const file = event.target.closest(
      "[data-browser-content-id]"
    );
    if (file) {
      event.preventDefault();
      this.showContextMenu(event, {
        kind: "entry",
        id: file.dataset.browserContentId
      });
      return;
    }
    event.preventDefault();
    this.showContextMenu(event, { kind: "background" });
  }

  showContextMenu(event, target) {
    this.contextTarget = target;
    const actionTarget =
      target.kind === "entry" || target.kind === "folder";
    for (const button of this.els.contextMenu.querySelectorAll(
      "[data-content-action]"
    )) {
      const action = button.dataset.contentAction;
      button.hidden =
        (action === "open" && !actionTarget) ||
        (["copy", "cut", "rename", "delete"].includes(action) &&
          !actionTarget) ||
        (action === "paste" && !this.clipboard) ||
        (action === "new-folder" &&
          ["entry", "folder"].includes(target.kind));
    }
    const openLabel = this.els.contextMenu.querySelector(
      '[data-content-action="open"] strong'
    );
    if (openLabel) {
      const definition = getContentModuleDefinition(
        this.activeModule
      );
      openLabel.textContent =
        target.kind === "folder"
          ? "打开文件夹"
          : `打开${definition.entryLabel}`;
    }
    const deleteDescription =
      this.els.contextMenu.querySelector(
        '[data-content-action="delete"] small'
      );
    if (deleteDescription) {
      deleteDescription.textContent = `删除${
        getContentModuleDefinition(this.activeModule).entryLabel
      }；文件夹会递归删除`;
    }
    this.els.contextMenu.hidden = false;
    const margin = 8;
    const rect = this.els.contextMenu.getBoundingClientRect();
    const left = Math.min(
      event.clientX,
      window.innerWidth - rect.width - margin
    );
    const top = Math.min(
      event.clientY,
      window.innerHeight - rect.height - margin
    );
    this.els.contextMenu.style.left = `${Math.max(margin, left)}px`;
    this.els.contextMenu.style.top = `${Math.max(margin, top)}px`;
  }

  closeContextMenu() {
    this.els.contextMenu.hidden = true;
    this.contextTarget = null;
  }

  closeDialogueContextMenu() {
    this.els.dialogueContextMenu.hidden = true;
    this.dialogueContextTarget = null;
  }

  handleContextAction(action) {
    const target = this.contextTarget;
    if (!target) {
      return;
    }
    this.closeContextMenu();
    if (action === "open") {
      if (target.kind === "folder") {
        this.openFolder(target.id);
      } else if (target.kind === "entry") {
        this.openContentEntry(target.id);
      }
      return;
    }
    if (action === "copy" || action === "cut") {
      this.setClipboard(action, target);
      return;
    }
    if (action === "paste") {
      this.pasteClipboard(
        target.kind === "folder"
          ? target.id
          : this.currentFolderId
      );
      return;
    }
    if (action === "new-folder") {
      this.createFolder(
        target.kind === "folder"
          ? target.id
          : this.currentFolderId
      );
      return;
    }
    if (action === "rename") {
      this.renameTarget(target);
      return;
    }
    if (action === "delete") {
      this.deleteTarget(target);
    }
  }

  handleRecentDragStart(event) {
    const item = event.target.closest(".content-recent-item");
    if (!item) {
      return;
    }
    this.startDrag(event, {
      type: "recent",
      id: item.dataset.recentItemId
    });
    item.classList.add("is-dragging");
  }

  handleRecentDragOver(event) {
    const item = event.target.closest(".content-recent-item");
    if (
      !item ||
      this.dragPayload?.type !== "recent" ||
      this.dragPayload.id === item.dataset.recentItemId
    ) {
      return;
    }
    event.preventDefault();
    const rect = item.getBoundingClientRect();
    const after = event.clientY > rect.top + rect.height / 2;
    for (const candidate of this.els.entryList.querySelectorAll(
      ".content-recent-item"
    )) {
      candidate.classList.toggle(
        "is-drop-before",
        candidate === item && !after
      );
      candidate.classList.toggle(
        "is-drop-after",
        candidate === item && after
      );
    }
  }

  handleRecentDrop(event) {
    const item = event.target.closest(".content-recent-item");
    if (
      !item ||
      this.dragPayload?.type !== "recent" ||
      this.dragPayload.id === item.dataset.recentItemId
    ) {
      return;
    }
    event.preventDefault();
    const rect = item.getBoundingClientRect();
    const placement =
      event.clientY > rect.top + rect.height / 2
        ? "after"
        : "before";
    const draggedId = this.dragPayload.id;
    const targetId = item.dataset.recentItemId;
    this.clearDragState();
    const changed = this.store.update((draft) => {
      reorderRecentConversation(
        draft,
        draggedId,
        targetId,
        placement
      );
    });
    if (changed) {
      this.setStatus("已调整最近会话顺序");
    }
  }

  handleBrowserDragStart(event) {
    const folder = event.target.closest("[data-content-folder-id]");
    const file = event.target.closest(
      "[data-browser-content-id]"
    );
    const payload = folder
      ? { type: "folder", id: folder.dataset.contentFolderId }
      : file
        ? { type: "entry", id: file.dataset.browserContentId }
        : null;
    if (!payload) {
      return;
    }
    this.startDrag(event, payload);
    (folder ?? file).classList.add("is-dragging");
  }

  handleBrowserDragOver(event) {
    const folder = event.target.closest("[data-content-folder-id]");
    if (
      !folder ||
      !this.dragPayload ||
      this.dragPayload.type === "recent" ||
      (this.dragPayload.type === "folder" &&
        this.dragPayload.id === folder.dataset.contentFolderId)
    ) {
      return;
    }
    event.preventDefault();
    folder.classList.add("is-drop-target");
  }

  handleBrowserDrop(event) {
    const folder = event.target.closest("[data-content-folder-id]");
    if (!folder) {
      return;
    }
    const payload = this.readDragPayload(event);
    if (!payload || payload.type === "recent") {
      return;
    }
    event.preventDefault();
    this.moveDraggedNode(
      payload,
      folder.dataset.contentFolderId
    );
  }

  startDrag(event, payload) {
    this.dragPayload = payload;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(
      "application/x-platform-content",
      JSON.stringify(payload)
    );
    event.dataTransfer.setData("text/plain", payload.id);
  }

  readDragPayload(event) {
    if (this.dragPayload) {
      return this.dragPayload;
    }
    try {
      return JSON.parse(
        event.dataTransfer.getData(
          "application/x-platform-content"
        )
      );
    } catch {
      return null;
    }
  }

  clearDragState() {
    this.dragPayload = null;
    this.els.dropZone.classList.remove("is-dragging");
    for (const element of document.querySelectorAll(
      ".content-recent-item, .content-file-card"
    )) {
      element.classList.remove(
        "is-dragging",
        "is-drop-target",
        "is-drop-before",
        "is-drop-after"
      );
    }
    for (const element of this.els.breadcrumb.querySelectorAll(
      ".is-drop-target"
    )) {
      element.classList.remove("is-drop-target");
    }
  }

  moveDraggedNode(payload, destinationFolderId) {
    let moved = false;
    this.store.update((draft) => {
      moved =
        payload.type === "folder"
          ? moveContentFolder(
              draft,
              this.activeModule,
              payload.id,
              destinationFolderId
            )
          : moveContentEntry(
              draft,
              payload.id,
              destinationFolderId
            );
    });
    this.clearDragState();
    if (moved) {
      this.setStatus(
        destinationFolderId
          ? "已移动到目标文件夹"
          : "已移动到根目录"
      );
    } else {
      this.onNotify(
        payload.type === "folder"
          ? "无法移动文件夹：目标位置无效、存在同名文件夹或会形成循环目录。"
          : "无法移动内容：目标位置无效。",
        true
      );
    }
  }

  createEntry(folderId = this.currentFolderId) {
    if (this.isConversations) {
      this.expandedDialogueIds.clear();
    }
    let selection = null;
    let evictedId = null;
    const targetFolderId = getContentFolder(
      this.store.document,
      this.activeModule,
      folderId
    )
      ? folderId
      : null;
    this.store.update((draft) => {
      const result = insertContentEntry(
        draft,
        this.activeModule
      );
      selection = result.selection;
      result.entry.folderId = targetFolderId;
      if (!this.isConversations) {
        return;
      }
      const previousRecent = [
        ...(draft.recentConversationIds ?? [])
      ];
      const added = touchRecentConversation(
        draft,
        result.entry.id
      );
      if (
        added &&
        previousRecent.length >= MAX_RECENT_CONVERSATIONS
      ) {
        evictedId = previousRecent.at(-1);
      }
    });
    if (!selection) {
      return;
    }
    this.currentFolderId = targetFolderId;
    this.store.setSelection(selection);
    const definition = getContentModuleDefinition(
      this.activeModule
    );
    this.setStatus(
      evictedId
        ? `已新建${definition.entryLabel} ${selection.id}；最近列表已满，从底部移除 ${evictedId}`
        : `已新建${definition.entryLabel} ${selection.id}`
    );
    requestAnimationFrame(() => this.els.nameField.select());
  }

  createFolder(folderId = this.currentFolderId) {
    const parentId = getContentFolder(
      this.store.document,
      this.activeModule,
      folderId
    )
      ? folderId
      : null;
    const name = window.prompt(
      "新建文件夹名称",
      "新建文件夹"
    );
    if (name === null) {
      return;
    }
    let folder = null;
    this.store.update((draft) => {
      folder = insertContentFolder(
        draft,
        this.activeModule,
        {
          name: name.trim() || "新建文件夹",
          parentId
        }
      );
    });
    if (folder) {
      this.currentFolderId = parentId;
      this.setStatus(`已新建文件夹「${folder.name}」`);
    }
  }

  setClipboard(mode, target) {
    if (!["entry", "folder"].includes(target.kind)) {
      return;
    }
    this.clipboard = {
      mode,
      type: target.kind,
      id: target.id
    };
    this.render();
    this.setStatus(
      mode === "copy"
        ? "已复制到内容剪贴板"
        : "已剪切到内容剪贴板，选择目标文件夹后粘贴"
    );
  }

  pasteClipboard(destinationFolderId = this.currentFolderId) {
    if (!this.clipboard) {
      return;
    }
    const clipboard = this.clipboard;
    const destination = getContentFolder(
      this.store.document,
      this.activeModule,
      destinationFolderId
    )
      ? destinationFolderId
      : null;
    let selection = null;
    let moved = false;
    let copiedFolder = null;
    this.store.update((draft) => {
      if (clipboard.mode === "cut") {
        moved =
          clipboard.type === "folder"
            ? moveContentFolder(
                draft,
                this.activeModule,
                clipboard.id,
                destination
              )
            : moveContentEntry(
                draft,
                clipboard.id,
                destination
              );
        if (moved && clipboard.type === "entry") {
          selection = {
            moduleKey: this.activeModule,
            id: clipboard.id
          };
        }
        return;
      }
      if (clipboard.type === "entry") {
        const result = duplicateContentEntry(
          draft,
          {
            moduleKey: this.activeModule,
            id: clipboard.id
          },
          destination
        );
        selection = result.selection;
        return;
      }
      const result = duplicateContentFolder(
        draft,
        this.activeModule,
        clipboard.id,
        destination
      );
      if (result) {
        copiedFolder = result.folder;
        selection = result.selections[0] ?? null;
      }
    });
    if (!moved && !selection && !copiedFolder) {
      this.onNotify(
        "无法粘贴：目标文件夹无效、存在同名文件夹或会形成循环目录。",
        true
      );
      return;
    }
    if (clipboard.mode === "cut") {
      this.clipboard = null;
    }
    if (selection) {
      this.store.setSelection(selection);
      this.currentFolderId =
        getContentEntry(
          this.store.document,
          selection.id
        )?.folderId ?? null;
    } else if (copiedFolder) {
      this.currentFolderId = copiedFolder.id;
      this.store.setSelection(null);
    } else {
      this.currentFolderId = destination;
    }
    this.setStatus(
      clipboard.mode === "copy"
        ? `已粘贴${getContentModuleDefinition(
            this.activeModule
          ).entryLabel}副本`
        : "已移动到目标文件夹"
    );
  }

  renameTarget(target) {
    if (target.kind === "entry") {
      const entry = getContentEntry(this.store.document, target.id);
      if (!entry) {
        return;
      }
      const name = window.prompt(
        `重命名${getContentModuleDefinition(this.activeModule).entryLabel}`,
        entry.name || "未命名内容"
      );
      if (name === null || !name.trim()) {
        return;
      }
      this.store.update((draft) => {
        const current = getContentEntry(draft, target.id);
        if (current) {
          current.name = name.trim();
        }
      });
      this.setStatus("已重命名内容");
      return;
    }
    if (target.kind === "folder") {
      const folder = getContentFolder(
        this.store.document,
        this.activeModule,
        target.id
      );
      if (!folder) {
        return;
      }
      const name = window.prompt("重命名文件夹", folder.name);
      if (name === null || !name.trim()) {
        return;
      }
      this.store.update((draft) => {
        renameContentFolder(
          draft,
          this.activeModule,
          target.id,
          name
        );
      });
      this.setStatus("已重命名文件夹");
    }
  }

  deleteTarget(target) {
    if (target.kind === "entry") {
      const entry = getContentEntry(this.store.document, target.id);
      const definition = getContentModuleDefinition(
        this.activeModule
      );
      if (
        !entry ||
        !window.confirm(
          `确定删除${definition.entryLabel}「${entry.name || target.id}」吗？该 ID 不会再次分配。`
        )
      ) {
        return;
      }
      this.store.update((draft) => {
        removeContentEntry(draft, {
          moduleKey: this.activeModule,
          id: target.id
        });
      });
      this.store.setSelection(null);
      this.render();
      this.setStatus(`已删除 ${target.id}`);
      return;
    }
    if (target.kind !== "folder") {
      return;
    }
    const folder = getContentFolder(
      this.store.document,
      this.activeModule,
      target.id
    );
    if (
      !folder ||
      !window.confirm(
        `确定删除文件夹「${folder.name}」及其中所有内容和子文件夹吗？`
      )
    ) {
      return;
    }
    const parentId = folder.parentId ?? null;
    let removed = null;
    this.store.update((draft) => {
      removed = removeContentFolder(
        draft,
        this.activeModule,
        target.id
      );
    });
    if (!removed) {
      return;
    }
    if (
      this.currentFolderId === target.id ||
      removed.removedFolderIds.includes(this.currentFolderId)
    ) {
      this.currentFolderId = parentId;
    }
    this.store.setSelection(null);
    this.render();
    this.setStatus(
      `已删除文件夹及 ${removed.removedContentIds.length} 项内容`
    );
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

  openContentEntry(contentId) {
    const definition = getContentModuleForId(contentId);
    const entry = getContentEntry(
      this.store.document,
      contentId
    );
    if (
      !entry ||
      !definition ||
      definition.key !== this.activeModule
    ) {
      return;
    }
    if (this.isConversations) {
      this.expandedDialogueIds.clear();
    }
    let evictedId = null;
    if (this.isConversations) {
      this.store.update((draft) => {
        const previousRecent = [
          ...(draft.recentConversationIds ?? [])
        ];
        const added = touchRecentConversation(
          draft,
          contentId
        );
        if (
          added &&
          previousRecent.length >= MAX_RECENT_CONVERSATIONS
        ) {
          evictedId = previousRecent.at(-1);
        }
      });
    }
    this.currentFolderId = entry.folderId ?? null;
    this.store.setSelection({
      moduleKey: this.activeModule,
      id: contentId
    });
    this.render();
    this.closeContextMenu();
    if (evictedId) {
      this.setStatus(
        `已打开 ${contentId}；最近列表已满，从底部移除 ${evictedId}`
      );
    } else {
      this.setStatus(`已打开 ${contentId}`);
    }
  }

  openFolder(folderId) {
    if (
      folderId &&
      !getContentFolder(
        this.store.document,
        this.activeModule,
        folderId
      )
    ) {
      return;
    }
    this.currentFolderId = folderId || null;
    this.store.setSelection(null);
    this.closeContextMenu();
    this.render();
    this.setStatus(
      folderId
        ? "已打开文件夹"
        : `已返回${getContentModuleDefinition(this.activeModule).label}根目录`
    );
  }

  handleFormInput(event) {
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
  }

  addDialogueLine() {
    if (!this.isConversations || !this.store.selection) {
      return;
    }
    const selection = this.store.selection;
    const entry = getContentEntry(
      this.store.document,
      selection.id
    );
    if (!entry) {
      return;
    }
    const line = {
      id: this.allocateDialogueLineId(entry),
      role: "",
      content: ""
    };
    const lineNumber = (entry.dialogue?.length ?? 0) + 1;
    this.expandedDialogueIds.add(line.id);
    this.store.update((draft) => {
      const current = getContentEntry(draft, selection.id);
      if (!current) {
        return;
      }
      current.dialogue ??= [];
      current.dialogue.push(line);
    });
    this.setStatus(`已新建第 ${lineNumber} 行对话`);
    requestAnimationFrame(() => {
      const input = [
        ...this.els.dialogueList.querySelectorAll(
          "[data-dialogue-field='role']"
        )
      ].find(
        (element) =>
          element.closest("[data-dialogue-id]")?.dataset
            .dialogueId === line.id
      );
      this.els.dialogueList.scrollTop =
        this.els.dialogueList.scrollHeight;
      input?.focus({ preventScroll: true });
    });
  }

  allocateDialogueLineId(entry) {
    const prefix = `${entry.id}-line-`;
    const highest = (entry.dialogue ?? []).reduce(
      (result, line) => {
        if (!String(line?.id ?? "").startsWith(prefix)) {
          return result;
        }
        const suffix = Number(
          line.id.slice(prefix.length)
        );
        return Number.isInteger(suffix)
          ? Math.max(result, suffix)
          : result;
      },
      0
    );
    return `${prefix}${String(highest + 1).padStart(4, "0")}`;
  }

  toggleDialogueLine(lineId) {
    if (this.expandedDialogueIds.has(lineId)) {
      this.expandedDialogueIds.delete(lineId);
    } else {
      this.expandedDialogueIds.add(lineId);
    }
    const selection = this.store.selection;
    const entry = selection
      ? getContentEntry(this.store.document, selection.id)
      : null;
    if (entry) {
      this.renderDialogueEditor(entry);
    }
  }

  updateDialogueLine(lineId, field, value, row) {
    if (
      !["role", "content"].includes(field) ||
      !this.store.selection
    ) {
      return;
    }
    const selection = this.store.selection;
    this.dialogueInputLock = true;
    try {
      this.store.update(
        (draft) => {
          const entry = getContentEntry(draft, selection.id);
          const line = entry?.dialogue?.find(
            (candidate) => candidate.id === lineId
          );
          if (line) {
            line[field] = value;
          }
        },
        {
          coalesceKey: `dialogue:${selection.id}:${lineId}:${field}`
        }
      );
    } finally {
      this.dialogueInputLock = false;
    }
    const entry = getContentEntry(
      this.store.document,
      selection.id
    );
    const line = entry?.dialogue?.find(
      (candidate) => candidate.id === lineId
    );
    if (row && line) {
      row.querySelector("[data-dialogue-role]").textContent =
        line.role || "未设置角色";
      row.querySelector(
        "[data-dialogue-content-preview]"
      ).textContent = line.content || "暂无内容";
    }
  }

  handleDialogueContextMenu(event) {
    const row = event.target.closest("[data-dialogue-id]");
    if (!row) {
      return;
    }
    event.preventDefault();
    this.closeContextMenu();
    this.dialogueContextTarget = {
      lineId: row.dataset.dialogueId
    };
    this.els.dialogueContextMenu.hidden = false;
    const margin = 8;
    const rect =
      this.els.dialogueContextMenu.getBoundingClientRect();
    this.els.dialogueContextMenu.style.left = `${Math.max(
      margin,
      Math.min(
        event.clientX,
        window.innerWidth - rect.width - margin
      )
    )}px`;
    this.els.dialogueContextMenu.style.top = `${Math.max(
      margin,
      Math.min(
        event.clientY,
        window.innerHeight - rect.height - margin
      )
    )}px`;
  }

  deleteDialogueLine() {
    const lineId = this.dialogueContextTarget?.lineId;
    const selection = this.store.selection;
    if (!lineId || !selection) {
      return;
    }
    if (!window.confirm("确定删除这段对话吗？")) {
      this.closeDialogueContextMenu();
      return;
    }
    this.store.update((draft) => {
      const entry = getContentEntry(draft, selection.id);
      if (entry?.dialogue) {
        entry.dialogue = entry.dialogue.filter(
          (line) => line.id !== lineId
        );
      }
    });
    this.expandedDialogueIds.delete(lineId);
    this.closeDialogueContextMenu();
    this.setStatus("已删除对话行");
  }

  handleDialogueDragStart(event) {
    const row = event.target.closest("[data-dialogue-id]");
    if (!row) {
      return;
    }
    if (event.target.closest("input, textarea")) {
      event.preventDefault();
      return;
    }
    this.dialogueDragId = row.dataset.dialogueId;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(
      "application/x-platform-dialogue",
      this.dialogueDragId
    );
    row.classList.add("is-dragging");
  }

  handleDialogueDragOver(event) {
    const row = event.target.closest("[data-dialogue-id]");
    if (
      !row ||
      !this.dialogueDragId ||
      this.dialogueDragId === row.dataset.dialogueId
    ) {
      return;
    }
    event.preventDefault();
    const rect = row.getBoundingClientRect();
    const after = event.clientY > rect.top + rect.height / 2;
    for (const candidate of this.els.dialogueList.querySelectorAll(
      "[data-dialogue-id]"
    )) {
      candidate.classList.toggle(
        "is-drop-before",
        candidate === row && !after
      );
      candidate.classList.toggle(
        "is-drop-after",
        candidate === row && after
      );
    }
  }

  handleDialogueDrop(event) {
    const target = event.target.closest("[data-dialogue-id]");
    if (
      !target ||
      !this.dialogueDragId ||
      this.dialogueDragId === target.dataset.dialogueId ||
      !this.store.selection
    ) {
      return;
    }
    event.preventDefault();
    const selection = this.store.selection;
    const draggedId = this.dialogueDragId;
    const targetId = target.dataset.dialogueId;
    const rect = target.getBoundingClientRect();
    const placement =
      event.clientY > rect.top + rect.height / 2
        ? "after"
        : "before";
    this.clearDialogueDragState();
    const changed = this.store.update((draft) => {
      const entry = getContentEntry(draft, selection.id);
      if (!entry?.dialogue) {
        return;
      }
      const lines = [...entry.dialogue];
      const fromIndex = lines.findIndex(
        (line) => line.id === draggedId
      );
      if (fromIndex < 0) {
        return;
      }
      const [dragged] = lines.splice(fromIndex, 1);
      let targetIndex = lines.findIndex(
        (line) => line.id === targetId
      );
      if (targetIndex < 0) {
        return;
      }
      if (placement === "after") {
        targetIndex += 1;
      }
      lines.splice(targetIndex, 0, dragged);
      entry.dialogue = lines;
    });
    if (changed) {
      this.setStatus("已调整对话顺序");
    }
  }

  clearDialogueDragState() {
    this.dialogueDragId = null;
    for (const row of this.els.dialogueList.querySelectorAll(
      "[data-dialogue-id]"
    )) {
      row.classList.remove(
        "is-dragging",
        "is-drop-before",
        "is-drop-after"
      );
    }
  }

  handleKeyboard(event) {
    if (
      this.els.workspace.hidden ||
      document.querySelector("dialog[open]") ||
      isTypingTarget(event.target)
    ) {
      return;
    }
    const modifier = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (event.key === "Escape") {
      this.closeContextMenu();
      this.closeDialogueContextMenu();
      return;
    }
    const selection = this.store.selection;
    if (modifier && ["c", "x"].includes(key) && selection) {
      event.preventDefault();
      this.setClipboard(key === "c" ? "copy" : "cut", {
        kind: "entry",
        id: selection.id
      });
      return;
    }
    if (modifier && key === "v" && this.clipboard) {
      event.preventDefault();
      this.pasteClipboard(this.currentFolderId);
      return;
    }
    if (
      (event.key === "Delete" || event.key === "Backspace") &&
      selection
    ) {
      event.preventDefault();
      this.deleteTarget({ kind: "entry", id: selection.id });
    }
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
    const isConversations = this.isConversations;

    this.els.workspace.classList.add("is-content-explorer");
    this.els.workspace.classList.toggle(
      "is-conversation",
      isConversations
    );
    this.els.workspace.classList.toggle(
      "is-character",
      this.activeModule === "characters"
    );
    this.els.workspace.classList.toggle(
      "is-item",
      this.activeModule === "items"
    );
    this.els.moduleTitle.textContent = isConversations
      ? "最近打开"
      : definition.label;
    this.els.sidebarEyebrow.textContent = isConversations
      ? "会话"
      : "内容模块";
    this.els.modulePrefix.textContent = definition.prefix;
    this.els.newEntry.textContent = `新建${definition.entryLabel}`;
    this.els.emptyNewEntry.textContent =
      `新建${definition.entryLabel}`;
    this.els.browserNewEntry.textContent =
      `新建${definition.entryLabel}`;
    this.els.editorEyebrow.textContent =
      `${definition.prefix} · ${definition.label}资源管理器`;
    this.els.modulePrefixNote.textContent =
      `${definition.prefix} · ${definition.label}`;
    this.els.moduleNoteTitle.textContent = note.title;
    this.els.moduleNoteCopy.textContent = note.copy;
    this.els.schemaNote.textContent =
      `schema v${CURRENT_CONTENT_SCHEMA_VERSION}`;
    this.els.sidebarNote.textContent = isConversations
      ? "最近打开最多保留 10 个；新打开项从顶部加入，满额时移除最下面一项。拖拽可调整顺序。"
      : "使用文件夹组织内容；支持拖拽、复制、剪切、粘贴和右键删除。";
    this.els.toolbar.hidden = false;
    this.els.explorer.hidden = Boolean(selected);
    this.els.editorScroll.hidden = !selected;
    this.els.newFolder.hidden = false;
    this.els.descriptionFieldWrap.hidden =
      isConversations || this.activeModule === "items";
    this.els.dialogueSection.hidden = !isConversations;
    this.els.questSection.hidden =
      this.activeModule !== "quests";
    this.els.itemSection.hidden =
      this.activeModule !== "items";
    this.els.itemIllustrationButton.hidden =
      this.activeModule !== "items";
    this.els.characterSection.hidden =
      this.activeModule !== "characters";
    this.els.idLabel.textContent =
      this.activeModule === "quests"
        ? "任务 ID"
        : this.activeModule === "characters"
          ? "角色 ID"
          : this.activeModule === "items"
            ? "物品 ID"
            : "稳定 ID";
    this.els.nameLabel.textContent =
      this.activeModule === "quests"
        ? "任务名"
        : this.activeModule === "characters"
          ? "角色名"
          : this.activeModule === "items"
            ? "物品名"
            : "名称";
    this.els.descriptionLabel.textContent =
      this.activeModule === "quests"
        ? "任务详细"
        : this.activeModule === "characters"
          ? "角色简述"
          : "说明";
    this.els.moduleSection.hidden =
      isConversations ||
      this.activeModule === "items" ||
      this.activeModule === "characters";
    this.els.dangerSection.hidden = true;
    this.els.undo.disabled = this.store.history.length === 0;
    this.els.redo.disabled = this.store.future.length === 0;

    if (
      this.currentFolderId &&
      !getContentFolder(
        this.store.document,
        this.activeModule,
        this.currentFolderId
      )
    ) {
      this.currentFolderId = null;
    }
    if (isConversations) {
      const recentIds =
        this.store.document.recentConversationIds ?? [];
      this.els.count.textContent =
        `${entries.length} 个会话 · 最近 ${recentIds.length}/${MAX_RECENT_CONVERSATIONS}`;
      this.renderRecentList(recentIds, selected);
    } else {
      this.els.count.textContent = `${entries.length} 项`;
      this.renderEntryList(entries, selected);
    }
    this.renderBrowser(selected);

    this.renderDetail(selected, entries, isConversations);
  }

  renderRecentList(recentIds, selected) {
    const items = recentIds
      .map((id) => ({
        id,
        entry: getContentEntry(this.store.document, id)
      }))
      .filter((item) => item.entry);
    if (items.length === 0) {
      this.els.entryList.innerHTML = `
        <div class="content-list-empty content-recent-empty">
          <strong>还没有最近会话</strong>
          <span>打开会话后会自动出现在这里。</span>
        </div>
      `;
      return;
    }
    this.els.entryList.innerHTML = items
      .map(({ id, entry }) => {
        const isCut =
          this.clipboard?.mode === "cut" &&
          this.clipboard.type === "entry" &&
          this.clipboard.id === id;
        return `
          <article
            class="content-recent-item ${selected?.id === id ? "is-active" : ""} ${isCut ? "is-cut" : ""}"
            draggable="true"
            data-recent-item-id="${escapeHtml(id)}"
          >
            <button
              class="content-recent-open"
              type="button"
              data-recent-content-id="${escapeHtml(id)}"
              title="打开 ${escapeHtml(entry.name || id)}"
            >
              <span class="content-recent-icon" aria-hidden="true">◇</span>
              <span class="content-recent-copy">
                <strong>${escapeHtml(entry.name || "未命名会话")}</strong>
                <small>${escapeHtml(this.getEntryPath(entry))}</small>
              </span>
            </button>
          </article>
        `;
      })
      .join("");
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
            <small>${escapeHtml(this.getEntryPath(entry))}</small>
          </button>
        `
      )
      .join("");
  }

  renderBrowser(selected) {
    const definition =
      getContentModuleDefinition(this.activeModule) ??
      getContentModuleDefinition("conversations");
    const path = getContentFolderPath(
      this.store.document,
      this.activeModule,
      this.currentFolderId
    );
    const breadcrumbParts = [
      `<button type="button" data-content-breadcrumb-folder="">${escapeHtml(
        definition.label
      )}</button>`,
      ...path.map(
        (folder) => `
          <span aria-hidden="true">/</span>
          <button
            type="button"
            data-content-breadcrumb-folder="${escapeHtml(folder.id)}"
          >
            ${escapeHtml(folder.name)}
          </button>
        `
      )
    ];
    if (selected) {
      breadcrumbParts.push(
        '<span aria-hidden="true">/</span>',
        `<span class="content-breadcrumb-current">${escapeHtml(
          selected.id
        )}</span>`
      );
    }
    this.els.breadcrumb.innerHTML = breadcrumbParts.join("");
    const folders = getContentFolders(
      this.store.document,
      this.activeModule
    ).filter(
      (folder) =>
        (folder.parentId ?? null) === this.currentFolderId
    );
    const entries = this.getEntriesInFolder(this.currentFolderId);
    const pathLabel = [
      definition.label,
      ...path.map((folder) => folder.name)
    ].join(" / ");
    this.els.browserSummary.textContent =
      `${pathLabel} · ${folders.length} 个文件夹 · ${entries.length} 个${definition.entryLabel}`;
    this.els.browserEmptyTitle.textContent =
      entries.length === 0 && folders.length === 0
        ? "这个文件夹还是空的"
        : `当前路径没有${definition.entryLabel}`;
    this.els.browserEmptyCopy.textContent =
      `新建${definition.entryLabel}，或把已有${definition.entryLabel}拖到这里。`;
    this.els.browserEmpty.hidden =
      entries.length > 0 || folders.length > 0;

    const folderCards = folders
      .map((folder) => {
        const childFolderCount = (
          getContentFolders(
            this.store.document,
            this.activeModule
          )
        ).filter(
          (candidate) => candidate.parentId === folder.id
        ).length;
        const contentCount =
          this.getEntriesInFolder(folder.id).length;
        const isCut =
          this.clipboard?.mode === "cut" &&
          this.clipboard.type === "folder" &&
          this.clipboard.id === folder.id;
        return `
          <article
            class="content-file-card is-folder ${isCut ? "is-cut" : ""}"
            draggable="true"
            tabindex="0"
            data-content-folder-id="${escapeHtml(folder.id)}"
            aria-label="打开文件夹 ${escapeHtml(folder.name)}"
          >
            <span class="content-file-icon is-folder" aria-hidden="true">▱</span>
            <span class="content-file-copy">
              <strong>${escapeHtml(folder.name)}</strong>
              <small>${contentCount} 个${definition.entryLabel}${childFolderCount ? ` · ${childFolderCount} 个子文件夹` : ""}</small>
            </span>
            <span class="content-file-meta">文件夹</span>
          </article>
        `;
      })
      .join("");
    const entryCards = entries
      .map((entry) => {
        const isCut =
          this.clipboard?.mode === "cut" &&
          this.clipboard.type === "entry" &&
          this.clipboard.id === entry.id;
        return `
          <article
            class="content-file-card is-module-entry ${selected?.id === entry.id ? "is-active" : ""} ${isCut ? "is-cut" : ""}"
            draggable="true"
            tabindex="0"
            data-browser-content-id="${escapeHtml(entry.id)}"
            aria-label="打开${definition.entryLabel} ${escapeHtml(entry.name || entry.id)}"
          >
            <span class="content-file-icon" aria-hidden="true">${escapeHtml(
              definition.prefix
            )}</span>
            <span class="content-file-copy">
              <strong>${escapeHtml(entry.name || `未命名${definition.entryLabel}`)}</strong>
              <small>${escapeHtml(this.getEntrySummary(entry))}</small>
            </span>
            <span class="content-file-meta">${escapeHtml(entry.id)}</span>
          </article>
        `;
      })
      .join("");
    this.els.browserGrid.innerHTML = folderCards + entryCards;
  }

  renderDetail(selected, entries, isConversations) {
    const definition = getContentModuleDefinition(
      this.activeModule
    );
    this.els.entryTitle.textContent = selected
      ? selected.name || "未命名内容"
      : getContentFolder(
          this.store.document,
          this.activeModule,
          this.currentFolderId
        )?.name || `${definition.label}资源管理器`;
    this.els.entryId.textContent = selected?.id ?? "";
    this.els.empty.hidden = Boolean(selected);
    this.els.form.hidden = !selected;
    this.els.deleteEntry.textContent = `删除${definition.entryLabel}`;
    if (!selected) {
      this.els.emptyTitle.textContent = isConversations
        ? "选择一个会话"
        : entries.length
          ? "选择一个内容项"
          : `还没有${definition.label}`;
      this.els.emptyCopy.textContent =
        "从左侧列表或文件区域选择内容后，在这里编辑。";
      this.els.idField.value = "";
      this.els.nameField.value = "";
      this.els.descriptionField.value = "";
      return;
    }
    if (this.els.idField.value !== selected.id) {
      this.els.idField.value = selected.id;
    }
    if (this.els.nameField.value !== selected.name) {
      this.els.nameField.value = selected.name;
    }
    const description = selected.description ?? "";
    if (this.els.descriptionField.value !== description) {
      this.els.descriptionField.value = description;
    }
    if (isConversations) {
      this.renderDialogueEditor(selected);
    }
    if (this.activeModule === "quests") {
      this.questEditor.render(selected);
    }
    if (this.activeModule === "items") {
      this.itemEditor.render(selected);
    }
    if (this.activeModule === "characters") {
      this.characterEditor.render(selected);
    }
  }

  renderDialogueEditor(entry) {
    if (this.dialogueInputLock) {
      return;
    }
    const lines = Array.isArray(entry.dialogue)
      ? entry.dialogue
      : [];
    const lineIds = new Set(lines.map((line) => line.id));
    for (const lineId of this.expandedDialogueIds) {
      if (!lineIds.has(lineId)) {
        this.expandedDialogueIds.delete(lineId);
      }
    }
    this.els.dialogueCount.textContent = `${lines.length} 行`;
    this.els.dialogueEmpty.hidden = lines.length > 0;
    this.els.dialogueList.innerHTML = lines
      .map((line, index) => {
        const expanded = this.expandedDialogueIds.has(line.id);
        const role = line.role || "未设置角色";
        const content = line.content || "暂无内容";
        return `
          <article
            class="content-dialogue-row ${expanded ? "is-expanded" : ""}"
            draggable="true"
            data-dialogue-id="${escapeHtml(line.id)}"
            title="拖拽调整对话顺序"
          >
            <button
              class="content-dialogue-summary"
              type="button"
              data-dialogue-toggle="${escapeHtml(line.id)}"
              aria-expanded="${expanded}"
            >
              <span
                class="content-dialogue-arrow"
                aria-hidden="true"
              >${expanded ? "▾" : "▸"}</span>
              <span class="content-dialogue-index">${String(
                index + 1
              ).padStart(3, "0")}</span>
              <span class="content-dialogue-preview">
                <strong data-dialogue-role>${escapeHtml(role)}</strong>
                <span aria-hidden="true">：</span>
                <span data-dialogue-content-preview>${escapeHtml(
                  content
                )}</span>
              </span>
              <span class="content-dialogue-grip" aria-hidden="true">
                ⋮⋮
              </span>
            </button>
            <div
              class="content-dialogue-body"
              ${expanded ? "" : "hidden"}
            >
              <label class="content-dialogue-field">
                <span>角色</span>
                <input
                  type="text"
                  data-dialogue-field="role"
                  value="${escapeHtml(line.role ?? "")}"
                  maxlength="80"
                  autocomplete="off"
                  placeholder="角色名"
                />
              </label>
              <label class="content-dialogue-field">
                <span>说话内容</span>
                <textarea
                  data-dialogue-field="content"
                  rows="5"
                  placeholder="输入说话内容"
                >${escapeHtml(line.content ?? "")}</textarea>
              </label>
            </div>
          </article>
        `;
      })
      .join("");
  }

  getEntriesInFolder(folderId) {
    return (this.store.document[this.activeModule] ?? []).filter(
      (entry) => (entry.folderId ?? null) === (folderId ?? null)
    );
  }

  getEntryPath(entry) {
    const definition = getContentModuleDefinition(this.activeModule);
    const path = getContentFolderPath(
      this.store.document,
      this.activeModule,
      entry?.folderId
    ).map((folder) => folder.name);
    return [definition?.label ?? "内容", ...path].join(" / ");
  }

  getEntrySummary(entry) {
    if (this.activeModule === "items") {
      const typeSummary = getItemTypeSummary(entry);
      if (typeSummary) {
        return typeSummary;
      }
    }
    return entry?.description || "暂无说明";
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
