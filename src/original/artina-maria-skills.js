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
    actor.mariaNext ||= 1;
    // 神数标记：每使用一张牌 +1，攻击力与魔力各 +1，回合结束时全部移去。
    actor.mariaMarks += 1;
    // 使用牌「目标数」：本阶段使用的牌数达到目标数时，摸「等同于目标数」张牌，
    // 随后使用的牌数重新计数，并把目标数 +1。
    // 即：目标 1 → 用 1 张摸 1 张；目标 2 → 用 2 张摸 2 张；
    //     目标 3 → 用 3 张摸 3 张，以此类推。
    actor.mariaUseCount += 1;
    if (actor.mariaUseCount >= actor.mariaNext) {
      const amount = actor.mariaNext;
      draw(state, actor, amount, deps);
      line(state, actor, "神数咒语");
      actor.mariaNext += 1;
      actor.mariaUseCount = 0;
      // 达成目标数后神数标记清零：标记同时是攻魔加成与「使用的牌数」的来源，
      // 若保留则加成会随出牌无限累积（输出过强），且标记数会超过目标数（显示混乱）。
      actor.mariaMarks = 0;
    }
    // 神数加成以「实际贡献」记账：先扣回上次神数贡献，再加上当前贡献。
    // 若直接赋值（= mariaMarks）会抹掉热血契约等其他临时加成来源，
    // 导致这些加成在玛利亚出牌后凭空消失。
    const grant = actor.mariaGrant || 0;
    const baseAtk = Math.max(0, (actor.tempAttack || 0) - grant);
    const baseMag = Math.max(0, (actor.tempMagic || 0) - grant);
    actor.tempAttack = baseAtk + actor.mariaMarks;
    actor.tempMagic = baseMag + actor.mariaMarks;
    actor.mariaGrant = actor.mariaMarks;
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
    const suitList = discarded.map(item => item.suit);
    // 加成基于玛利亚的「当前」属性（stats + 神数咒语等临时加成），与属性面板
    // 显示的数字一致；减掉上一次祝福的 bonus 可避免连续施放重复计入、无限膨胀。
    // 速度没有临时加成，仍只取 stats。
    const self = actor.mariaBlessing;
    const curAttack = (actor.stats?.attack || 0) + (actor.tempAttack || 0);
    const curMagic = (actor.stats?.magic || 0) + (actor.tempMagic || 0);
    const bonus = { attack: curAttack - (self?.attack || 0),
      magic: curMagic - (self?.magic || 0),
      speed: (actor.stats?.speed || 0) - (self?.speed || 0) };
    (state.battle.allies || []).filter(alive).forEach(unit => {
      const previous = unit.mariaBlessing;
      if (previous) {
        unit.stats.attack = (unit.stats.attack || 0) - previous.attack;
        unit.stats.magic = (unit.stats.magic || 0) - previous.magic;
        unit.stats.speed = (unit.stats.speed || 0) - previous.speed;
      }
      unit.mariaBlessing = { ...bonus };
      // 全队（含玛利亚）都显示本次弃置的花色：每回合消失一个，
      // 花色全部消失时该角色的属性提升同步失效。
      unit.mariaBlessingSuits = suitList.slice();
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
      if (actor.usedMariaHonorBlessing || actor.mariaBlessingSuits?.length) return false;
      return honorBlessing(state, actor, { ...card, _bagIndexes: card._bagIndexes
        || state.battle.selectedBagIndexes });
    }
    return false;
  }
  // 荣誉祝福的持续由「弃置花色」决定：每回合结束全队同步消失一个花色，
  // 花色全部消失时，该角色的属性提升随之失效。
  function decayBlessing(unit) {
    if (!unit?.mariaBlessing) return;
    const suits = Array.isArray(unit.mariaBlessingSuits) ? unit.mariaBlessingSuits : [];
    suits.shift();
    unit.mariaBlessingSuits = suits;
    if (suits.length) return;
    unit.stats.attack = (unit.stats.attack || 0) - unit.mariaBlessing.attack;
    unit.stats.magic = (unit.stats.magic || 0) - unit.mariaBlessing.magic;
    unit.stats.speed = (unit.stats.speed || 0) - unit.mariaBlessing.speed;
    delete unit.mariaBlessing;
    // 保留空数组而非删除：UI 徽章与出牌校验都直接读 length，避免读到 undefined。
  }
  function endTurn(state, unit) {
    if (unit?.ref === "artina") {
      unit.artinaSuits = {}; unit.artinaSniperTargetUid = null;
      unit.artinaSniperSuit = null; unit.artinaChargedTargetUid = null;
    }
    if (unit?.ref === "maria") {
      unit.mariaMarks = 0; unit.mariaUseCount = 0;
      unit.mariaNext = 1; unit.mariaTier = 1;
      unit.tempAttack = 0; unit.tempMagic = 0; unit.mariaGrant = 0;
      unit.mariaPhaseMarked = false;
      unit.usedMariaHonorBlessing = false;
    }
    // 花色衰减由玛利亚的回合结束统一驱动，保证全队同步；
    // 若玛利亚已不在场（阵亡/离场），改由当前单位驱动，避免属性永久残留。
    const allies = state?.battle?.allies || [];
    const mariaAlive = allies.some(ally => ally.ref === "maria" && ally.hp > 0);
    if (!mariaAlive || unit?.ref === "maria") allies.forEach(decayBlessing);
  }
  return { beforeCardPlayed, modifySlashDamage, handleSpecialCard, endTurn };
})();
