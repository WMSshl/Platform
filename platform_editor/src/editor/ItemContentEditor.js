import {
  ITEM_EFFECT_MODES,
  ITEM_STACK_LIMIT_MAX
} from "../contract/index.js";
import {
  ITEM_CUSTOM_OPTION,
  addItemRarity,
  addItemType,
  createItemIllustration,
  getContentEntry,
  getItemIllustrationUrl,
  getItemPrimaryTypeNames,
  getItemRarityNames,
  getItemSecondaryTypeNames,
  normalizeItemTypeName
} from "../model/ContentModel.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function uniqueNames(...sources) {
  const seen = new Set();
  const names = [];
  for (const source of sources) {
    for (const value of Array.isArray(source) ? source : [source]) {
      const name = normalizeItemTypeName(value);
      const key = name.toLowerCase();
      if (!name || seen.has(key)) {
        continue;
      }
      seen.add(key);
      names.push(name);
    }
  }
  return names;
}

function renderOptions(names, selectedValue, customLabel) {
  return [
    ...names.map(
      (name) => `
        <option
          value="${escapeHtml(name)}"
          ${name === selectedValue ? "selected" : ""}
        >${escapeHtml(name)}</option>
      `
    ),
    `
      <option
        value="${ITEM_CUSTOM_OPTION}"
        ${selectedValue === ITEM_CUSTOM_OPTION ? "selected" : ""}
      >${escapeHtml(customLabel)}</option>
    `
  ].join("");
}

/**
 * 物品条目的专用编辑区。
 *
 * 一级/二级类型与稀有度都是跨物品共享的候选库，因此类型库保存在
 * 内容文档根节点；条目只保存选中的名称。自定义输入在点击确认前
 * 不会写入文档，避免把未完成的草稿变成全局候选。
 */
export class ItemContentEditor {
  constructor(
    store,
    {
      root,
      onStatus = () => {},
      onNotify = () => {},
      illustrationButton = null,
      illustrationPicker = null
    }
  ) {
    this.store = store;
    this.root = root;
    this.onStatus = onStatus;
    this.onNotify = onNotify;
    this.illustrationButton = illustrationButton;
    this.illustrationPicker = illustrationPicker;
    this.illustrationButton?.addEventListener("click", () => {
      this.openIllustrationPicker().catch((error) =>
        this.onNotify(error.message, true)
      );
    });
    this.inputLock = false;
    this.lastEntryId = null;
    this.view = this.createEmptyView();
    this.root.addEventListener("click", (event) =>
      this.handleClick(event)
    );
    this.root.addEventListener("input", (event) =>
      this.handleInput(event)
    );
    this.root.addEventListener("change", (event) =>
      this.handleChange(event)
    );
  }

  createEmptyView() {
    return {
      primaryCustom: false,
      secondaryCustom: false,
      rarityCustom: false,
      primaryIntent: false,
      secondaryIntent: false,
      rarityIntent: false,
      primaryDraft: "",
      secondaryDraft: "",
      rarityDraft: ""
    };
  }

  get selectedEntry() {
    const selection = this.store.selection;
    return selection?.moduleKey === "items"
      ? getContentEntry(this.store.document, selection.id)
      : null;
  }

  syncView(entry) {
    if (this.lastEntryId !== entry.id) {
      this.view = this.createEmptyView();
      this.lastEntryId = entry.id;
    }
    if (!entry.primaryType) {
      this.view.primaryCustom = true;
    } else if (
      !this.view.primaryIntent &&
      this.view.primaryCustom
    ) {
      this.view.primaryCustom = false;
    }
    if (!entry.secondaryType) {
      this.view.secondaryCustom = true;
    } else if (
      !this.view.secondaryIntent &&
      this.view.secondaryCustom
    ) {
      this.view.secondaryCustom = false;
    }
    if (!entry.rarity) {
      this.view.rarityCustom = true;
    } else if (
      !this.view.rarityIntent &&
      this.view.rarityCustom
    ) {
      this.view.rarityCustom = false;
    }
  }

