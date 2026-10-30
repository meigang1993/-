window.BattleCombatAttackFlow = (api, values) => {
  const {
    deps, specials, pushFloat, checkDefeat, checkEnd,
    hasNoIntentCost, triggerWhiteLolita, deferDamageTail,
  } = api;

  function resolve(state, actor, target, card) {
    // 每次攻击结算前无条件清空上一次护驾的转移目标与段数：
    // 原清理点在 spendIntent 内，而它仅在「非虚拟杀牌」时执行，
    // 虚拟杀/技能牌不会经过 → 残留的 redirectUid 会把后续连击剩余段
    // 指向上一次的护驾者（打错人），repeats 残留则会凭空多出追加段。
    if (state?.battle) {
      state.battle.opheliaGuardRedirectUid = null;
      state.battle.opheliaGuardRepeats = 0;
    }
    let base = values.cardPower(card);
    const attacks = deps.isKillCard(card) || base > 0;
    if (!target && !card.sweep && !card.targetless && attacks) {
      window.BattleLog.add(
        state, `${actor.name} 使用${card.name}失败：没有有效目标。`);
      return;
    }
    if (deps.isKillCard(card) && !card.virtual) spendIntent(state, actor, card);
    values.applyBerserkGrowth(state, actor, card);
    if (deps.isKillCard(card)
      && !prepareSlash(state, actor, target, card)) return;
    base = values.cardPower(card);
    const clashOk =
      card.clash ? specials.resolveClash(state, actor, target) : true;
    if (checkDefeat(state) || state.battle?.locked) return;
    if (clashOk && card.charm) window.BattleStatus?.mark(target, "魅惑");
    if (checkDefeat(state) || state.battle?.locked) return;
    if (clashOk && card.block) {
      actor.block += card.block;
      pushFloat(state.battle, actor.uid, "armor-gain", card.block);
    }
    let amount = values.attackAmount(state, actor, card, base, clashOk);
    amount = values.modifyAttackAmount(state, actor, target, card, amount);
    values.applyAttackRelics(state, actor, target, card);
    if (attacks && card.sweep) {
      specials.sweepDamage(state, actor, amount, card, unit =>
        values.slashTargetAmount(state, actor, unit, card, amount));
    } else if (attacks) {
      if (!stopped(actor)) window.EdisSkills?.copyTargetedCard?.(state, actor, target, card);
      values.hitTarget(
        state, actor, target, card,
        values.slashTargetAmount(state, actor, target, card, amount));
    }
    // 【克罗研究记录】：走攻击流程结算的战术牌（典型是带 sweep 的【枪林弹雨】）
    // 此前完全不触发额外结算 —— effects.resolve 只覆盖带专属标记的牌，
    // 没有专属标记、靠 power>0 走攻击流程的战术牌被整类漏掉。
    // locked 时由 repeatTactic 自行暂存到 battle.krowRepeatResume，交牌弹窗
    // 解决后由续跑链补跑，故这里照常调用、不提前 return。
    specials.repeatTactic(state, actor, target, card);
    if (deferDamageTail?.(state, actor, target, card)) return;
    specials.healBySyringe(state, actor, card);
    specials.resolveGreenGatling(state, actor, target, card);
    checkDefeat(state);
  }

  function spendIntent(state, actor, card) {
    const noIntent = hasNoIntentCost(actor, card);
    // 本就不消耗杀意的杀牌不应白白吃掉狂战标记：先判定免费，再尝试抵扣。
    const ragePaid = noIntent ? false
      : (!stopped(actor) && !!window.AngelicaLukaSkills?.beforeIntentCost?.(state, actor, card));
    const noCost = noIntent || ragePaid;
    const spent = noCost ? 0 : 1;
    actor.intent = Math.max(0, (actor.intent || 0) - spent);
    // 每张牌结算前清空上一张牌的护驾转移目标，避免残留影响本次攻击。
    state.battle.opheliaGuardRedirectUid = null;
    state.battle.opheliaGuardRepeats = 0;
    card.gatlingRepeats = card.gatlingRepeats || card.fixedRepeats || 1;
    state.battle.combo += card.gatlingRepeats;
    if (actor.ai === "abe_mike") {
      actor.entitySlashThisTurn = (actor.entitySlashThisTurn || 0) + 1;
    }
    if (ragePaid) return;
    window.BattleLog.add(state, noCost
      ? `${card.name}不消耗杀意。`
      : `杀意消耗${spent}点，剩余${actor.intent}。`);
  }

  // 时停取值：这里只用于「跳过钩子」，缺模块时按未时停处理（不额外改变行为）。
  const stopped = unit => !!window.MieryulaTimeStop?.isSkillDisabled?.(unit);

  function prepareSlash(state, actor, target, card) {
    if (!card._skipUseKillTriggers) actor.playedSlashThisTurn = true;
    triggerWhiteLolita?.(state, actor, target, card);
    // 出牌者侧的杀牌前置钩子（水下列车 / 兽人地下城 / 聚焦喷火器）归属 actor：
    // 被时停时不得发动。正常流程里被时停者会在回合开始被跳过、根本轮不到出牌，
    // 这里是为了防住将来任何「非本回合出牌」的入口（响应 / 反击 / 复制技能）。
    const actorStopped = stopped(actor);
    const targetStopped = stopped(target);
    // 目标侧的取消类钩子同样归属 target（邦迪【白萝莉】取消杀牌）。
    if (!targetStopped && window.BondiSkills?.cancelKillCard?.(state, target, card)) {
      if (!actorStopped) window.WithererSkills?.afterKillFailed?.(state, actor, card);
      return false;
    }
    if (!actorStopped) window.UnderwaterTrainSkills?.prepareBite?.(state, actor, card);
    if (!actorStopped && values.baseCardCanFlame(actor, card)) {
      window.BattleLines?.skill(state, actor, "聚焦喷火器");
      if (!card.sweep) card._tempSweep = true;
      if (!card.ignoreResponse) card._tempIgnoreResponse = true;
      if (!card.fire) card._tempFire = true;
      card.sweep = true;
      card.gatlingRepeats = 2;
      card.ignoreResponse = true;
      card.fire = true;
    }
    if (!actorStopped) window.OrcDungeonSkills?.prepareSlash?.(state, actor, target, card);
    if (!card.virtual) specials.prepareGreenGatling(state, actor, target, card);
    // 【战斗之勇】是角色技能（非饰品），归属 actor：被时停时不得发动
    if (!actorStopped && !card.virtual) specials.queueBattleCourage(state, actor, target, card);
    if (!actorStopped) window.UnderwaterTrainSkills?.prepareKill?.(state, actor, target, card);
    if (!actorStopped) window.GuestCharacterSkills?.prepareQueenTail?.(actor, card);
    window.BattleAttackAnimations?.ensureInitialFlight?.(
      state, actor, target, card);
    if (!actorStopped) window.BondiSkills?.beforeKillTargeted?.(state, actor, target, card);
    if (card.assassinate) specials.discardTarget(state, actor, target, card);
    if (!actorStopped) window.MannySkills?.beforeSlash(state, actor, target, card);
    if (!actorStopped) window.WendyCadicisSkills?.beforeKillTargeted?.(
      state, actor, target, card, deps);
    if (!actorStopped) window.ElranaAceNanaliSkills?.beforeKillTargeted?.(
      state, actor, target, card, deps);
    if (window.CardUtils?.isSingleTargetCard?.(card)) {
      window.EnemySkills?.beforeKillTargeted(state, actor, target, card);
    } else {
      window.EnemySkills?.beforeKillUsed?.(state, actor, card);
    }
    if (actor.hp > 0 && target.hp > 0) return true;
    checkDefeat(state);
    checkEnd(state);
    return false;
  }

  return { resolve };
};
