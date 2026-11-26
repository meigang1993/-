// 【为我护驾】非锁定技 + 判定提前 + 单体杀触发 + 连击续跑 专项严格检查。
//   A 静态：描述 / 提前 / 单体判据 / 按钮 / 绑定 / 跳过分支 / 连击标记 / 文档同步
//   B 行为：真实 vm 装配 guest-ophelia-guard.js
// 反向：REVERT=desc|threshold|button|bind|skip|handsharing|front|guard|single|combo|resume
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
  desc: { "src/original/data-characters-extra.js": [
    ['非锁定技，当你成为单体【杀】的目标时，你可以指定一名其他友方角色替你使用【闪】',
     '非锁定技，当你成为【杀】的目标且没有【闪】时，你必须指定一名其他友方角色替你使用【闪】']] },
  threshold: { "src/original/guest-ophelia-guard.js": [
    ['if (target?.ref !== "ophelia" || actor?.side !== "enemy" || !isSlash(card)) return null;',
     'if (target?.ref !== "ophelia" || actor?.side !== "enemy" || !isSlash(card) || (!card?.ignoreResponse && visible(target).some(c => api.canDodge(card, c)))) return null;']] },
  button: { "src/original/ui-hand.js": [
    ['<button data-ophelia-guard-skip="1"', '<button data-ophelia-guard-XX="1"']] },
  bind: { "src/original/battle-action-prompt-bindings.js": [
    ['document.querySelector("[data-ophelia-guard-skip]")', 'document.querySelector("[data-ophelia-guard-XX]")']] },
  skip: { "src/original/guest-ophelia-guard.js": [
    ['const skipped = uid === null || uid === "__ophelia_guard_skip__";',
     'const skipped = false;']] },
  handsharing: { "src/original/ui-battle-scene.js": [
    ['|| visible.dimensionVisible || visible.guardVisible',
     '|| visible.dimensionVisible']] },
  front: { "src/original/battle-damage-resolution.js": [
    ['resumeResponse: continueResponse', 'resumeResponse: null']] },
  guard: { "src/original/battle-damage-resolution.js": [
    ['if (state.battle?.locked) return { dodged: false, hpLoss: 0 };',
     '']] },
  single: { "src/original/guest-ophelia-guard.js": [
    ['if (!isSingleKill?.(card)) return null;', '']] },
  combo: { "src/original/guest-ophelia-guard.js": [
    ['p.card._opheliaGuardDone = true;', '']] },
  resume: { "src/original/guest-ophelia-guard.js": [
    ['if (skipped && typeof resume === "function") resume();',
     'if (false) resume();']] },
};
function read(rel) {
  let s = fs.readFileSync(path.join(ROOT, rel), "utf8");
  for (const [a, b] of (INJECT[REVERT] || {})[rel] || []) s = s.replace(a, b);
  return s;
}

// ── A. 静态 ──
const data = read("src/original/data-characters-extra.js");
const guard = read("src/original/guest-ophelia-guard.js");
const hand = read("src/original/ui-hand.js");
const binds = read("src/original/battle-action-prompt-bindings.js");
const docs03 = read("docs/03-角色与角色技能.txt");
const settings = read("docs/original/game-settings.md");
const notice = read("src/original/update-notice-recent.js");
const scene = read("src/original/ui-battle-scene.js");
const resolution = read("src/original/battle-damage-resolution.js");
const assembly = read("src/original/guest-characters-skills.js");

const text = (data.match(/name:\s*"为我护驾"[^\n]*?text:\s*"([^"]*)"/) || [])[1] || "";
check("A1", "描述限定「单体【杀】」、取消「且没有【闪】时」与「必须」，仍是「非锁定技，」",
  text.startsWith("非锁定技，") && text.includes("当你成为单体【杀】的目标时")
  && !text.includes("且没有【闪】时") && !text.includes("必须指定")
  && text.includes("你可以指定一名其他友方角色替你使用【闪】"), { text: text.slice(0, 100) });
check("A2", "发动判据不再含 visible(target).some(canDodge) 门槛",
  /if \(target\?\.ref !== "ophelia"[^;]+!isSlash\(card\)\) return null;/.test(guard)
  && !guard.includes("visible(target).some(c => api.canDodge(card, c))"));
check("A3", "提示条含「跳过（不发动）」按钮与后果 title，且写明非锁定技",
  hand.includes('data-ophelia-guard-skip="1"') && hand.includes("跳过（不发动）")
  && hand.includes("本次【杀】仍由原目标承受") && hand.includes("非锁定技·为我护驾"));
