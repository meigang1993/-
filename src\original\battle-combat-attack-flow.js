window.BattleCombatAttackFlow = (api, values) => {
  const {
    deps, specials, pushFloat, checkDefeat, checkEnd,
    hasNoIntentCost, triggerWhiteLolita, deferDamageTail,
  } = api;

  function resolve(state, actor, target, card) {
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
    const noCost = hasNoIntentCost(actor, card);
    const spent = noCost ? 0 : 1;
    actor.intent = Math.max(0, (actor.intent || 0) - spent);
    card.gatlingRepeats = card.gatlingRepeats || card.fixedRepeats || 1;
    state.battle.combo += card.gatlingRepeats;
    if (actor.ai === "abe_mike") {
      actor.entitySlashThisTurn = (actor.entitySlashThisTurn || 0) + 1;
    }
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
