// 补跑被弹窗挂起的【克罗研究记录】额外结算。先摘掉暂存再跑，避免补跑过程中
// 又挂起时把同一个 pending 反复写回；actor 已不在场则直接丢弃。
// 从 battle-combat.js 拆出，逐行搬迁、对外行为完全一致。
window.BattleKrowRepeatResume = ({ specials, allUnits, checkDefeat, checkEnd }) => {
  function resumeKrowRepeat(state) {
    const pending = state.battle?.krowRepeatResume;
    if (!pending) return false;
    state.battle.krowRepeatResume = null;
    const actor = allUnits(state.battle).find(unit => unit.uid === pending.actorUid);
    if (!actor) return false;
    const target = allUnits(state.battle).find(unit => unit.uid === pending.targetUid) || null;
    const ok = specials.repeatTactic(state, actor, target, pending.card);
    checkDefeat(state); checkEnd(state);
    return ok;
  }

  return { resumeKrowRepeat };
};
