/* 【盖亚妮丝护符 / 圣鹰剑】实际效果严格检查。
   与 test-mona-relic-strict-audit.js（模块级全边界）互补：本测试走「真实伤害取整 +
   真实消耗挂点 + 真实挂接点」链路，专查玩家在战斗里能看到的数值与画面。
   REVERT=round|forced|record|mark|nullify 时把对应修复在内存里改回旧版，断言必须精准打红。
   不碰产品文件、不重建 bundle。 */
const fs = require("fs");
const vm = require("vm");
const { installGlobals, loadRuntime } = require("./skill-coverage-fixtures");

installGlobals();
loadRuntime();

const REVERT = process.env.REVERT || "";
const src = f => fs.readFileSync(`./src/original/${f}`, "utf8");

// 真实伤害取整公式直接从产品源码提取，避免测试自己写死一个等价公式造成空转。
const resolutionSrc = src("battle-damage-resolution.js");
const roundMatch = resolutionSrc.match(/amount = amount > 0 \? ([^;]+) : 0;/);
if (!roundMatch) throw new Error("未能从 battle-damage-resolution.js 提取取整公式");
const roundAmount = new Function("amount", `return amount > 0 ? ${roundMatch[1]} : 0;`);

const REVERT_TARGET = {
  round: "holy-eagle-sword-skills.js",
  forced: "gaianis-amulet-skills.js",
  record: "holy-eagle-sword-skills.js",
  mark: "holy-eagle-sword-skills.js",
  nullify: "gaianis-amulet-skills.js",
};

function load(file) {
  let text = src(file);
  const original = text;
  if (REVERT === "round") {
    text = text.replace("return Math.round(amount) * 2;", "return amount * 2;");
  } else if (REVERT === "forced") {
    text = text.replace(
      "window.BattleStatusCardStorage?.consumeRemoved?.(state, unit, card, false);",
      "window.BattleStatusCardStorage?.consumeRemoved?.(state, unit, card, true);");
  } else if (REVERT === "record") {
    text = text.replace(
      "  function recordHit(state, actor, target, card, hpLoss) {",
      "  function recordHit(state, actor, target, card, hpLoss) { return false;");
  } else if (REVERT === "mark") {
    text = text.replace(
      "  function modifyDamage(state, actor, target, card, amount) {",
      "  function modifyDamage(state, actor, target, card, amount) { return amount;");
  } else if (REVERT === "nullify") {
    text = text.replace(
      "    if (registry?.isStatus && !registry.isStatus(card)) return false;",
      "    // REVERT: 旧版不校验牌种");
  }
  if (REVERT && REVERT_TARGET[REVERT] === file && text === original) {
    console.error(`REVERT=${REVERT} 未在 ${file} 命中替换目标，反向验证失效`);
    process.exitCode = 1;
  }
  vm.runInThisContext(text, { filename: file });
}

[
  "gaianis-amulet-skills.js",
  "holy-eagle-sword-skills.js",
  "battle-status-card-registry.js",
  "battle-status-card-storage.js",
  "hp-value.js", "battle-status-card-triggers.js",
  "battle-status-cards.js",
  "battle-draw-feedback.js",
  "battle-combat-card-effects.js",
  "battle-combat-attack-values.js",
].forEach(load);

// ---- 可控运行桩 ----
const equipped = new Set();
window.RelicSystem = { hasEquipped: (_s, _u, name) => equipped.has(name) };
window.BattleLog = { add(state, text) { (state.log ||= []).unshift(String(text)); } };
window.BattleLines = { skill() {}, clearSkillCaption() {} };
window.GameRandom ||= { id: () => "id", sample: list => list[0] };
window.BattlePileStats ||= { reshuffle() {} };
window.BattleSystem ||= { pushFloat() {}, draw() {}, useVirtualKill() {} };

const putCalls = [];
window.BattleCards = {
  put(b, owner, card, pile, opts = {}) {
    putCalls.push({ owner, card, pile, opts: { ...opts } });
    (owner[pile] ||= []).push(card);
    // 复刻真实 put()：forcedDiscard 会写一张「被弃置」快照进出牌区。
    if (opts.forcedDiscard && b) {
      b.played = [{ ...card, dismantled: true, _playedAction: "被弃置" }, ...(b.played || [])];
    }
  },
  putMany() {},
  afterHandLost() {},
  syncStatusCards() {},
};

const slash = (extra = {}) => ({
  name: "杀（普攻）", type: "slash", suit: "♠", power: 0, scale: "attack", ...extra,
});
const obstacle = (extra = {}) => ({
  name: "束缚陷阱", type: "obstacle", statusKey: "stun", suit: "♥", ...extra,
});

