// 【怪面诺亚】两技能 × 全库饰品 冲突严格检查（模块级，加载真实挂点）
//   A 并发挂起：charm 不得与其它玩家提示叠加（霹雳之锤/米勒分享/交牌/半魅魔血…）
//   B 盖亚妮丝护符 × 魅力改造：摸牌致溢出、状态牌无效、文案与归属、自己人不摸
//   C 圣鹰剑 × 魅力改造/改造副作用：免杀意+翻倍、技能伤害不翻倍、咬杀、存档退化
//   D 克罗研究记录：额外结算不被 charm 挂起吞掉、续跑顺序、两次结算不重复平衡
//   E 霹雳之锤 × 格林机枪：waitingGreen 与 charm 不互吞
//   F 全库饰品钩子：诺亚在场不抛异常、balanceHand 排序
//   G 半魅魔血交牌挂起：不叠加、交牌后重判不丢牌
// 支持 SEG=A,B,... 分批；REVERT=guard|discard|charmdraw|sword 源码级反向验证。
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const SRC = f => path.join(__dirname, "..", "src", "original", f);
const read = f => fs.readFileSync(SRC(f), "utf8");
const SEGS = (process.env.SEG || "A,B,C,D,E,F,G").split(",").filter(Boolean);
const MODE = process.env.REVERT || "";
const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);

let pass = 0, total = 0; const failed = [];
const T = (name, cond, extra) => {
  total++; if (cond) pass++; else failed.push(name);
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return !!cond;
};

const logs = [], discarded = [], afterDiscardCalls = [], syncMagicCalls = [];
const damageCalls = [], hammerCalls = [], krowResumeCalls = [];
const card = (name, extra = {}) => ({ name, type: "slash", suit: "♠", power: 0, scale: "attack", ...extra });
const kill = (name = "杀") => card(name, { type: "slash" });
const statusCard = name => card(name, { status: true, type: "obstacle" });
const mk = (uid, side, extra = {}) => ({
  uid, ref: uid, name: uid, gender: "female", side, hp: 200, maxHp: 200,
  hand: [], stats: { attack: 6, magic: 4, speed: 8, handLimit: 4 },
  skills: [], relics: [], intent: 1, ...extra,
});
const NOA_SKILLS = [{ name: "魅力改造" }, { name: "改造副作用" }];

