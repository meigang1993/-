// 温蒂【飘浮掩体】调整后回归：弃牌阶段按温蒂魔力值给全队护甲，卡迪西斯 2 倍。
// 旧口径「每弃 1 张 → 全体各 1 点、芙萝娅/卡迪西斯双倍」已整体废弃；
// 触发点从 discardCards（实际弃牌后）移到弃牌阶段入口，无需弃牌的回合也生效。
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
  add(state, message) { state.log.push(message); },
};
window.BattleHpValue = { clean: value => Math.round(value * 100) / 100 };
window.WendyTeacherSkinFX = { cover(state, actor, gains) { coverCalls.push(gains); } };
window.CatherineSkills = { syncMagic() {} };
window.BattleCards = { putMany() {}, put() {} };
window.UnderwaterTrainSkills = { canDiscard: () => true };
let coverCalls = [];

load("./src/original/wendy-skills.js");
load("./src/original/battle-discard-flow.js");
load("./src/original/battle-discard-overflow.js");

const origCover = window.WendySkills.floatingCover;
const alive = (ref, extra = {}) => ({
  ref, name: ref, hp: 10, maxHp: 10, block: 0, side: "ally", hand: [], ...extra,
});
const noopDeps = { pushFloat() {} };

function scene(opts = {}) {
  const wendy = alive("wendy", {
    uid: "a0", stats: { magic: opts.magic ?? 5 }, tempMagic: opts.tempMagic ?? 0,
  });
  const ally = alive("rokar", { uid: "a1" });
  const flora = alive("flora", { uid: "a2" });
  const cadicis = alive("cadicis", { uid: "a3" });
  const allies = [wendy, ally, flora, cadicis];
  if (opts.deadCadicis) cadicis.hp = 0;
  const state = {
    lines: [], log: [],
    battle: { allies, enemies: [alive("e0", { side: "enemy", uid: "e0" })], turn: 7, animQueue: [] },
  };
  coverCalls = [];
  spoken.length = 0;
  return { state, wendy, ally, flora, cadicis };
}

function floatDeps() {
  const floats = [];
  return { floats, deps: { pushFloat(battle, uid, kind, gain) {
    floats.push({ uid, kind, gain });
  } } };
}

// 真实 BattleDiscardFlow.enterDiscardOrEnd 挂点：把聚合入口换成记录用的转发，
// 内部仍调用真实的 floatingCover 实现。
function runFlow(need, opts = {}) {
  const sc = scene(opts);
  const calls = [];
  const prev = window.WendyCadicisSkills;
  window.WendyCadicisSkills = {
    floatingCover: (st, unit, deps) => {
      calls.push(unit.uid);
      return origCover(st, unit, deps);
    },
  };
  const flow = window.BattleDiscardFlow({
    active: () => sc.wendy,
    visibleHand: u => u.hand.length,
    handLimit: () => 4,
    canDiscardCard: () => true,
    canDiscardAny: () => true,
    discardNeed: () => need,
    discardOverflow: () => {},
    enterEndPhase: () => true,
    draw: () => [],
    combat: { pushFloat() {} },
    record: () => {},
    advanceToInput: async () => {},
    manualFlow: {},
  });
  flow.enterDiscardOrEnd(sc.state, sc.wendy);
  window.WendyCadicisSkills = prev;
  return { ...sc, calls };
}

// —— 数值口径 ——
T("全体获得等同于温蒂魔力值(5)的护甲，卡迪西斯 2 倍", () => {
  const { state, wendy, ally, flora, cadicis } = scene();
  window.WendySkills.floatingCover(state, wendy, noopDeps);
  assert(wendy.block === 5 && ally.block === 5 && flora.block === 5,
    `plain allies must gain 5, got ${wendy.block}/${ally.block}/${flora.block}`);
  assert(cadicis.block === 10, `cadicis must gain 10, got ${cadicis.block}`);
});
T("tempMagic 计入魔力值", () => {
  const { state, wendy, ally } = scene({ magic: 5, tempMagic: 2 });
  window.WendySkills.floatingCover(state, wendy, noopDeps);
  assert(wendy.block === 7 && ally.block === 7, `got ${wendy.block}/${ally.block}`);
});
T("小数魔力收敛为整数，无浮点尾巴", () => {
  const { state, wendy } = scene({ magic: 4.8 });
  window.WendySkills.floatingCover(state, wendy, noopDeps);
  assert(Number.isInteger(wendy.block) && wendy.block === 5, `got ${wendy.block}`);
});
T("芙萝娅不再双倍", () => {
  const { state, wendy, flora } = scene();
  window.WendySkills.floatingCover(state, wendy, noopDeps);
  assert(flora.block === 5, `flora must not be doubled, got ${flora.block}`);
});
T("同一回合重复进入不重复加甲", () => {
  const { state, wendy } = scene();
  window.WendySkills.floatingCover(state, wendy, noopDeps);
  const before = wendy.block;
  window.WendySkills.floatingCover(state, wendy, noopDeps);
  assert(wendy.block === before, `got ${wendy.block} vs ${before}`);
});
T("卡迪西斯阵亡时无 2 倍、无护甲", () => {
  const { state, wendy, cadicis } = scene({ deadCadicis: true });
  window.WendySkills.floatingCover(state, wendy, noopDeps);
  assert(cadicis.block === 0, `dead cadicis must gain 0, got ${cadicis.block}`);
  assert(!spoken.some(x => x.target === "cadicis"), "dead cadicis must not be line target");
});

