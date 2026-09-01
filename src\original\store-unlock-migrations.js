window.StoreUnlockMigrations = (() => {
  const recovery = window.StoreUnlockRecovery;
  const done = (state, id) => window.UnlockEventProgress.isCompleted(state, id);
  const character = (state, id) => state.chars.find(item => item.id === id);
  function unlock(state, id) {
    const target = character(state, id);
    if (!target?.locked) return;
    target.locked = false;
    target.hp = target.stats.maxHp;
  }
  function repairCharacterEvent(state, id, flag, targetId) {
    if (!done(state, id)) return;
    state.flags[flag] = true;
    unlock(state, targetId);
  }
  function syncDefeatCount(state) {
    const rawCount = Number(state.flags.defeatCount);
    const count = Number.isSafeInteger(rawCount) && rawCount > 0 ? rawCount : 0;
    const loki = character(state, "loki");
    const carlos = character(state, "carlos");
    const second = state.flags.secondDefeatSeen || done(state, "second_defeat")
      || (!!carlos && !carlos.locked) || count >= 2;
    const first = second || state.flags.firstDefeatSeen || done(state, "first_defeat")
      || (!!loki && !loki.locked) || count >= 1;
    state.flags.defeatCount = count;
    if (first) {
      state.flags.firstDefeatSeen = true;
      state.flags.defeatCount = Math.max(1, state.flags.defeatCount);
    }
    if (second) {
      state.flags.secondDefeatSeen = true;
      state.flags.defeatCount = Math.max(2, state.flags.defeatCount);
    }
  }
  function unlockFirstDefeatLoki(state) {
    repairCharacterEvent(state, "first_defeat", "firstDefeatSeen", "loki");
  }
  function unlockSecondDefeatCarlos(state) {
    repairCharacterEvent(state, "second_defeat", "secondDefeatSeen", "carlos");
  }
  function unlockMillerAfterEvent(state) {
    repairCharacterEvent(state, "miller", "millerUnlockSeen", "miller");
  }
  function unlockGerlotAfterEvent(state) {
    repairCharacterEvent(state, "gerlot", "gerlotUnlockSeen", "gerlot");
  }
  function unlockCadicisAfterEvent(state) {
    repairCharacterEvent(state, "cadicis", "cadicisUnlockSeen", "cadicis");
  }
  function unlockLukaAfterEvent(state) {
    repairCharacterEvent(state, "luka", "lukaUnlockSeen", "luka");
  }
  function unlockAceAfterEvent(state) {
    repairCharacterEvent(state, "ace", "aceUnlockSeen", "ace");
  }
  function unlockLittleElranaAfterEvent(state) {
    if (!done(state, "little_elrana")) return;
    state.flags.littleElranaUnlockSeen = true;
    delete state.flags.littleElranaUnlockPending;
    unlock(state, "little_elrana");
  }
  function unlockUnderwaterTrainAfterEvent(state) {
    if (done(state, "underwater_train")) {
      state.flags.underwaterTrainUnlocked = true;
      state.flags.underwaterTrainUnlockSeen = true;
      return;
    }
    const nanali = character(state, "nanali");
    const safeHall = state.view === "hall" && !state.battle && !state.explore;
    if (nanali && !nanali.locked && !state.hallModal && safeHall) {
      state.hallModal = "underwaterTrainUnlock";
    }
  }
  function unlockOrcDungeonAfterEvent(state) {
    if (done(state, "orc_dungeon")) {
      state.flags.orcDungeonUnlocked = true;
      state.flags.orcDungeonUnlockSeen = true;
      delete state.flags.orcDungeonUnlockPending;
      return;
    }
    if (state.flags.orcDungeonUnlockPending && state.view === "hall"
      && !state.battle && !state.explore && !state.hallModal) {
      state.hallModal = "orcDungeonUnlock";
    }
  }
  function unlockAilengAfterUnderwaterTrain(state) {
    if (!done(state, "underwater_train")) return;
    unlock(state, "aileng");
    state.flags.ailengUnlockSeen = true;
  }
  function syncBestaNurseryUnlock(state) {
    if (done(state, "ophelia")) state.flags.opheliaUnlockSeen = true;
    if (!done(state, "besta_nursery")) return;
    state.flags.bestaNurseryUnlocked = true;
    state.flags.bestaNurseryUnlockSeen = true;
    delete state.flags.bestaNurseryUnlockPending;
  }
  function syncNewCharacterUnlocks(state) {
    if (done(state, "gerda_nursery")) {
      state.flags.gerdaNurseryUnlocked = true;
      state.flags.gerdaNurseryUnlockSeen = true;
    }
    if (done(state, "hoshino_family")) {
      state.flags.hoshinoFamilyUnlockSeen = true;
      delete state.flags.hoshinoFamilyUnlockPending;
      unlock(state, "hoshino_yi");
      unlock(state, "hoshino_kaiichi");
    }
    if (state.flags?.hoshinoFamilyUnlockPending && state.view === "hall" && !state.battle && !state.explore && !state.hallModal) state.hallModal = "hoshinoFamilyUnlock";
  }
  return {
    syncDefeatCount,
    unlockFirstDefeatLoki,
    unlockSecondDefeatCarlos,
    unlockMillerAfterEvent,
    unlockGerlotAfterEvent,
    unlockCadicisAfterEvent,
    unlockLukaAfterEvent,
    unlockAceAfterEvent,
    unlockLittleElranaAfterEvent,
    unlockUnderwaterTrainAfterEvent,
    unlockOrcDungeonAfterEvent,
    unlockAilengAfterUnderwaterTrain,
    syncBestaNurseryUnlock,
    syncNewCharacterUnlocks,
    ...recovery,
  };
})();