  render(entry = this.selectedEntry) {
    if (this.inputLock || !entry) {
      return;
    }
    this.syncView(entry);
    const document = this.store.document;
    const primaryNames = uniqueNames(
      getItemPrimaryTypeNames(document),
      entry.primaryType
    );
    const secondaryNames = this.view.primaryCustom
      ? []
      : uniqueNames(
          getItemSecondaryTypeNames(
            document,
            entry.primaryType
          ),
          entry.secondaryType
        );
    const rarityNames = uniqueNames(
      getItemRarityNames(document),
      entry.rarity
    );
    const primaryValue = this.view.primaryCustom
      ? ITEM_CUSTOM_OPTION
      : entry.primaryType || ITEM_CUSTOM_OPTION;
    const secondaryValue = this.view.secondaryCustom
      ? ITEM_CUSTOM_OPTION
      : entry.secondaryType || ITEM_CUSTOM_OPTION;
    const rarityValue = this.view.rarityCustom
      ? ITEM_CUSTOM_OPTION
      : entry.rarity || ITEM_CUSTOM_OPTION;
    const effect = entry.effect ?? {
      mode: "description",
      description: "",
      script: ""
    };
    const tradeable = entry.tradeable !== false;
    const illustration = entry.illustration ?? null;
    const illustrationUrl = getItemIllustrationUrl(illustration);
    if (this.illustrationButton) {
      this.illustrationButton.textContent = illustration
        ? "更换插图"
        : "导入插图";
      this.illustrationButton.title = illustration
        ? "更换物品插图"
        : "从素材库静态贴图导入物品插图";
    }
    const canConfirmType = this.canConfirmType(entry);
    const canConfirmRarity = Boolean(
      normalizeItemTypeName(this.view.rarityDraft)
    );

    this.root.innerHTML = `
      <section class="item-editor">
        <header class="item-editor-head">
          <div>
            <strong>物品结构</strong>
            <small>一级/二级类型与稀有度在整个物品模块内共享</small>
          </div>
          <span class="item-editor-chip ${
            tradeable ? "" : "is-muted"
          }">${tradeable ? "可交易" : "非买卖品"}</span>
        </header>

        <div class="item-form">
          <div class="item-row is-top">
            <span class="item-row-label">物品插图</span>
            <div class="item-control">
              ${
                illustration
                  ? `
                    <figure class="item-illustration-card">
                      ${
                        illustrationUrl
                          ? `
                            <img
                              src="${escapeHtml(illustrationUrl)}"
                              alt="${escapeHtml(
                                illustration.displayName ||
                                  illustration.fileName
                              )}"
                              loading="lazy"
                            />
                          `
                          : `<span class="item-illustration-missing">插图路径缺失</span>`
                      }
                      <figcaption class="item-illustration-meta">
                        <strong>${escapeHtml(
                          illustration.displayName ||
                            illustration.fileName
                        )}</strong>
                        <small>${escapeHtml(
                          illustration.relativePath
                        )}</small>
                        <small>文件夹：${escapeHtml(
                          illustration.folderPath || "根目录"
                        )}</small>
                      </figcaption>
                      <button
                        class="item-confirm is-danger"
                        type="button"
                        data-item-action="remove-illustration"
                      >移除</button>
                    </figure>
                  `
                  : `
                    <span class="item-inline-note">
                      尚未导入插图；点击物品名右侧的“导入插图”，从素材库的静态贴图中选择。
                    </span>
                  `
              }
            </div>
          </div>

          <div class="item-row">
            <span class="item-row-label">一级类型</span>
            <div class="item-control">
              <select
                class="item-select"
                data-item-field="primaryType"
                aria-label="一级类型"
              >
                ${renderOptions(
                  primaryNames,
                  primaryValue,
                  "自定义一级类型"
                )}
              </select>
              ${
                this.view.primaryCustom
                  ? `
                    <input
                      class="item-inline-input"
                      type="text"
                      maxlength="24"
                      value="${escapeHtml(this.view.primaryDraft)}"
                      placeholder="输入一级类型"
                      aria-label="自定义一级类型名称"
                      data-item-draft="primary"
                      autocomplete="off"
                    />
                  `
                  : ""
              }
            </div>
          </div>

          <div class="item-row">
            <span class="item-row-label">二级类型</span>
            <div class="item-control">
              <select
                class="item-select"
                data-item-field="secondaryType"
                aria-label="二级类型"
              >
                ${renderOptions(
                  secondaryNames,
                  secondaryValue,
                  "自定义二级类型"
                )}
              </select>
              ${
                this.view.secondaryCustom
                  ? `
                    <input
                      class="item-inline-input"
                      type="text"
                      maxlength="24"
                      value="${escapeHtml(this.view.secondaryDraft)}"
                      placeholder="输入二级类型"
                      aria-label="自定义二级类型名称"
                      data-item-draft="secondary"
                      autocomplete="off"
                    />
                  `
                  : ""
              }
              ${
                this.view.primaryCustom ||
                this.view.secondaryCustom
                  ? `
                    <button
                      class="item-confirm"
                      type="button"
                      data-item-action="confirm-type"
                      ${canConfirmType ? "" : "disabled"}
                    >确认类型</button>
                  `
                  : ""
              }
            </div>
          </div>
          <p class="item-hint">
            自定义类型确认后会进入整个物品模块的下拉候选；同名一级类型会合并到同一条记录。
          </p>

          <div class="item-row">
            <span class="item-row-label">稀有度</span>
            <div class="item-control">
              <select
                class="item-select"
                data-item-field="rarity"
                aria-label="稀有度"
              >
                ${renderOptions(
                  rarityNames,
                  rarityValue,
                  "自定义稀有度"
                )}
              </select>
              ${
                this.view.rarityCustom
                  ? `
                    <input
                      class="item-inline-input"
                      type="text"
                      maxlength="24"
                      value="${escapeHtml(this.view.rarityDraft)}"
                      placeholder="输入稀有度"
                      aria-label="自定义稀有度名称"
                      data-item-draft="rarity"
                      autocomplete="off"
                    />
                    <button
                      class="item-confirm"
                      type="button"
                      data-item-action="confirm-rarity"
                      ${canConfirmRarity ? "" : "disabled"}
                    >确认稀有度</button>
                  `
                  : ""
              }
            </div>
          </div>
          <p class="item-hint">
            稀有度独立于一级/二级类型，可自行新增并复用。
          </p>

          <div class="item-row">
            <span class="item-row-label">堆叠上限</span>
            <div class="item-control">
              <input
                class="item-number"
                type="number"
                min="1"
                max="${ITEM_STACK_LIMIT_MAX}"
                step="1"
                value="${escapeHtml(entry.stackLimit ?? 1)}"
                data-item-field="stackLimit"
                aria-label="堆叠上限"
              />
              <span class="item-unit">个 / 组</span>
              <span class="item-inline-note">1 表示不可堆叠</span>
            </div>
          </div>

          <div class="item-row is-top">
            <span class="item-row-label">交易</span>
            <div class="item-control item-trade-control">
              <label class="item-check">
                <input
                  type="checkbox"
                  data-item-field="tradeable"
                  ${tradeable ? "checked" : ""}
                />
                <span>买入 / 卖出</span>
              </label>
              ${
                tradeable
                  ? `
                    <label class="item-price">
                      <span>买入价</span>
                      <input
                        class="item-number"
                        type="number"
                        min="0"
                        step="1"
                        value="${escapeHtml(entry.buyPrice ?? 0)}"
                        data-item-field="buyPrice"
                      />
                    </label>
                    <label class="item-price">
                      <span>卖出价</span>
                      <input
                        class="item-number"
                        type="number"
                        min="0"
                        step="1"
                        value="${escapeHtml(entry.sellPrice ?? 0)}"
                        data-item-field="sellPrice"
                      />
                    </label>
                  `
                  : `
                    <span class="item-badge is-muted">非买卖品</span>
                  `
              }
            </div>
          </div>

          <div class="item-row is-top">
            <span class="item-row-label">描述</span>
            <div class="item-control">
              <textarea
                class="item-textarea"
                data-item-field="description"
                rows="4"
                maxlength="800"
                placeholder="物品背景、用途或获取方式"
              >${escapeHtml(entry.description)}</textarea>
            </div>
          </div>

          <section class="item-effect">
            <div class="item-effect-head">
              <span class="item-row-label">特殊效果实现</span>
              <select
                class="item-select"
                data-item-field="effectMode"
                aria-label="特殊效果实现方式"
              >
                ${ITEM_EFFECT_MODES.map(
                  (mode) => `
                    <option
                      value="${mode.value}"
                      ${mode.value === effect.mode ? "selected" : ""}
                    >${escapeHtml(mode.label)}</option>
                  `
                ).join("")}
              </select>
            </div>
            ${
              effect.mode === "script"
                ? `
                  <label class="item-script-field">
                    <span>脚本文件</span>
                    <input
                      class="item-inline-input"
                      type="text"
                      maxlength="200"
                      value="${escapeHtml(effect.script)}"
                      placeholder="例如 scripts/items/xxx.js"
                      data-item-field="effectScript"
                      autocomplete="off"
                    />
                  </label>
                  <p class="item-hint">
                    脚本导入接口尚未接入，当前只保存路径与说明，不会加载或执行脚本。
                  </p>
                `
                : `
                  <p class="item-hint">
                    用文字记录效果；后续运行时可以读取这段效果描述。
                  </p>
                `
            }
            <textarea
              class="item-textarea"
              data-item-field="effectDescription"
              rows="5"
              maxlength="2000"
              placeholder="${
                effect.mode === "script"
                  ? "补充脚本参数或使用说明"
                  : "描述特殊效果的具体表现"
              }"
            >${escapeHtml(effect.description)}</textarea>
          </section>
        </div>
      </section>
    `;
  }

