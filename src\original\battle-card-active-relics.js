window.BattleCardActiveRelics = (deps, ctx) => {
  const log = (state, text) => window.BattleLog.add(state, text);
  const isRepeat = card => !!card?._repeat;
  const alreadyUsed = (actor, flag, card) => actor[flag] && !isRepeat(card);
  const markUsed = (actor, flag, card) => {
    if (!isRepeat(card)) actor[flag] = true;
  };
  const teamOf = (battle, unit) => {
    if (battle?.allies?.includes(unit)) return battle.allies;
    if (battle?.enemies?.includes(unit)) return battle.enemies;
    return null;
  };
  const validRelicActor = (state, actor, relic) => actor?.hp > 0
    && !!teamOf(state?.battle, actor)
    && !!window.RelicSystem?.hasEquipped?.(state, actor, relic);
  const livingOpponent = (battle, actor, target) => {
    const team = teamOf(battle, actor);
    const targetTeam = teamOf(battle, target);
    return target?.hp > 0 && !!team && !!targetTeam && team !== targetTeam;
  };
  const run = (first, second) => {
    const done = first();
    if (typeof second === "function" && done !== false) second();
    return true;
  };

  function demonPoker(state, actor, target, card) {
    if (!validRelicActor(state, actor, "鬼王扑克")
      || !livingOpponent(state?.battle, actor, target)
      || typeof ctx.selectedHand !== "function"
      || typeof ctx.moveHand !== "function"
      || typeof ctx.useCard !== "function"
      || alreadyUsed(actor, "usedDemonPoker", card)) return false;
    const { i, card: selected, ok } = ctx.selectedHand(state, actor);
    if (!ok || selected.type === "tactic") {
      log(state, `${actor.name} 发动鬼王扑克失败：请选择一张非战术牌和一名敌方目标。`);
      return false;
    }
    const raffleCards = new Set(["魔法对决", "魔弹特攻"]);
    const pool = (window.GameData.eliteCards || []).filter(candidate =>
      candidate.type === "tactic" && raffleCards.has(candidate.name));
    const template = window.GameRandom.sample(pool, state) || { name: "魔法对决" };
    const converted = window.CardUtils.convertAs(template.name, selected, {
      type: "tactic", originalType: selected.type, convertedTactic: true,
      _skill: true, _relicSkill: true, _skipHandMove: true,
      _playedTargetUid: target.uid, _entitySourceCard: selected,
    });
    ctx.moveHand(state, actor, i, "discard", { showDiscard: true });
    markUsed(actor, "usedDemonPoker", card);
    log(state, `${actor.name} 发动鬼王扑克，将一张手牌转化为${template.name}使用。`);
    ctx.useCard(state, actor, target, converted);
    return true;
  }

  function exchangeSelectedCards(state, actor, card) {
    if (alreadyUsed(actor, "usedAilengBet", card)) return false;
    const indexes = [...new Set(card?._bagIndexes || state.battle.selectedBagIndexes || [])]
      .filter(index => actor.hand[index] && !actor.hand[index]._pendingDraw)
      .sort((a, b) => b - a);
    if (!indexes.length) {
      log(state, `${actor.name} 发动${card.name}失败：没有选择可弃置手牌。`);
      return false;
    }
    markUsed(actor, "usedAilengBet", card);
    const cards = indexes.map(index => actor.hand.splice(index, 1)[0]);
    ctx.putMany(state, actor, cards, "discard", { showDiscard: true });
    const drawn = deps.draw(actor, indexes.length, state.battle);
    log(state, `${actor.name} 发动${card.name}，弃置${indexes.length}张手牌并${window.BattleDrawFeedback.action(actor, indexes.length, drawn)}。`);
    return true;
  }

  function succubusFork(state, actor, target, card) {
    if (!validRelicActor(state, actor, "魅魔钢叉")
      || !livingOpponent(state?.battle, actor, target)
      || alreadyUsed(actor, "usedSuccubusFork", card)) return false;
    const hearts = (actor.hand || []).filter(item =>
      item.suit === "♥" && !item._pendingDraw);
    if (!hearts.length) {
      log(state, `${actor.name} 发动魅魔钢叉失败：没有红桃手牌。`);
      return false;
    }
    if (typeof ctx.selectedHand !== "function"
      || typeof ctx.moveHand !== "function"
      || typeof ctx.useCard !== "function") return false;
    const { i, card: chosen, ok } = ctx.selectedHand(state, actor);
    if (!ok || chosen.suit !== "♥") {
      const picked = hearts[0];
      const idx = actor.hand.indexOf(picked);
      const converted = window.CardUtils.convertAs("魅杀", picked, {
        type: "slash", scale: "magic", attackType: "magic", noIntentCost: true,
        _skill: true, _relicSkill: true, _skipHandMove: true,
        _entitySourceCard: picked,
      });
      actor.hand.splice(idx, 1);
      ctx.putMany(state, actor, [picked], "discard", { showDiscard: true });
      markUsed(actor, "usedSuccubusFork", card);
      log(state, `${actor.name} 发动魅魔钢叉，将一张${picked.suit}${picked.name}当【魅杀】使用且不消耗杀意。`);
      window.BattleLines?.skill(state, actor, "魅魔钢叉", target);
      ctx.useCard(state, actor, target, converted);
      return true;
    }
    const converted = window.CardUtils.convertAs("魅杀", chosen, {
      type: "slash", scale: "magic", attackType: "magic", noIntentCost: true,
      _skill: true, _relicSkill: true, _skipHandMove: true,
      _entitySourceCard: chosen,
    });
    ctx.moveHand(state, actor, i, "discard", { showDiscard: true });
    markUsed(actor, "usedSuccubusFork", card);
    log(state, `${actor.name} 发动魅魔钢叉，将一张${chosen.suit}${chosen.name}当【魅杀】使用且不消耗杀意。`);
    window.BattleLines?.skill(state, actor, "魅魔钢叉", target);
    ctx.useCard(state, actor, target, converted);
    return true;
  }

  function assassinLatex(state, actor, target, card) {
    if (!validRelicActor(state, actor, "刺客胶衣")
      || !livingOpponent(state?.battle, actor, target)
      || alreadyUsed(actor, "usedAssassinLatex", card)) return false;
    const blacks = (actor.hand || []).filter(item =>
      (item.suit === "♠" || item.suit === "♣") && !item._pendingDraw);
    if (!blacks.length) {
      log(state, `${actor.name} 发动刺客胶衣失败：没有黑色手牌。`);
      return false;
    }
    if (typeof ctx.selectedHand !== "function"
      || typeof ctx.moveHand !== "function"
      || typeof ctx.useCard !== "function") return false;
    const { i, card: chosen, ok } = ctx.selectedHand(state, actor);
    const source = ok && (chosen.suit === "♠" || chosen.suit === "♣") ? chosen : blacks[0];
    const idx = actor.hand.indexOf(source);
    if (idx < 0) return false;
    const converted = window.CardUtils.convertAs("刺杀", source, {
      type: "slash", ignoreResponse: true, scale: "attack", noIntentCost: true,
      _skill: true, _relicSkill: true, _skipHandMove: true,
      _entitySourceCard: source,
    });
    if (ok) ctx.moveHand(state, actor, i, "discard", { showDiscard: true });
    else { actor.hand.splice(idx, 1); ctx.putMany(state, actor, [source], "discard", { showDiscard: true }); }
    markUsed(actor, "usedAssassinLatex", card);
    log(state, `${actor.name} 发动刺客胶衣，将一张${source.suit}${source.name}当【刺杀】使用且不消耗杀意。`);
    window.BattleLines?.skill(state, actor, "刺客胶衣", target);
    ctx.useCard(state, actor, target, converted);
    return true;
  }

  function arsenal(state, actor, target, card) {
    if (!validRelicActor(state, actor, "武器库")
      || alreadyUsed(actor, "usedArsenal", card)) return false;
    const team = teamOf(state.battle, actor) || ctx.sameSideUnits(state.battle, actor);
    const others = team.filter(unit => unit !== actor && unit.hp > 0);
    if (!others.length) {
      log(state, `${actor.name} 发动武器库失败：没有其他存活友方角色。`);
      return false;
    }
    markUsed(actor, "usedArsenal", card);
    let armed = 0;
    others.forEach(unit => {
      window.BattlePileStats?.reshuffle(unit);
      const found = drawKillCard(unit);
      if (found) {
        found.noIntentCost = true;
        if (state.battle?.animQueue) found._pendingDraw = true;
        unit.hand.push(found);
        armed += 1;
      }
    });
    if (armed) state.battle?.animQueue?.push({
      type: "gainCards", uid: actor.uid, side: actor.side,
      count: armed, cards: [], teamArsenal: others.map(u => ({ uid: u.uid })),
    });
    window.BattleLines?.skill(state, actor, "武器库");
    log(state, `${actor.name} 发动武器库，为${armed}名友方角色发放了【杀】牌（不消耗杀意）。`);
    return true;
  }

  function drawKillCard(unit) {
    const search = [];
    for (let i = 0; i < 20 && unit.deck.length; i += 1) {
      const card = unit.deck.shift();
      search.push(card);
      if (window.CardUtils?.isKillCard?.(card)) {
        unit.discard.push(...search.slice(0, -1));
        return card;
      }
    }
    unit.discard.push(...search);
    return null;
  }

  return {
    demonPoker, exchangeSelectedCards,
    succubusFork, assassinLatex, arsenal,
  };
};
