window.BattleSaveCheckpointPiles = ({
  record, sidePile, validPile,
}) => {
  function detachPiles(units) {
    units.forEach(unit => {
      delete unit.pileStats;
      delete unit.deck;
      delete unit.discard;
      delete unit.consumed;
    });
  }

  function restorePile(units, source) {
    if (!validPile(source)) return false;
    const pile = {
      ...source,
      deck: source.deck,
      discard: source.discard,
      consumed: source.consumed,
    };
    units.forEach(unit => {
      unit.pileStats = pile;
      unit.deck = pile.deck;
      unit.discard = pile.discard;
      unit.consumed = pile.consumed;
    });
    return true;
  }

  function restorePiles(battle, marker) {
    if (marker.version >= 2) {
      const checkpointPiles = battle.checkpointPiles;
      if (!record(checkpointPiles)
        || !restorePile(battle.allies, checkpointPiles.ally)
        || !restorePile(battle.enemies, checkpointPiles.enemy)) return false;
      delete battle.checkpointPiles;
      return true;
    }
    return restorePile(battle.allies, battle.allies[0]?.pileStats || battle.allies[0])
      && restorePile(battle.enemies, battle.enemies[0]?.pileStats || battle.enemies[0]);
  }

  function snapshotPiles(battle) {
    const ally = sidePile(battle.allies);
    const enemy = sidePile(battle.enemies);
    return ally && enemy ? { ally, enemy } : null;
  }

  return { detachPiles, restorePiles, snapshotPiles };
};
