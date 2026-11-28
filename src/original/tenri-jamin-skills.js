// 【魔王军枪炮师杰明】聚合层：AI 决策 + 蓄力技 UI 徽章。
// 子模块必须先装配；缺文件时显式抛错，禁止静默兜底。
if (!window.TenriJaminCore || !window.TenriJaminCombat)
  throw new Error("[tenri-jamin-skills] 子模块未装配：tenri-jamin-core.js / tenri-jamin-combat.js 必须先加载");
window.TenriJaminSkills = (() => {
  const C = window.TenriJaminCore, B = window.TenriJaminCombat;
  const { MAX_CHARGE, isJamin, killCards, alive, topHp } = C;
  const U = () => window.CardUtils;
  function aiMove(state, actor, team, foes, rawHand, canPlay, ctx) {
    if (!isJamin(actor) || !ctx) return null;
    const hand = (rawHand || []).filter(card => card && !card._pendingDraw && canPlay(actor, card));
    const enemies = (foes || []).filter(alive);
    if (!actor.usedSatellite && enemies.length)
      return { card: { name: "卫星射线", _skill: true, jaminSatellite: true }, target: topHp(enemies) };
    if ((Number(actor.jaminCharge) || 0) >= MAX_CHARGE)
      return { card: { name: "离子导弹", _skill: true, jaminMissile: true, targetless: true, _jaminMissile: true }, target: actor };
    const kills = hand.filter(card => U()?.isKillCard?.(card));
    if ((actor.intent || 0) <= 0 && kills.length && actor.usedPotentialTurn !== state.battle?.turn)
      return { card: { name: "潜能爆发", _skill: true, jaminPotential: true, targetless: true }, target: actor };
    const charge = hand.find(card => card.charge && !card.virtual && !card._skill);
    if (!actor.charge && charge) return { card: charge, target: actor };
    if (kills.length && enemies.length) {
      const target = ctx.slashTarget?.(actor, foes, kills) || topHp(enemies);
      const card = window.BattleAIHelpers?.topBy?.(kills,
        item => ctx.slashScore?.(actor, item, target) || 0);
      if (card && target) return { card, target };
    }
    return null;
  }
  // 蓄力技 UI 走独立模块 tenri-jamin-charge-icon.js（勾玉造型 + 计数 + 置灰/点亮）。
  const chargeBadge = (unit, U) => window.TenriJaminChargeIcon?.badge?.(unit, U) || "";
  return { MAX_CHARGE, isJamin, killCards, aiMove, chargeBadge,
    afterCardPlayed: C.afterCardPlayed, useSkillCard: C.useSkillCard,
    endTurn: C.endTurn, resolveRocket: C.resolveRocket,
    prepare: B.prepare, transferRay: B.transferRay, afterDamage: B.afterDamage,
    useTaunt: B.useTaunt, useSupport: B.useSupport };
})();
