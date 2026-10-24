import {
  QUEST_COMPLETION_CONDITION_TYPES,
  QUEST_STATUSES
} from "../contract/index.js";
import { getContentEntry } from "../model/ContentModel.js";

const TASK_ID_PREFIX = "01-";
const ITEM_ID_PREFIX = "02-";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderOptions(options, selectedValue) {
  return options
    .map(
      (option) => `
        <option
          value="${escapeHtml(option.value)}"
          ${option.value === selectedValue ? "selected" : ""}
        >${escapeHtml(option.label)}</option>
      `
    )
    .join("");
}

/**
 * 任务条目的专用编辑区。
 *
 * 结构化条件的读写集中在这里，主内容工作区只负责切换模块和基础字段。
 */
export class QuestContentEditor {
  constructor(
    store,
    {
      root,
      onStatus = () => {}
    }
  ) {
    this.store = store;
    this.root = root;
    this.onStatus = onStatus;
    this.inputLock = false;
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

  get selectedEntry() {
    const selection = this.store.selection;
    return selection?.moduleKey === "quests"
      ? getContentEntry(this.store.document, selection.id)
      : null;
  }

  get quests() {
    return this.store.document.quests ?? [];
  }

  render(entry = this.selectedEntry) {
    if (this.inputLock || !entry) {
      return;
    }
    const prerequisites = entry.prerequisites ?? [];
    const completionConditions =
      entry.completionConditions ?? [];
    const rewards = entry.rewards ?? [];
    const completionIds = findDuplicateIds(
      completionConditions,
      "itemId"
    );
    const rewardIds = findDuplicateIds(rewards, "itemId");

    this.root.innerHTML = `
      <section class="quest-block quest-prerequisite-block">
        <header class="quest-block-heading">
          <div>
            <strong>任务前置</strong>
            <small>为空时不限制任务激活</small>
          </div>
          <button
            class="quest-add-button"
            type="button"
            data-quest-action="add-prerequisite"
            aria-label="添加任务前置条件"
            title="添加任务前置条件"
          >＋</button>
        </header>
        <div class="quest-block-body">
          <p class="quest-rule-note">
            同一任务 ID 的多个状态为 OR，不同任务 ID 之间为 AND。
          </p>
          ${
            prerequisites.length
              ? `<div class="quest-condition-list">
                  ${prerequisites
                    .map((condition, index) =>
                      this.renderPrerequisiteRow(
                        condition,
                        index
                      )
                    )
                    .join("")}
                </div>`
              : `<div class="quest-inline-empty">
                 还没有前置条件，点击右上角加号添加。
               </div>`
          }
        </div>
      </section>

      <section class="quest-block">
        <header class="quest-block-heading">
          <div>
            <strong>完成条件</strong>
            <small>所有物品数量条件同时满足时完成</small>
          </div>
          <button
            class="quest-add-button"
            type="button"
            data-quest-action="add-completion"
            aria-label="添加完成条件"
            title="添加完成条件"
          >＋</button>
        </header>
        <p class="quest-rule-note">
          任务处于进行中且获得物品后检查一次；物品 ID 不可重复。
        </p>
        ${
          completionConditions.length
            ? `<div class="quest-condition-list">
                ${completionConditions
                  .map((condition, index) =>
                    this.renderItemRow(
                      condition,
                      index,
                      "completion",
                      completionIds.has(condition.itemId)
                    )
                  )
                  .join("")}
              </div>`
            : `<div class="quest-inline-empty">
                 还没有完成条件。为空时任务不会因物品数量自动完成。
               </div>`
        }
      </section>

      <section class="quest-block">
        <header class="quest-block-heading">
          <div>
            <strong>获得物品</strong>
            <small>任务完成时发放</small>
          </div>
          <button
            class="quest-add-button"
            type="button"
            data-quest-action="add-reward"
            aria-label="添加获得物品"
            title="添加获得物品"
          >＋</button>
        </header>
        <p class="quest-rule-note">
          物品模块尚未定型，这里先记录稳定物品 ID 与数量。
        </p>
        ${
          rewards.length
            ? `<div class="quest-condition-list">
                ${rewards
                  .map((reward, index) =>
                    this.renderItemRow(
                      reward,
                      index,
                      "reward",
                      rewardIds.has(reward.itemId)
                    )
                  )
                  .join("")}
              </div>`
            : `<div class="quest-inline-empty">
                 还没有获得物品，点击右上角加号添加。
               </div>`
        }
      </section>
    `;
  }

  renderPrerequisiteRow(condition, index) {
    const taskId =
      typeof condition?.taskId === "string"
        ? condition.taskId
        : "";
    const suffix = getPrefixedIdSuffix(taskId, TASK_ID_PREFIX);
    const status = condition?.status ?? "inactive";
    return `
      <article class="quest-condition-row">
        <label class="quest-field quest-task-id-field">
          <span>任务 ID</span>
          <span class="quest-id-input">
            <span class="quest-id-prefix">${TASK_ID_PREFIX}</span>
            <input
              type="text"
              inputmode="numeric"
              maxlength="4"
              value="${escapeHtml(suffix)}"
              placeholder="0000"
              data-quest-list="prerequisites"
              data-quest-index="${index}"
              data-quest-field="taskId"
              autocomplete="off"
            />
          </span>
        </label>
        <label class="quest-field quest-status-field">
          <span>状态</span>
          <select
            data-quest-list="prerequisites"
            data-quest-index="${index}"
            data-quest-field="status"
          >
            ${renderOptions(QUEST_STATUSES, status)}
          </select>
        </label>
        <button
          class="quest-remove-button"
          type="button"
          data-quest-action="remove-prerequisite"
          data-quest-index="${index}"
          aria-label="删除前置条件"
          title="删除"
        >×</button>
      </article>
    `;
  }

  renderItemRow(condition, index, list, duplicate) {
    const isCompletion = list === "completion";
    const type = condition?.type ?? "item_quantity";
    const itemId =
      typeof condition?.itemId === "string"
        ? condition.itemId
        : "";
    const itemIdSuffix = getPrefixedIdSuffix(
      itemId,
      ITEM_ID_PREFIX
    );
    return `
      <article class="quest-condition-row ${
        isCompletion
          ? "has-condition-type"
          : "has-reward-quantity"
      }">
        ${
          isCompletion
            ? `<label class="quest-field quest-type-field">
                <span>条件对象</span>
                <select
                  data-quest-list="completion"
                  data-quest-index="${index}"
                  data-quest-field="type"
                >
                  ${renderOptions(
                    QUEST_COMPLETION_CONDITION_TYPES,
                    type
                  )}
                  <option value="other" disabled>其他（待设计）</option>
                </select>
              </label>`
            : ""
        }
        <label class="quest-field quest-item-field quest-item-id-field">
          <span>物品 ID</span>
          <span class="quest-id-input">
            <span class="quest-id-prefix">${ITEM_ID_PREFIX}</span>
            <input
              class="${duplicate ? "is-invalid" : ""}"
              type="text"
              inputmode="numeric"
              maxlength="4"
              value="${escapeHtml(itemIdSuffix)}"
              placeholder="0000"
              data-quest-list="${list}"
              data-quest-index="${index}"
              data-quest-field="itemId"
              aria-invalid="${duplicate}"
              autocomplete="off"
            />
          </span>
        </label>
        <label class="quest-field quest-quantity-field">
          <span>数量</span>
          <input
            type="number"
            min="1"
            step="1"
            value="${escapeHtml(condition?.quantity ?? 1)}"
            data-quest-list="${list}"
            data-quest-index="${index}"
            data-quest-field="quantity"
          />
        </label>
        <button
          class="quest-remove-button"
          type="button"
          data-quest-action="remove-${
            isCompletion ? "completion" : "reward"
          }"
          data-quest-index="${index}"
          aria-label="删除${isCompletion ? "完成条件" : "获得物品"}"
          title="删除"
        >×</button>
      </article>
    `;
  }

  handleClick(event) {
    const button = event.target.closest("[data-quest-action]");
    const entry = this.selectedEntry;
    if (!button || !entry) {
      return;
    }
    const index = Number(button.dataset.questIndex);
    const action = button.dataset.questAction;
    if (action === "add-prerequisite") {
      this.updateEntry(
        (quest) => {
          quest.prerequisites.push(
            this.getDefaultPrerequisiteCondition(quest)
          );
        },
        { rerender: true, focus: "prerequisites-taskId" }
      );
      this.onStatus("已添加任务前置条件");
      return;
    }
    if (action === "add-completion") {
      this.updateEntry(
        (quest) => {
          quest.completionConditions.push({
            type: "item_quantity",
            itemId: "",
            quantity: 1
          });
        },
        { rerender: true, focus: "completion-itemId" }
      );
      this.onStatus("已添加物品数量完成条件");
      return;
    }
    if (action === "add-reward") {
      this.updateEntry(
        (quest) => {
          quest.rewards.push({
            itemId: "",
            quantity: 1
          });
        },
        { rerender: true, focus: "reward-itemId" }
      );
      this.onStatus("已添加获得物品");
      return;
    }
    if (
      action === "remove-prerequisite" &&
      Number.isInteger(index)
    ) {
      this.updateEntry(
        (quest) => {
          quest.prerequisites.splice(index, 1);
        },
        { rerender: true }
      );
      this.onStatus("已删除任务前置条件");
      return;
    }
    if (
      action === "remove-completion" &&
      Number.isInteger(index)
    ) {
      this.updateEntry(
        (quest) => {
          quest.completionConditions.splice(index, 1);
        },
        { rerender: true }
      );
      this.onStatus("已删除完成条件");
      return;
    }
    if (
      action === "remove-reward" &&
      Number.isInteger(index)
    ) {
      this.updateEntry(
        (quest) => {
          quest.rewards.splice(index, 1);
        },
        { rerender: true }
      );
      this.onStatus("已删除获得物品");
    }
  }

  handleInput(event) {
    const field = event.target.dataset.questField;
    const list = event.target.dataset.questList;
    if (!field || !list) {
      return;
    }
    const index = Number(event.target.dataset.questIndex);
    const entry = this.selectedEntry;
    if (!entry) {
      return;
    }

    let value = event.target.value;
    if (list === "prerequisites" && field === "taskId") {
      value = value.replace(/\D/g, "").slice(0, 4);
      event.target.value = value;
      value = value ? `${TASK_ID_PREFIX}${value}` : "";
    } else if (field === "itemId") {
      value = value.replace(/\D/g, "").slice(0, 4);
      event.target.value = value;
      value = value ? `${ITEM_ID_PREFIX}${value}` : "";
    } else if (field === "quantity") {
      value = value === "" ? 0 : Number(value);
    }
    this.updateEntry(
      (quest) => {
        const target = this.getQuestList(quest, list)?.[index];
        if (target) {
          target[field] = value;
        }
      },
      {
        coalesceKey: `quest:${entry.id}:${list}:${index}:${field}`
      }
    );
    if (field === "itemId") {
      this.refreshDuplicateState();
    }
  }

  handleChange(event) {
    if (!(event.target instanceof HTMLSelectElement)) {
      return;
    }
    const field = event.target.dataset.questField;
    const list = event.target.dataset.questList;
    if (!field || !list) {
      return;
    }
    const index = Number(event.target.dataset.questIndex);
    const value =
      field === "quantity"
        ? event.target.value === ""
          ? 0
          : Number(event.target.value)
        : event.target.value;
    this.updateEntry(
      (quest) => {
        const target = this.getQuestList(quest, list)?.[index];
        if (target) {
          target[field] = value;
        }
      }
    );
  }

  getQuestList(quest, list) {
    if (list === "prerequisites") {
      return quest.prerequisites;
    }
    if (list === "completion") {
      return quest.completionConditions;
    }
    if (list === "reward") {
      return quest.rewards;
    }
    return null;
  }

  refreshDuplicateState() {
    const entry = this.selectedEntry;
    if (!entry) {
      return;
    }
    for (const [list, items] of [
      ["completion", entry.completionConditions ?? []],
      ["reward", entry.rewards ?? []]
    ]) {
      const duplicates = findDuplicateIds(items, "itemId");
      for (const input of this.root.querySelectorAll(
        `[data-quest-list="${list}"][data-quest-field="itemId"]`
      )) {
        const duplicate = duplicates.has(input.value);
        input.classList.toggle("is-invalid", duplicate);
        input.setAttribute("aria-invalid", String(duplicate));
      }
    }
  }

  updateEntry(mutator, options = {}) {
    const selection = this.store.selection;
    if (selection?.moduleKey !== "quests") {
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
          entry.prerequisites ??= [];
          entry.completionConditions ??= [];
          entry.rewards ??= [];
          mutator(entry);
        },
        {
          coalesceKey: options.coalesceKey ?? null
        }
      );
    } finally {
      this.inputLock = false;
    }
    if (changed && options.rerender) {
      this.render();
      if (options.focus) {
        this.focusNewestField(options.focus);
      }
    }
    return changed;
  }

  getDefaultPrerequisiteCondition(quest) {
    const usedPairs = new Set(
      quest.prerequisites.map(
        (condition) =>
          `${condition.taskId}\u0000${condition.status}`
      )
    );
    const candidates = this.quests.filter(
      (candidate) => candidate.id !== quest.id
    );
    for (const candidate of candidates) {
      for (const status of QUEST_STATUSES) {
        if (
          !usedPairs.has(
            `${candidate.id}\u0000${status.value}`
          )
        ) {
          return {
            taskId: candidate.id,
            status: status.value
          };
        }
      }
    }
    return {
      taskId: candidates[0]?.id ?? "",
      status: "inactive"
    };
  }

  focusNewestField(field) {
    requestAnimationFrame(() => {
      const [list, fieldName] = field.split("-");
      const rows = this.root.querySelectorAll(
        `[data-quest-list="${list}"][data-quest-field="${fieldName}"]`
      );
      rows[rows.length - 1]?.focus({ preventScroll: true });
    });
  }
}

function findDuplicateIds(items, key) {
  const seen = new Set();
  const duplicates = new Set();
  for (const item of items) {
    const value = item?.[key];
    if (!value) {
      continue;
    }
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  }
  return duplicates;
}

function getPrefixedIdSuffix(value, prefix) {
  return typeof value === "string" && value.startsWith(prefix)
    ? value.slice(prefix.length)
    : "";
}
