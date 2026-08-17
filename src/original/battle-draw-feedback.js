window.BattleDrawFeedback = (() => {
  function count(requested, cards) {
    if (Array.isArray(cards)) return cards.length;
    return Math.max(0, Number(requested) || 0);
  }

  function action(unit, requested, cards) {
    const actual = count(requested, cards);
    if (actual > 0) return `摸${actual}张牌`;
    if (Math.max(0, Number(requested) || 0) === 0) return "未摸牌";
    return unit?.drawLockedThisTurn ? "因封魔无法摸牌" : "未摸到牌";
  }

  function team(entries, requested, collective) {
    if (entries.length && entries.every(entry =>
      count(requested, entry.cards) === requested)) {
      return `${collective}各摸${requested}张牌`;
    }
    if (!entries.length) return `${collective}无人摸牌`;
    return entries.map(entry =>
      `${entry.unit.name}${action(entry.unit, requested, entry.cards)}`).join("、");
  }

  return { action, count, team };
})();
