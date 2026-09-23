window.NanaliSealed = (() => {
  function returnSealed(state) {
    const b = state.battle;
    if (!b) return;
    b.allies.forEach(u => returnUnitSealed(state, u));
    b.enemies.forEach(u => returnUnitSealed(state, u));
  }
  function returnUnitSealed(state, u) {
    const cards = u.nanaliSealed || []; if (!cards.length) return;
    cards.forEach(c => { if (state.battle.animQueue) c._pendingDraw = true; });
    u.hand.push(...cards); u.nanaliSealed = [];
    window.BattleCards?.syncStatusCards?.(u);
    state.battle.animQueue?.push({ type: "gainCards", uid: u.uid, side: u.side, fromZone: "public", count: cards.length, cards });
    window.BattleLog.add(state, `${u.name} 被魔刀阿波罗扣置的${cards.length}张牌返回手中。`);
  }
  return { returnSealed };
})();
