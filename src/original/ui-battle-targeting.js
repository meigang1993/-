window.GameUIBattleTargeting = (() => {
  const actorSide = battle => BattleSystem.active(battle)?.side || "ally";
  const hasVisibleHand = unit => (unit?.hand || []).some(card => !card._pendingDraw);
  const hasMagicBulletCard = unit => window.CardUtils.magicBulletCards(unit).length > 0;

  function targetAllowed(unitData, battle, actor, card) {
    // 无目标牌（疯狂射击、物资补给、机枪扫杀…共 42 处 targetless）不进入任何
    // 选目标分支：它们要么自动覆盖全体，要么只需再挑一张手牌。
    // 缺了这层短路，疯狂射击会落到末尾兜底 `side === "enemy"`，
    // 把敌方全员标成可选，误导玩家以为要手动点敌人。
    if (card?.targetless) return false;
    const handChoice = card?.bloodPact || card?.elranaBag
      || card?.elranaHeal || card?.idolKiss || card?.mariaHonorBlessing;
    const partnerCard = card?.comboAttack || card?.borrowSlash;
    const handInteraction = card?.discardTarget || card?.stealCard;
    const allyTarget = card?.ailengCharge || card?.kaiichiMilk
      ? unitData.side === actorSide(battle) && unitData.gender === "female"
      // 女王榨取只认我方男性：此前与其余 allyTarget 牌共用「同阵营即可」，
      // 女性队友、普雷希自己甚至敌方都会被标成可选，点了静默无反应
      // （与【狙击目标】空手牌目标同一类）。性别在此与【榨取精华】同口径。
        // 女王榨取只认我方男性：此前与其余 allyTarget 牌共用「同阵营即可」，
      // 女性队友、普雷希自己甚至敌方都会被标成可选，点了静默无反应
      // （与【狙击目标】空手牌目标同一类）。性别在此与【榨取精华】同口径。
      : card?.preshiDrain ? unitData.side === actorSide(battle)
        && unitData.gender === "male" && unitData.uid !== battle.activeUid
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
    const ailengDrill = battle.ailengDrillPicker;
    const catherineSteal = battle.catherineStealPicker;
    const tutorReady = !!battle.wendyTutorPicker?.cardName;
    const millerOwner = millerShare
      && battle.allies.find(unit => unit.uid === millerShare.unitUid);
    const millerReady = !!millerShare?.cards?.length
      && millerShare.cards.every(selected => millerOwner?.hand.includes(selected));
    let allowed;
    if (kaiichiShare) allowed = (kaiichiShare.indexes || []).length > 0
      && unitData.side === "ally" && unitData.uid !== kaiichiShare.unitUid;
    else if (gerdaComfort) allowed = unitData.side === "ally"
      && unitData.uid !== gerdaComfort.unitUid;
    else if (millerShare) allowed = millerReady
      && unitData.side === "ally" && unitData.uid !== millerShare.unitUid;
    // 战斗演练：交牌类不再弹窗，改为直接点击队友交出，故队友须标成可选。
    else if (ailengDrill) allowed = unitData.side === "ally" && unitData.hp > 0
      && unitData.uid !== ailengDrill.actorUid;
    // 解答迷惑选定牌名后同样改为点击角色交出（点自己＝加入自己手牌）。
    else if (tutorReady) allowed = unitData.side === "ally" && unitData.hp > 0;
    // 窃取：已点过敌方角色后，接收者改为直接点击我方其他角色（弹窗已删除）。
    else if (catherineSteal) allowed = unitData.side === "ally" && unitData.hp > 0
      && unitData.uid !== catherineSteal.actorUid;
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
    else if (allyTarget) allowed = !card?.excludeSelf || unitData.uid !== battle.activeUid;
    else if (card?.comboAttack) allowed = comboTarget;
    else if (card?.borrowSlash) allowed = borrowTarget;
    else if (handInteraction) allowed = unitData.hp > 0
      && unitData.uid !== battle.activeUid && hasVisibleHand(unitData);
    else if (card?.statusKey) allowed = unitData.side !== actorSide(battle)
      && unitData.hp > 0
      && !window.BattleStatusCards?.has?.(unitData, card.statusKey);
    else if (card?.magicBullet) allowed = unitData.side === "enemy"
      && hasMagicBulletCard(unitData);
    // 狙击目标要「展示其一张手牌」，无牌目标点了只能静默失败（此前可点但无反应），
    // 故在选目标阶段就排除空手牌的敌方角色，与窃取(stealCard)同一口径。
    else if (card?.artinaSniper || card?.ruinsSnipe) allowed = unitData.side === "enemy"
      && unitData.hp > 0 && hasVisibleHand(unitData);
    // 【窃取】指定敌方角色时同样要求其持有手牌：无牌目标点了会静默失败
    // （handleSpecialCard 在 visible(victim).length 为 0 时直接 return false），
    // 与狙击目标、窃取(stealCard)同一口径。
    else if (card?.catherineSteal) allowed = unitData.side === "enemy"
      && unitData.hp > 0 && hasVisibleHand(unitData);
    else allowed = comboPartnerReady && unitData.side === "enemy";
    // 女王榨取收口：allyTarget 分支只覆盖同阵营，敌方单位会落到末尾兜底
    // （side === "enemy"）而仍被标成可选，故在此统一按「我方男性且非自己」收口。
    // 女王榨取收口：allyTarget 分支只覆盖同阵营，敌方单位会落到末尾兜底
    // （side === "enemy"）而仍被标成可选，故在此统一按「我方男性且非自己」收口。
    if (card?.preshiDrain) allowed = unitData.side === actorSide(battle)
      && unitData.gender === "male" && unitData.uid !== battle.activeUid;
    // 隐身中的希尔德不可被单体【杀】指定：与逻辑层 chooseTarget 同一判定源，
    // 否则会出现「点得到但点了没反应」。
    if (allowed && window.RuinsEnemySkills?.blocksKillTarget?.(unitData, card)) allowed = false;
    return (kaiichiShare || gerdaComfort || millerShare || share || ailengDrill
      || tutorReady || catherineSteal
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
