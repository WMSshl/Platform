const STORAGE_KEY = "platform-dome.talents.v1";

/**
 * 天赋开关持久化。
 *
 * 天赋是跨局设置，不写入单局存档；切换后立即写入 localStorage。
 */
export class TalentService {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.state = this.load();
  }

  load() {
    if (!this.storage) {
      return {};
    }

    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) {
        return {};
      }

      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? { ...parsed } : {};
    } catch (error) {
      console.warn("天赋设置无法解析：", error);
      return {};
    }
  }

  isEnabled(talentId) {
    return Boolean(this.state[talentId]);
  }

  setEnabled(talentId, enabled) {
    const nextValue = Boolean(enabled);
    this.state = {
      ...this.state,
      [talentId]: nextValue
    };
    this.persist();
    return nextValue;
  }

  toggle(talentId) {
    return this.setEnabled(talentId, !this.isEnabled(talentId));
  }

  persist() {
    if (!this.storage) {
      return;
    }

    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (error) {
      console.warn("天赋设置无法保存：", error);
    }
  }
}