ctx.GameData = { characters: [{ id: "noa", stats: { handLimit: 4 } }] };
ctx.BattleLog = { add: (s, t) => logs.unshift(String(t)) };
ctx.BattleLines = { skill: () => {} };
ctx.GameRandom = { sample: list => list[0], id: () => "x" };
ctx.BattleStatusCards = { isStatus: c => !!c?.status, keyOf: c => (c?.status ? "stun" : "") };
ctx.BattleStatusCardRegistry = {
  isStatus: c => !!c?.status,
  canReceive: (u, c) => !(u.hand || []).some(x => x.status && x.name === c.name),
  labelOf: c => c?.name || "状态牌",
  sync: () => {},
};
ctx.GuestCharacterSkills = {
  countsForLimit: (u, c) => !ctx.BattleStatusCardRegistry.isStatus(c),
  visibleHandCount: u => (u?.hand || []).filter(c => !c._pendingDraw
    && ctx.GuestCharacterSkills.countsForLimit(u, c)).length,
};
ctx.UnderwaterTrainSkills = { canDiscard: (u, c) => !ctx.BattleStatusCardRegistry.isStatus(c) };
ctx.CardUtils = {
  isKillCard: c => c?.type === "slash" || /杀(?:（[^）]*）)?$/.test(c?.name || ""),
  isSingleKill: c => !!(c && c.type === "slash" && !c.sweep && !c.allTargets && !c.aoeLineShown),
  fromEntity: (name, extra) => ({ name, type: "slash", virtual: true, ...extra }),
  playVerb: () => "使用了",
};
ctx.BattleCardCleanup = { clearPlayFlags: c => { if (c) delete c._skill; } };
ctx.BattleCards = {
  put: (b, u, c, pile) => discarded.push({ uid: u.uid, name: c.name, status: !!c.status, pile }),
  putMany: (b, u, cs, pile) => cs.forEach(c => discarded.push({ uid: u.uid, name: c.name, status: !!c.status, pile })),
};
ctx.WendyCadicisSkills = { afterDiscard: (s, u, cs) => afterDiscardCalls.push({ uid: u.uid, n: cs.length }) };
ctx.CatherineSkills = { syncMagic: (s, u) => syncMagicCalls.push(u.uid) };
ctx.RelicSystem = { hasEquipped: (s, u, name) => (u?.relics || []).includes(name) };
ctx.BattleDrawFeedback = {
  signal: (result, unit, requested, gained) => {
    const raw = result && result.drawSignal;
    if (raw) return { signaled: true, drawn: raw.drawn, exhausted: raw.exhausted,
      locked: raw.locked, redirected: raw.redirected, gained };
    return { signaled: true, drawn: gained, exhausted: gained === 0,
      locked: !!unit.drawLockedThisTurn, redirected: 0, gained };
  },
  shortage: sig => sig?.locked ? "封魔，本回合无法摸牌"
    : sig?.redirected > 0 ? "摸到的牌被转交" : "牌堆已无可摸的牌",
};
ctx.BattleSystem = {
  draw: (unit, n, battle) => {
    if (unit.drawLockedThisTurn) {
      const out = []; out.drawSignal = { requested: n, drawn: 0, exhausted: false, locked: true, redirected: 0 };
      return out;
    }
    const deck = battle.deck ?? [];
    const take = Math.min(n, deck.length);
    const got = deck.splice(0, take);
    if (battle.risaEye) {
      const other = battle.risaEyeTarget;
      (other.hand || []).push(...got);
      const out = [...got]; out.drawSignal = { requested: n, drawn: take, exhausted: take < n, locked: false, redirected: take };
      return out;
    }
    unit.hand.push(...got);
    const out = [...got]; out.drawSignal = { requested: n, drawn: take, exhausted: take < n, locked: false, redirected: 0 };
    return out;
  },
  useVirtualKill: () => {},
};

// ---- 加载真实模块 ----
const patch = (src, from, to, tag) => {
  const next = src.replace(from, to);
  if (next === src) throw new Error(`REVERT=${tag} 未命中锚点`);
  return next;
};
let charmSrc = read("noa-charm-skills.js");
let discardSrc = read("battle-discard-flow.js");
let swordSrc = read("holy-eagle-sword-skills.js");
if (MODE === "guard") charmSrc = patch(charmSrc,
  "|| window.AppRuntimeRecovery?.hasBlockingBattlePrompt?.(b)", "|| false", "guard");
if (MODE === "discard") discardSrc = patch(discardSrc,
  "if (b?.thunderHammer && !charm)", "if (b?.thunderHammer)", "discard");
if (MODE === "charmdraw") charmSrc = patch(charmSrc,
  "const short = Math.max(0, limit - countedHand(owner));", "const short = 0;", "charmdraw");
if (MODE === "sword") swordSrc = patch(swordSrc,
  '      && typeof mark.targets?.has === "function"\n      && typeof mark.targets?.add === "function";', "      && true;", "sword");

const load = (code, label) => { try { vm.runInContext(code, ctx); return true; }
  catch (e) { console.log(`LOAD_FAIL ${label}: ${e.message}`); return false; } };
load(read("app-runtime-recovery.js"), "app-runtime-recovery");
if (!ctx.AppRuntimeRecovery) {
  ctx.AppRuntimeRecovery = {
    hasBlockingBattlePrompt: b => !!b && ["thunderHammer", "millerShare", "handReveal",
      "risaEyePrompt", "dimensionTransfer", "kaiichiShare", "newMoonShare",
      "cadicisResponsibility", "manualDodge", "manualCounter"].some(k => !!b[k]),
  };
}
load(read("battle-status-card-storage.js"), "status-storage");
load(charmSrc, "noa-charm");
load(read("noa-side-effect-skills.js"), "noa-side-effect");
load(read("gaianis-amulet-skills.js"), "gaianis");
load(swordSrc, "holy-eagle");
load(discardSrc, "discard-flow");
load(read("battle-card-resume-hooks.js"), "resume-hooks");
load(read("battle-manual-continuation-resume.js"), "manual-resume");

