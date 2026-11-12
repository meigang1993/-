const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const sourcePath = path.join(__dirname, "../src/original/enemy-status-effects.js");
const sourceText = fs.readFileSync(sourcePath, "utf8");

global.window = global;
window.BattleLog = { add() {} };

function makeWindow(extra) {
  const win = Object.assign({ BattleLog: { add() {} } }, extra || {});
  return win;
}

function makeApi(win) {
  return win.EnemyStatusEffects({
    alive: units => units.filter(u => u && u.hp > 0),
    markStatus: (u, status) => {
      u.statuses ||= [];
      if (!u.statuses.includes(status)) u.statuses.push(status);
    },
  });
}

function makeState(allies, enemies) {
  return { battle: { allies, enemies }, log: [] };
}

function damageRecorder() {
  const calls = [];
  const damage = (state, target, amount, label, actor, card) => {
    calls.push({ amount, label, actorUid: actor?.uid, card });
    target.hp = Math.max(0, target.hp - Math.round(amount));
  };
  return { calls, damage };
}

function source(uid, attack, extra = {}) {
  return Object.assign({
    uid,
    name: uid,
    side: "enemy",
    hp: 50,
    maxHp: 50,
    stats: { attack },
  }, extra);
}

function target(uid, hp = 100) {
  return { uid, name: uid, side: "ally", hp, maxHp: hp, statuses: [] };
}

function runRevert() {
  const tampered = sourceText.replace("const RATE = 0.3;", "const RATE = 0;");
  assert.notStrictEqual(tampered, sourceText, "REVERT=rate must actually replace the rate constant");
  const win = makeWindow();
  const ctx = { window: win, Math, Number, Array, Object };
  vm.runInNewContext(tampered, ctx, { filename: sourcePath });
  const api = makeApi(win);
  const src = source("revert-source", 10);
  const victim = target("revert-target", 100);
  const state = makeState([victim], [src]);
  api.addPoison(state, victim, 2, src);
  const rec = damageRecorder();
  api.tickPoison(state, victim, rec.damage);
  assert.strictEqual(rec.calls.length, 1);
  assert.strictEqual(rec.calls[0].amount, 2, "REVERT=rate must fall back to two old 1-point poison ticks");
  console.log("REVERT_OK rate: 2 stacks with RATE=0 deal 2 damage; production 10-attack applier deals 6");
}

