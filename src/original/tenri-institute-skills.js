// 天日国鹰7研究所 · 怪物技能聚合器
// 四个被动技能各占一个文件，这里只做统一转发；惰性取值避免依赖 bundle 加载顺序。
// 接入点（每个既有文件仅 1~2 行）：
//   battle-combat.js useCard            → beforeCardPlayed / redirectTarget
//   enemy-kill-hooks.js                 → beforeKillTargeted
//   battle-combat-attack-values.js      → modifyAttackAmount
//   battle-damage-hit.js                → modifyIncomingDamage
//   sakura-risa-skills.js               → preventDeath / pendingRevival
//   battle-turn-start.js                → beginTurn
window.TenriInstituteSkills = (() => {
  const assault = () => window.TenriAssaultSkills;
  const guard = () => window.TenriGuardSkills;
  const railgun = () => window.TenriRailgunSkills;
  const ghoul = () => window.TenriGhoulRevival;

  function beforeCardPlayed(state, actor, card) {
    railgun()?.beforeCardPlayed?.(state, actor, card);
  }
  function beforeKillTargeted(state, actor, target, card) {
    assault()?.beforeKillTargeted?.(state, actor, target, card);
  }
  function redirectTarget(state, actor, target, card) {
    return guard()?.redirectTarget?.(state, actor, target, card) || null;
  }
  function modifyAttackAmount(state, actor, target, card, amount) {
    return assault()?.modifyAttackAmount?.(state, actor, target, card, amount) ?? amount;
  }
  function modifyIncomingDamage(state, actor, target, amount, card) {
    return railgun()?.modifyIncomingDamage?.(state, actor, target, amount, card) ?? amount;
  }
  const preventDeath = (state, unit) => !!ghoul()?.preventDeath?.(state, unit);
  const pendingRevival = unit => !!ghoul()?.pendingRevival?.(unit);
  const beginTurn = (state, unit) => !!ghoul()?.beginTurn?.(state, unit);

  return {
    beforeCardPlayed, beforeKillTargeted, redirectTarget,
    modifyAttackAmount, modifyIncomingDamage,
    preventDeath, pendingRevival, beginTurn,
  };
})();
