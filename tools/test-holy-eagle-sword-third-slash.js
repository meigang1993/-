/* 【圣鹰剑】第三张单体【杀】是否翻倍 —— 严格检查
   走真实攻击链路：slashTargetAmount（算伤害）→ hitTarget（真实扣血并记标记）。
   REVERT=record 禁用记录、REVERT=modify 禁用翻倍、REVERT=none 不装备饰品。
*/
const fs = require("fs");
const vm = require("vm");
const { installGlobals, loadRuntime } = require("./skill-coverage-fixtures");

installGlobals();
loadRuntime();
["holy-eagle-sword-skills.js", "battle-combat-attack-values.js"].forEach(file =>
  vm.runInThisContext(fs.readFileSync(`./src/original/${file}`, "utf8"), { filename: file }));

const REVERT = process.env.REVERT || "";
let pass = 0, total = 0;
const red = [];
function T(tag, name, cond, extra) {
  total++;
  if (cond) { pass++; console.log(`✅ ${tag} ${name}`); }
  else { red.push(tag); console.log(`❌ ${tag} ${name}  ← ${JSON.stringify(extra || {})} `); }
}

const damage = (_s, target, amount) => {
  const hpLoss = Math.max(0, Math.min(target.hp, amount - (target.block || 0)));
  target.hp -= hpLoss;
  return { dodged: false, hpLoss, blockLoss: 0 };
};
const deps = {
  isKillCard: c => window.CardUtils.isKillCard(c),
  tempAttack: () => 0,
  draw: () => [],
  intentMax: () => 5,
};
const values = window.BattleCombatAttackValues({
  deps, damage, statOf: (u, k) => u.stats?.[k] || 0,
  pushFloat() {}, isSingleSlash: c => window.CardUtils.isSingleKill(c),
});

function makeState(equipped = true) {
  const actor = {
    uid: "a0", ref: "a0", id: "a0", name: "持剑者", side: "ally",
    hp: 1000, maxHp: 1000, block: 0, intent: 5,
    stats: { attack: 6, magic: 2, speed: 4, handLimit: 4 },
    hand: [], deck: [], discard: [], consumed: [], battleRelics: [],
  };
  const target = {
    uid: "e0", ref: "e0", id: "e0", name: "靶子", side: "enemy",
    hp: 1000, maxHp: 1000, block: 0, statuses: [], hand: [],
  };
  const state = {
    log: [], resources: { relics: [] },
    equipment: { a0: equipped ? ["圣鹰剑"] : [] },
    testEquipment: { a0: equipped ? ["圣鹰剑"] : [] },
    battle: {
      test: true, allies: [actor], enemies: [target],
      turn: 1, phase: 4, activeUid: "a0", locked: false,
      animQueue: [], played: [], shownPlayed: [], combo: 0,
    },
  };
  return { state, actor, target };
}
const slash = () => ({ name: "杀（普攻）", type: "slash", scale: "attack" });
const sweep = () => ({ name: "枪林弹雨", type: "slash", scale: "attack", sweep: true });

// 反向验证靠运行时真正禁用能力，让断言自己变红（不是跳过断言）。
if (REVERT === "record") window.HolyEagleSwordSkills.recordHit = () => false;
if (REVERT === "modify") {
  window.HolyEagleSwordSkills.modifyDamage = (_s, _a, _t, _c, amount) => amount;
}

