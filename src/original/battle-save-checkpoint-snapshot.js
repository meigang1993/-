window.BattleSaveCheckpointSnapshot = deps => {
  const {
    record, sidePile, stable, validPile, validUnits,
    savedMarker, normalizeMarker, version,
  } = deps;

  function detachPiles(units) {
    units.forEach(unit => {
      delete unit.pileStats;
      delete unit.deck;
      delete unit.discard;
      delete unit.consumed;
    });
  }

  function snapshot(state, options = {}) {
    const marker = state?.battle?.resumeCheckpoint;
    if (!stable(state) || marker?.version !== version
      || marker.turn !== state.battle.turn
      || !Number.isSafeInteger(marker.sequence) || marker.sequence < 0) return null;
    const battle = options.inPlace
      ? state.battle : JSON.parse(JSON.stringify(state.battle));
    const allyPile = sidePile(battle.allies);
    const enemyPile = sidePile(battle.enemies);
    if (!allyPile || !enemyPile) return null;
    battle.checkpointPiles = { ally: allyPile, enemy: enemyPile };
    detachPiles(battle.allies);
    detachPiles(battle.enemies);
    battle.animQueue = [];
    battle.shownPlayed = [];
    delete battle.speech;
    return battle;
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
      const piles = battle.checkpointPiles;
      if (!record(piles)
        || !restorePile(battle.allies, piles.ally)
        || !restorePile(battle.enemies, piles.enemy)) return false;
      delete battle.checkpointPiles;
      return true;
    }
    return restorePile(battle.allies, battle.allies[0]?.pileStats || battle.allies[0])
      && restorePile(battle.enemies, battle.enemies[0]?.pileStats || battle.enemies[0]);
  }

  function restore(state) {
    const battle = state?.battle;
    const marker = battle?.resumeCheckpoint;
    const saved = savedMarker(battle);
    if (!saved || saved.turn !== battle.turn
      || !validUnits(battle.allies, "ally")
      || !validUnits(battle.enemies, "enemy")
      || !restorePiles(battle, marker) || !stable(state)) return false;
    battle.animQueue = [];
    battle.shownPlayed = [];
    battle.locked = false;
    battle.thinkingUid = null;
    battle.introSfxPending = false;
    battle.assetRetrying = false;
    battle.assetRetryProgress = null;
    return true;
  }

  function adoptRestored(state, turns) {
    const battle = state?.battle;
    const marker = savedMarker(battle);
    const admitted = marker?.turn === battle?.turn && stable(state);
    if (admitted) {
      battle.checkpointRevision = Math.max(
        Number(battle.checkpointRevision) || 0,
        marker.sequence,
      );
      turns?.set?.(battle, marker);
    }
    if (battle && Object.hasOwn(battle, "resumeCheckpoint")) {
      delete battle.resumeCheckpoint;
    }
    return admitted ? marker.turn : -1;
  }

  return {
    detachPiles, snapshot, restorePile, restorePiles, restore, adoptRestored,
  };
};
