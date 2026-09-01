window.BattleStatus = (() => {
  function mark(target, status) {
    if (!target) return;
    target.statuses ||= [];
    if (!target.statuses.includes(status)) target.statuses.push(status);
  }
  return { mark };
})();

window.BattleAttackAnimations = (() => {
  const root = card => card?._entitySourceCard || card;
  const singleTarget = card => window.CardUtils?.isSingleKill
    ? window.CardUtils.isSingleKill(card)
    : !(card?.sweep || card?.targetless || card?.allTargets || card?.aoeLineShown);
  const sameCard = (left, right) => left === right || root(left) === root(right);
  const reusedFlight = (card, target) => [card, root(card)].some(item =>
    item?._playedFlightDone && item._playedTargetUid === target?.uid);
  function pendingFlight(state, actor, target, card) {
    return state.battle?.animQueue?.some(event =>
      event.type === "virtualPlay" && event.uid === actor?.uid
      && (event.targetUid === target?.uid
        || event.targetUids?.includes?.(target?.uid))
      && sameCard(event.card, card));
  }
  function markInitial(card, target) {
    const cards = new Set([card, root(card)]);
    cards.forEach(item => {
      if (!item) return;
      item._attackAnimQueued = true;
      item._attackAnimDamagePending = true;
      item._playedTargetUid = target.uid;
    });
  }
  function consumeInitial(card) {
    const cards = new Set([card, root(card)]);
    const pending = [...cards].some(item => item?._attackAnimDamagePending);
    if (pending) cards.forEach(item => { if (item) delete item._attackAnimDamagePending; });
    return pending;
  }
  function ensureInitialFlight(state, actor, target, card) {
    if (!state.battle?.animQueue || !actor || !target || !card
      || !singleTarget(card) || reusedFlight(card, target)
      || card._attackAnimQueued || root(card)?._attackAnimQueued) return false;
    if (!pendingFlight(state, actor, target, card)) {
      state.battle.animQueue.push({
        type: "virtualPlay", id: window.GameRandom.id("vp"),
        trailId: card._cardResolutionId, uid: actor.uid, side: actor.side,
        targetUid: target.uid, card, enemyLine: actor.side === "enemy",
        show: !!card.virtual, slashText: !card._slashTextShown,
      });
    }
    markInitial(card, target);
    window.CharacterSkinFX?.attackTrail?.(state, actor, target);
    window.AngelicaBerserkerSkinFX?.rageTrail?.(state, actor, target);
    return true;
  }
  return {
    pendingFlight, markInitial, consumeInitial, ensureInitialFlight,
    reusedFlight, root,
  };
})();

window.BattleDamageUtils = (deps, ctx) => {
  function queueAttackAnim(state, actor, target, card) {
    if (!state.battle?.animQueue || !actor || !target || !card || !deps.isKillCard(card)) return;
    const animations = window.BattleAttackAnimations;
    const root = animations.root(card);
    if (!card._attackAnimQueued && !root?._attackAnimQueued
      && animations.pendingFlight(state, actor, target, card)) {
      animations.markInitial(card, target);
    }
    if (animations.consumeInitial(card)) return;
    const shown = card._slashTextShown;
    const reusedFlight = animations.reusedFlight(card, target);
    if (reusedFlight && !card._playedDamageSkipped) { card._playedDamageSkipped = true; return; }
    if (card._extraSlashResolution) {
      ctx.queueSlashText(state, actor, target, card);
      card._extraSlashTextQueued = true;
      return;
    }
    if (card.aoeLineShown) return;
    if (reusedFlight || card._attackAnimQueued) {
      ctx.queueSlashText(state, actor, target, card);
      card._extraSlashTextQueued = true;
      return;
    }
    card._attackAnimQueued = true;
    state.battle.animQueue.push({ type: "virtualPlay", id: `vp${deps.nextAnim()}`, trailId: card._cardResolutionId, uid: actor.uid, side: actor.side, targetUid: target.uid, card, enemyLine: actor.side === "enemy", show: !!card.virtual, slashText: !shown });
    window.CharacterSkinFX?.attackTrail?.(state, actor, target);
    window.AngelicaBerserkerSkinFX?.rageTrail?.(state, actor, target);
  }
  function directDamage(state, target, amount, source, actor, delay = 0, card = null) {
    if (!amount || state.battle?.locked || !target || target.hp <= 0) return { dodged: false, hpLoss: 0, blockLoss: 0 };
    amount = Math.max(1, Math.round(amount));
    ctx.holdVisual(target);
    const hpBefore = target.hp;
    target.hp = Math.max(0, target.hp - amount);
    state.battle.lastHitUid = target.uid;
    state.battle.hitFxId += 1;
    const damageTypes = window.BattleDamageAttributes?.resolve(card || { name: source }, source, actor) || ["physical"];
    const attackType = window.BattleDamageAttributes?.attackType?.(card || { name: source }, source, actor) || "physical";
    ctx.pushFloat(state.battle, target.uid, "damage", amount, false, delay, ctx.visualOf(target), null, { damageTypes, attackType, magicDamage: attackType === "magic" });
    const label = actor?.name && !String(source).startsWith(`${actor.name}（`) ? `${actor.name}的${source}` : source;
    window.BattleLog.add(state,`${label}对${target.name}造成${amount}点无视护甲伤害。`);
    return { dodged: false, hpLoss: amount, hpBefore, blockLoss: 0, card: card || { name: source, type: "skill", skipDamageModify: true } };
  }
  return { queueAttackAnim, directDamage };
};