  canConfirmType(entry = this.selectedEntry) {
    if (!entry) {
      return false;
    }
    const primary = this.view.primaryCustom
      ? this.view.primaryDraft
      : entry.primaryType;
    const secondary = this.view.secondaryCustom
      ? this.view.secondaryDraft
      : entry.secondaryType;
    return Boolean(
      normalizeItemTypeName(primary) &&
        normalizeItemTypeName(secondary)
    );
  }

  handleClick(event) {
    const action = event.target.dataset.itemAction;
    if (action === "confirm-type") {
      this.confirmType();
    } else if (action === "confirm-rarity") {
      this.confirmRarity();
    } else if (action === "remove-illustration") {
      this.removeIllustration();
    }
  }

  async openIllustrationPicker() {
    const entry = this.selectedEntry;
    if (!entry || !this.illustrationPicker) {
      return;
    }
    await this.illustrationPicker.open({
      currentAssetId:
        entry.illustration?.relativePath ?? "",
      onSelect: (asset) => this.applyIllustration(asset)
    });
  }

  applyIllustration(asset) {
    const illustration = createItemIllustration(asset);
    if (!illustration) {
      throw new Error("所选素材缺少可保存的路径");
    }
    this.updateEntry(
      (item) => {
        item.illustration = illustration;
      },
      { rerender: true }
    );
    this.onStatus(
      `已导入插图：${
        illustration.displayName || illustration.fileName
      }`
    );
  }

