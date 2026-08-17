window.BattleSaveCheckpoint = (() => {
  const version = 3;
  const supportedVersions = new Set([1, 2, version]);
  const {
    record, sidePile, stable, validPile, validUnits,
  } = window.BattleSaveCheckpointValidation;

  function savedMarker(battle) {
    const marker = battle?.resumeCheckpoint;
    if (!supportedVersions.has(marker?.version)
      || !Number.isSafeInteger(marker.turn) || marker.turn < 0) return null;
    if (marker.version >= version
      && (!Number.isSafeInteger(marker.sequence) || marker.sequence < 0)) return null;
    const sequence = marker.version >= version ? marker.sequence : 0;
    return { version: marker.version, turn: marker.turn, sequence };
  }

  function normalizeMarker(marker) {
    if (Number.isSafeInteger(marker)) {
      return { version: 1, turn: marker, sequence: 0 };
    }
    if (!marker || !Number.isSafeInteger(marker.turn)) {
      return { version, turn: -1, sequence: -1 };
    }
    return {
      version: marker.version || version,
      turn: marker.turn,
      sequence: Number.isSafeInteger(marker.sequence) ? marker.sequence : 0,
    };
  }

  function savedTurn(battle) {
    return savedMarker(battle)?.turn ?? -1;
  }

  function baseline(battle) {
    const sequence = Math.max(0, Number(battle?.checkpointRevision) || 0);
    if (battle) battle.checkpointRevision = sequence;
    return { version, turn: battle?.turn ?? 0, sequence };
  }

  function noteOperation(state) {
    const battle = state?.battle;
    if (!battle || battle.test) return -1;
    const current = Math.max(
      0,
      Number(battle.checkpointRevision) || 0,
      savedMarker(battle)?.sequence || 0,
    );
    battle.checkpointRevision = current + 1;
    return battle.checkpointRevision;
  }

  function canSave(state, lastMarker = savedMarker(state?.battle)) {
    const previous = normalizeMarker(lastMarker);
    const revision = Math.max(0, Number(state?.battle?.checkpointRevision) || 0);
    return stable(state) && (
      state.battle.turn > previous.turn
      || state.battle.turn === previous.turn && revision > previous.sequence
    );
  }

  function mark(state, lastMarker = savedMarker(state?.battle)) {
    const previous = normalizeMarker(lastMarker);
    const revision = Math.max(
      previous.sequence + 1,
      Number(state.battle.checkpointRevision) || 0,
    );
    state.battle.checkpointRevision = revision;
    const marker = {
      version,
      turn: state.battle.turn,
      sequence: revision,
    };
    state.battle.resumeCheckpoint = marker;
    return marker;
  }

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
    adoptRestored, baseline, canSave, mark, restore,
    noteOperation, savedMarker, savedTurn, snapshot, stable, version,
  };
})();
