window.BattleDamageResponses = ({ deps, ctx, canDodge, damage, hitWithoutDodge, finalizeDamage, triggers }) => {
  function shouldManualDodge(state, actor, target, card, response) {
    if (!state.settings?.manualResponse && !response?.deflect) return false;
    if (card?.forceAutoResponse) return false;
    if (actor?.side !== "enemy" || target?.side !== "ally" || (!deps.isKillCard(card) && !card?.responseKind)) return false;
    if (card?.angelicaTauntSlash) return false;
    if (!card?.responseKind && (card?.sweep || card?.allTargets || card?.aoeLineShown)) return false;
    return !(card?.krowFemaleTarget || card?.twoDodgesRequired) || countDodges(target, card, 2) >= 2;
  }
  function countDodges(target, card, limit = Infinity) {
    let n = 0;
    for (const c of target?.hand || []) if (canDodge(card, c) && ++n >= limit) return n;
    return n;
  }
  function queueManualDodge(state, actor, target, amount, source, card, selectedIndex = 0, deflectRequired = false) {
    const b = state.battle;
    b.manualDodge = { actorUid: actor.uid, targetUid: target.uid, amount, source, card: { ...card }, selectedIndex, deflectRequired };
    b.locked = true; b.selectedCardIndex = null; b.selectedCostCardIndex = null; b.selectedSkillCard = null; b.pendingTargetUid = target.uid;
    window.BattleLog.add(state, `${target.name} 可以手动选择是否${responseAction(card)}${responseLabel(card)}。`);
  }
  function resolveManualDodge(state, useDodge, index = 0, deflectChoice = null) {
    const b = state.battle, p = b?.manualDodge;
    if (!p || p.deflectResult) return false;
    if (!useDodge && (p.deflectStarted || p.deflectRequired)) return false;
    const actor = ctx.allUnits(b).find(u => u.uid === p.actorUid), target = ctx.allUnits(b).find(u => u.uid === p.targetUid);
    if (!actor || !target) { clearManual(b); return false; }
    if (useDodge) {
      const picked = pickManualDodges(target, p.card, p.deflectStarted ? p.deflectIndex : index);
      if (picked.length) {
        if (picked[0]?.deflect) {
          let reveal = null;
          window.WithererSkills?.deflect?.(state, target, actor, p.amount, p.source, p.card, damage, deflectChoice, { defer: true, onReveal: result => { reveal = result; } });
          if (!reveal) return false;
          if (!p.deflectStarted) p.deflectIndex = index;
          p.deflectStarted = true;
          p.deflectResult = reveal;
          return true;
        }
        playDodgeCards(state, target, actor, picked, actor.uid);
        window.BattleLog.add(state, `${target.name} 手动${responseAction(p.card)}${dodgeLabel(target, picked)}，抵消一次${responseLabel(p.card)}伤害。`);
        const hammer = queueThunderHammer(state, actor, target, p.amount, p.source, p.card); clearManual(b, hammer);
        if (hammer) { triggers.afterDodged(state, actor, target, p.card); b.thunderHammer.afterDodgedFired = true; queueManualResume(b, p); }
        else { triggers.afterDodged(state, actor, target, p.card); queueManualResume(b, p); }
        ctx.checkEnd(state); return true;
      }
    }
    window.BattleLog.add(state, `${target.name} 没有${responseAction(p.card)}${responseLabel(p.card)}。`); clearManual(b);
    const rootDamage = !b._damageDepth; b._damageDepth = (b._damageDepth || 0) + 1;
    try { hitWithoutDodge(state, actor, target, p.amount, p.source, p.card); queueManualResume(b, p); }
    finally { b._damageDepth -= 1; if (rootDamage) finalizeDamage(state); }
    ctx.checkEnd(state); return true;
  }
  function confirmDeflectResult(state) {
    const b = state.battle, p = b?.manualDodge, result = p?.deflectResult;
    if (!p || !result) return false;
    if (result.outcome === "tie") { p.deflectResult = null; return true; }
    const actor = ctx.allUnits(b).find(u => u.uid === p.actorUid), target = ctx.allUnits(b).find(u => u.uid === p.targetUid);
    if (!actor || !target) { clearManual(b); return false; }
    const picked = pickManualDodges(target, p.card, p.deflectIndex);
    if (!picked.length) { clearManual(b); return false; }
    playDodgeCards(state, target, actor, picked, actor.uid);
    if (result.outcome === "defender") {
      clearManual(b);
      damage(state, actor, p.amount, "弹反", target, { ...p.card, name: "弹反", type: "skill", ignoreResponse: true, skipDamageModify: true });
      triggers.afterDodged(state, actor, target, p.card); queueManualResume(b, p); ctx.checkEnd(state); return true;
    }
    clearManual(b);
    const rootDamage = !b._damageDepth; b._damageDepth = (b._damageDepth || 0) + 1;
    try { hitWithoutDodge(state, actor, target, p.amount, p.source, p.card); queueManualResume(b, p); }
    finally { b._damageDepth -= 1; if (rootDamage) finalizeDamage(state); }
    ctx.checkEnd(state); return true;
  }
  function queueManualResume(b, p) {
    const groupCard = p.groupCard || p.card;
    if (p.remainingHits > 0) b.manualDodgeResume = { ...p };
    else if (groupCard?.targetUids?.length && groupCard.nextTargetIndex != null) b.demonInvasionResume = { ...p, card: groupCard, targetUids: groupCard.targetUids, nextTargetIndex: groupCard.nextTargetIndex };
  }
  function pickManualDodges(target, card, index) {
    const dodges = (target.hand || []).filter(c => canDodge(card, c));
    const picked = dodges[Math.max(0, Math.min(index || 0, dodges.length - 1))];
    if (!picked) return [];
    if (!(card?.krowFemaleTarget || card?.twoDodgesRequired)) return [picked];
    const second = dodges.find(c => c !== picked);
    return second ? [picked, second] : [];
  }
  function clearManual(b, keepLocked = false) { b.manualDodge = null; b.pendingTargetUid = null; const settling = b.pendingVictory || b.pendingDefeat || b.victoryScreen || b.defeat || b.testComplete; if (!keepLocked && !settling) b.locked = false; }
  function responseView(unit, card, name) {
    const witherer = window.WithererSkills?.responseCard?.(unit, card, name) || card;
    return window.GuardKellySkills?.responseCard?.(unit, witherer, name) || witherer;
  }
  function playDodgeCards(state, target, actor, cards, reverseUid = null) {
    const cut = !cards.some(c => c?.type === "slash") && ctx.hasSkill(actor, "剪切邪斩"), sources = cards.filter(Boolean);
    const played = sources.map(card => responseView(target, card, "闪")), converted = played.find(card => card?.convertedFrom);
    const pile = cut || sources.some(c => c?.void || c?.copiedByEdis)
      ? "consumed" : "discard";
    const visibleNow = window.BattleCards.visibleHandCount(target);
    const visualHandBefore = Math.max(visibleNow,
      ...sources.map(card => Number(card?._visualHandBefore) || 0));
    const removable = sources.filter(source =>
      target.hand.includes(source) && !source._pendingDraw
      && (window.GuestCharacterSkills?.countsForLimit?.(target, source)
        ?? true)).length;
    const visualHandCount = Math.max(0, visibleNow - removable);
    window.BattleCards?.queueResponse?.(state.battle, target,
      { type: "response", id: `rs${deps.nextAnim()}`, uid: target.uid, side: target.side, card: played.length > 1 ? { ...(converted || played[0]), name: "闪×2" } : played[0], pile, reverseUid },
      visualHandBefore, visualHandCount);
    sources.forEach((source, i) => { if (target.hand.includes(source)) { target.hand.splice(target.hand.indexOf(source), 1); window.BattleCards?.put(state.battle, target, source, cut ? "consumed" : "discard", { skipAnim: true }); window.NonokaLokiSkills?.afterCardResponded?.(state, target, actor, played[i], deps); } });
  }
  function dodgeLabel(unit, cards) { const shown = cards.map(card => responseView(unit, card, "闪")); return shown.length > 1 ? "两张闪" : `${shown[0].suit || ""}${shown[0].name}`; }
  const responseLabel = card => card?.responseKind === "slash" ? "杀" : "闪";
  const responseAction = card => card?.responseKind === "slash" ? "打出" : "使用";
  function autoDodge(state, actor, target, amount, source, card, response) {
    const needTwo = (card?.krowFemaleTarget || card?.twoDodgesRequired);
    let second = needTwo && target.hand.find(c => c !== response && canDodge(card, c));
    if (needTwo && !second) second = window.FloraCarlosSkills?.dodgeAsFlash?.(state, target, actor, card, { ...deps, afterCardResponded: window.NonokaLokiSkills?.afterCardResponded }, [response], c => canDodge(card, c));
    if (needTwo && !second) { window.BattleLog.add(state,`${target.name} 需要两张闪才能抵消本次杀。`); return false; }
    playDodgeCards(state, target, actor, [response, second].filter(Boolean));
    if (response.deflect) {
      if (window.WithererSkills?.deflect?.(state, target, actor, amount, source, card, damage)) { triggers.afterDodged(state, actor, target, card); return true; }
      return false;
    }
    window.BattleLog.add(state,`${target.name} 自动${responseAction(card)}${second ? "两张闪" : responseView(target, response, "闪").name}，抵消一次${responseLabel(card)}伤害。`);
    if (queueThunderHammer(state, actor, target, amount, source, card)) { triggers.afterDodged(state, actor, target, card); state.battle.thunderHammer.afterDodgedFired = true; return true; }
    triggers.afterDodged(state, actor, target, card); return true;
  }
  function queueThunderHammer(state, actor, target, amount, source, card) {
    const b = state.battle, settling = b?.pendingVictory || b?.pendingDefeat || b?.victoryScreen || b?.defeat || b?.testComplete;
    if (!b || actor?.hp <= 0 || target?.hp <= 0 || settling) return false;
    const hand = actor.hand.filter(c => !c._pendingDraw);
    if (!deps.isKillCard(card) || card.virtual || card._skill || (!card._entitySourceCard && card._skipHandMove) || !hand.length || !window.RelicSystem?.hasEquipped?.(state, actor, "霹雳之锤")) return false;
    if (actor.side !== "ally") {
      const discard = hand.sort((a, b) => ((deps.isKillCard(a) ? 2 : 0) + (a.name === "闪" ? 3 : 0) + (a.type === "tactic" ? 1 : 0)) - ((deps.isKillCard(b) ? 2 : 0) + (b.name === "闪" ? 3 : 0) + (b.type === "tactic" ? 1 : 0)))[0];
      actor.hand.splice(actor.hand.indexOf(discard), 1); window.BattleCards?.put(state.battle, actor, discard, "discard", { showDiscard: true });
      window.BattleLog.add(state,`${actor.name} 弃置${discard.suit || ""}${discard.name}发动霹雳之锤，该杀强制造成伤害。`);
      damage(state, target, amount, source, actor, { ...card, ignoreResponse: true, _entitySourceCard: card._entitySourceCard || card });
      return false;
    }
    state.battle.thunderHammer = { actorUid: actor.uid, targetUid: target.uid, amount, source, card: { ...card, ignoreResponse: true, _entitySourceCard: card._entitySourceCard || card }, used: false };
    state.battle.locked = true;
    ctx.clearSelection(state.battle);
    window.BattleLog.add(state,`${actor.name} 的霹雳之锤可发动：选择一张手牌弃置，令该杀强制造成伤害。`);
    return true;
  }
  function resolveThunderHammer(state, cardIndex) {
    const b = state.battle, h = b?.thunderHammer, actor = h && ctx.allUnits(b).find(u => u.uid === h.actorUid), target = h && ctx.allUnits(b).find(u => u.uid === h.targetUid), discard = actor?.hand[cardIndex];
    if (!h || h.used || !actor || !target || !discard || discard._pendingDraw) return false;
    actor.hand.splice(cardIndex, 1); window.BattleCards?.put(b, actor, discard, "discard", { showDiscard: true }); h.used = true; b.thunderHammer = null; b.locked = false;
    window.BattleLog.add(state,`${actor.name} 弃置${discard.suit || ""}${discard.name}发动霹雳之锤，该杀强制造成伤害。`);
    damage(state, target, h.amount, h.source, actor, h.card); if (h.card.greenGatlingQueue?.length) b.greenGatlingResume = { actorUid: actor.uid, targetUid: target.uid, card: h.card }; ctx.checkEnd(state); return true;
  }
  function cancelThunderHammer(state) {
    const b = state.battle, h = b?.thunderHammer; if (!h) return false;
    const actor = ctx.allUnits(b).find(u => u.uid === h.actorUid), target = ctx.allUnits(b).find(u => u.uid === h.targetUid);
    b.thunderHammer = null; b.locked = false; if (actor && target && !h.afterDodgedFired) triggers.afterDodged(state, actor, target, h.card); if (h.card.greenGatlingQueue?.length) b.greenGatlingResume = { actorUid: h.actorUid, targetUid: h.targetUid, card: h.card }; return true;
  }
  return { shouldManualDodge, queueManualDodge, autoDodge, resolveManualDodge, confirmDeflectResult, resolveThunderHammer, cancelThunderHammer };
};
