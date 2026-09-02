// Battle replay harness: fixed-seed full-battle assertion.
// Loads the full BattleSystem (190 logic modules) into a Node VM with mocked
// visual/audio/UI, drives a battle from start through an auto-play policy to a
// deterministic outcome, and captures both the setup digest (phase=4) and the
// final digest (HP/MVP/performance) plus the GameRandom cursor. A replay
// verifies that the same seed + input reproduces an identical setup AND final
// state, catching cross-round regressions (AI, damage, status, settlement).
//
// Mock strategy mirrors tools/spike-full-battle.js (verified feasible).

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
let loaded = false;

function loadRuntime() {
  if (loaded) return;
  global.window = global;
  global.console = console;

  // timer mock: microtask-immediate so async setTimeout-based flows resolve.
  global.setTimeout = (cb) => { queueMicrotask(() => { try { cb(); } catch (_) {} }); return 1; };
  global.clearTimeout = () => {};
  global.render = () => {};
  global.persist = () => {};
  global.requestAnimationFrame = (cb) => { try { cb(); } catch (_) {} return 1; };
  global.performance = global.performance || { now: () => Date.now() };
  global.document = {
    addEventListener() {}, removeEventListener() {},
    createElement: () => ({ style: {}, dataset: {}, classList: { add() {}, remove() {} }, appendChild() {} }),
    querySelector: () => null, querySelectorAll: () => [],
  };
  global.Image = class { constructor() { this._src = ""; this.complete = true; this.naturalWidth = 1; this.naturalHeight = 1; } set src(v) { this._src = v; } get src() { return this._src; } addEventListener() {} removeEventListener() {} };
  global.Audio = class { constructor() { this._src = ""; } set src(v) { this._src = v; } get src() { return this._src; } addEventListener() {} removeEventListener() {} play() { return Promise.resolve(); } load() {} };
  global.lockControl = () => true;
  global.battleActionError = () => {};

  // runtime visual / audio / UI globals (battle-presentation bundle is NOT loaded).
  window.BattleLog = { clear() {}, add() {} };
  window.BattleLines = { skill() {}, intro: () => 0 };
  window.BattleBumpFx = { bump() {} };
  window.BattleEffectAnimation = { play() {}, queueSlashText() {}, queueSlashPlay() {}, pendingFatalAnim: () => false };
  window.BattleEffects = { animating: false, whenIdle: async () => {}, settlementBlocked: () => false, pushFloat() {}, queue: [], play() {}, holdVisual() {}, visualOf() {}, pushEvent() {} };
  window.BattleHitFxFallback = { play() {} };
  window.BattleFloatNumbers = { push() {} };
  window.BattleFloatFx = { push() {} };
  window.BattleFx = { play() {} };
  window.SkinFxRuntime = { apply() {} };
  window.CharacterSkinFx = { apply() {}, endTurn() {} };
  window.BattleAudio = { play() {}, preload() {} };
  window.BattleDamageAudio = { play() {} };
  window.BattleDamageFx = { play() {} };
  window.GameBGM = { battleTrack: () => "battle", play() {}, stop() {}, unlock() {}, update() {}, playCurrent() {} };
  window.GameAssets = { preloadBattle: async () => {} };
  window.AngelicaLukaSkills = { battleStart() {} };
  window.OrcDungeonSkills = { battleStart() {} };
  window.RelicSystem = { statsOf: () => ({}), statsForNames: () => ({}), hasEquipped: () => false, randomElite: () => null };
  window.SkinSystem = { applyToChar: (_, character) => character };
  window.UICommon = { esc: (v) => String(v), classToken: (v) => String(v), card: (c) => c?.name || "", skillsOf: () => [], skill: () => null, activeSkillName: () => "" };
  window.UICommonSkills = () => ({ esc: (v) => String(v), classToken: (v) => String(v) });

  // Load 190 logic modules across 5 battle bundles + 4 store files (setup deps).
  const bundles = JSON.parse(fs.readFileSync(path.join(__dirname, "publish-bundles.json"), "utf8"));
  const logicBundles = ["startup", "battle-rules", "battle-skills", "battle-flow", "battle-ai"];
  const extraStore = ["bounty-ledger.js", "receipt-ledger.js", "unlock-event-progress.js", "store-state-factory.js"];
  for (const bundle of logicBundles) {
    for (const file of bundles[bundle]) {
      const full = path.join(root, "src", "original", file);
      vm.runInThisContext(fs.readFileSync(full, "utf8"), { filename: full });
    }
  }
  for (const file of extraStore) {
    const full = path.join(root, "src", "original", file);
    vm.runInThisContext(fs.readFileSync(full, "utf8"), { filename: full });
  }
  // assets.js / skins.js (in startup bundle) may have overwritten mocks; restore.
  window.GameAssets.preloadBattle = async () => {};
  window.SkinSystem = { applyToChar: (_, character) => character };
  loaded = true;
}

