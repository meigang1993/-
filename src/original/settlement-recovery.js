window.SettlementRecovery = (() => {
  const active = new WeakSet();
  function list(state) {
    state._pendingSettlementActions = Array.isArray(state._pendingSettlementActions)
      ? state._pendingSettlementActions
      : [];
    return state._pendingSettlementActions;
  }
  function enqueue(state, action) {
    if (!action?.id || !action?.type) throw new Error("无效的附加结算记录");
    const pending = list(state);
    if (!pending.some(item => item.id === action.id)) pending.push({ ...action, attempts: 0 });
  }
  async function run(state, handler) {
    const pending = list(state);
    if (active.has(state)) return false;
    active.add(state);
    try {
      while (pending.length) {
        const action = pending[0];
        try {
          await handler(action);
          pending.shift();
        } catch (error) {
          action.attempts = (Number(action.attempts) || 0) + 1;
          action.lastError = error?.message || "附加结算失败";
          if (action.attempts === 1) state.log?.unshift?.("部分附加结算待重试，奖励记录已保留。");
          console.error("附加结算补偿失败:", action.type, error?.message, error?.stack);
          return false;
        }
      }
      return true;
    } finally {
      active.delete(state);
    }
  }
  function count(state) { return list(state).length; }
  return { enqueue, run, count };
})();
