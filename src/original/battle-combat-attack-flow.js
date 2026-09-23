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
      window.EdisSkills?.copyTargetedCard?.(state, actor, target, card);
      values.hitTarget(
        state, actor, target, card,
        values.slashTargetAmount(state, actor, target, card, amount));
    }
    if (deferDamageTail?.(state, actor, target, card)) return;
    specials.healBySyringe(state, actor, card);
    specials.resolveGreenGatling(state, actor, target, card);
    checkDefeat(state);
  }

  function spendIntent(state, actor, card) {
    window.OrcDungeonSkills?.beforeIntentCost?.(state, actor, card);
    const noIntent = hasNoIntentCost(actor, card);
    // 本就不消耗杀意的杀牌不应白白吃掉狂战标记：先判定免费，再尝试抵扣。
    const ragePaid = noIntent ? false
      : !!window.AngelicaLukaSkills?.beforeIntentCost?.(state, actor, card);
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

  function prepareSlash(state, actor, target, card) {
    if (!card._skipUseKillTriggers) actor.playedSlashThisTurn = true;
    triggerWhiteLolita?.(state, actor, target, card);
    if (window.BondiSkills?.cancelKillCard?.(state, target, card)) {
      window.WithererSkills?.afterKillFailed?.(state, actor, card);
      return false;
    }
    window.UnderwaterTrainSkills?.prepareBite?.(state, actor, card);
    if (values.baseCardCanFlame(actor, card)) {
      window.BattleLines?.skill(state, actor, "聚焦喷火器");
      if (!card.sweep) card._tempSweep = true;
      if (!card.ignoreResponse) card._tempIgnoreResponse = true;
      if (!card.fire) card._tempFire = true;
      card.sweep = true;
      card.gatlingRepeats = 2;
      card.ignoreResponse = true;
      card.fire = true;
    }
    window.OrcDungeonSkills?.prepareSlash?.(state, actor, target, card);
    if (!card.virtual) specials.prepareGreenGatling(state, actor, target, card);
    if (!card.virtual) specials.queueBattleCourage(state, actor, target, card);
    window.UnderwaterTrainSkills?.prepareKill?.(state, actor, target, card);
    window.GuestCharacterSkills?.prepareQueenTail?.(actor, card);
    window.BattleAttackAnimations?.ensureInitialFlight?.(
      state, actor, target, card);
    window.BondiSkills?.beforeKillTargeted?.(state, actor, target, card);
    if (card.assassinate) specials.discardTarget(state, actor, target, card);
    window.MannySkills?.beforeSlash(state, actor, target, card);
    window.WendyCadicisSkills?.beforeKillTargeted?.(
      state, actor, target, card, deps);
    window.ElranaAceNanaliSkills?.beforeKillTargeted?.(
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
