window.GameStoreStateFactory = (() => {
  const characterProgressionVersion = 1;
  const characterGrowthVersion = 3;
  const rand = (min, max, state = window.state) => window.GameRandom.int(min, max, state);
  const baseStats = () => ({ attack: 0, magic: 0, speed: 0, maxHp: 10, bloodlust: 1, handLimit: 0, drawPerTurn: 0, initialDraw: 2 });
  const cleanLevel = level => window.CharacterProgression.cleanLevel(level);
  const makeCharacter = (tpl) => {
    const stats = { ...baseStats(), ...window.CharacterProgression.statsAt(tpl, 0) };
    return { ...tpl, level: 0, exp: 0, hp: stats.maxHp, stats };
  };
  function applyProgression(c, tpl) {
    c.level = cleanLevel(c.level);
    c.exp = window.CharacterProgression.cleanExp(c.exp, c.level);
    c.stats = { ...baseStats(), ...window.CharacterProgression.statsAt(tpl, c.level) };
    delete c.spent;
  }
  function freshState() {
    return { updatedAt: 0, currentSaveSlot: null, random: window.GameRandom.create(), view: "hall", settings: { sfxVolume: 80, musicVolume: 80, battleSpeed: 1, manualResponse: false, appearanceUpdatedAt: 0, equippedSkins: {} }, resources: { gold: GameEconomy.startingGold, essence: 0, relics: [] }, flags: { characterProgressionVersion, characterGrowthVersion, bondiShopUnlockVersion: 2, firstExpeditionStarted: false }, unlockEvents: window.UnlockEventProgress.fresh(), deck: GameData.baseDeck.map(c => ({ ...c })), deckVersion: GameData.deckVersion, equipment: {}, party: ["lokar", "besta_doll"], testAllies: ["lokar", "besta_doll"], testEnemies: [0], testDifficulty: "normal", testCards: [], testRelics: [], testEquipment: {}, testSkins: {}, ownedSkins: {}, equippedSkins: {}, shopAuthorityVersion: 0, completed: [], defeatedElites: [], unlockedShopCards: [...(GameData.initialShopCardNames || [])], unlockedDifficulties: ["normal"], relicCollection: [], log: ["欢迎回到贝丝妲的别墅。"], battleLog: [], chars: GameData.characters.map(makeCharacter), battle: null, explore: null, hallModal: null, deckFilter: "all", shopCards: [], bounties: [], pendingBountyRewards: [], _localBountyLedger: window.BountyLedger.empty(), _localBountyClaimCounter: 0, _localDefeatLedger: window.ReceiptLedger.empty(), _localDefeatCounter: 0, _localInventoryLedger: window.ReceiptLedger.empty(), _localInventoryOperationCounter: 0, _localInventoryRevision: 0, _pendingSettlementActions: [] };
  }
  return {
    characterProgressionVersion, characterGrowthVersion, rand, baseStats, makeCharacter,
    applyProgression, cleanLevel, freshState,
  };
})();
