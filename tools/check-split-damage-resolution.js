// battle-damage-resolution.js 安全拆分专项（290 版）。
// 拆出的子模块：battle-damage-resolution-modifiers.js（统一伤害数值修正链）。
//   A 静态：行数 / 装配点显式抛错 / bundle 顺序 / 护栏与源码视图登记 / 段确实搬走
//   B vm：拼接加载后导出接口与数值行为等价、漏加载快速失败
// 反向：REVERT=dropGuard|reorder|dropRegistry|dropSub 精准打红对应组。
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ROOT = path.resolve(__dirname, "..");
const REVERT = String(process.env.REVERT || "").trim();
const MAIN = "src/original/battle-damage-resolution.js";
const SUB = "src/original/battle-damage-resolution-modifiers.js";
const DEP = "BattleDamageResolutionModifiers";
const results = [];
const check = (id, name, ok, extra) => {
  results.push({ id, ok: !!ok });
  console.log(`${ok ? "✅" : "❌"} ${id} ${name}${ok ? "" : "  ← " + JSON.stringify(extra || {})}`);
};
const raw = p => fs.readFileSync(path.join(ROOT, p), "utf8");

// 反向注入：只在内存里改文本，不落盘
function read(p) {
  let s = raw(p);
  if (REVERT === "dropGuard" && p === MAIN) {
    s = s.replace(/if \(!window\.BattleDamageResolutionModifiers\) throw new Error\([^\n]*\);/,
      "/* no explicit throw */;");
  }
  if (REVERT === "dropSub" && p === SUB) {
    s = s.replace(/function compute\([\s\S]*?\n  \}\n  return \{ compute \};/,
      "function compute() { return { amount: 0, source: '', effectiveActor: null, tsBlocked: false, tsInStopped: false }; }\n  return { compute };");
  }
  return s;
}
function bundles() {
  let s = raw("tools/publish-bundles.json");
  if (REVERT === "reorder") {
    s = s.replace('"battle-damage-resolution-modifiers.js",\n    "battle-damage-resolution.js",',
      '"battle-damage-resolution.js",\n    "battle-damage-resolution-modifiers.js",');
  }
  return JSON.parse(s);
}
function guardText() {
  let s = raw("tools/check-split-assembly.js");
  if (REVERT === "dropRegistry") {
    s = s.replace(', "BattleDamageResolutionModifiers"', "")
      .replace(', "battle-damage-resolution-modifiers.js"', "");
  }
  return s;
}
function viewText() {
  let s = raw("tools/split-source-view.js");
  if (REVERT === "dropRegistry") {
    s = s.replace('\n  "battle-damage-resolution.js": ["battle-damage-resolution-modifiers.js"],', "");
  }
  return s;
}

const main = read(MAIN), sub = read(SUB);
const lines = p => read(p).split("\n").length;

// ── A. 静态 ──
check("A1", "主文件拆后低于 150 行", lines(MAIN) < 150, { lines: lines(MAIN) });
check("A2", "子模块独立挂载 window.BattleDamageResolutionModifiers 且 <=150 行",
  sub.includes(`window.${DEP} =`) && lines(SUB) <= 150, { lines: lines(SUB) });
const assemblyLine = main.split("\n").find(l => l.includes(DEP) && l.includes("if"));
check("A3", "装配点显式 throw、无 || {} 静默兜底",
  !!assemblyLine && !/\|\|\s*\{\s*\}/.test(assemblyLine)
  && /throw\s+new\s+Error/.test(main.slice(
    Math.max(0, main.indexOf(assemblyLine) - 200), main.indexOf(assemblyLine) + 600)));
let orderOk = true, orderDetail = [];
for (const [name, files] of Object.entries(bundles())) {
  if (!Array.isArray(files) || !files.includes(MAIN.replace("src/original/", ""))) continue;
  const mi = files.indexOf("battle-damage-resolution.js");
  const si = files.indexOf("battle-damage-resolution-modifiers.js");
  orderDetail.push({ name, si, mi });
  if (si < 0 || si > mi) orderOk = false;
}
check("A4", "所有含主文件的 bundle 里子模块都排在主文件之前",
  orderOk && orderDetail.length >= 1, orderDetail);