check("A4", "绑定按 opheliaGuard 挂起态排队，传 null 触发跳过分支",
  binds.includes('"为我护驾跳过失败", "opheliaGuard"')
  && binds.includes("BattleSystem.resolveOpheliaGuard(state, null, render)")
  && binds.includes("[data-ophelia-guard-skip]"));
check("A5", "resolveOpheliaGuard 有跳过分支：不 fallback 队友、日志「放弃发动」",
  guard.includes('const skipped = uid === null || uid === "__ophelia_guard_skip__";')
  && guard.includes("const unit = skipped ? null :")
  && guard.includes("放弃发动为我护驾，本次【杀】仍由原目标承受"));
check("A6", "docs/03 / 设定契约 / 公告同步，公告仍 149 行",
  docs03.includes("成为单体【杀】的目标") && !docs03.includes("且没有【闪】时")
  && settings.includes("判定顺序与触发范围修正")
  && settings.includes("CardUtils.isSingleKill")
  && notice.includes("触发范围收窄为「成为单体【杀】的目标」")
  && notice.trimEnd().split("\n").length === 149,
  { lines: notice.trimEnd().split("\n").length });
check("A7", "护驾挂起纳入 handSharing，锁定态跳过按钮不被置灰禁点",
  /const handSharing = [\s\S]{0,220}?visible\.guardVisible/.test(scene)
  && scene.includes("ophelia-guarding"));
// 响应链被抽成「前置闭包」：定义在前，但真正的调用 return continueResponse()
// 排在护驾判定之后。所以判据比的是「调用点」，不是函数定义的行号。
check("A8", "护驾判定提前到自动响应之前，且响应链闭包通过 resumeResponse 交出",
  resolution.indexOf("const continueResponse = () => {")
    < resolution.indexOf("const responseCards")
  && resolution.indexOf("const guarded = window.GuestCharacterSkills?.guardOphelia?.")
    < resolution.indexOf("return continueResponse();")
  && resolution.includes("resumeResponse: continueResponse"));
check("A9", "触发范围收窄为 CardUtils.isSingleKill（全体类杀牌不护驾）",
  guard.includes("if (!isSingleKill?.(card)) return null;")
  && assembly.includes("isSingleKill: card => !!window.CardUtils?.isSingleKill?.(card)"));
check("A10", "跳过分支设 _opheliaGuardDone 且优先回到响应链",
  guard.includes("p.card._opheliaGuardDone = true;")
  && guard.includes('if (skipped && typeof resume === "function") resume();')
  && guard.includes("const skipResume = new WeakMap()")
  && guard.includes("skipResume.delete(b)"));
check("A11", "挂起时立即返回，禁止继续自动响应耗掉自己的【闪】",
  resolution.indexOf("if (state.battle?.locked) return { dodged: false, hpLoss: 0 };")
  > resolution.indexOf("const guarded = window.GuestCharacterSkills?.guardOphelia?.")
  && resolution.indexOf("if (state.battle?.locked) return { dodged: false, hpLoss: 0 };")
  < resolution.indexOf("return continueResponse();"));

