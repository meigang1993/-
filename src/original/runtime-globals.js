(function installRuntimeGlobals() {
  if (typeof window === "undefined" || typeof globalThis === "undefined" || globalThis === window) return;

  const names = [
    "AbeMikeSkills", "AngelicaLukaSkills", "AppHallBindings", "AppRenderOverlays", "AppRenderPages", "BattleAI", "BattleAIConfig",
    "BattleAIHelpers", "BattleAISkillEvaluation", "BattleAISkillHelpers", "BattleAISkillMoves", "BattleAISkillPlanner", "BattleAISlashPlanner", "BattleAITactics", "BakarCoreSkills", "BakarFireSkills", "BattleCards", "BattleCardCounterInteractions", "BattleCardHandInteractions", "BattleCardInteractions", "BattleCardPlayability", "BattleCardSpecials", "BattleCardTactics", "BattleCombat",
    "BattleCombatAttack", "BattleCombatAttackFlow", "BattleCombatAttackValues", "BattleCombatCardEffects", "BattleCombatResponses", "BattleCombatTargeting", "BattleCombatVisuals", "BattleDamage", "BattleDamageHit", "BattleDamageLifecycle", "BattleDamageResolution", "BattleDamageResponses",
    "BattleDamageTriggers", "BattleDamageUtils", "BattleDrawTransaction", "BattleReactionQueue", "BattleCardResume", "BattleCardResumeFlow", "BattleCardResumeHooks", "BattleCardResumeState", "BattleDiscardFlow", "BattleDiscardOverflow", "BattleEndPhase",
    "BattleEffectAnimation", "BattleEffectCards", "BattleEffectCardPlays", "BattleEffectCardTransfers", "BattleEffectDrain", "BattleEffectDrainRecovery", "BattleEffectEventRunner", "BattleEffectGeometry", "BattleEffectHandlers", "BattleEffectPlay", "BattleEffectPlayedCardFlight", "BattleEffects", "BattleEffectUtils",
    "BattleActionHandBindings", "BattleActionPromptBindings", "BattleActionSpecialBindings", "BattleActionTargetBindings", "BattleBumpFX", "BattleEnemyTurn", "BattleFloatFX", "BattleFX", "BattleLineData", "BattleLineIntro", "BattleLines", "BattleLog", "BattleManualFlow",
    "BattleActionGuard", "BattleAutoEnemy", "BattleOutcomes", "BattlePileStats", "BattlePreparePrompts", "BattlePrepareSequence", "BattleResolutionActions", "BattleResponseUI", "BattleSession", "BattleSetup",
    "BattleStatus", "BattleStatusCards", "BattleSystem", "BattleTurnCompletion", "BattleTurnFlow", "BattleTurnInput", "BattleTurnPreparation", "BattleTurnStart", "BattleTurnState", "BattleVictory", "BertisGerlotSkills", "CharacterSkinFX",
    "BountyLedger", "BountyRender", "BountyRewards", "BountySystem", "BountyTaskGenerator", "BountyTaskRepair", "CardUtils", "DungeonEnemyGroups", "DungeonEvents",
    "DungeonMap", "DungeonNodeRewards", "DungeonRender", "DungeonRewardCore", "DungeonRewardPayload", "DungeonRewards", "DungeonRunRewards", "DungeonSettlementActions", "DungeonSystem", "EdisSkills",
    "ElranaAceNanaliSkills", "EnemyCombatHooks", "EnemyDamageHooks", "EnemyKillHooks", "EnemySkills", "EnemyStatusEffects", "EnemyTacticalSkills", "ExtraUnlockEvents", "FloraCarlosSkills", "GameAssets",
    "AppActionGuard", "GameBGM", "GameBattleStyles", "GameConfirm", "GameData", "GameDataCards", "GameDataCharacters", "GameDataCharactersCore", "GameRandom",
    "GameDataBakarEnemy", "GameDataCharactersExtra", "GameDataFutureCharacters", "GameDataFutureDungeons", "GameDataFutureEnemies", "GameDataFutureOrcEnemies",
    "GameDataFutureRelics", "GameDataRelics", "GameDataWorld", "GameEconomy", "GameStore", "GameStoreCompact", "GameStoreIO", "GameStoreIOMutations", "GameStoreIORecovery", "GameStoreIOSelection", "GameStorePauseQueue", "GameStoreSaveLimits", "GameStoreSaveSchema", "GameStoreSaveValidation",
    "GameStoreMigrations", "GameStoreStateFactory", "GameUI", "GameUIBattleScene", "GameUIBattleTargeting", "GameUIBattleUnits", "GameUIHand", "GameUIHandState", "GameUIHandView", "GameUIInfo", "GameUILivingRoom",
    "GuestCharacterSkills", "GuestOpheliaGuard", "HallUnlockEvents", "LocalCore", "LocalCoreUtils", "LokarSkills",
    "MachineFactorySkills", "MannyGunSkinActions", "MannySkills", "MillerSkills", "NanaliSealed", "NonokaLokiSkills", "OrcDungeonSkills", "OrcUnlockEvents", "RelicBindings", "RelicSystem", "RelicUI",
    "ReceiptLedger", "SakuraRisaCombatSkills", "SakuraRisaEye", "SakuraRisaLifecycleSkills", "SakuraRisaSkills", "SaveSlots", "SaveSlotsActions", "SaveSlotsBindings", "SaveSlotsView", "ServerCore", "ServerCoreApply", "SettlementRecovery", "ShopSystem", "SkinSystem",
    "CharacterProgression", "HoshinoKaiichiShare", "HoshinoKaiichiShareQueue", "HoshinoKaiichiShareResolution", "LocalCoreBountyOps", "StoreCharacterMigrations", "StoreMigrationNormalizers", "StoreRepairs", "StoreRunMigrations", "StoreUnlockMigrations", "GameStoreMainCopyInspection", "GameStoreMainLoad", "GameStoreMainRecovery", "GameStoreMainSave", "GameStoreMainSaveQueue", "GameStoreMainSaveScheduler", "GameStoreMainSaveSupport", "GameStoreMainSaveWriter", "GameStoreMainSnapshot", "GameStoreSlotsData", "SuccubusCodex", "UICommon", "UICommonArt", "UICommonCards", "UICommonRelics", "UICommonSkills", "UnderwaterTrainAttackSkills", "UnderwaterTrainBiteSkills", "UnderwaterTrainCombatSkills", "UnderwaterTrainControlSkills",
    "UnderwaterTrainDamageSkills", "UnderwaterTrainPrepareSkills", "UnderwaterTrainSkills", "UnderwaterTrainTargetActions", "UnderwaterTrainTargetCounters", "UnderwaterTrainTargetSkills", "VillaCollectionUI", "VillaDefeatEvents", "VillaEventRenderer", "VillaEvents", "VillaFamilyEvents", "VillaTeamUI", "VillaTestUI", "VillaUI", "WendyCadicisSkills", "bindBattleActionButtons",
    "bindDungeonActions", "completeAceUnlockEvent", "completeBestaNurseryUnlockEvent",
    "completeLittleElranaUnlockEvent", "completeOpheliaUnlockEvent", "completeOrcDungeonUnlockEvent", "completeUnderwaterTrainUnlockEvent",
    "preserveNextScroll", "releaseScrollLock", "render", "restoreScrollInstant", "startOpen", "state",
    "triggerAceUnlockEvent", "triggerOrcDungeonUnlockEvent", "triggerPostUnderwaterTrainClearEvents", "triggerUnderwaterTrainUnlockEvent",
    "tryLittleElranaEncounter", "WithererSkills"
  ];

  names.forEach((name) => {
    if (Object.prototype.hasOwnProperty.call(globalThis, name)) return;
    Object.defineProperty(globalThis, name, {
      configurable: true,
      get() { return window[name]; },
      set(value) { window[name] = value; }
    });
  });
})();