  removeIllustration() {
    this.updateEntry(
      (item) => {
        item.illustration = null;
      },
      { rerender: true }
    );
    this.onStatus("已移除物品插图");
  }

  handleInput(event) {
    const draft = event.target.dataset.itemDraft;
    if (draft) {
      if (draft === "primary") {
        this.view.primaryDraft = event.target.value;
      } else if (draft === "secondary") {
        this.view.secondaryDraft = event.target.value;
      } else if (draft === "rarity") {
        this.view.rarityDraft = event.target.value;
      }
      this.refreshConfirmState();
      return;
    }

    const field = event.target.dataset.itemField;
    if (!field || event.target.tagName === "SELECT") {
      return;
    }
    const entry = this.selectedEntry;
    if (!entry) {
      return;
    }

    if (field === "description") {
      this.updateEntry(
        (item) => {
          item.description = event.target.value;
        },
        {
          coalesceKey: `item:${entry.id}:description`
        }
      );
      return;
    }
    if (field === "effectDescription") {
      this.updateEntry(
        (item) => {
          item.effect ??= {
            mode: "description",
            description: "",
            script: ""
          };
          item.effect.description = event.target.value;
        },
        {
          coalesceKey: `item:${entry.id}:effect:description`
        }
      );
      return;
    }
    if (field === "effectScript") {
      this.updateEntry(
        (item) => {
          item.effect ??= {
            mode: "description",
            description: "",
            script: ""
          };
          item.effect.script = event.target.value;
        },
        {
          coalesceKey: `item:${entry.id}:effect:script`
        }
      );
      return;
    }
    if (
      field === "stackLimit" ||
      field === "buyPrice" ||
      field === "sellPrice"
    ) {
      const value = event.target.value;
      if (value === "") {
        return;
      }
      const number = Math.trunc(Number(value));
      if (!Number.isFinite(number) || number < 0) {
        return;
      }
      if (field === "stackLimit") {
        if (number < 1 || number > ITEM_STACK_LIMIT_MAX) {
          return;
        }
      }
      this.updateEntry(
        (item) => {
          item[field] = number;
        },
        {
          coalesceKey: `item:${entry.id}:${field}`
        }
      );
    }
  }