function unit(uid, side = "ally") {
  return {
    uid, side, name: `单位${uid}`, hand: [], deck: [], discard: [], consumed: [],
    pileStats: { deck: [], discard: [], consumed: [] },
    hp: 500, maxHp: 500, block: 0, intent: 3, stats: { attack: 9.6, magic: 0, speed: 0 },
  };
}
function battle(turn = 1) {
  return { turn, phase: 4, locked: false, played: [], animQueue: [], allies: [], enemies: [] };
}
function state(b) {
  return { battle: b, log: [], resources: { relics: [] }, equipment: {} };
}

let pass = 0, fail = 0;
const checks = [];
function check(id, desc, fn) {
  try {
    fn();
    pass += 1;
    checks.push([id, "PASS", desc]);
  } catch (error) {
    fail += 1;
    checks.push([id, "FAIL", `${desc} :: ${error.message}`]);
  }
}
const eq = (actual, expected, label) => {
  if (actual !== expected) throw new Error(`${label}: 期望 ${expected}，实得 ${actual}`);
};
const ok = (cond, label) => { if (!cond) throw new Error(label); };

// damage 桩：按产品真实取整公式结算，忽略护甲/闪避（本测试只验数值口径）。
function damage(_s, target, amount) {
  const value = roundAmount(amount);
  const loss = Math.max(0, Math.min(target.hp, value));
  target.hp -= loss;
  return { hpLoss: loss, dodged: false };
}

function valuesFactory(overrides = {}) {
  return window.BattleCombatAttackValues({
    deps: {
      isKillCard: c => window.CardUtils.isKillCard(c),
      tempAttack: u => (u.stats?.attack || 0) + (u.tempAttack || 0),
      draw: (u, n, b) => window.BattleSystem.draw(u, n, b),
      intentMax: () => 9,
      ...overrides.deps,
    },
    damage,
    statOf: (u, key) => u.stats?.[key] || 0,
    pushFloat() {},
    isSingleSlash: c => window.CardUtils.isSingleKill(c),
  });
}

// ============ A 圣鹰剑：小数攻击力下「翻倍」是否严格 2 倍 ============
function twoSlashLosses(attackValue) {
  equipped.clear(); equipped.add("圣鹰剑");
  const b = battle(1), s = state(b);
  const actor = unit("a0"), target = unit("e0", "enemy");
  actor.stats.attack = attackValue;
  b.allies = [actor]; b.enemies = [target];
  const values = valuesFactory();
  const baseCard = c => ({ ...c, power: 0, scale: "attack" });
  // 第一张：未标记，不翻倍
  const first = values.slashTargetAmount(s, actor, target, baseCard(slash()), attackValue);
  values.hitTarget(s, actor, target, baseCard(slash()), first);
  const loss1 = 500 - target.hp;
  // 第二张：已标记，应严格翻倍
  const second = values.slashTargetAmount(s, actor, target, baseCard(slash()), attackValue);
  values.hitTarget(s, actor, target, baseCard(slash()), second);
  const loss2 = 500 - target.hp - loss1;
  return { loss1, loss2, first, second, log: s.log };
}

check("A1", "小数攻击力 9.6：第一张伤害按产品取整", () => {
  eq(twoSlashLosses(9.6).loss1, 10, "第一张");
});
check("A2", "小数攻击力 9.6：第二张伤害严格等于第一张的 2 倍", () => {
  const r = twoSlashLosses(9.6);
  eq(r.loss2, r.loss1 * 2, "翻倍后");
});
check("A3", "小数攻击力 4.5：翻倍仍严格 2 倍", () => {
  const r = twoSlashLosses(4.5);
  eq(r.loss2, r.loss1 * 2, "翻倍后");
});
check("A4", "整数攻击力 10：翻倍仍严格 2 倍（不误伤常规场景）", () => {
  const r = twoSlashLosses(10);
  eq(r.loss1, 10, "第一张"); eq(r.loss2, 20, "第二张");
});
check("A5", "翻倍战报确实写出", () => {
  ok(twoSlashLosses(9.6).log.some(t => t.includes("圣鹰剑触发")), "战报缺圣鹰剑触发");
});

