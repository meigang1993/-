// 【终极刀魔】两条口径反转复查（不复用其它测试的 mock，直接装配真实模块）：
//   口径1：饰品主动技 convertAs 的实体转换杀（_entityConversion，如【魅杀】）
//          重新计入 X 并消耗预约；其余技能生成的牌仍排除。
//   口径2：连击/额外结算的派生虚拟杀改用 _skipPlayedSlashFlag 窄标记，
//          只抑制 playedSlashThisTurn，不挂 _skipUseKillTriggers，
//          【武士铠甲】【精灵女神守护之剑】照常触发；妖刀村雨/借刀杀旧宽标记不变。
// REVERT=conversion|narrow|flagline|cleanup 为源码级反向验证，应精准打红。
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const ROOT = path.join(__dirname, "../src/original");
const REVERT = process.env.REVERT || "";
let pass = 0;
const reds = [];
function T(name, cond, extra) {
  if (cond) { pass += 1; return; }
  reds.push(name);
  if (REVERT) console.log(`  RED ${name}`, extra === undefined ? "" : JSON.stringify(extra));
}
function read(file) { return fs.readFileSync(path.join(ROOT, file), "utf8"); }
function hit(before, after, tag) {
  assert.notStrictEqual(after, before, `REVERT=${REVERT} must hit ${tag}`);
  return after;
}
const FIXED_GATE = "    const isCountedKill = !!card && !!window.CardUtils?.isEntitySingleKill?.(card)\n"
  + "      && !card.generatedBySkill\n"
  + "      && (!card._skill || !!card._entityConversion);";
const OLD_GATE = "    const isCountedKill = !!card && !!window.CardUtils?.isEntitySingleKill?.(card)\n"
  + "      && !card.generatedBySkill && !card._skill;";
function patched(file) {
  let s = read(file);
  if (REVERT === "conversion" && file === "noa-ultimate-blade-skills.js") {
    s = hit(s, s.replace(FIXED_GATE, OLD_GATE), "conversion-kill re-include");
  }
  if (REVERT === "narrow" && file === "chiyo-chain-skills.js") {
    s = hit(s, s.replace("      _skipPlayedSlashFlag: true,\n",
      "      _skipUseKillTriggers: true,\n"), "narrow flag");
  }
  if (REVERT === "flagline" && file === "battle-combat-attack-flow.js") {
    s = hit(s, s.replace("!card._skipUseKillTriggers && !card._skipPlayedSlashFlag",
      "!card._skipUseKillTriggers"), "flag line");
  }
  if (REVERT === "cleanup" && file === "battle-card-cleanup.js") {
    s = hit(s, s.replace('"_skipUseKillTriggers", "_skipPlayedSlashFlag", "skipAfterCardPlayed"',
      '"_skipUseKillTriggers", "skipAfterCardPlayed"'), "cleanup key");
  }
  return s;
}