  handleChange(event) {
    const field = event.target.dataset.itemField;
    if (!field) {
      return;
    }
    const entry = this.selectedEntry;
    if (!entry) {
      return;
    }

    if (field === "primaryType") {
      const value = event.target.value;
      if (value === ITEM_CUSTOM_OPTION) {
        this.view.primaryCustom = true;
        this.view.primaryIntent = true;
        this.view.secondaryCustom = true;
        this.view.secondaryIntent = true;
        this.view.primaryDraft = "";
        this.view.secondaryDraft = "";
        this.render();
        return;
      }
      this.view.primaryCustom = false;
      this.view.primaryIntent = false;
      this.view.secondaryCustom = true;
      this.view.secondaryIntent = true;
      this.view.secondaryDraft = "";
      this.updateEntry(
        (item) => {
          item.primaryType = value;
          item.secondaryType = "";
        },
        { rerender: true }
      );
      return;
    }

    if (field === "secondaryType") {
      const value = event.target.value;
      if (value === ITEM_CUSTOM_OPTION) {
        this.view.secondaryCustom = true;
        this.view.secondaryIntent = true;
        this.view.secondaryDraft = "";
        this.render();
        return;
      }
      this.view.secondaryCustom = false;
      this.view.secondaryIntent = false;
      this.updateEntry(
        (item) => {
          item.secondaryType = value;
        },
        { rerender: true }
      );
      return;
    }

    if (field === "rarity") {
      const value = event.target.value;
      if (value === ITEM_CUSTOM_OPTION) {
        this.view.rarityCustom = true;
        this.view.rarityIntent = true;
        this.view.rarityDraft = "";
        this.render();
        return;
      }
      this.view.rarityCustom = false;
      this.view.rarityIntent = false;
      this.updateEntry(
        (item) => {
          item.rarity = value;
        },
        { rerender: true }
      );
      return;
    }

    if (field === "effectMode") {
      const value = event.target.value === "script"
        ? "script"
        : "description";
      this.updateEntry(
        (item) => {
          item.effect ??= {
            mode: "description",
            description: "",
            script: ""
          };
          item.effect.mode = value;
        },
        { rerender: true }
      );
      return;
    }

    if (field === "tradeable") {
      this.updateEntry(
        (item) => {
          item.tradeable = event.target.checked;
        },
        { rerender: true }
      );
      return;
    }

    if (
      field === "stackLimit" ||
      field === "buyPrice" ||
      field === "sellPrice"
    ) {
      const number = Math.trunc(Number(event.target.value));
      const next =
        field === "stackLimit"
          ? Math.min(
              ITEM_STACK_LIMIT_MAX,
              Math.max(1, Number.isFinite(number) ? number : 1)
            )
          : Math.max(
              0,
              Number.isFinite(number) ? number : 0
            );
      event.target.value = String(next);
      this.updateEntry((item) => {
        item[field] = next;
      });
    }
  }

