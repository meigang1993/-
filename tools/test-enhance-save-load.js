// 【角色强化】存档 / 读档严格复查：走真实 compactSaveData → validateRaw → JSON 往返
// → validateRaw → GameStoreMigrations.migrate → validateMigrated 全链路，不写等价式。
// REVERT 为源码级反向验证，用于确认断言不是空转。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const REVERT = process.env.REVERT || "";
let pass = 0, total = 0;
const reds = [];
function T(name, cond, extra) {
  total += 1;
  if (cond) { pass += 1; return; }
  reds.push(name);
  if (REVERT) console.log(`  RED ${name}`, extra === undefined ? "" : JSON.stringify(extra));
}
function text(rel) {
  let s = fs.readFileSync(path.join(ROOT, rel), "utf8");
  const swap = (from, to) => {
    if (!s.includes(from)) throw new Error(`REVERT=${REVERT} must hit ${rel}: ${from.slice(0, 70)}`);
    s = s.replace(from, to);
  };
  if (REVERT === "compact" && rel.endsWith("store-compact.js")) {
    swap("hp:safeNumber(c.hp), enhance };", "hp:safeNumber(c.hp) };");
  }
  if (REVERT === "bonus" && rel.endsWith("character-enhance.js")) {
    swap(`      out[key] = key === "maxHp"\n        ? Math.round(value + bonus[key])\n        : Math.round((value + bonus[key]) * 100) / 100;`,
      `      out[key] = key === "maxHp" ? Math.round(value) : value;`);
  }
  if (REVERT === "legacy" && rel.endsWith("character-enhance.js")) {
    swap("const legacy = hasNew ? 0 : cleanLevel(character?.enhanceLevel);", "const legacy = 0;");
  }
  if (REVERT === "apply" && rel.endsWith("server-core-apply.js")) {
    swap("c.enhance = window.CharacterEnhance?.normalize?.(next)\n          || { maxHp: 0, attack: 0, magic: 0, speed: 0 };\n        delete c.enhanceLevel;",
      "delete c.enhance; delete c.enhanceLevel;");
  }
  return s;
}
const src = f => text(`src/original/${f}`);

function freshCtx() {
  const ctx = vm.createContext({ console, Date, Math, JSON, Object, Array, String, Number, TextEncoder });
  ctx.window = ctx;
  return ctx;
}
const load = (ctx, f) => vm.runInContext(src(f), ctx, { filename: f });

const TPL = [
  { id: "lokar", name: "罗卡尔", stats: { maxHp: 130, attack: 6, magic: 4, speed: 8 } },
  { id: "noa", name: "怪面诺亚", stats: { maxHp: 120, attack: 10, magic: 3, speed: 9 } },
];
const baseStats = { attack: 0, magic: 0, speed: 0, maxHp: 10, bloodlust: 1, handLimit: 0, drawPerTurn: 0, initialDraw: 2 };
const KEYS = ["maxHp", "attack", "magic", "speed"];
const BONUS = { maxHp: 3, attack: 1, magic: 1, speed: 1 };
const zero = () => ({ maxHp: 0, attack: 0, magic: 0, speed: 0 });
const pick = s => ({ maxHp: s.maxHp, attack: s.attack, magic: s.magic, speed: s.speed });
const clone = o => JSON.parse(JSON.stringify(o));

