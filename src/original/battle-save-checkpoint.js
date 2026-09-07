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

  const snapshot = window.BattleSaveCheckpointSnapshot({
    record, sidePile, stable, validPile, validUnits,
    savedMarker, normalizeMarker, version,
  });

  return {
    adoptRestored: snapshot.adoptRestored, baseline, canSave, mark,
    restore: snapshot.restore, noteOperation, savedMarker, savedTurn,
    snapshot: snapshot.snapshot, stable, version,
  };
})();