// ============ B 护符：兜底消耗路径与正常路径画面一致 ============
function consumePaths() {
  equipped.clear(); equipped.add("盖亚妮丝护符");
  const b = battle(1), s = state(b);
  const holder = unit("a0");
  b.allies = [holder]; b.enemies = [unit("e0", "enemy")];
  putCalls.length = 0;
  const statusCard = { name: "眩晕", type: "status", statusKey: "stun", stun: true };
  // 正常链路：add 阶段
  const normal = window.GaianisAmuletSkills.nullifyStatus(s, holder, { ...statusCard }, "测试");
  const normalCall = putCalls[putCalls.length - 1];
  const normalPlayed = b.played.length;
  b.played = []; putCalls.length = 0;
  // 兜底链路：判定层（存档残留 / 手动注入）
  holder.hand.push({ ...statusCard });
  const suppressed = window.GaianisAmuletSkills.suppressJudgement(s, holder, holder.hand[0]);
  const fallbackCall = putCalls[putCalls.length - 1];
  const fallbackPlayed = b.played.length;
  return { normal, suppressed, normalCall, fallbackCall, normalPlayed, fallbackPlayed, b, holder, s };
}

check("B1", "两条消耗路径都返回已处理", () => {
  const r = consumePaths(); ok(r.normal && r.suppressed, "有路径未处理");
});
check("B2", "正常链路不写「被弃置」快照进出牌区", () => {
  const r = consumePaths(); eq(r.normalPlayed, 0, "正常链路出牌区快照数");
});
check("B3", "兜底链路同样不写「被弃置」快照进出牌区（forcedDiscard 一致性）", () => {
  const r = consumePaths(); eq(r.fallbackPlayed, 0, "兜底链路出牌区快照数");
});
check("B4", "兜底链路的 put opts 不含 forcedDiscard", () => {
  const r = consumePaths();
  ok(r.fallbackCall, "兜底未调用 put");
  ok(!r.fallbackCall.opts.forcedDiscard, "兜底仍带 forcedDiscard");
});
check("B5", "两条路径都把状态牌放进持有者消耗区", () => {
  const r = consumePaths();
  eq(r.normalCall.pile, "consumed", "正常链路去向");
  eq(r.fallbackCall.pile, "consumed", "兜底链路去向");
  ok(r.holder.consumed.length >= 1, "消耗区没有牌");
});
check("B6", "兜底链路把残留牌移出手牌", () => {
  const r = consumePaths(); eq(r.holder.hand.length, 0, "残留手牌数");
});
check("B7", "兜底链路写出「判定无效」战报", () => {
  const r = consumePaths(); ok(r.s.log.some(t => t.includes("判定无效")), "缺判定无效战报");
});

// ============ C 障碍牌无效后不吞其它结算 ============
check("C1", "障碍牌对持有者无效时不生成状态牌", () => {
  equipped.clear(); equipped.add("盖亚妮丝护符");
  const b = battle(1), s = state(b);
  const actor = unit("e0", "enemy"), target = unit("a0");
  b.allies = [target]; b.enemies = [actor];
  window.BattleStatusCards = { apply() { throw new Error("不应生成状态牌"); } };
  const effects = window.BattleCombatCardEffects({
    deps: { draw: () => [], isKillCard: () => false }, specials: {}, damage,
    useCard() {}, statOf: () => 0, pushFloat() {}, checkDefeat() {}, checkEnd() {},
    repeatIfDone() {},
  });
  const card = obstacle();
  ok(effects.resolve(s, actor, target, card) === true, "resolve 未拦下");
});
check("C2", "其他角色使用障碍牌时持有者摸 1 张", () => {
  equipped.clear(); equipped.add("盖亚妮丝护符");
  const b = battle(1), s = state(b);
  const actor = unit("e0", "enemy"), target = unit("a0");
  b.allies = [target]; b.enemies = [actor];
  const effects = window.BattleCombatCardEffects({
    deps: {
      draw: (u, n) => { for (let i = 0; i < n; i += 1) u.hand.push(slash({ name: `摸牌${i}` })); return []; },
      isKillCard: () => false,
    },
    specials: {}, damage, useCard() {}, statOf: () => 0, pushFloat() {},
    checkDefeat() {}, checkEnd() {}, repeatIfDone() {},
  });
  effects.resolve(s, actor, target, obstacle());
  eq(target.hand.length, 1, "摸牌后手牌数");
  ok(s.log.some(t => t.includes("摸1张牌")), "缺摸牌战报");
});
check("C3", "自己使用障碍牌不摸牌（同 uid 副本也算自己）", () => {
  equipped.clear(); equipped.add("盖亚妮丝护符");
  const b = battle(1), s = state(b);
  const holder = unit("a0"); b.allies = [holder]; b.enemies = [];
  const clone = { ...holder, hand: holder.hand };
  const effects = window.BattleCombatCardEffects({
    deps: { draw: () => { holder.hand.push(slash()); return []; }, isKillCard: () => false },
    specials: {}, damage, useCard() {}, statOf: () => 0, pushFloat() {},
    checkDefeat() {}, checkEnd() {}, repeatIfDone() {},
  });
  effects.resolve(s, clone, holder, obstacle());
  eq(holder.hand.length, 0, "自己用不应摸牌");
});