function runNormal() {
  require(sourcePath);
  const api = makeApi(window);
  let passed = 0;
  let total = 0;
  const failures = [];
  const T = (name, ok, extra) => {
    total += 1;
    if (ok) passed += 1;
    else failures.push(`${name} ${JSON.stringify(extra || {})}`);
  };

  // A: 15 attack including tempAttack => round(15 * 30%) = 5; later attack changes must not matter.
  {
    const src = source("snapshot-source", 10, { tempAttack: 5 });
    const victim = target("snapshot-target", 100);
    const state = makeState([victim], [src]);
    api.addPoison(state, victim, 1, src);
    src.stats.attack = 100;
    src.tempAttack = 0;
    const rec = damageRecorder();
    api.tickPoison(state, victim, rec.damage);
    T("A1 毒标记按施加时攻击力30%快照结算", rec.calls.length === 1 && rec.calls[0].amount === 5 && victim.hp === 95,
      { amount: rec.calls[0]?.amount, hp: victim.hp });
    T("A2 毒伤害归属仍记给首位施加者", rec.calls[0]?.actorUid === src.uid, rec.calls[0]?.actorUid);
    T("A3 毒结算不额外叠层且保留标记数据", victim.poison === 1 && victim.poisonMarks?.length === 1,
      { poison: victim.poison, marks: victim.poisonMarks });
  }

  // B: two stacks from a 10-attack applier => 3 + 3 = 6.
  {
    const src = source("stack-source", 10);
    const victim = target("stack-target", 100);
    const state = makeState([victim], [src]);
    api.addPoison(state, victim, 2, src);
    const rec = damageRecorder();
    api.tickPoison(state, victim, rec.damage);
    T("B1 两层毒按每枚30%叠加为6点", rec.calls.length === 1 && rec.calls[0].amount === 6 && victim.hp === 94,
      { amount: rec.calls[0]?.amount, hp: victim.hp });
    T("B2 每枚毒标记都保存施加时攻击力", victim.poisonMarks?.length === 2
      && victim.poisonMarks.every(mark => mark.attack === 10 && mark.sourceUid === src.uid), victim.poisonMarks);
  }

  // C: low attack still has a 1-point floor; mixed sources sum by their own snapshots.
  {
    const src = source("low-source", 1);
    const victim = target("low-target", 100);
    const state = makeState([victim], [src]);
    api.addPoison(state, victim, 1, src);
    const rec = damageRecorder();
    api.tickPoison(state, victim, rec.damage);
    T("C1 低攻击毒标记至少造成1点", rec.calls.length === 1 && rec.calls[0].amount === 1,
      { amount: rec.calls[0]?.amount });
  }
  {
    const first = source("mixed-source-a", 10);
    const second = source("mixed-source-b", 20);
    const victim = target("mixed-target", 100);
    const state = makeState([victim], [first, second]);
    api.addPoison(state, victim, 1, first);
    api.addPoison(state, victim, 1, second);
    const rec = damageRecorder();
    api.tickPoison(state, victim, rec.damage);
    T("C2 不同施加者的毒标记按各自30%合计9点", rec.calls.length === 1 && rec.calls[0].amount === 9,
      { amount: rec.calls[0]?.amount, marks: victim.poisonMarks });
    T("C3 混合毒标记一次结算且归属首位施加者", rec.calls[0]?.actorUid === first.uid && victim.poison === 2,
      { actorUid: rec.calls[0]?.actorUid, poison: victim.poison });
  }

  // D: legacy saves with poison + poisonSourceUid but no poisonMarks must still use the new formula.
  {
    const src = source("legacy-source", 10);
    const victim = target("legacy-target", 100);
    Object.assign(victim, { poison: 2, poisonSourceUid: src.uid, statuses: ["毒"] });
    const state = makeState([victim], [src]);
    const rec = damageRecorder();
    api.tickPoison(state, victim, rec.damage);
    T("D1 旧档毒标记按施加者攻击力30%兼容结算", rec.calls.length === 1 && rec.calls[0].amount === 6,
      { amount: rec.calls[0]?.amount });
    T("D2 旧档毒标记补齐快照数组且不改变层数", victim.poison === 2 && victim.poisonMarks?.length === 2,
      { poison: victim.poison, marks: victim.poisonMarks });
  }

  // E/F: static guard + damage payload contract.
  T("E1 旧的一层1点伤害公式已移除", !sourceText.includes("damage(state, unit, unit.poison"));
  T("E2 30%倍率常量在位", sourceText.includes("const RATE = 0.3;"));
  T("E3 毒标记快照字段在位", sourceText.includes("poisonMarks"));
  {
    const src = source("payload-source", 10);
    const victim = target("payload-target", 100);
    const state = makeState([victim], [src]);
    api.addPoison(state, victim, 1, src);
    const rec = damageRecorder();
    api.tickPoison(state, victim, rec.damage);
    const card = rec.calls[0]?.card || {};
    T("F1 毒结算仍走不可响应/不可格挡/跳过修正的状态伤害载荷",
      card.poison === true && card.poisonTick === true && card.ignoreResponse === true
      && card.ignoreBlock === true && card.skipDamageModify === true, card);
  }

  if (failures.length) {
    console.error(`FAIL ${passed}/${total}\n${failures.join("\n")}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS ${passed}/${total} 毒标记攻击力30%严格检查`);
  }
}

if (process.env.REVERT === "rate") runRevert();
else runNormal();
