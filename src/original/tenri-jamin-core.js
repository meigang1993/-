// 【魔王军枪炮师杰明】核心：离子导弹蓄力、三技能卡执行、火龙火箭筒存储。
// 由 tenri-jamin-skills.js 聚合；装配点显式抛错，本文件必须先于主文件加载。
window.TenriJaminCore = (() => {
  const MAX_CHARGE = 4;
  const alive = unit => !!unit && unit.hp > 0;
  const U = () => window.CardUtils;
  const isJamin = unit => unit?.ai === "tenri_jamin" || unit?.id === "tenri_jamin";
  const hasSkill = (unit, name) => (unit?.skills || []).some(skill => skill.name === name);
  const equipped = (state, unit, name) => !!window.RelicSystem?.hasEquipped?.(state, unit, name);
  const stat = (unit, key) => (unit?.stats?.[key] || 0) + (key === "attack" ? (unit?.tempAttack || 0) : key === "magic" ? (unit?.tempMagic || 0) : 0);
  const log = (state, text) => window.BattleLog?.add?.(state, text);
  const line = (state, unit, key, target) => window.BattleLines?.skill?.(state, unit, key, target);
  const foesOf = (state, unit) => unit?.side === "ally" ? (state?.battle?.enemies || []) : (state?.battle?.allies || []);
  const visibleHand = unit => (unit?.hand || []).filter(card => card && !card._pendingDraw && !card.virtual);
  const killCards = unit => visibleHand(unit).filter(card => U()?.isKillCard?.(card));
  const topHp = units => (units || []).filter(alive).sort((a, b) => b.hp - a.hp)[0] || null;
  const intentMax = unit => Math.min(99, Math.max(1, (unit?.stats?.bloodlust || 1) + (unit?.intentMaxBonus || 0)));
  const markStatus = (unit, name) => { unit.statuses ||= []; if (!unit.statuses.includes(name)) unit.statuses.push(name); };
  const unmarkStatus = (unit, name) => { if (Array.isArray(unit?.statuses)) unit.statuses = unit.statuses.filter(x => x !== name); };
  const missileCard = () => ({ name: "离子导弹", type: "skill", magicDamage: true, skipDamageModify: true, skipCriticalFx: true });
  function afterCardPlayed(state, actor, target, card) {
    if (!isJamin(actor) || !hasSkill(actor, "离子导弹")) return;
    if (!U()?.isKillCard?.(card) || card?._jaminMissile) return;
    const cur = Number(actor.jaminCharge) || 0;
    if (cur >= MAX_CHARGE) return;
    actor.jaminCharge = cur + 1;
    line(state, actor, "离子导弹蓄力");
    log(state, `${actor.name} 获得1点蓄力点（离子导弹 ${actor.jaminCharge}/${MAX_CHARGE}）。`);
  }
  function usePotential(state, actor, api) {
    const turn = state.battle?.turn;
    if (actor.usedPotentialTurn === turn) return true;
    const count = killCards(actor).length;
    if (!count) { log(state, `${actor.name} 发动潜能爆发失败：手中没有【杀】牌。`); return true; }
    actor.usedPotentialTurn = turn;
    line(state, actor, "潜能爆发");
    log(state, `${actor.name} 发动潜能爆发，摸${count}张牌并重置淫气。`);
    api?.deps?.draw?.(actor, count, state.battle);
    actor.intent = intentMax(actor);
    log(state, `${actor.name} 的淫气重置为${actor.intent}/${intentMax(actor)}。`);
    return true;
  }
  function useMissile(state, actor, api) {
    if ((Number(actor.jaminCharge) || 0) < MAX_CHARGE) return true;
    actor.jaminCharge = 0;
    line(state, actor, "离子导弹");
    log(state, `${actor.name} 发动离子导弹：坐标已锁定，托马斯发射离子导弹，歼灭敌军！`);
    const amount = stat(actor, "attack");
    const targets = foesOf(state, actor).filter(alive);
    targets.forEach(unit => {
      api?.damage?.directDamage?.(state, unit, amount, "离子导弹", actor, 0, missileCard());
      window.EnemySkills?.addShock?.(state, unit, 1, actor);
    });
    log(state, `离子导弹对${targets.length}名敌方角色各造成${amount}点雷属性伤害，并各施加1枚感电标记。`);
    return true;
  }
  function useSatellite(state, actor, target) {
    if (actor.usedSatellite) return true;
    const victim = alive(target) && target.side !== actor.side ? target : topHp(foesOf(state, actor));
    if (!victim) return true;
    actor.usedSatellite = true;
    victim.jaminRay = { sourceUid: actor.uid, attack: stat(actor, "attack") };
    markStatus(victim, "射线");
    line(state, actor, "卫星射线", victim);
    log(state, `${actor.name} 发动卫星射线，指定${victim.name}施加“射线”标记（每回合受到${victim.jaminRay.attack}点雷属性伤害）。`);
    return true;
  }
  function useSkillCard(state, actor, target, card, api = {}) {
    if (card.jaminPotential) return usePotential(state, actor, api);
    if (card.jaminMissile) return useMissile(state, actor, api);
    if (card.jaminSatellite) return useSatellite(state, actor, target);
    return false;
  }
  function storeRocket(state, unit, cards) {
    cards.forEach(card => { const i = unit.hand.indexOf(card); if (i >= 0) unit.hand.splice(i, 1); });
    window.BattleCharacterCardStorage?.store?.(state, unit, cards,
      { source: "火龙火箭筒", ownerUid: unit.uid, release: "manual" });
    log(state, `${unit.name} 发动火龙火箭筒，将${cards.length}张【杀】置于自己的角色牌上（存储牌）。`);
    window.BattleCards?.syncStatusCards?.(unit);
  }
  function endTurn(state, unit) {
    if (!equipped(state, unit, "火龙火箭筒") || unit.hp <= 0) return;
    const cards = killCards(unit);
    if (!cards.length) return;
    if (unit.side !== "ally") { if (cards.length >= 3) storeRocket(state, unit, cards); return; }
    window.BattleCounterTriggers?.open?.(state,
      { skill: "火龙火箭筒", unitUid: unit.uid, sourceUid: unit.uid });
  }
  function resolveRocket(state, unit) {
    const cards = killCards(unit);
    if (cards.length) storeRocket(state, unit, cards);
  }
  return { MAX_CHARGE, afterCardPlayed, useSkillCard, endTurn, resolveRocket,
    isJamin, killCards, stat, foesOf, alive, topHp, log, markStatus, unmarkStatus };
})();
