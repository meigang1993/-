window.HallUnlockEvents = (() => {
  const unlocks = {
    millerUnlock: { source: "manny", target: "miller", flag: "millerUnlockSeen", modal: "millerUnlock", log: "米勒加入角色栏。曼妮苏醒后的来客事件已完成。" },
    gerlotUnlock: { source: "bertis", target: "gerlot", flag: "gerlotUnlockSeen", modal: "gerlotUnlock", log: "杰洛特加入角色栏。贝尔蒂丝苏醒后的归还事件已完成。" },
    cadicisUnlock: { source: "wendy", target: "cadicis", flag: "cadicisUnlockSeen", modal: "cadicisUnlock", log: "卡迪西斯加入角色栏。温蒂苏醒后的战地来客事件已完成。" },
    lukaUnlock: { source: "angelica", target: "luka", flag: "lukaUnlockSeen", modal: "lukaUnlock", log: "鲁卡加入角色栏。安洁莉卡苏醒后的别墅重逢事件已完成。" }
  };
  const completions = {
    firstDefeat: { target: "loki", flag: "firstDefeatSeen", log: "洛基加入角色栏。首次全军覆没事件已完成。" },
    secondDefeat: { target: "carlos", flag: "secondDefeatSeen", log: "卡洛斯加入角色栏。第二次全军覆没事件已完成。" },
    ...unlocks
  };
  const eventIds = { firstDefeat:"first_defeat", secondDefeat:"second_defeat", millerUnlock:"miller", gerlotUnlock:"gerlot", cadicisUnlock:"cadicis", lukaUnlock:"luka" };
  const character = id => state.chars.find(x => x.id === id);
  function trigger(key) {
    const e = unlocks[key]; if (!e) return false;
    state.flags = state.flags || {};
    const source = character(e.source), target = character(e.target);
    if (source && !source.locked && target?.locked && !state.flags[e.flag]) { state.view = "hall"; state.hallModal = e.modal; return true; }
    return false;
  }
  function triggerAll() {
    if (state.hallModal) return;
    if (window.StoreUnlockMigrations?.recoverPendingDefeatEvents?.(state)) return;
    if (Object.keys(unlocks).some(trigger) || window.triggerAceUnlockEvent?.()) return;
    if (window.triggerUnderwaterTrainUnlockEvent?.()) return;
    if (window.OrcUnlockEvents?.triggerPending?.(state)) return;
    if (window.triggerPendingPostUnderwaterTrainEvents?.(state)) return;
    if (window.NewCharacterUnlockEvents?.triggerPending?.(state)) return;
    window.RecruitUnlockEvents?.triggerPending?.(state);
  }
  async function complete(key) {
    const e = completions[key]; if (!e) return false;
    const wasLocked = !!character(e.target)?.locked;
    const ok = await window.ServerCore.call("unlockEvent", { id: eventIds[key] || key }, state);
    if (ok.stale) return false;
    if (!ok.ok) { state.log.unshift("剧情解锁失败，请重试。"); render(); persist(); return false; }
    state.flags = state.flags || {}; state.flags[e.flag] = true;
    const target = character(e.target);
    if (target?.locked) { target.locked = false; target.hp = target.stats.maxHp; }
    if (wasLocked) log(e.log);
    state.hallModal = null;
    const saved = await persist({ flush: true });
    render();
    return saved;
  }
  return { trigger, triggerAll, complete };
})();
