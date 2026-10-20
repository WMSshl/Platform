import { APP_CONFIG } from "../../config/appConfig.js";

const STORAGE_PREFIX = "platform-dome.save";

/**
 * 手动存档服务。
 *
 * 第一版使用浏览器 localStorage，适合单机原型。
 * 数据外层带版本号，以后增加字段时可以按版本迁移，而不会直接让旧档失效。
 */
export class SaveService {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
  }

  getStorageKey(slotId = APP_CONFIG.defaultSaveSlot) {
    return `${STORAGE_PREFIX}.slot-${slotId}`;
  }

  save(slotId, snapshot) {
    const envelope = {
      version: APP_CONFIG.saveVersion,
      savedAt: new Date().toISOString(),
      data: structuredClone(snapshot)
    };

    this.storage.setItem(this.getStorageKey(slotId), JSON.stringify(envelope));
    return envelope;
  }

  load(slotId = APP_CONFIG.defaultSaveSlot) {
    const raw = this.storage.getItem(this.getStorageKey(slotId));
    if (!raw) {
      return null;
    }

    try {
      const envelope = this.migrateEnvelope(JSON.parse(raw));
      if (!this.isSupportedEnvelope(envelope)) {
        return null;
      }

      return envelope;
    } catch (error) {
      console.warn("存档内容无法解析：", error);
      return null;
    }
  }

  hasSave(slotId = APP_CONFIG.defaultSaveSlot) {
    return Boolean(this.load(slotId));
  }

  remove(slotId = APP_CONFIG.defaultSaveSlot) {
    this.storage.removeItem(this.getStorageKey(slotId));
  }

  getSummary(slotId = APP_CONFIG.defaultSaveSlot) {
    const envelope = this.load(slotId);
    if (!envelope) {
      return null;
    }

    return {
      savedAt: envelope.savedAt,
      levelId: envelope.data?.levelId ?? null,
      chapterId: envelope.data?.story?.chapterId ?? null
    };
  }

  isSupportedEnvelope(envelope) {
    return (
      envelope &&
      (envelope.version === 1 ||
        envelope.version === APP_CONFIG.saveVersion) &&
      envelope.data &&
      envelope.data.levelId &&
      envelope.data.player &&
      envelope.data.story &&
      envelope.data.world
    );
  }

  /**
   * 旧版存档缺少耐力字段时，由 Player 在读取时补为满耐力。
   * 这里只提升外层版本，不改变旧字段的含义。
   */
  migrateEnvelope(envelope) {
    if (!envelope || envelope.version !== 1) {
      return envelope;
    }

    envelope.version = APP_CONFIG.saveVersion;
    if (envelope.data?.player) {
      envelope.data.player.currentStamina ??= null;
    }
    return envelope;
  }
}