function unitSnapshot(unit) {
  return {
    uid: unit.uid,
    ref: unit.ref,
    hp: unit.hp,
    maxHp: unit.maxHp,
    stats: unit.stats,
    hand: unit.hand.map((card) => `${card.suit}:${card.name}`),
    deck: unit.deck.map((card) => `${card.suit}:${card.name}`),
  };
}

function setupSnapshot(input, state) {
  const battle = state.battle;
  return {
    input,
    missionId: battle.missionId,
    battleBgm: battle.battleBgm,
    allies: battle.allies.map(unitSnapshot),
    enemies: battle.enemies.map(unitSnapshot),
    sharedAllyPile: battle.allies.length < 2 || battle.allies[0].deck === battle.allies[1].deck,
  };
}

function finalSnapshot(state) {
  const battle = state.battle;
  if (!battle) return { outcome: "settled", turn: null, phase: null };
  const enemiesDead = battle.enemies.every((e) => e.hp <= 0);
  const alliesDown = battle.allies.every((a) => a.hp <= 0);
  const outcome = enemiesDead ? "win"
    : battle.testComplete ? "testComplete"
    : battle.pendingVictory ? "victoryPending"
    : alliesDown ? "defeat"
    : "incomplete";
  const unitDigest = (u) => ({ uid: u.uid, ref: u.ref, hp: u.hp, maxHp: u.maxHp, block: u.block || 0, hand: u.hand.length, deck: u.deck.length });
  return {
    outcome,
    turn: battle.turn,
    phase: battle.phase,
    roundIndex: battle.roundIndex,
    activeUid: battle.activeUid,
    allies: battle.allies.map(unitDigest),
    enemies: battle.enemies.map(unitDigest),
    performance: JSON.parse(JSON.stringify(battle.performance || {})),
    ranking: (window.BattleStats?.ranking?.(battle) || []).map((r) => ({
      uid: r.unit.uid, ref: r.unit.ref, score: r.score, rank: r.rank, title: r.title, stats: r.stats,
    })),
  };
}

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

// Deterministic auto-play policy: for the active ally, try each in-hand card
// against the first living enemy (self for allyTarget/targetless cards) via the
// one-shot playActiveCard API, then endPlay to advance the turn (enemy turns
// auto-run inside advanceToInput). Test mode revives fallen allies, so a
// battle always resolves to a win as long as damage is dealt. Optional prepare
// prompts (神速之袭 / 榨取精华 / 模仿之音) are skipped. The policy is versioned
// so that replay files stay valid until the policy intentionally changes.
const POLICY_VERSION = 1;
const MAX_ROUNDS = 120;

