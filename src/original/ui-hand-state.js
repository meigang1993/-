window.GameUIHandState = (() => {
  function create(state, U) {
    const battle = state.battle;
    const showKaiichiShare = !!battle.kaiichiShare
      && (window.HoshinoSkills?.shareVisible?.(battle) ?? true);
    const showDimensionTransfer = !!battle.dimensionTransfer
      && (window.MannySkills?.dimensionTransferVisible?.(battle) ?? true);
    const showCadicisResponsibility = !!battle.cadicisResponsibility
      && (window.WendyCadicisSkills?.responsibilityVisible?.(battle) ?? true);
    const borrowChoice = ["borrowSlashChoice", "borrowGainChoice"]
      .includes(battle.handReveal?.mode);
    const transferUid = (borrowChoice ? battle.handReveal.targetUid : null)
      || (showDimensionTransfer ? battle.dimensionTransfer.mannyUid : null)
      || (showKaiichiShare ? battle.kaiichiShare.unitUid : null)
      || (showCadicisResponsibility
        ? battle.cadicisResponsibility.cadicisUid : null)
      || battle.newMoonShare?.unitUid
      || battle.millerShare?.unitUid;
    const actor = transferUid
      ? battle.allies.find(unit => unit.uid === transferUid)
      : BattleSystem.active(battle);
    if (!actor || actor.side !== "ally") return { battle, actor: null };

    const modes = {
      dimensionTransfer: showDimensionTransfer
        && battle.dimensionTransfer?.mannyUid === actor.uid,
      share: battle.newMoonShare?.unitUid === actor.uid,
      kaiichiShare: showKaiichiShare && battle.kaiichiShare?.unitUid === actor.uid,
      cadicisShare: showCadicisResponsibility
        && battle.cadicisResponsibility?.cadicisUid === actor.uid,
      millerShare: battle.millerShare?.unitUid === actor.uid,
      borrowChoice,
      hammer: battle.thunderHammer?.actorUid === actor.uid,
      extractStart: battle.phase === 1 && battle.awaitingExtractUid === actor.uid,
      mimicStart: battle.phase === 1 && battle.awaitingMimicUid === actor.uid,
      speedStart: [1, 6].includes(battle.phase)
        && battle.awaitingSpeedAssaultUid === actor.uid,
    };
    modes.transferLocked = modes.dimensionTransfer || modes.kaiichiShare
      || modes.cadicisShare || modes.borrowChoice;
    modes.discard = battle.phase === 5 && !modes.share && !modes.cadicisShare || modes.hammer;
    modes.playable = battle.phase === 4 || modes.extractStart || modes.mimicStart
      || modes.speedStart || modes.dimensionTransfer || modes.share || modes.kaiichiShare
      || modes.cadicisShare || modes.millerShare || modes.borrowChoice;

    const canDiscardInPhase = card => !card._pendingDraw
      && (window.GuestCharacterSkills?.countsForLimit?.(actor, card) ?? true)
      && (window.UnderwaterTrainSkills?.canDiscard?.(actor, card) ?? true);
    const picks = selectionSets(battle, actor, modes, canDiscardInPhase);
    const visible = U.handCount(actor);
    const limit = U.handLimit(actor);
    const needDiscard = Math.min(
      Math.max(0, visible - limit),
      actor.hand.filter(canDiscardInPhase).length
    );
    const rawPickedCard = battle.selectedSkillCard || actor.hand[battle.selectedCardIndex];
    const pickedCard = window.WithererSkills?.displayCard?.(actor, rawPickedCard) || rawPickedCard;
    const handChoice = needsHandChoice(pickedCard);
    const soulNeed = Math.min(2, battle.enemies.filter(unit => unit.hp > 0).length);
    const ready = selectionReady(battle, actor, pickedCard, handChoice, soulNeed);
    const hasDiscardSkill = (actor.skills || []).some(skill => (skill.text || "").includes("弃牌阶段"));
    const canMillerShare = actor.ref === "miller"
      && (actor.skills || []).some(skill => skill.name === "收获分享")
      && battle.allies.some(unit => unit.uid !== actor.uid && unit.hp > 0);
    const discardResult = hasDiscardSkill ? "一次性弃置并结算弃牌技能" : "一次性弃置";
    const discardTip = canMillerShare
      ? `弃牌阶段：选择${needDiscard}张手牌，可用收获分享交给队友，或点确认一次性弃置（当前 ${visible}/${limit}）`
      : `弃牌阶段：选择${needDiscard}张手牌后点确认，${discardResult}（当前 ${visible}/${limit}）`;

    return {
      battle, actor, modes, picks, visible, limit, needDiscard, pickedCard, handChoice,
      soulNeed, ready, discardTip, canDiscardInPhase,
      picked: battle.selectedCardIndex != null || battle.selectedSkillCard,
      disabled: (battle.locked && !modes.transferLocked) || modes.discard || !modes.playable ? "disabled" : "",
    };
  }

  function selectionSets(battle, actor, modes, canDiscardInPhase) {
    const rawDiscard = battle.discardPick?.unitUid === actor.uid
      ? battle.discardPick.indexes || []
      : [];
    const discard = rawDiscard.filter(index => canDiscardInPhase(actor.hand[index]));
    const share = modes.share
      ? (battle.newMoonShare.indexes || []).filter(index => actor.hand[index] && !actor.hand[index]._pendingDraw)
      : [];
    const kaiichi = modes.kaiichiShare
      ? (battle.kaiichiShare.indexes || []).filter(index => actor.hand[index] && !actor.hand[index]._pendingDraw)
      : [];
    const miller = modes.millerShare
      ? window.MillerSkills?.selectedIndexes?.(
        actor, battle.millerShare, canDiscardInPhase)
        || (battle.millerShare.indexes || [])
          .filter(index => canDiscardInPhase(actor.hand[index]))
      : [];
    return {
      discard, discardSet: new Set(discard),
      share, shareSet: new Set(share),
      kaiichi, kaiichiSet: new Set(kaiichi),
      miller, millerSet: new Set(miller),
    };
  }

  function needsHandChoice(card) {
    return !!(card?.bloodPact || card?.elranaBag
      || card?.armyOrder || card?.elranaHeal || card?.idolKiss || card?.crazyShooting
      || card?.demonPoker || card?.cadicisPlan || card?.mariaHonorBlessing);
  }

  function selectionReady(battle, actor, card, handChoice, soulNeed) {
    const costReady = battle.selectedCardIndex != null
      && BattleSystem.canSelectHandCost(
        actor, card, actor.hand[battle.selectedCardIndex], battle,
        battle.selectedCardIndex
      );
    if (card?.comboAttack) return battle.pendingTargetUid && battle.comboPartnerUid;
    if (card?.soulChain) return (battle.pendingTargetUids || []).length >= soulNeed;
    if (card?.armyOrder) return window.BakarSkills?.validArmyOrder?.(actor, battle.selectedBagIndexes);
    if (card?.demonPoker || card?.idolKiss) {
      return costReady && battle.pendingTargetUid;
    }
    if (card?.crazyShooting) return costReady;
    if (card?.elranaBag) return true;
    if (card?.mariaHonorBlessing) {
      const list = [...new Set(battle?.selectedBagIndexes || [])]
        .filter(index => actor.hand?.[index] && !actor.hand[index]._pendingDraw);
      return list.length > 0 && list.length <= 4
        && new Set(list.map(index => actor.hand[index].suit)).size === list.length;
    }
    if (handChoice) return costReady;
    return card?.targetless || battle.pendingTargetUid
      || card?.allyTarget && battle.allies.filter(unit => unit.hp > 0).length === 1;
  }

  return { create };
})();
