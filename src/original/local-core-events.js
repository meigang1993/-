window.LocalCoreEventOps = (() => {
  const { outcomes } = window.LocalCoreUtils;
  const knownEvents = new Set(window.UnlockEventProgress.ids);
  const character = (core, id) => core.chars.find(item => item.id === id);
  const unlocked = (core, id) => {
    const c = character(core, id);
    return !!c && !c.locked;
  };
  const canUnlock = (core, sourceId, targetId) => unlocked(core, sourceId) && !!character(core, targetId);
  function isSatisfied(core, args) {
    const id = String(args?.id || ""), flags = core.flags || {};
    const checks = {
      first_defeat: () => flags.firstDefeatSeen && unlocked(core, "loki"),
      second_defeat: () => flags.secondDefeatSeen && unlocked(core, "carlos"),
      miller: () => flags.millerUnlockSeen && unlocked(core, "miller"),
      gerlot: () => flags.gerlotUnlockSeen && unlocked(core, "gerlot"),
      cadicis: () => flags.cadicisUnlockSeen && unlocked(core, "cadicis"),
      luka: () => flags.lukaUnlockSeen && unlocked(core, "luka"),
      little_elrana: () => flags.littleElranaUnlockSeen && unlocked(core, "little_elrana"),
      ace: () => flags.aceUnlockSeen && unlocked(core, "ace"),
      underwater_train: () => flags.underwaterTrainUnlocked && unlocked(core, "aileng"),
      ophelia: () => flags.opheliaUnlockSeen && unlocked(core, "ophelia"),
      besta_nursery: () => flags.bestaNurseryUnlocked,
      orc_dungeon: () => flags.orcDungeonUnlocked,
      sonia_nursery: () => flags.soniaNurseryUnlocked,
      chiyo_recruit: () => flags.chiyoRecruitUnlockSeen && unlocked(core, "chiyo"),
      gerda_nursery: () => flags.gerdaNurseryUnlocked,
      hoshino_family: () => flags.hoshinoFamilyUnlockSeen && unlocked(core, "hoshino_yi") && unlocked(core, "hoshino_kaiichi"),
    };
    return window.UnlockEventProgress.isCompleted(core, id) || !!checks[id]?.();
  }
  function unlockEvent(core, args) {
    const id = String(args?.id || "");
    const alreadySatisfied = isSatisfied(core, args);
    let changed = false;
    const setFlag = (key, value = true) => {
      if (core.flags[key] === value) return;
      core.flags[key] = value;
      changed = true;
    };
    const clearFlag = key => {
      if (!Object.hasOwn(core.flags, key)) return;
      delete core.flags[key];
      changed = true;
    };
    const unlock = charId => {
      const c = core.chars.find(item => item.id === charId);
      if (c) {
        const hp = c.stats?.maxHp || c.hp;
        if (c.locked || c.hp !== hp) changed = true;
        c.locked = false;
        c.hp = hp;
      }
    };
    if (id === "first_defeat" && core.flags.firstDefeatSeen) unlock("loki");
    else if (id === "second_defeat" && core.flags.secondDefeatSeen) unlock("carlos");
    else if (id === "miller" && canUnlock(core, "manny", "miller")) { setFlag("millerUnlockSeen"); unlock("miller"); }
    else if (id === "gerlot" && canUnlock(core, "bertis", "gerlot")) { setFlag("gerlotUnlockSeen"); unlock("gerlot"); }
    else if (id === "cadicis" && canUnlock(core, "wendy", "cadicis")) { setFlag("cadicisUnlockSeen"); unlock("cadicis"); }
    else if (id === "luka" && canUnlock(core, "angelica", "luka")) { setFlag("lukaUnlockSeen"); unlock("luka"); }
    else if (id === "little_elrana" && core.flags.littleElranaUnlockPending && character(core, "little_elrana")) { setFlag("littleElranaUnlockSeen"); clearFlag("littleElranaUnlockPending"); unlock("little_elrana"); }
    else if (id === "ace" && canUnlock(core, "elrana", "ace")) { setFlag("aceUnlockSeen"); unlock("ace"); }
    else if (id === "underwater_train" && canUnlock(core, "nanali", "aileng")) { setFlag("underwaterTrainUnlockSeen"); setFlag("underwaterTrainUnlocked"); unlock("aileng"); }
    else if (id === "ophelia" && core.flags.underwaterTrainFirstClear && character(core, "ophelia")) { setFlag("opheliaUnlockSeen"); unlock("ophelia"); }
    else if (id === "besta_nursery" && core.flags.bestaNurseryUnlockPending) { setFlag("bestaNurseryUnlockSeen"); setFlag("bestaNurseryUnlocked"); clearFlag("bestaNurseryUnlockPending"); }
    else if (id === "orc_dungeon" && core.flags.orcDungeonUnlockPending) { setFlag("orcDungeonUnlockSeen"); setFlag("orcDungeonUnlocked"); clearFlag("orcDungeonUnlockPending"); }
    else if (id === "sonia_nursery" && core.defeatedElites?.includes("xx_witherer_1124") && character(core, "sonia")) { setFlag("soniaNurseryUnlockSeen"); setFlag("soniaNurseryUnlocked"); }
    else if (id === "chiyo_recruit" && core.defeatedElites?.includes("mechanical_bull_king") && character(core, "chiyo")) { setFlag("chiyoRecruitUnlockSeen"); unlock("chiyo"); }
    else if (id === "gerda_nursery" && core.defeatedElites?.includes("demon_king_bakaar") && character(core, "gerda")) { setFlag("gerdaNurseryUnlockSeen"); setFlag("gerdaNurseryUnlocked"); }
    else if (id === "hoshino_family" && core.flags.hoshinoFamilyUnlockPending && character(core, "hoshino_yi") && character(core, "hoshino_kaiichi")) { setFlag("hoshinoFamilyUnlockSeen"); clearFlag("hoshinoFamilyUnlockPending"); unlock("hoshino_yi"); unlock("hoshino_kaiichi"); }
    else if (!knownEvents.has(id)) throw new Error("未知本地剧情解锁");
    const satisfied = isSatisfied(core, args);
    if (satisfied && window.UnlockEventProgress.complete(core, id)) changed = true;
    if (changed) return outcomes.changed;
    return alreadySatisfied || satisfied ? outcomes.accepted : outcomes.rejected;
  }
  return { unlockEvent, isSatisfied };
})();
