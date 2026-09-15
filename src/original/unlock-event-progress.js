window.UnlockEventProgress = (() => {
  const VERSION = 2;
  const ids = Object.freeze([
    "first_defeat", "second_defeat", "miller", "gerlot", "cadicis", "luka",
    "little_elrana", "ace", "underwater_train", "ophelia", "besta_nursery",
    "orc_dungeon", "sonia_nursery", "chiyo_recruit", "gerda_nursery",
    "hoshino_family", "ruins_sand_city",
  ]);
  const known = new Set(ids);
  const record = value => !!value && typeof value === "object"
    && !Array.isArray(value);
  const unlocked = (state, id) =>
    !!state.chars?.find(character => character.id === id && !character.locked);
  const durableEvidence = {
    miller: state => state.flags?.millerUnlockSeen || unlocked(state, "miller"),
    gerlot: state => state.flags?.gerlotUnlockSeen || unlocked(state, "gerlot"),
    cadicis: state => state.flags?.cadicisUnlockSeen || unlocked(state, "cadicis"),
    luka: state => state.flags?.lukaUnlockSeen || unlocked(state, "luka"),
    little_elrana: state => state.flags?.littleElranaUnlockSeen
      || unlocked(state, "little_elrana"),
    ace: state => state.flags?.aceUnlockSeen || unlocked(state, "ace"),
    underwater_train: state => state.flags?.underwaterTrainUnlocked
      || state.flags?.underwaterTrainUnlockSeen || unlocked(state, "aileng"),
    ophelia: state => state.flags?.opheliaUnlockSeen || unlocked(state, "ophelia"),
    besta_nursery: state => state.flags?.bestaNurseryUnlocked || unlocked(state, "besta"),
    orc_dungeon: state => !!state.flags?.orcDungeonUnlocked,
    sonia_nursery: state => !!state.flags?.soniaNurseryUnlocked,
    chiyo_recruit: state => state.flags?.chiyoRecruitUnlockSeen
      || unlocked(state, "chiyo"),
    gerda_nursery: state => state.flags?.gerdaNurseryUnlocked || unlocked(state, "gerda"),
    hoshino_family: state => state.flags?.hoshinoFamilyUnlockSeen
      || unlocked(state, "hoshino_yi"),
    ruins_sand_city: state => !!state.flags?.ruinsSandCityUnlocked,
  };
  const legacyEvidence = {
    ...durableEvidence,
  };

  function validPersisted(value) {
    return record(value) && Number.isSafeInteger(value.version)
      && value.version >= 1 && value.version <= VERSION && record(value.completed)
      && Object.keys(value.completed).every(id =>
        known.has(id) && value.completed[id] === true);
  }

  function valid(value) {
    return validPersisted(value) && value.version === VERSION;
  }

  function normalize(state) {
    const current = state.unlockEvents;
    const persisted = validPersisted(current);
    const legacy = !persisted;
    const sourceVersion = persisted ? current.version : 0;
    const completed = persisted ? { ...current.completed } : {};
    const evidence = legacy ? legacyEvidence : durableEvidence;
    let changed = !valid(current);
    if (sourceVersion === 1) {
      state.flags ||= {};
      if (completed.first_defeat || completed.second_defeat) {
        state.flags.firstDefeatSeen = true;
        state.flags.defeatCount = Math.max(1, Number(state.flags.defeatCount) || 0);
        delete completed.first_defeat;
      }
      if (completed.second_defeat) {
        state.flags.secondDefeatSeen = true;
        state.flags.defeatCount = Math.max(2, Number(state.flags.defeatCount) || 0);
        delete completed.second_defeat;
      }
    }
    ids.forEach(id => {
      if (completed[id] || !evidence[id]?.(state)) return;
      completed[id] = true;
      changed = true;
    });
    if (completed.second_defeat && !completed.first_defeat) {
      completed.first_defeat = true;
      changed = true;
    }
    state.unlockEvents = { version: VERSION, completed };
    return changed;
  }

  function snapshot(state) {
    const holder = {
      flags: state.flags,
      chars: state.chars,
      unlockEvents: state.unlockEvents,
    };
    normalize(holder);
    return holder.unlockEvents;
  }

  function isCompleted(state, id) {
    return valid(state.unlockEvents) && state.unlockEvents.completed[id] === true;
  }

  function complete(state, id) {
    if (!known.has(id)) throw new Error(`未知剧情事件：${id}`);
    normalize(state);
    if (state.unlockEvents.completed[id]) return false;
    state.unlockEvents.completed[id] = true;
    return true;
  }

  function fresh() {
    return { version: VERSION, completed: {} };
  }

  return {
    VERSION, ids, complete, fresh, isCompleted, normalize, snapshot,
    valid, validPersisted,
  };
})();
