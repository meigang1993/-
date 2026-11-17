// 180 行以上文件「安全拆分 + 行数压缩」复查：装配完整性、函数体等价、字符串守恒、
// 运行时等价、副作用扫描。REVERT=order|export|fixture|body 为源码级反向验证。
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const cp = require("child_process");

const ROOT = path.join(__dirname, "../src/original");
const HEADROOT = "/data/workspace/_head_src/src/original";
const MANIFEST = path.join(__dirname, "publish-bundles.json");
const PUBLISH = path.join(__dirname, "../publish/bundles");
const REVERT = process.env.REVERT || "";
const RED_EXPECT = { order: "A3", export: "D1", fixture: "E7", body: "B" };

let pass = 0;
const reds = [];
function T(name, cond, extra) {
  const key = name.split(" ")[0];
  if (cond) { pass += 1; return; }
  reds.push(name);
  if (REVERT || process.env.VERBOSE) console.log(`  RED ${name}`, extra === undefined ? "" : JSON.stringify(extra).slice(0, 400));
}
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const exists = f => fs.existsSync(path.join(ROOT, f));
const headCache = {};
// 「拆分前基线」固定为 227 版最后一次记账提交 a9eddf7。
// 230 版推送后 HEAD 本身已是拆分后的源码，再拿 HEAD 当基线会让 store-repairs
// 的显式装配守卫因缺子模块而抛错（夹具失效，不是产品 BUG）。
const BASE_COMMIT = "a9eddf7";
function head(f) {
  if (headCache[f]) return headCache[f];
  const p = path.join(HEADROOT, f);
  const s = fs.existsSync(p)
    ? fs.readFileSync(p, "utf8")
    : cp.execFileSync("git", ["show", `${BASE_COMMIT}:src/original/${f}`], { cwd: path.join(__dirname, ".."), encoding: "utf8" });
  headCache[f] = s;
  return s;
}