// ── B. 真实 vm 装配行为 ──
function sandbox() {
  const ctx = {
    console,
    window: null,
    BattleEffects: { animating: false, draining: false },
    BattleLines: { promptVisible: (b, key) => !!b?.[key] },
    BattleLog: { add: (s, msg) => { s.log = s.log || []; s.log.push(msg); } },
    BattleCards: { visibleHandCount: u => (u.hand || []).length, put: () => {}, queueResponse: () => {} },
    CardUtils: {
      isSingleKill: c => !!(c && (c.type === "slash" || /杀(?:（[^）]*）)?$/.test(c.name || ""))
        && !c.targetless && !c.sweep && !c.allTargets && !c.aoeLineShown),
      isSingleTarget: () => true,
    },
    GameRandom: { id: () => "x" },
    FloraCarlosSkills: { queueSpeedAssaultSettlement: () => {} },
    BondiSkills: { cancelKillCard: () => false },
    NonokaLokiSkills: { afterCardResponded: () => {} },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read("src/original/guest-ophelia-guard.js"), ctx,
    { filename: "guest-ophelia-guard.js" });
  return ctx;
}
const depsFor = ctx => ({
  alive: u => u.hp > 0,
  visible: u => u.hand || [],
  isSlash: c => c?.type === "slash" || /杀(?:（[^）]*）)?$/.test(c?.name || ""),
  line: () => {},
  isSingleKill: c => ctx.CardUtils.isSingleKill(c),
});
const makeApi = (calls, resumed) => ({
  canDodge: () => true,
  draw: () => {},
  hitWithoutDodge: (s, actor, target) => { calls.push({ actor: actor.uid, target: target.uid }); return { dodged: false, hpLoss: 5 }; },
  finalizeDamage: () => {},
  afterDodged: () => {},
  resumeResponse: () => { resumed.push(true); },
});
const units = () => {
  const ophelia = { uid: "a0", ref: "ophelia", side: "ally", name: "奥菲莉亚", hp: 100, hand: [{ name: "闪", type: "response" }] };
  const ally = { uid: "a1", ref: "lokar", side: "ally", name: "罗卡尔", hp: 100, hand: [] };
  const enemy = { uid: "e0", side: "enemy", name: "敌人", hp: 100 };
  return { ophelia, ally, enemy };
};
const singleKill = extra => ({ name: "杀", type: "slash", ...(extra || {}) });
const pendingState = (u, extra) => ({ battle: {
  allies: [u.ophelia, u.ally], enemies: [u.enemy], animQueue: [], log: [], locked: true,
  opheliaGuard: {
    actorUid: "e0", targetUid: "a0", amount: 7, source: "测试杀",
    card: singleKill(extra && extra.card),
    ...(extra && extra.prompt ? extra.prompt : {}),
  },
} });

// B1：自己手里有【闪】也能发动护驾（提前到自动响应之前的核心收益）
{
  const ctx = sandbox(), G = ctx.GuestOpheliaGuard(depsFor(ctx)), u = units();
  const state = { battle: { allies: [u.ophelia, u.ally], enemies: [u.enemy], animQueue: [], log: [] } };
  const r = G.guardOphelia(state, u.enemy, u.ophelia, 7, "测试杀", singleKill(), makeApi([], []));
  check("B1", "奥菲莉亚手上有【闪】时护驾仍能挂起（判定先于自动响应）",
    r === null && !!state.battle.opheliaGuard && state.battle.locked === true,
    { r, pending: !!state.battle.opheliaGuard, locked: state.battle.locked });
}

// B2：跳过（无 resumeResponse 兼容路径）→ 伤害落回原目标、不指定护驾者、解锁
{
  const ctx = sandbox(), G = ctx.GuestOpheliaGuard(depsFor(ctx)), u = units(), state = pendingState(u);
  const calls = [], resumed = [];
  const api = makeApi(calls, resumed); delete api.resumeResponse;
  const ok = G.resolveOpheliaGuard(state, null, api);
  check("B2", "跳过后伤害落回奥菲莉亚（非队友）、不指定护驾者、解锁并写放弃战报",
    ok === true && calls.length === 1 && calls[0].target === "a0"
    && state.battle.opheliaGuard === null && state.battle.opheliaGuardUid == null
    && state.battle.locked === false
    && (state.log || []).some(m => m.includes("放弃发动为我护驾")),
    { ok, calls, uid: state.battle.opheliaGuardUid, locked: state.battle.locked, log: state.log });
}

// B3：指定有效 uid 仍走发动路径（伤害转移给护驾者）
{
  const ctx = sandbox(), G = ctx.GuestOpheliaGuard(depsFor(ctx)), u = units(), state = pendingState(u);
  u.ophelia.hand = []; // 让反向组 threshold 只精准打红 A2/B1
  const calls = [], resumed = [];
  const ok = G.resolveOpheliaGuard(state, "a1", makeApi(calls, resumed));
  check("B3", "指定护驾者仍走发动路径（伤害转移给护驾者、不落回奥菲莉亚）",
    ok === true && calls.length === 1 && calls[0].target === "a1"
    && state.battle.opheliaGuard === null && state.battle.locked === false,
    { ok, calls, locked: state.battle.locked });
}

// B4：全体类杀牌不再触发护驾
{
  const ctx = sandbox(), G = ctx.GuestOpheliaGuard(depsFor(ctx)), u = units();
  const out = [];
  for (const extra of [{ sweep: true }, { allTargets: true }, { aoeLineShown: true }, { targetless: true }]) {
    const state = { battle: { allies: [u.ophelia, u.ally], enemies: [u.enemy], animQueue: [], log: [] } };
    const r = G.guardOphelia(state, u.enemy, u.ophelia, 7, "测试杀", singleKill(extra), makeApi([], []));
    out.push({ extra, r, pending: !!state.battle.opheliaGuard });
  }
  check("B4", "sweep / allTargets / aoeLineShown / targetless 四类全体杀均不挂起护驾",
    out.every(x => x.r === null && x.pending === false), out);
}

