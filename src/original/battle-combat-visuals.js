window.BattleCombatVisuals = (deps, allUnits) => {
  function holdVisual(u) { if (!u) return; if (u.visualHp == null) u.visualHp = u.hp; if (u.visualBlock == null) u.visualBlock = u.block || 0; if (u.visualDefense == null) u.visualDefense = u.defenseSystem || 0; }
  function visualOf(u) { return { visualHp: u.hp, visualBlock: u.block || 0, visualDefense: u.defenseSystem || 0 }; }
  function holdFloatVisual(u, kind, value, finalVisual) {
    if (!u) return;
    const hp = finalVisual?.visualHp ?? u.hp, block = finalVisual?.visualBlock ?? u.block ?? 0, defense = finalVisual?.visualDefense ?? u.defenseSystem ?? 0;
    if (u.visualHp == null) u.visualHp = kind === "heal" ? hp - value : kind === "damage" || kind === "hp-loss" ? hp + value : hp;
    if (u.visualBlock == null) u.visualBlock = kind === "armor-gain" ? block - value : kind === "armor" || kind === "armor-break" ? block + value : block;
    if (u.visualDefense == null) u.visualDefense = kind === "defense" || kind === "defense-break" ? defense + value : defense;
  }
  function pushFloat(b, uid, kind, value, critical = false, delay = 0, visual = null, label = null, meta = null) {
    if (!value) return;
    const unit = allUnits(b).find(u => u.uid === uid);
    const finalVisual = visual || (unit ? visualOf(unit) : null);
    holdFloatVisual(unit, kind, value, finalVisual);
    b.floats = b.floats || [];
    b.floatSeq = (b.floatSeq || 0) + 1;
    const f = { id: `f${deps.nextAnim()}`, uid, kind, value, critical, seq: b.floatSeq, delay, hitFxId: b.hitFxId, ...(finalVisual || {}), label, ...(meta || {}) };
    b.floats.push(f);
    b.animQueue?.push({ type: "float", id: f.id, uid, kind, delay, hitFxId: f.hitFxId, visualHp: f.visualHp, visualBlock: f.visualBlock, visualDefense: f.visualDefense, label: f.label, critical: f.critical, effectCritical: f.effectCritical, damageTypes: f.damageTypes, attackType: f.attackType, magicDamage: f.magicDamage, hybridAttack: f.hybridAttack, commit: f.commit });
  }
  function queueSlashText(state, actor, target = null, card = null) {
    if (!state.battle?.animQueue || !actor) return;
    if (!target || !card) {
      state.battle.animQueue.push({ type: "slashText", id: `st${deps.nextAnim()}`, uid: actor.uid, side: actor.side, targetUid: target?.uid || null, enemyLine: actor.side === "enemy" });
      return;
    }
    const replayCard = { ...card, sweep: false, targetless: false, aoeLineShown: false };
    delete replayCard.allTargets;
    delete replayCard.targetUids;
    delete replayCard.nextTargetIndex;
    delete replayCard._targetUids;
    state.battle.animQueue.push({ type: "virtualPlay", id: `sr${deps.nextAnim()}`, uid: actor.uid, side: actor.side, targetUid: target.uid, card: replayCard, enemyLine: actor.side === "enemy", show: false, slashText: true, extraSlashReplay: true });
  }
  function queueSlashPlay(state, actor, targetUids, card = null) { if (state.battle?.animQueue && actor && targetUids?.length) state.battle.animQueue.push({ type: "virtualPlay", id: `sp${deps.nextAnim()}`, uid: actor.uid, side: actor.side, targetUids, card: card || { name: "杀", type: "slash", virtual: true, targetless: true }, enemyLine: actor.side === "enemy", show: false, slashText: true }); }
  function pendingFatalAnim(b) {
    const dead = new Set((b?.allies.concat(b.enemies) || []).filter(u => u.hp <= 0 && !window.SakuraRisaSkills?.pendingRevival?.(u)).map(u => u.uid));
    return !!dead.size && b?.animQueue?.some(e => e.type === "float" && ["damage", "hp-loss"].includes(e.kind) && dead.has(e.uid));
  }
  return { holdVisual, visualOf, pushFloat, queueSlashText, queueSlashPlay, pendingFatalAnim };
};
