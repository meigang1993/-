// 【角色强化·副本置灰】严格复查：统一判定源、面板置灰、动作层守卫、其它 BUG 与副作用。
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
    if (!s.includes(from)) throw new Error(`REVERT=${REVERT} must hit ${rel}: ${from.slice(0, 80)}`);
    s = s.replace(from, to);
  };
  if (REVERT === "reason" && rel.endsWith("character-enhance.js")) {
    swap('if (state?.explore || view.startsWith("dungeon")) return "副本中不可强化";', "");
  }
  if (REVERT === "panel" && rel.endsWith("ui-info.js")) {
    swap("!u.locked && !blocked && !maxed", "!u.locked && !maxed");
  }
  if (REVERT === "guard" && rel.endsWith("hall-enhance-actions.js")) {
    swap('if (enhance?.blockedReason?.(actionState)\n    || actionState.explore || String(actionState.view || "").startsWith("dungeon")\n    || actionState.view === "battle") return false;', "");
  }
  if (REVERT === "notice" && rel.endsWith("update-notice-recent.js")) {
    swap("副本进行中（含副本内战斗、节点结算、仓库与远征确认界面）", "");
  }
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
const BONUS = { maxHp: 3, attack: 1, magic: 1, speed: 1 };
const RUN = { layers: [[{ id: "n1-0", done: true }]], current: "n1-0", party: ["lokar"], activeParty: ["lokar"] };

function coreCtx() {
  const ctx = freshCtx();
  ctx.GameData = { characters: [tpl], baseDeck: [], eliteCards: [], protectedBaseDeck: [], initialShopCardNames: [] };
  ctx.GameRandom = { snapshot: () => ({}), sample: () => null, int: () => 0, create: () => ({}) };
  ctx.GameEconomy = { shop: { refreshCost: 500 }, relic: { smeltGold: 180 }, startingGold: 0 };
  ["character-progression.js", "character-enhance.js", "store-state-factory.js",
    "local-core-utils.js", "local-core-character.js", "local-core.js",
    "server-core-apply.js", "server-core.js", "store-compact.js"].forEach(f => load(ctx, f));
  ctx.GameStore = { baseStats: () => ({ ...baseStats }) };
  ctx.StoreRepairs = { cardKey: () => "", repairCard: c => c };
  load(ctx, "store-migration-characters.js");
  return ctx;
}
const E = coreCtx().CharacterEnhance;
const zero = () => ({ maxHp: 0, attack: 0, magic: 0, speed: 0 });
const pick = s => ({ maxHp: s.maxHp, attack: s.attack, magic: s.magic, speed: s.speed });
function want(ctx, level, lv) {
  const base = { ...baseStats, ...ctx.CharacterProgression.statsAt(tpl, level) };
  return {
    maxHp: Math.round(base.maxHp + 3 * (lv.maxHp || 0)),
    attack: Math.round((base.attack + (lv.attack || 0)) * 100) / 100,
    magic: Math.round((base.magic + (lv.magic || 0)) * 100) / 100,
    speed: Math.round((base.speed + (lv.speed || 0)) * 100) / 100,
  };
}
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
function uiCtx() {
  const ctx = freshCtx();
  ctx.GameUIInfoMarks = () => ({ greenHatMark: "", foodMark: "", rageMark: "", tankShellMark: "", vulnerableMark: "", missionMark: "", idolSuitMark: "", karunaSuitMark: "", domeSuitMark: "", jokerSuitMark: "", artinaSuitMark: "", deathWaveSuitMark: "", mariaNumberMark: "", mariaBlessingMark: "" });
  ctx.CharacterEnhance = E;
  ctx.SkinSystem = { forChar: () => [], owned: () => false };
  ctx.GameData = { characters: [tpl], unlockHints: {} };
  ctx.RelicSystem = { statsOf: () => ({}) };
  const U = { esc: s => String(s ?? ""), face: () => "", formatStat: v => String(v), statHtml: () => "", skillsOf: () => [], skillName: () => "", skillText: () => "", combatRoleBadges: () => "", relicLabel: () => "" };
  load(ctx, "ui-info.js");
  return { ctx, UI: ctx.GameUIInfo(U) };
}
function panel(view, extra = {}) {
  const { ctx, UI } = uiCtx();
  const u = { id: "lokar", name: "罗卡尔", locked: false, level: 3, enhance: { maxHp: 1, attack: 0, magic: 0, speed: 2 }, stats: {} };
  ctx.state = { view, resources: { gold: 5000 }, chars: [u], ...extra };
  const html = UI.infoPanel(u, "enhance");
  return {
    html,
    disabled: (html.match(/data-enhance-stat="[a-zA-Z]+"[^>]*disabled/g) || []).length,
    tabs: html.includes('data-info-tab="enhance"'),
  };
}
function actionCtx() {
  const ctx = freshCtx();
  const calls = [];
  ctx.CharacterEnhance = E;
  ctx.ServerCore = { call: async (m, a) => { calls.push({ m, a }); return { ok: true, changed: true, message: "" }; } };
  ctx.log = () => {};
  ctx.render = () => {};
  ctx.persist = async () => {};
  load(ctx, "hall-enhance-actions.js");
  return { ctx, calls, run: vm.runInContext("enhanceCharacter", ctx) };
}