// —— 连带效果 ——
T("飘字：每个存活友方一次，值为各自实得护甲", () => {
  const { state, wendy } = scene();
  const { floats, deps } = floatDeps();
  window.WendySkills.floatingCover(state, wendy, deps);
  assert(floats.length === 4, `must float 4 times, got ${floats.length}`);
  assert(floats.every(f => f.kind === "armor-gain"), "all floats are armor-gain");
  assert(floats.find(f => f.uid === "a3").gain === 10, "cadicis float is 10");
});
T("台词以卡迪西斯为目标（妈妈台词口径）", () => {
  const { state, wendy } = scene();
  window.WendySkills.floatingCover(state, wendy, noopDeps);
  const entry = spoken.find(x => x.name === "飘浮掩体");
  assert(entry && entry.unit === "wendy" && entry.target === "cadicis",
    `got ${JSON.stringify(entry)}`);
});
T("教师皮肤累计 = 全体所得之和", () => {
  const { state, wendy } = scene();
  window.WendySkills.floatingCover(state, wendy, noopDeps);
  assert(wendy.skinTeacherArmor === 25, `got ${wendy.skinTeacherArmor}`);
  assert(coverCalls.length === 1 && coverCalls[0].length === 4, "skin FX receives 4 gains");
});
T("战报写明魔力护甲与卡迪西斯 2 倍", () => {
  const { state, wendy } = scene();
  window.WendySkills.floatingCover(state, wendy, noopDeps);
  const entry = state.log.find(line => /飘浮掩体/.test(line));
  assert(entry && /5点护甲/.test(entry) && /2倍护甲/.test(entry), `got ${entry}`);
  assert(!/每弃1张牌/.test(entry), "old discard-count wording must be gone");
});
T("对照：非温蒂 / 阵亡温蒂不触发", () => {
  const { state, wendy, ally } = scene();
  assert(window.WendySkills.floatingCover(state, ally, noopDeps) === false);
  assert(window.WendySkills.floatingCover(state, { ...wendy, hp: 0 }, noopDeps) === false);
  assert(wendy.block === 0 && ally.block === 0, "no armor gained");
});

// —— 弃牌阶段挂点 ——
T("弃牌阶段入口触发飘浮掩体（温蒂无需弃牌也一样）", () => {
  const sc = runFlow(0);
  assert(sc.calls.length === 1, `must call once, got ${sc.calls.length}`);
  assert(sc.wendy.block === 5, `got ${sc.wendy.block}`);
});
T("弃牌阶段需要选牌时同样先结算一次", () => {
  const sc = runFlow(2);
  assert(sc.calls.length === 1 && sc.wendy.block === 5,
    `got ${JSON.stringify(sc.calls)}/${sc.wendy.block}`);
});
T("溢出弃牌（BattleDiscardOverflow）不触发飘浮掩体", () => {
  const { state, wendy } = scene();
  const logsBefore = state.log.filter(x => /飘浮掩体/.test(x)).length;
  while (wendy.hand.length < 9) {
    wendy.hand.push({ name: "杀（普攻）", type: "slash", suit: "♠" });
  }
  window.BattleDiscardOverflow({
    visibleHand: u => u.hand.length,
    handLimit: () => 5,
  }).discardOverflow(state, wendy);
  assert(wendy.block === 0, `overflow must not grant armor, got ${wendy.block}`);
  assert(state.log.filter(x => /飘浮掩体/.test(x)).length === logsBefore,
    "overflow must not write 飘浮掩体 log");
});
T("弃牌数量与护甲完全解耦（弃 0 / 弃 3 同值）", () => {
  const a = scene(), b = scene();
  window.WendySkills.floatingCover(a.state, a.wendy, noopDeps);
  b.wendy.hand = [{ name: "x" }, { name: "y" }, { name: "z" }];
  window.WendySkills.floatingCover(b.state, b.wendy, noopDeps);
  assert(a.wendy.block === b.wendy.block && a.wendy.block === 5,
    `got ${a.wendy.block}/${b.wendy.block}`);
});

console.log(`\n通过 ${passed} / ${passed + failures.length}`);
if (failures.length) {
  failures.forEach(f => console.log(`  FAILED ${f}`));
  process.exit(1);
}
