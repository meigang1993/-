// 温蒂【飘浮掩体】弃牌转护甲结算：每弃置 1 张牌 → 我方全体各 1 点，芙萝娅双倍。
// 旧口径为「每 2 张 1 点」，弃单数张时余量被吞（弃 1 张得 0、弃 3 张只得 1）。
const fs = require("fs");
const vm = require("vm");

global.window = global;

function load(file) {
  vm.runInThisContext(fs.readFileSync(file, "utf8"), { filename: file });
}

let passed = 0;
const failures = [];

function T(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`✅ ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.log(`❌ ${name} — ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const spoken = [];
window.BattleLines = {
  skill(state, unit, name, target) {
    spoken.push({ unit: unit?.ref, name, target: target?.ref });
  },
};
window.BattleLog = {
  add(state, message) {
    state.log.push(message);
  },
};

load("./src/original/wendy-skills.js");

const alive = (ref, extra = {}) => ({
  ref, name: ref, hp: 10, maxHp: 10, block: 0, side: "ally", ...extra,
});
const hand = count => Array.from({ length: count },
  (_, index) => ({ name: `弃牌${index}`, type: "slash" }));
const noopDeps = { pushFloat() {} };

let coverCalls = [];
window.WendyTeacherSkinFX = {
  cover(state, actor, gains) {
    coverCalls.push({ actor: actor?.ref, gains });
  },
};

function scene(withFlora = true) {
  const wendy = alive("wendy", { uid: "a0" });
  const ally = alive("rokar", { uid: "a1" });
  const flora = alive("flora", { uid: "a2" });
  const allies = withFlora ? [wendy, ally, flora] : [wendy, ally];
  const state = {
    lines: [], log: [],
    battle: { allies, enemies: [], animQueue: [] },
  };
  coverCalls = [];
  spoken.length = 0;
  return { state, wendy, ally, flora };
}

// 记录飘字：每个存活友方各一次，值为各自实得护甲
function floatDeps() {
  const floats = [];
  return { floats, deps: { pushFloat(battle, uid, kind, gain) {
    floats.push({ uid, kind, gain });
  } } };
}

T("弃 1 张 → 我方全体各 1 点、芙萝娅 2 点（旧口径此处为 0）", () => {
  const { state, wendy, ally, flora } = scene();
  window.WendySkills.afterDiscard(state, wendy, hand(1), noopDeps);
  assert(wendy.block === 1 && ally.block === 1 && flora.block === 2,
    `blocks must be 1/1/2, got ${wendy.block}/${ally.block}/${flora.block}`);
});

T("弃 3 张 → 全体各 3 点、芙萝娅 6 点（旧口径此处为 1）", () => {
  const { state, wendy, ally, flora } = scene();
  window.WendySkills.afterDiscard(state, wendy, hand(3), noopDeps);
  assert(wendy.block === 3 && ally.block === 3 && flora.block === 6,
    `blocks must be 3/3/6, got ${wendy.block}/${ally.block}/${flora.block}`);
});

T("弃 2 张 → 全体各 2 点、芙萝娅 4 点", () => {
  const { state, wendy, ally, flora } = scene();
  window.WendySkills.afterDiscard(state, wendy, hand(2), noopDeps);
  assert(wendy.block === 2 && ally.block === 2 && flora.block === 4,
    `blocks must be 2/2/4, got ${wendy.block}/${ally.block}/${flora.block}`);
});

T("多批次弃牌按张数各自结算，不再累计吞余量", () => {
  const { state, wendy, ally, flora } = scene();
  window.WendySkills.afterDiscard(state, wendy, hand(1), noopDeps);
  window.WendySkills.afterDiscard(state, wendy, hand(1), noopDeps);
  assert(wendy.block === 2 && ally.block === 2 && flora.block === 4,
    `blocks must be 2/2/4, got ${wendy.block}/${ally.block}/${flora.block}`);
});

T("战报写明「每弃1张牌」", () => {
  const { state, wendy } = scene();
  window.WendySkills.afterDiscard(state, wendy, hand(2), noopDeps);
  const entry = state.log.find(line => /飘浮掩体/.test(line)) || "";
  assert(/每弃1张牌/.test(entry), `log must say 每弃1张牌, got ${entry}`);
  assert(/获得2点护甲/.test(entry), `log must report 2 points, got ${entry}`);
});

T("芙萝娅不在场时无双倍", () => {
  const { state, wendy, ally } = scene(false);
  window.WendySkills.afterDiscard(state, wendy, hand(2), noopDeps);
  assert(wendy.block === 2 && ally.block === 2,
    `blocks must be 2/2, got ${wendy.block}/${ally.block}`);
});

T("对照：非温蒂弃牌不触发", () => {
  const { state, ally, flora } = scene();
  window.WendySkills.afterDiscard(state, ally, hand(3), noopDeps);
  assert(ally.block === 0 && flora.block === 0,
    `non-Wendy discard must not shield, got ${ally.block}/${flora.block}`);
});

T("对照：未弃牌时不触发", () => {
  const { state, wendy, ally } = scene();
  window.WendySkills.afterDiscard(state, wendy, [], noopDeps);
  assert(wendy.block === 0 && ally.block === 0 && !state.log.length,
    "empty discard must not shield or log");
});

// —— 以下为「护甲数值之外」的连带效果，逐一验证 ——

T("飘字：每个存活友方各一次，值为各自实得护甲", () => {
  const { state, wendy } = scene();
  const { floats, deps } = floatDeps();
  window.WendySkills.afterDiscard(state, wendy, hand(3), deps);
  assert(floats.length === 3, `must float 3 times, got ${floats.length}`);
  const byUid = Object.fromEntries(floats.map(f => [f.uid, f]));
  assert(byUid.a0?.gain === 3 && byUid.a1?.gain === 3 && byUid.a2?.gain === 6,
    `floats must be a0=3 a1=3 a2=6, got ${JSON.stringify(floats)}`);
  assert(floats.every(f => f.kind === "armor-gain"),
    `float kind must be armor-gain, got ${JSON.stringify(floats)}`);
});

T("台词：触发飘浮掩体，且带芙萝娅为目标", () => {
  const { state, wendy } = scene();
  window.WendySkills.afterDiscard(state, wendy, hand(2), noopDeps);
  const entry = spoken.find(item => item.name === "飘浮掩体");
  assert(entry, `must speak 飘浮掩体, got ${JSON.stringify(spoken)}`);
  assert(entry.unit === "wendy", `speaker must be wendy, got ${entry.unit}`);
  assert(entry.target === "flora", `target must be flora, got ${entry.target}`);
});

T("台词：芙萝娅不在场时不带目标", () => {
  const { state, wendy } = scene(false);
  window.WendySkills.afterDiscard(state, wendy, hand(2), noopDeps);
  const entry = spoken.find(item => item.name === "飘浮掩体");
  assert(entry && !entry.target,
    `target must be absent, got ${JSON.stringify(entry)}`);
});

T("卡迪西斯获得双倍护甲（此前只拿到基础值）", () => {
  const { state, wendy, ally, flora } = scene();
  const cadicis = alive("cadicis", { uid: "a3" });
  state.battle.allies.push(cadicis);
  window.WendySkills.afterDiscard(state, wendy, hand(2), noopDeps);
  assert(cadicis.block === 4, `cadicis must gain 4 (doubled), got ${cadicis.block}`);
  assert(flora.block === 4, `flora must gain 4, got ${flora.block}`);
  assert(wendy.block === 2 && ally.block === 2,
    `plain allies must gain 2, got ${wendy.block}/${ally.block}`);
  const gains = coverCalls[0]?.gains || [];
  const flag = Object.fromEntries(gains.map(g => [g.unit.ref, g.reinforced]));
  assert(flag.cadicis === true && flag.flora === true,
    `cadicis and flora must be reinforced, got ${JSON.stringify(flag)}`);
  assert(flag.wendy === false && flag.rokar === false,
    `plain allies must not be reinforced, got ${JSON.stringify(flag)}`);
});

T("战报写明卡迪西斯与芙萝娅双双双倍", () => {
  const { state, wendy } = scene();
  state.battle.allies.push(alive("cadicis", { uid: "a3" }));
  window.WendySkills.afterDiscard(state, wendy, hand(2), noopDeps);
  const entry = state.log.find(line => /飘浮掩体/.test(line)) || "";
  assert(/双倍/.test(entry), `log must mention 双倍, got ${entry}`);
  assert(/cadicis/.test(entry) && /flora/.test(entry),
    `log must name both doubled allies, got ${entry}`);
});

T("卡迪西斯阵亡时不双倍", () => {
  const { state, wendy } = scene();
  state.battle.allies.push(alive("cadicis", { uid: "a3", hp: 0 }));
  window.WendySkills.afterDiscard(state, wendy, hand(2), noopDeps);
  const cadicis = state.battle.allies.find(a => a.ref === "cadicis");
  assert(cadicis.block === 0, `dead cadicis must not gain block, got ${cadicis.block}`);
});

T("教师皮肤累计 skinTeacherArmor = 本次全体所得之和", () => {
  const { state, wendy } = scene();
  window.WendySkills.afterDiscard(state, wendy, hand(2), noopDeps);  // 2+2+4
  assert(wendy.skinTeacherArmor === 8,
    `first batch must total 8, got ${wendy.skinTeacherArmor}`);
  window.WendySkills.afterDiscard(state, wendy, hand(1), noopDeps);  // 1+1+2
  assert(wendy.skinTeacherArmor === 12,
    `two batches must total 12, got ${wendy.skinTeacherArmor}`);
});

T("阵亡友方不得护甲、不飘字", () => {
  const { state, wendy } = scene();
  const fallen = alive("sonia", { uid: "a4", hp: 0 });
  state.battle.allies.push(fallen);
  const { floats, deps } = floatDeps();
  window.WendySkills.afterDiscard(state, wendy, hand(2), deps);
  assert(fallen.block === 0, `fallen ally must not gain block, got ${fallen.block}`);
  assert(!floats.some(f => f.uid === "a4"),
    `fallen ally must not float, got ${JSON.stringify(floats)}`);
  assert(floats.length === 3, `only living allies float, got ${floats.length}`);
});

T("芙萝娅阵亡时不触发双倍", () => {
  const { state, wendy } = scene();
  state.battle.allies.find(a => a.ref === "flora").hp = 0;
  window.WendySkills.afterDiscard(state, wendy, hand(3), noopDeps);
  const flora = state.battle.allies.find(a => a.ref === "flora");
  assert(flora.block === 0, `dead flora must not gain block, got ${flora.block}`);
  const entry = state.log.find(line => /飘浮掩体/.test(line)) || "";
  assert(!/双倍/.test(entry), `log must not mention 双倍, got ${entry}`);
});

T("温蒂自己也在「所有友方角色」之内", () => {
  const { state, wendy } = scene();
  window.WendySkills.afterDiscard(state, wendy, hand(2), noopDeps);
  assert(wendy.block === 2, `wendy herself must gain block, got ${wendy.block}`);
  const gains = coverCalls[0]?.gains || [];
  assert(gains.some(g => g.unit.ref === "wendy"),
    `wendy must appear in gains, got ${JSON.stringify(gains.map(g => g.unit.ref))}`);
});

// —— 手牌超上限的「溢出弃牌」不触发飘浮掩体（技能只认弃牌阶段的主动弃牌）——

const overflowCalls = [];
const syncCalls = [];
window.BattleCards = { putMany() {}, put() {} };
// 未装配时 canDiscard?.() 返回 undefined，取反会让溢出循环逐张跳过（真实战斗里该模块必定已装配）。
window.UnderwaterTrainSkills = { canDiscard: () => true };
window.CatherineSkills = { syncMagic(state, unit) { syncCalls.push(unit?.ref); } };
window.WendyCadicisSkills = {
  afterDiscard(state, unit, cards, deps) {
    overflowCalls.push({ unit: unit?.ref, n: cards.length });
    window.WendySkills.afterDiscard(state, unit, cards, deps);
  },
};
load("./src/original/battle-discard-overflow.js");

const overflow = window.BattleDiscardOverflow({
  visibleHand: unit => unit.hand.length,
  handLimit: () => 5,
});

T("溢出弃牌不触发飘浮掩体（护甲、飘字、战报均无）", () => {
  const { state, wendy, ally, flora } = scene();
  wendy.hand = hand(8);
  overflowCalls.length = 0;
  overflow.discardOverflow(state, wendy);
  assert(overflowCalls.length === 0,
    `overflow must not call afterDiscard, got ${JSON.stringify(overflowCalls)}`);
  assert(wendy.block === 0 && ally.block === 0 && flora.block === 0,
    `no armor from overflow, got ${wendy.block}/${ally.block}/${flora.block}`);
  assert(!state.log.some(line => /飘浮掩体/.test(line)),
    `no 飘浮掩体 log from overflow, got ${JSON.stringify(state.log)}`);
  assert(wendy.hand.length === 5, `overflow must trim to hand limit, got ${wendy.hand.length}`);
});

T("溢出弃牌仍然同步凯瑟琳魔力（未被连带误删）", () => {
  const { state, wendy } = scene();
  wendy.hand = hand(7);
  syncCalls.length = 0;
  overflow.discardOverflow(state, wendy);
  assert(syncCalls.includes("wendy"),
    `syncMagic must still run, got ${JSON.stringify(syncCalls)}`);
});

T("对照：弃牌阶段主动弃牌照常触发（溢出排除未误伤）", () => {
  const { state, wendy, ally, flora } = scene();
  window.WendySkills.afterDiscard(state, wendy, hand(3), noopDeps);
  assert(wendy.block === 3 && ally.block === 3 && flora.block === 6,
    `manual discard must still shield, got ${wendy.block}/${ally.block}/${flora.block}`);
});


console.log(`\n通过 ${passed} / 失败 ${failures.length}`);
if (failures.length) {
  failures.forEach(line => console.log(`  - ${line}`));
  process.exit(1);
}
