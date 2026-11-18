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
    // 神数标记：每使用一张牌 +1，攻击力与魔力各 +10%，回合结束时全部移去。
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
    const grantAtk = actor.mariaGrantAttack ?? actor.mariaGrant ?? 0;
    const grantMag = actor.mariaGrantMagic ?? actor.mariaGrant ?? 0;
    const baseAtk = Math.max(0, (actor.tempAttack || 0) - grantAtk);
    const baseMag = Math.max(0, (actor.tempMagic || 0) - grantMag);
    // 每枚标记按「当前属性」（扣回本技能自身贡献后的同一快照）+10%，线性叠加不累乘。
    // 攻/魔两份加成可能不同，分开记账；旧档只有 mariaGrant 时用 ?? 回退，避免重复叠加。
    const H = window.BattleHpValue;
    const bonusAtk = H.pctStacks(H.currentStat(actor, "attack", grantAtk), 10, actor.mariaMarks);
    const bonusMag = H.pctStacks(H.currentStat(actor, "magic", grantMag), 10, actor.mariaMarks);
    actor.tempAttack = baseAtk + bonusAtk;
    actor.tempMagic = baseMag + bonusMag;
    actor.mariaGrantAttack = bonusAtk;
    actor.mariaGrantMagic = bonusMag;
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
  if (!window.MariaHonorBlessing) throw new Error("[maria-honor-blessing] 模块未装配：maria-honor-blessing.js 必须先于 artina-maria-skills.js 加载");
  const { honorBlessing, decayBlessing } = window.MariaHonorBlessing({ line, alive });
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
  function endTurn(state, unit) {
    if (unit?.ref === "artina") {
      unit.artinaSuits = {}; unit.artinaSniperTargetUid = null;
      unit.artinaSniperSuit = null; unit.artinaChargedTargetUid = null;
    }
    if (unit?.ref === "maria") {
      unit.mariaMarks = 0; unit.mariaUseCount = 0;
      unit.mariaNext = 1; unit.mariaTier = 1;
      unit.tempAttack = 0; unit.tempMagic = 0; unit.mariaGrant = 0;
      delete unit.mariaGrantAttack; delete unit.mariaGrantMagic;
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
