window.GuardKellySkills = (() => {
  const black = card => card?.suit === "♠" || card?.suit === "♣";
  const red = card => card?.suit === "♥" || card?.suit === "♦";
  const isKelly = unit => unit?.ai === "guard_kelly";
  const stat = (unit, key) => (unit?.stats?.[key] || 0) + (key === "magic" ? (unit.tempMagic || 0) : key === "attack" ? (unit.tempAttack || 0) : 0);
  const singleKill = card => window.CardUtils?.isSingleKill?.(card);
  const reserveCards = (hand, ctx) => {
    const reserved = new Set();
    [black, red].forEach(matches => {
      const cards = hand.filter(matches);
      const card = ctx.topBy(cards, item => -ctx.keepValue(item));
      if (card) reserved.add(card);
    });
    return reserved;
  };

  function afterCardPlayed(state, actor, card) {
    if (card?._repeat) return;
    if (isKelly(actor) && card?._countAsPlayed) actor.kellyCardsUsed = (actor.kellyCardsUsed || 0) + 1;
    if (!card?._playedFromHand || card?._skill || card?.type !== "tactic" || !window.RelicSystem?.hasEquipped?.(state, actor, "精灵女神守护之盾")) return;
    actor.block = (actor.block || 0) + 1;
    window.BattleSystem?.pushFloat?.(state.battle, actor.uid, "armor-gain", 1);
    window.BattleLog.add(state, `${actor.name} 的精灵女神守护之盾触发，获得1点护甲。`);
  }

  function afterDamage(state, actor, target, card, hpLoss, cardUser = actor) {
    if (hpLoss > 0 && singleKill(card) && !card?._skipUseKillTriggers && window.RelicSystem?.hasEquipped?.(state, cardUser, "精灵女神守护之剑")) {
      cardUser.block = (cardUser.block || 0) + hpLoss;
      window.BattleSystem?.pushFloat?.(state.battle, cardUser.uid, "armor-gain", hpLoss);
      window.BattleLog.add(state, `${cardUser.name} 的精灵女神守护之剑触发，获得${hpLoss}点护甲。`);
    }
    if (hpLoss <= 0 || !target || target.hp <= 0 || !state.battle) return;
    const team = target.side === "enemy" ? state.battle.enemies : state.battle.allies;
    team.filter(unit => isKelly(unit) && unit.uid !== target.uid && unit.hp > 0).forEach(kelly => {
      const armor = stat(kelly, "magic");
      target.block = (target.block || 0) + armor;
      window.BattleSystem?.pushFloat?.(state.battle, target.uid, "armor-gain", armor);
      window.BattleLines?.skill(state, kelly, "精灵守护", target);
      window.BattleLog.add(state, `${kelly.name} 触发精灵守护，${target.name}获得${armor}点护甲。`);
    });
  }

  function endTurn(state, unit, draw) {
    if (!isKelly(unit) || unit.hp <= 0) return;
    const count = unit.kellyCardsUsed || 0;
    markFaceDown(state, unit);
    const drawn = count > 0 ? draw?.(unit, count, state.battle) : [];
    window.BattleLines?.skill(state, unit, "坚守阵地");
    window.BattleLog.add(state, `${unit.name} 发动坚守阵地并翻面，${window.BattleDrawFeedback.action(unit, count, drawn)}。`);
  }

  function markFaceDown(state, unit) {
    if (!unit || unit.hp <= 0) return false;
    const wasFaceDown = !!unit.faceDown;
    unit.faceDown = true;
    if (!wasFaceDown) unit.faceDownAnimationUntil = Date.now() + 350;
    unit.statuses ||= [];
    if (!unit.statuses.includes("翻面")) unit.statuses.push("翻面");
    window.BattleLog.add(state, `${unit.name}翻面，将跳过下一个完整回合。`);
    return true;
  }

  function consumeFaceDown(state, unit) {
    if (!unit?.faceDown) return false;
    unit.faceDown = false;
    delete unit.faceDownAnimationUntil;
    unit.faceUpAnimationUntil = Date.now() + 350;
    unit.statuses = (unit.statuses || []).filter(status => status !== "翻面");
    window.BattleLog.add(state, `${unit.name}翻回正面，并跳过本回合。`);
    return true;
  }

  function canCounterTacticCard(unit, card) { return isKelly(unit) && black(card); }
  function canFeintCard(unit, card) { return isKelly(unit) && red(card); }
  function responseCard(unit, card, name) { return isKelly(unit) && card?.name !== name ? { ...card, name, type: "response", convertedFrom: card.name, _entitySourceCard: card } : card; }

  function afterHit(state, actor, target, card) {
    if (!card?.armoredRam || card._armoredRamFlipped || (actor.block || 0) <= 0 || target.hp <= 0) return;
    card._armoredRamFlipped = true;
    markFaceDown(state, target);
    window.BattleLog.add(state, `${actor.name} 的撞杀命中时仍有护甲，令${target.name}翻面。`);
  }

  function aiMove(state, actor, team, foes, hand, canPlay, ctx) {
    if (!isKelly(actor)) return null;
    const playable = hand.filter(card => canPlay(actor, card)), reserved = reserveCards(playable, ctx);
    const available = playable.filter(card => !reserved.has(card)), pool = available.length ? available : playable;
    const slashes = pool.filter(card => window.CardUtils?.isKillCard?.(card));
    const charge = pool.find(card => card.charge);
    if (charge && slashes.length) return { card: charge, target: actor };
    const target = ctx.slashTarget(actor, foes, slashes);
    const slash = target && ctx.topBy(slashes, card => ctx.slashScore(actor, card, target));
    return slash ? { card: slash, target } : null;
  }
  function aiHand(actor, hand, ctx) {
    if (!isKelly(actor)) return hand;
    const reserved = reserveCards(hand, ctx), available = hand.filter(card => !reserved.has(card));
    return available.length ? available : hand;
  }

  return { afterCardPlayed, afterDamage, endTurn, markFaceDown, consumeFaceDown, canCounterTacticCard, canFeintCard, responseCard, afterHit, aiMove, aiHand };
})();