// B5：有 resumeResponse 时跳过后回到响应链，不再绕过响应直接扣血
{
  const ctx = sandbox(), G = ctx.GuestOpheliaGuard(depsFor(ctx)), u = units();
  const state = { battle: { allies: [u.ophelia, u.ally], enemies: [u.enemy], animQueue: [], log: [] } };
  const calls = [], resumed = [];
  G.guardOphelia(state, u.enemy, u.ophelia, 7, "测试杀", singleKill(), makeApi(calls, resumed));
  const ok = G.resolveOpheliaGuard(state, null, makeApi(calls, resumed));
  check("B5", "跳过后调用 resumeResponse 回到自动响应链（不调 hitWithoutDodge）",
    ok === true && resumed.length === 1 && calls.length === 0,
    { ok, resumed: resumed.length, calls });
}

// B6：连击杀（gatlingRepeats=3）只弹一次窗，剩余段数与标记正确
{
  const ctx = sandbox(), G = ctx.GuestOpheliaGuard(depsFor(ctx)), u = units();
  const state = pendingState(u, {
    card: { gatlingRepeats: 3 },
    prompt: { remainingHits: 2 },
  });
  const calls = [], resumed = [];
  G.resolveOpheliaGuard(state, null, makeApi(calls, resumed));
  const resume = state.battle.manualDodgeResume;
  check("B6", "连击 3 段：跳过后续跑剩余 2 段、目标仍是奥菲莉亚、本张杀已标记不重复弹窗",
    !!resume && resume.remainingHits === 2 && resume.targetUid === "a0"
    && resume.card?._opheliaGuardDone === true
    && state.battle.opheliaGuard === null,
    { resume, log: state.log });
}

// B7：连击杀（3 段）走「发动护驾」路径 —— 剩余 2 段继续打护驾者，不回奥菲莉亚。
{
  const ctx = sandbox(), G = ctx.GuestOpheliaGuard(depsFor(ctx)), u = units();
  u.ophelia.hand = [];
  const state = pendingState(u, {
    card: { gatlingRepeats: 3 }, prompt: { remainingHits: 2 },
  });
  const calls = [], resumed = [];
  G.resolveOpheliaGuard(state, "a1", makeApi(calls, resumed));
  const resume = state.battle.manualDodgeResume;
  check("B7", "连击 3 段发动护驾：剩余 2 段打护驾者、第 1 段伤害也由护驾者承担",
    calls.length === 1 && calls[0].target === "a1"
    && !!resume && resume.remainingHits === 2 && resume.targetUid === "a1"
    && resume.card?._opheliaGuardDone === true,
    { calls, resume });
}

// B8：带 _opheliaGuardDone 的后续连击段不再触发护驾弹窗。
{
  const ctx = sandbox(), G = ctx.GuestOpheliaGuard(depsFor(ctx)), u = units();
  const state = { battle: { allies: [u.ophelia, u.ally], enemies: [u.enemy], animQueue: [], log: [] } };
  const r = G.guardOphelia(state, u.enemy, u.ophelia, 7, "测试杀",
    singleKill({ _opheliaGuardDone: true }), makeApi([], []));
  check("B8", "后续连击段带 _opheliaGuardDone：不重复弹窗、不重复挂起",
    r === null && !state.battle.opheliaGuard && !state.battle.locked,
    { r, pending: !!state.battle.opheliaGuard });
}

const red = results.filter(r => !r.ok).map(r => r.id);
console.log(`\nREVERT=${REVERT || "none"} RED=${JSON.stringify(red)}`);
if (!REVERT) {
  console.log(`RESULT ${results.length - red.length}/${results.length}`);
  if (red.length) process.exit(1);
} else {
  const EXPECT = {
    desc: ["A1"], threshold: ["A2", "B1", "B5"], button: ["A3"], bind: ["A4"],
    skip: ["A5", "B2", "B5", "B6"], handsharing: ["A7"], front: ["A8"],
    guard: ["A11"], single: ["A9", "B4"], combo: ["A10", "B6"],
    resume: ["A10", "B5"],
  }[REVERT] || [];
  const same = JSON.stringify(red) === JSON.stringify(EXPECT);
  console.log(`EXPECTED=${JSON.stringify(EXPECT)} ${same ? "PRECISE_OK" : "PRECISE_FAIL"}`);
  process.exit(same ? 0 : 1);
}
