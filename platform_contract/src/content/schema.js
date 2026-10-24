export const CURRENT_CONTENT_SCHEMA_VERSION = 16;

export const ITEM_STACK_LIMIT_MAX = 9999;

export const ITEM_EFFECT_MODES = Object.freeze([
  Object.freeze({ value: "description", label: "效果描述" }),
  Object.freeze({ value: "script", label: "导入脚本" })
]);

const itemEffectModeValues = new Set(
  ITEM_EFFECT_MODES.map((mode) => mode.value)
);

export function isItemEffectMode(value) {
  return itemEffectModeValues.has(value);
}

export const CHARACTER_ATTRIBUTE_DEFINITIONS = Object.freeze([
  Object.freeze({ key: "maxHealth", label: "生命值上限" }),
  Object.freeze({ key: "defense", label: "防御力" }),
  Object.freeze({ key: "attack", label: "攻击力" }),
  Object.freeze({ key: "invincibilityFrames", label: "无敌帧" }),
  Object.freeze({
    key: "healthRegenPerSecond",
    label: "每秒生命恢复"
  }),
  Object.freeze({
    key: "attackHealthRecovery",
    label: "攻击生命回复"
  }),
  Object.freeze({
    key: "hitHealthRecovery",
    label: "受击生命回复"
  }),
  Object.freeze({ key: "lifestealRate", label: "吸血率" }),
  Object.freeze({ key: "moveSpeed", label: "移动速度" }),
  Object.freeze({ key: "jumpHeight", label: "跳跃高度" }),
  Object.freeze({ key: "jumpCount", label: "跳跃次数" }),
  Object.freeze({ key: "dashSpeed", label: "冲刺速度" }),
  Object.freeze({ key: "dashDamage", label: "冲刺伤害" }),
  Object.freeze({
    key: "rollInvincibilityFrames",
    label: "翻滚无敌帧"
  }),
  Object.freeze({ key: "rollDistance", label: "翻滚距离" }),
  Object.freeze({ key: "fallSpeed", label: "下落速度" })
]);

export const CHARACTER_ANIMATION_TYPES = Object.freeze([
  Object.freeze({ key: "move", label: "移动动画", repeatable: false }),
  Object.freeze({ key: "attack", label: "攻击动画", repeatable: false }),
  Object.freeze({ key: "hurt", label: "受击动画", repeatable: false }),
  Object.freeze({ key: "death", label: "死亡动画", repeatable: false }),
  Object.freeze({ key: "jump", label: "跳跃动画", repeatable: false }),
  Object.freeze({ key: "block", label: "格挡动画", repeatable: false }),
  Object.freeze({
    key: "block_counter",
    label: "格挡反击动画",
    repeatable: false
  }),
  Object.freeze({ key: "dash", label: "冲刺动画", repeatable: false }),
  Object.freeze({ key: "roll", label: "翻滚动画", repeatable: false }),
  Object.freeze({ key: "fall", label: "下落动画", repeatable: false }),
  Object.freeze({ key: "idle", label: "待机动画", repeatable: false }),
  Object.freeze({ key: "other", label: "其它动画", repeatable: true })
]);

export const CHARACTER_TRIGGER_DEVICES = Object.freeze([
  Object.freeze({ value: "keyboard", label: "键盘" }),
  Object.freeze({ value: "mouse", label: "鼠标" })
]);

export const CHARACTER_TRIGGER_DIRECTIONS = Object.freeze([
  Object.freeze({ value: "right", label: "向右" }),
  Object.freeze({ value: "left", label: "向左镜像" })
]);

export const QUEST_STATUSES = Object.freeze([
  Object.freeze({ value: "inactive", label: "未触发" }),
  Object.freeze({ value: "active", label: "进行中" }),
  Object.freeze({ value: "completed", label: "已完成" })
]);

export const QUEST_COMPLETION_CONDITION_TYPES = Object.freeze([
  Object.freeze({
    value: "item_quantity",
    label: "物品数量"
  })
]);

const questStatusValues = new Set(
  QUEST_STATUSES.map((status) => status.value)
);
const questCompletionConditionTypeValues = new Set(
  QUEST_COMPLETION_CONDITION_TYPES.map((type) => type.value)
);
const characterAnimationTypeByKey = new Map(
  CHARACTER_ANIMATION_TYPES.map((type) => [type.key, type])
);
const characterTriggerDeviceValues = new Set(
  CHARACTER_TRIGGER_DEVICES.map((device) => device.value)
);
const characterTriggerDirectionValues = new Set(
  CHARACTER_TRIGGER_DIRECTIONS.map((direction) => direction.value)
);

export const CONTENT_MODULES = Object.freeze([
  Object.freeze({
    key: "conversations",
    prefix: "00",
    label: "会话",
    entryLabel: "会话"
  }),
  Object.freeze({
    key: "quests",
    prefix: "01",
    label: "任务",
    entryLabel: "任务"
  }),
  Object.freeze({
    key: "items",
    prefix: "02",
    label: "物品",
    entryLabel: "物品"
  }),
  Object.freeze({
    key: "animations",
    prefix: "03",
    label: "动画演绎",
    entryLabel: "动画演绎"
  }),
  Object.freeze({
    key: "characters",
    prefix: "04",
    label: "角色",
    entryLabel: "角色"
  })
]);

export const CONTENT_ID_PATTERN =
  /^(00|01|02|03|04)-[0-9]{4}$/;
export const CONTENT_FOLDER_ID_PATTERN =
  /^(00|01|02|03|04)-folder-([0-9]{4})$/;
export const CONVERSATION_FOLDER_ID_PATTERN =
  /^00-folder-([0-9]{4})$/;
export const MAX_RECENT_CONVERSATIONS = 10;

const moduleByKey = new Map(
  CONTENT_MODULES.map((definition) => [
    definition.key,
    definition
  ])
);
const moduleByPrefix = new Map(
  CONTENT_MODULES.map((definition) => [
    definition.prefix,
    definition
  ])
);

export function getContentModuleDefinition(key) {
  return moduleByKey.get(key) ?? null;
}

export function getContentModuleByPrefix(prefix) {
  return moduleByPrefix.get(prefix) ?? null;
}

export function getContentModuleForId(id) {
  if (typeof id !== "string" || !CONTENT_ID_PATTERN.test(id)) {
    return null;
  }
  return getContentModuleByPrefix(id.slice(0, 2));
}

export function isContentId(value) {
  return typeof value === "string" && CONTENT_ID_PATTERN.test(value);
}

export function isQuestStatus(value) {
  return questStatusValues.has(value);
}

export function isQuestCompletionConditionType(value) {
  return questCompletionConditionTypeValues.has(value);
}

export function getCharacterAnimationTypeDefinition(key) {
  return characterAnimationTypeByKey.get(key) ?? null;
}

export function isCharacterAnimationType(value) {
  return characterAnimationTypeByKey.has(value);
}

export function isCharacterTriggerDevice(value) {
  return characterTriggerDeviceValues.has(value);
}

export function isCharacterTriggerDirection(value) {
  return characterTriggerDirectionValues.has(value);
}

export function createDefaultCharacterAttributes() {
  return Object.fromEntries(
    CHARACTER_ATTRIBUTE_DEFINITIONS.map((definition) => [
      definition.key,
      0
    ])
  );
}

export function createDefaultCharacterCollisionBody() {
  return {
    x: 0.3,
    y: 0.14,
    width: 0.4,
    height: 0.82
  };
}
