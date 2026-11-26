// 290/291：`battle-damage-resolution.js` 拆分后的副作用严格复查。
// 与 check-split-damage-resolution.js（装配/导出/数值等价）互补，专查：
//   · 修正链 20+ 个钩子的调用顺序与次数是否逐条保持（拆分最易漂移的地方）
//   · 子模块是否往 battle state 写东西、是否重复挂全局名、是否有跨包依赖
//   · 免疫 / skipDamageModify / 时停 / sourceLabel 的边界在拆后是否仍成立
// 反向：REVERT=order|dup|state|shortcut 精准打红对应组。
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ROOT = path.resolve(__dirname, "..");
const REVERT = String(process.env.REVERT || "").trim();
const MAIN = "src/original/battle-damage-resolution.js";
const SUB = "src/original/battle-damage-resolution-modifiers.js";
const results = [];
const check = (id, name, ok, extra) => {
  results.push({ id, ok: !!ok });
  console.log(`${ok ? "✅" : "❌"} ${id} ${name}${ok ? "" : "  ← " + JSON.stringify(extra || {})}`);
};
const raw = p => fs.readFileSync(path.join(ROOT, p), "utf8");
function read(p) {
  let s = raw(p);
  if (REVERT === "order" && p === SUB) {
    // 把免疫判定挪到取整之后（源码注释明令禁止的顺序），应只红 A7。
    s = s.replace(`    if (!tsInStopped && window.RuinsEliteSkills?.immuneIncoming?.(state, target, effectiveCard)) {
      amount = 0;
    }
    amount = amount > 0 ? Math.max(1, Math.round(amount)) : 0;`,
      `    amount = amount > 0 ? Math.max(1, Math.round(amount)) : 0;
    if (!tsInStopped && window.RuinsEliteSkills?.immuneIncoming?.(state, target, effectiveCard)) {
      amount = 0;
    }`);
  }
  if (REVERT === "shortcut" && p === SUB) {
    s = s.replace(`    if (!effectiveCard?.skipDamageModify) {
      amount = window.EnemySkills?.modifyDamage(
        state, target, amount, effectiveCard) ?? amount;
    }`,
      `    amount = window.EnemySkills?.modifyDamage(
      state, target, amount, effectiveCard) ?? amount;`);
  }
  if (REVERT === "dup" && p === MAIN) {
    s = s.replace("const modifiers = window.BattleDamageResolutionModifiers({ deps });",
      "const modifiers = window.BattleDamageResolutionModifiers({ deps });\n  const modifiers2 = window.BattleDamageResolutionModifiers({ deps });");
  }
  if (REVERT === "state" && p === SUB) {
    s = s.replace("    return { amount, source, effectiveActor, tsBlocked, tsInStopped };",
      "    state.battle.__modifiersLeak = true;\n    return { amount, source, effectiveActor, tsBlocked, tsInStopped };");
  }
  return s;
}

// ── A. 静态：装配 / 全局名 / 跨包 / 顺序 / 无静默兜底 ──
const main = read(MAIN), sub = read(SUB);
const bundles = JSON.parse(raw("tools/publish-bundles.json"));
const bundleList = Object.entries(bundles).filter(([, f]) => Array.isArray(f) && f.includes("battle-damage-resolution.js"));
check("A1", "主文件与子模块只同处一个 bundle（无跨包依赖）",
  bundleList.length === 1 && bundleList.every(([, f]) => f.includes("battle-damage-resolution-modifiers.js")),
  bundleList.map(([n]) => n));
check("A2", "该 bundle 内子模块严格排在主文件之前",
  bundleList.every(([, f]) => f.indexOf("battle-damage-resolution-modifiers.js") < f.indexOf("battle-damage-resolution.js")));
const globals = {};
for (const f of fs.readdirSync(path.join(ROOT, "src/original")).filter(x => x.endsWith(".js"))) {
  const m = raw("src/original/" + f).match(/window\.([A-Za-z0-9_]+)\s*=/);
  if (m) (globals[m[1]] ||= []).push(f);
}
check("A3", "子模块全局名 BattleDamageResolutionModifiers 全库唯一",
  (globals.BattleDamageResolutionModifiers || []).length === 1
  && globals.BattleDamageResolutionModifiers[0] === "battle-damage-resolution-modifiers.js");