function makeWin(opts = {}) {
  const calls = [];
  const ctx = {
    console, Math, JSON, Object, Array, Set, Map, String, Number, Boolean,
    RegExp, Date, Error,
  };
  ctx.window = ctx;
  ctx.GameDataCards = {
    cardCodex: [
      { name: "杀（普攻）", type: "slash", scale: "attack", suit: "" },
      { name: "魅杀", type: "slash", scale: "magic", suit: "" },
      { name: "咬杀", type: "slash", scale: "attack", suit: "" },
    ],
    baseDeck: [], eliteCards: [],
  };
  ctx.BattleLog = { add: (state, text) => { (state.log ||= []).push(text); } };
  ctx.BattleLines = { skill: () => {} };
  ctx.RuinsEnemySkills = { blocksKillTarget: () => false };
  ctx.RelicSystem = {
    hasEquipped: (state, unit, name) => !!opts.equipped?.includes?.(name),
    normalizeNames: x => x, data: () => null,
  };
  ctx.BattleSystem = {
    useVirtualKill: (state, actor, target, card) => {
      calls.push({ actor: actor.uid, target: target.uid, card });
      target.hp = Math.max(0, target.hp - (opts.damage ?? 1));
      return true;
    },
    pushFloat: () => {},
  };
  ctx.GameStoreSaveSchema = {
    cardIdentity: card => ({ name: card?.name || "", suit: card?.suit || "" }),
    rebuildCard: card => card,
  };
  ctx.GameStoreBountyRepairs = { refreshBountyGold: () => {} };
  ctx.GameData = { characters: [{ id: "noa", skills: [] }] };
  vm.createContext(ctx);
  ["card-utils.js", "chiyo-chain-skills.js", "noa-ultimate-blade-skills.js",
    "guard-kelly-skills.js"]
    .forEach(file => vm.runInContext(patched(file), ctx, { filename: file }));
  return { ctx, calls };
}
const noa = (over = {}) => Object.assign({
  uid: "n0", name: "怪面诺亚", ref: "noa", id: "noa", side: "ally",
  hp: 100, maxHp: 130, hand: [], block: 0, skills: [],
}, over);
const foe = (uid, hp = 99) => ({
  uid, name: uid, ref: uid, id: uid, side: "enemy", hp, maxHp: hp, hand: [], block: 0,
});
function state(opts = {}) {
  const n = opts.noa || noa();
  return {
    view: "battle", log: [],
    battle: {
      allies: [n], enemies: opts.enemies || [foe("e0")],
      turn: opts.turn ?? 5, phase: opts.phase ?? 4,
      activeUid: opts.activeUid ?? "n0", locked: false, ended: false,
      played: [], shownPlayed: [], animQueue: [],
    },
  };
}
const entitySlash = over => Object.assign({
  name: "杀（普攻）", type: "slash", scale: "attack", suit: "♠", _playedFromHand: true,
}, over);
const convertedSlash = over => entitySlash(Object.assign({
  name: "魅杀", convertedFrom: "杀（普攻）", scale: "magic", attackType: "magic",
  _skill: true, _relicSkill: true, _entityConversion: true,
}, over));

// ── A 口径1：转换杀计入 X 并消耗预约 ──────────────────────────────────────────
{
  const { ctx, calls } = makeWin({ damage: 0 });
  const st = state();
  const n = st.battle.allies[0], e = st.battle.enemies[0];
  ctx.NoaUltimateBladeSkills.handleSpecialCard(st, n, n, { ultimateBlade: true });
  ctx.NoaUltimateBladeSkills.afterCardPlayed(st, n, e, convertedSlash());
  T("A1 【魅杀】实体转换杀计入 X", n.noaSlashCount === 1, { count: n.noaSlashCount });
  T("A2 【魅杀】消耗预约且额外结算 1 次",
    !n.noaUltimateBladePending && calls.length === 1,
    { pending: n.noaUltimateBladePending, calls: calls.length });
  T("A3 战报写明按实体单体【杀】结算",
    st.log.some(t => t.includes("已使用1张实体单体【杀】")));
}
{
  const { ctx, calls } = makeWin({ damage: 0 });
  const st = state();
  const n = st.battle.allies[0], e = st.battle.enemies[0];
  ctx.NoaUltimateBladeSkills.handleSpecialCard(st, n, n, { ultimateBlade: true });
  ctx.NoaUltimateBladeSkills.afterCardPlayed(st, n, e,
    entitySlash({ _skill: true, temporary: true }));
  T("A4 非转换的技能实体杀仍不计入 X、不消耗预约",
    !n.noaSlashCount && n.noaUltimateBladePending === true && calls.length === 0,
    { count: n.noaSlashCount, pending: n.noaUltimateBladePending });
  ctx.NoaUltimateBladeSkills.afterCardPlayed(st, n, e, entitySlash());
  T("A5 预约保留到下一张普通实体单体杀才触发",
    n.noaSlashCount === 1 && !n.noaUltimateBladePending && calls.length === 1);
}
{
  const { ctx, calls } = makeWin({ damage: 0 });
  const st = state();
  const n = st.battle.allies[0], e = st.battle.enemies[0];
  ctx.NoaUltimateBladeSkills.handleSpecialCard(st, n, n, { ultimateBlade: true });
  ctx.NoaUltimateBladeSkills.afterCardPlayed(st, n, e, entitySlash({
    virtual: true, generatedBySkill: "淫气改造" }));
  ctx.NoaUltimateBladeSkills.afterCardPlayed(st, n, e, entitySlash({
    sweep: true, allTargets: ["e0"] }));
  T("A6 虚拟杀 / 群体实体杀仍不计入 X、不消耗预约",
    !n.noaSlashCount && n.noaUltimateBladePending === true && calls.length === 0);
}
{
  const { ctx } = makeWin({ damage: 0 });
  T("A7 真实 CardUtils 把 _entityConversion 牌视作实体牌",
    ctx.CardUtils.isEntityCard(convertedSlash())
    && !ctx.CardUtils.isEntityCard(entitySlash({ _skill: true })));
  T("A8 真实 isEntitySingleKill 认【魅杀】",
    ctx.CardUtils.isEntitySingleKill(convertedSlash()));
}

