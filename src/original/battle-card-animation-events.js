window.BattleCardAnimationEvents = (() => {
  const clean = card => window.CardUtils?.clean?.(card) || { ...card };

  function queueTurnTrailExit(battle, units = []) {
    if (!battle?.animQueue || !battle.played?.length) return;
    const pending = battle.played.filter(card => !card?._destinationSettled);
    if (!pending.length) return;
    const entries = pending.map(card => {
      const owner = units.find(unit => unit.name === card?._playedByName);
      return {
        card: clean(card),
        side: card?._destinationSide || owner?.side || "ally",
        pile: card?._destinationPile
          || (card?.type === "consume" || card?.void || card?.copiedByEdis
            ? "consumed" : "discard"),
      };
    });
    battle.animQueue.push({ type: "trailExit", entries });
  }

  return { queueTurnTrailExit };
})();