check("A4", "装配点显式 throw、无 || {} 静默兜底，且子模块不被重复实例化",
  /if \(!window\.BattleDamageResolutionModifiers\) throw new Error/.test(main)
  && !/\|\|\s*\{\s*\}/.test(main.split("\n").find(l => l.includes("BattleDamageResolutionModifiers") && l.includes("if")) || "")
  && (main.match(/BattleDamageResolutionModifiers\(\{ deps \}\)/g) || []).length === 1);
check("A5", "子模块无 state/battle 写入（无存档序列化副作用）",
  !/state\.battle\.[A-Za-z_]+\s*=/.test(sub) && !/window\.[A-Za-z_]+\s*=/.test(sub.slice(sub.indexOf("function compute"))));
// 注意用「调用点」而非函数名：主文件第 5 行是 `const { queueAttackAnim } = utils;`，
// 直接 indexOf("queueAttackAnim") 会命中解构行，把顺序判成错的。
// 主文件里有 3 处 queueAttackAnim(state...)：前两处是「杀不成立」提前返回分支，
// 只有最后一处是正常伤害链上的调用，用 lastIndexOf 取它。
const animCall = main.lastIndexOf("queueAttackAnim(state");
check("A6", "主文件仍保留响应前钩子、不可响应判定、动画与响应链顺序",
  main.indexOf("window.RuinsCardSkills?.beforeResponseCheck") < animCall
  && animCall < main.indexOf("const continueResponse")
  && main.indexOf("const continueResponse") < main.indexOf("const guarded")
  && main.indexOf("const guarded") < main.indexOf("return continueResponse();"),
  { animCall });
// 修正链逐条顺序（原文件 46~97 行）
const ORDER = ["tacticDamage", "BakarSkills?.modifyOutgoingDamage", "BondiSkills?.modifyOutgoingDamage",
  "AngelicaLukaSkills?.modifyOutgoingDamage", "RuinsWithererSkills?.modifyOutgoingDamage",
  "PreshiSkills?.modifyOutgoingDamage", "MieryulaSkills?.modifyOutgoingDamage",
  "EnemySkills?.modifyDamage", "BondiSkills?.modifyIncomingDamage",
  "BakarSkills?.modifyIncomingDamage", "PreshiSkills?.modifyIncomingDamage",
  "NonokaLokiSkills?.sourceLabel", "RuinsCardSkills?.modifyIncomingDamage",
  "RuinsRelicEffects?.modifyIncomingDamage", "RuinsEliteSkills?.immuneIncoming",
  "Math.max(1, Math.round(amount))"];