async function autoPlay(state) {
  const bs = window.BattleSystem;
  const trace = [];
  let actions = 0;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const battle = state.battle;
    if (!battle) { trace.push("battleNull"); break; }
    if (battle.enemies.every((e) => e.hp <= 0)) { trace.push(`win@r${round}`); break; }
    if (battle.testComplete || battle.pendingVictory) { trace.push(`victory@r${round}`); break; }
    if (battle.awaitingSpeedAssaultUid) { bs.skipPrepareSkill(state); actions += 1; continue; }
    if (battle.awaitingExtractUid) { bs.skipExtract(state); actions += 1; continue; }
    if (battle.awaitingMimicUid) { bs.skipPrepareSkill(state); actions += 1; continue; }
    // The mock never runs BattleEffectDrain (battle-presentation bundle is not
    // loaded), so the animQueue accumulates and the battle stays locked waiting
    // for animations; drawn cards also stay _pendingDraw. Simulate drain
    // completion each round: clear pending-draw flags, drain the animQueue, and
    // release the locked flag unless a terminal state holds it.
    for (const u of [...battle.allies, ...battle.enemies]) {
      for (const c of (u.hand || [])) c._pendingDraw = false;
    }
    if (battle.animQueue?.length) battle.animQueue.length = 0;
    if (battle.locked && !battle.pendingVictory && !battle.pendingDefeat
      && !battle.failedTriggered && !battle.testComplete) {
      battle.locked = false;
    }
    if (battle.locked) {
      const flags = [
        battle.manualDodgeResume && "dodge",
        battle.counterTrigger && "ctr",
        battle.counterTriggerQueue?.length && "ctrQ",
        battle.cardResumeQueue?.length && "crQ",
        battle.comboAttackResume && "combo",
        battle.greenGatlingResume && "gatling",
        battle.groupHealResume && "heal",
        battle.demonInvasionResume && "demon",
        battle.pendingVictory && "pwin",
        battle.pendingDefeat && "pdef",
      ].filter(Boolean).join(",");
      trace.push(`stuck@r${round}:p${battle.phase}:${flags}`); break;
    }
    // Discard phase (phase 5): ally must select `need` cards then confirm.
    if (battle.phase === 5) {
      const actor = bs.active(battle);
      if (actor && actor.side === "ally") {
        for (let i = 0; i < (actor.hand || []).length; i += 1) {
          if (state.battle !== battle || battle.phase !== 5) break;
          await bs.discardCard(state, i);
        }
        if (state.battle === battle && battle.phase === 5) await bs.confirmDiscard(state);
        actions += 1;
      } else {
        await bs.confirmDiscard(state);
      }
      continue;
    }
    if (battle.phase !== 4) { trace.push(`p${battle.phase}@r${round}`); break; }
    const actor = bs.active(battle);
    if (!actor) { trace.push(`noActor@r${round}`); break; }
    if (actor.side !== "ally") { await bs.endPlay(state); actions += 1; continue; }
    let played = 0;
    for (let guard = 0; guard < 30; guard++) {
      if (battle.enemies.every((e) => e.hp <= 0)) break;
      if (battle.locked || state.battle !== battle || battle.phase !== 4) break;
      if (!(actor.hand || []).some((c) => !c._pendingDraw)) break;
      let playedNow = false;
      for (let i = 0; i < actor.hand.length; i += 1) {
        const card = actor.hand[i];
        if (card._pendingDraw) continue;
        const selfTarget = card.allyTarget || card.targetless;
        const enemy = battle.enemies.find((e) => e.hp > 0);
        const tuid = selfTarget ? actor.uid : (enemy ? enemy.uid : null);
        if (tuid == null) continue;
        if (bs.playActiveCard(state, i, tuid)) { playedNow = true; played += 1; actions += 1; break; }
        actions += 1;
      }
      if (!playedNow) break;
    }
    trace.push(`r${round}:p${played}`);
    if (state.battle === battle && battle.phase === 4 && !battle.locked) {
      await bs.endPlay(state);
      actions += 1;
    }
  }
  return { actions, rounds: trace.length, trace: trace.join("|") };
}

