window.BattleReactionQueueStore = (() => {
  const current = state => !window.state || window.state === state;

  function enqueue(state, actions) {
    const battle = state?.battle, list = (Array.isArray(actions) ? actions : [actions]).filter(Boolean);
    if (!battle || !list.length) return false;
    if (battle._reactionNested) battle._reactionNested.push(...list);
    else (battle.reactionQueue ||= []).push(...list);
    return true;
  }

  function prepend(state, actions) {
    const battle = state?.battle, list = (Array.isArray(actions) ? actions : [actions]).filter(Boolean);
    if (!battle || !list.length) return false;
    if (battle._reactionNested) battle._reactionNested.unshift(...list);
    else (battle.reactionQueue ||= []).unshift(...list);
    return true;
  }

  function damageAction(actor, target, amount, source, card) {
    return { kind: "damage", actorUid: actor?.uid, targetUid: target?.uid, amount, source, card };
  }

  function directDamageAction(actor, target, amount, source, card, delay = 0) {
    return { kind: "directDamage", actorUid: actor?.uid, targetUid: target?.uid, amount, source, card, delay };
  }

  function resolvedHitAction(actor, target, amount, source, card) {
    return { kind: "resolvedHit", actorUid: actor?.uid, targetUid: target?.uid, amount, source, card };
  }

  function pending(battle) {
    return !!(battle?.reactionQueue?.length || battle?.kaiichiShare || battle?.kaiichiShareQueue?.length);
  }
  return { current, enqueue, prepend, damageAction, directDamageAction, resolvedHitAction, pending };
})();
