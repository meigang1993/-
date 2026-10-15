window.BattleCombatVisuals = (deps, allUnits) => {
  // 该单位是否还有**未播放**的血量浮字。
  //
  // 注意判据必须看队列，不能看"动画是否正在播放"：连击中一旦发生 render，
  // 播放就会启动，后者会把后续各段也判成"正在播放"而误伤。
  function pendingHpFloat(u) {
    const q = window.state?.battle?.animQueue;
    if (!u || !q?.length) return false;
    return q.some(e => e?.type === "float" && e.uid === u.uid
      && ["damage", "hp-loss", "heal"].includes(e.kind));
  }
  function holdVisual(u) {
    if (!u) return;
    // visualHp 是**整条动画链的起点**，语义上等于"第一段受伤前的真实血量"。
    // 链一旦开始，visualHp 必须交由各段 float 的落点（applyVisual 写回）单调
    // 推进，此处不可再覆盖。
    //
    // 曾改成"每段无条件覆盖 = 当前真实血量"，结果 3 段连击在同步结算结束时
    // visualHp 停在 8（第三段的起点），而播放首帧又把第一段落点 13 写回，
    // 血量数字 8 → 13 凭空回升 5 点，且没有任何恢复飘字——玩家反馈的"低血量
    // 受连击时血莫名增加"就是这么来的（实测序列 8,13,8,3）。
    //
    // 反过来说，若链上已无待播放浮字而 visualHp 仍有残留（动画被打断时
    // clearVisuals 不会执行），就必须用真实血量覆盖，否则数字会偏高。
    // 故判据是"是否有待播放浮字"，而非"是否为 null"。
    //
    // 死亡延迟视觉（deferredDeathVisual）期间不可覆盖，否则会打断判定动画。
    if (u.deferredDeathVisual) return;
    if (pendingHpFloat(u)) return;
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
    b.animQueue?.push({ type: "float", id: f.id, uid, kind, delay, hitFxId: f.hitFxId, visualHp: f.visualHp, visualBlock: f.visualBlock, visualDefense: f.visualDefense, label: f.label, critical: f.critical, effectCritical: f.effectCritical, damageTypes: f.damageTypes, attackType: f.attackType, magicDamage: f.magicDamage, hybridAttack: f.hybridAttack, groupHit: !!f.groupHit, commit: f.commit });
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
