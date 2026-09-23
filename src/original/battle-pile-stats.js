window.BattlePileStats = (() => {
  const pileOf = unit => unit?.pileStats || unit;
  function shuffle(cards) { return window.GameRandom.shuffle(cards); }
  function reshuffle(unit, shuffleFn = shuffle) {
    const pile = pileOf(unit);
    if (!pile || pile.deck?.length || !pile.discard?.length) return;
    const cards = pile.discard.splice(0), shuffled = shuffleFn(cards);
    pile.deck.splice(0, pile.deck.length, ...shuffled);
    pile.shuffleCount = (pile.shuffleCount || 0) + 1;
  }
  function revealTop(unit) {
    const pile = pileOf(unit);
    reshuffle(unit);
    const card = pile?.deck?.pop() || null;
    if (card) (pile.discard ||= []).push(card);
    return card;
  }
  function clash(actor, target) {
    const actorCard = revealTop(actor), targetCard = revealTop(target);
    const valid = card => ["♠", "♥", "♣", "♦"].includes(card?.suit);
    return { actorCard, targetCard, success: valid(actorCard) && valid(targetCard) && actorCard.suit !== targetCard.suit };
  }
  function clashSnapshot(result) {
    return {
      actorCard: result?.actorCard ? { ...result.actorCard } : null,
      targetCard: result?.targetCard ? { ...result.targetCard } : null,
    };
  }
  const uniquePiles = units => [...new Set((units || []).map(pileOf).filter(Boolean))];
  const pileCount = (piles, key) => piles.reduce((sum, p) => sum + ((p?.[key] || []).length), 0);
  const handCount = units => units.reduce((sum, u) => sum + ((u?.hand || []).length), 0);
  function side(units = []) {
    const piles = uniquePiles(units), deck = pileCount(piles, "deck"), discard = pileCount(piles, "discard"), consumed = pileCount(piles, "consumed"), hand = handCount(units);
    return { deck, discard, consumed, hand, total: deck + discard + consumed + hand, shuffles: piles.reduce((sum, p) => sum + (p?.shuffleCount || 0), 0) };
  }
  function render(label, units, sideName) {
    const s = side(units);
    return `<div class="pile-stats ${sideName}"><b>${label}牌库</b><span data-pile-zone="deck">摸牌堆 ${s.deck}</span><span data-pile-zone="discard">弃牌堆 ${s.discard}</span><span data-pile-zone="consumed">消耗牌堆 ${s.consumed}</span><span>总数 ${s.total}（含手牌 ${s.hand}）</span><span>洗牌 ${s.shuffles}</span></div>`;
  }
  return { reshuffle, revealTop, clash, clashSnapshot, side, render };
})();
