// 副本节点结算与奖励发放
// 从 local-core-dungeon.js 拆出：结算簇（settleDungeon + 5 个只被它使用的 helper）
// 是完整边界，主文件只保留出征 / 入库 / 失败三条入口。
// 装配点在主文件显式 throw，本文件必须先于主文件加载（见 check-split-assembly.js）。
window.LocalCoreDungeonSettlement = (() => {
  const { uniq, sample, outcomes, addResource } = window.LocalCoreUtils;
  const economy = window.GameEconomy;
  function char(core, id) { return core.chars.find(c => c.id === id); }

  function rollGold(core, run, kind) {
    const diff = GameData.difficulties[run.difficultyId] || GameData.difficulties.normal;
    const mission = GameData.missions.find(m => m.id === run.missionId), multiplier = (mission?.reward?.goldMultiplier || 100) / 100;
    const configured = economy.dungeonGold[kind] || 0;
    const base = Array.isArray(configured) ? window.GameRandom.int(configured[0], configured[1], core) : configured;
    return Math.round(base * ((diff.reward || 100) / 100) * multiplier);
  }
  function progressionParty(run, participants) {
    const active = uniq(run.activeParty).slice(0, 4);
    const party = uniq(run.party).slice(0, 4);
    const allowed = new Set(party.length ? party : active);
    let ids = active.filter(id => allowed.has(id));
    const given = uniq(participants || []);
    // 只有真正入场的角色才获得经验：首战锁定的贝丝妲魔偶不在 battle.allies 中。
    if (given.length) {
      const set = new Set(given);
      ids = ids.filter(id => set.has(id));
    }
    return ids;
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
  function rareReward(core, run, kind, defeated) {
    const result = { cards: [], relics: [] };
    const diff = GameData.difficulties[run.difficultyId] || GameData.difficulties.normal;
    if (!["elite", "boss"].includes(kind) || !window.GameRandom.chance((diff.dropRate ?? 20) / 100, core)) return result;
    const enemyId = defeated.find(id => GameData.eliteUnlocks?.[id]), names = GameData.eliteUnlocks?.[enemyId] || [];
    if (names.length && window.GameRandom.chance(.5, core)) {
      const card = sample((GameData.eliteCards || []).filter(item => names.includes(item.name)), core);
      if (card) result.cards.push({ ...card });
    } else {
      const relic = window.RelicSystem?.randomElite?.(enemyId, new Set(core.resources.relics || []), core);
      // 该敌人的饰品已全部拥有时池为空，此前直接什么都不发，玩家看到「打完精英没奖励」。
      // 回退到该敌人的卡牌掉落，保证稀有奖励位不落空（仍遵循已拥有不重复的原则）。
      if (relic) result.relics.push(relic);
      else if (names.length) {
        const card = sample((GameData.eliteCards || []).filter(item => names.includes(item.name)), core);
        if (card) result.cards.push({ ...card });
      }
    }
    return result;
  }

  function settleDungeon(core, args) {
    const run = args.run || {}, nodeId = String(args.nodeId || run.pending || ""), node = (run.layers || []).flat().find(item => item.id === nodeId), mission = GameData.missions.find(m => m.id === run.missionId);
    if (!node || (args.kind && args.kind !== node.type) || mission?.devLocked) return outcomes.rejected;
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
    const baseExperience = window.CharacterProgression.rewardFor(kind, diff, run.missionId);
    // 幸运海螺：卡露娜参战且存活时队伍经验翻倍。缺模块（bundle 未加载）
    // 时按 1 倍处理，绝不臆造翻倍。
    const experience = baseExperience
      * (window.AbeKarunaConchSkills?.partyMultiplier?.(core, args) || 1);
    const progression = progressionParty(run, args.participantIds).map(id => {
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
    const notices = [];
    defeated.forEach(id => {
      if (!core.defeatedElites.includes(id) && GameData.eliteUnlocks?.[id]) {
        core.defeatedElites.push(id);
        core.unlockedShopCards = uniq([...core.unlockedShopCards, ...GameData.eliteUnlocks[id]]);
        // 服务端路径此前没有任何解锁反馈：牌确实进池了，但玩家看不到提示。
        // 与客户端 DungeonSettlementActions.unlockEliteCards 保持同文案。
        const enemy = Object.values(GameData.enemies || {}).flat().find(item => item.id === id);
        const label = enemy?.type === "boss" ? "BOSS" : "精英";
        if (id === "shark_captain_mordio") {
          notices.push("首次击败莫迪奥：商店商品位与任务列表上限扩展至7，BOSS讨伐任务可跨副本同时出现。");
        }
        notices.push(`首次击败${label}：${enemy?.name || id}，新卡牌已加入商店池。`);
      }
    });
    core.lastLocalReward = {
      nodeId, gold, essence, experience, progression,
      cards: rare.cards, relics: rare.relics, notices,
    };
    ledger.rewards[receiptId] = core.lastLocalReward;
    return outcomes.changed;
  }

  return { settleDungeon };
})();