(async () => {
  // ---------- A. 统一判定源语义矩阵 ----------
  const cases = [
    ["hall", null, "", "大厅可用"],
    ["livingRoom", null, "", "起居室可用"],
    ["dungeon", RUN, "副本中不可强化", "副本主视图"],
    ["dungeonInventory", RUN, "副本中不可强化", "副本仓库"],
    ["dungeonConfirm", RUN, "副本中不可强化", "远征确认"],
    ["battle", RUN, "副本中不可强化", "副本内战斗优先按副本"],
    ["battleLoading", RUN, "副本中不可强化", "副本战斗加载"],
    ["rest", RUN, "副本中不可强化", "副本休息节点"],
    ["hall", RUN, "副本中不可强化", "run 残留态（视图已回大厅）"],
    ["battle", null, "战斗中不可强化", "普通战斗"],
    ["battleLoading", null, "战斗中不可强化", "普通战斗加载"],
    ["hall", null, "", "无 explore 且无副本视图"],
  ];
  cases.forEach(([view, explore, expected, name], i) => {
    T(`A${i + 1} ${name}`, E.blockedReason({ view, explore }) === expected,
      { view, explore: !!explore, got: E.blockedReason({ view, explore }), expected });
  });
  T("A13 畸形 state 不抛错", E.blockedReason(null) === "" && E.blockedReason({}) === ""
    && E.blockedReason({ view: 123, explore: 0 }) === "");
  T("A14 判定源不误伤余额/上限/未解锁（这些由面板与结算层分别处理）",
    E.blockedReason({ view: "hall", resources: { gold: 0 } }) === "");

  // ---------- B. 面板真实渲染：副本各视图四按钮全灰 ----------
  const scenes = [
    ["B1 大厅余额充足四按钮可点", "hall", {}, 0, ""],
    ["B2 副本主视图四按钮全灰", "dungeon", { explore: RUN }, 4, "副本中不可强化"],
    ["B3 副本仓库四按钮全灰", "dungeonInventory", { explore: RUN }, 4, "副本中不可强化"],
    ["B4 副本内战斗四按钮全灰且按副本提示", "battle", { explore: RUN }, 4, "副本中不可强化"],
    ["B5 远征确认四按钮全灰", "dungeonConfirm", { explore: RUN }, 4, "副本中不可强化"],
    ["B6 run 残留态（view=hall）仍全灰", "hall", { explore: RUN }, 4, "副本中不可强化"],
    ["B7 普通战斗四按钮全灰且按战斗提示", "battle", {}, 4, "战斗中不可强化"],
    ["B8 副本视图但 explore 已清空仍全灰", "dungeon", {}, 4, "副本中不可强化"],
  ];
  scenes.forEach(([name, view, extra, wantDisabled, wantReason]) => {
    const p = panel(view, extra);
    T(name, p.disabled === wantDisabled && (!wantReason || p.html.includes(wantReason)),
      { disabled: p.disabled, reason: wantReason, has: p.html.includes(wantReason) });
  });
  T("B9 副本中「角色强化」页签仍保留（可查看加成）", panel("dungeon", { explore: RUN }).tabs);
  T("B10 副本中四个按钮仍各自带自己的属性键",
    KEYS.every(k => panel("dungeon", { explore: RUN }).html.includes(`data-enhance-stat="${k}"`)));
  T("B11 副本提示优先于余额不足提示", (() => {
    const { ctx, UI } = uiCtx();
    const u = { id: "lokar", name: "罗卡尔", locked: false, level: 3, enhance: {}, stats: {} };
    ctx.state = { view: "dungeon", explore: RUN, resources: { gold: 0 }, chars: [u] };
    const html = UI.infoPanel(u, "enhance");
    return html.includes("副本中不可强化") && !html.includes("莉莉丝元不足");
  })());
  T("B12 面板写明副本与战斗不可强化", panel("hall").html.includes("副本进行中与战斗中不可强化"));
  T("B13 副本结束后恢复可点", panel("hall", { explore: null }).disabled === 0);
  T("B14 副本内金币很多也不能把按钮点亮", panel("dungeon", { explore: RUN, resources: { gold: 999999 } }).disabled === 4);

  // ---------- C. 动作层守卫：绕过置灰按钮也不扣费 ----------
  for (const [i, view, explore, label] of [
    [1, "dungeon", RUN, "副本主视图"],
    [2, "dungeonInventory", RUN, "副本仓库"],
    [3, "battle", RUN, "副本内战斗"],
    [4, "battle", null, "普通战斗"],
    [5, "hall", RUN, "run 残留态"],
  ]) {
    const { ctx, calls, run } = actionCtx();
    const st = mkState(5000, zero(), { view, explore });
    ctx.state = st;
    const ret = await run("lokar", "attack", st, () => true);
    T(`C${i} ${label}：动作层直接拒绝且不调用 ServerCore`,
      ret === false && calls.length === 0 && st.resources.gold === 5000
      && JSON.stringify(E.levelsOf(st.chars[0])) === JSON.stringify(zero()),
      { ret, calls: calls.length, gold: st.resources.gold });
  }
  {
    const { ctx, calls, run } = actionCtx();
    const st = mkState(5000, zero(), { view: "hall", explore: null });
    ctx.state = st;
    const ret = await run("lokar", "attack", st, () => true);
    T("C6 大厅正常链路不被误挡（守卫不扩大到据点）", ret === true && calls.length === 1, { ret, calls: calls.length });
  }
  {
    const { ctx, calls, run } = actionCtx();
    const st = mkState(5000, zero(), { view: "hall", explore: null });
    ctx.state = st;
    T("C7 结算前 isCurrent 失效仍走既有守卫", typeof run === "function" && calls.length === 0);
  }

  // ---------- D. 其它 BUG 与副作用复查（真实结算层） ----------
  const ctx = coreCtx();
  {
    const st = mkState(5000);
    const r = await ctx.ServerCore.call("enhanceChar", { id: "lokar", stat: "attack" }, st);
    T("D1 恰好 5000 可强化：扣费 5000、只加攻击 1",
      r.ok && st.resources.gold === 0
      && JSON.stringify(E.levelsOf(st.chars[0])) === JSON.stringify({ ...zero(), attack: 1 })
      && JSON.stringify(pick(st.chars[0].stats)) === JSON.stringify(want(ctx, 3, { ...zero(), attack: 1 })));
  }
  {
    const st = mkState(4999);
    const r = await ctx.ServerCore.call("enhanceChar", { id: "lokar", stat: "speed" }, st);
    T("D2 4999 拒绝且不扣费不加属性", !r.ok && st.resources.gold === 4999
      && JSON.stringify(E.levelsOf(st.chars[0])) === JSON.stringify(zero()));
  }
  {
    const bad = [undefined, "all", "__proto__", "maxHp2", 0, {}];
    for (let i = 0; i < bad.length; i++) {
      const st = mkState(5000);
      const r = await ctx.ServerCore.call("enhanceChar", { id: "lokar", stat: bad[i] }, st);
      T(`D3.${i + 1} 非法属性键 ${String(bad[i])} 拒绝且不扣费`, !r.ok && st.resources.gold === 5000);
    }
  }
  {
    const st = mkState(5000); st.chars[0].locked = true;
    const r = await ctx.ServerCore.call("enhanceChar", { id: "lokar", stat: "magic" }, st);
    T("D4 未解锁角色拒绝且不扣费", !r.ok && st.resources.gold === 5000);
  }
  {
    const st = mkState(5000, { maxHp: E.MAX_LEVEL, attack: 0, magic: 0, speed: 0 });
    const r1 = await ctx.ServerCore.call("enhanceChar", { id: "lokar", stat: "maxHp" }, st);
    const r2 = await ctx.ServerCore.call("enhanceChar", { id: "lokar", stat: "speed" }, st);
    T("D5 某项满级只挡该项，其它三项照常强化",
      !r1.ok && r2.ok && st.resources.gold === 0 && E.levelOf(st.chars[0], "speed") === 1);
  }
  T("D6 旧档 enhanceLevel=3 还原成四项各 3 次",
    JSON.stringify(E.levelsOf({ enhanceLevel: 3 })) === JSON.stringify({ maxHp: 3, attack: 3, magic: 3, speed: 3 }));
  T("D7 新旧字段并存以新档为准、不双算",
    JSON.stringify(E.levelsOf({ enhance: { maxHp: 1, attack: 0, magic: 0, speed: 0 }, enhanceLevel: 8 }))
      === JSON.stringify({ ...zero(), maxHp: 1 }));
  {
    const snap = ctx.GameStoreCompact.compactSaveData({
      chars: [{ id: "lokar", locked: false, level: 5, exp: 3, hp: 60, enhance: { maxHp: 2, attack: 1, magic: 0, speed: 4 } }],
      deck: [], shopCards: [], bounties: [], pendingBountyRewards: [], view: "hall",
    });
    const mig = ctx.StoreCharacterMigrations.migrateCharacter(tpl, snap.chars);
    T("D8 压缩存档保留四项且读档属性覆盖式重算",
      JSON.stringify(snap.chars[0].enhance) === JSON.stringify({ maxHp: 2, attack: 1, magic: 0, speed: 4 })
      && JSON.stringify(pick(mig.stats)) === JSON.stringify(want(ctx, 5, { maxHp: 2, attack: 1, magic: 0, speed: 4 })));
  }
  {
    const st = mkState(5000, { maxHp: 1, attack: 0, magic: 0, speed: 0 });
    ctx.ServerCore.apply(st, ctx.LocalCoreUtils.sanitize(st, "enhanceChar"), { method: "enhanceChar", args: { id: "lokar", stat: "attack" } });
    const once = pick(st.chars[0].stats);
    ctx.ServerCore.apply(st, ctx.LocalCoreUtils.sanitize(st, "enhanceChar"), { method: "enhanceChar", args: { id: "lokar", stat: "attack" } });
    T("D9 ServerCore 连续回写幂等（不重复叠加）", JSON.stringify(once) === JSON.stringify(pick(st.chars[0].stats)));
  }
  {
    const c = { id: "lokar", level: 2, exp: 0, enhance: { maxHp: 1, attack: 0, magic: 2, speed: 0 }, stats: {} };
    ctx.CharacterProgression.grant(c, 100000, tpl);
    T("D10 升级重算仍按各项保留加成",
      JSON.stringify(pick(c.stats)) === JSON.stringify(want(ctx, ctx.CharacterProgression.maxLevel, { maxHp: 1, attack: 0, magic: 2, speed: 0 })));
  }
  for (const [i, gold] of [NaN, -50, undefined, "5000"].entries()) {
    const st = mkState(gold);
    const r = await ctx.ServerCore.call("enhanceChar", { id: "lokar", stat: "magic" }, st);
    T(`D11.${i + 1} 畸形金币 ${String(gold)} 不产生 NaN/负余额`,
      (!r.ok || Number.isFinite(Number(st.resources.gold)) === false || Number(st.resources.gold) >= 0),
      { ok: r.ok, gold: st.resources.gold });
  }
  {
    const st = mkState(1000.9);
    const r = await ctx.ServerCore.call("enhanceChar", { id: "lokar", stat: "speed" }, st);
    T("D12 小数金币结算后余额为有限非负数（边界如实记录）",
      !r.ok || (Number.isFinite(Number(st.resources.gold)) && Number(st.resources.gold) >= 0),
      { ok: r.ok, gold: st.resources.gold });
  }
  T("D13 结算层 scope 只含 resources/chars，副本判定必须留在动作层",
    src("local-core-utils.js").includes("enhanceChar: { resources: true, chars: true },"));

  // ---------- E. 接线、装配、文案、静态 ----------
  T("E1 面板与动作层都调用同一判定源",
    src("ui-info.js").includes("enhance?.blockedReason?.(state)")
    && src("hall-enhance-actions.js").includes("enhance?.blockedReason?.(actionState)"));
  T("E2 blockedReason 由 CharacterEnhance 导出",
    src("character-enhance.js").includes("blockedReason,")
    && typeof E.blockedReason === "function");
  const manifest = JSON.parse(text("tools/publish-bundles.json"));
  const keys = Object.keys(manifest);
  const iEnh = keys.findIndex(k => manifest[k].includes("character-enhance.js"));
  const iUi = keys.findIndex(k => manifest[k].includes("ui-info.js"));
  const iHall = keys.findIndex(k => manifest[k].includes("hall-enhance-actions.js"));
  T("E3 装配顺序：强化模块在 startup 且早于面板与动作模块",
    iEnh === 0 && iEnh < iUi && iEnh < iHall, { iEnh, iUi, iHall });
  T("E4 公告写明副本进行中不可强化",
    src("update-notice-recent.js").includes("副本进行中（含副本内战斗、节点结算、仓库与远征确认界面）"));
  T("E5 置灰样式存在", text("publish/info-victory.css").includes(".enhance-action:disabled"));
  T("E6 动作层守卫位于 ServerCore 结算之前", (() => {
    const h = src("hall-enhance-actions.js");
    return h.indexOf("blockedReason?.(actionState)") < h.indexOf('ServerCore.call("enhanceChar"');
  })());
  T("E7 三个改动源码均不超 180 行硬约束",
    ["character-enhance.js", "ui-info.js", "hall-enhance-actions.js"].every(f =>
      src(f).split("\n").length <= 180));

  console.log(`${pass}/${total}` + (reds.length ? `  REDS=${reds.length}` : ""));
  if (REVERT) console.log(`REVERT=${REVERT} REDS=${JSON.stringify(reds)}`);
  process.exit(pass === total ? 0 : 1);
})().catch(err => { console.error(err); process.exit(2); });