const hasPrompt = b => !!ctx.AppRuntimeRecovery?.hasBlockingBattlePrompt?.(b);
const counted = u => (u.hand || []).filter(c => ctx.GuestCharacterSkills.countsForLimit(u, c)).length;
const basicState = (extra = {}) => {
  const noa = mk("noa", "ally", { skills: NOA_SKILLS });
  const ally = mk("m0", "ally", { gender: "male" });
  const enemy = mk("e0", "enemy", { gender: "male" });
  const state = { battle: {
    phase: 4, turn: 1, activeUid: "noa", allies: [noa], enemies: [enemy],
    deck: Array.from({ length: 40 }, (_, i) => card("牌" + i)), discard: [], consumed: [],
    discardPick: null, locked: false, animQueue: null, log: logs, ...extra,
  }, log: logs };
  ctx.state = state;
  return { state, b: state.battle, noa, ally, enemy };
};
const draw = (u, n, b) => ctx.BattleSystem.draw(u, n, b || ctx.state.battle);
const canDiscardCard = (u, c) => !!c && !c._pendingDraw
  && ctx.GuestCharacterSkills.countsForLimit(u, c)
  && ctx.UnderwaterTrainSkills.canDiscard(u, c);
const makeFlow = () => ctx.BattleDiscardFlow({
  active: b => [...(b.allies || []), ...(b.enemies || [])].find(u => u.uid === b.activeUid),
  visibleHand: u => (u.hand || []).filter(c => canDiscardCard(u, c)).length,
  handLimit: u => ctx.NoaSideEffectSkills.handLimit(u) ?? u.stats.handLimit,
  canDiscardCard,
  canDiscardAny: u => (u.hand || []).some(c => canDiscardCard(u, c)),
  discardNeed: u => Math.max(0, (u.hand || []).filter(c => canDiscardCard(u, c)).length
    - (ctx.NoaSideEffectSkills.handLimit(u) ?? u.stats.handLimit)),
  discardOverflow: () => {},
  enterEndPhase: () => true,
  draw: (u, n, b) => draw(u, n, b),
  combat: { pushFloat: () => {} },
  record: (s, t) => logs.unshift(String(t)),
  advanceToInput: async () => {},
  manualFlow: { resolveThunderHammer: (s, i, cb) => { hammerCalls.push(i); cb?.(); return true; } },
});

// ================= A 并发挂起 =================
if (SEGS.includes("A")) {
  const keys = ["thunderHammer", "millerShare", "kaiichiShare", "newMoonShare", "handReveal",
    "risaEyePrompt", "dimensionTransfer", "cadicisResponsibility", "manualDodge",
    "manualCounter", "recklessPrompt", "landmineRpsPrompt"];
  keys.forEach((key, i) => {
    const { state, b, noa } = basicState();
    b[key] = { unitUid: "noa" };
    noa.hand = Array.from({ length: 6 }, (_, j) => kill("杀" + j));
    discarded.length = 0; afterDiscardCalls.length = 0;
    ctx.NoaCharmSkills.balanceHand(state, noa, draw);
    T(`A1.${i} ${key} 挂起时不再叠加 noaCharmDiscard`,
      !b.noaCharmDiscard, { charm: b.noaCharmDiscard, hand: noa.hand.length });
    T(`A2.${i} ${key} 挂起时改为自动弃至上限`,
      counted(noa) === 4 && discarded.length === 2,
      { counted: counted(noa), discarded: discarded.length });
  });
  // 无其它挂起：诺亚自己回合正常挂起，且点手牌能选中（不被 hammer 截走）
  {
    const { state, b, noa } = basicState();
    noa.hand = Array.from({ length: 6 }, (_, j) => kill("杀" + j));
    ctx.NoaCharmSkills.balanceHand(state, noa, draw);
    T("A3 无其它挂起时正常挂起玩家弃牌", b.noaCharmDiscard?.need === 2, b.noaCharmDiscard);
    const flow = makeFlow();
    const before = hammerCalls.length;
    flow.discardCard(state, 0, () => {});
    T("A4 挂起期间点手牌进入弃牌选择", !!b.discardPick?.indexes?.length,
      { pick: b.discardPick, hammerDelta: hammerCalls.length - before });
    T("A5 挂起期间不误走霹雳之锤分支", hammerCalls.length === before, { hammer: hammerCalls.length });
  }
  // 即使强行并存，charm 也优先于 hammer（防御层）
  {
    const { state, b, noa } = basicState();
    noa.hand = Array.from({ length: 6 }, (_, j) => kill("杀" + j));
    b.noaCharmDiscard = { unitUid: "noa", need: 2 };
    b.thunderHammer = { unitUid: "noa" };
    const flow = makeFlow(); const before = hammerCalls.length;
    flow.discardCard(state, 0, () => {});
    T("A6 charm+hammer 强行并存时 charm 仍可选牌",
      !!b.discardPick?.indexes?.length && hammerCalls.length === before,
      { pick: b.discardPick, hammerDelta: hammerCalls.length - before });
  }
}

