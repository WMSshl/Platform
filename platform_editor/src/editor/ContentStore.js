import {
  getContentEntry,
  normalizeContentDocument
} from "../model/ContentModel.js";

const historyLimit = 120;
const coalesceWindowMs = 700;

export class ContentStore {
  constructor(initialDocument) {
    this.document = normalizeContentDocument(initialDocument);
    this.selection = null;
    this.dirty = false;
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

  update(mutator, { coalesceKey = null } = {}) {
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
    this.ensureSelectionExists();
    this.notify("content-updated");
    return true;
  }

  setSelection(selection) {
    if (
      selection &&
      !getContentEntry(this.document, selection.id)
    ) {
      selection = null;
    }
    if (JSON.stringify(selection) === JSON.stringify(this.selection)) {
      return;
    }
    this.selection = selection;
    this.notify("selection-changed");
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
      !getContentEntry(this.document, this.selection.id)
    ) {
      this.selection = null;
    }
  }

  markSaved() {
    this.dirty = false;
    this.notify("saved");
  }
}
