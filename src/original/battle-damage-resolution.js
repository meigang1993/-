window.BattleDamageResolution = ({
  deps, utils, needsResponse, canDodge,
  getResponseApi, getHitWithoutDodge,
}) => {
  const { queueAttackAnim } = utils;

  function resolveDamage(state, target, amount, source, actor, card) {
    triggerWhiteLolita(state, actor, target, card);
    if (window.GerdaSkills?.allowKill?.(state, actor, target, card) === false) {
      queueAttackAnim(state, actor, target, card);
      window.WithererSkills?.afterKillFailed?.(state, actor, card);
      window.FloraCarlosSkills?.queueSpeedAssaultSettlement?.(state, card);
      return { dodged: false, hpLoss: 0, blockLoss: 0 };
    }
    if (window.BondiSkills?.invalidateKillCard?.(state, target, card)) {
      queueAttackAnim(state, actor, target, card);
      window.WithererSkills?.afterKillFailed?.(state, actor, card);
      window.FloraCarlosSkills?.queueSpeedAssaultSettlement?.(state, card);
      return { dodged: false, hpLoss: 0, blockLoss: 0 };
    }

    const effectiveCard = card?.krowFemaleTarget && target?.gender !== "female"
      ? {
        ...card, krowFemaleTarget: false,
        _entitySourceCard: card._entitySourceCard || card,
      }
      : card;
    if (window.BondiSkills?.invalidateKillCard?.(
      state, target, effectiveCard)) {
      queueAttackAnim(state, actor, target, effectiveCard);
      window.WithererSkills?.afterKillFailed?.(state, actor, effectiveCard);
      window.FloraCarlosSkills?.queueSpeedAssaultSettlement?.(
        state, effectiveCard);
      return { dodged: false, hpLoss: 0, blockLoss: 0 };
    }
    window.ElranaAceNanaliSkills?.beforeKillTargeted?.(
      state, actor, target, effectiveCard, deps);
    if (effectiveCard?.virtual && !effectiveCard._countAsPlayed) {
      amount = window.ElranaAceNanaliSkills?.modifySlashDamage?.(
        state, actor, target, amount, effectiveCard) ?? amount;
    }
    const effectiveActor =
      window.NonokaLokiSkills?.sourceActor?.(state.battle, actor) || actor;
    // 时停：技能归属方被标记时，其增减伤 / 免疫 / 压制类被动一律失效
    // （主动技另由 canPlay 拦截）。判据按归属方区分，避免误伤非标记方。
    const tsStopped = unit => !!window.MieryulaTimeStop?.isSkillDisabled?.(unit);
    const tsBlocked = tsStopped(actor) || tsStopped(effectiveActor);
    const tsInStopped = tsStopped(target);
    // 智能大脑（战术牌造成的伤害翻倍）：放在统一伤害结算链里，
    // 才能覆盖与我一战 / 魔法对决 / 魔弹特攻 / 魔王军入侵等不走攻击流程的战术牌。
    amount = window.RuinsRelicEffects?.tacticDamage?.(
      state, actor, effectiveCard, amount) ?? amount;
    if (!tsBlocked) amount = window.BakarSkills?.modifyOutgoingDamage?.(
      state, actor, amount, effectiveCard, effectiveActor) ?? amount;
    if (!tsBlocked) amount = window.BondiSkills?.modifyOutgoingDamage?.(
      state, actor, amount, effectiveCard) ?? amount;
    // 力量爆发：实体【杀】结算完成后累积的伤害增益，作用于安洁莉卡造成的所有伤害。
    if (!tsBlocked) amount = window.AngelicaLukaSkills?.modifyOutgoingDamage?.(
      state, effectiveActor, amount, effectiveCard) ?? amount;
    // 魅魔吸精术「对无性别角色造成的伤害为2倍」：需拿到被打者才能判性别，
    // 故与 BakarSkills / BondiSkills 同走 outgoing 链。
    amount = window.RuinsWithererSkills?.modifyOutgoingDamage?.(
      state, actor, target, amount, effectiveCard) ?? amount;
    // 女王威压：手牌为全场最多时，普雷希造成的伤害翻倍。
    if (!tsBlocked) amount = window.PreshiSkills?.modifyOutgoingDamage?.(
      state, effectiveActor, amount, effectiveCard) ?? amount;
    // 无谋霸姬：手牌中没有战术牌时，米尔尤拉的实体牌与虚拟牌伤害翻倍。
    amount = window.MieryulaSkills?.modifyOutgoingDamage?.(
      state, effectiveActor, amount, effectiveCard) ?? amount;
    if (!effectiveCard?.skipDamageModify) {
      amount = window.EnemySkills?.modifyDamage(
        state, target, amount, effectiveCard) ?? amount;
    }
    if (!tsInStopped) amount = window.BondiSkills?.modifyIncomingDamage?.(
      state, target, amount, effectiveCard) ?? amount;
    if (!tsInStopped) amount = window.BakarSkills?.modifyIncomingDamage?.(
      state, target, amount, effectiveCard) ?? amount;
    // 女王威压：手牌为全场最多时，普雷希受到的伤害同样翻倍。
    if (!tsInStopped) amount = window.PreshiSkills?.modifyIncomingDamage?.(
      state, target, amount, effectiveCard) ?? amount;
    source = window.NonokaLokiSkills?.sourceLabel?.(
      state.battle, actor, source) || source;
    if (!tsInStopped) amount = window.RuinsCardSkills?.modifyIncomingDamage?.(
      state, target, amount, effectiveCard) ?? amount;
    // 粉色魅魔装（被动）：红色牌对该角色无效。
    if (!tsInStopped) amount = window.RuinsRelicEffects?.modifyIncomingDamage?.(
      state, target, amount, effectiveCard) ?? amount;
    // 坚硬装甲：免疫判定必须放在 Math.max(1,...) 之前，否则 0 会被抬成 1。
    // 也不能只依赖 EnemySkills.modifyDamage——该调用被 skipDamageModify 短路。
    if (!tsInStopped && window.RuinsEliteSkills?.immuneIncoming?.(state, target, effectiveCard)) {
      amount = 0;
    }
    amount = amount > 0 ? Math.max(1, Math.round(amount)) : 0;
    window.RuinsCardSkills?.beforeResponseCheck?.(state, actor, target, effectiveCard);
    // 粉色魅魔装（被动）：佩戴者使用的红色牌不可被响应。
    window.RuinsRelicEffects?.beforeResponseCheck?.(state, actor, target, effectiveCard);
    // 女王威压：逐目标判定该角色是否不可响应。
    // 不写成牌上的 ignoreResponse —— 群体牌共用同一牌对象会误压手牌更多的目标，
    // 且残留标记会在弃牌堆重洗复用后永久生效。
    const preshiNoResponse = !tsBlocked && window.PreshiSkills?.suppressesResponse?.(
      state, effectiveActor, target, effectiveCard);
    // 时停标记：被时停的角色不可响应（与女王威压同一并入点）。
    const timeStopNoResponse = window.MieryulaTimeStop?.suppressesResponse?.(target)
      || window.MieryulaTimeStop?.suppressesResponse?.(effectiveActor);
    queueAttackAnim(state, actor, target, effectiveCard);
    if (deps.isKillCard(effectiveCard)
      && (effectiveCard?.ignoreResponse || preshiNoResponse || timeStopNoResponse)) {
      window.BattleLog.add(state,
        `${target.name} 无法使用响应牌响应本次杀。`);
    }
    window.WithererSkills?.refreshShiftState?.(target);
    const responseCards = !(effectiveCard?.ignoreResponse || preshiNoResponse || timeStopNoResponse)
      && needsResponse(effectiveCard)
      ? (target.noResponse ? [] : target.hand.filter(candidate => canDodge(effectiveCard, candidate)))
      : [];
    let response = !state.settings?.manualResponse
      && actor.side === "enemy" && target.side === "ally"
      ? responseCards.find(candidate => candidate.deflect) || responseCards[0]
      : responseCards[0];
    if (response
      && !window.RuinsRelicEffects?.missileLauncherBlock?.(state, actor, target, effectiveCard, responseCards, response)) {
      response = null;
    }
    if (response) {
      const api = getResponseApi();
      if (api.shouldManualDodge(
        state, actor, target, effectiveCard, response
      )) {
        api.queueManualDodge(
          state, actor, target, amount, source, effectiveCard,
          responseCards.indexOf(response),
          response.deflect && !state.settings?.manualResponse);
        return { dodged: true, hpLoss: 0 };
      }
    }
    // 神速之翼：对所有"需用【闪】抵消"的牌生效（含【杀】、机枪扫杀、
    // 坦克炮弹等带 responseKind 的牌），与技能描述一致
    if (!response && !(effectiveCard?.ignoreResponse || preshiNoResponse || timeStopNoResponse)
      && needsResponse(effectiveCard)) {
      response = window.FloraCarlosSkills?.dodgeAsFlash?.(
        state, target, actor, effectiveCard,
        { ...deps, afterCardResponded: window.NonokaLokiSkills?.afterCardResponded },
        [], candidate => !target.noResponse && canDodge(effectiveCard, candidate));
    }
    if (response && response.name !== "闪"
      && !window.RuinsRelicEffects?.missileLauncherBlock?.(state, actor, target, effectiveCard, responseCards, response)) {
      response = null;
    }
    if (response && getResponseApi().autoDodge(
      state, actor, target, amount, source, effectiveCard, response
    )) {
      window.FloraCarlosSkills?.queueSpeedAssaultSettlement?.(
        state, effectiveCard);
      return { dodged: true, hpLoss: 0 };
    }
    const guarded = window.GuestCharacterSkills?.guardOphelia?.(
      state, actor, target, amount, source, effectiveCard,
      { canDodge, draw: deps.draw, hitWithoutDodge: getHitWithoutDodge() });
    if (guarded) {
      window.FloraCarlosSkills?.queueSpeedAssaultSettlement?.(
        state, effectiveCard);
      return guarded;
    }
    if (state.battle?.locked) return { dodged: false, hpLoss: 0 };
    return getHitWithoutDodge()(
      state, actor, target, amount, source, effectiveCard);
  }

  function triggerWhiteLolita(state, actor, target, card) {
    if (!deps.isKillCard(card) || actor.side === target.side
      || !window.RelicSystem?.hasEquipped?.(
        state, target, "白色哥特洛丽塔")) return;
    const root = card._entitySourceCard || card;
    const targets =
      card._whiteLolitaTargetUids || root._whiteLolitaTargetUids || [];
    card._whiteLolitaTargetUids = targets;
    root._whiteLolitaTargetUids = targets;
    if (targets.includes(target.uid)) return;
    targets.push(target.uid);
    const drawn = deps.draw(target, 1, state.battle);
    window.BattleLog.add(state,
      `${target.name} 的白色哥特洛丽塔触发，${window.BattleDrawFeedback.action(target, 1, drawn)}。`);
  }

  return { resolveDamage, triggerWhiteLolita };
};
