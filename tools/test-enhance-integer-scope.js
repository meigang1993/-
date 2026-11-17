// 【角色强化·整数收口 / 属性收敛 / 适用范围】严格复查。
// 独立实现（不复用其它强化测试的断言），REVERT 为源码级反向验证，确认断言不是空转。
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
  if (REVERT === "gold") {
    if (rel.endsWith("local-core-character.js"))
      swap("const cost = enhance.COST, gold = cleanGold(core.resources?.gold);",
        "const cost = enhance.COST, gold = Number(core.resources?.gold) || 0;");
    if (rel.endsWith("local-core-commerce.js"))
      swap("const gold = cleanGold(core.resources?.gold);", "const gold = Number(core.resources?.gold) || 0;");
    if (rel.endsWith("local-core-bounty.js"))
      swap("const gold = cleanGold(core.resources?.gold);", "const gold = Number(core.resources?.gold) || 0;");
  }
  if (REVERT === "stat") {
    if (rel.endsWith("character-enhance.js"))
      swap("      const raw = Number(out[key]);\n      // 属性统一为整数：NaN/Infinity 归零，其余四舍五入收敛浮点长尾后叠加整数加成。\n      const value = Number.isFinite(raw) ? Math.round(raw) : 0;",
        "      const value = Number(out[key]) || 0;");
    if (rel.endsWith("ui-common.js"))
      swap("    const raw = Number(value);\n    // 先收敛到两位小数再显示：浮点长尾（0.30000000000000004）不会漏进面板，\n    // 0.10 显示成 0.1，整数直接输出；NaN/Infinity 一律按 0 处理。\n    const number = Number.isFinite(raw) ? Math.round(raw * 100) / 100 : 0;",
        "    const number = Number(value) || 0;");
  }
  if (REVERT === "notice" && rel.endsWith("update-notice-recent.js"))
    swap("莉莉丝元一律按整数结算：余额若被写成 1000.9 之类小数，先向下取整再判定与扣费，商店刷新、悬赏重摇等扣费点同口径，不会出现「扣完剩 0.9」；强化加成本身只加整数。本次起全部角色与怪物属性统一四舍五入取整（详见本期首条）。适用范围为局外已解锁的全部可玩角色（34 名解锁后均可强化，含自动解锁的管家与特殊角色）；未解锁角色不显示强化页签，敌方单位不参与，战斗中与副本中按钮置灰。", "");
  if (REVERT === "scope" && rel.endsWith("ui-info.js"))
    swap('const canEnhance = !!u.id && u.side !== "enemy" && !u.locked;',
      'const canEnhance = u.id === "lokar" && u.side !== "enemy" && !u.locked;');
  return s;
}
const src = f => text(`src/original/${f}`);

function freshCtx() {
  const ctx = vm.createContext({ console, Date, Math, JSON, Object, Array, String, Number, Promise });
  ctx.window = ctx;
  return ctx;
}
const load = (ctx, f) => vm.runInContext(src(f), ctx, { filename: f });
const tpl = { id: "lokar", name: "罗卡尔", stats: { maxHp: 130, attack: 6, magic: 4, speed: 8 } };
const baseStats = { attack: 0, magic: 0, speed: 0, maxHp: 10, bloodlust: 1, handLimit: 0, drawPerTurn: 0, initialDraw: 2 };
const KEYS = ["maxHp", "attack", "magic", "speed"];
const RUN = { layers: [[{ id: "n1-0", done: true }]], current: "n1-0", party: ["lokar"], activeParty: ["lokar"] };

