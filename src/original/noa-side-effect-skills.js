// 怪面诺亚【改造副作用】（锁定技）
//   1. 结束阶段，对我方其他所有存活男性角色各造成等同于攻击力的伤害
//   2. 队伍里每有一名存活男性角色，手牌上限 +1
//   3. 没有存活男性角色时，出牌阶段开始随机对一名角色（不分敌我）
//      视为使用一张虚拟【咬杀】，之后跳过本回合出牌阶段
window.NoaSideEffectSkills = (() => {
  const alive = unit => !!unit && unit.hp > 0;
  const isNoa = unit => alive(unit) && unit.ref === "noa";
  const hasSkill = (unit, name) => (unit?.skills || []).some(skill => skill?.name === name);
  const malesOf = battle => (battle?.allies || []).filter(unit => alive(unit) && unit.gender === "male");

  // 基础手牌上限取角色模板（4），不写回 unit.stats，避免加成随回合反复累加。
  function baseHandLimit(unit) {
    const tpl = (window.GameData?.characters || []).find(c => c?.id === (unit?.ref || unit?.id));
    return Math.max(0, tpl?.stats?.handLimit ?? 4);
  }

  // ui-common / battle-runtime-helpers / battle-ai-helpers 均消费此结果（非诺亚返回 null）。
  function handLimit(unit) {
    if (!isNoa(unit) || !hasSkill(unit, "改造副作用")) return null;
    const b = window.state?.battle;
    return baseHandLimit(unit) + (b ? malesOf(b).length : 0);
  }

  function endTurn(state, unit, api) {
    const b = state?.battle;
    if (!b || !isNoa(unit) || !hasSkill(unit, "改造副作用")) return true;
    const males = malesOf(b).filter(target => target.uid !== unit.uid);
    if (!males.length) return true;
    // 攻击力不能为负：tempAttack 可能被减益压成负数，直接传给 damage 管线
    // 会经 Math.max(0, target.hp - hpLoss) 变成回血，故在此夹到 0。
    const amount = Math.max(0, (unit.stats?.attack || 0) + (unit.tempAttack || 0));
    window.BattleLines?.skill?.(state, unit, "改造副作用");
    window.BattleLog?.add?.(state,
      `${unit.name}的改造副作用发作，对我方其他存活男性角色各造成${amount}点伤害。`);
    const damage = api?.damage;
    if (typeof damage !== "function") return true;
    males.forEach(target => {
      if (!alive(target)) return;
      damage(state, target, amount, "改造副作用", unit,
        { name: "改造副作用", type: "skill", ignoreResponse: true, skipDamageModify: true });
    });
    return true;
  }

  // 由 battle-turn-start.js 的 continueStartPhase 在摸牌之后、跳过出牌阶段判定之前调用。
  // 每回合只发动一次（_noaFrenzyTurn 以回合号隔离，避免多条准备阶段路径重复触发）。
  function beginPlayPhase(state, unit) {
    const b = state?.battle;
    if (!b || !isNoa(unit) || !hasSkill(unit, "改造副作用")) return false;
    if (unit._noaFrenzyTurn === b.turn) return !!unit.skipPlayPhase;
    unit._noaFrenzyTurn = b.turn;
    if (malesOf(b).length) return false;
    const pool = (b.allies || []).concat(b.enemies || [])
      .filter(u => alive(u) && u.uid !== unit.uid);
    const target = window.GameRandom?.sample?.(pool, state) || pool[0];
    if (!target) return false;
    const virtual = window.CardUtils?.fromEntity?.("咬杀", {
      temporary: true, void: true, noIntentCost: true,
      generatedBySkill: "改造副作用", ignoreResponse: true,
    });
    window.BattleLog?.add?.(state,
      `${unit.name}的改造副作用发作：队伍中没有存活的男性角色，随机对${target.name}`
      + "视为使用一张虚拟【咬杀】，并跳过本回合出牌阶段。");
    if (virtual) window.BattleSystem?.useVirtualKill?.(state, unit, target, virtual);
    unit.skipPlayPhase = true;
    unit.skipPlayReason = "改造副作用";
    return true;
  }

  return { handLimit, endTurn, beginPlayPhase };
})();
