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
    const protectedTarget = window.NonokaLokiSkills?.protectNonoka?.(
      state, actor, target, card, deps);
    if (protectedTarget === null) {
      window.FloraCarlosSkills?.queueSpeedAssaultSettlement?.(state, card);
      return { dodged: true, hpLoss: 0 };
    }
    target = protectedTarget || target;
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
    amount = window.WendyCadicisSkills?.modifyTacticDamage?.(
      state, effectiveActor, target, amount, effectiveCard) ?? amount;
    // 智能大脑（战术牌造成的伤害翻倍）：放在统一伤害结算链里，
    // 才能覆盖与我一战 / 魔法对决 / 魔弹特攻 / 魔王军入侵等不走攻击流程的战术牌。
    amount = window.RuinsRelicEffects?.tacticDamage?.(
      state, actor, effectiveCard, amount) ?? amount;
    amount = window.BakarSkills?.modifyOutgoingDamage?.(
      state, actor, amount, effectiveCard, effectiveActor) ?? amount;
    amount = window.BondiSkills?.modifyOutgoingDamage?.(
      state, actor, amount, effectiveCard) ?? amount;
    // 魅魔吸精术「对无性别角色造成的伤害为2倍」：需拿到被打者才能判性别，
    // 故与 BakarSkills / BondiSkills 同走 outgoing 链。
    amount = window.RuinsWithererSkills?.modifyOutgoingDamage?.(
      state, actor, target, amount, effectiveCard) ?? amount;
    if (!effectiveCard?.skipDamageModify) {
      amount = window.EnemySkills?.modifyDamage(
        state, target, amount, effectiveCard) ?? amount;
    }
    amount = window.BondiSkills?.modifyIncomingDamage?.(
      state, target, amount, effectiveCard) ?? amount;
    amount = window.BakarSkills?.modifyIncomingDamage?.(
      state, target, amount, effectiveCard) ?? amount;
    source = window.NonokaLokiSkills?.sourceLabel?.(
      state.battle, actor, source) || source;
    amount = window.RuinsCardSkills?.modifyIncomingDamage?.(
      state, target, amount, effectiveCard) ?? amount;
    // 粉色魅魔装（被动）：红色牌对该角色无效。
    amount = window.RuinsRelicEffects?.modifyIncomingDamage?.(
      state, target, amount, effectiveCard) ?? amount;
    amount = amount > 0 ? Math.max(1, Math.round(amount)) : 0;
    window.RuinsCardSkills?.beforeResponseCheck?.(state, actor, target, effectiveCard);
    // 粉色魅魔装（被动）：佩戴者使用的红色牌不可被响应。
    window.RuinsRelicEffects?.beforeResponseCheck?.(state, actor, target, effectiveCard);
    queueAttackAnim(state, actor, target, effectiveCard);
    if (deps.isKillCard(effectiveCard) && effectiveCard?.ignoreResponse) {
      window.BattleLog.add(state,
        `${target.name} 无法使用响应牌响应本次杀。`);
    }
    window.WithererSkills?.refreshShiftState?.(target);
    const responseCards = !effectiveCard?.ignoreResponse
      && needsResponse(effectiveCard)
      ? target.hand.filter(candidate => canDodge(effectiveCard, candidate))
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
    if (!response && !effectiveCard?.ignoreResponse
      && needsResponse(effectiveCard)) {
      response = window.FloraCarlosSkills?.dodgeAsFlash?.(
        state, target, actor, effectiveCard,
        { ...deps, afterCardResponded: window.NonokaLokiSkills?.afterCardResponded },
        [], candidate => canDodge(effectiveCard, candidate));
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
