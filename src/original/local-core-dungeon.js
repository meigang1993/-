window.LocalCoreDungeonOps = (() => {
  const { n, outcomes, addResource, assertInventoryCapacity } = window.LocalCoreUtils;
  function char(core, id) { return core.chars.find(c => c.id === id); }
  // 节点结算与奖励发放拆分到 local-core-dungeon-settlement.js（主文件逼近 189 行硬约束）。
  // 显式抛错：子模块漏加载时立刻失败，不允许静默兜底把方法无声丢掉。
  if (!window.LocalCoreDungeonSettlement) {
    throw new Error("local-core-dungeon: 缺少子模块 LocalCoreDungeonSettlement（local-core-dungeon-settlement.js 必须先于本文件加载）");
  }
  const { settleDungeon } = window.LocalCoreDungeonSettlement;

  function startDungeon(core, args) {
    const missionId = String(args.missionId || "machine_factory"), difficultyId = String(args.difficultyId || "normal");
    const mission = GameData.missions?.find(m => m.id === missionId);
    // 难度解锁按副本独立；core 若来自旧版同步会缺 dungeonUnlocks，先迁移补齐。
    window.DungeonUnlocks?.migrate?.(core);
    const difficultyOpen = window.DungeonUnlocks
      ? window.DungeonUnlocks.has(core, missionId, difficultyId)
      : (core.unlockedDifficulties || []).includes(difficultyId);
    if (!mission || mission.kind !== "dungeon" || !GameData.difficulties?.[difficultyId] || !difficultyOpen) return outcomes.rejected;
    if (mission.devLocked) return outcomes.rejected;
    if (mission.requiresFlag && !core.flags?.[mission.requiresFlag]) return outcomes.rejected;
    core.pendingRun = { gold: 0, essence: 0, cards: [], relics: [] };
    const runId = String(args.runId || "");
    core.localRunState = runId ? { version: 1, key: runId, rewards: {} } : { rewards: {} };
    return outcomes.changed;
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
    } else if (!core.flags.thirdDefeatSeen && core.flags.defeatCount >= 3) {
      core.flags.thirdDefeatSeen = true;
    }
    core.lastDefeatId = defeatId;
    return outcomes.changed;
  }
  return { startDungeon, settleDungeon, bankRun, settleDefeat };
})();