// ============ D 圣鹰剑：隔离与既有边界（确认修复没破坏） ============
function hitOnce(actor, target, b, s, card = slash(), hpLoss = 10) {
  const values = valuesFactory();
  const amount = values.slashTargetAmount(s, actor, target, { ...card, power: 0, scale: "attack" }, 10);
  const copy = { ...card, power: 0, scale: "attack" };
  const dmg = (_st, _t, amt) => {
    const v = roundAmount(amt); const loss = Math.min(_t.hp, Math.max(0, v));
    _t.hp -= loss; return { hpLoss: hpLoss > 0 ? loss : 0, dodged: false };
  };
  const v = window.BattleCombatAttackValues({
    deps: { isKillCard: c => window.CardUtils.isKillCard(c), tempAttack: () => 10, intentMax: () => 9 },
    damage: dmg, statOf: () => 10, pushFloat() {}, isSingleSlash: c => window.CardUtils.isSingleKill(c),
  });
  return { amount: v.slashTargetAmount(s, actor, target, copy, 10), values: v, copy };
}

check("D1", "未装备圣鹰剑不翻倍", () => {
  equipped.clear();
  const b = battle(1), s = state(b), a = unit("a0"), t = unit("e0", "enemy");
  b.allies = [a]; b.enemies = [t];
  eq(hitOnce(a, t, b, s).amount, 10, "未装备伤害");
});
check("D2", "群体杀不吃圣鹰剑翻倍", () => {
  equipped.clear(); equipped.add("圣鹰剑");
  const b = battle(1), s = state(b), a = unit("a0"), t = unit("e0", "enemy");
  b.allies = [a]; b.enemies = [t];
  window.HolyEagleSwordSkills.recordHit(s, a, t, slash(), 10);
  eq(hitOnce(a, t, b, s, slash({ sweep: true })).amount, 10, "群体杀伤害");
});
check("D3", "跨回合标记自然失效", () => {
  equipped.clear(); equipped.add("圣鹰剑");
  const b = battle(1), s = state(b), a = unit("a0"), t = unit("e0", "enemy");
  b.allies = [a]; b.enemies = [t];
  window.HolyEagleSwordSkills.recordHit(s, a, t, slash(), 10);
  b.turn = 2;
  eq(hitOnce(a, t, b, s).amount, 10, "跨回合伤害");
});
check("D4", "跨战斗（同 turn=1 的新 battle）标记失效", () => {
  equipped.clear(); equipped.add("圣鹰剑");
  const b1 = battle(1), s1 = state(b1), a = unit("a0"), t = unit("e0", "enemy");
  b1.allies = [a]; b1.enemies = [t];
  window.HolyEagleSwordSkills.recordHit(s1, a, t, slash(), 10);
  const b2 = battle(1), s2 = state(b2);
  b2.allies = [a]; b2.enemies = [t];
  eq(hitOnce(a, t, b2, s2).amount, 10, "新战斗首张伤害");
});
check("D5", "不同目标不共享标记", () => {
  equipped.clear(); equipped.add("圣鹰剑");
  const b = battle(1), s = state(b), a = unit("a0"), t1 = unit("e0", "enemy"), t2 = unit("e1", "enemy");
  b.allies = [a]; b.enemies = [t1, t2];
  window.HolyEagleSwordSkills.recordHit(s, a, t1, slash(), 10);
  eq(hitOnce(a, t2, b, s).amount, 10, "另一目标伤害");
});
check("D6", "存档退化（targets 变成普通对象）不抛异常也不误翻倍", () => {
  equipped.clear(); equipped.add("圣鹰剑");
  const b = battle(1), s = state(b), a = unit("a0"), t = unit("e0", "enemy");
  b.allies = [a]; b.enemies = [t];
  window.HolyEagleSwordSkills.recordHit(s, a, t, slash(), 10);
  // 反向态（recordHit 被撤）下标记根本不存在，JSON.parse(undefined) 会误报解析错。
  a._holyEagleSword = a._holyEagleSword
    ? JSON.parse(JSON.stringify(a._holyEagleSword)) : a._holyEagleSword;
  // 退化标记本身必须被判为无效（不再额外打一张杀重建标记）。
  eq(hitOnce(a, t, b, s).amount, 10, "退化标记不应误翻倍");
  let threw = false;
  try { window.HolyEagleSwordSkills.recordHit(s, a, t, slash(), 10); } catch (_) { threw = true; }
  ok(!threw, "recordHit 在退化标记上抛异常");
});
check("D7", "名刀鬼切 + 圣鹰剑可叠成 ×4（整数口径）", () => {
  equipped.clear(); equipped.add("圣鹰剑"); equipped.add("名刀鬼切");
  const b = battle(1), s = state(b), a = unit("a0"), t = unit("e0", "enemy");
  t.hp = 100; b.allies = [a]; b.enemies = [t];
  window.HolyEagleSwordSkills.recordHit(s, a, t, slash(), 10);
  eq(hitOnce(a, t, b, s).amount, 40, "双饰品叠加");
});
check("D8", "hpLoss 为 0 不记录标记", () => {
  equipped.clear(); equipped.add("圣鹰剑");
  const b = battle(1), s = state(b), a = unit("a0"), t = unit("e0", "enemy");
  b.allies = [a]; b.enemies = [t];
  eq(window.HolyEagleSwordSkills.recordHit(s, a, t, slash(), 0), false, "零伤害不应记录");
  eq(hitOnce(a, t, b, s).amount, 10, "零伤害后不应翻倍");
});