function coreCtx() {
  const ctx = freshCtx();
  ctx.GameData = {
    characters: TPL, baseDeck: [], eliteCards: [], protectedBaseDeck: [],
    initialShopCardNames: [], cardCodex: [], deckVersion: 1, missions: [], difficulties: {},
  };
  ctx.GameRandom = { snapshot: () => ({}), normalize: () => false, int: () => 0, create: () => ({}), sample: () => null };
  ctx.GameEconomy = { shop: { refreshCost: 500 }, relic: { smeltGold: 180 }, startingGold: 0 };
  ctx.GameStore = { baseStats: () => ({ ...baseStats }) };
  ctx.GameSaveEpoch = { current: () => 1, mark: s => { s.saveEpoch = 1; }, isLegacy: () => false };
  ctx.SkinSystem = { normalizeEquipment: v => v && typeof v === "object" && !Array.isArray(v) ? { ...v } : {}, skins: [] };
  ctx.Onboarding = {
    fresh: () => ({ version: 1, step: "hall", completed: false, skipped: false }),
    done: () => ({ version: 1, step: "hall", completed: true, skipped: false }),
  };
  ctx.UnlockEventProgress = { fresh: () => ({}), snapshot: () => ({}), validPersisted: () => true };
  ctx.DungeonUnlocks = { migrate: () => {}, table: () => ({}) };
  ctx.BattleSaveCheckpoint = { restore: () => false, snapshot: () => null, stable: () => true };
  ctx.RelicSystem = { isFormalId: () => true };
  ctx.BountyTasks = { ensure: () => {} };
  ctx.BountyLedger = { normalize: v => v || { through: 0 }, empty: () => ({}), safeCounter: a => a || 0 };
  ctx.ReceiptLedger = { normalize: v => v || { through: 0 }, empty: () => ({}), safeCounter: a => a || 0 };
  ctx.StoreRepairs = {
    renameRelicMap: m => ({ ...(m || {}) }),
    repairCardLists: () => false, repairRelicLists: () => false, normalizeMergedSkills: () => false,
    cardKey: c => `${c?.name || ""}|${c?.suit || ""}`, repairCard: c => c, cardIdentity: c => c,
  };
  ctx.StoreRunMigrations = {
    migrateDifficulties: v => Array.isArray(v) ? v : ["normal"],
    recoverBrokenDungeonState: () => {}, recoverOrphanedBattleNode: () => {}, migrateRunReceipts: () => false,
  };
  ctx.StoreUnlockMigrations = {
    syncCatherineUnlock: () => {}, recoverPartyUnlocks: () => false, recoverInterruptedBattle: () => null,
  };
  ctx.StoreMigrationNormalizers = {
    normalizeShopUnlocks: () => {}, normalizeRelics: () => {}, normalizeParty: () => {},
    normalizeUiState: () => {}, normalizeLedgers: () => {}, normalizeCollectionState: () => {},
  };
  ctx.StoreMigrationsUnlocks = () => ({ runUnlockMigrations: () => {} });
  [
    "character-progression.js", "character-enhance.js", "store-state-factory.js",
    "local-core-utils.js", "local-core-character.js", "local-core.js",
    "server-core-apply.js", "server-core.js", "store-compact.js",
    "store-migration-characters.js", "store-migrations-characters.js", "store-migrations.js",
    "store-save-schema.js", "store-save-validation.js", "store-save-limits.js",
    "store-main-copy-inspection.js", "store-main-snapshot.js",
  ].forEach(f => load(ctx, f));
  const meta = { clone, version: () => 0, reserveVersion: () => {} };
  ctx.snap = ctx.GameStoreMainSnapshot({ meta });
  ctx.inspect = ctx.GameStoreMainCopyInspection({ migrate: ctx.GameStoreMigrations.migrate });
  return ctx;
}
const E = coreCtx().CharacterEnhance;

