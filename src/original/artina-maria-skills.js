window.ArtinaMariaSkills = (() => {
  const artinaArt = "./assets/new-portraits/artina.webp";
  const mariaArt = "./assets/new-portraits/maria.webp";
  const alive = unit => unit?.hp > 0;
  const isKill = card => window.CardUtils?.isKillCard?.(card)
    || card?.type === "slash" || /杀(?:（[^）]*）)?$/.test(card?.name || "");
  const line = (state, unit, name, target) =>
    window.BattleLines?.skill?.(state, unit, name, target);
  const allEnemies = state => (state.battle?.enemies || []).filter(alive);
  const draw = (state, unit, count, deps) => {
    const cards = deps?.draw?.(unit, count, state.battle) || [];
    if (cards.length) window.BattleLog?.add?.(
      state, `${unit.name} 摸到${cards.length}张牌。`);
    return cards;
  };
  function beforeCardPlayed(state, actor, card, deps) {
    if (!actor || !card) return;
    if (actor.ref === "artina") {
      actor.artinaSuits ||= {};
      if (!card.virtual && card.suit) actor.artinaSuits[card.suit] = true;
      if (!actor.artinaSniped) {
        const target = allEnemies(state).find(enemy => enemy.hand?.length);
        const shown = target?.hand?.find(Boolean);
        if (target && shown) {
          actor.artinaSniped = target.uid;
          actor.artinaSnipeSuit = shown.suit;
          line(state, actor, "狙击目标", target);
          window.BattleLog?.add?.(state,
            `${actor.name} 展示了${target.name}的一张${shown.name}。`);
        }
      }
    }
    if (actor.ref === "maria") {
      actor.mariaMarks ||= 0;
      actor.mariaCards ||= 0;
      actor.mariaCards += 1;
      if (actor.mariaCards === 1) actor.mariaMarks += 1;
      if (actor.mariaCards >= actor.mariaMarks) {
        const amount = actor.mariaMarks;
        actor.mariaCards = 0;
        actor.mariaMarks += 1;
        draw(state, actor, amount, deps);
        line(state, actor, "神数咒语");
      }
      actor.tempAttack = (actor.tempAttack || 0) + actor.mariaMarks;
      actor.tempMagic = (actor.tempMagic || 0) + actor.mariaMarks;
    }
  }
  function modifySlashDamage(state, actor, target, amount, card) {
    if (actor?.ref !== "artina" || !isKill(card) || card.virtual) return amount;
    if (actor.artinaSniped !== target?.uid) return amount;
    const multiplier = 2 + Object.keys(actor.artinaSuits || {}).length;
    line(state, actor, "蓄力子弹", target);
    return amount * multiplier;
  }
  function handleSpecialCard(state, actor, target, card, deps) {
    if (actor?.ref !== "maria" || card?.mariaHonorBlessing !== true
      || actor.mariaBlessingUsed) return false;
    const index = actor.hand.findIndex(item => !item._pendingDraw);
    if (index < 0) return false;
    const discarded = actor.hand.splice(index, 1)[0];
    window.BattleCards?.put?.(state.battle, actor, discarded, "discard",
      { showDiscard: true });
    actor.mariaBlessingUsed = true;
    const turns = 1;
    (state.battle.allies || []).filter(alive).forEach(unit => {
      unit.mariaBlessing = { attack: actor.stats?.attack || 0,
        magic: actor.stats?.magic || 0, speed: actor.stats?.speed || 0, turns };
    });
    draw(state, actor, 0, deps);
    line(state, actor, "荣誉祝福");
    return true;
  }
  function endTurn(_state, unit) {
    if (unit?.ref === "artina") {
      unit.artinaSuits = {};
      unit.artinaSniped = null;
      unit.artinaSnipeSuit = null;
    }
    if (unit?.ref === "maria") {
      unit.mariaMarks = 0;
      unit.mariaCards = 0;
      unit.mariaBlessingUsed = false;
      unit.tempAttack = 0;
      unit.tempMagic = 0;
    }
  }
  return {
    beforeCardPlayed, modifySlashDamage, handleSpecialCard, endTurn,
    artinaArt, mariaArt,
  };
})();