// ── B 口径2：派生杀窄标记与真实置真行 ─────────────────────────────────────────
{
  const { ctx, calls } = makeWin({ damage: 0 });
  const st = state();
  const n = st.battle.allies[0], e = st.battle.enemies[0];
  ctx.NoaUltimateBladeSkills.handleSpecialCard(st, n, n, { ultimateBlade: true });
  ctx.NoaUltimateBladeSkills.afterCardPlayed(st, n, e, entitySlash());
  const derived = calls[0]?.card || {};
  T("B1 派生虚拟杀带窄标记", derived._skipPlayedSlashFlag === true);
  T("B2 派生虚拟杀不再带旧宽标记", !derived._skipUseKillTriggers);
  T("B3 派生虚拟杀仍关闭响应与出牌后钩子",
    derived.ignoreResponse === true && derived.skipAfterCardPlayed === true);

  const flow = patched("battle-combat-attack-flow.js");
  const line = (flow.match(
    /^[ \t]*if \(!card\._skipUseKillTriggers && !card\._skipPlayedSlashFlag\) actor\.playedSlashThisTurn = true;[ \t]*$/m
  ) || [])[0];
  T("B4 真实置真行同时认宽/窄两个标记", !!line);
  if (line) {
    const stmt = new Function("card", "actor", line.trim());
    const fromDerived = {}, fromNormal = {}, fromBorrowed = {};
    stmt(derived, fromDerived);
    stmt(entitySlash(), fromNormal);
    stmt(entitySlash({ _skipUseKillTriggers: true }), fromBorrowed);
    T("B5 派生杀不置 playedSlashThisTurn", !fromDerived.playedSlashThisTurn);
    T("B6 普通实体杀仍置 playedSlashThisTurn",
      fromNormal.playedSlashThisTurn === true);
    T("B7 借刀杀（旧宽标记）仍不置 playedSlashThisTurn",
      !fromBorrowed.playedSlashThisTurn);
  }
  T("B8 出牌清理清单登记窄标记",
    patched("battle-card-cleanup.js").includes('"_skipPlayedSlashFlag"'));
  T("B9 连鬼斩源码使用窄标记而非旧宽标记",
    /_skipPlayedSlashFlag: true/.test(patched("chiyo-chain-skills.js"))
    && !/_skipUseKillTriggers: true/.test(patched("chiyo-chain-skills.js")));
}

