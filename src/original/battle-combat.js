window.BattleCombat = (deps) => {
  const hasSkill = (unit, name) => unit.skills?.some(s => s.name === name);
  const cardPower = card =>
    deps.isKillCard(card) ? 0 : card.power ?? card.damage ?? 0;
  function allUnits(b) { return b.allies.concat(b.enemies); }
  const { holdVisual, visualOf, pushFloat, queueSlashText, queueSlashPlay, pendingFatalAnim } = window.BattleCombatVisuals(deps, allUnits);
  const targeting = window.BattleCombatTargeting(deps, { useCard, checkEnd });
  const { sameSideUnits, comboPartner, clearSelection, canSelectHandCost, hasNoIntentCost, canPlay, selectCard, selectSkill, selectExtract, selectMimic, selectPrepareSkill, chooseTarget, cancelSelection, playSelectedCard, playActiveCard } = targeting;
  function selectedCostCard(actor) { const c = actor?._activeCostCard; return c ? actor.hand.indexOf(c) : window.state?.battle?.selectedCardIndex; }
  function selectedHand(state, actor) { const i = selectedCostCard(actor), card = actor.hand[i]; return { i, card, ok: i != null && card && !card._pendingDraw }; }
  function putCard(state, actor, card, pile, opts = {}) { window.BattleCards?.put(state.battle, actor, card, pile, opts); }
  function putMany(state, actor, cards, pile, opts = {}) { window.BattleCards?.putMany?.(state.battle, actor, cards, pile, opts); }
  function afterHandLost(state, unit) { window.BattleCards?.afterHandLost?.(state.battle, unit); }
  function moveHand(state, actor, i, pile, opts = {}) { const [card] = actor.hand.splice(i, 1); putCard(state, actor, card, pile, opts); return card; }
  const statOf = (u, k) => (u.stats?.[k] || 0) + (k === "attack" ? (u.tempAttack || 0) : k === "magic" ? (u.tempMagic || 0) : 0);
  const isSingleSlash = card => window.CardUtils.isEntitySingleKill(card);
  const specialCtx = { allUnits, hasSkill, sameSideUnits, comboPartner, selectedCostCard, selectedHand, moveHand, putCard, putMany, holdVisual, visualOf, pushFloat, queueSlashText, queueSlashPlay, statOf, useCard };
  const specials = window.BattleCardSpecials(deps, specialCtx);
  const repeatIfDone = (state, actor, target, card, done) => { if (done && !state.battle?.locked) specials.repeatTactic(state, actor, target, card); };
  const trailSkillName = (card, actor) =>
    window.UICommon?.activeSkillName?.(actor, card) || "";
  function trailDestination(card, actor, battle) {
    const owner = card?.stolenFromUid
      && allUnits(battle).find(unit => unit.uid === card.stolenFromUid);
    return {
      pile: card?.type === "consume" || card?.copiedByEdis || card?.void
        ? "consumed" : "discard",
      side: owner?.side || actor?.side || "ally",
    };
  }
  function trailSnapshot(card, actor, battle) {
    const snapshot = { ...(window.CardUtils?.clean?.(card) || card) }, skillName = trailSkillName(card, actor);
    const destination = trailDestination(card, actor, battle);
    if (skillName) snapshot.skillName = skillName;
    else delete snapshot.skillName;
    snapshot._destinationPile = destination.pile;
    snapshot._destinationSide = destination.side;
    if (card?._cardResolutionId) {
      snapshot._cardAnimationId = card._cardResolutionId;
    }
    return { ...snapshot, _playedByName: actor.name, _playedAction: card?._skill || card?.type === "tactic" ? "发动了" : "使用了" };
  }
  let resolver, cardResume;

  function useCard(state, actor, target, card) {
    const battleAtStart = state.battle;
    if (window.CharacterSkillAccess?.canResolve
      && !window.CharacterSkillAccess.canResolve(
        state, actor, target, card, canPlay
      )) return false;
    cardResume?.ensureId(card);
    const trailEntry = card && battleAtStart
      ? trailSnapshot(card, actor, battleAtStart) : null;
    if (trailEntry) (battleAtStart.played ||= []).unshift(trailEntry);
    if (card) { delete card._countAsPlayed; delete card.lastHpLoss; delete card.totalHpLoss; }
    try { return resolveCard(state, actor, target, card); }
    finally {
      if (card?.magicMissileVirtual && !state.battle?.locked) window.OrcDungeonSkills?.afterMagicMissile?.(state, actor, target, card);
      const counted = !!card?._countAsPlayed;
      if (counted) {
        card._playedByName = actor.name;
        card._playedAction = card._skill || card.type === "tactic" ? "发动了" : "使用了";
        if (!card.skipMvpCardCount) window.BattleStats?.cardPlayed?.(battleAtStart, actor);
        window.WithererSkills?.refreshShiftState?.(actor);
      }
      if (trailEntry) {
        if (counted && state.battle === battleAtStart) { Object.keys(trailEntry).forEach(key => delete trailEntry[key]); Object.assign(trailEntry, trailSnapshot(card, actor, battleAtStart)); }
        else { const i = battleAtStart.played.indexOf(trailEntry); if (i >= 0) battleAtStart.played.splice(i, 1); }
      }
      cardResume?.finalizeUse(state, actor, target, card, counted);
    }
  }
  deps.useCard = useCard;
  function resolveCard(state, actor, target, card) {
    if (state.battle?.locked) return;
    if (card?.withererTongueActive
      && !window.WithererSkills?.canUseTongueActive?.(state, actor, target, useCard)) return false;
    if (card?.armyOrder
      && !window.BakarSkills?.canUseArmyOrder?.(state, actor, card, useCard)) return false;
    state.battle.testRecovery = false; if (actor.hand.includes(card)) card._playedFromHand = true; window.WithererSkills?.convertBerserkCard?.(state, actor, card); if (!card._skill) { window.AngelicaLukaSkills?.beforeCardPlayed?.(state, actor, card); window.ArtinaMariaSkills?.beforeCardPlayed?.(state, actor, card, deps); } window.RuinsEnemySkills?.beforeCardPlayed?.(state, actor, card);
    window.EdisSkills?.rememberPrePlayHand?.(actor, card);
    window.WithererSkills?.prepareSpeedCard?.(state, actor, card);
    if (card.demonPoker) { const done = specials.demonPoker(state, actor, target, card); repeatIfDone(state, actor, target, card, done); return done; }
    if (card.succubusFork) { const done = specials.succubusFork(state, actor, target, card); repeatIfDone(state, actor, target, card, done); return done; }
    if (card.assassinLatex) { const done = specials.assassinLatex(state, actor, target, card); repeatIfDone(state, actor, target, card, done); return done; }
    if (card.arsenal) { const done = specials.arsenal(state, actor, target, card); repeatIfDone(state, actor, target, card, done); return done; }
    if (window.NonokaLokiSkills?.handleSpecialCard?.(state, actor, target, card, { ...deps, statOf, pushFloat, damage })) { card._countAsPlayed = true; return; }
    if (window.FloraCarlosSkills?.handleSpecialCard?.(state, actor, target, card, deps, { ...specialCtx, damage })) { card._countAsPlayed = true; return; }
    if (window.BertisGerlotSkills?.handleSpecialCard?.(state, actor, target, card, deps, { ...specialCtx, damage })) { card._countAsPlayed = true; return; }
    if (window.WendyCadicisSkills?.handleSpecialCard?.(state, actor, target, card, { ...deps, pushFloat, selectedHand })) { card._countAsPlayed = true; return; }
    if (window.LokarSkills?.handleSpecialCard?.(state, actor, target, card, deps, specialCtx)) { card._countAsPlayed = true; return; }
    if (window.MillerSkills?.handleSpecialCard?.(state, actor, target, card, deps)) { card._countAsPlayed = true; return; }
    if (window.AngelicaLukaSkills?.handleSpecialCard?.(state, actor, target, card, deps, specialCtx)) { card._countAsPlayed = true; return; }
    if (window.ArtinaMariaSkills?.handleSpecialCard?.(state, actor, target, card, deps)) { card._countAsPlayed = true; return; }
    if (window.ElranaAceNanaliSkills?.handleSpecialCard?.(state, actor, target, card, { ...deps, damage, pushFloat }, specialCtx)) { card._countAsPlayed = true; return true; }
    if (window.HoshinoSkills?.handleSpecialCard?.(state, actor, target, card, { ...deps, damage, pushFloat })) { card._countAsPlayed = true; return true; }
    if (card.ailengBet || card.ailengCharge || card.bestaEndSlash) { const ok = window.GuestCharacterSkills?.handleSpecialCard?.(state, actor, target, card, { ...deps, damage, pushFloat, intentMax: deps.intentMax }, specialCtx); if (ok) card._countAsPlayed = true; return !!ok; }
    if (window.GuestCharacterSkills?.handleSpecialCard?.(state, actor, target, card, { ...deps, damage, pushFloat, intentMax: deps.intentMax }, specialCtx)) { card._countAsPlayed = true; return true; }
    if (!card._skill && !card._skipHandMove) { actor.hand.splice(actor.hand.indexOf(card), 1); const pile = card.type === "consume" || card.copiedByEdis || card.void ? "consumed" : "discard"; putCard(state, actor, card, pile, { skipAnim: pile === "discard" && !!card._playedFlightDone }); }
    card._playedByName = actor.name; card._playedAction = card.type === "tactic" ? "发动了" : "使用了";
    card._countAsPlayed = true;
    window.BattleLog.add(state,`${actor.name} 使用${card.suit || ""}${card.name}。`);
    window.BattleLines?.skill(state, actor, card.name, target);
    window.WendyCadicisSkills?.applyPlan?.(state, actor, target, card);
    if (specials.counterTactic(state, actor, target, card)) return;
    resolver.continueAfterCounter(state, actor, target, card);
  }
  function discardDeadHands(state, b) {
    const units = allUnits(b);
    units.filter(u => u.hp <= 0 && !window.SakuraRisaSkills?.pendingRevival?.(u) && !u.deathDiscarded && u.hand?.length).forEach(u => {
      const cards = u.hand.splice(0); u.deathDiscarded = true;
      window.BattleCards?.putMany?.(b, u, cards, "discard", { skipAfterHandLost: true });
      window.BattleLog.add(state, `${u.name} 被击倒，弃置所有手牌。`);
    });
  }
  function checkDefeat(state) {
    const b = state.battle; if (!b || b.failedTriggered || b.pendingDefeat) return !!(b?.failedTriggered || b?.pendingDefeat);
    if (pendingFatalAnim(b)) return false;
    if (!b.test) discardDeadHands(state, b);
    if (b.test) { const fallen = b.allies.filter(a => a.hp <= 0 && !window.SakuraRisaSkills?.pendingRevival?.(a)); if (fallen.length) { fallen.forEach(a => { a.hp = a.maxHp; a.block = 0; }); b.testRecovery = true; clearTimeout(b.testRecoveryTimer); b.testRecoveryTimer = setTimeout(() => { if ((window.state && window.state !== state) || state.battle !== b) return; b.testRecovery = false; window.render?.(); }, 1200); window.BattleLog.add(state,"测试模式·生命恢复。"); } return false; }
    if (b.allies.some(a => a.hp > 0 || window.SakuraRisaSkills?.pendingRevival?.(a))) return false; b.failedTriggered = true; b.pendingDefeat = true; b.locked = true; clearSelection(b); return true;
  }
  function checkEnd(state) { const b = state.battle; if (!b || checkDefeat(state) || b.locked || b.enemies.some(e => e.hp > 0 || window.SakuraRisaSkills?.pendingRevival?.(e)) || pendingFatalAnim(b)) return; deps.finishBattle(state, true); }
  const damageApi = window.BattleDamage({ ...deps, nextAnim: deps.nextAnim }, { allUnits, hasSkill, statOf, holdVisual, visualOf, pushFloat, queueSlashText, queueSlashPlay, checkDefeat, checkEnd, clearSelection });
  const { damage, directDamage, triggerWhiteLolita, resolveThunderHammer: resolveDamageThunderHammer, cancelThunderHammer: cancelDamageThunderHammer, resolveManualDodge, confirmDeflectResult } = damageApi;
  damage.useCard = useCard;
  damage.damageHandlesPreTargetHooks = true;
  specialCtx.damage = damage;
  cardResume = window.BattleCardResume({ deps, specials, damage, checkDefeat, allUnits, pushFloat });
  specialCtx.recordDeferredHit = cardResume.recordHit;
  resolver = window.BattleCombatResolver({ deps, specials, useCard, damage, selectedHand, moveHand, statOf, pushFloat, checkDefeat, checkEnd, cardPower, isSingleSlash, repeatIfDone, hasNoIntentCost, triggerWhiteLolita, deferDamageTail: cardResume.deferDamageTail });
  const { continueAfterCounter, attackValues } = resolver;
  function resolveThunderHammer(state, cardIndex) { const ok = resolveDamageThunderHammer(state, cardIndex), p = state.battle?.greenGatlingResume; if (!ok || !p || state.battle?.locked) return ok; state.battle.greenGatlingResume = null; const actor = allUnits(state.battle).find(u => u.uid === p.actorUid), target = allUnits(state.battle).find(u => u.uid === p.targetUid); if (actor && target) resumeGreenGatling(state, actor, target, p.card); return ok; }
  function cancelThunderHammer(state) { const ok = cancelDamageThunderHammer(state), p = state.battle?.greenGatlingResume; if (!ok || !p || state.battle?.locked) return ok; state.battle.greenGatlingResume = null; const actor = allUnits(state.battle).find(u => u.uid === p.actorUid), target = allUnits(state.battle).find(u => u.uid === p.targetUid); if (actor && target) resumeGreenGatling(state, actor, target, p.card); return ok; }
  function resolveDimensionTransfer(state, targetUid) { const ok = window.MannySkills?.resolveDimensionTransfer?.(state, targetUid, damage); if (ok) { checkDefeat(state); checkEnd(state); } return ok; }
  function resolveCounterTrigger(state, use) {
    return window.BattleCounterTriggers?.resolve(state, use, {
      damage, directDamage, useCard, draw: deps.draw,
      finalizeDamage: damageApi.finalizeDamage, checkDefeat, checkEnd,
    });
  }
  function resumeGreenGatling(state, actor, target, card) { const b = state.battle; if (b) b._resumingCardTail = true; try { specials.resumeGreenGatling(state, actor, target, card); checkDefeat(state); checkEnd(state); } finally { if (b) delete b._resumingCardTail; } }
  function resumeComboAttack(state) { const b = state.battle; if (b) b._resumingCardTail = true; try { const ok = specials.resumeComboAttack?.(state); checkDefeat(state); checkEnd(state); return ok; } finally { if (b) delete b._resumingCardTail; } }
  const responses = window.BattleCombatResponses({ allUnits, putCard, afterHandLost, damage, statOf, specials, checkDefeat, checkEnd, continueAfterCounter, deps, attackValues, deferDamageTail: cardResume.deferDamageTail });
  const { resolveHandReveal, continueAfterCadicisResponsibility, resolveManualCounter } = responses;
  function resolveOpheliaGuard(state, uid) { const ok = window.GuestCharacterSkills?.resolveOpheliaGuard?.(state, uid, { canDodge: damageApi.canDodge, draw: deps.draw, hitWithoutDodge: damageApi.hitWithoutDodge, finalizeDamage: damageApi.finalizeDamage, afterDodged: damageApi.afterDodged }); checkDefeat(state); checkEnd(state); return ok; }
  function resumeCardTail(state) { return cardResume.resume(state); }
  function recordDeferredHit(state, actor, target, card, result) { cardResume.recordHit(state, actor, target, card, result); }
  function resumeGroupHeal(state) { const b = state.battle; if (b) b._resumingCardTail = true; try { return specials.resumeTeamHeal?.(state); } finally { if (b) delete b._resumingCardTail; } }
  return { selectCard, selectSkill, selectExtract, selectMimic, selectPrepareSkill, chooseTarget, cancelSelection, playSelectedCard, playActiveCard, canSelectHandCost, canPlay, checkDefeat, checkEnd, useCard, damage, directDamage, resolveThunderHammer, cancelThunderHammer, resolveManualDodge, confirmDeflectResult, resolveManualCounter, resolveCounterTrigger, resolveDimensionTransfer, resolveHandReveal, resumeGreenGatling, resumeComboAttack, resumeCardTail, recordDeferredHit, resumeGroupHeal, continueAfterCadicisResponsibility, resolveOpheliaGuard, holdVisual, pushFloat, triggerBattleCourage: specials.triggerBattleCourage };
};
