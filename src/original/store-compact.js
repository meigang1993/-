window.GameStoreCompact = (() => {
  const transientHallViews = new Set(["livingRoom", "training", "nursery", "furnace"]);
  const transientUiKeys = [
    "hallModal", "infoUnit", "infoTab", "artZoom",
    "deckFilter", "cardCodex", "selectedCodexCard", "skinFilterChar", "skinFlash",
    "relicEquipChar", "pendingRelicSlot", "selectedRelic", "relicCodex",
    "selectedCodexRelic", "succubusCodex", "codexFlashId", "confirmDialog",
    "butlerManual", "butlerTab",
    "inventoryCleanupTab",
    "bountyPopup", "sortieStarting", "testBattleStarting",
    "loadingBattleName", "loadingBattleProgress",
  ];
  function safeNumber(value) {
    const n = Number(value || 0);
    return Number.isFinite(n) ? n : 0;
  }
  function stripTransientUiState(data) {
    transientUiKeys.forEach(key => delete data[key]);
    if (transientHallViews.has(data.view) || data.view === "dungeonInventory") {
      data.view = data.explore ? "dungeon" : "hall";
    }
    if (data.battle) delete data.battle.speech;
    return data;
  }
  function stripTemporaryCards(data) {
    const cleanList = list => Array.isArray(list) ? list.filter(c => !c?.temporary).map(c => ({ ...c, _pendingDraw: c._pendingDraw && !c.temporary ? c._pendingDraw : undefined })).map(c => { if (c._pendingDraw === undefined) delete c._pendingDraw; return c; }) : list;
    const units = data.battle ? [...(data.battle.allies || []), ...(data.battle.enemies || [])] : [];
    const piles = [...new Set(units.map(u => u.pileStats).filter(Boolean))];
    piles.forEach(p => { p.deck = cleanList(p.deck); p.discard = cleanList(p.discard); p.consumed = cleanList(p.consumed); });
    units.forEach(u => { u.hand = cleanList(u.hand); u.deck = cleanList(u.deck); u.discard = cleanList(u.discard); u.consumed = cleanList(u.consumed); });
    return data;
  }
  // 固化阵营只对「本场战斗的牌」有意义：局外牌（主卡组 / 商店 / 副本奖励 / 赏金）
  // 跨战斗必须回到中立。否则下一场开局我方原生牌会带着上一场固化的敌方阵营，
  // 被 CardOwnership.destination 归还到敌方共享堆 —— 我方永久失去这张牌。
  function compactCard(card, keepOrigin = true) {
    const identity = window.GameStoreSaveSchema.cardIdentity(card);
    if (!keepOrigin && identity) delete identity.originSide;
    return identity;
  }
  function compactCards(list, keepOrigin = true) {
    return Array.isArray(list) ? list.map(c => compactCard(c, keepOrigin)) : list;
  }
  // 战斗瞬时牌引用统一收口：动画事件里的 card/cards、展示快照、挂起/恢复对象里的
  // card 只在当前动画或响应窗口内有效。跨存档保留会把 stolenFromUid / originSide /
  // _pendingDraw / ignoreResponse 等运行时标记固化，读档后产生「永久 / 失去」类 BUG。
  // 口径与 BattleSaveCheckpointValidation.stable 完全一致：稳定存档点这些键必须为空。
  // mimicLinks（洛基/新月模仿链接）是跨回合持久状态，只存 uid 对、不含牌对象，
  // 不能随瞬时牌引用一起清空，否则读档会丢技能状态。
  const transientArrayKeys = [
    "animQueue", "shownPlayed", "cardResumeQueue", "counterTriggerQueue",
    "kaiichiShareQueue", "reactionQueue", "pendingTargetUids",
  ];
  const transientStateKeys = [
    "selectedCardIndex", "selectedCostCardIndex", "selectedSkillCard",
    "selectedBagIndexes", "pendingTargetUid", "comboPartnerUid", "discardPick",
    "noaCharmDiscard", "handReveal", "mannyArmoryPicker", "wendyTutorPicker",
    "ailengDrillPicker", "catherineStealPicker", "cadicisResponsibility",
    "mieryulaBloodthirstPicker", "cadicisResponsibilityResume",
    "manualDodge", "manualDodgeResume", "manualCounter", "counterTrigger",
    "recklessPrompt", "risaEyePrompt", "landmineRpsPrompt", "thunderHammer",
    "greenGatlingResume", "crazySlaughterResume", "demonInvasionResume",
    "groupHealResume", "comboAttackResume", "krowRepeatResume",
    "dimensionTransfer", "newMoonShare", "gerdaComfort", "millerShare",
    "kaiichiShare", "kaiichiShareScheduled", "awaitingExtractUid",
    "awaitingMimicUid", "awaitingSpeedAssaultUid", "prepareUnitUid",
    "endPhaseUnitUid", "pendingVictory", "pendingDefeat", "victoryScreen",
    "lastClash", "karunaBubble", "karunaBubblePending", "opheliaGuard",
    // 【红缨连鬼斩】挂起的虚拟杀链：只在该回合内有效，跨存档补跑会凭空打出一串杀。
    "chiyoChain",
  ];
  function stripBattleTransientCards(battle) {
    if (!battle || typeof battle !== "object") return battle;
    transientArrayKeys.forEach(key => {
      if (Array.isArray(battle[key])) battle[key] = [];
    });
    transientStateKeys.forEach(key => {
      const value = battle[key];
      if (Array.isArray(value)) battle[key] = [];
      else if (value != null && value !== false) delete battle[key];
    });
    battle.animQueue = [];
    battle.shownPlayed = [];
    return battle;
  }
  function compactCharacter(c) {
    if (!c || typeof c !== "object") return c;
    return { id:c.id, locked:!!c.locked, level:safeNumber(c.level), exp:safeNumber(c.exp), hp:safeNumber(c.hp) };
  }
  function compactSaveData(data) {
    stripTransientUiState(data);
    data.chars = (data.chars || []).map(compactCharacter);
    data.deck = compactCards(data.deck, false);
    data.shopCards = (data.shopCards || []).map(slot => slot?.card
      ? { card:compactCard(slot.card, false), sold:slot.sold === true } : slot);
    const compactReward = item => {
      const r = item?.reward || item;
      if (r?.card) r.card = compactCard(r.card, false);
      if (r?.cards) r.cards = compactCards(r.cards, false);
      return item;
    };
    data.bounties = (data.bounties || []).map(compactReward);
    data.pendingBountyRewards = (data.pendingBountyRewards || []).map(compactReward);
    if (data.explore?.earned) data.explore.earned.cards = compactCards(data.explore.earned.cards, false);
    if (data.explore?.lastReward) data.explore.lastReward.cards = compactCards(data.explore.lastReward.cards, false);
    if (data.explore?.rewardPopup) data.explore.rewardPopup.cards = compactCards(data.explore.rewardPopup.cards, false);
    compactReward(data._localPendingRun);
    compactReward(data.pendingRun);
    Object.values(data._localRunState?.rewards || {}).forEach(compactReward);
    const units = data.battle ? [...(data.battle.allies || []), ...(data.battle.enemies || [])] : [];
    const piles = [...new Set(units.map(u => u.pileStats).filter(Boolean))];
    piles.forEach(p => { p.deck = compactCards(p.deck); p.discard = compactCards(p.discard); p.consumed = compactCards(p.consumed); });
    units.forEach(u => { u.hand = compactCards(u.hand); u.deck = compactCards(u.deck); u.discard = compactCards(u.discard); u.consumed = compactCards(u.consumed); });
    if (data.battle) {
      stripBattleTransientCards(data.battle);
      data.battle.played = compactCards(data.battle.played);
    }
    return data;
  }
  return {
    stripTemporaryCards, stripTransientUiState, stripBattleTransientCards,
    compactSaveData,
  };
})();
