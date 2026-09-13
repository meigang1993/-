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
    // 只有实体手牌参与花色记录与神数计数。技能牌(_skill)、虚拟牌(virtual)一律跳过：
    // 主动技能（狙击目标 / 荣誉祝福）不记录花色，也不推进神数计数。
    if (!actor || !card || card._skill || card.virtual) return;
    if (actor.ref === "artina") {
      actor.artinaSuits ||= {};
      if (suits.includes(card.suit)) {
        // 本张牌自己新记录的花色不计入它自身的蓄力加成：
        // 设计为「下一张」实体单体杀才享受加成。
        if (!actor.artinaSuits[card.suit]) card._artinaNewSuit = card.suit;
        actor.artinaSuits[card.suit] = true;
      }
    }
    if (actor.ref !== "maria") return;
    actor.mariaMarks ||= 0;
    actor.mariaUseCount ||= 0;
    // 仅出牌阶段首张牌获得起始标记；后续每轮计数只在触发时 +1，
    // 否则标记会额外膨胀，攻击/魔力与摸牌量均高于设计。
    if (!actor.mariaPhaseMarked) {
      actor.mariaPhaseMarked = true;
      actor.mariaMarks += 1;
    } else {
      actor.mariaUseCount += 1;
      // 触发计数自取得起始标记之后开始：出第 1 张牌只得到 1 枚标记（显示×1），
      // 而非当张即凑满标记数再得 1 枚（旧行为会显示×2）。
      if (actor.mariaUseCount >= actor.mariaMarks) {
        const amount = actor.mariaMarks;
        actor.mariaUseCount = 0;
        actor.mariaMarks += 1;
        draw(state, actor, amount, deps);
        line(state, actor, "神数咒语");
      }
    }
    actor.tempAttack = actor.mariaMarks;
    actor.tempMagic = actor.mariaMarks;
  }
  function modifySlashDamage(state, actor, target, amount, card) {
    if (actor?.ref !== "artina" || !isSlash(card) || card.virtual) return amount;
    if (window.CardUtils?.isGroupTargetCard?.(card)) return amount;
    const recorded = Object.keys(actor.artinaSuits || {})
      .filter(suit => suit !== card._artinaNewSuit).length;
    const sniped = !!actor.artinaChargedTargetUid
      && target?.uid === actor.artinaChargedTargetUid;
    if (!recorded && !sniped) return amount;
    let result = amount;
    if (recorded) {
      result = amount * (1 + recorded);
      actor.artinaSuits = {};
      line(state, actor, "蓄力子弹", target);
    }
    if (sniped) {
      card.ignoreResponse = true;
      actor.artinaChargedTargetUid = null;
    }
    return result;
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
    state.battle?.animQueue?.push({
      type: "revealCards", id: window.GameRandom?.id?.("as") || "as",
      title: "狙击目标", cards: [{ ...shown }],
    });
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
    // 加成必须基于玛利亚的「基础」属性：若沿用已被上一次祝福抬高的
    // stats，连续两回合施放会把加成重复计入，全队属性无限膨胀。
    const self = actor.mariaBlessing;
    const bonus = { attack: (actor.stats?.attack || 0) - (self?.attack || 0),
      magic: (actor.stats?.magic || 0) - (self?.magic || 0),
      speed: (actor.stats?.speed || 0) - (self?.speed || 0) };
    (state.battle.allies || []).filter(alive).forEach(unit => {
      const previous = unit.mariaBlessing;
      if (previous) {
        unit.stats.attack = (unit.stats.attack || 0) - previous.attack;
        unit.stats.magic = (unit.stats.magic || 0) - previous.magic;
        unit.stats.speed = (unit.stats.speed || 0) - previous.speed;
      }
      unit.mariaBlessing = { ...bonus, turns };
      unit.stats.attack = (unit.stats.attack || 0) + bonus.attack;
      unit.stats.magic = (unit.stats.magic || 0) + bonus.magic;
      unit.stats.speed = (unit.stats.speed || 0) + bonus.speed;
    });
    actor.usedMariaHonorBlessing = true;
    line(state, actor, "荣誉祝福");
    return true;
  }
  function handleSpecialCard(state, actor, target, card, deps) {
    if (actor?.ref === "artina" && card?.artinaSniper) {
      if (actor.usedArtinaSniper) return false;
      return revealSnipe(state, actor, target);
    }
    if (actor?.ref === "maria" && card?.mariaHonorBlessing) {
      if (actor.usedMariaHonorBlessing) return false;
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
      unit.mariaPhaseMarked = false;
      unit.usedMariaHonorBlessing = false;
    }
    if (unit?.mariaBlessing) {
      unit.mariaBlessing.turns -= 1;
      if (unit.mariaBlessing.turns <= 0) {
        unit.stats.attack = (unit.stats.attack || 0) - unit.mariaBlessing.attack;
        unit.stats.magic = (unit.stats.magic || 0) - unit.mariaBlessing.magic;
        unit.stats.speed = (unit.stats.speed || 0) - unit.mariaBlessing.speed;
        delete unit.mariaBlessing;
      }
    }
  }
  return { beforeCardPlayed, modifySlashDamage, handleSpecialCard, endTurn };
})();