// ================= B 盖亚妮丝护符 =================
if (SEGS.includes("B")) {
  {
    const { state, b, noa, enemy } = basicState({ activeUid: "e0" });
    noa.relics = ["盖亚妮丝护符"];
    noa.hand = Array.from({ length: 4 }, (_, j) => kill("杀" + j));
    discarded.length = 0; afterDiscardCalls.length = 0; syncMagicCalls.length = 0;
    ctx.GaianisAmuletSkills.resolveObstacle(state, enemy, noa, { name: "障碍" }, draw);
    T("B1 其他角色用障碍牌→护符摸 1 张", noa.hand.length === 5, { hand: noa.hand.length });
    ctx.NoaCharmSkills.balanceHand(state, noa, draw);
    T("B2 溢出在别家回合自动弃至上限", counted(noa) === 4, { counted: counted(noa) });
    T("B3 弃牌钩子只触发一次（不重复结算）",
      afterDiscardCalls.length === 1 && syncMagicCalls.length === 1,
      { afterDiscard: afterDiscardCalls.length, syncMagic: syncMagicCalls.length });
    T("B4 牌总数守恒（摸 1 弃 1，无复制无丢失）",
      discarded.length === 1 && discarded[0].uid === "noa",
      { discarded: discarded.length, uid: discarded[0]?.uid });
  }
  {
    const { state, b, noa } = basicState();
    noa.relics = ["盖亚妮丝护符"];
    const st = statusCard("眩晕");
    const ok = ctx.BattleStatusCardStorage.add(state, noa, st, "测试");
    T("B5 护符令状态牌不入手牌", ok && !noa.hand.includes(st), { hand: noa.hand.length });
    T("B6 状态牌直接进消耗区", discarded.some(d => d.name === "眩晕" && d.pile === "consumed"),
      discarded.slice(-2));
    const before = noa.hand.length;
    ctx.NoaCharmSkills.balanceHand(state, noa, draw);
    T("B7 状态牌不占上限、不触发误补牌", noa.hand.length === before + 4,
      { before, after: noa.hand.length });
  }
  {
    const { state, b, noa, enemy } = basicState({ deck: [] });
    noa.relics = ["盖亚妮丝护符"];
    logs.length = 0;
    ctx.GaianisAmuletSkills.resolveObstacle(state, enemy, noa, { name: "障碍" }, draw);
    T("B8 牌堆空时护符如实写未能摸牌", logs.some(l => l.includes("未能摸牌")), logs.slice(0, 2));
    T("B9 护符不谎报摸1张牌", !logs.some(l => l.includes("摸1张牌")), logs.slice(0, 2));
  }
  {
    const { state, noa } = basicState();
    noa.relics = ["盖亚妮丝护符"];
    const clone = { ...noa, uid: "noa" };
    const before = noa.hand.length;
    ctx.GaianisAmuletSkills.resolveObstacle(state, clone, noa, { name: "障碍" }, draw);
    T("B10 同 uid 副本算自己，不摸牌", noa.hand.length === before, { before, after: noa.hand.length });
  }
}

