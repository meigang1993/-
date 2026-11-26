window.BattleDamageResolution = ({
  deps, utils, needsResponse, canDodge,
  getResponseApi, getHitWithoutDodge,
}) => {
  const { queueAttackAnim } = utils;
  if (!window.BattleWhiteLolita) throw new Error("[battle-white-lolita] 模块未装配：battle-white-lolita.js 必须先于 battle-damage-resolution.js 加载");
  if (!window.BattleDamageResolutionModifiers) throw new Error("[battle-damage-resolution-modifiers] 模块未装配：battle-damage-resolution-modifiers.js 必须先于 battle-damage-resolution.js 加载");
  const { triggerWhiteLolita } = window.BattleWhiteLolita({ deps });
  const modifiers = window.BattleDamageResolutionModifiers({ deps });

  function resolveDamage(state, target, amount, source, actor, card) {
    triggerWhiteLolita(state, actor, target, card);
    if (window.GerdaSkills?.allowKill?.(state, actor, target, card) === false) {
      queueAttackAnim(state, actor, target, card);
      window.WithererSkills?.afterKillFailed?.(state, actor, card);
      window.FloraCarlosSkills?.queueSpeedAssaultSettlement?.(state, card);
      // killInvalidated：本次【杀】根本不成立（魔偶无效 / 邦迪使杀牌失效），
      // 魔之连杀不连锁——连锁只认「这张牌指定了目标」，不认是否造成生命值伤害。
      return { dodged: false, hpLoss: 0, blockLoss: 0, killInvalidated: true };
    }
    if (window.BondiSkills?.invalidateKillCard?.(state, target, card)) {
      queueAttackAnim(state, actor, target, card);
      window.WithererSkills?.afterKillFailed?.(state, actor, card);
      window.FloraCarlosSkills?.queueSpeedAssaultSettlement?.(state, card);
      return { dodged: false, hpLoss: 0, blockLoss: 0, killInvalidated: true };
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
      return { dodged: false, hpLoss: 0, blockLoss: 0, killInvalidated: true };
    }
    window.ElranaAceNanaliSkills?.beforeKillTargeted?.(
      state, actor, target, effectiveCard, deps);
    if (effectiveCard?.virtual && !effectiveCard._countAsPlayed) {
      amount = window.ElranaAceNanaliSkills?.modifySlashDamage?.(
        state, actor, target, amount, effectiveCard) ?? amount;
    }
    // 伤害数值修正链已拆到 battle-damage-resolution-modifiers.js（加载顺序见
    // publish-bundles.json）。返回值含 effectiveActor / tsBlocked / tsInStopped，
    // 后续「不可响应」判定仍要用，故一并返回而不是只取 amount。
    const mods = modifiers.compute(
      state, target, amount, source, actor, effectiveCard);
    amount = mods.amount;
    source = mods.source;
    const { effectiveActor, tsBlocked, tsInStopped } = mods;
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
    // 响应链成闭包：跳过护驾后由 api.resumeResponse 回到这里继续自动响应
    // （曹操【护驾】「无人响应后你仍可自行使用【闪】」）。
    const continueResponse = () => {
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
      // 神速之翼：对所有"需用【闪】抵消"的牌生效（含【杀】、机枪扫杀、坦克炮弹）。
      // 双闪威胁若凑不齐 2 张响应资源，不要先转化第一张：dodgeAsFlash 会立刻把源牌
      // 移出手牌并播日志，随后 autoDodge 凑不齐第二张 → 抵消失败却白丢一张牌。
      const wingCanUse = c => !target.noResponse && canDodge(effectiveCard, c);
      const needTwoDodges = !!(effectiveCard?.krowFemaleTarget || effectiveCard?.twoDodgesRequired);
      const wingPool = (target.hand || []).filter(item => wingCanUse({ ...item, name: "闪", type: "response" })).length;
      if (!response && !(effectiveCard?.ignoreResponse || preshiNoResponse || timeStopNoResponse)
        && needsResponse(effectiveCard)
        && (!needTwoDodges || wingPool >= 2)) {
        response = window.FloraCarlosSkills?.dodgeAsFlash?.(
          state, target, actor, effectiveCard,
          { ...deps, afterCardResponded: window.NonokaLokiSkills?.afterCardResponded },
          [], wingCanUse);
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
      return getHitWithoutDodge()(
        state, actor, target, amount, source, effectiveCard);
    };
    // 护驾先于自动响应询问：有【闪】也能选让队友替出，不被自动用闪抢掉时机。
    const guarded = window.GuestCharacterSkills?.guardOphelia?.(
      state, actor, target, amount, source, effectiveCard,
      { canDodge, draw: deps.draw, hitWithoutDodge: getHitWithoutDodge(),
        resumeResponse: continueResponse });
    if (guarded) {
      window.FloraCarlosSkills?.queueSpeedAssaultSettlement?.(
        state, effectiveCard);
      return guarded;
    }
    // 挂起时必须停住，否则继续自动响应会先耗掉自己的【闪】。
    if (state.battle?.locked) return { dodged: false, hpLoss: 0 };
    return continueResponse();
  }

  return { resolveDamage, triggerWhiteLolita };
};
