// 存档纪元：标记存档是否属于当前版本支持的一代。
// 本次更新（99 版）起存档结构不再兼容旧档，旧存档会在启动时被清除，
// 玩家需从新游戏开始。判断依据是存档里的 saveEpoch 字段：
//   缺失（旧档）或数值不等于当前纪元 → 旧存档。
window.GameSaveEpoch = (() => {
  const field = "saveEpoch";
  const epoch = 2;

  function current() { return epoch; }
  function mark(state) {
    if (state && typeof state === "object") state[field] = epoch;
    return state;
  }
  // 传入存档原始对象（未经迁移亦可）。空值一律视为旧档。
  function isLegacy(raw) {
    return Number(raw?.[field] || 0) !== epoch;
  }
  return { field, epoch, current, mark, isLegacy };
})();