const g = guardText(), v = viewText();
check("A5", "装配护栏 SPLITS 与 depFiles 均登记新依赖",
  g.includes(`"${DEP}"`) && g.includes('"battle-damage-resolution-modifiers.js"'));
check("A6", "split-source-view.js 的 SUBS 登记拼接视图",
  v.includes('"battle-damage-resolution.js": ["battle-damage-resolution-modifiers.js"]'));
const MOVED = ["tacticDamage", "modifyOutgoingDamage", "modifyIncomingDamage",
  "immuneIncoming", "Math.max(1, Math.round(amount))", "sourceLabel",
  "tsStopped", "effectiveActor"];
check("A7", "修正链 8 处关键符号确实搬进子模块、主文件不再重复实现",
  MOVED.every(k => sub.includes(k))
  && !main.includes("Math.max(1, Math.round(amount))")
  && !main.includes("modifyOutgoingDamage"));
const KEPT = ["continueResponse", "guardOphelia", "return getHitWithoutDodge()(",
  "state.battle?.locked", "responseCards", "dodgeAsFlash", "autoDodge"];
check("A8", "响应链 / 护驾链 7 处关键符号仍在主文件（没搬错段）",
  KEPT.every(k => main.includes(k)));
check("A9", "主文件导出接口仍为 { resolveDamage, triggerWhiteLolita }",
  /return \{ resolveDamage, triggerWhiteLolita \};/.test(main));

// ── B. vm：拼接加载等价 + 漏加载快速失败 ──
function sandbox(withSub = true) {
  const calls = { hit: [], white: [] };
  const ctx = {
    console, Math, Number, Object, Array, JSON, String, Boolean, Error, Promise,
    window: null, calls,
  };
  ctx.window = ctx;
  ctx.BattleWhiteLolita = () => ({ triggerWhiteLolita: () => calls.white.push(1) });
  ctx.BattleLog = { add: () => {} };
  ctx.RuinsEliteSkills = { immuneIncoming: () => !!ctx.__immune };
  ctx.GerdaSkills = { allowKill: () => true };
  ctx.WithererSkills = { afterKillFailed: () => {}, refreshShiftState: () => {} };
  ctx.FloraCarlosSkills = { queueSpeedAssaultSettlement: () => {}, dodgeAsFlash: () => null };
  ctx.BondiSkills = { invalidateKillCard: () => false };
  ctx.ElranaAceNanaliSkills = { beforeKillTargeted: () => {}, modifySlashDamage: (_s, _a, _t, n) => n };
  ctx.NonokaLokiSkills = { sourceActor: () => null, sourceLabel: () => "标注来源" };
  ctx.MieryulaTimeStop = { isSkillDisabled: () => !!ctx.__ts, suppressesResponse: () => false };
  ctx.RuinsRelicEffects = {
    tacticDamage: (_s, _a, _c, n) => n, modifyIncomingDamage: (_s, _t, n) => n,
    beforeResponseCheck: () => {}, missileLauncherBlock: () => true,
  };
  ctx.BakarSkills = { modifyOutgoingDamage: (_s, _a, n) => n, modifyIncomingDamage: (_s, _t, n) => n };
  ctx.AngelicaLukaSkills = { modifyOutgoingDamage: (_s, _a, n) => n };
  ctx.RuinsWithererSkills = { modifyOutgoingDamage: (_s, _a, _t, n) => n };
  ctx.PreshiSkills = { modifyOutgoingDamage: (_s, _a, n) => n,
    modifyIncomingDamage: (_s, _t, n) => n, suppressesResponse: () => false };
  ctx.MieryulaSkills = { modifyOutgoingDamage: (_s, _a, n) => n };
  ctx.EnemySkills = { modifyDamage: (_s, _t, n) => n };
  ctx.RuinsCardSkills = { modifyIncomingDamage: (_s, _t, n) => n, beforeResponseCheck: () => {} };
  ctx.GuestCharacterSkills = { guardOphelia: () => null };
  vm.createContext(ctx);
  const src = (withSub ? read(SUB) + "\n" : "") + read(MAIN);
  vm.runInContext(src, ctx, { filename: "battle-damage-resolution.js" });
  const r = ctx.BattleDamageResolution({
    deps: { isKillCard: c => c?.type === "slash", draw: () => {} },
    utils: { queueAttackAnim: () => {} },
    needsResponse: () => false,
    canDodge: () => false,
    getResponseApi: () => ({ shouldManualDodge: () => false, queueManualDodge: () => {}, autoDodge: () => false }),
    getHitWithoutDodge: () => (_s, _a, _t, amount, source) => {
      calls.hit.push(amount); calls.source = source;
      return { dodged: false, hpLoss: amount, blockLoss: 0 };
    },
  });
  return { ctx, r, calls };
}
const state = () => ({ battle: { locked: false }, settings: {}, log: [] });
const actor = () => ({ side: "ally", name: "A", hand: [] });
const target = () => ({ side: "enemy", name: "B", hand: [], gender: "female", noResponse: false });
const card = () => ({ type: "slash", name: "杀" });
const hit = (r, amount) => r.resolveDamage(state(), target(), amount, "kill", actor(), card()).hpLoss;