// ── C 口径2 的实质结果：两件「使用杀牌」饰品照常触发 ──────────────────────────
{
  const { ctx, calls } = makeWin({ damage: 0, equipped: ["武士铠甲", "精灵女神守护之剑"] });
  const st = state();
  const n = st.battle.allies[0], e = st.battle.enemies[0];
  ctx.NoaUltimateBladeSkills.handleSpecialCard(st, n, n, { ultimateBlade: true });
  ctx.NoaUltimateBladeSkills.afterCardPlayed(st, n, e, entitySlash());
  const derived = calls[0]?.card || {};

  // 武士铠甲：抽真实守卫行执行（不用自写等价式）。
  const av = read("battle-combat-attack-values.js");
  const guard = (av.match(
    /^[ \t]*if \(!deps\.isKillCard\(card\) \|\| card\._skipUseKillTriggers[\s\S]*?\?\.\(state, actor, "武士铠甲"\)\) return;[ \t]*$/m
  ) || [])[0];
  T("C1 抽到武士铠甲真实守卫行", !!guard);
  if (guard) {
    const deps = { isKillCard: ctx.CardUtils.isKillCard };
    const run = new Function("deps", "card", "actor", "state", "window",
      guard + "\n    return true;");
    const actor = noa({ hand: [entitySlash(), entitySlash()] });
    const passed = run(deps, derived, actor, st, ctx);
    const borrowed = run(deps, entitySlash({ _skipUseKillTriggers: true }),
      noa({ hand: [] }), st, ctx);
    T("C2 派生杀通过武士铠甲守卫（可触发饰品）", passed === true);
    T("C3 借刀杀旧宽标记仍被武士铠甲守卫挡下", borrowed === undefined);
  }

  // 精灵女神守护之剑：加载真实 GuardKellySkills.afterDamage。
  const swordUser = noa({ uid: "n1" });
  const borrowedState = state();
  ctx.GuardKellySkills.afterDamage(st, n, e, derived, 3, swordUser);
  const gained = swordUser.block;
  const borrowedUser = noa({ uid: "n2" });
  ctx.GuardKellySkills.afterDamage(borrowedState, n, borrowedState.battle.enemies[0],
    entitySlash({ _skipUseKillTriggers: true }), 3, borrowedUser);
  T("C4 派生杀触发精灵女神守护之剑（获得护甲）", gained === 3, { block: gained });
  T("C5 借刀杀旧宽标记仍不触发守护之剑", borrowedUser.block === 0);
  T("C6 战报写明守护之剑触发", st.log.some(t => t.includes("精灵女神守护之剑触发")));
}

// ── D 静态口径与登记 ─────────────────────────────────────────────────────────
{
  const own = read("noa-ultimate-blade-skills.js");
  T("D1 计数判据与 CardUtils.isEntityCard 同口径", own.includes(FIXED_GATE));
  const notice = read("update-notice-recent.js");
  T("D2 公告写明转换杀计入与窄标记+饰品照常触发",
    /_entityConversion/.test(notice) && /_skipPlayedSlashFlag/.test(notice)
    && /照常触发/.test(notice));
  const chars = read("data-new-characters.js");
  T("D3 角色表技能描述仍为实体单体【杀】牌数",
    /已使用的实体单体【杀】牌数/.test(chars));
  const catalog = fs.readFileSync(path.join(__dirname, "qa-test-catalog.js"), "utf8");
  T("D4 新测试已登记 QA 目录",
    catalog.includes('"test-noa-ultimate-blade-scope-reverse.js": 120')
    && catalog.includes('"test-noa-ultimate-blade-scope-reverse.js",'));
  T("D5 妖刀村雨/借刀杀旧宽标记未被改动",
    /_skipUseKillTriggers: true/.test(read("battle-relic-turns.js"))
    && /_skipUseKillTriggers = true/.test(read("battle-card-tactics.js"))
    && /_skipUseKillTriggers = true/.test(read("battle-combat-responses.js")));
  T("D6 cleanup 同时清理宽/窄两个标记",
    /"_skipUseKillTriggers", "_skipPlayedSlashFlag"/.test(patched("battle-card-cleanup.js")));
}

const total = pass + reds.length;
console.log(`两条口径反转复查：${pass}/${total}` + (REVERT ? ` REVERT=${REVERT}` : ""));
if (REVERT) console.log(`RED_COUNT ${reds.length}`);
else if (reds.length) { reds.forEach(r => console.error(`  - ${r}`)); process.exit(1); }
