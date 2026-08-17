window.BattleEffectEventRunner = handlers => {
  const { wait } = window.BattleEffectUtils;
  const FLOAT_DAMAGE_WAIT_MS = 150;
  const FLOAT_FAST_WAIT_MS = 80;
  const FLOAT_SETTLE_MS = 16;

  function fatalHit(state, event) {
    if (event?.kind !== "damage") return false;
    const unit = state.battle?.allies?.concat(state.battle?.enemies || [])
      .find(item => item.uid === event.uid);
    return (event.visualHp ?? unit?.hp ?? 1) <= 0
      && !window.SakuraRisaSkills?.pendingRevival?.(unit);
  }

  function queueFollowingHitEffects(state, event) {
    let delay = window.BattleDamageFX?.sequenceDuration?.(event)
      || FLOAT_DAMAGE_WAIT_MS;
    let lastHitFxId = event.hitFxId;
    for (const next of state.battle?.animQueue || []) {
      if (next.type === "slashText") continue;
      if (next.type !== "float") break;
      const nextHit = /^(damage|armor|armor-break|defense|defense-break)$/
        .test(next.kind || "") && BattleFX.hasDamageEffect(next);
      if (!nextHit || next.hitFxId === lastHitFxId) continue;
      next.damageFxPrequeued = true;
      BattleFX.queueSlashHit(state, next, delay);
      delay += window.BattleDamageFX?.sequenceDuration?.(next)
        || FLOAT_DAMAGE_WAIT_MS;
      lastHitFxId = next.hitFxId;
    }
  }

  async function floatEvent(state, event, renderStep, active) {
    if (event.delay) {
      await wait(event.delay);
      if (!active()) return;
    }
    const hit = /^(damage|armor|armor-break|defense|defense-break)$/
      .test(event.kind || "") && BattleFX.hasDamageEffect(event);
    const deathHit = hit && fatalHit(state, event);
    let fatal = false;
    if (hit) {
      BattleFX.slashHit(state, event);
      if (!event.damageFxPrequeued) queueFollowingHitEffects(state, event);
      await wait(window.BattleDamageFX?.leadTime?.(event) || 70);
      if (!active()) return;
      if (!deathHit) fatal = handlers.applyVisual(state, event, renderStep);
    }
    BattleFX.popFloats(state, event.id, true);
    const settle = hit
      ? Math.max(0, FLOAT_DAMAGE_WAIT_MS - 70)
      : event.kind === "damage" || event.kind === "hp-loss"
        ? FLOAT_DAMAGE_WAIT_MS : FLOAT_FAST_WAIT_MS;
    await wait(settle);
    if (!active()) return;
    if (!hit || deathHit) fatal = handlers.applyVisual(state, event, renderStep);
    await wait(fatal ? handlers.DEATH_ANIM_MS : FLOAT_SETTLE_MS);
  }

  async function initialDrawGroup(event, renderStep, active) {
    let failure = null;
    await Promise.all((event.batches || []).map(async batch => {
      try {
        await handlers.finishDraw(batch, renderStep, active);
      } catch (err) {
        if (!failure) failure = err;
      }
    }));
    if (failure) throw failure;
  }

  async function runEvent(state, event, renderStep, renderThrottled, active) {
    if (event.type === "initialDrawGroup") {
      await initialDrawGroup(event, renderThrottled, active);
    } else if (event.type === "drawBatch") {
      await handlers.finishDraw(event, renderThrottled, active);
    } else if (event.type === "giveCards") {
      await handlers.giveCards(event, renderThrottled, active);
    } else if (event.type === "stealCard") {
      await handlers.stealCard(event, renderThrottled, active);
    } else if (event.type === "gainCards") {
      await handlers.gainCards(event, renderThrottled, active);
    } else if (event.type === "discardBatch") {
      await handlers.discardBatch(event, renderThrottled, active);
    } else if (event.type === "sealCards") {
      await handlers.sealCards(event, renderThrottled, active);
    } else if (event.type === "burnCard") {
      await handlers.burnCard(state, event, renderThrottled, active);
    } else if (event.type === "trailExit") {
      await handlers.trailExit(event, renderThrottled, active);
    } else if (event.type === "enemyPlay") {
      await handlers.enemyPlay(state, event,
        (card, current) =>
          window.BattleSystem.revealPlayed(state.battle, card, current),
        renderStep, active);
    } else if (event.type === "virtualPlay") {
      await handlers.virtualPlay(state, event, renderStep, active);
    } else if (event.type === "clash") {
      await handlers.clash(state, event, renderStep, active);
    } else if (event.type === "judgement") {
      await handlers.judgement(state, event, renderStep, active);
    } else if (event.type === "revealCards") {
      await handlers.revealCards(state, event, renderStep, active);
    } else if (event.type === "response") {
      await handlers.response(state, event, renderThrottled, active);
    } else if (event.type === "slashText" && active()) {
      await handlers.slashText(event, state, renderStep, active);
    } else if (event.type === "float") {
      await floatEvent(state, event, renderStep, active);
    } else if (event.type === "battleCourage" && active()) {
      const owner = state.battle?.allies.concat(state.battle.enemies || [])
        .find(unit => unit.uid === event.uid);
      window.CharacterSkinFX?.battleCourageStart?.(state, owner);
      const result = window.BattleSystem.triggerBattleCourage(state, event);
      window.CharacterSkinFX?.battleCourageResult?.(
        state, result?.owner, result?.restored);
      renderStep();
      await wait(220);
    }
  }

  return { runEvent };
};