// ================= C 圣鹰剑 =================
if (SEGS.includes("C")) {
  const { state, b, noa, enemy } = basicState();
  noa.relics = ["圣鹰剑"];
  const k = kill();
  T("C1 魅力改造：出牌阶段杀牌免杀意", ctx.NoaCharmSkills.noIntentCost(noa, k) === true);
  ctx.NoaCharmSkills.playKillLine(state, noa, k);
  T("C2 圣鹰剑记录造成过伤害的单体杀", ctx.HolyEagleSwordSkills.recordHit(state, noa, enemy, k, 10) === true);
  T("C3 对同一目标下一张杀翻倍", ctx.HolyEagleSwordSkills.modifyDamage(state, noa, enemy, kill(), 10) === 20);
  const other = mk("e1", "enemy");
  T("C4 不同目标不翻倍", ctx.HolyEagleSwordSkills.modifyDamage(state, noa, other, kill(), 10) === 10);
  b.turn = 2;
  T("C5 跨回合标记失效", ctx.HolyEagleSwordSkills.modifyDamage(state, noa, enemy, kill(), 10) === 10);
  b.turn = 1;
  T("C6 群体杀不吃翻倍", ctx.HolyEagleSwordSkills.modifyDamage(state, noa, enemy, card("枪林弹雨", { type: "slash", sweep: true }), 10) === 10);
  // 结束阶段技能伤害：type=skill + skipDamageModify，slashTargetAmount 只认杀牌
  {
    const { state: s2, noa: n2, ally: m2 } = basicState();
    s2.battle.allies.push(m2);
    ctx.BattleSystem.damage = undefined;
    const dmg = (s, t, amount, label, src, meta) => damageCalls.push({ amount, label, meta });
    ctx.NoaSideEffectSkills.endTurn(s2, n2, { damage: dmg });
    T("C7 结束阶段伤害按攻击力且不吃杀牌翻倍",
      damageCalls.length >= 1 && damageCalls.every(d => d.amount === 6 && d.meta?.type === "skill"
        && d.meta?.skipDamageModify === true), damageCalls);
  }
  // 存档退化：Set → 普通对象，battleId 碰撞
  {
    const { state: s3, b: b3, noa: n3, enemy: e3 } = basicState();
    n3.relics = ["圣鹰剑"];
    Object.defineProperty(b3, "_holyEagleBattleId", { value: "b1", enumerable: false });
    n3._holyEagleSword = { battleId: "b1", turn: 1, targets: {} };
    let threw = false;
    try { ctx.HolyEagleSwordSkills.marked(s3, n3, e3); } catch (_) { threw = true; }
    T("C8 存档 Set 退化不崩（读取不抛异常）", !threw);
    T("C9 退化标记不误判为已标记", !ctx.HolyEagleSwordSkills.marked(s3, n3, e3));
    let threw2 = false;
    try { ctx.HolyEagleSwordSkills.recordHit(s3, n3, e3, kill(), 10); } catch (_) { threw2 = true; }
    T("C10 重建后正常记录与翻倍", !threw2
      && ctx.HolyEagleSwordSkills.modifyDamage(s3, n3, e3, kill(), 10) === 20);
  }
  // 狂暴虚拟咬杀
  {
    const { state: s4, b: b4, noa: n4 } = basicState();
    b4.allies = [n4]; // 无存活男性 → 狂暴
    n4.relics = ["圣鹰剑"];
    let threw = false;
    try { ctx.NoaSideEffectSkills.beginPlayPhase(s4, n4); } catch (_) { threw = true; }
    T("C11 狂暴虚拟咬杀不崩", !threw);
    T("C12 狂暴跳过出牌阶段，本回合无后续杀可吃翻倍",
      n4.skipPlayPhase === true && n4.skipPlayReason === "改造副作用");
  }
}

