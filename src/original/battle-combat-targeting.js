window.BattleCombatTargeting = (deps, hooks) => {
  const {
    sameSideUnits, opposingUnits, effectiveCard, needsSingleHand, needsHandChoice,
    canSelectHandCost, hasNoIntentCost, canPlay,
  } = window.BattleCardPlayability(deps);
  const targetOf = (b, actor, source, targetUid) => { const card = effectiveCard(actor, source), uid = Array.isArray(targetUid) ? targetUid[0] : targetUid; return card?.mimicVoice || card?.discardTarget || card?.stealCard ? b.allies.concat(b.enemies).find(u => u.uid === uid && u.uid !== actor?.uid && u.hp > 0) : card?.allyTarget ? sameSideUnits(b, actor).find(u => u.uid === uid) : card?.targetless ? actor : opposingUnits(b, actor).find(u => u.uid === uid); };
  const onlySelfAlive = (b, actor) => sameSideUnits(b, actor).filter(u => u.hp > 0).length === 1;
  const comboPartner = (b, actor) => sameSideUnits(b, actor).find(u => u.uid === b?.comboPartnerUid && u.uid !== actor?.uid && u.hp > 0);
  const soulChainNeed = (b, actor) => Math.min(2, opposingUnits(b, actor).filter(u => u.hp > 0).length);
  const hasVisibleHand = unit => (unit?.hand || []).some(card => !card._pendingDraw);
  const hasMagicBulletCard = unit => window.CardUtils.magicBulletCards(unit).length > 0;
  const clearSelection = (b) => { b.selectedCardIndex = null; b.selectedCostCardIndex = null; b.selectedSkillCard = null; b.selectedBagIndexes = null; b.pendingTargetUid = null; b.pendingTargetUids = null; b.comboPartnerUid = null; };
  const skillCard = skill => skill?.card && { ...skill.card, _skill: true, _relicSkill: skill.source === "relic", skillName: skill.name };
  const canUseSkillNow = (b, actor, card) => {
    const prepareKey = card?.speedAssault ? "awaitingSpeedAssaultUid"
      : card?.extract ? "awaitingExtractUid"
        : card?.mimicVoice ? "awaitingMimicUid" : null;
    return prepareKey
      ? (b.phase === 1 || card?.speedAssault && b.phase === 6)
        && b[prepareKey] === actor?.uid
      : b.phase === 4;
  };
  function selectCard(state, cardIndex) {
    const b = state.battle, actor = deps.active(b), source = actor?.hand[cardIndex]; if (b?.thunderHammer) return false; if (b.locked || b.phase !== 4 || !actor || actor.side !== "ally" || !source || source._pendingDraw) return false;
    if (b.selectedSkillCard?.elranaBag || b.selectedSkillCard?.armyOrder
      || b.selectedSkillCard?.ailengBet || b.selectedSkillCard?.mariaHonorBlessing) {
      const list = b.selectedBagIndexes || [], i = list.indexOf(cardIndex);
      if (i >= 0) list.splice(i, 1);
      else {
        if (!canSelectHandCost(actor, b.selectedSkillCard, source, b, cardIndex)) return false;
        b.selectedBagIndexes ||= list; list.push(cardIndex);
      }
      b.pendingTargetUid = actor.uid; return true;
    }
    if (b.selectedSkillCard?.elranaHeal) { b.selectedCardIndex = b.selectedCardIndex === cardIndex ? null : cardIndex; return true; }
    if (needsSingleHand(b.selectedSkillCard)) { const selected = b.selectedCardIndex === cardIndex; if (!selected && !canSelectHandCost(actor, b.selectedSkillCard, source, b, cardIndex)) return false; if (b.selectedSkillCard?.crazyShooting && selected) return canSelectHandCost(actor, b.selectedSkillCard, source, b, cardIndex) && playSelectedCard(state); b.selectedCardIndex = selected ? null : cardIndex; b.pendingTargetUid = b.selectedSkillCard?.demonPoker || b.selectedSkillCard?.idolKiss ? b.pendingTargetUid : actor.uid; return true; }
    if (!canPlay(actor, source, b)) return false; const toggled = b.selectedCardIndex === cardIndex; clearSelection(b); b.selectedCardIndex = toggled ? null : cardIndex; return true;
  }
  function selectSkill(state, skillIndex) {
    const b = state.battle, actor = deps.active(b), skill = actor && window.UICommon.skillsOf(actor)[skillIndex], card = skillCard(skill);
    if (skill?.type !== "active" || b.locked || !canUseSkillNow(b, actor, card) || !actor || actor.side !== "ally" || !card || !canPlay(actor, card, b)) return false; clearSelection(b); b.selectedSkillCard = card; if (card.crazyShooting || card.millerSlot) b.pendingTargetUid = actor.uid; return true;
  }
  function selectExtract(state) {
    const b = state.battle, actor = deps.active(b), skill = actor && window.UICommon.skillsOf(actor).find(s => s.name === "榨取精华"), card = skillCard(skill);
    if (b?.locked || !actor || actor.side !== "ally" || !card?.extract || !canUseSkillNow(b, actor, card) || !canPlay(actor, card, b)) return false;
    clearSelection(b); b.selectedSkillCard = card; return true;
  }
  function selectMimic(state) {
    const b = state.battle, actor = deps.active(b), skill = actor && window.UICommon.skillsOf(actor).find(s => s.name === "模仿之音"), card = skillCard(skill);
    if (b?.locked || !actor || actor.side !== "ally" || !card?.mimicVoice || !canUseSkillNow(b, actor, card) || !canPlay(actor, card, b)) return false;
    clearSelection(b); b.selectedSkillCard = card; return true;
  }
  function selectPrepareSkill(state, name) {
    const b = state.battle, actor = deps.active(b), skill = actor && window.UICommon.skillsOf(actor).find(s => s.name === name), card = skillCard(skill);
    if (b?.locked || !actor || actor.side !== "ally" || !card || !canUseSkillNow(b, actor, card) || !canPlay(actor, card, b)) return false;
    clearSelection(b); b.selectedSkillCard = card; return true;
  }
  function chooseTarget(state, targetUid) {
    const b = state.battle, actor = deps.active(b), units = b?.allies.concat(b.enemies) || [], target = units.find(u => u.uid === targetUid && u.hp > 0), source = b?.selectedSkillCard || actor?.hand[b?.selectedCardIndex], card = effectiveCard(actor, source);
    if (!b || b.locked || !actor || actor.side !== "ally" || !source || !canUseSkillNow(b, actor, card) || (b.selectedCardIndex == null && !b.selectedSkillCard) || !target || (card.targetless && !card.allyTarget && !card.extract && !card.mimicVoice && !card.speedAssault && !card.idolKiss && !card.crazyShooting) || !canPlay(actor, source, b)) return false;
    if (card.comboAttack) { if (!b.comboPartnerUid) { if (target.side !== actor.side || target.uid === actor.uid) return false; b.comboPartnerUid = targetUid; b.pendingTargetUid = null; return true; } if (target.side === actor.side) return false; b.pendingTargetUid = targetUid; return true; }
    if (card.borrowSlash) { if (!b.comboPartnerUid) { if (target.side !== actor.side || target.uid === actor.uid || !hasVisibleHand(target)) return false; b.comboPartnerUid = targetUid; b.pendingTargetUid = null; return true; } if (target.side === actor.side) return false; b.pendingTargetUid = targetUid; return true; }
    if (card.discardTarget || card.stealCard) { if (target.uid === actor.uid || !hasVisibleHand(target)) return false; b.pendingTargetUid = targetUid; return true; }
    if (card.statusKey) { if (target.side === actor.side || window.BattleStatusCards?.has?.(target, card.statusKey)) return false; b.pendingTargetUid = targetUid; return true; }
    if (card.soulChain) { if (target.side !== "enemy") return false; const list = b.pendingTargetUids ||= []; const i = list.indexOf(targetUid); i >= 0 ? list.splice(i, 1) : list.length < soulChainNeed(b, actor) && list.push(targetUid); b.pendingTargetUid = list[0] || null; return true; }
    if (card.mimicVoice) { if (target.uid === actor.uid) return false; b.pendingTargetUid = targetUid; return true; }
    if (card.speedAssault) { if (target.side !== "enemy") return false; b.pendingTargetUid = targetUid; return true; }
    if (card.allyTarget && target.side !== actor.side) return false; if ((card.bertisWhip || card.aceContribution) && target.uid === actor.uid) return false; if (card.extract && (target.side !== "ally" || target.gender !== "male")) return false; if ((card.ailengCharge || card.kaiichiMilk) && target.gender !== "female") return false; if (card.demonPoker && target.side !== "enemy") return false; if (card.idolKiss && target.uid === actor.uid) return false; if (card.magicBullet && !hasMagicBulletCard(target)) return false; if (card.crazyShooting && (target.uid !== actor.uid || !actor.hand[state.battle.selectedCardIndex] || !["♥", "♦"].includes(actor.hand[state.battle.selectedCardIndex].suit))) return false; if (needsHandChoice(card) && !card.demonPoker && !card.idolKiss && !card.crazyShooting && !card.elranaHeal && target.uid !== actor.uid) return false; if (card.bloodPact && !target.hand.some(c => !c._pendingDraw)) return false; if (!card.allyTarget && !card.extract && !needsHandChoice(card) && target.side !== "enemy") return false;
    b.pendingTargetUid = targetUid; return true;
  }
  function cancelSelection(state) { if (state.battle) clearSelection(state.battle); }
  function playSelectedCard(state) {
    const b = state.battle, actor = deps.active(b), source = b.selectedSkillCard || actor?.hand[b.selectedCardIndex], card = effectiveCard(actor, source);
    if (b.selectedCardIndex == null && !b.selectedSkillCard) return false;
    if (needsSingleHand(b.selectedSkillCard) && b.selectedCardIndex == null) return false;
    if ((card?.elranaBag || card?.ailengBet || card?.mariaHonorBlessing)
      && !(card._bagIndexes || b.selectedBagIndexes || []).length) return false;
    if (card?.armyOrder && !window.BakarSkills?.validArmyOrder?.(actor, card._bagIndexes || b.selectedBagIndexes)) return false; if (card?.allyTarget && !card.bertisWhip && !card.aceContribution && onlySelfAlive(b, actor)) b.pendingTargetUid = actor.uid; if (card?.comboAttack && (!b.pendingTargetUid || !comboPartner(b, actor))) return false; if (card?.borrowSlash && !hasVisibleHand(comboPartner(b, actor))) return false; if (card?.magicBullet && !hasMagicBulletCard(opposingUnits(b, actor).find(unit => unit.uid === b.pendingTargetUid))) return false; if (card?.soulChain && (b.pendingTargetUids || []).length < soulChainNeed(b, actor)) return false; if ((!card?.targetless || card?.allyTarget) && !b.pendingTargetUid) return false;
    const targetArg = card?.soulChain ? (b.pendingTargetUids || [b.pendingTargetUid]).filter(Boolean) : b.pendingTargetUid;
    const partnerUid = b.comboPartnerUid;
    const ok = b.selectedSkillCard ? playSkillCard(state, targetArg) : playActiveCard(state, b.selectedCardIndex, targetArg, partnerUid); if (state.battle) cancelSelection(state); return ok;
  }
  function playActiveCard(state, cardIndex, targetUid, partnerUid = null) { const b = state.battle, actor = deps.active(b), source = actor?.hand[cardIndex], card = effectiveCard(actor, source), target = targetOf(b, actor, source, targetUid), partner = sameSideUnits(b, actor).find(unit => unit.uid === partnerUid && unit.hp > 0); if (b.locked || !actor || actor.side !== "ally" || b.phase !== 4 || !target || !source || !canPlay(actor, source, b) || card.magicBullet && !hasMagicBulletCard(target) || (card.discardTarget || card.stealCard) && !hasVisibleHand(target) || card.statusKey && window.BattleStatusCards?.has?.(target, card.statusKey) || card.borrowSlash && (!partner || !hasVisibleHand(partner))) return false; if (card.soulChain && Array.isArray(targetUid)) source._targetUids = targetUid; if ((card.comboAttack || card.borrowSlash) && partnerUid) b.comboPartnerUid = partnerUid; const ok = hooks.useCard(state, actor, target, source); if (ok === false) return false; hooks.checkEnd(state); return true; }
  function playSkillCard(state, targetUid) {
    const b = state.battle, actor = deps.active(b), card = b.selectedSkillCard, units = b.allies.concat(b.enemies), uid = Array.isArray(targetUid) ? targetUid[0] : targetUid, target = card?.allyTarget ? sameSideUnits(b, actor).find(u => u.uid === uid) : card?.speedAssault ? opposingUnits(b, actor).find(u => u.uid === uid) : (card?.targetless && !card?.speedAssault) ? actor : units.find(u => u.uid === uid);
    if (b.locked || !actor || actor.side !== "ally" || !canUseSkillNow(b, actor, card) || !target || !card || !canPlay(actor, card, b)) return false; if (card.mimicVoice && target.uid === actor.uid) return false; if (card.extract && (target.side !== "ally" || target.gender !== "male")) return false; if ((card.bertisWhip || card.aceContribution) && target.uid === actor.uid) return false; if ((card.ailengCharge || card.kaiichiMilk) && (target.side !== actor.side || target.gender !== "female")) return false; if (card.speedAssault && target.side !== "enemy") return false; if (card.magicBullet && !hasMagicBulletCard(target)) return false; if (needsSingleHand(card) && (b.selectedCardIndex == null || !canSelectHandCost(actor, card, actor.hand[b.selectedCardIndex], b, b.selectedCardIndex))) return false; if (card.idolKiss && (target.uid === actor.uid || target.side !== actor.side)) return false; if (card.demonPoker && target.side !== "enemy") return false; if (needsSingleHand(card) && !card.demonPoker && !card.idolKiss && !card.crazyShooting && !card.elranaHeal && target.uid !== actor.uid) return false; if ((card.elranaBag || card.armyOrder || card.ailengBet) && target.uid !== actor.uid) return false; if (card.armyOrder && !window.BakarSkills?.validArmyOrder?.(actor, card._bagIndexes || b.selectedBagIndexes)) return false; if (card.soulChain && Array.isArray(targetUid)) card._targetUids = targetUid;
    const ok = hooks.useCard(state, actor, target, card); if (ok === false) return false; hooks.checkEnd(state); return true;
  }
  return { sameSideUnits, comboPartner, clearSelection, canSelectHandCost, hasNoIntentCost, canPlay, selectCard, selectSkill, selectExtract, selectMimic, selectPrepareSkill, chooseTarget, cancelSelection, playSelectedCard, playActiveCard };
};