// ── 工具：去注释 / 函数体 / 字符串 ────────────────────────────────────────────
function stripComments(src) {
  let out = "", i = 0, str = null, cm = null;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (cm === "line") { if (c === "\n") { cm = null; out += c; } i++; continue; }
    if (cm === "block") { if (c === "*" && n === "/") { cm = null; i += 2; continue; } i++; continue; }
    if (str) { out += c; if (c === "\\") { out += src[i + 1] || ""; i += 2; continue; } if (c === str) str = null; i++; continue; }
    if (c === "/" && n === "/") { cm = "line"; i += 2; continue; }
    if (c === "/" && n === "*") { cm = "block"; i += 2; continue; }
    if (c === '"' || c === "'" || c === "`") { str = c; out += c; i++; continue; }
    out += c; i++;
  }
  return out;
}
const norm = s => stripComments(s).replace(/\s+/g, "");
function bodies(src) {
  const out = {};
  const re = /\bfunction\s+([A-Za-z0-9_$]+)\s*\(([^)]*)\)\s*\{/g;
  let m;
  while ((m = re.exec(src))) {
    const name = m[1];
    let i = re.lastIndex, depth = 1, str = null, cm = null;
    while (i < src.length && depth > 0) {
      const c = src[i], n = src[i + 1];
      if (cm === "line") { if (c === "\n") cm = null; i++; continue; }
      if (cm === "block") { if (c === "*" && n === "/") { cm = null; i += 2; continue; } i++; continue; }
      if (str) { if (c === "\\") { i += 2; continue; } if (c === str) str = null; i++; continue; }
      if (c === "/" && n === "/") { cm = "line"; i += 2; continue; }
      if (c === "/" && n === "*") { cm = "block"; i += 2; continue; }
      if (c === '"' || c === "'" || c === "`") { str = c; i++; continue; }
      if (c === "{") depth++; else if (c === "}") depth--;
      i++;
    }
    (out[name] || (out[name] = [])).push(norm(src.slice(re.lastIndex, Math.max(re.lastIndex, i - 1))));
  }
  return out;
}
function strings(src) {
  const out = [];
  const s = stripComments(src);
  const re = /(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;
  let m;
  while ((m = re.exec(s))) out.push(m[2]);
  return out;
}
function diffMultiset(a, b) {
  const count = arr => { const o = {}; arr.forEach(x => { o[x] = (o[x] || 0) + 1; }); return o; };
  const ca = count(a), cb = count(b), miss = [];
  Object.keys(ca).forEach(k => { const d = ca[k] - (cb[k] || 0); for (let i = 0; i < d; i++) miss.push(k); });
  return miss;
}

// ── 收集拆分对 ───────────────────────────────────────────────────────────────
const guards = [];
for (const f of fs.readdirSync(ROOT).filter(x => x.endsWith(".js"))) {
  const s = read(f);
  const re = /\[([a-z0-9-]+)\] 模块未装配：([a-z0-9-]+\.js) 必须先于 ([a-z0-9-]+\.js) 加载/g;
  let m;
  while ((m = re.exec(s))) guards.push({ consumer: m[3], dep: m[2] });
}
const depsByConsumer = {};
guards.forEach(g => { (depsByConsumer[g.consumer] || (depsByConsumer[g.consumer] = [])).push(g.dep); });
const depList = [...new Set(guards.map(g => g.dep))];
let manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
if (REVERT === "order") {
  manifest = JSON.parse(JSON.stringify(manifest));
  const list = manifest["battle-skills"];
  const a = list.indexOf("maria-honor-blessing.js"), b = list.indexOf("artina-maria-skills.js");
  if (a >= 0 && b >= 0) { list[a] = "artina-maria-skills.js"; list[b] = "maria-honor-blessing.js"; }
}

// ── A 装配完整性 ─────────────────────────────────────────────────────────────
T("A1 拆分对数量", guards.length >= 12 && depList.length >= 12, { guards: guards.length, deps: depList.length });
T("A2 新模块文件全部存在", depList.every(exists), depList.filter(f => !exists(f)));
const orderBad = [];
guards.forEach(g => {
  for (const [bundle, list] of Object.entries(manifest)) {
    if (!Array.isArray(list)) continue;
    if (list.includes(g.consumer) && list.includes(g.dep) && list.indexOf(g.dep) > list.indexOf(g.consumer)) {
      orderBad.push(`${bundle}:${g.dep}@${list.indexOf(g.dep)}>${g.consumer}@${list.indexOf(g.consumer)}`);
    }
  }
});
T("A3 新模块在同一 bundle 内先于消费方", orderBad.length === 0, orderBad);
T("A4 所有 src/original js 不超过 180 行", (() => {
  const over = fs.readdirSync(ROOT).filter(f => f.endsWith(".js") && read(f).split("\n").length > 180);
  return over.length === 0 ? true : (T.info = over, false);
})(), T.info);
const globalNames = {};
let dupName = [];
depList.forEach(dep => {
  const m = read(dep).match(/window\.([A-Za-z0-9_]+)\s*=/);
  if (!m) { dupName.push(`${dep}:无全局名`); return; }
  if (globalNames[m[1]]) dupName.push(`${dep} 与 ${globalNames[m[1]]} 同名 ${m[1]}`);
  globalNames[m[1]] = dep;
});
T("A5 新模块全局名唯一", dupName.length === 0, dupName);
const usedBad = [];
guards.forEach(g => {
  const s = read(g.consumer);
  const name = (read(g.dep).match(/window\.([A-Za-z0-9_]+)\s*=/) || [])[1];
  if (!name || s.split(name).length - 1 < 2) usedBad.push(`${g.consumer} 只守卫未调用 ${g.dep}`);
});
T("A6 消费方确实调用新模块导出", usedBad.length === 0, usedBad);
const bundleFiles = fs.readdirSync(PUBLISH).filter(f => f.endsWith(".min.js"));
const bundleTexts = bundleFiles.map(f => fs.readFileSync(path.join(PUBLISH, f), "utf8"));
const bundleMissing = [];
depList.forEach(dep => {
  const name = (read(dep).match(/window\.([A-Za-z0-9_]+)\s*=/) || [])[1];
  if (!name) return;
  if (!bundleTexts.some(t => t.includes(name))) bundleMissing.push(`${dep}:${name}`);
});
T("A7 11 个 bundle 产物包含新模块全局名", bundleMissing.length === 0, bundleMissing);
T("A8 每个新模块都被消费方引用", depList.every(d => guards.some(g => g.dep === d)), depList.filter(d => !guards.some(g => g.dep === d)));

// ── B 函数体等价（HEAD 版 vs 拆分后 主+子） ──────────────────────────────────
const bodyMismatch = [], stringMissing = [], depFnChecked = [], depFnNew = [];
for (const [consumer, deps] of Object.entries(depsByConsumer)) {
  let hs;
  try { hs = head(consumer); } catch (e) { bodyMismatch.push(`${consumer}:HEAD读取失败 ${e.message}`); continue; }
  const hb = bodies(hs);
  deps.forEach(dep => {
    let ds = read(dep);
    if (REVERT === "body" && dep === "catherine-absorb-skills.js") ds = ds.replace("unit.hand.push(gained);", "/* removed */");
    const db = bodies(ds);
    Object.keys(db).forEach(name => {
      // HEAD 版无同名函数 = 拆分时把内联代码提取成新函数，靠 B2 字符串守恒兜底
      if (!hb[name]) { depFnNew.push(`${dep}:${name}`); return; }
      depFnChecked.push(`${dep}:${name}`);
      if (!db[name].some(x => hb[name].includes(x))) bodyMismatch.push(`${dep}:${name} ← ${consumer}`);
    });
  });
  const ns = read(consumer) + "\n" + deps.map(read).join("\n");
  const miss = diffMultiset(strings(hs), strings(ns));
  // 基线固定到 227 后，228~231 的文案演进允许变化；其余字符串必须守恒。
  // 公告渲染模板随条目扩充改写过，与拆分/压缩无关，按内容精确识别而非放宽整段。
  const allow = new Set(["满血角色不可指定", "恢复生命值"]);
  const isVersionText = x => x.includes('class="update-notice"');
  miss.filter(x => !allow.has(x) && !isVersionText(x))
    .forEach(x => stringMissing.push(`${consumer}:${x.slice(0, 60)}`));
}
T("B0 子模块搬出的函数有 HEAD 同名基线", depFnChecked.length >= 8, { checked: depFnChecked.length, extractedNew: depFnNew });
T("B1 拆出的函数体与 HEAD 版逐字等价", bodyMismatch.length === 0, bodyMismatch);
T("B2 拆分前后字符串字面量无丢失", stringMissing.length === 0, stringMissing.slice(0, 12));

// ── C 压缩语义（只删注释/空白，不删逻辑） ────────────────────────────────────
const compressed = ["battle-damage-resolution.js"];
const tokenDiff = [];
compressed.forEach(f => {
  let hs; try { hs = head(f); } catch (e) { tokenDiff.push(`${f}:HEAD读取失败`); return; }
  const ns = read(f);
  if (norm(hs) !== norm(ns)) {
    // 228/229 的真实逻辑改动允许；列出差异长度即可
    tokenDiff.push(`${f}: 去注释后 token 不同（head ${norm(hs).length} / now ${norm(ns).length}）`);
  }
});
T("C1 被压缩文件去注释后无逻辑漂移", tokenDiff.length === 0, tokenDiff);
let syntaxBad = [];
for (const f of fs.readdirSync(ROOT).filter(x => x.endsWith(".js"))) {
  try { new vm.Script(read(f), { filename: f }); } catch (e) { syntaxBad.push(`${f}:${e.message.slice(0, 80)}`); }
}
T("C2 全部 src/original js 语法可编译", syntaxBad.length === 0, syntaxBad);

// ── D 运行时等价 ────────────────────────────────────────────────────────────
function legacyState() {
  return {
    chars: [],
    battle: {
      allies: [{
        uid: "a0", ref: "angelica", name: "安洁莉卡", side: "ally", hp: 50,
        skills: [{ name: "狂战意志", type: "active" }, { name: "力量爆发", type: "passive" }, { name: "猩红暴走", type: "active" }],
        hand: [{ name: "猩红暴走", skillName: "猩红暴走", crimsonRampage: true }],
        deck: [], discard: [], consumed: [],
      }],
      enemies: [], played: [{ name: "猩红暴走", crimsonRampage: true }],
      pileStats: { deck: [], discard: [{ name: "猩红暴走", crimsonRampage: true }], consumed: [] },
    },
    log: [],
  };
}
function storeCtx(withSplit) {
  const win = {
    GameData: { characters: [
      { id: "angelica", name: "安洁莉卡", skills: [{ name: "狂战意志", type: "active", card: "berserkWill" }, { name: "力量爆发", type: "passive" }] },
      { id: "noa", name: "怪面诺亚", skills: [{ name: "淫气改造", type: "passive" }] },
    ] },
    UICommon: { skillsOf: u => u?.skills || [] },
    GameStoreBountyRepairs: { refreshBountyGold() {} },
    GameStoreSaveSchema: {}, RelicSystem: { normalizeNames: x => x, data: () => null },
    BattleLog: { add: (s, t) => (s.log || (s.log = [])).push(t) },
    BattleCards: { put() {}, syncStatusCards() {} },
    BattleLines: { skill() {} }, Math, JSON, Object, Array, Set, Map, String, Number, RegExp, console,
  };
  const ctx = vm.createContext(Object.assign({ window: win, GameData: win.GameData }, win));
  if (withSplit) vm.runInContext(read("store-merged-skills-repair.js"), ctx, { filename: "store-merged-skills-repair.js" });
  let main = read("store-repairs.js");
  if (REVERT === "export") main = main.replace("    normalizeMergedSkills,\n", "");
  const source = withSplit ? main : head("store-repairs.js");
  vm.runInContext(source, ctx, { filename: "store-repairs.js" });
  return { ctx, win };
}
function runStore(withSplit) {
  const { win } = storeCtx(withSplit);
  const state = legacyState();
  const changed = typeof win.StoreRepairs?.normalizeMergedSkills === "function"
    ? win.StoreRepairs.normalizeMergedSkills(state) : null;
  return { changed, snapshot: JSON.stringify(state) };
}
const dHead = runStore(false), dNew = runStore(true);
T("D1 旧档规范化运行时等价（拆后转发可用、结果逐字节一致）",
  dHead.changed === true && dNew.changed === true && dHead.snapshot === dNew.snapshot,
  { headChanged: dHead.changed, newChanged: dNew.changed, same: dHead.snapshot === dNew.snapshot });

function catherineCtx(withSplit) {
  const win = {
    GameData: { characters: [] },
    BattleLog: { add: (s, t) => (s.log || (s.log = [])).push(t) },
    BattleCards: { put() {}, syncStatusCards() {}, afterHandLost() {} },
    BattleLines: { skill() {} }, BattleStatusCards: { isStatus: () => false },
    NoaCharmSkills: { onHandGained() {} }, GameRandom: { sample: a => a[0] },
    Math, JSON, Object, Array, Set, Map, String, Number, RegExp, console,
  };
  const ctx = vm.createContext(Object.assign({ window: win, state: null }, win));
  vm.runInContext("window.state = null;", ctx);
  if (withSplit) vm.runInContext(read("catherine-absorb-skills.js"), ctx, { filename: "catherine-absorb-skills.js" });
  vm.runInContext(withSplit ? read("catherine-skills.js") : head("catherine-skills.js"), ctx, { filename: "catherine-skills.js" });
  return { ctx, win };
}
function runCatherine(withSplit) {
  const { win } = catherineCtx(withSplit);
  const card = { name: "洞察", type: "tactic", suit: "♠" };
  const state = {
    battle: {
      allies: [
        { uid: "c0", ref: "catherine", name: "凯瑟琳", side: "ally", hp: 30, stats: { magic: 0 }, tempMagic: 0, hand: [], skills: [{ name: "知识吸收" }] },
        { uid: "a1", name: "队友", side: "ally", hp: 30, stats: { magic: 0 }, tempMagic: 0, hand: [], pileStats: { discard: [card], consumed: [] } },
      ],
      enemies: [], animQueue: [], pileStats: { deck: [], discard: [], consumed: [] },
    },
    log: [],
  };
  win.state = state;
  win.CatherineSkills.afterCardPlayed(state, state.battle.allies[1], card);
  return JSON.stringify(state);
}
T("D2 知识吸收运行时等价", runCatherine(false) === runCatherine(true),
  { head: runCatherine(false).slice(0, 160), now: runCatherine(true).slice(0, 160) });

// ── E 副作用 ────────────────────────────────────────────────────────────────
const catalog = fs.readFileSync(path.join(__dirname, "qa-test-catalog.js"), "utf8");
T("E1 新测试已登记 QA 目录", catalog.includes("test-split-compact-recheck.js"), "未登记");
const mariaFixture = fs.readFileSync(path.join(__dirname, "test-maria-blessing-tempattack.js"), "utf8");
let fixtureText = mariaFixture;
if (REVERT === "fixture") fixtureText = fixtureText.replace('"maria-honor-blessing.js",\n', "");
T("E7 maria 夹具加载拆分依赖", /\[[^\]]*"maria-honor-blessing\.js"[^\]]*\]/.test(fixtureText.replace(/\n/g, " ")), "夹具缺依赖");
const sideEffects = fs.readFileSync(path.join(__dirname, "test-merge-skill-side-effects.js"), "utf8");
T("E8 旧档导出断言按主文件 return 检查", sideEffects.includes('mainRepairs.slice(mainRepairs.indexOf("return {"))'), "A2 断言过期");
const charm = fs.readFileSync(path.join(__dirname, "test-noa-stolen-hand-charm.js"), "utf8");
T("E9 手牌重判清单覆盖拆分后的主文件", charm.includes('"catherine-skills.js"'), "F1 清单漏项");
T("E10 bundle 数量与清单一致", bundleFiles.length >= 11, bundleFiles.length);

// ── F 反向验证：撤掉改动必须精准打红，无关段保持绿 ───────────────────────────
const prefix = name => name.split(" ")[0];
const redKeys = [...new Set(reds.map(prefix))];
T("F1 反向验证断言不空转", REVERT ? reds.length > 0 : reds.length === 0,
  { REVERT, reds: reds.length, keys: redKeys });
if (REVERT) {
  const expect = RED_EXPECT[REVERT];
  T("F2 反向红项精准落在预期段", redKeys.length === 1 && redKeys[0].startsWith(expect),
    { expect, got: redKeys });
}

console.log(`拆分/压缩复查：${pass} PASS / ${reds.length} FAIL  REVERT=${REVERT || "none"}`);
if (reds.length && !REVERT) { console.log(reds.map(r => "  RED " + r).join("\n")); process.exit(1); }
if (REVERT && reds.length === 0) { console.log("REVERT 未打红，断言空转"); process.exit(1); }