function coreCtx() {
  const ctx = freshCtx();
  ctx.GameData = { characters: [tpl], baseDeck: [], eliteCards: [], protectedBaseDeck: [], initialShopCardNames: [] };
  ctx.GameRandom = { snapshot: () => ({}), sample: () => null, int: () => 0, create: () => ({}) };
  ctx.GameEconomy = { shop: { refreshCost: 500 }, relic: { smeltGold: 180 }, startingGold: 0, missionRewards: {}, dungeonGold: {} };
  ["character-progression.js", "character-enhance.js", "store-state-factory.js",
    "local-core-utils.js", "local-core-character.js", "local-core-commerce.js", "local-core-bounty.js",
    "local-core.js", "server-core-apply.js", "server-core.js", "store-compact.js"].forEach(f => load(ctx, f));
  ctx.GameStore = { baseStats: () => ({ ...baseStats }) };
  ctx.StoreRepairs = { cardKey: () => "", repairCard: c => c };
  load(ctx, "store-migration-characters.js");
  return ctx;
}
const E0 = coreCtx().CharacterEnhance;
const zero = () => ({ maxHp: 0, attack: 0, magic: 0, speed: 0 });
const pick = s => ({ maxHp: s.maxHp, attack: s.attack, magic: s.magic, speed: s.speed });
function mkState(gold, enhance, extra = {}) {
  return {
    resources: { gold, essence: 0, relics: [] },
    chars: [{ id: "lokar", name: "罗卡尔", locked: false, level: 3, exp: 0, hp: 200, stats: {}, ...(enhance ? { enhance } : {}) }],
    random: {}, deck: [], shopCards: [], bounties: [], pendingBountyRewards: [],
    flags: {}, ownedSkins: {}, equippedSkins: {}, unlockedDifficulties: ["normal"],
    unlockedShopCards: [], defeatedElites: [], dungeonUnlocks: {}, view: "hall",
    ...extra,
  };
}
function allCharacters() {
  const ctx = freshCtx();
  ctx.GameEconomy = { missionRewards: {}, dungeonGold: {}, startingGold: 0 };
  ["data-characters-core.js", "data-characters-extra.js",
    "data-future-characters.js", "data-new-characters.js", "data-characters.js"].forEach(f => load(ctx, f));
  return ctx.GameDataCharacters;
}
function uiCtx() {
  const ctx = freshCtx();
  ctx.GameUIInfoMarks = () => ({ greenHatMark: "", foodMark: "", rageMark: "", tankShellMark: "", vulnerableMark: "", missionMark: "", idolSuitMark: "", karunaSuitMark: "", domeSuitMark: "", jokerSuitMark: "", artinaSuitMark: "", deathWaveSuitMark: "", mariaBlessingMark: "", mariaNumberMark: "" });
  ctx.CharacterEnhance = E0;
  ctx.SkinSystem = { forChar: () => [], owned: () => false };
  ctx.GameData = { characters: [tpl], unlockHints: {}, statDefs: [] };
  ctx.RelicSystem = { statsOf: () => ({}), equippedBy: () => null, availableCount: () => 0 };
  const U = { esc: s => String(s ?? ""), face: () => "", formatStat: v => String(v), statHtml: () => "", skillsOf: () => [], skillName: () => "", skillText: () => "", combatRoleBadges: () => "", relicLabel: () => "" };
  load(ctx, "ui-info.js");
  ctx.state = { view: "hall", resources: { gold: 5000 }, chars: [tpl], infoTab: "enhance" };
  return { ctx, UI: ctx.GameUIInfo(U) };
}

