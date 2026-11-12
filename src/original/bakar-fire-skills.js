window.BakarFireSkills = (() => {
  const RATE = 0.3;
  const isSlash = card => window.CardUtils?.isKillCard?.(card) || card?.type === "slash";
  const visible = unit => (unit?.hand || []).filter(card => !card._pendingDraw);
  const burningCards = unit => visible(unit).filter(card => card.burning);
  const isBakar = unit => window.BakarCoreSkills.isBakar(unit);
  const sourceAttack = source => Math.max(0,
    (Number(source?.stats?.attack) || 0) + (Number(source?.tempAttack) || 0));
  // 每张燃烧牌按施加时攻击力快照各算 30%（至少 1 点），旧牌无快照时回退到施加者当前攻击力。
  const burningDamage = (card, source) => {
    const snapshot = Number(card?.burningSourceAttack);
    const attack = Number.isFinite(snapshot) && snapshot >= 0
      ? snapshot : sourceAttack(source);
    return Math.max(1, Math.round(attack * RATE));
  };

  function beforeKillTargeted(state, actor, card) {
    if (!isBakar(actor) || !isSlash(card)) return;
    const sourceCard = card._entitySourceCard || card;
    delete sourceCard._bakarFireFistTriggered;
    if (!card.fire) card._tempFire = true;
    card.fire = true;
  }

  function addBurning(state, target, source) {
    const options = visible(target).filter(card => !card.burning);
    const picked = window.GameRandom.sample(options, state);
    if (!picked) return;
    picked.burning = true;
    picked.burningSourceUid = source?.uid || null;
    picked.burningSourceAttack = sourceAttack(source);
    window.BattleLog.add(state,
      `${target.name} 的${picked.suit || ""}${picked.name}获得燃烧属性。`);
  }

  function afterDamage(state, actor, target, card, hpLoss) {
    if (card?.burnCard) addBurning(state, target, actor);
    if (!hpLoss || !isBakar(actor) || !isSlash(card)) return;
    const sourceCard = card._entitySourceCard || card;
    if (sourceCard._bakarFireFistTriggered) return;
    sourceCard._bakarFireFistTriggered = true;
    actor.bakarPendingFireStacks = (actor.bakarPendingFireStacks || 0) + 1;
    window.BattleLines?.skill(state, actor, "炎拳", target);
    window.BattleLog.add(state,
      `${actor.name} 的炎拳积累1层，下回合起杀牌伤害倍率额外+30%。`);
    window.BakarCoreSkills.triggerTalent?.(state, actor, "炎拳");
  }

  function beginTurn(state, unit) {
    if (!isBakar(unit) || !unit.bakarPendingFireStacks) return;
    unit.bakarFireStacks = (unit.bakarFireStacks || 0) + unit.bakarPendingFireStacks;
    window.BattleLog.add(state,
      `${unit.name} 的炎拳倍率生效：杀牌伤害×${(1 + unit.bakarFireStacks * .3).toFixed(1)}。`);
    unit.bakarPendingFireStacks = 0;
  }

  function modifyOutgoingDamage(state, actor, amount, card, sourceActor = actor) {
    let result = amount;
    if (isBakar(actor) && isSlash(card) && actor.bakarFireStacks) {
      result *= 1 + actor.bakarFireStacks * .3;
    }
    return window.BakarRelicSkills.modifyOutgoingDamage(
      state, actor, result, card, sourceActor);
  }

  function modifyIncomingDamage(state, target, amount, card) {
    if (!burningCards(target).length || !card?.fire) return amount;
    window.BattleLog.add(state, `${target.name} 持有燃烧牌，受到的火属性伤害翻倍。`);
    return amount * 2;
  }

  function tickBurning(state, unit, directDamage, damage) {
    const cards = burningCards(unit);
    if (!cards.length || unit.hp <= 0) return;
    const units = state.battle.allies.concat(state.battle.enemies);
    const groups = new Map();
    cards.forEach(card => {
      const uid = card.burningSourceUid || "";
      if (!groups.has(uid)) groups.set(uid, []);
      groups.get(uid).push(card);
    });
    const amountOf = (uid, group) => {
      const source = units.find(actor => actor.uid === uid) || unit;
      return group.reduce((sum, card) => sum + burningDamage(card, source), 0);
    };
    const actions = [...groups].map(([uid, group]) => {
      const source = units.find(actor => actor.uid === uid) || unit;
      return window.BattleReactionQueue?.directDamageAction?.(
        source,
        unit,
        amountOf(uid, group),
        "燃烧",
        {
          name: "燃烧",
          type: "skill",
          fire: true,
          burningTick: true,
          skipDamageModify: true,
        },
      );
    }).filter(Boolean);
    if (actions.length && typeof damage === "function"
      && window.BattleReactionQueue?.enqueue?.(state, actions)) {
      window.BattleReactionQueue.flush(state, damage);
      return;
    }
    for (const [uid, group] of groups) {
      if (unit.hp <= 0 || state.battle.locked) break;
      const source = units.find(actor => actor.uid === uid) || unit;
      directDamage(state, unit, amountOf(uid, group), "燃烧", source, 0, {
        name: "燃烧",
        type: "skill",
        fire: true,
        burningTick: true,
        skipDamageModify: true,
      });
    }
  }

  return {
    beforeKillTargeted,
    afterDamage,
    beginTurn,
    modifyOutgoingDamage,
    modifyIncomingDamage,
    tickBurning,
  };
})();