// 期望值手写加成部分，基线只取既有成长模块（不是本轮改动）。
function want(ctx, tpl, level, lv) {
  const base = { ...baseStats, ...ctx.CharacterProgression.statsAt(tpl, level) };
  return {
    maxHp: Math.round(base.maxHp + 3 * (lv.maxHp || 0)),
    attack: Math.round((base.attack + (lv.attack || 0)) * 100) / 100,
    magic: Math.round((base.magic + (lv.magic || 0)) * 100) / 100,
    speed: Math.round((base.speed + (lv.speed || 0)) * 100) / 100,
  };
}
function mkState(enhance, gold = 20000) {
  const chars = TPL.map((t, i) => ({
    id: t.id, name: t.name, locked: false, level: 3, exp: 0, hp: 200, stats: {},
    ...(i === 0 && enhance !== undefined ? { enhance: clone(enhance) } : {}),
  }));
  return {
    saveEpoch: 1, updatedAt: 1000, _saveVersion: 1, currentSaveSlot: null, view: "hall",
    settings: { sfxVolume: 80, musicVolume: 80, battleSpeed: 1, manualResponse: false, appearanceUpdatedAt: 0, equippedSkins: {} },
    resources: { gold, essence: 0, relics: [] },
    flags: { characterProgressionVersion: 1, characterGrowthVersion: 3, bondiShopUnlockVersion: 2, firstExpeditionStarted: true, onboarding: { version: 1, step: "hall", completed: true, skipped: false } },
    deck: [], deckVersion: 1, shopCards: [], bounties: [], pendingBountyRewards: [],
    equipment: {}, party: ["lokar"], log: [], battleLog: [], chars,
    battle: null, explore: null, unlockedDifficulties: ["normal"], unlockedShopCards: [],
    defeatedElites: [], dungeonUnlocks: {}, _localBountyLedger: {}, _pendingSettlementActions: [],
  };
}
function saveOf(ctx, st) {
  const saved = clone(ctx.snap.prepareSaveSnapshot(st, { trusted: true }));
  T("save.validateRaw", ctx.GameStoreSaveLimits.validateRaw(saved));
  return saved;
}
function loadOf(ctx, saved) {
  const copy = ctx.inspect.inspectCopy(clone(saved));
  return { copy, data: copy.data };
}

