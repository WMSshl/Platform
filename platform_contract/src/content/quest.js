/**
 * 判断任务前置条件是否满足。
 *
 * 条件按任务 ID 分组：同组状态之间为 OR，不同任务之间为 AND。
 * 前置列表为空时不限制任务激活。
 */
export function areQuestPrerequisitesMet(quest, questStatuses) {
  const prerequisites = quest?.prerequisites;
  const conditions = Array.isArray(prerequisites)
    ? prerequisites
    : Array.isArray(prerequisites?.conditions)
      ? prerequisites.conditions
      : [];
  if (conditions.length === 0) {
    return true;
  }

  const statusesByTaskId = new Map();
  for (const condition of conditions) {
    const statuses =
      statusesByTaskId.get(condition.taskId) ?? new Set();
    statuses.add(condition.status);
    statusesByTaskId.set(condition.taskId, statuses);
  }
  for (const [taskId, statuses] of statusesByTaskId) {
    const currentStatus = questStatuses?.[taskId];
    if (!statuses.has(currentStatus)) {
      return false;
    }
  }
  return true;
}

/**
 * 判断物品数量类完成条件是否全部满足。
 *
 * 多个物品条件之间为 AND。只有任务处于 active 时才会返回 true；
 * 没有完成条件时返回 false，避免空任务在获得任意物品时被误判为完成。
 */
export function isQuestCompletionMet(quest, inventory, status) {
  if (status !== "active") {
    return false;
  }
  const conditions = Array.isArray(quest?.completionConditions)
    ? quest.completionConditions
    : [];
  if (conditions.length === 0) {
    return false;
  }
  return conditions.every((condition) => {
    if (condition?.type !== "item_quantity") {
      return false;
    }
    const quantity = Number(inventory?.[condition.itemId] ?? 0);
    return (
      Number.isFinite(quantity) &&
      quantity >= condition.quantity
    );
  });
}

/**
 * 获得物品后计算任务状态变化与应发放奖励。
 *
 * 只有 active 任务满足全部物品条件时才转为 completed；其他状态
 * （尤其是已完成的终态）保持原状态且不重复发放奖励。
 */
export function resolveQuestOnItemAcquired(
  quest,
  currentStatus,
  inventory
) {
  if (
    currentStatus !== "active" ||
    !isQuestCompletionMet(quest, inventory, currentStatus)
  ) {
    return {
      status: currentStatus,
      rewards: []
    };
  }
  return {
    status: "completed",
    rewards: (Array.isArray(quest?.rewards)
      ? quest.rewards
      : []
    ).map((reward) => ({
      itemId: reward.itemId,
      quantity: reward.quantity
    }))
  };
}
