window.ExtraUnlockEvents = (() => {
  function healSortie(state, ids) { (ids || []).forEach(id => { const c = state.chars.find(x => x.id === id); if (c) c.hp = c.stats.maxHp; }); }
  async function unlockEvent(state, id) {
    const ok = await window.ServerCore.call("unlockEvent", { id }, state);
    if (ok.stale) return false;
    if (!ok.ok) { state.log.unshift("剧情解锁失败，请重试。"); render(); persist(); return false; }
    return true;
  }
  window.tryLittleElranaEncounter = async function tryLittleElranaEncounter(state, context, ownsAction = () => true) {
    state.flags = state.flags || {};
    const run = state.explore, active = run?.activeParty || state.party || [], enemies = context?.enemies || [];
    const elrana = state.chars.find(x => x.id === "elrana"), little = state.chars.find(x => x.id === "little_elrana");
    if (!context?.exploration || state.flags.littleElranaUnlockSeen || state.flags.littleElranaUnlockPending || !active.includes("elrana") || elrana?.locked || !little?.locked) return false;
    if (!enemies.some(e => e.id === "elrana_clone")) return false;
    const ready = await window.DungeonRewards?.retryPending?.(state);
    if (!ownsAction()) return false;
    if (!ready) { state.log.unshift("附加结算尚未完成，请重试后再次进入该节点。"); return true; }
    const ok = await window.ServerCore.call("bankRun", { run }, state);
    if (!ownsAction()) return false;
    if (!ok.ok) { state.log.unshift("剧情结算失败，请重试。"); return true; }
    window.BountySystem?.failRun?.(state, run?.missionId);
    const key = run?.focusId || `${run?.missionId || "event"}:little-elrana`;
    window.SettlementRecovery?.enqueue?.(state, { id: `event-claim:${key}`, type: "claimBounty", data: {} });
    const recovered = await window.DungeonRewards?.retryPending?.(state);
    if (!ownsAction()) return false;
    state.flags.littleElranaUnlockPending = true;
    healSortie(state, run?.party || state.party); window.BattleFX?.leave?.(state); state.explore = null; state.battle = null; state.view = "hall"; state.hallModal = "littleElranaUnlock";
    state.loadingBattleName = null; state.loadingBattleProgress = null; state.log.unshift(`艾尔拉娜与克隆体相遇，战斗被强制终止并返回别墅${recovered ? "。" : "，部分任务奖励待重试。"}`);
    return true;
  };
  window.completeLittleElranaUnlockEvent = async function completeLittleElranaUnlockEvent() {
    if (!await unlockEvent(state, "little_elrana")) return;
    state.codexFlashId = "little_elrana"; state.log.unshift("小艾尔拉娜加入角色栏。克隆体归巢事件已完成。");
    state.hallModal = null; const saved = await persist({ flush: true }); render(); return saved;
  };
  window.triggerAceUnlockEvent = function triggerAceUnlockEvent() {
    state.flags = state.flags || {};
    const elrana = state.chars.find(x => x.id === "elrana"), ace = state.chars.find(x => x.id === "ace");
    if (elrana && !elrana.locked && ace?.locked && !state.flags.aceUnlockSeen) { state.view = "hall"; state.hallModal = "aceUnlock"; return true; }
    return false;
  };
  window.completeAceUnlockEvent = async function completeAceUnlockEvent() {
    if (!await unlockEvent(state, "ace")) return;
    state.log.unshift("艾斯加入角色栏。艾尔拉娜苏醒后的真相事件已完成。");
    state.hallModal = null; const saved = await persist({ flush: true }); render(); return saved;
  };
  window.triggerUnderwaterTrainUnlockEvent = function triggerUnderwaterTrainUnlockEvent() {
    state.flags = state.flags || {};
    const nanali = state.chars.find(x => x.id === "nanali");
    if (nanali && !nanali.locked && !state.flags.underwaterTrainUnlocked && !state.flags.underwaterTrainUnlockSeen) { state.view = "hall"; state.hallModal = "underwaterTrainUnlock"; return true; }
    return false;
  };
  window.completeUnderwaterTrainUnlockEvent = async function completeUnderwaterTrainUnlockEvent() {
    if (!await unlockEvent(state, "underwater_train")) return;
    state.codexFlashId = "aileng";
    state.log.unshift("水下列车已解锁。艾伦格加入角色栏。普雷希的委托事件已完成。");
    state.hallModal = null; const saved = await persist({ flush: true }); render(); return saved;
  };
  window.triggerPostUnderwaterTrainClearEvents = function triggerPostUnderwaterTrainClearEvents(state, run) {
    state.flags = state.flags || {};
    if (run?.missionId !== "underwater_train") return false;
    const firstClear = !state.flags.underwaterTrainFirstClear;
    if (firstClear) state.flags.underwaterTrainFirstClear = true;
    const aileng = state.chars.find(x => x.id === "aileng"), ophelia = state.chars.find(x => x.id === "ophelia"), besta = state.chars.find(x => x.id === "besta");
    if (aileng && !aileng.locked) state.flags.ailengUnlockSeen = true;
    if (ophelia && !ophelia.locked) state.flags.opheliaUnlockSeen = true;
    if (besta && !besta.locked) state.flags.bestaNurseryUnlocked = true;
    const ailengJoined = (run.party || []).includes("aileng");
    if (ailengJoined && besta?.locked && !state.flags.bestaNurseryUnlocked && !state.flags.bestaNurseryUnlockSeen) state.flags.bestaNurseryUnlockPending = true;
    return window.triggerPendingPostUnderwaterTrainEvents(state);
  };
  window.triggerPendingPostUnderwaterTrainEvents = function triggerPendingPostUnderwaterTrainEvents(state) {
    const ophelia = state.chars.find(x => x.id === "ophelia");
    if (state.flags?.underwaterTrainFirstClear && ophelia?.locked && !state.flags.opheliaUnlockSeen) { state.hallModal = "opheliaUnlock"; return true; }
    if (state.flags?.bestaNurseryUnlockPending && !state.flags.bestaNurseryUnlocked && !state.flags.bestaNurseryUnlockSeen) { state.hallModal = "bestaNurseryUnlock"; return true; }
    return false;
  };
  window.completeOpheliaUnlockEvent = async function completeOpheliaUnlockEvent() {
    if (!await unlockEvent(state, "ophelia")) return;
    state.codexFlashId = "ophelia"; state.log.unshift("奥菲莉亚加入角色栏。人鱼公主的彩礼事件已完成。");
    state.hallModal = state.flags.bestaNurseryUnlockPending ? "bestaNurseryUnlock" : null;
    const saved = await persist({ flush: true }); render(); return saved;
  };
  window.completeBestaNurseryUnlockEvent = async function completeBestaNurseryUnlockEvent() {
    if (!await unlockEvent(state, "besta_nursery")) return;
    state.log.unshift("贝丝妲已在孕育殿堂开放兑换。血精与宝珠事件已完成。");
    state.hallModal = null; const saved = await persist({ flush: true }); render(); return saved;
  };
  return window.ExtraUnlockEventViews;
})();
