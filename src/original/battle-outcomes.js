window.BattleOutcomes = ({ clearBattleLog, finishBattle, combat }) => {
  function healParty(state) { state.party.slice(0, 4).forEach(id => { const c = state.chars.find(x => x.id === id); if (c) c.hp = c.stats.maxHp; }); }
  function retreat(state) {
    if (state.battle?.test) { clearBattleLog(state); window.BattleFX?.leave?.(state); state.hallModal = "testBattle"; state.view = "hall"; state.battle = null; return; }
    if (state.battle?.exploration) return;
    healParty(state); clearBattleLog(state); state.log.unshift("主动撤退，已获资源保留，出战角色生命已恢复。"); window.BattleFX?.leave?.(state); state.view = "hall"; state.battle = null;
  }
  async function returnHall(state) {
    state.battle && (state.battle.failedTriggered = false);
    if (state.battle?.exploration && window.DungeonSystem) { clearBattleLog(state); return DungeonSystem.fail(state); }
    const defeated = !!state.battle?.defeat || !!state.battle?.pendingDefeat, beforeFirst = !!state.flags?.firstDefeatSeen, beforeSecond = !!state.flags?.secondDefeatSeen;
    if (defeated) { const defeatId = state.battle._defeatSettlementId ||= window.ReceiptLedger.assign(state, "defeat", "_localDefeatLedger", "_localDefeatCounter", "_localDefeatIds"); const ok = defeatId && await window.ServerCore.call("settleDefeat", { defeatId }, state); if (ok?.stale) return; if (!ok?.ok) { state.battle.failedTriggered = false; state.battle.pendingDefeat = false; state.battle.locked = false; state.log.unshift("结算失败，请重试。"); return; } }
    healParty(state); clearBattleLog(state); window.BattleFX?.leave?.(state); state.view = "hall"; state.battle = null;
    if (!defeated) return;
    if (!beforeFirst && state.flags?.firstDefeatSeen) state.hallModal = "firstDefeat", state.log.unshift("首次全军覆没：回到大厅触发贝丝妲与洛基事件，洛基加入角色栏。");
    else if (!beforeSecond && state.flags?.secondDefeatSeen) state.hallModal = "secondDefeat", state.log.unshift("第二次全军覆没：回到大厅触发卡洛斯事件，卡洛斯加入角色栏。");
  }
  async function continueVictory(state) {
    if (state.battle?.test) { clearBattleLog(state); window.BattleFX?.leave?.(state); state.battle = null; state.view = "hall"; state.hallModal = "testBattle"; return; }
    window.BattleVictory?.close(state); return finishBattle(state, true, true);
  }
  function settlePending(state) {
    const b = state.battle; if (!b) return false;
    combat.checkDefeat(state); combat.checkEnd(state);
    if (b.pendingDefeat) { b.pendingDefeat = false; b.defeat = true; window.BattleLog.add(state, "全军覆没，本次探索资源全部丢失。请返回据点。"); return true; }
    if (b.pendingVictory) { finishBattle(state, true); return true; }
    return false;
  }
  return { continueVictory, retreat, returnHall, settlePending };
};
