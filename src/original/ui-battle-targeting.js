window.GameUIBattleTargeting = (() => {
  const actorSide = battle => BattleSystem.active(battle)?.side || "ally";
  const hasVisibleHand = unit => (unit?.hand || []).some(card => !card._pendingDraw);
  const hasMagicBulletCard = unit => window.CardUtils.magicBulletCards(unit).length > 0;

  function targetAllowed(unitData, battle, actor, card) {
    const handChoice = card?.bloodPact || card?.elranaBag
      || card?.elranaHeal || card?.idolKiss;
    const partnerCard = card?.comboAttack || card?.borrowSlash;
    const handInteraction = card?.discardTarget || card?.stealCard;
    const allyTarget = card?.ailengCharge || card?.kaiichiMilk
      ? unitData.side === actorSide(battle) && unitData.gender === "female"
      : card?.allyTarget ? unitData.side === actorSide(battle) : false;
    const comboPartnerReady = !partnerCard
      || battle.allies.some(unit => unit.uid !== battle.activeUid && unit.hp > 0
        && (!card?.borrowSlash || hasVisibleHand(unit)));
    const comboTarget = card?.comboAttack
      ? battle.comboPartnerUid ? unitData.side === "enemy"
        : unitData.side === actorSide(battle) && unitData.uid !== battle.activeUid
      : null;
    const borrowTarget = card?.borrowSlash
      ? battle.comboPartnerUid ? unitData.side === "enemy"
        : unitData.side === "ally" && unitData.uid !== battle.activeUid
          && hasVisibleHand(unitData)
      : null;
    const share = battle.newMoonShare;
    const gerdaComfort = battle.gerdaComfort;
    const kaiichiShare = battle.kaiichiShare;
    const millerShare = battle.millerShare;
    let allowed;
    if (kaiichiShare) allowed = (kaiichiShare.indexes || []).length > 0
      && unitData.side === "ally" && unitData.uid !== kaiichiShare.unitUid;
    else if (gerdaComfort) allowed = unitData.side === "ally"
      && unitData.uid !== gerdaComfort.unitUid;
    else if (millerShare) allowed = unitData.side === "ally" && unitData.uid !== millerShare.unitUid;
    else if (share) allowed = (share.indexes || []).length === share.count
      && unitData.side === "ally" && unitData.uid !== share.unitUid;
    else if (card?.mimicVoice) allowed = unitData.uid !== battle.activeUid;
    else if (card?.speedAssault) allowed = unitData.side === "enemy";
    else if (card?.demonPoker) allowed = unitData.side === "enemy";
    else if (card?.idolKiss || card?.bertisWhip) {
      allowed = unitData.side === actorSide(battle) && unitData.uid !== battle.activeUid;
    } else if (card?.elranaHeal) allowed = unitData.side === actorSide(battle);
    else if (handChoice) allowed = unitData.uid === battle.activeUid;
    else if (card?.extract) allowed = unitData.side === "ally" && unitData.gender === "male";
    else if (allyTarget) allowed = true;
    else if (card?.comboAttack) allowed = comboTarget;
    else if (card?.borrowSlash) allowed = borrowTarget;
    else if (handInteraction) allowed = unitData.hp > 0
      && unitData.uid !== battle.activeUid && hasVisibleHand(unitData);
    else if (card?.statusKey) allowed = unitData.side !== actorSide(battle)
      && unitData.hp > 0
      && !window.BattleStatusCards?.has?.(unitData, card.statusKey);
    else if (card?.magicBullet) allowed = unitData.side === "enemy"
      && hasMagicBulletCard(unitData);
    else allowed = comboPartnerReady && unitData.side === "enemy";
    return (kaiichiShare || gerdaComfort || millerShare || share
      || battle.selectedCardIndex != null || battle.selectedSkillCard) && allowed;
  }

  function prepareTargetReady(unitData, battle) {
    const extractReady = battle.phase === 1 && battle.awaitingExtractUid
      && unitData.side === "ally" && unitData.gender === "male";
    const mimicReady = battle.phase === 1 && battle.awaitingMimicUid
      && unitData.uid !== battle.awaitingMimicUid;
    const speedReady = [1, 6].includes(battle.phase) && battle.awaitingSpeedAssaultUid
      && unitData.side === "enemy";
    const transferReady = battle.dimensionTransfer?.costIndex != null
      && window.MannySkills?.dimensionTransferVisible?.(battle) !== false
      && unitData.side === "enemy";
    const opheliaGuardReady = battle.opheliaGuard
      && window.GuestCharacterSkills?.guardVisible?.(battle) !== false
      && unitData.side === "ally" && unitData.ref !== "ophelia";
    return extractReady || mimicReady || speedReady || transferReady || opheliaGuardReady;
  }

  return { prepareTargetReady, targetAllowed };
})();
