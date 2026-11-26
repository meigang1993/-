// 【为我护驾】深度排查专项：连击全分支、时停、手动响应、读档、无有效护驾者。
// 与 check-ophelia-guard-optional.js（描述/判定提前/单体杀）互补，专查 289/290 之后
// 仍可能残留的边界 BUG。真实 vm 装配 guest-ophelia-guard.js，不 mock 其内部逻辑。
// 反向：REVERT=dodgeMark|cancelMark|timestop|resumeGuard 精准打红对应组。
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ROOT = path.resolve(__dirname, "..");
const REVERT = String(process.env.REVERT || "").trim();
const results = [];
const check = (id, name, ok, extra) => {
  results.push({ id, ok: !!ok });
  console.log(`${ok ? "✅" : "❌"} ${id} ${name}${ok ? "" : "  ← " + JSON.stringify(extra || {})}`);
};
const INJECT = {
  dodgeMark: { "src/original/guest-ophelia-guard.js": [
    ["      card._opheliaGuardDone = true;\n      return { dodged: true, hpLoss: 0 };",
     "      return { dodged: true, hpLoss: 0 };"]] },
  cancelMark: { "src/original/guest-ophelia-guard.js": [
    ["    if (window.BondiSkills?.cancelKillCard?.(state, guard, card)) {\n      card._opheliaGuardDone = true;\n      return { dodged: false, hpLoss: 0 };\n    }",
     "    if (window.BondiSkills?.cancelKillCard?.(state, guard, card)) return { dodged: false, hpLoss: 0 };"]] },
  timestop: { "src/original/guest-ophelia-guard.js": [
    ["    if (window.MieryulaTimeStop?.isSkillDisabled?.(target)) return null;",
     ""]] },
};
function source() {
  let s = fs.readFileSync(path.join(ROOT, "src/original/guest-ophelia-guard.js"), "utf8");
  for (const [a, b] of (INJECT[REVERT] || {})["src/original/guest-ophelia-guard.js"] || []) {
    if (!s.includes(a)) throw new Error(`REVERT=${REVERT} 目标未命中: ${a.slice(0, 60)}`);
    s = s.replace(a, b, 1);
  }
  return s;
}

