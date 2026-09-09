window.StoreMigrationsUnlocks = deps => {
  const { markForSave } = deps;

  function runUnlockMigrations(state) {
    const unlocks = window.StoreUnlockMigrations;
    const before = JSON.stringify({
      unlockEvents: state.unlockEvents,
      flags: state.flags,
      chars: state.chars.map(character => ({
        id: character.id, locked: character.locked, hp: character.hp,
      })),
    });
    window.UnlockEventProgress.normalize(state);
    [
      "syncDefeatCount", "unlockFirstDefeatLoki", "unlockSecondDefeatCarlos",
      "unlockMillerAfterEvent",
      "unlockGerlotAfterEvent", "unlockCadicisAfterEvent", "unlockLukaAfterEvent",
      "unlockAceAfterEvent", "recoverPendingLittleElranaEvent", "unlockLittleElranaAfterEvent",
      "recoverPendingDefeatEvents", "unlockUnderwaterTrainAfterEvent",
      "unlockOrcDungeonAfterEvent",
      "unlockAilengAfterUnderwaterTrain", "syncBestaNurseryUnlock",
      "recoverPostUnderwaterTrainEvents", "syncNewCharacterUnlocks",
    ].forEach(name => unlocks[name](state));
    const after = JSON.stringify({
      unlockEvents: state.unlockEvents,
      flags: state.flags,
      chars: state.chars.map(character => ({
        id: character.id, locked: character.locked, hp: character.hp,
      })),
    });
    if (before !== after) markForSave(state);
  }

  return { runUnlockMigrations };
};