let pos = -1, orderOk = true;
for (const key of ORDER) {
  const at = sub.indexOf(key);
  if (at <= pos) { orderOk = false; break; }
  pos = at;
}
let badKey = null;
{ let p2 = -1; for (const k of ORDER) { const at = sub.indexOf(k); if (at <= p2) { badKey = k; break; } p2 = at; } }
check("A7", "修正链 16 个钩子逐条保持原顺序（含免疫在取整之前）", orderOk, { badKey });
check("A8", "skipDamageModify 仍短路 EnemySkills.modifyDamage",
  /if \(!effectiveCard\?\.skipDamageModify\) \{[\s\S]{0,160}?EnemySkills\?\.modifyDamage/.test(sub));

// ── B. vm：钩子调用次数 / 顺序 / 数值边界 ──
function sandbox(opt = {}) {
  const seq = [];
  const ctx = { console, Math, Object, Array, String, Number, Boolean, JSON, Error, Promise, window: null, seq };
  ctx.window = ctx;
  const rec = name => (...args) => { seq.push(name); return args[args.length - 1]; };
  ctx.BattleWhiteLolita = () => ({ triggerWhiteLolita: () => seq.push("whiteLolita") });
  ctx.BattleLog = { add: () => {} };
  ctx.GerdaSkills = { allowKill: () => true };
  ctx.BondiSkills = { invalidateKillCard: () => false,
    modifyOutgoingDamage: (s, a, n) => { seq.push("bondiOut"); return n; },
    modifyIncomingDamage: (s, t, n) => { seq.push("bondiIn"); return n; },
    suppressesResponse: () => false };
  ctx.ElranaAceNanaliSkills = { beforeKillTargeted: () => {}, modifySlashDamage: (s, a, t, n) => n };
  ctx.WithererSkills = { afterKillFailed: () => {}, refreshShiftState: () => {} };
  ctx.FloraCarlosSkills = { queueSpeedAssaultSettlement: () => {}, dodgeAsFlash: () => null };
  ctx.NonokaLokiSkills = { sourceActor: () => null,
    sourceLabel: () => { seq.push("sourceLabel"); return "标注来源"; } };
  ctx.MieryulaTimeStop = { isSkillDisabled: u => !!(u?.statuses || []).includes("时停"),
    suppressesResponse: () => false };
  ctx.RuinsRelicEffects = {
    tacticDamage: (s, a, c, n) => { seq.push("tacticDamage"); return n; },
    modifyIncomingDamage: (s, t, n) => { seq.push("relicIn"); return n; },
    beforeResponseCheck: () => seq.push("relicBeforeResponse"),
    missileLauncherBlock: () => true,
  };
  ctx.BakarSkills = { modifyOutgoingDamage: (s, a, n) => { seq.push("bakarOut"); return n; },
    modifyIncomingDamage: (s, t, n) => { seq.push("bakarIn"); return n; } };
  ctx.AngelicaLukaSkills = { modifyOutgoingDamage: (s, a, n) => { seq.push("angelicaOut"); return n; } };
  ctx.RuinsWithererSkills = { modifyOutgoingDamage: (s, a, t, n) => { seq.push("withererOut"); return n; } };
  ctx.PreshiSkills = { modifyOutgoingDamage: (s, a, n) => { seq.push("preshiOut"); return n; },
    modifyIncomingDamage: (s, t, n) => { seq.push("preshiIn"); return n; },
    suppressesResponse: () => false };
  ctx.MieryulaSkills = { modifyOutgoingDamage: (s, a, n) => { seq.push("mieryulaOut"); return n; } };
  ctx.EnemySkills = { modifyDamage: (s, t, n) => { seq.push("enemyDamage"); return n; } };
  ctx.RuinsCardSkills = { modifyIncomingDamage: (s, t, n) => { seq.push("cardIn"); return n; },
    beforeResponseCheck: () => seq.push("cardBeforeResponse") };
  ctx.RuinsEliteSkills = { immuneIncoming: () => { seq.push("immune"); return !!opt.immune; } };
  ctx.GuestCharacterSkills = { guardOphelia: () => null };
  vm.createContext(ctx);
  vm.runInContext(read(SUB) + "\n" + read(MAIN), ctx, { filename: "resolution-cluster.js" });
  const r = ctx.BattleDamageResolution({
    deps: { isKillCard: c => c?.type === "slash", draw: () => {} },
    utils: { queueAttackAnim: () => seq.push("queueAttackAnim") },
    needsResponse: () => false, canDodge: () => false,
    getResponseApi: () => ({ shouldManualDodge: () => false, queueManualDodge: () => {}, autoDodge: () => false }),
    getHitWithoutDodge: () => (s, a, t, amount, source) => {
      seq.push("hitWithoutDodge"); ctx.__lastSource = source;
      return { dodged: false, hpLoss: amount, blockLoss: 0 };
    },
  });
  return { ctx, r, seq };
}
const st = () => ({ battle: { locked: false }, settings: {}, log: [] });
const actor = (o = {}) => ({ side: "ally", name: "A", hand: [], ...o });
const target = (o = {}) => ({ side: "enemy", name: "B", hand: [], gender: "female", noResponse: false, ...o });
const card = (o = {}) => ({ type: "slash", name: "杀", ...o });
try {
  const { ctx, r, seq } = sandbox();
  const out = r.resolveDamage(st(), target(), 10, "kill", actor(), card());
  const EXPECT = ["whiteLolita", "tacticDamage", "bakarOut", "bondiOut", "angelicaOut",
    "withererOut", "preshiOut", "mieryulaOut", "enemyDamage", "bondiIn", "bakarIn",
    "preshiIn", "sourceLabel", "cardIn", "relicIn", "immune",
    "cardBeforeResponse", "relicBeforeResponse", "queueAttackAnim", "hitWithoutDodge"];
  check("B1", "20 个钩子按拆分前顺序各调用一次、无重复无遗漏",
    JSON.stringify(seq) === JSON.stringify(EXPECT), { seq, EXPECT });
  check("B2", "sourceLabel 写回的 source 透传到命中出口",
    ctx.__lastSource === "标注来源", { source: ctx.__lastSource });
  check("B3", "整数伤害原值落地、无静默多打一次",
    out.hpLoss === 10 && seq.filter(x => x === "hitWithoutDodge").length === 1, out);
  // skipDamageModify 必须短路 EnemySkills.modifyDamage，但其余 incoming 链仍在
  {
    const s = sandbox(); s.seq.length = 0;
    s.r.resolveDamage(st(), target(), 10, "kill", actor(), card({ skipDamageModify: true }));
    check("B4", "skipDamageModify 短路 EnemySkills.modifyDamage，其余钩子不丢",
      !s.seq.includes("enemyDamage") && s.seq.includes("cardIn") && s.seq.includes("immune"),
      { seq: s.seq });
  }
  // 时停：出牌方被标记 → outgoing 链按拆分前口径被抑制
  {
    const s = sandbox(); s.seq.length = 0;
    s.r.resolveDamage(st(), target({ statuses: ["时停"] }), 10, "kill", actor(), card());
    check("B5", "受术方被时停：incoming 链被抑制、免疫不生效、outgoing 链照常",
      !s.seq.includes("bondiIn") && !s.seq.includes("bakarIn")
      && !s.seq.includes("preshiIn") && !s.seq.includes("cardIn")
      && !s.seq.includes("relicIn") && !s.seq.includes("immune")
      && s.seq.includes("bakarOut"), { seq: s.seq });
  }
  // 免疫在取整之前：0 不能被抬成 1
  {
    const s = sandbox({ immune: true });
    const o = s.r.resolveDamage(st(), target(), 10, "kill", actor(), card());
    check("B6", "免疫置 0 且不被 Math.max(1,...) 抬成 1", o.hpLoss === 0, o);
  }
  // 小数 / 极小 / 零 / 负
  {
    const s = sandbox();
    const h = n => s.r.resolveDamage(st(), target(), n, "kill", actor(), card()).hpLoss;
    check("B7", "小数四舍五入、极小值抬到 1、零与负值归 0",
      h(13.5) === 14 && h(0.4) === 1 && h(0) === 0 && h(-3) === 0);
  }
  // 子模块无状态泄漏
  {
    const s = sandbox();
    const state = st();
    s.r.resolveDamage(state, target(), 10, "kill", actor(), card());
    check("B8", "拆分后 battle state 不新增任何 __modifiers* 字段",
      Object.keys(state.battle).every(k => !k.startsWith("__modifiers")), Object.keys(state.battle));
  }
} catch (e) {
  check("B0", "vm 装配未抛异常", false, { error: String(e).slice(0, 220) });
}

const red = results.filter(r => !r.ok).map(r => r.id);
console.log(`\nREVERT=${REVERT || "none"} RED=${JSON.stringify(red)}`);
if (!REVERT) {
  console.log(`RESULT ${results.length - red.length}/${results.length}`);
  if (red.length) process.exit(1);
} else {
  const EXPECT = { order: ["A7"], dup: ["A4"], state: ["A5", "B8"], shortcut: ["A8", "B4"] }[REVERT] || [];
  const same = JSON.stringify(red) === JSON.stringify(EXPECT);
  console.log(`EXPECTED=${JSON.stringify(EXPECT)} ${same ? "PRECISE_OK" : "PRECISE_FAIL"}`);
  process.exit(same ? 0 : 1);
}
