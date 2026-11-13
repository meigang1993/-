// 209：状态 DOT 结算口径定案后的严格检查。
// 口径 A：毒按施加者分组分别结算（对齐燃烧），伤害/MVP 统计/击杀各自归属；
//         合并成一次结算会把 A/B 两人的毒伤全部记到首位施加者名下。
// 口径 B：毒/燃烧等状态 DOT 段不再触发感电追加；主动牌伤害照常触发，
//         感电自身段仍由 shockBonus 防自激。
// 带 REVERT=group|shock 源码级反向验证，确认断言不是空转。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const SRC = n => fs.readFileSync(path.join(ROOT, "src/original", n), "utf8");
const texts = {
  stats: SRC("battle-stats.js"),
  status: SRC("enemy-status-effects.js"),
  hooks: SRC("enemy-damage-hooks.js"),
};
const REVERT = process.env.REVERT || "none";

const LEGACY_POISON_TICK = `  function tickPoison(state, unit, damage) {
    if (!unit.poison || unit.hp <= 0) return;
    const marks = normalizeMarks(state, unit);
    const amount = marks.reduce((sum, mark) => sum + markerDamage(state, mark), 0);
    if (!amount) return;
    const sourceUid = marks[0]?.sourceUid || unit.poisonSourceUid || null;
    const source = actorOf(state, sourceUid) || shadowSource(unit, sourceUid, "毒");
    damage(state, unit, amount, "毒", source, {
      name: "毒", type: "skill", poison: true, poisonTick: true,
      ignoreResponse: true, ignoreBlock: true, skipDamageModify: true,
    });
  }`;

function revert(name, src) {
  if (REVERT === "group" && name === "status") {
    const start = src.indexOf("  // 按施加者分组分别结算");
    const end = src.indexOf("\n\n  return { addPoison", start);
    if (start < 0 || end < 0) throw new Error("REVERT=group 未命中 tickPoison 分组块");
    return src.slice(0, start) + LEGACY_POISON_TICK + src.slice(end);
  }
  if (REVERT === "shock" && name === "hooks") {
    const out = src.replace(
      / && !card\?\.poisonTick && !card\?\.burningTick\)/g, ")");
    if (out === src) throw new Error("REVERT=shock 未命中感电排除条件");
    return out;
  }
  return src;
}

