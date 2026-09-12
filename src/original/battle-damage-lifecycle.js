window.BattleDamageLifecycle = ({
  ctx, utils, getTriggers, getResolveDamage,
}) => {
  const pendingAfterDamage = [];
  let flushingAfterDamage = false;
  function scheduleAfterDamage(fn) {
    if (typeof fn === "function") pendingAfterDamage.push(fn);
  }
  function flushAfterDamage(state) {
    if (flushingAfterDamage) return;
    flushingAfterDamage = true;
    try {
      let guard = 0;
      while (pendingAfterDamage.length && guard < 512) {
        guard += 1;
        pendingAfterDamage.shift()(state);
      }
    } finally {
      flushingAfterDamage = false;
    }
  }
  function directDamage(
    state, target, amount, source, actor, delay = 0, card = null
  ) {
    if (delay && typeof delay === "object") { card = delay; delay = 0; }
    if (state.battle?.locked) return { dodged: false, hpLoss: 0 };
    const rootDamage = !state.battle._damageDepth;
    state.battle._damageDepth = (state.battle._damageDepth || 0) + 1;
    try {
      const effectiveActor =
        window.NonokaLokiSkills?.sourceActor?.(state.battle, actor) || actor;
      const effectiveSource =
        window.NonokaLokiSkills?.sourceLabel?.(state.battle, actor, source)
        || source;
      const result = utils.directDamage(
        state, target, amount, effectiveSource, effectiveActor, delay, card);
      if (result?.hpLoss) {
        window.SakuraRisaSkills?.preventDeath?.(state, target);
        window.BattleStats?.damage?.(
          state.battle, effectiveActor, target,
          Math.min(result.hpBefore, result.hpLoss), result.hpBefore);
      }
      const effectiveCard = result?.card || card
        || { name: source, type: "skill", skipDamageModify: true };
      if (result?.hpLoss && !effectiveCard.noAfterDamageTriggers) {
        getTriggers().afterDamage(
          state, effectiveActor, target, effectiveCard, result.hpLoss, 0, actor);
      } else if (result?.hpLoss) {
        window.BondiSkills?.afterDamage?.(
          state, effectiveActor, target, effectiveCard, result.hpLoss);
      }
      markDefeated(state, target);
      ctx.checkDefeat(state);
      return result;
    } finally {
      state.battle._damageDepth -= 1;
      if (rootDamage) finalizeDamage(state);
    }
  }

  function damage(state, target, amount, source, actor, card) {
    if (state.battle?.locked) return { dodged: false, hpLoss: 0 };
    const rootDamage = !state.battle._damageDepth;
    state.battle._damageDepth = (state.battle._damageDepth || 0) + 1;
    try {
      return getResolveDamage()(state, target, amount, source, actor, card);
    } finally {
      state.battle._damageDepth -= 1;
      if (rootDamage) finalizeDamage(state);
    }
  }

  function finalizeDamage(state) {
    window.EdisSkills?.flushCopies?.(state);
    window.BattleCounterTriggers?.activatePending?.(state.battle);
    flushAfterDamage(state);
    window.BattleReactionQueue?.flush?.(state, damage);
  }

  function markDefeated(state, target) {
    if (!target || target.side !== "enemy" || target.hp > 0
      || window.SakuraRisaSkills?.pendingRevival?.(target) || !target.id) return;
    const ids = state.battle.defeatedEnemyIds ||= [];
    if (!ids.includes(target.id)) ids.push(target.id);
  }

  return { damage, directDamage, finalizeDamage, markDefeated, scheduleAfterDamage, flushAfterDamage };
};