  confirmType() {
    const entry = this.selectedEntry;
    if (!entry) {
      return;
    }
    const primary = normalizeItemTypeName(
      this.view.primaryCustom
        ? this.view.primaryDraft
        : entry.primaryType
    );
    const secondary = normalizeItemTypeName(
      this.view.secondaryCustom
        ? this.view.secondaryDraft
        : entry.secondaryType
    );
    if (!primary || !secondary) {
      this.onNotify("请先填写一级类型和二级类型", true);
      return;
    }

    let result = null;
    this.inputLock = true;
    try {
      this.store.update((draft) => {
        result = addItemType(draft, primary, secondary);
        const item = getContentEntry(draft, entry.id);
        if (item) {
          item.primaryType = result.primaryType;
          item.secondaryType = result.secondaryType;
        }
      });
    } catch (error) {
      this.onNotify(error.message, true);
      return;
    } finally {
      this.inputLock = false;
    }

    this.view.primaryCustom = false;
    this.view.secondaryCustom = false;
    this.view.primaryIntent = false;
    this.view.secondaryIntent = false;
    this.view.primaryDraft = "";
    this.view.secondaryDraft = "";
    this.render();
    if (result?.createdPrimary || result?.createdSecondary) {
      this.onStatus(
        `已保存类型「${result.primaryType} / ${result.secondaryType}」`
      );
    } else {
      this.onStatus(
        `类型「${result?.primaryType} / ${result?.secondaryType}」已存在`
      );
    }
  }

  confirmRarity() {
    const entry = this.selectedEntry;
    if (!entry) {
      return;
    }
    const rarity = normalizeItemTypeName(this.view.rarityDraft);
    if (!rarity) {
      this.onNotify("请先填写稀有度", true);
      return;
    }

    let result = null;
    this.inputLock = true;
    try {
      this.store.update((draft) => {
        result = addItemRarity(draft, rarity);
        const item = getContentEntry(draft, entry.id);
        if (item) {
          item.rarity = result.rarity;
        }
      });
    } catch (error) {
      this.onNotify(error.message, true);
      return;
    } finally {
      this.inputLock = false;
    }

    this.view.rarityCustom = false;
    this.view.rarityIntent = false;
    this.view.rarityDraft = "";
    this.render();
    this.onStatus(
      result?.created
        ? `已保存稀有度「${result.rarity}」`
        : `稀有度「${result?.rarity}」已存在`
    );
  }

  refreshConfirmState() {
    const typeButton = this.root.querySelector(
      '[data-item-action="confirm-type"]'
    );
    if (typeButton) {
      typeButton.disabled = !this.canConfirmType();
    }
    const rarityButton = this.root.querySelector(
      '[data-item-action="confirm-rarity"]'
    );
    if (rarityButton) {
      rarityButton.disabled = !normalizeItemTypeName(
        this.view.rarityDraft
      );
    }
  }

  updateEntry(mutator, { coalesceKey = null, rerender = false } = {}) {
    const selection = this.store.selection;
    if (selection?.moduleKey !== "items") {
      return false;
    }
    this.inputLock = true;
    let changed = false;
    try {
      changed = this.store.update(
        (draft) => {
          const entry = getContentEntry(draft, selection.id);
          if (!entry) {
            return;
          }
          mutator(entry);
        },
        { coalesceKey }
      );
    } finally {
      this.inputLock = false;
    }
    if (rerender) {
      this.render();
    }
    return changed;
  }
}
