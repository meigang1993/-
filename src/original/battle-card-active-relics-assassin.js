window.BattleCardActiveRelicsAssassin = (deps, ctx, core) => {
  const { log, alreadyUsed, markUsed, validRelicActor, livingOpponent } = core;

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

  return { succubusFork, assassinLatex };
};
