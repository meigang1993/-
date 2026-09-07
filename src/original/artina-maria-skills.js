window.ArtinaMariaSkills = (() => {
  const suits = ["♥", "♦", "♠", "♣"];
  const alive = unit => unit?.hp > 0;
  const visible = unit => (unit?.hand || []).filter(card => !card._pendingDraw);
  const enemies = state => (state.battle?.enemies || []).filter(alive);
  const isSlash = card => window.CardUtils?.isKillCard?.(card)
    || card?.type === "slash";
  const line = (state, unit, name, target) =>
    window.BattleLines?.skill?.(state, unit, name, target);
  const draw = (state, unit, count, deps) => {
    const cards = deps?.draw?.(unit, count, state.battle) || [];
    if (cards.length) window.BattleLog?.add?.(state,
      `${unit.name} 摸到${cards.length}张牌。`);
    return cards;
  };
  function beforeCardPlayed(state, actor, card, deps) {
    if (!actor || !card || card._skill || card.virtual) return;
    if (actor.ref === "artina") {
      actor.artinaSuits ||= {};
      if (suits.includes(card.suit)) actor.artinaSuits[card.suit] = true;
    }
    if (actor.ref !== "maria") return;
    actor.mariaMarks ||= 0;
    actor.mariaUseCount ||= 0;
    if (actor.mariaUseCount === 0) actor.mariaMarks += 1;
    actor.mariaUseCount += 1;
    if (actor.mariaUseCount >= actor.mariaMarks) {
      const amount = actor.mariaMarks;
      actor.mariaUseCount = 0;
      actor.mariaMarks += 1;
      draw(state, actor, amount, deps);
      line(state, actor, "神数咒语");
    }
    actor.tempAttack = actor.mariaMarks;
    actor.tempMagic = actor.mariaMarks;
  }
  function modifySlashDamage(state, actor, target, amount, card) {
    if (actor?.ref !== "artina" || !isSlash(card) || card.virtual
      || !actor.artinaChargedTargetUid || target?.uid !== actor.artinaChargedTargetUid) {
      return amount;
    }
    const multiplier = 2 + Object.keys(actor.artinaSuits || {}).length;
    card.ignoreResponse = true;
    actor.artinaSuits = {};
    actor.artinaChargedTargetUid = null;
    line(state, actor, "蓄力子弹", target);
    return amount * multiplier;
  }
  function revealSnipe(state, actor, target) {
    const shown = visible(target)[0];
    if (!shown) return false;
    const own = visible(actor).filter(card => card.suit === shown.suit).length;
    const foe = visible(target).filter(card => card.suit === shown.suit).length;
    actor.artinaSniperTargetUid = target.uid;
    actor.artinaSniperSuit = shown.suit;
    actor.artinaChargedTargetUid = own > foe ? target.uid : null;
    actor.usedArtinaSniper = true;
    line(state, actor, "狙击目标", target);
    window.BattleLog?.add?.(state,
      `${actor.name} 展示了${target.name}的${shown.suit}${shown.name}，双方该花色手牌为${own}/${foe}。`);
    return true;
  }
  function honorBlessing(state, actor, card) {
    const indexes = [...new Set(card?._bagIndexes || state.battle.selectedBagIndexes || [])]
      .filter(index => actor.hand[index] && !actor.hand[index]._pendingDraw)
      .sort((a, b) => b - a);
    if (!indexes.length || indexes.length > 4
      || new Set(indexes.map(index => actor.hand[index].suit)).size !== indexes.length) return false;
    const discarded = indexes.map(index => actor.hand.splice(index, 1)[0]);
    discarded.forEach(item => window.BattleCards?.put?.(
      state.battle, actor, item, "discard", { showDiscard: true }));
    const turns = discarded.length;
    (state.battle.allies || []).filter(alive).forEach(unit => {
      unit.mariaBlessing = { attack: actor.stats?.attack || 0,
        magic: actor.stats?.magic || 0, speed: actor.stats?.speed || 0, turns };
      unit.tempAttack = (unit.tempAttack || 0) + unit.mariaBlessing.attack;
      unit.tempMagic = (unit.tempMagic || 0) + unit.mariaBlessing.magic;
      unit.tempSpeed = (unit.tempSpeed || 0) + unit.mariaBlessing.speed;
    });
    actor.usedMariaHonorBlessing = true;
    line(state, actor, "荣誉祝福");
    return true;
  }
  function handleSpecialCard(state, actor, target, card, deps) {
    if (actor?.ref === "artina" && card?.artinaSniper) return revealSnipe(state, actor, target);
    if (actor?.ref === "maria" && card?.mariaHonorBlessing) {
      return honorBlessing(state, actor, { ...card, _bagIndexes: card._bagIndexes
        || state.battle.selectedBagIndexes });
    }
    return false;
  }
  function endTurn(_state, unit) {
    if (unit?.ref === "artina") {
      unit.artinaSuits = {}; unit.artinaSniperTargetUid = null;
      unit.artinaSniperSuit = null; unit.artinaChargedTargetUid = null;
    }
    if (unit?.ref === "maria") {
      unit.mariaMarks = 0; unit.mariaUseCount = 0;
      unit.usedMariaHonorBlessing = false; unit.tempAttack = 0; unit.tempMagic = 0;
    }
    if (unit?.mariaBlessing) {
      unit.mariaBlessing.turns -= 1;
      if (unit.mariaBlessing.turns <= 0) delete unit.mariaBlessing;
    }
  }
  return { beforeCardPlayed, modifySlashDamage, handleSpecialCard, endTurn };
})();
