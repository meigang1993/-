window.BattleAISlashPlanner = (() => {
  const {
    alive, isKill, stat, hpPct, visible, handLimit, hasDodge,
    singleKill, targetByPolicy, marked, topBy, weakest, hasRelic, heroic,
  } = window.BattleAIHelpers;

  function bestSlash(actor, hand, target) {
    const slashes = hand.filter(isKill);
    const score = card => slashScore(actor, card, target);
    if (actor.ai === "demon_beast_unit" && actor.beastReloadSuit) {
      return topBy(slashes.filter(card => card.suit === actor.beastReloadSuit), score)
        || topBy(slashes, score);
    }
    if (actor.ai === "shark_pirate_submarine") {
      return topBy(slashes.filter(card => card.suit === "♠" || card.suit === "♣"), score)
        || topBy(slashes, score);
    }
    return topBy(slashes, score);
  }

  function slashScore(actor, source, target) {
    const card = window.CardUtils?.battleView?.(window.state, actor, source) || source;
    const white = hasRelic(actor, "艾尔拉娜白色丝袜") ? stat(actor, "speed") : 0;
    const statKey = window.CardUtils?.damageStatKey?.(actor, card)
      || (card.scale === "magic" ? "magic" : "attack");
    const base = stat(actor, statKey) + white;
    const damage = base
      * (card.fixedRepeats || 1)
      * (card.holy && target?.holyScar ? 2 : 1)
      * (hasRelic(actor, "名刀鬼切") && hpPct(target || {}) < .3 ? 2 : 1);
    const suitBonus = target?.lockSuit === card.suit ? 100 : 0;
    const armorBonus = (target?.block || 0) > 0
      && (card.ignoreBlock || card.assassinate || actor.mannyWeapon === "cannon")
      ? 18 : 0;
    const relicBonus = heroic(actor)
      ? (hasRelic(actor, "伊迪斯电锯剑") && !card.sweep ? 18 : 0)
        + (hasRelic(actor, "格林机枪") && !actor.usedGreenGatling && !card.sweep ? 16 : 0)
        + (hasRelic(actor, "圣鹰剑") && hasDodge(actor) ? 14 : 0)
        + (actor.shockHandCannonReady && !card.sweep ? 20 : 0)
      : 0;
    const dodgeBonus = hasDodge(target)
      && (card.ignoreResponse || actor.ai === "minotaur"
        || actor.ai === "invader_chiyo" || hasRelic(actor, "圣鹰剑"))
      ? 14 : 0;
    const traitBonus = (card.poison ? 4 : 0)
      + (card.shock ? 4 + (target?.shock || 0) : 0)
      + (card.berserkKill ? 8 : 0)
      + (card.biteKill ? (hpPct(actor) < .35 ? 18 : hpPct(actor) < .8 ? 8 : 3) : 0)
      + (card.holy ? (target?.holyScar ? 12 : hpPct(target || {}) > .6 ? 7 : 4) : 0)
      + (card.rageKill && hpPct(actor) < 1 ? ((actor.intent || 0) <= 0 ? 24 : 8) : 0)
      + (card.fixedRepeats ? 3 : 0);
    return suitBonus + armorBonus + dodgeBonus + relicBonus
      + traitBonus + damage;
  }

  function slashTarget(actor, foes, hand, focusOnly = false) {
    const markedTarget = marked(foes, hand);
    if (markedTarget) return markedTarget;
    const scarred = alive(foes).filter(unit => unit.holyScar);
    if (scarred.length && hand.some(card => card.holy)) return weakest(scarred);
    const armored = alive(foes).reduce((best, unit) =>
      (unit.block || 0) > (best?.block || 0) ? unit : best, null);
    if ((armored?.block || 0) > 0 && hand.some(card =>
      isKill(card) && (card.assassinate || actor.mannyWeapon === "cannon"))) {
      return armored;
    }
    return targetByPolicy(foes, focusOnly);
  }

  function edisSetupMove(ctx, actor, team, foes, hand, ensureSlash) {
    if (actor.ai !== "pursuer_edis" || (actor.intent || 0) < 1) return null;
    const hasSlashPlan = hand.some(singleKill) || hand.some(card => card.charge);
    if (!hasSlashPlan) return null;
    const setupCards = hand.filter(card =>
      card.drawCards || card.drawTeam || card.stealCard || card.soulChain);
    return window.BattleAITactics.tacticMove(
      ctx, actor, team, foes, setupCards, ensureSlash, 1);
  }

  function edisSlashMove(actor, foes, hand) {
    if (actor.ai !== "pursuer_edis" || (actor.intent || 0) < 1) return null;
    const slashes = hand.filter(singleKill);
    const target = slashTarget(actor, foes, slashes);
    const card = topBy(slashes, item => slashScore(actor, item, target));
    if (!card || !target) return null;
    const charge = !actor.charge && hand.find(item => item.charge);
    if (charge) return { card: charge, target: actor };
    if (!actor.charge && visible(actor) <= handLimit(actor)
      && !hasRelic(actor, "伊迪斯电锯剑")) return null;
    return { card, target };
  }

  function monaSlashMove(actor, foes, hand) {
    if (actor.ai !== "mona_eagle_captain" || (actor.intent || 0) < 1) return null;
    const slashes = hand.filter(singleKill);
    const target = slashTarget(actor, foes, slashes);
    const card = topBy(slashes, item => slashScore(actor, item, target));
    return card && target ? { card, target } : null;
  }

  return {
    bestSlash,
    slashScore,
    slashTarget,
    edisSetupMove,
    edisSlashMove,
    monaSlashMove,
  };
})();
