window.BattleCardActiveRelicsArsenal = (deps, ctx, core) => {
  const { log, alreadyUsed, markUsed, validRelicActor, teamOf } = core;

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
        // 每张牌必须随动画事件带出：落位时按 event.cards 清除 _pendingDraw，
        // 而 _pendingDraw 会被 visible() 过滤——原实现推的是 cards:[] 的聚合事件，
        // 标记永远清不掉，牌进了手牌却看不见也用不了（表现为"发动了但没效果"）。
        // 且原事件 uid 写的是发动者，牌却在友方手里，动画指向也是错的。
        state.battle?.animQueue?.push({
          type: "gainCards", uid: unit.uid, side: unit.side,
          count: 1, cards: [found], teamArsenal: true,
        });
      }
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

  return { arsenal };
};