try {
  const { r, calls } = sandbox(true);
  check("B1", "拼接加载后导出接口与拆分前一致",
    typeof r.resolveDamage === "function" && typeof r.triggerWhiteLolita === "function"
    && Object.keys(r).sort().join(",") === "resolveDamage,triggerWhiteLolita",
    { keys: Object.keys(r) });
  check("B2", "整数 / 小数 / 极小 / 零 / 负伤害收敛与拆分前一致",
    hit(r, 10) === 10 && hit(r, 13.5) === 14 && hit(r, 0.4) === 1
    && hit(r, 0) === 0 && hit(r, -3) === 0, calls.hit);
  check("B3", "sourceLabel 仍写回来源（子模块 return 的 source 没被丢弃）",
    calls.source === "标注来源", { source: calls.source });
  check("B4", "免疫判定置 0 且不被 Math.max(1,...) 抬成 1",
    (() => {
      const s = sandbox(true); s.ctx.__immune = true;
      return s.r.resolveDamage(state(), target(), 10, "kill", actor(), card()).hpLoss === 0;
    })());
  check("B5", "时停标记下 outgoing 链被抑制、数值仍收敛",
    (() => {
      const s = sandbox(true); s.ctx.__ts = true;
      return s.r.resolveDamage(state(), target(), 10, "kill", actor(), card()).hpLoss === 10;
    })());
  let threw = false;
  try { sandbox(false); } catch (e) { threw = /battle-damage-resolution-modifiers|模块未装配/.test(String(e)); }
  check("B6", "漏加载子模块时快速失败（显式抛错，不静默退化）", threw);
} catch (e) {
  check("B0", "vm 装配未抛异常", false, { error: String(e).slice(0, 200) });
}

const red = results.filter(r => !r.ok).map(r => r.id);
console.log(`\nREVERT=${REVERT || "none"} RED=${JSON.stringify(red)}`);
if (!REVERT) {
  console.log(`RESULT ${results.length - red.length}/${results.length}`);
  if (red.length) process.exit(1);
} else {
  const EXPECT = {
    dropGuard: ["A3", "B6"], reorder: ["A4"], dropRegistry: ["A5", "A6"],
    dropSub: ["A7", "B2", "B3", "B5"],
  }[REVERT] || [];
  const same = JSON.stringify(red) === JSON.stringify(EXPECT);
  console.log(`EXPECTED=${JSON.stringify(EXPECT)} ${same ? "PRECISE_OK" : "PRECISE_FAIL"}`);
  process.exit(same ? 0 : 1);
}