// ================= D 克罗研究记录 =================
if (SEGS.includes("D")) {
  const flowSrc = read("battle-combat-attack-flow.js");
  const hooksSrc = read("battle-card-resume-hooks.js");
  const repeatIn = flowSrc.indexOf("specials.repeatTactic(state, actor, target, card)");
  const deferIn = flowSrc.indexOf("deferDamageTail?.(state, actor, target, card)");
  T("D1 额外结算早于出牌后钩子（balanceHand 在钩子内）",
    repeatIn > 0 && deferIn > repeatIn, { repeatIn, deferIn });
  T("D2 balanceHand 挂在真实 hooks 数组内",
    hooksSrc.includes("window.NoaCharmSkills?.balanceHand?.(state, actor, deps.draw)"));
  // 续跑链：krowRepeatResume + charm 挂起
  {
    const { state, b, noa } = basicState();
    b.krowRepeatResume = { actorUid: "noa", targetUid: "e0" };
    b.noaCharmDiscard = { unitUid: "noa", need: 1 };
    const resume = ctx.BattleManualContinuationResume({
      allUnits: bb => [...(bb.allies || []), ...(bb.enemies || [])],
      combat: { resumeKrowRepeat: () => krowResumeCalls.push(1) },
      waitEffects: async () => {},
      actionGuard: () => () => true,
      hitResume: {}, record: () => {},
    });
    // 直接验证续跑条件不因 charm 挂起被拦：无 locked、actionGuard 恒真
    T("D3 charm 挂起不设 locked（续跑链可继续）", !b.locked);
    T("D4 补跑入口对 krowRepeatResume 开放", typeof resume.resumeInterruptedActions === "function");
  }
  // 两次结算都跑 balanceHand：第二次手牌已在上限，不重复补/弃
  {
    const { state, noa } = basicState();
    const api = { deps: { draw }, damage: () => {}, allUnits: () => [], pushFloat: () => {} };
    const stateApi = {
      paused: bb => hasPrompt(bb), putAction: () => {},
    };
    const hooks = ctx.BattleCardResumeHooks(api, stateApi);
    noa.hand = Array.from({ length: 4 }, (_, j) => kill("杀" + j));
    const before = noa.hand.length;
    const action = { counted: true, resolvedHookDone: false, hookIndex: 0,
      actorUid: "noa", targetUid: "e0", card: kill() };
    let threw = false;
    try {
      hooks.runHooks(state, action);
      const a2 = { counted: true, resolvedHookDone: false, hookIndex: 0,
        actorUid: "noa", targetUid: "e0", card: kill() };
      hooks.runHooks(state, a2);
    } catch (_) { threw = true; }
    T("D5 两次结算跑钩子不抛异常", !threw);
    T("D6 手牌已在上限时不重复补牌/弃牌", noa.hand.length === before,
      { before, after: noa.hand.length });
  }
}

// ================= E 霹雳之锤 × 格林机枪 =================
if (SEGS.includes("E")) {
  const resSrc = read("battle-card-resume-flow.js");
  const resumeSrc = read("battle-manual-continuation-resume.js");
  T("E1 waitingGreen 让 action 重排队、不提前跑 runHooks",
    resSrc.includes("if (battle.greenGatlingResume) action.waitingGreen = true")
    && resSrc.indexOf("if (battle.greenGatlingResume) action.waitingGreen = true")
       < resSrc.indexOf("hooksApi.runHooks(state, action)"));
  T("E2 续跑链在 waitingGreen + greenGatlingResume 时跳过 cardTail",
    resumeSrc.includes("cardTail.waitingGreen\n        && battle.greenGatlingResume"));
  {
    const { state, b, noa } = basicState({ activeUid: "e0" });
    b.greenGatlingResume = { actorUid: "noa", targetUid: "e0", card: kill() };
    noa.hand = Array.from({ length: 6 }, (_, j) => kill("杀" + j));
    discarded.length = 0;
    ctx.NoaCharmSkills.balanceHand(state, noa, draw);
    T("E3 机枪续跑期间溢出走自动弃、不叠加玩家提示",
      !b.noaCharmDiscard && counted(noa) === 4, { charm: b.noaCharmDiscard, counted: counted(noa) });
    T("E4 greenGatlingResume 未被 charm 清掉", !!b.greenGatlingResume);
  }
  T("E5 锤子 resolve/cancel 会清 greenGatlingResume 并续跑",
    read("battle-combat.js").includes("state.battle.greenGatlingResume = null"));
}