// ============ E 护符：其它来源与边界 ============
check("E1", "普通牌不被当成状态牌吞掉", () => {
  equipped.clear(); equipped.add("盖亚妮丝护符");
  const b = battle(1), s = state(b), holder = unit("a0");
  b.allies = [holder];
  putCalls.length = 0;
  const result = window.GaianisAmuletSkills.nullifyStatus(s, holder, slash());
  eq(result, false, "普通牌不应被拦");
  eq(putCalls.length, 0, "普通牌不应进消耗区");
});
check("E2", "粘液 / 地雷等其它状态牌同样无效", () => {
  equipped.clear(); equipped.add("盖亚妮丝护符");
  const b = battle(1), s = state(b), holder = unit("a0");
  b.allies = [holder];
  for (const key of ["slime", "landmine"]) {
    const c = { name: key, type: "status", statusKey: key, [key]: true };
    ok(window.GaianisAmuletSkills.nullifyStatus(s, holder, c), `${key} 未被拦`);
  }
});
check("E3", "吸魔邪眼转交时摸牌文案按实到手数、不谎报", () => {
  equipped.clear(); equipped.add("盖亚妮丝护符");
  const b = battle(1), s = state(b);
  const actor = unit("e0", "enemy"), target = unit("a0");
  b.allies = [target]; b.enemies = [actor];
  const effects = window.BattleCombatCardEffects({
    deps: {
      draw: (_u, _n) => [{ name: "摸牌0", type: "tactic" }], // 抽出但未到手
      isKillCard: () => false,
    },
    specials: {}, damage, useCard() {}, statOf: () => 0, pushFloat() {},
    checkDefeat() {}, checkEnd() {}, repeatIfDone() {},
  });
  effects.resolve(s, actor, target, obstacle());
  eq(target.hand.length, 0, "到手张数");
  ok(s.log.some(t => t.includes("未能摸牌")), "缺未能摸牌战报");
  ok(!s.log.some(t => t.includes("摸1张牌")), "仍在谎报摸1张");
});
check("E4", "判定层兜底对 5 种判定状态牌都生效且不触发判定效果", () => {
  equipped.clear(); equipped.add("盖亚妮丝护符");
  const b = battle(1), s = state(b), holder = unit("a0");
  b.allies = [holder];
  const keys = ["stun", "seal", "paralysis", "confusion", "freeze"];
  keys.forEach(key => holder.hand.push({ name: key, type: "status", statusKey: key, [key]: true }));
  window.BattleStatusCardTriggers.judgement(s, holder);
  eq(holder.skipPlayPhase, undefined, "不应触发眩晕跳过");
  eq(holder.drawLockedThisTurn, undefined, "不应触发封魔");
  eq(holder.hand.length, 0, "残留状态牌未清");
});
check("E5", "未装备护符时状态牌正常生效（反向对照，确认不是恒绿）", () => {
  equipped.clear();
  const b = battle(1), s = state(b), holder = unit("a0");
  b.allies = [holder];
  putCalls.length = 0;
  eq(window.GaianisAmuletSkills.nullifyStatus(s, holder, { name: "眩晕", type: "status", stun: true }), false, "未装备不应拦");
});

// ---- 输出 ----
for (const [id, status, desc] of checks) console.log(`${status} ${id} ${desc}`);
console.log(`RESULT pass=${pass} fail=${fail} REVERT=${REVERT || "none"}`);
if (fail) process.exitCode = 1;
