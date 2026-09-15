window.LocalCoreDungeonOps = (() => {
  const { n, uniq, sample, outcomes, addResource, assertInventoryCapacity } = window.LocalCoreUtils;
  const economy = window.GameEconomy;
  function char(core, id) { return core.chars.find(c => c.id === id); }
  function startDungeon(core, args) {
    const missionId = String(args.missionId || "machine_factory"), difficultyId = String(args.difficultyId || "normal");
    const mission = GameData.missions?.find(m => m.id === missionId);
    if (!mission || mission.kind !== "dungeon" || !GameData.difficulties?.[difficultyId] || !core.unlockedDifficulties.includes(difficultyId)) return outcomes.rejected;
    if (mission.requiresFlag && !core.flags?.[mission.requiresFlag]) return outcomes.rejected;
    core.pendingRun = { gold: 0, essence: 0, cards: [], relics: [] };
    const runId = String(args.runId || "");
    core.localRunState = runId ? { version: 1, key: runId, rewards: {} } : { rewards: {} };
    return outcomes.changed;
  }
  function rollGold(core, run, kind) {
    const diff = GameData.difficulties[run.difficultyId] || GameData.difficulties.normal;
    const mission = GameData.missions.find(m => m.id === run.missionId), multiplier = mission?.reward?.goldMultiplier || 1;
    const configured = economy.dungeonGold[kind] || 0;
    const base = Array.isArray(configured) ? window.GameRandom.int(configured[0], configured[1], core) : configured;
    return Math.round(base * (diff.reward || 1) * multiplier);
  }
  function progressionParty(run) {
    const active = uniq(run.activeParty).slice(0, 4);
    const party = uniq(run.party).slice(0, 4);
    if (!party.length) return active;
    const allowed = new Set(party);
    return active.filter(id => allowed.has(id));
  }
  function settleDungeon(core, args) {
    const run = args.run || {}, nodeId = String(args.nodeId || run.pending || ""), node = (run.layers || []).flat().find(item => item.id === nodeId);
    if (!node || (args.kind && args.kind !== node.type)) return outcomes.rejected;
    const diff = GameData.difficulties[run.difficultyId] || GameData.difficulties.normal;
    const receiptId = rewardReceiptId(run, nodeId);
    if (!receiptId) return outcomes.rejected;
    const ledger = rewardLedger(core, run, receiptId);
    if (!ledger) return outcomes.rejected;
    const previous = ledger.rewards[receiptId];
    if (previous) { core.lastLocalReward = previous; return outcomes.reconciled; }
    if (node.done) return outcomes.rejected;
    const kind = node.type, defeated = uniq(args.defeatedEnemyIds);
    const enemyIds = (node.enemies || []).map(enemy => enemy.id).filter(Boolean);
    if (["normal", "elite", "boss"].includes(kind) && (!enemyIds.every(id => defeated.includes(id)) || defeated.some(id => !enemyIds.includes(id)))) return outcomes.rejected;
    const gold = rollGold(core, run, kind), essence = ["elite", "boss"].includes(kind) ? 1 : 0;
    const experience = window.CharacterProgression.rewardFor(kind, diff, run.missionId);
    const progression = progressionParty(run).map(id => {
      const character = char(core, id);
      const template = GameData.characters?.find(item => item.id === id);
      return character && template && !character.locked
        ? window.CharacterProgression.grant(character, experience, template) : null;
    }).filter(Boolean);
    const rare = rareReward(core, run, kind, defeated);
    core.pendingRun ||= { gold: 0, essence: 0, cards: [], relics: [] };
    core.pendingRun.gold = addResource(core.pendingRun.gold, gold);
    core.pendingRun.essence = addResource(core.pendingRun.essence, essence);
    core.pendingRun.cards = [...(core.pendingRun.cards || []), ...rare.cards];
    core.pendingRun.relics = [...(core.pendingRun.relics || []), ...rare.relics];
    defeated.forEach(id => {
      if (!core.defeatedElites.includes(id) && GameData.eliteUnlocks?.[id]) {
        core.defeatedElites.push(id);
        core.unlockedShopCards = uniq([...core.unlockedShopCards, ...GameData.eliteUnlocks[id]]);
      }
    });
    core.lastLocalReward = {
      nodeId, gold, essence, experience, progression,
      cards: rare.cards, relics: rare.relics,
    };
    ledger.rewards[receiptId] = core.lastLocalReward;
    return outcomes.changed;
  }
  function rewardReceiptId(run, nodeId) {
    const focusId = String(run.focusId || "");
    return focusId && nodeId ? `${run.missionId || ""}:${run.difficultyId || ""}:${focusId}:${nodeId}` : "";
  }
  function rewardLedger(core, run, receiptId) {
    const focusId = String(run.focusId || "");
    core.localRunState ||= { rewards: {} };
    core.localRunState.rewards ||= {};
    if (!core.localRunState.key) {
      if (core.localRunState.rewards[receiptId]) return core.localRunState;
      core.localRunState = { version: 1, key: focusId, rewards: {} };
    }
    return core.localRunState.key === focusId ? core.localRunState : null;
  }
  function bankRun(core) {
    const pending = core.pendingRun || {};
    if ((pending.relics || []).some(relic =>
      !window.RelicSystem?.isFormalId?.(relic))) return outcomes.rejected;
    const changed = core.localRunStatePresent
      || n(pending.gold) > 0
      || n(pending.essence) > 0
      || (pending.cards || []).length > 0
      || (pending.relics || []).length > 0;
    assertInventoryCapacity(core, {
      cards: pending.cards || [],
      relics: pending.relics || [],
    });
    core.resources.gold = addResource(core.resources.gold, pending.gold);
    core.resources.essence = addResource(core.resources.essence, pending.essence);
    core.relicAdditions = [...(pending.relics || [])];
    core.deckAdditions = [...(pending.cards || [])];
    core.pendingRun = { gold: 0, essence: 0, cards: [], relics: [] };
    core.localRunState = null;
    return changed ? outcomes.changed : outcomes.reconciled;
  }
  function rareReward(core, run, kind, defeated) {
    const result = { cards: [], relics: [] };
    const diff = GameData.difficulties[run.difficultyId] || GameData.difficulties.normal;
    if (!["elite", "boss"].includes(kind) || !window.GameRandom.chance(diff.dropRate ?? .2, core)) return result;
    const enemyId = defeated.find(id => GameData.eliteUnlocks?.[id]), names = GameData.eliteUnlocks?.[enemyId] || [];
    if (names.length && window.GameRandom.chance(.5, core)) {
      const card = sample((GameData.eliteCards || []).filter(item => names.includes(item.name)), core);
      if (card) result.cards.push({ ...card });
    } else {
      const relic = window.RelicSystem?.randomElite?.(enemyId, new Set(core.resources.relics || []), core);
      if (relic) result.relics.push(relic);
    }
    return result;
  }
  function settleDefeat(core, args) {
    const defeatId = String(args?.defeatId || "");
    if (!defeatId) return outcomes.rejected;
    const receipt = window.ReceiptLedger.claim(core.defeatLedger, defeatId, "defeat");
    if (receipt.status === "duplicate") { core.lastDefeatId = defeatId; return outcomes.reconciled; }
    if (receipt.status !== "granted") {
      const error = new Error("失败结算收据账本已满");
      error.code = "RECEIPT_LEDGER_FULL";
      throw error;
    }
    core.defeatLedger = receipt.ledger;
    core.pendingRun = { gold: 0, essence: 0, cards: [], relics: [] };
    core.localRunState = null;
    core.flags.defeatCount = n(core.flags.defeatCount) + 1;
    if (!core.flags.firstDefeatSeen) {
      core.flags.firstDefeatSeen = true;
      const c = char(core, "loki");
      if (c) c.locked = false;
    } else if (!core.flags.secondDefeatSeen && core.flags.defeatCount >= 2) {
      core.flags.secondDefeatSeen = true;
      const c = char(core, "carlos");
      if (c) c.locked = false;
    }
    core.lastDefeatId = defeatId;
    return outcomes.changed;
  }
  return { startDungeon, settleDungeon, bankRun, settleDefeat };
})();