function sandbox(extra = {}) {
  const calls = { hit: [], log: [], resumed: 0, dodges: 0 };
  const ctx = {
    console, Math, Object, Array, String, Number, Boolean, JSON, Error, Promise,
    WeakMap, Map, Set, window: null, calls,
    BattleEffects: { animating: false, draining: false },
    BattleLines: { promptVisible: (b, k) => !!b?.[k], skill: () => {} },
    BattleLog: { add: (s, msg) => { (s.log ||= []).push(msg); calls.log.push(msg); } },
    BattleCards: {
      visibleHandCount: u => (u?.hand || []).length,
      put: () => {}, queueResponse: () => { calls.dodges += 1; },
    },
    CardUtils: {
      isSingleKill: c => !!(c && (c.type === "slash" || /杀(?:（[^）]*）)?$/.test(c.name || ""))
        && !c.targetless && !c.sweep && !c.allTargets && !c.aoeLineShown),
    },
    GameRandom: { id: () => "og1", sample: pool => pool[0], int: () => 3 },
    FloraCarlosSkills: { queueSpeedAssaultSettlement: () => {} },
    BondiSkills: { cancelKillCard: () => !!extra.cancelKill },
    NonokaLokiSkills: { afterCardResponded: () => {} },
    MieryulaTimeStop: {
      isSkillDisabled: u => !!(u?.statuses || []).includes("时停"),
      suppressesResponse: () => false,
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(source(), ctx, { filename: "guest-ophelia-guard.js" });
  const G = ctx.GuestOpheliaGuard({
    alive: u => !!u && u.hp > 0,
    visible: u => (u?.hand || []).filter(c => !c._pendingDraw),
    isSlash: c => c?.type === "slash" || /杀(?:（[^）]*）)?$/.test(c?.name || ""),
    line: () => {},
    isSingleKill: c => ctx.CardUtils.isSingleKill(c),
  });
  return { ctx, G, calls };
}
const units = (opt = {}) => {
  const ophelia = { uid: "a0", ref: "ophelia", side: "ally", name: "奥菲莉亚", hp: 100,
    hand: opt.opheliaHand || [], statuses: opt.timeStop ? ["时停"] : [] };
  const ally = { uid: "a1", ref: "lokar", side: "ally", name: "罗卡尔", hp: 100,
    hand: opt.guardHand || [], noResponse: !!opt.guardNoResponse };
  const enemy = { uid: "e0", side: "enemy", name: "敌人", hp: 100 };
  return { ophelia, ally, enemy };
};
const kill = extra => ({ name: "杀", type: "slash", gatlingRepeats: 3, ...(extra || {}) });
const state = (u, opt = {}) => ({ battle: {
  allies: [u.ophelia, u.ally], enemies: [u.enemy], animQueue: [], log: [], locked: true,
  roundNo: 1, activeUid: "e0",
  opheliaGuard: {
    actorUid: "e0", targetUid: "a0", amount: 7, source: "测试杀",
    card: kill(opt.card), remainingHits: opt.remainingHits ?? 2,
  },
  opheliaGuardRedirectUid: null, opheliaGuardRepeats: 0,
}, log: [] });
const api = (calls, opt = {}) => ({
  canDodge: () => true,
  draw: () => {},
  hitWithoutDodge: (s, a, t, amt) => { calls.hit.push({ target: t.uid, amt }); return { dodged: false, hpLoss: amt }; },
  finalizeDamage: () => {},
  afterDodged: () => {},
  resumeResponse: () => { calls.resumed += 1; },
});

// ── A. 静态：所有「本张杀已护驾」的出口都必须打标记 ──
const src = source();
const exits = [
  ["承伤分支", /opheliaGuardRedirectUid = guard\.uid;[\s\S]{0,600}?card\._opheliaGuardDone = true;/],
  ["护驾者出闪分支", /return \{ dodged: true, hpLoss: 0 \};[\s\S]{0,80}?card\._opheliaGuardDone = true;|card\._opheliaGuardDone = true;[\s\S]{0,200}?return \{ dodged: true, hpLoss: 0 \};/],
  ["邦迪使杀失效分支", /cancelKillCard[\s\S]{0,220}?card\._opheliaGuardDone = true;/],
  ["跳过 / 无有效角色分支", /p\.card\._opheliaGuardDone = true;/],
];
check("A1", "4 条结算出口都设 _opheliaGuardDone（连击剩余段不重复弹窗）",
  exits.every(([, re]) => re.test(src)), exits.filter(([, re]) => !re.test(src)).map(([n]) => n));
check("A2", "时停（技能失效）拦截在护驾判定之前",
  /if \(window\.MieryulaTimeStop\?\.isSkillDisabled\?\.\(target\)\) return null;/.test(src));
check("A3", "挂起时立即返回、跳过分支优先回到响应链",
  src.includes('if (skipped && typeof resume === "function") resume();')
  && fs.readFileSync(path.join(ROOT, "src/original/battle-damage-resolution.js"), "utf8")
    .includes("if (state.battle?.locked) return { dodged: false, hpLoss: 0 };"));

// ── B. 连击全分支 ──
// B1：护驾者出闪抵消 → 剩余段仍须打原目标，但本张杀已处理过护驾，不得再弹窗
{
  const { ctx, G, calls } = sandbox();
  const u = units({ guardHand: [{ name: "闪", type: "response" }] });
  const st = state(u);
  G.resolveOpheliaGuard(st, "a1", api(calls));
  const r = st.battle.manualDodgeResume;
  check("B1", "连击 3 段·护驾者出闪：剩余 2 段打原目标、card 带护驾完成标记",
    !!r && r.remainingHits === 2 && r.targetUid === "a0"
    && r.card?._opheliaGuardDone === true && calls.dodges === 1,
    { r, dodges: calls.dodges });
}
// B2：邦迪使杀牌失效 → 同样不得让剩余段重新弹窗
{
  const { G, calls } = sandbox({ cancelKill: true });
  const u = units({ guardHand: [{ name: "闪", type: "response" }] });
  const st = state(u);
  G.resolveOpheliaGuard(st, "a1", api(calls));
  const r = st.battle.manualDodgeResume;
  check("B2", "连击 3 段·cancelKillCard：剩余段 card 也带完成标记",
    !!r && r.card?._opheliaGuardDone === true, { r });
}
// B3：承伤分支（对照组，289 已修）
{
  const { G, calls } = sandbox();
  const u = units();
  const st = state(u);
  G.resolveOpheliaGuard(st, "a1", api(calls));
  const r = st.battle.manualDodgeResume;
  check("B3", "连击 3 段·承伤：第 1 段与剩余 2 段都指向护驾者",
    calls.hit.length === 1 && calls.hit[0].target === "a1"
    && !!r && r.targetUid === "a1" && r.card?._opheliaGuardDone === true,
    { calls: calls.hit, r });
}
// B4：被时停者不能发动非锁定技护驾
{
  const { G, calls } = sandbox();
  const u = units({ timeStop: true });
  const st = { battle: { allies: [u.ophelia, u.ally], enemies: [u.enemy], animQueue: [], log: [] }, log: [] };
  const r = G.guardOphelia(st, u.enemy, u.ophelia, 7, "测试杀", kill(), api(calls));
  check("B4", "奥菲莉亚被时停时护驾不挂起（技能失效）",
    r === null && !st.battle.opheliaGuard && !st.battle.locked,
    { r, pending: !!st.battle.opheliaGuard });
}
// B5：跳过护驾 + 手动响应模式不残留双重挂起
{
  const { G, calls } = sandbox();
  const u = units({ opheliaHand: [{ name: "闪", type: "response" }] });
  const st = state(u);
  // 真实流程：先由 resolveDamage → guardOphelia → pickManualGuard 建立挂起与
  // skipResume（手工摆 opheliaGuard 不会注册回调，会误判成产品 BUG）。
  const a = api(calls);
  st.battle.opheliaGuard = null; st.battle.locked = false;
  G.guardOphelia(st, u.enemy, u.ophelia, 7, "测试杀", kill(), a);
  st.battle.opheliaGuard.remainingHits = 2;
  G.resolveOpheliaGuard(st, null, a);
  check("B5", "跳过护驾：回到响应链、挂起解除、不残留 manualDodge 双挂起",
    calls.resumed === 1 && !st.battle.opheliaGuard && !st.battle.locked
    && !st.battle.manualDodge && st.battle.manualDodgeResume?.remainingHits === 2,
    { resumed: calls.resumed, locked: st.battle.locked,
      manualDodge: !!st.battle.manualDodge, resume: st.battle.manualDodgeResume });
}
// B6：无有效护驾者（指定了一个已阵亡的 uid）→ 不卡死
{
  const { G, calls } = sandbox();
  const u = units();
  u.ally.hp = 0;
  const st = state(u);
  const ok = G.resolveOpheliaGuard(st, "a1", api(calls));
  check("B6", "护驾者已阵亡：解锁、日志写明没有有效角色、不卡死",
    ok === true && !st.battle.opheliaGuard && !st.battle.locked
    && st.log.concat(st.battle.log).some(m => String(m).includes("没有有效角色")),
    { ok, locked: st.battle.locked, log: st.battle.log });
}
// B7：读档后 battle 对象被替换，skipResume 丢失时仍能结算、不卡死
{
  const { G, calls } = sandbox();
  const u = units();
  const st = state(u);
  st.battle = { ...st.battle };   // 模拟读档重建 battle 对象
  const ok = G.resolveOpheliaGuard(st, null, api(calls));
  check("B7", "读档重建 battle 后跳过护驾：仍解锁并完成命中，不卡死",
    ok === true && !st.battle.opheliaGuard && !st.battle.locked,
    { ok, locked: st.battle.locked });
}
// B8：双闪杀 + 护驾者 2 张闪 → 出两张、完成标记仍在
{
  const { G, calls } = sandbox();
  const u = units({ guardHand: [
    { name: "闪", type: "response" }, { name: "闪", type: "response" }] });
  const st = state(u, { card: { twoDodgesRequired: true } });
  G.resolveOpheliaGuard(st, "a1", api(calls));
  check("B8", "双闪杀：护驾者出 2 张闪、剩余段仍带完成标记",
    calls.dodges === 1 && u.ally.hand.length === 0
    && st.battle.manualDodgeResume?.card?._opheliaGuardDone === true,
    { dodges: calls.dodges, hand: u.ally.hand.length });
}
// B9：护驾者麻痹 → 按「没有闪」承伤，且剩余段指向护驾者
{
  const { G, calls } = sandbox();
  const u = units({ guardHand: [{ name: "闪", type: "response" }], guardNoResponse: true });
  const st = state(u);
  G.resolveOpheliaGuard(st, "a1", api(calls));
  check("B9", "护驾者麻痹：改为承受伤害、剩余段继续打护驾者",
    calls.hit.length === 1 && calls.hit[0].target === "a1"
    && st.battle.manualDodgeResume?.targetUid === "a1",
    { calls: calls.hit, resume: st.battle.manualDodgeResume });
}
// B10：群体杀不触发（判定收窄后回归）
{
  const { G, calls } = sandbox();
  const u = units();
  const st = { battle: { allies: [u.ophelia, u.ally], enemies: [u.enemy], animQueue: [], log: [] }, log: [] };
  const out = ["sweep", "allTargets", "aoeLineShown", "targetless"].map(k =>
    G.guardOphelia(st, u.enemy, u.ophelia, 7, "测试杀", kill({ [k]: true }), api(calls)));
  check("B10", "4 类全体杀均不触发护驾", out.every(r => r === null) && !st.battle.opheliaGuard, out);
}

const red = results.filter(r => !r.ok).map(r => r.id);
console.log(`\nREVERT=${REVERT || "none"} RED=${JSON.stringify(red)}`);
if (!REVERT) {
  console.log(`RESULT ${results.length - red.length}/${results.length}`);
  if (red.length) process.exit(1);
} else {
  const EXPECT = {
    dodgeMark: ["A1", "B1", "B8"], cancelMark: ["A1", "B2"],
    timestop: ["A2", "B4"],
  }[REVERT] || [];
  const same = JSON.stringify(red) === JSON.stringify(EXPECT);
  console.log(`EXPECTED=${JSON.stringify(EXPECT)} ${same ? "PRECISE_OK" : "PRECISE_FAIL"}`);
  process.exit(same ? 0 : 1);
}