let passed = 0;
let total = 0;
const failures = [];
const T = (name, ok, extra) => {
  total += 1;
  if (ok) passed += 1;
  else failures.push({ name, extra });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` ${JSON.stringify(extra)}`}`);
};

function makeWindow() {
  const log = [];
  const win = {
    BattleLog: { add: (_s, text) => log.push(text) },
    log,
    SakuraRisaSkills: { pendingRevival: () => false },
    BattleReactionQueue: {
      directDamageAction: () => null, enqueue: () => false, flush() {},
    },
  };
  const ctx = { window: win, Math, Number, Array, Object, String, JSON, Set, Map, console };
  for (const name of ["stats", "status", "hooks"]) {
    vm.runInNewContext(revert(name, texts[name]), ctx, { filename: name });
  }
  return win;
}

function unit(uid, hp, attack, extra = {}) {
  return Object.assign({
    uid, name: uid, side: "enemy", hp, maxHp: hp,
    stats: { attack }, tempAttack: 0, hand: [], statuses: [], block: 0,
  }, extra);
}

function stateOf(win, allies, victim) {
  return { battle: { allies, enemies: [victim], locked: false, performance: {} } };
}

function statusApi(win) {
  return win.EnemyStatusEffects({
    alive: us => us.filter(u => u && u.hp > 0),
    markStatus: (u, s) => {
      u.statuses ||= [];
      if (!u.statuses.includes(s)) u.statuses.push(s);
    },
  });
}

const win = makeWindow();
const api = statusApi(win);

// ── A 毒多施加者：分组分别结算、统计各自归属 ──
{
  const a1 = unit("a1", 100, 30, { side: "ally" });
  const a2 = unit("a2", 100, 10, { side: "ally" });
  const victim = unit("e0", 300, 5);
  const st = stateOf(win, [a1, a2], victim);
  api.addPoison(st, victim, 1, a1);   // 30 → 9
  api.addPoison(st, victim, 1, a2);   // 10 → 3
  api.addPoison(st, victim, 1, a1);   // 30 → 9（a1 合计 18）
  const calls = [];
  api.tickPoison(st, victim, (...args) => calls.push(args));
  const rows = calls.map(c => ({ amount: c[2], label: c[3], uid: c[4]?.uid }));
  T("A1 多施加者毒按 uid 分两组分别结算", calls.length === 2, { rows });
  T("A2 两组金额各按施加者攻击力快照（a1=9×2=18 / a2=3）",
    rows[0]?.amount === 18 && rows[0]?.uid === "a1"
    && rows[1]?.amount === 3 && rows[1]?.uid === "a2", { rows });
  T("A3 总伤害守恒（18+3=21，与合并口径相同）",
    rows.reduce((s, r) => s + r.amount, 0) === 21, { rows });
  T("A4 每组载荷仍带 poisonTick / skipDamageModify 防再叠毒",
    calls.every(c => c[5]?.poisonTick === true && c[5]?.skipDamageModify === true),
    { cards: calls.map(c => c[5]) });
  const record = () => calls.forEach(c => {
    win.BattleStats.damage(st.battle, c[4], victim, c[2], victim.hp);
  });
  record();
  const perf = st.battle.performance;
  T("A5 MVP 统计按施加者分别记账（a1=18 / a2=3），不再全归首位",
    perf.a1?.damage === 18 && perf.a2?.damage === 3
    && perf.a1?.damage !== 21 && perf.a2?.damage !== 0, { perf });
  T("A6 统计不被同阵营判据吞掉（两名施加者均为 ally）",
    calls.every(c => c[4]?.side === "ally"), { sides: calls.map(c => c[4]?.side) });
}

// ── B 单施加者行为不变（既有断言口径不被破坏） ──
{
  const a = unit("a3", 100, 10, { side: "ally" });
  const victim = unit("e1", 300, 5);
  const st = stateOf(win, [a], victim);
  api.addPoison(st, victim, 3, a);
  const calls = [];
  api.tickPoison(st, victim, (...args) => calls.push(args));
  T("B1 单施加者仍只结算一次", calls.length === 1, { n: calls.length });
  T("B2 单施加者金额按 3×30%×3=9，载荷与来源不变",
    calls[0]?.[2] === 9 && calls[0]?.[4]?.uid === "a3"
    && calls[0]?.[5]?.poisonTick === true, { row: calls[0]?.slice(2) });
}

// ── B3/B4 分组结算的中断守卫：首段致死或触发挂起后不得再结算后续组 ──
// 探针第一版曾在这里报红（目标阵亡后仍打第二组），修复是循环开头
// 「unit.hp <= 0 || state.battle?.locked」的 break；正式测试必须固化。
{
  const a1 = unit("a5", 100, 30, { side: "ally" });
  const a2 = unit("a6", 100, 10, { side: "ally" });
  const dead = unit("e4", 12, 5);
  const st1 = stateOf(win, [a1, a2], dead);
  api.addPoison(st1, dead, 1, a1);   // 30 → 9
  api.addPoison(st1, dead, 1, a2);   // 10 → 3
  const calls1 = [];
  api.tickPoison(st1, dead, (...args) => {
    calls1.push(args);
    dead.hp = 0;                     // 模拟首段结算后目标阵亡
  });
  T("B3 首段致死 / 阵亡后不再结算后续组", calls1.length === 1,
    { n: calls1.length, amounts: calls1.map(c => c[2]) });

  const held = unit("e5", 300, 5);
  const st2 = stateOf(win, [a1, a2], held);
  api.addPoison(st2, held, 1, a1);
  api.addPoison(st2, held, 1, a2);
  const calls2 = [];
  api.tickPoison(st2, held, (...args) => {
    calls2.push(args);
    st2.battle.locked = true;        // 模拟首段触发响应挂起
  });
  T("B4 战斗挂起后不再结算后续组（挂起期间不改写手牌 / 战报）",
    calls2.length === 1, { n: calls2.length });
}

// ── C 旧档无施加者：影子来源、至少 1 点、不回退成受害者 ──
{
  const victim = unit("e2", 300, 40, { poison: 2, statuses: ["毒"] });
  const st = stateOf(win, [], victim);
  const calls = [];
  api.tickPoison(st, victim, (...args) => calls.push(args));
  T("C1 旧档毒标记合并成一组、每枚至少 1 点（合计 2）",
    calls.length === 1 && calls[0]?.[2] === 2,
    { n: calls.length, amount: calls[0]?.[2] });
  T("C2 旧档来源不是受害者自己、阵营相反、攻击力 0",
    calls[0]?.[4]?.uid !== victim.uid
    && calls[0]?.[4]?.side !== victim.side
    && Number(calls[0]?.[4]?.stats?.attack || 0) === 0,
    { src: calls[0]?.[4] });
}

// ── D 口径 B：状态 DOT 段不触发感电，主动牌照常触发 ──
{
  const actor = unit("a4", 100, 10, { side: "ally" });
  const victim = unit("e3", 200, 1);
  const st = stateOf(win, [actor], victim);
  victim.shock = 1;
  const hooks = win.EnemyDamageHooks({
    hasSkill: () => false,
    machine: { afterDamage() {} },
    discardOne: () => null,
    status: {
      shockDamage: api.shockDamage,
      addShock: api.addShock,
      addHolyScar() {},
      addPoison: api.addPoison,
    },
  });
  const poisonCard = {
    name: "毒", type: "skill", poison: true, poisonTick: true,
    ignoreResponse: true, ignoreBlock: true, skipDamageModify: true,
  };
  const burnCard = {
    name: "燃烧", type: "skill", fire: true, burningTick: true,
    skipDamageModify: true,
  };
  const shockCalls = [];
  hooks.afterDamage(st, actor, victim, poisonCard, 5,
    (...args) => shockCalls.push(args));
  T("D1 毒 tick 不再追加感电伤害", shockCalls.length === 0,
    { n: shockCalls.length });
  const burnCalls = [];
  hooks.afterDamage(st, actor, victim, burnCard, 5,
    (...args) => burnCalls.push(args));
  T("D2 燃烧 tick 不再追加感电伤害", burnCalls.length === 0,
    { n: burnCalls.length });
  const normalCalls = [];
  hooks.afterDamage(st, actor, victim, { name: "杀", type: "slash" }, 5,
    (...args) => normalCalls.push(args));
  T("D3 主动牌造成伤害仍追加一次感电（回归）",
    normalCalls.length === 1 && normalCalls[0]?.[3] === "感电",
    { n: normalCalls.length, label: normalCalls[0]?.[3] });
  T("D4 感电追加段仍带 shockBonus 防自激",
    normalCalls[0]?.[5]?.shockBonus === true,
    { card: normalCalls[0]?.[5] });
  const selfCalls = [];
  hooks.afterDamage(st, actor, victim,
    { name: "感电", type: "skill", shockBonus: true }, 5,
    (...args) => selfCalls.push(args));
  T("D5 感电自身段不再递归追加", selfCalls.length === 0,
    { n: selfCalls.length });
}

// ── E 源码静态：修复字符串在位 ──
{
  T("E1 毒 tick 已按施加者分组",
    /const groups = new Map\(\);/.test(texts.status)
    && /for \(const \[uid, group\] of groups\)/.test(texts.status));
  T("E2 感电触发条件已排除 poisonTick / burningTick",
    /!card\?\.poisonTick && !card\?\.burningTick/.test(texts.hooks));
  T("E3 感电自身段仍保留 shockBonus 防自激",
    /!card\?\.shockBonus/.test(texts.hooks));
  T("E4 燃烧仍按施加者分组（口径 A 的对齐基准）",
    /const groups = new Map\(\);/.test(SRC("bakar-fire-skills.js")));
}

const result = { passed, total, failures, revert: REVERT };
console.log(JSON.stringify(result, null, 2));
if (REVERT === "none" && passed !== total) process.exitCode = 1;
if (REVERT !== "none" && passed !== total) {
  console.log(`REVERT_OK ${REVERT}: ${failures.length} 项精准打红`);
}
