// 皮肤特效接线：验证娜娜莉技能逻辑真的调用「杀戮魔女」特效（而非只有特效函数自身可用）
//   1) 打出实体单体杀 → 魔刀阿波罗 apolloSeal
//   2) 对无手牌目标造成实体单体杀伤害 → 虚弱斩杀 weaknessExecute，且伤害翻倍
//   3) 实体单体杀以外的牌 / 目标有手牌 / 未装备皮肤 → 均不触发
const assert = require("assert");
const path = require("path");

global.window = global;
require(path.join(__dirname, "..", "src", "original", "data-skins.js"));
require(path.join(__dirname, "..", "src", "original", "skins.js"));

// 记录特效调用
const calls = [];
window.NanaliSlaughterWitchSkinFX = {
  active: () => true,
  apolloSeal: (...a) => calls.push(["apolloSeal", a]),
  weaknessExecute: (...a) => calls.push(["weaknessExecute", a]),
};

const logs = [];
window.BattleLog = { add: (_s, m) => logs.push(m) };
window.BattleCards = { afterHandLost: () => {} };
window.BattleDrawFeedback = { action: () => "摸牌" };

// deps：visible / takeVisible / singleKill / line
const deps = {
  visible: unit => (unit.hand || []).filter(c => !c.status),
  takeVisible: (unit, n) => (unit.hand || []).splice(0, n),
  singleKill: card => card?.type === "slash" && !card?.isArea,
  line: () => {},
};
require(path.join(__dirname, "..", "src", "original", "nanali-skills.js"));
const skills = window.NanaliSkills(deps);

const kill = { name: "杀（普攻）", type: "slash" };
const areaKill = { name: "机枪扫杀", type: "slash", isArea: true };
const virtualKill = { name: "虚拟杀", type: "slash", virtual: true };

function state(actorHand, targetHand) {
  const actor = { uid: "a0", ref: "nanali", name: "娜娜莉", side: "ally", hand: [...actorHand] };
  const target = { uid: "e0", name: "敌人", side: "enemy", hand: [...targetHand] };
  const battle = { allies: [actor], enemies: [target], animQueue: [] };
  return { state: { battle }, actor, target };
}

let pass = 0;
const out = [];
function T(name, fn) {
  try { fn(); pass++; out.push(`✅ ${name}`); }
  catch (err) { out.push(`❌ ${name}  ← ${err.message}`); }
}

T("实体单体杀触发魔刀阿波罗", () => {
  calls.length = 0;
  const { state: s, actor, target } = state([kill], [{ name: "闪", type: "dodge" }]);
  skills.beforeKillTargeted(s, actor, target, kill, { draw: () => [] });
  const hit = calls.filter(c => c[0] === "apolloSeal");
  assert.strictEqual(hit.length, 1, `calls=${JSON.stringify(calls.map(c => c[0]))}`);
  assert.strictEqual(hit[0][1][2], target, "target must be passed to the fx");
});

T("技能生成的虚拟杀不触发魔刀阿波罗", () => {
  calls.length = 0;
  const { state: s, actor, target } = state([], []);
  skills.beforeKillTargeted(s, actor, target, virtualKill, { draw: () => [] });
  assert.strictEqual(calls.filter(c => c[0] === "apolloSeal").length, 0);
});

T("非娜娜莉不触发魔刀阿波罗", () => {
  calls.length = 0;
  const { state: s, actor, target } = state([kill], []);
  actor.ref = "rokar";
  skills.beforeKillTargeted(s, actor, target, kill, { draw: () => [] });
  assert.strictEqual(calls.filter(c => c[0] === "apolloSeal").length, 0);
});

T("目标无手牌触发虚弱斩杀且伤害翻倍", () => {
  calls.length = 0;
  const { state: s, actor, target } = state([], []);
  const dmg = skills.modifySlashDamage(s, actor, target, 5, kill);
  assert.strictEqual(calls.filter(c => c[0] === "weaknessExecute").length, 1);
  assert.strictEqual(dmg, 10, `dmg=${dmg}`);
});

T("目标有手牌不触发虚弱斩杀且不翻倍", () => {
  calls.length = 0;
  const { state: s, actor, target } = state([], [{ name: "闪", type: "dodge" }]);
  const dmg = skills.modifySlashDamage(s, actor, target, 5, kill);
  assert.strictEqual(calls.filter(c => c[0] === "weaknessExecute").length, 0);
  assert.strictEqual(dmg, 5, `dmg=${dmg}`);
});

T("群体杀不触发虚弱斩杀", () => {
  calls.length = 0;
  const { state: s, actor, target } = state([], []);
  const dmg = skills.modifySlashDamage(s, actor, target, 5, areaKill);
  assert.strictEqual(calls.filter(c => c[0] === "weaknessExecute").length, 0);
  assert.strictEqual(dmg, 5);
});

console.log(out.join("\n"));
console.log(`\n通过 ${pass}/${out.length}`);
process.exit(pass === out.length ? 0 : 1);
