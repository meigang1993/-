window.BattleReactionQueue = (() => {
  const LIMIT = 160;
  const current = state => !window.state || window.state === state;
  const units = battle => (battle?.allies || []).concat(battle?.enemies || []);

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

  function captureHitContinuation(battle, actor, target, amount, source, card, remainingHits, group = null) {
    if (!battle || !actor || !target) return false;
    const groupCard = group?.card ? {
      ...group.card,
      targetUids: [...(group.targetUids || group.card.targetUids || [])],
      nextTargetIndex: group.nextTargetIndex,
    } : null;
    const prompt = battle.manualDodge || battle.opheliaGuard;
    if (prompt) {
      prompt.remainingHits = Math.max(0, remainingHits || 0);
      if (groupCard) prompt.groupCard = groupCard;
      return true;
    }
    if (!battle.locked) return false;
    const settling = battle.pendingVictory || battle.pendingDefeat || battle.victoryScreen
      || battle.defeat || battle.testComplete;
    if (settling) return true;
    const base = {
      actorUid: actor.uid,
      targetUid: target.uid,
      amount,
      source,
      card: { ...card },
      remainingHits: Math.max(0, remainingHits || 0),
    };
    if (groupCard) base.groupCard = groupCard;
    if (base.remainingHits > 0) battle.manualDodgeResume = base;
    else if (group?.targetUids?.length && group.nextTargetIndex < group.targetUids.length) {
      battle.demonInvasionResume = {
        ...base,
        card: { ...group.card },
        targetUids: [...group.targetUids],
        nextTargetIndex: group.nextTargetIndex,
      };
    }
    return true;
  }

  function activateShare(state) {
    const battle = state?.battle;
    if (!battle || battle.kaiichiShare || !battle.kaiichiShareQueue?.length || battle.locked) return false;
    return !!window.HoshinoSkills?.activateShare?.(state);
  }

  function run(state, action, damage) {
    const battle = state.battle, roster = units(battle);
    if (action.kind === "damage" || action.kind === "directDamage" || action.kind === "resolvedHit") {
      const actor = roster.find(unit => unit.uid === action.actorUid);
      const target = roster.find(unit => unit.uid === action.targetUid && unit.hp > 0);
      if (actor && target) {
        if (action.skillName) window.BattleLines?.skill?.(state, actor, action.skillName, target);
        if (action.logText) window.BattleLog?.add?.(state, action.logText);
        const card = action.prepareGroupKill
          ? (window.EnemySkills?.prepareGroupKillTarget?.(state, actor, target, action.card) || action.card)
          : action.card;
        const hit = action.kind === "resolvedHit" && damage.hitWithoutDodge
          ? damage.hitWithoutDodge
          : action.kind === "directDamage" && damage.directDamage
            ? damage.directDamage
            : damage;
        const result = action.kind === "resolvedHit"
          ? hit(state, actor, target, action.amount, action.source, card)
          : action.kind === "directDamage"
            ? hit(state, target, action.amount, action.source, actor, action.delay || 0, card)
            : hit(state, target, action.amount, action.source, actor, card);
        if (result?.dodged && action.edisGroupHealCard?._edisDarkBlocked) action.edisGroupHealCard._edisDarkBlocked.add(target.uid);
      }
      return;
    }
    if (window.EnemySkills?.resolveReactionAction?.(state, action, damage)) return;
    if (window.AngelicaLukaSkills?.resolveReactionAction?.(state, action, damage)) return;
    if (action.kind === "nanaliRevenge") {
      window.ElranaAceNanaliSkills?.resolveRevenge?.(state, action, damage);
      return;
    }
    if (action.kind === "kaiichiBloodHeal") {
      window.HoshinoSkills?.resolveBloodHeal?.(state, action, {
        damage,
        draw: window.BattleSystem?.draw,
        pushFloat: window.BattleSystem?.pushFloat,
      });
    }
  }

  function flush(state, damage) {
    const battle = state?.battle;
    if (!battle || !current(state) || battle._reactionFlushing) return !pending(battle);
    if (activateShare(state) || battle.locked) return false;
    battle._reactionFlushing = true;
    let count = 0;
    try {
      while (current(state) && state.battle === battle && battle.reactionQueue?.length && !battle.locked) {
        if (activateShare(state)) return false;
        if (++count > LIMIT) {
          battle.reactionQueue = [];
          window.BattleLog?.add?.(state, "连续反应达到安全上限，已停止后续反应。");
          break;
        }
        const action = battle.reactionQueue.shift(), nested = [];
        battle._reactionNested = nested;
        try { run(state, action, damage); }
        finally { delete battle._reactionNested; }
        if (nested.length) battle.reactionQueue.unshift(...nested);
        if (activateShare(state)) return false;
      }
    } finally {
      delete battle._reactionNested;
      delete battle._reactionFlushing;
      if (!battle.reactionQueue?.length) battle.reactionQueue = null;
    }
    return !pending(battle) && !battle.locked;
  }

  function pending(battle) {
    return !!(battle?.reactionQueue?.length || battle?.kaiichiShare || battle?.kaiichiShareQueue?.length);
  }

  return { enqueue, prepend, damageAction, directDamageAction, resolvedHitAction, captureHitContinuation, flush, pending };
})();