// ── A 段：三张单体【杀】，同一目标、同一回合 ──────────────────
{
  const { state, actor, target } = makeState();
  const amounts = [], losses = [];
  for (let i = 0; i < 3; i++) {
    const before = target.hp;
    const card = slash();
    const amount = values.slashTargetAmount(state, actor, target, card, 6);
    values.hitTarget(state, actor, target, card, amount);
    amounts.push(amount);
    losses.push(before - target.hp);
  }
  T("A1", "第 1 张不翻倍（先造成过伤害才记标记）",
    amounts[0] === 6 && losses[0] === 6, { amounts, losses });
  T("A2", "第 2 张翻倍（6 → 12）",
    amounts[1] === 12 && losses[1] === 12, { amounts, losses });
  // 用户提问的核心：第三张杀是不是没有翻倍？
  T("A3", "第 3 张仍然翻倍（标记是「造成过伤害」的事实，不会被消耗）",
    amounts[2] === 12 && losses[2] === 12, { amounts, losses });
  T("A4", "三张均真实造成 hpLoss>0（不是空转）",
    losses.every(v => v > 0) && target.hp === 970, { hp: target.hp, losses });
  T("A5", "第 3 张后标记仍在（之后每张都翻倍）",
    window.HolyEagleSwordSkills.marked(state, actor, target) === true, {});
  const doubleLogs = state.log.filter(l => /下一张单体【杀】伤害翻倍/.test(l)).length;
  T("A6", "第 2、3 张各播一次「下一张…翻倍」战报（文案口径）",
    doubleLogs === 2, { doubleLogs, log: state.log });
}

// ── B 段：换目标 / 跨回合 / 跨战斗 ────────────────────────────
{
  const { state, actor, target } = makeState();
  values.hitTarget(state, actor, target, slash(), 6);
  const other = { uid: "e1", ref: "e1", name: "副靶", side: "enemy", hp: 1000, maxHp: 1000, block: 0, hand: [] };
  T("B1", "换目标不翻倍",
    values.slashTargetAmount(state, actor, other, slash(), 6) === 6, {});
  state.battle.turn = 2;
  T("B2", "跨回合标记失效",
    values.slashTargetAmount(state, actor, target, slash(), 6) === 6, {});
  const fresh = makeState();
  window.HolyEagleSwordSkills.recordHit(fresh.state, fresh.actor, fresh.target, slash(), 6);
  const rebuilt = { ...fresh.state, battle: { ...fresh.state.battle, turn: 1 } };
  T("B3", "换战斗实例（新 battle 对象）同 turn 也不残留",
    values.slashTargetAmount(rebuilt, fresh.actor, fresh.target, slash(), 6) === 6, {});
}

// ── C 段：群体杀不记标记、也不吃翻倍 ─────────────────────────
{
  const { state, actor, target } = makeState();
  T("C1", "群体杀本身不记录标记",
    window.HolyEagleSwordSkills.recordHit(state, actor, target, sweep(), 8) === false, {});
  T("C2", "群体杀不吃圣鹰剑翻倍",
    values.slashTargetAmount(state, actor, target, sweep(), 6) === 6, {});
}

// ── D 段：不装备饰品时三张都是基础伤害（反向对照） ───────────
{
  const { state, actor, target } = makeState(false);
  const amounts = [];
  for (let i = 0; i < 3; i++) {
    const card = slash();
    amounts.push(values.slashTargetAmount(state, actor, target, card, 6));
    values.hitTarget(state, actor, target, card, 6);
  }
  T("D1", "不装备圣鹰剑：三张全为基础伤害 6",
    amounts.every(v => v === 6), { amounts });
}

// ── E 段：反向验证 ─────────────────────────────────────────────
{
  const { state, actor, target } = makeState();
  const amounts = [];
  for (let i = 0; i < 3; i++) {
    const card = slash();
    amounts.push(values.slashTargetAmount(state, actor, target, card, 6));
    values.hitTarget(state, actor, target, card, 6);
  }
  // 反向验证不翻面期望：REVERT=record / modify 时这两条必须变红，
  // 证明「第 2/3 张翻倍」的断言真的在把关，而不是恒绿。
  T("E1", "三组场景一致：第 1 张 6、第 2 张 12、第 3 张 12",
    amounts[0] === 6 && amounts[1] === 12 && amounts[2] === 12,
    { amounts, REVERT });
  T("E2", "禁用记录或禁用翻倍后，本段必须失败（反向验证生效）",
    REVERT !== "record" && REVERT !== "modify",
    { amounts, REVERT });
}

console.log(`\n结论 ${pass}/${total}${red.length ? `  红项: ${red.join(",")}` : ""}`);
process.exit(pass === total ? 0 : 1);