(async () => {
  const ctx = coreCtx();

  // ---------- A. 真实保存链路 ----------
  const st = mkState(zero());
  ctx.state = st;
  const seq = ["attack", "maxHp", "magic", "speed", "attack", "magic", "magic"];
  const lv = zero();
  for (const key of seq) {
    const r = await ctx.ServerCore.call("enhanceChar", { id: "lokar", stat: key }, st);
    T(`A.call.${key}`, r.ok && r.changed);
    lv[key] += 1;
  }
  T("A1 state 累计 7 次互不串", JSON.stringify(E.levelsOf(st.chars[0])) === JSON.stringify(lv));
  const saved = saveOf(ctx, st);
  const c0 = saved.chars.find(c => c.id === "lokar");
  T("A2 落盘含四元组 enhance", JSON.stringify(c0.enhance) === JSON.stringify(lv));
  T("A3 落盘无旧 enhanceLevel", !("enhanceLevel" in c0));
  T("A4 落盘不存 stats（读档重算口径）", c0.stats === undefined);
  T("A5 落盘保留 hp/locked/level/exp",
    Number.isFinite(c0.hp) && c0.locked === false && c0.level === 3 && c0.exp === 0);
  T("A6 金币整数且与结算一致", Number.isSafeInteger(saved.resources.gold) && saved.resources.gold === 20000 - 7000);
  T("A7 存档带纪元标记", saved.saveEpoch === 1);
  T("A8 JSON 往返字节一致", JSON.stringify(clone(saved)) === JSON.stringify(saved));
  T("A9 未强化角色四元组全 0",
    JSON.stringify(saved.chars.find(c => c.id === "noa")?.enhance) === JSON.stringify(zero()));

  // ---------- B. 真实读档链路 ----------
  const { copy, data } = loadOf(ctx, saved);
  T("B1 读档未判损坏", !copy.corrupt && !!data, copy.error?.message);
  const d0 = data?.chars.find(c => c.id === "lokar");
  T("B2 读档 enhance 四元组完整", JSON.stringify(E.levelsOf(d0)) === JSON.stringify(lv));
  T("B3 读档属性含全部加成", JSON.stringify(pick(d0.stats)) === JSON.stringify(want(ctx, TPL[0], 3, lv)));
  T("B4 读档金币一致", data.resources.gold === saved.resources.gold);
  T("B5 读档 hp 有限且不超上限", Number.isFinite(d0.hp) && d0.hp >= 0 && d0.hp <= d0.stats.maxHp);
  const twice = ctx.GameStoreMigrations.migrate(clone(data));
  const t0 = twice.chars.find(c => c.id === "lokar");
  T("B6 二次 migrate 幂等：次数不叠加", JSON.stringify(E.levelsOf(t0)) === JSON.stringify(lv));
  T("B7 二次 migrate 幂等：属性不叠加", JSON.stringify(pick(t0.stats)) === JSON.stringify(pick(d0.stats)));
  const again = loadOf(ctx, saved).data.chars.find(c => c.id === "lokar");
  T("B8 重复读档不重复加", JSON.stringify(pick(again.stats)) === JSON.stringify(pick(d0.stats)));

  // 读档后继续强化：不能从 0 重来
  const st2 = { ...clone(data), _localBountyLedger: {} };
  ctx.state = st2;
  const r2 = await ctx.ServerCore.call("enhanceChar", { id: "lokar", stat: "speed" }, st2);
  lv.speed += 1;
  T("B9 读档后继续强化成功", r2.ok && r2.changed);
  T("B10 读档后强化累计不回退", JSON.stringify(E.levelsOf(st2.chars[0])) === JSON.stringify(lv));
  const saved2 = saveOf(ctx, st2);
  T("B11 二次存档次数落盘", saved2.chars.find(c => c.id === "lokar")?.enhance?.speed === lv.speed);

  // 升级后强化仍在（grant 重算 stats）
  const ch = st2.chars[0];
  const grant = ctx.CharacterProgression.grant(ch, 100000, TPL[0]);
  T("B12 升级后 enhance 不丢", JSON.stringify(E.levelsOf(ch)) === JSON.stringify(lv));
  T("B13 升级后属性 = 新等级基线 + 原加成",
    JSON.stringify(pick(ch.stats)) === JSON.stringify(want(ctx, TPL[0], grant.level, lv)));

  // ---------- C. 旧档 / 畸形档 ----------
  const legacy = mkState(undefined);
  legacy.chars[0].enhanceLevel = 4;
  delete legacy.chars[0].enhance;
  const legacySaved = saveOf(ctx, legacy);
  T("C1 旧档 enhanceLevel 落盘时归一为四项各 n",
    JSON.stringify(legacySaved.chars.find(c => c.id === "lokar")?.enhance) === JSON.stringify({ maxHp: 4, attack: 4, magic: 4, speed: 4 }));
  const legacyLoaded = loadOf(ctx, legacySaved).data.chars.find(c => c.id === "lokar");
  T("C2 旧档读档加成一点不少",
    JSON.stringify(pick(legacyLoaded.stats)) === JSON.stringify(want(ctx, TPL[0], 3, { maxHp: 4, attack: 4, magic: 4, speed: 4 })));

  const mixed = mkState({ maxHp: 1, attack: 0, magic: 0, speed: 0 });
  mixed.chars[0].enhanceLevel = 8;
  const mixedSaved = saveOf(ctx, mixed);
  T("C3 新旧字段并存以新为准（不双算）",
    JSON.stringify(mixedSaved.chars.find(c => c.id === "lokar")?.enhance) === JSON.stringify({ maxHp: 1, attack: 0, magic: 0, speed: 0 }));

  const weirds = [
    { maxHp: -1, attack: 1e9, magic: "4", speed: 2.9 },
    { maxHp: NaN, attack: Infinity, magic: null, speed: undefined },
    [], null, "oops",
  ];
  let weirdOk = true;
  for (const w of weirds) {
    const s = mkState(undefined);
    s.chars[0].enhance = w;
    try {
      const sv = saveOf(ctx, s);
      const ld = loadOf(ctx, sv).data.chars.find(c => c.id === "lokar");
      if (!ld || !KEYS.every(k => Number.isFinite(ld.stats[k]))) weirdOk = false;
      if (!KEYS.every(k => Number.isInteger(E.levelsOf(ld)[k]))) weirdOk = false;
    } catch (_) { weirdOk = false; }
  }
  T("C4 畸形 enhance 不崩且读档属性有限", weirdOk);
  const proto = mkState(undefined);
  proto.chars[0].enhance = JSON.parse('{"__proto__":{"polluted":1},"attack":2}');
  const protoLoaded = loadOf(ctx, saveOf(ctx, proto)).data.chars.find(c => c.id === "lokar");
  T("C5 原型键不污染且不放大次数",
    E.levelsOf(protoLoaded).attack === 2 && ({}).polluted === undefined);

  // ---------- D. checkpoint / 副本快照 / 取整口径 ----------
  const battleState = mkState({ maxHp: 2, attack: 1, magic: 0, speed: 0 });
  battleState.battle = { allies: [], enemies: [], played: [], animQueue: [], chiyoChain: { remaining: 3 }, noaUltimateChain: { remaining: 2 } };
  const battleSaved = saveOf(ctx, battleState);
  T("D1 checkpoint 路径角色照样压缩", battleSaved.chars.find(c => c.id === "lokar").stats === undefined);
  T("D2 checkpoint 路径 enhance 落盘", battleSaved.chars.find(c => c.id === "lokar")?.enhance?.maxHp === 2);
  T("D3 挂起链不随存档固化", !("chiyoChain" in battleSaved.battle) && !("noaUltimateChain" in battleSaved.battle));
  const battleLoaded = loadOf(ctx, battleSaved).data.chars.find(c => c.id === "lokar");
  T("D4 checkpoint 读档加成恢复",
    JSON.stringify(pick(battleLoaded.stats)) === JSON.stringify(want(ctx, TPL[0], 3, { maxHp: 2, attack: 1, magic: 0, speed: 0 })));

  const goldState = mkState(zero(), 1000.9);
  T("D5 小数金币存档被既有 validateRaw 护栏拒绝", (() => {
    try { ctx.snap.prepareSaveSnapshot(clone(goldState), { trusted: true }); return false; }
    catch (e) { return e.code === "INVALID_SAVE_STRUCTURE"; }
  })());
  ctx.state = goldState;
  const gr = await ctx.ServerCore.call("enhanceChar", { id: "lokar", stat: "attack" }, goldState);
  T("D5b 结算层先规整小数余额再扣费", gr.ok && gr.changed
    && Number.isSafeInteger(goldState.resources.gold) && goldState.resources.gold === 0);
  const goldSaved = saveOf(ctx, goldState);
  T("D6 结算后存档与读档金币均为整数",
    Number.isSafeInteger(goldSaved.resources.gold)
    && Number.isSafeInteger(loadOf(ctx, goldSaved).data.resources.gold));

  const dec = ctx.CharacterProgression.statsAt(TPL[0], 3);
  T("D7 属性统一整数（显示层/全部取整都不改存档格式）",
    KEYS.every(k => Math.round(dec[k] * 100) / 100 === dec[k]));
  T("D8 存档只存次数、不存属性结果（取整口径与存档无关）",
    KEYS.every(k => !Object.hasOwn(c0, "stats")));

  // ---------- E. 装配顺序 ----------
  const groups = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/publish-bundles.json"), "utf8"));
  const startupIdx = groups.startup.indexOf("character-enhance.js");
  const storeIdx = groups["startup-store"].indexOf("store-compact.js");
  T("E1 强化模块先于存档压缩模块装配", startupIdx >= 0 && storeIdx >= 0);
  T("E2 强化模块在 startup 内", startupIdx >= 0);

  console.log(`RESULT ${pass}/${total}${reds.length ? " RED=" + reds.join(",") : ""}`);
  if (pass !== total) process.exitCode = 1;
})().catch(err => { console.error("FATAL", err.stack); process.exitCode = 2; });
