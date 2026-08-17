window.BattleEffectDrain = ({ runtime, isCurrent, resolveIdle, recover }) => {
  const { wait } = window.BattleEffectUtils;
  const handlers = window.BattleEffectHandlers;
  const recovery = window.BattleEffectDrainRecovery(recover);
  const runner = window.BattleEffectEventRunner(handlers);
  const RENDER_THROTTLE_MS = 60;

  return async function drain(state, renderStep) {
    const version = runtime.version;
    const battleAtStart = state.battle;
    const active = () => isCurrent(state, version)
      && state.battle === battleAtStart;
    runtime.pendingState = state;
    if (runtime.animating || !state.battle || !active()) return;
    if (runtime.settleBlockedBattle === state.battle && !state.battle.animQueue?.length) return;
    if (state.battle.animQueue?.length) runtime.settleBlockedBattle = null;
    runtime.draining = true;
    let shouldRender = false;
    let lastRender = Number.NEGATIVE_INFINITY;
    let renderQueued = false;
    let currentEvent = null;
    let finishCommit = null;
    const renderThrottled = () => {
      const now = performance.now();
      if (renderQueued || now - lastRender < RENDER_THROTTLE_MS) return;
      lastRender = now;
      renderQueued = true;
      requestAnimationFrame(() => {
        renderQueued = false;
        if (active() && runtime.draining && state.view === "battle") renderStep();
      });
    };
    try {
      if (!state.battle.animQueue?.length) {
        shouldRender = !!window.BattleSystem?.settlePending?.(state);
        return;
      }
      runtime.animating = true;
      while (state.battle?.animQueue?.length) {
        if (!active()) break;
        currentEvent = window.BattleSystem.shiftAnim(state.battle);
        runtime.currentEvent = currentEvent;
        finishCommit = recovery.guardCommit(currentEvent);
        await runner.runEvent(state, currentEvent, renderStep, renderThrottled, active);
        if (!active()) break;
        currentEvent = null;
        runtime.currentEvent = null;
        finishCommit = null;
        await wait(0);
      }
      if (!active()) return;
      handlers.clearVisuals(state);
      shouldRender = !!window.BattleSystem?.settlePending?.(state) || state.view === "battle";
    } catch (err) {
      if (!active()) return;
      console.error("战斗动画结算失败:", err.message, err.stack);
      try {
        if (currentEvent?.runtimeCommitState !== "failed") finishCommit?.();
      }
      catch (commitErr) { console.error("战斗事件补偿提交失败:", commitErr.message, commitErr.stack); }
      recovery.recoverEvent(state, currentEvent);
      if (!currentEvent && state.battle) runtime.settleBlockedBattle = state.battle;
      const action = currentEvent ? "已跳过故障动画并继续结算" : "已暂停自动结算，请重试当前操作";
      window.BattleLog?.add?.(state, `战斗动画异常：${err.message || "未知错误"}。${action}。`);
      shouldRender = state.view === "battle";
    } finally {
      if (version === runtime.version) {
        runtime.currentEvent = null;
        if (!active() && runtime.pendingState === state) runtime.pendingState = null;
        runtime.animating = false;
        runtime.draining = false;
        if (!active() || !state.battle?.animQueue?.length) resolveIdle();
        if (shouldRender) renderStep();
      }
    }
  };
};
