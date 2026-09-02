window.BattleSetup = () => {
  const withLimits = (stats) => ({ ...stats, bloodlust: Math.min(99, Math.max(1, stats.bloodlust || 1)), handLimit: stats.handLimit || 5, drawPerTurn: Math.max(0, stats.drawPerTurn || 0) });
  const relicStats = (state, id) => window.RelicSystem?.statsOf?.(state, id) || {};
  let enemyTemplates = null;
  const resistanceSkill = Object.freeze({
    name: "霸王色抗性", type: "trigger", icon: "✦",
    text: "触发技，准备阶段自动触发。若自身持有状态牌且另有至少2张手牌，弃置2张手牌，消耗并移除其中1张状态牌；否则该状态牌照常进入判定阶段。",
  });
  const enemyTemplate = (id) => {
    enemyTemplates = enemyTemplates || new Map(Object.values(GameData.enemies || {}).flat().map(e => [e.id, e]));
    return enemyTemplates.get(id);
  };
  function shuffle(cards, state = window.state) {
    const out = cards.map(c => ({ ...c }));
    return window.GameRandom.shuffle(out, state);
  }
  function battleDeck(baseDeck, earned) { return [...(baseDeck || []), ...(earned || [])]; }
  function teamPile(deck, state) { return { deck: shuffle(deck, state), discard: [], consumed: [], shuffleCount: 0 }; }
  function hero(c, i, pile, fullHp = false, state = null) {
    const bonus = relicStats(state, c.id), stats = withLimits({ ...(fullHp ? (c.testStats || c.stats) : c.stats) });
    Object.entries(bonus).forEach(([k, v]) => stats[k] = (stats[k] || 0) + v);
    return { uid: `a${i}`, side: "ally", ref: c.id, gender: c.gender, face: c.face, art: c.art, avatar: c.avatar, skinName: c.skinName, skinDynamicEffect: c.skinDynamicEffect || null, skinDamagedArt: c.skinDamagedArt || null, skinVictoryArt: c.skinVictoryArt || null, name: c.name, role: c.role, combatRoles: c.combatRoles, evaluation: c.evaluation, hp: fullHp ? stats.maxHp : Math.min(c.hp ?? stats.maxHp, stats.maxHp), maxHp: stats.maxHp, block: 0, intent: 0, charge: 0, actionCount: 0, tempMagic: 0, usedExtract: false, usedBloodPact: false, statuses: [], skills: c.skills || [], relicStats: bonus, relicStatsApplied: true, stats, deck: pile.deck, discard: pile.discard, consumed: pile.consumed, pileStats: pile, hand: [] };
  }
  function enemy(e, i, pile) {
    const tpl = enemyTemplate(e.id) || e, battleRelics = e.battleRelics || [];
    const type = e.type || tpl.type;
    const skills = [...(tpl.skills || e.skills || [])];
    if (["elite", "boss"].includes(type)
      && !skills.some(skill => skill.name === resistanceSkill.name)) {
      skills.push({ ...resistanceSkill });
    }
    const stats = { attack: e.attack, magic: e.magic || 0, speed: e.speed, maxHp: e.hp, handLimit: e.handLimit || 5, drawPerTurn: e.drawPerTurn || 0, initialDraw: e.initialDraw || 0, bloodlust: e.bloodlust || 1 };
    const bonus = window.RelicSystem?.statsForNames?.(battleRelics) || {};
    Object.entries(bonus).forEach(([k, v]) => stats[k] = (stats[k] || 0) + v);
    return { uid: `e${i}`, side: "enemy", id: e.id, ref: e.id, type, ai: e.ai, label: e.label || "", gender: e.gender, face: e.face, art: e.art, bgm: e.bgm, annihilationBgm: e.annihilationBgm, name: e.name, role: tpl.role || e.role, combatRoles: tpl.combatRoles || e.combatRoles, evaluation: tpl.evaluation || e.evaluation, hp: e.hp, maxHp: stats.maxHp, block: 0, defenseSystem: e.ai === "mechanical_bull_king" ? e.hp : 0, annihilationMode: false, intent: 0, charge: 0, actionCount: 0, statuses: [], skills, battleRelics, relicStats: bonus, relicStatsApplied: true, stats, deck: pile.deck, discard: pile.discard, consumed: pile.consumed, pileStats: pile, hand: [], radarUsed: false };
  }
  function battleBgm(enemies, missionId) {
    if (window.GameBGM?.battleTrack) return window.GameBGM.battleTrack(missionId, enemies);
    const mission = GameData.missions?.find(m => m.id === missionId);
    return enemies.find(e => e.type === "boss" && e.bgm)?.bgm
      || enemies.find(e => e.type === "elite" && e.bgm)?.bgm
      || enemies.find(e => e.bgm)?.bgm
      || mission?.bgm
      || "battle";
  }
  function setAssetFailures(battle, failed = [], error = "") {
    const failures = [...new Set((failed || []).filter(Boolean))];
    const failedSet = new Set(failures), units = battle.allies.concat(battle.enemies);
    units.forEach(unit => {
      const unitFailures = [unit.art, unit.avatar, unit.skinDamagedArt, unit.skinVictoryArt].filter(url => failedSet.has(url));
      if (unitFailures.length) unit._assetFailedUrls = unitFailures;
      else delete unit._assetFailedUrls;
    });
    battle.assetFailures = failures;
    battle.assetCriticalFailures = failures.filter(url => units.some(unit => unit.art === url || unit.avatar === url || unit.skinDamagedArt === url || unit.skinVictoryArt === url));
    battle.assetLoadError = error;
  }
  async function create(state, missionId, onStep, context = {}) {
    const current = () => (!window.state || window.state === state)
      && (!context.isCurrent || context.isCurrent());
    const party = (context.test ? (context.allyIds || []) : (context.exploration ? state.explore?.activeParty || state.party : state.party)).slice(0, 4), source = context.enemies || GameData.enemies[missionId];
    const baseDeck = context.deck || state.deck || GameData.baseDeck, earned = context.exploration ? (state.explore?.earned?.cards || []) : [];
    const sharedDeck = battleDeck(baseDeck, earned);
    const allyRefs = state.chars.filter(c => party.includes(c.id) && (context.test || (!c.locked && (!context.exploration || c.hp > 0))));
    const shownAllies = allyRefs.map(c => window.SkinSystem?.applyToChar?.(state, c, !!context.test) || c);
    let failedAssets, preloadError = "";
    try { failedAssets = await window.GameAssets?.preloadBattle?.(missionId, shownAllies, source, (done, total) => { if (!current()) return; state.loadingBattleProgress = { done, total }; onStep?.(); }) || []; }
    catch (err) {
      console.warn("battle preload failed:", err.message, err.stack);
      preloadError = "战斗素材预加载异常";
      failedAssets = shownAllies.concat(source).flatMap(unit => [unit.art, unit.avatar, unit.skinDamagedArt, unit.skinVictoryArt]).filter(Boolean);
    }
    if (!current()) return { allies: [], enemies: [] };
    const allyPile = teamPile(sharedDeck, state), enemyPile = teamPile(sharedDeck, state);
    const allies = shownAllies.map((c, i) => hero(c, i, allyPile, context.test, state));
    const enemies = source.map((e, i) => enemy(e, i, enemyPile));
    state.loadingBattleProgress = null;
    state.battle = { missionId, allies, enemies, enemyCount: enemies.length, defeatedEnemyIds: [], battleBgm: battleBgm(enemies, missionId), turn: 0, roundNo: 1, roundOrder: [], roundIndex: 0, phase: 0, activeUid: null, lastClash: null, lastHitUid: null, hitFxId: 0, lastArmorBreakUid: null, selectedCardIndex: null, selectedCostCardIndex: null, selectedSkillCard: null, pendingTargetUid: null, played: [], shownPlayed: [], animQueue: [], combo: 0, firstSlashBonusUsed: {}, locked: false, defeat: false, failedTriggered: false, test: !!context.test, testComplete: false, testRecovery: false, introSfxPending: true, exploration: !!context.exploration, nodeId: context.nodeId, nodeType: context.nodeType };
    setAssetFailures(state.battle, failedAssets, preloadError);
    window.BattleStats?.initialize?.(state.battle);
    window.AngelicaLukaSkills?.battleStart?.(state);
    window.OrcDungeonSkills?.battleStart?.(state);
    window.RuinsEnemySkills?.battleStart?.(state);
    return { allies, enemies };
  }
  async function retryAssets(state, onStep) {
    const battle = state?.battle;
    if (!battle?.assetFailures?.length || battle.assetRetrying) return { ok: true, failed: [] };
    const retryGeneration = (battle.assetRetryGeneration || 0) + 1;
    battle.assetRetryGeneration = retryGeneration;
    const current = () => window.state === state && state.battle === battle
      && battle.assetRetryGeneration === retryGeneration;
    battle.assetRetrying = true; battle.assetRetryProgress = null; onStep?.();
    try {
      const failed = await window.GameAssets.retryBattle(battle.assetFailures, (done, total) => {
        if (!current()) return;
        battle.assetRetryProgress = { done, total }; onStep?.();
      });
      if (!current()) return { ok: false, stale: true, failed: [] };
      setAssetFailures(battle, failed);
      return { ok: !failed.length, failed };
    } finally {
      if (current()) {
        battle.assetRetrying = false; battle.assetRetryProgress = null; onStep?.();
      }
    }
  }
  return { shuffle, create, retryAssets };
};