async function create(input, random) {
  loadRuntime();
  const group = window.GameData.enemies[input.missionId];
  const template = group?.find((enemy) => enemy.id === input.enemyId);
  const difficulty = window.GameData.difficulties[input.difficultyId];
  if (!template) throw new Error(`Unknown enemy ${input.enemyId} for ${input.missionId}`);
  if (!difficulty) throw new Error(`Unknown difficulty ${input.difficultyId}`);
  const enemy = window.GameData.scaleEnemyStats(template, difficulty, template.type);
  const state = window.GameStoreStateFactory.freshState();
  state.random = { version: 1, seed: random.seed >>> 0, cursor: random.cursor };
  // window.state is referenced by some skill paths (e.g. reckless trigger).
  global.window.state = state;
  try {
    // BattleSystem.start internally calls setup.create and advanceToInput,
    // landing at the first ally phase=4 (or an awaiting prepare prompt).
    await window.BattleSystem.start(state, input.missionId, null, {
      test: true, allyIds: input.allyIds, enemies: [enemy],
    });
    const setupSnap = setupSnapshot(input, state);
    const setupRandom = window.GameRandom.snapshot(state);
    const play = await autoPlay(state);
    const finalSnap = finalSnapshot(state);
    const finalRandom = window.GameRandom.snapshot(state);
    return { setupSnapshot: setupSnap, setupRandom, finalSnapshot: finalSnap, finalRandom, play };
  } finally {
    global.window.state = undefined;
  }
}

async function record(input) {
  loadRuntime();
  const random = { version: 1, seed: input.seed >>> 0, cursor: 0 };
  const output = await create(input, random);
  const setupRandomCalls = output.setupRandom.cursor - random.cursor;
  const finalRandomCalls = output.finalRandom.cursor - random.cursor;
  return {
    version: 3,
    policyVersion: POLICY_VERSION,
    recordedAt: new Date().toISOString(),
    input,
    random,
    setupSnapshot: output.setupSnapshot,
    setupDigest: digest(output.setupSnapshot),
    setupCursor: output.setupRandom.cursor,
    setupRandomCalls,
    finalSnapshot: output.finalSnapshot,
    finalDigest: digest(output.finalSnapshot),
    finalCursor: output.finalRandom.cursor,
    finalRandomCalls,
    play: output.play,
  };
}

async function verify(replay) {
  const validRandom = replay?.random?.version === 1
    && Number.isInteger(replay.random.seed)
    && Number.isSafeInteger(replay.random.cursor)
    && replay.random.cursor >= 0;
  if (replay?.version !== 3 || !validRandom
    || !Number.isSafeInteger(replay.setupCursor)
    || !Number.isSafeInteger(replay.setupRandomCalls)
    || !Number.isSafeInteger(replay.finalCursor)
    || !Number.isSafeInteger(replay.finalRandomCalls)) {
    throw new Error("Unsupported battle replay format");
  }
  const output = await create(replay.input, replay.random);
  const setupCalls = output.setupRandom.cursor - replay.random.cursor;
  if (output.setupRandom.cursor !== replay.setupCursor || setupCalls !== replay.setupRandomCalls) {
    throw new Error(`Setup cursor diverged: ${setupCalls} vs ${replay.setupRandomCalls} calls`);
  }
  const setupActual = digest(output.setupSnapshot);
  if (setupActual !== replay.setupDigest) {
    throw new Error(`Battle replay setup diverged: expected ${replay.setupDigest}, received ${setupActual}`);
  }
  const finalCalls = output.finalRandom.cursor - replay.random.cursor;
  if (output.finalRandom.cursor !== replay.finalCursor || finalCalls !== replay.finalRandomCalls) {
    throw new Error(`Final cursor diverged: ${finalCalls} vs ${replay.finalRandomCalls} calls`);
  }
  const finalActual = digest(output.finalSnapshot);
  if (finalActual !== replay.finalDigest) {
    throw new Error(`Battle replay final diverged: expected ${replay.finalDigest}, received ${finalActual}`);
  }
  return {
    setupDigest: setupActual, setupRandomCalls: setupCalls,
    finalDigest: finalActual, finalRandomCalls: finalCalls,
    outcome: output.finalSnapshot.outcome,
  };
}

module.exports = { record, verify, create, autoPlay, POLICY_VERSION };
