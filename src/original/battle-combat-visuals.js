window.BattleCombatVisuals = (deps, allUnits) => {
  function holdVisual(u) {
    if (!u) return;
    // visualHp 是动画的过渡起点，语义上必须等于"本次受伤前的真实血量"。
    //
    // 旧实现只在 `== null` 时赋值，于是残留值（上一段的起点）会被一路沿用：
    // 连击 / 多段攻击在同步结算阶段连续调用本函数，visualHp 会停滞在第一段
    // 受伤前的旧值，单位卡显示的血量比真实血量高出"已结算的全部伤害"——实测
    // 3 段连击后显示 18 而实际只有 3。低血量时基数小，这个偏差最刺眼，正是
    // 玩家反馈的"血数字会变多"。
    //
    // 这里不能改用"动画是否正在播放"作判据：连击过程中一旦发生 render（真实
    // 对局里很常见），动画就会开播，后续各段又会被判为"正在播放"而不再刷新，
    // 偏差照旧累积。故直接取当前真实血量——每段播放后的落点由 float 事件自带
    // 的 visualHp 决定，不受此处覆盖影响。
    //
    // 死亡延迟视觉（deferredDeathVisual）期间不可覆盖，否则会打断判定动画。
    if (u.deferredDeathVisual) return;
    u.visualHp = u.hp;
    u.visualBlock = u.block || 0;
    u.visualDefense = u.defenseSystem || 0;
  }
  function visualOf(u) { return { visualHp: u.hp, visualBlock: u.block || 0, visualDefense: u.defenseSystem || 0 }; }
  function holdFloatVisual(u, kind, rawValue, finalVisual) {
    if (!u) return;
    // visualHp 的推导是 `hp + value`：只要其中任一是字符串，+ 就变成拼接，
    // 会产出 "62" + "5" = "625" 这类假血量，多段攻击下越拼越长。
    // 这里统一收敛成有限数字，杜绝字符串污染。
    const finite = (v, fallback = 0) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : fallback;
    };
    const value = finite(rawValue);
    const hp = finite(finalVisual?.visualHp ?? u.hp), block = finite(finalVisual?.visualBlock ?? u.block), defense = finite(finalVisual?.visualDefense ?? u.defenseSystem);
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
