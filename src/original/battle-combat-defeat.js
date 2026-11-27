// 阵亡弃牌与败北判定：从 battle-combat.js 拆出，保持对外行为完全一致。
// 依赖全部注入，加载期零副作用；缺文件时主文件显式抛错。
window.BattleCombatDefeat = ({ deps, allUnits, pendingFatalAnim, clearSelection }) => {
  function discardDeadHands(state, b) {
    const units = allUnits(b);
    units.filter(u => u.hp <= 0 && !window.SakuraRisaSkills?.pendingRevival?.(u)).forEach(u => {
      if (!u.deathDiscarded && u.hand?.length) {
        const cards = u.hand.splice(0); u.deathDiscarded = true;
        window.BattleCards?.putMany?.(b, u, cards, "discard", { skipAfterHandLost: true });
        window.BattleLog.add(state, `${u.name} 被击倒，弃置所有手牌。`);
      }
      // 角色牌上的存储牌即使手牌为空也要清：按三国杀破军 FAQ，被击倒时
      // 扣置于武将牌旁的牌直接置入弃牌堆，不回到手牌、不触发获得牌类效果。
      if (!u.storedDiscarded) {
        window.BattleCharacterCardStorage?.discardForDead?.(state, u);
        u.storedDiscarded = true;
      }
    });
  }
  function checkDefeat(state) {
    const b = state.battle; if (!b || b.failedTriggered || b.pendingDefeat) return !!(b?.failedTriggered || b?.pendingDefeat);
    if (pendingFatalAnim(b)) return false;
    if (!b.test) discardDeadHands(state, b);
    if (b.test) { const fallen = b.allies.filter(a => a.hp <= 0 && !window.SakuraRisaSkills?.pendingRevival?.(a)); if (fallen.length) { fallen.forEach(a => { a.hp = a.maxHp; a.block = 0; }); b.testRecovery = true; clearTimeout(b.testRecoveryTimer); b.testRecoveryTimer = setTimeout(() => { if ((window.state && window.state !== state) || state.battle !== b) return; b.testRecovery = false; window.render?.(); }, 1200); window.BattleLog.add(state,"测试模式·生命恢复。"); } return false; }
    if (b.allies.some(a => a.hp > 0 || window.SakuraRisaSkills?.pendingRevival?.(a))) return false; b.failedTriggered = true; b.pendingDefeat = true; b.locked = true; clearSelection(b); return true;
  }
  return { discardDeadHands, checkDefeat };
};