(async () => {
  const ctx = coreCtx();
  const E = ctx.CharacterEnhance;

  // ---------- A. 莉莉丝元整数收口（真实结算层） ----------
  const goldCases = [
    [1000.9, true, 0, "1000.9→1000 可强化，余额 0（不再是 0.9）"],
    [1000.1, true, 0, "1000.1→1000 可强化，余额 0"],
    [1001.9, true, 1, "1001.9→1001 可强化，余额 1"],
    [999.9, false, 999.9, "999.9→999 拒绝，余额不写回"],
    [0.5, false, 0.5, "0.5→0 拒绝"],
    [-3.2, false, -3.2, "负数→0 拒绝"],
    ["1000.9", true, 0, "字符串小数→1000 可强化"],
    [5000, true, 4000, "正常整数 5000→4000"],
    [1000, true, 0, "恰好 1000→0"],
    [999, false, 999, "999 拒绝"],
  ];
  for (let i = 0; i < goldCases.length; i++) {
    const [gold, wantOk, wantGold, name] = goldCases[i];
    const st = mkState(gold);
    const r = await ctx.ServerCore.call("enhanceChar", { id: "lokar", stat: "attack" }, st);
    T(`A${i + 1} ${name}`, r.ok === wantOk && st.resources.gold === wantGold,
      { ok: r.ok, gold: st.resources.gold });
  }
  const CG = ctx.LocalCoreUtils.cleanGold;
  [["1000.9", 1000], [0.9, 0], [-5, 0], [NaN, 0], [Infinity, 0], [-Infinity, 0],
    ["1234.9", 1234], [undefined, 0], [null, 0], [5000, 5000]].forEach(([v, w], i) => {
    T(`A11.${i + 1} cleanGold(${String(v)})=${w}`, CG(v) === w, CG(v));
  });
  T("A12 成功结算后余额必为整数（1000.9 / 1001.9 / 1000.1）", (() => {
    for (const g of [1000.9, 1001.9, 1000.1]) {
      const st = mkState(g);
      ctx.LocalCoreCharacterOps.enhanceChar(st, { id: "lokar", stat: "attack" });
      if (!Number.isInteger(st.resources.gold)) return false;
    }
    return true;
  })());
  T("A13 三处扣费点共用 cleanGold 且不再有裸 Number(gold)",
    ["local-core-character.js", "local-core-commerce.js", "local-core-bounty.js"].every(f =>
      src(f).includes("cleanGold(core.resources?.gold)") && !src(f).includes("Number(core.resources?.gold) || 0")));
  T("A14 cleanGold 由 LocalCoreUtils 统一导出",
    src("local-core-utils.js").includes("cleanGold,") && typeof CG === "function");
  T("A15 既有 clampResource/addResource 仍是向下取整（口径未被改写）",
    src("local-core-utils.js").includes("function clampResource(value) {")
    && src("local-core-utils.js").includes("function addResource(current, amount) {")
    && ctx.LocalCoreUtils.clampResource(1000.9) === 1000
    && ctx.LocalCoreUtils.addResource(100, 0.9) === 100);

  // ---------- B. 全部属性取整口径 ----------
  const F = (() => {
    const c = freshCtx();
    // formatStat 定义在 ui-common.js 内；三个拆分模块只在组合导出时被引用，桩化不影响本节。
    c.UICommonSkills = () => ({});
    c.UICommonArt = () => ({ face: () => "", artBox: () => "" });
    c.UICommonRelics = () => ({});
    load(c, "ui-common.js");
    return c.UICommon;
  })();
  T("B1 小数基数按整数口径收敛：40.82 + 1 → 42",
    E.withBonus({ maxHp: 100, attack: 40.82, magic: 5, speed: 11 }, { enhance: { attack: 1 } }).attack === 42);
  T("B2 9.6 + 1 → 11（模板基值已整数化，小数输入仍按整数收敛）",
    E.withBonus({ maxHp: 100, attack: 9.6, magic: 5, speed: 11 }, { enhance: { attack: 1 } }).attack === 11);
  T("B3 长尾 40.82000000000001 + 1 → 42",
    E.withBonus({ maxHp: 100, attack: 40.82000000000001, magic: 5, speed: 11 }, { enhance: { attack: 1 } }).attack === 42);
  T("B4 Infinity 基数收敛为加成值而非 Infinity（REVERT=stat 应打红）",
    E.withBonus({ maxHp: 100, attack: Infinity, magic: 5, speed: 11 }, { enhance: { attack: 1 } }).attack === 1,
    E.withBonus({ maxHp: 100, attack: Infinity, magic: 5, speed: 11 }, { enhance: { attack: 1 } }).attack);
  T("B5 生命值加成只取整且不受基数小数影响",
    E.withBonus({ maxHp: 124.5, attack: 6, magic: 4, speed: 8 }, { enhance: { maxHp: 2 } }).maxHp === 131);
  T("B6 formatStat 0.10 → '0.1'", F.formatStat(0.1) === "0.1");
  T("B7 formatStat 40.82 → '40.82'", F.formatStat(40.82) === "40.82");
  T("B8 formatStat 浮点长尾 → '0.3'", F.formatStat(0.30000000000000004) === "0.3");
  T("B9 formatStat 整数直接输出", F.formatStat(3) === "3" && F.formatStat(0) === "0");
  T("B10 formatStat Infinity → '0'（REVERT=stat 应打红）", F.formatStat(Infinity) === "0", F.formatStat(Infinity));
  T("B11 强化累计值显示为整数（每次加成 × 次数）",
    KEYS.every(k => Number.isInteger(E.BONUS[k] * 7)));
  T("B12 withBonus / formatStat 均前置收敛（静态）",
    src("character-enhance.js").includes("Number.isFinite(raw)")
    && src("ui-common.js").includes("Number.isFinite(raw)"));
  T("B13 全部属性取整：statsAt 统一 Math.round(raw) 且 3 级攻击为整数",
    src("character-progression.js").includes("stats[key] = Math.round(raw);")
    && Number.isInteger(ctx.CharacterProgression.statsAt(tpl, 3).attack));

  // ---------- C. 适用范围：是不是所有角色都可以强化 ----------
  const chars = allCharacters();
  T("C1 可玩角色总数 34", chars.length === 34, chars.length);
  T("C2 34 名角色 id 唯一且齐全", new Set(chars.map(c => c.id)).size === 34
    && ["lokar", "besta_doll", "catherine", "noa", "manny", "chiyo", "angelica"].every(id => chars.some(c => c.id === id)));
  const { UI } = uiCtx();
  const tabOf = u => UI.infoPanel(u, "enhance").includes('data-info-tab="enhance"');
  let allOk = true; const missing = [];
  chars.forEach(c => {
    const u = { id: c.id, name: c.name, locked: false, side: "ally", level: 3, enhance: {}, stats: {} };
    if (!tabOf(u)) { allOk = false; missing.push(c.id); }
  });
  T("C3 34 名已解锁可玩角色全部显示「角色强化」页签", allOk && missing.length === 0, missing);
  T("C4 未解锁角色不显示页签", !tabOf({ id: "manny", name: "曼妮", locked: true, side: "ally", level: 0, enhance: {}, stats: {} }));
  T("C5 敌方单位不显示页签", !tabOf({ id: "elite", name: "精英", locked: false, side: "enemy", level: 0, enhance: {}, stats: {} }));
  T("C6 战斗中我方单位页签保留但四按钮全灰", (() => {
    const { ctx: c2, UI: UI2 } = uiCtx();
    c2.state.view = "battle";
    const u = { id: "lokar", name: "罗卡尔", locked: false, side: "ally", level: 3, enhance: {}, stats: {} };
    const h = UI2.infoPanel(u, "enhance");
    return h.includes('data-info-tab="enhance"')
      && (h.match(/data-enhance-stat="[a-zA-Z]+"[^>]*disabled/g) || []).length === 4
      && h.includes("战斗中不可强化");
  })());
  T("C7 副本中页签保留但四按钮全灰", (() => {
    const { ctx: c2, UI: UI2 } = uiCtx();
    c2.state.view = "dungeon"; c2.state.explore = RUN;
    const u = { id: "lokar", name: "罗卡尔", locked: false, side: "ally", level: 3, enhance: {}, stats: {} };
    const h = UI2.infoPanel(u, "enhance");
    return h.includes('data-info-tab="enhance"')
      && (h.match(/data-enhance-stat="[a-zA-Z]+"[^>]*disabled/g) || []).length === 4
      && h.includes("副本中不可强化");
  })());
  {
    const st = mkState(5000); st.chars[0].locked = true;
    const r = await ctx.ServerCore.call("enhanceChar", { id: "lokar", stat: "magic" }, st);
    T("C8 结算层对未解锁角色拒绝且不扣费", !r.ok && st.resources.gold === 5000);
  }
  T("C9 freshState 用 GameData.characters 全量建角色（无遗漏）",
    src("store-state-factory.js").includes("chars: GameData.characters.map(makeCharacter)"));
  T("C10 自动解锁的特殊角色（凯瑟琳/诺亚）解锁后同样可强化",
    ["catherine", "noa"].every(id => tabOf({ id, name: id, locked: false, side: "ally", level: 3, enhance: {}, stats: {} })));

  // ---------- D. 副作用与旧档 ----------
  T("D1 正常整数链路零变化：恰好 1000 只加一项", (() => {
    const st = mkState(1000);
    ctx.LocalCoreCharacterOps.enhanceChar(st, { id: "lokar", stat: "attack" });
    return st.resources.gold === 0
      && JSON.stringify(E.levelsOf(st.chars[0])) === JSON.stringify({ ...zero(), attack: 1 });
  })());
  {
    const st = mkState(5000, zero());
    const r = await ctx.ServerCore.call("enhanceChar", { id: "lokar", stat: "speed" }, st);
    T("D2 5000 强化后余额 4000、四项只加速度 1",
      r.ok && st.resources.gold === 4000
      && JSON.stringify(E.levelsOf(st.chars[0])) === JSON.stringify({ ...zero(), speed: 1 }));
  }
  T("D3 旧档小数金币经读档规整为整数", (() => {
    const s = ctx.LocalCoreUtils.sanitize(mkState(1000.9), "enhanceChar");
    return s.resources.gold === 1000;
  })());
  T("D4 ServerCore 连续回写幂等（属性不重复叠加）", (() => {
    const st = mkState(5000, { maxHp: 1, attack: 0, magic: 0, speed: 0 });
    ctx.ServerCore.apply(st, ctx.LocalCoreUtils.sanitize(st, "enhanceChar"), { method: "enhanceChar", args: { id: "lokar", stat: "attack" } });
    const once = pick(st.chars[0].stats);
    ctx.ServerCore.apply(st, ctx.LocalCoreUtils.sanitize(st, "enhanceChar"), { method: "enhanceChar", args: { id: "lokar", stat: "attack" } });
    return JSON.stringify(once) === JSON.stringify(pick(st.chars[0].stats));
  })());
  T("D5 旧档 enhanceLevel 还原四项各 n 次（整数）",
    JSON.stringify(E.levelsOf({ enhanceLevel: 3 })) === JSON.stringify({ maxHp: 3, attack: 3, magic: 3, speed: 3 }));
  T("D6 小数金币成功结算只扣一个 1000、不重复扣费", (() => {
    const st = mkState(1000.9);
    ctx.LocalCoreCharacterOps.enhanceChar(st, { id: "lokar", stat: "magic" });
    return st.resources.gold === 0 && st.lastEnhance?.cost === 1000
      && E.levelOf(st.chars[0], "magic") === 1;
  })());
  {
    const st = mkState(1000.9);
    await ctx.ServerCore.call("enhanceChar", { id: "lokar", stat: "magic" }, st);
    T("D7 小数金币成功结算后加成与余额同时正确",
      st.resources.gold === 0 && E.levelOf(st.chars[0], "magic") === 1);
  }

  // ---------- E. 文案、装配、静态 ----------
  T("E1 公告写明金币整数结算与适用范围",
    src("update-notice-recent.js").includes("莉莉丝元一律按整数结算")
    && src("update-notice-recent.js").includes("34 名解锁后均可强化"));
  const manifest = JSON.parse(text("tools/publish-bundles.json"));
  const keys = Object.keys(manifest);
  const iEnh = keys.findIndex(k => manifest[k].includes("character-enhance.js"));
  const iUi = keys.findIndex(k => manifest[k].includes("ui-info.js"));
  T("E2 装配顺序：强化模块早于面板", iEnh === 0 && iEnh < iUi, { iEnh, iUi });
  T("E3 改动源码均不超 180 行硬约束",
    ["character-enhance.js", "local-core-utils.js", "local-core-character.js",
      "local-core-commerce.js", "local-core-bounty.js", "ui-common.js", "ui-info.js"].every(f =>
      src(f).split("\n").length <= 180));
  T("E4 面板金币显示已是向下取整（与结算同口径）",
    src("ui-info.js").includes("Math.floor(Number(state.resources?.gold) || 0)"));
  T("E5 公告总行数仍在 150 行以内",
    src("update-notice-recent.js").split("\n").length <= 150,
    src("update-notice-recent.js").split("\n").length);

  console.log(`${pass}/${total}` + (reds.length ? `  REDS=${reds.length}` : ""));
  if (REVERT) console.log(`REVERT=${REVERT} REDS=${JSON.stringify(reds)}`);
  process.exit(pass === total ? 0 : 1);
})().catch(err => { console.error(err); process.exit(2); });