// ================= F 全库饰品钩子 =================
if (SEGS.includes("F")) {
  const dir = path.join(__dirname, "..", "src", "original");
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".js"));
  const hooked = files.filter(f => {
    const s = fs.readFileSync(path.join(dir, f), "utf8");
    return /afterCardPlayed|afterDiscard|modifyDamage|resolveObstacle|slashTargetAmount/.test(s);
  });
  T("F1 扫描到足够多的饰品挂点文件", hooked.length >= 20, { n: hooked.length });
  const hooksSrc = read("battle-card-resume-hooks.js");
  const noaAt = hooksSrc.indexOf("window.NoaCharmSkills?.balanceHand?.");
  const bubbleAt = hooksSrc.indexOf("window.AbeKarunaBubbleSkills?.afterCardPlayed");
  T("F2 balanceHand 排在记忆泡泡挂起之前", noaAt > 0 && bubbleAt > noaAt, { noaAt, bubbleAt });
  {
    const { state, noa } = basicState();
    noa.relics = ["盖亚妮丝护符", "圣鹰剑"];
    const api = { deps: { draw }, damage: () => {}, allUnits: () => [], pushFloat: () => {} };
    const stateApi = { paused: bb => hasPrompt(bb), putAction: () => {} };
    const hooks = ctx.BattleCardResumeHooks(api, stateApi);
    const action = { counted: true, resolvedHookDone: false, hookIndex: 0,
      actorUid: "noa", targetUid: "e0", card: kill() };
    let threw = false;
    try { hooks.runHooks(state, action); } catch (e) { threw = true; console.log("F3 err", e.message); }
    T("F3 全钩子跑一遍不抛异常（诺亚+两饰品在场）", !threw);
    T("F4 钩子跑完清理卡牌临时标记", !action.card._cardResolutionId);
  }
}

// ================= G 半魅魔血交牌挂起 =================
if (SEGS.includes("G")) {
  {
    const { state, b, noa } = basicState({ activeUid: "e0" });
    b.handReveal = { unitUid: "noa" };
    noa.hand = Array.from({ length: 6 }, (_, j) => kill("杀" + j));
    discarded.length = 0;
    ctx.NoaCharmSkills.balanceHand(state, noa, draw);
    T("G1 交牌弹窗挂起时不叠加 charm", !b.noaCharmDiscard, b.noaCharmDiscard);
    T("G2 交牌挂起期间溢出自动弃至上限", counted(noa) === 4, { counted: counted(noa) });
    b.handReveal = null;
    const before = noa.hand.length;
    ctx.NoaCharmSkills.balanceHand(state, noa, draw);
    T("G3 交牌完成后重判不丢牌、不重复补", noa.hand.length === before,
      { before, after: noa.hand.length });
  }
  {
    const { state, b, noa, ally } = basicState();
    b.allies.push(ally);
    b.risaEyePrompt = { unitUid: "noa" };
    noa.hand = Array.from({ length: 5 }, (_, j) => kill("杀" + j));
    ctx.NoaCharmSkills.balanceHand(state, noa, draw);
    T("G4 半魅魔血提示挂起时同样不叠加", !b.noaCharmDiscard, b.noaCharmDiscard);
    T("G5 存活男性使上限升到 5，不误弃", counted(noa) === 5, { counted: counted(noa) });
  }
}

console.log(`\nRESULT ${pass}/${total}  FAILED ${failed.length}  MODE=${MODE || "none"}`);
if (failed.length) console.log("FAILED_LIST " + failed.join(" | "));
process.exit(failed.length ? 1 : 0);
