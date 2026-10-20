import {
  getSelectedObject,
  normalizeLevel
} from "../model/LevelModel.js";

const historyLimit = 120;
const coalesceWindowMs = 700;

export class EditorStore {
  constructor(initialDocument) {
    this.document = normalizeLevel(initialDocument);
    this.selection = null;
    this.tool = "select";
    this.gridSize = 16;
    this.snapEnabled = true;
    this.dirty = false;
    this.epoch = 1;
    this.history = [];
    this.future = [];
    this.lastCoalesceKey = null;
    this.lastCoalesceAt = 0;
    this.listeners = new Set();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(reason = "change") {
    for (const listener of this.listeners) {
      listener(reason);
    }
  }

  getState() {
    return {
      document: this.document,
      selection: this.selection,
      tool: this.tool,
      gridSize: this.gridSize,
      snapEnabled: this.snapEnabled,
      dirty: this.dirty,
      epoch: this.epoch,
      canUndo: this.history.length > 0,
      canRedo: this.future.length > 0
    };
  }

  replaceDocument(level, { dirty = false } = {}) {
    this.document = normalizeLevel(level);
    this.selection = null;
    this.tool = "select";
    this.dirty = dirty;
    this.epoch += 1;
    this.history = [];
    this.future = [];
    this.lastCoalesceKey = null;
    this.notify("document-replaced");
  }

  update(mutator, { coalesceKey = null, notify = true } = {}) {
    const before = structuredClone(this.document);
    mutator(this.document);

    if (JSON.stringify(before) === JSON.stringify(this.document)) {
      return false;
    }

    const now = Date.now();
    const canCoalesce =
      coalesceKey &&
      coalesceKey === this.lastCoalesceKey &&
      now - this.lastCoalesceAt <= coalesceWindowMs;

    if (!canCoalesce) {
      this.history.push(before);
      if (this.history.length > historyLimit) {
        this.history.shift();
      }
    }

    this.lastCoalesceKey = coalesceKey;
    this.lastCoalesceAt = now;
    this.future = [];
    this.dirty = true;
    if (notify) {
      this.notify("document-updated");
    }
    return true;
  }

  setSelection(selection) {
    if (selection?.section && selection.section !== "level") {
      const selected = getSelectedObject(this.document, selection);
      if (!selected) {
        selection = null;
      }
    }
    if (JSON.stringify(selection) === JSON.stringify(this.selection)) {
      return;
    }
    this.selection = selection;
    this.notify("selection-changed");
  }

  setTool(tool) {
    if (this.tool === tool) {
      return;
    }
    this.tool = tool;
    this.notify("tool-changed");
  }

  setGridSize(size) {
    const parsed = Number(size);
    if (!Number.isFinite(parsed) || parsed <= 0 || this.gridSize === parsed) {
      return;
    }
    this.gridSize = parsed;
    this.notify("view-changed");
  }

  toggleSnap() {
    this.snapEnabled = !this.snapEnabled;
    this.notify("view-changed");
  }

  undo() {
    if (this.history.length === 0) {
      return false;
    }
    this.future.push(structuredClone(this.document));
    this.document = this.history.pop();
    this.dirty = true;
    this.lastCoalesceKey = null;
    this.ensureSelectionExists();
    this.notify("history-changed");
    return true;
  }

  redo() {
    if (this.future.length === 0) {
      return false;
    }
    this.history.push(structuredClone(this.document));
    this.document = this.future.pop();
    this.dirty = true;
    this.lastCoalesceKey = null;
    this.ensureSelectionExists();
    this.notify("history-changed");
    return true;
  }

  ensureSelectionExists() {
    if (
      this.selection &&
      this.selection.section !== "level" &&
      !getSelectedObject(this.document, this.selection)
    ) {
      this.selection = null;
    }
  }

  markSaved() {
    this.dirty = false;
    this.notify("saved");
  }
}
