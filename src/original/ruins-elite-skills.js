window.RuinsEliteSkills = (() => {
  const alive = units => (units || []).filter(unit => unit.hp > 0);
  const visible = unit => (unit?.hand || []).filter(card => !card._pendingDraw);
  const black = card => card?.suit === "♠" || card?.suit === "♣";
  const isSlash = card => window.CardUtils?.isKillCard?.(card) || card?.type === "slash";
  const singleKill = card => window.CardUtils?.isSingleKill?.(card) || (isSlash(card) && !card?.sweep && !card?.allTargets);
  const stat = (unit, key) => (unit.stats?.[key] || 0)
    + (key === "attack" ? unit.tempAttack || 0 : 0);
  const log = (state, text) => window.BattleLog?.add?.(state, text);

  // 暗幕隐身（锁定技）：有黑色牌时不会成为单体【杀】牌的目标。
  // 实时判定而非回合制缓存：缓存只在她自己准备阶段刷新，我方回合会读到
  // 上回合的过期值，锁定技便时灵时不灵。
  const stealthOn = unit => unit?.ai === "ruins_hilde"
    && visible(unit).some(black);
  const blocksKillTarget = (unit, card) => !!card && !card._skill
    && stealthOn(unit) && singleKill(card);

  function prepare(state, unit, damage) {
    if (!unit) return;
    if (unit.ai === "ruins_hilde") shadowDance(state, unit);
    if (unit.ai === "ruins_carrier") reinforce(state, unit);
  }

  // 影舞步：连续判定直到出现红色牌为止，不再限张数（原实现硬编码上限 6 张）。
  // 判定过的牌先暂存、循环结束再统一进弃牌堆——原写法每判定一张就推进弃牌堆，
  // 洗牌堆会把它重新洗回牌堆，全黑牌库时会无限循环卡死浏览器。
  function shadowDance(state, unit) {
    const judged = [];
    // 兜底上限：牌堆+弃牌堆张数有限，每轮永久消耗一张，理论上必然终止；
    // 留一道硬上限只为防病态数据（如洗牌回调被改动）导致死循环。
    const cap = ((unit.deck?.length || 0) + (unit.discard?.length || 0)) * 2 + 8;
    let drawn = 0;
    while (judged.length <= cap) {
      window.BattlePileStats?.reshuffle(unit);
      const card = unit.deck?.pop();
      if (!card) break;
      if (!card._pendingDraw) judged.push(card);
      state.battle?.animQueue?.push({
        type: "judgement", id: window.GameRandom?.id?.("hd") || "hd",
        skill: "影舞步", suit: card.suit, name: card.name, card,
        discardTo: unit.discard, success: black(card),
        color: black(card) ? "black" : "red", uid: unit.uid,
      });
      if (!black(card)) {
        log(state, `${unit.name} 影舞步判定：${card.suit}${card.name}，停止。`);
        break;
      }
      const gain = window.CardUtils?.copyPlayable?.(card,
        { temporary: true, void: true, noIntentCost: true, generatedBySkill: "影舞步" });
      if (gain) { if (state.battle?.animQueue) gain._pendingDraw = true; unit.hand.push(gain); drawn += 1; }
      log(state, `${unit.name} 影舞步判定：${card.suit}${card.name}，获得该黑色判定牌。`);
    }
    judged.forEach(card => unit.discard.push(card));
    if (drawn) {
      state.battle?.animQueue?.push({ type: "gainCards", uid: unit.uid, side: unit.side, count: drawn, cards: unit.hand.slice(-drawn) });
      window.BattleLines?.skill?.(state, unit, "影舞步");
    }
  }

  function reinforce(state, unit) {
    const dead = (state.battle.enemies || []).filter(enemy => enemy.hp <= 0 && enemy !== unit);
    if (!dead.length) return;
    dead.forEach(enemy => { enemy.hp = Math.max(1, Math.ceil((enemy.maxHp || 1) * 0.4)); });
    const loss = dead.length * Math.ceil((unit.maxHp || 1) * 0.1);
    const before = unit.hp;
    unit.hp = Math.max(0, unit.hp - loss);
    const lost = before - unit.hp;
    if (lost > 0) window.BattleSystem?.pushFloat?.(state.battle, unit.uid, "hp-loss", lost);
    window.BattleLines?.skill?.(state, unit, "增援部队");
    log(state, `${unit.name} 发动增援部队，复活${dead.length}名友军，损失${lost}点生命。`);
  }

  // 潜影背刺：结束阶段发动（描述即为「结束阶段」）。
  // 此前挂在出牌阶段的 aiMove 上，与描述不符；且出牌阶段不限次会反复触发，
  // 故旧实现加了「每回合一次」守卫。结束阶段本身每回合只跑一次
  // （battle-end-phase 用 endPhaseStep 保证步骤不重入），限次由阶段天然保证，
  // 不再需要 usedRuinsBackstab 标记。
  function backstabEndPhase(state, unit, damage) {
    if (unit?.ai !== "ruins_hilde" || unit.hp <= 0) return false;
    // 每回合一次：以 battle.turn 为键（与 abe-mike 的 abeMikeDanceTurn 同一范式），
    // 不依赖准备阶段清零，避免准备阶段被跳过时永久失效。
    if (unit.ruinsBackstabTurn === state?.battle?.turn) return false;
    if (!visible(unit).some(black)) return false;
    unit.ruinsBackstabTurn = state?.battle?.turn;
    const targets = alive(state.battle.allies);
    const target = targets.sort((left, right) => left.hp - right.hp)[0];
    if (!target) return false;
    useBackstab(state, unit, target, damage);
    return true;
  }

  function useBackstab(state, actor, target, damage) {
    const amount = stat(actor, "attack");
    window.BattleLines?.skill?.(state, actor, "潜影背刺", target);
    damage(state, target, amount, "潜影背刺", actor,
      { name: "潜影背刺", type: "skill", ignoreResponse: true, skipDamageModify: true });
    log(state, `${actor.name} 发动潜影背刺，对${target.name}造成${amount}点物理伤害。`);
    return true;
  }

  function beforeKillTargeted(state, actor, target, card) {
    if (actor?.ai === "ruins_helicopter" && singleKill(card) && !card?._ruinsSuppressApplied) {
      card._ruinsSuppressApplied = true;
      card._tempSweep = true; card.sweep = true; card.name = "机枪扫杀";
      window.BattleLines?.skill?.(state, actor, "战场扫射", target);
      log(state, `${actor.name} 触发战场扫射，单体杀视为机枪扫杀。`);
    }
  }

  function helicopterMove(state, actor) {
    if (actor?.ai !== "ruins_helicopter" || actor.usedRuinsSweep) return null;
    const pair = sweepPair(actor);
    if (!pair) return null;
    const targets = alive(state.battle.allies);
    const target = targets[0];
    if (!target) return null;
    actor.usedRuinsSweep = true;
    pair.map(item => item.index).sort((a, b) => b - a)
      .forEach(index => actor.hand.splice(index, 1));
    pair.forEach(item => window.BattleCards?.put?.(state.battle, actor, item.card, "discard", { skipAnim: true }));
    return { card: { name: "战场扫射", _skill: true, ruinsSweep: true, sweep: true, noIntentCost: true, virtual: true }, target };
  }

  function sweepPair(actor) {
    const groups = {};
    visible(actor).forEach((card, index) => {
      if (["♥", "♦", "♠", "♣"].includes(card.suit)) {
        (groups[card.suit] ||= []).push({ card, index });
      }
    });
    return Object.values(groups).filter(list => list.length >= 2)
      .map(list => list.slice(0, 2))[0] || null;
  }

  function afterDodged(state, actor, target, card) {
    if (actor?.ai !== "ruins_helicopter") return;
    if (!isSlash(card)) return;
    actor.ruinsSuppressDraws = (actor.ruinsSuppressDraws || 0) + 1;
    window.BattlePileStats?.reshuffle(actor);
    const drawn = actor.deck?.pop();
    if (drawn) {
      if (state.battle?.animQueue) drawn._pendingDraw = true;
      actor.hand.push(drawn);
      state.battle?.animQueue?.push({ type: "gainCards", uid: actor.uid, side: actor.side, count: 1, cards: [drawn] });
      window.BattleLines?.skill?.(state, actor, "继续压制");
      log(state, `${actor.name} 的继续压制触发，摸1张牌。`);
    }
  }

  function modifyDamage(state, target, amount, card) {
    if (target?.ai === "ruins_carrier" && !card?.realDamage) return 0;
    return amount;
  }

  function carrierRamMove(state, actor) {
    if (actor?.ai !== "ruins_carrier") return null;
    const card = visible(actor).find(item => singleKill(item) && !item.virtual && !item._skill);
    if (!card) return null;
    const targets = alive(state.battle.allies);
    const target = window.GameRandom?.sample?.(targets, state) || targets[0];
    if (!target) return null;
    card.noIntentCost = true; card.ramKill = true;
    return { card, target };
  }

  function endTurn(state, unit, damage) {
    if (unit?.ai === "ruins_hilde") backstabEndPhase(state, unit, damage);
    if (unit?.ai === "ruins_helicopter") {
      unit.usedRuinsSweep = false; unit.ruinsSuppressDraws = 0;
    }
  }

  return {
    prepare, backstabEndPhase, useBackstab, beforeKillTargeted, stealthOn,
    blocksKillTarget, helicopterMove, afterDodged, modifyDamage,
    carrierRamMove, endTurn,
  };
})();
