// 【终极刀魔】「发动后是否只在下一张实体单体【杀】触发、第 2 张以上会不会继续触发」
// 严格检查。与既有 test-noa-ultimate-blade.js 的区别：这里不直接调模块函数，而是加载
// 真实 battle-card-resume-hooks.js 的 runHooks，按真实出牌链路逐张结算（含链虚拟杀
// 触发的嵌套 runHooks），并记录 NoaUltimateBladeSkills.afterCardPlayed 的进入次数。
// REVERT=consume（不删预约）/ gate（撤预约同源门）应精准打红，断言不空转。
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
function patched(file) {
  let s = read(file);
  if (REVERT === "consume" && file === "noa-ultimate-blade-skills.js") {
    s = hit(s, s.replace(
      "    delete actor.noaUltimateBladePending;\n    delete actor.noaUltimateBladeTurn;\n    const times",
      "    const times"), "consume pending");
  }
  if (REVERT === "gate" && file === "noa-ultimate-blade-skills.js") {
    s = hit(s, s.replace("    if (!isCountedKill) return;\n", ""), "shared gate");
  }
  return s;
}

function makeEnv(opts = {}) {
  const calls = [];      // 链虚拟杀结算次数
  const hookCards = [];  // 进入 afterCardPlayed 的牌
  const lines = [];
  const blocked = opts.blocked || new Set();
  const win = {
    GameDataCards: {
      cardCodex: [{ name: "杀（普攻）", type: "slash", suit: "♠", scale: "attack" }],
      baseDeck: [], eliteCards: [],
    },
    BattleLog: { add: (state, text) => { (state.log ||= []).push(text); } },
    BattleLines: { skill: (state, unit, name) => lines.push({ uid: unit.uid, name }) },
    RuinsEnemySkills: { blocksKillTarget: unit => blocked.has(unit.uid) },
  };
  const ctx = {
    console, Math, JSON, Object, Array, Set, Map, String, Number,
    Boolean, RegExp, Date, Error, ...win,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  ["card-utils.js", "battle-card-cleanup.js", "chiyo-chain-skills.js",
    "noa-ultimate-blade-skills.js", "battle-card-resume-hooks.js"]
    .forEach(file => vm.runInContext(patched(file), ctx, { filename: file }));

  const state = {
    log: [],
    battle: {
      allies: [], enemies: [], turn: opts.turn ?? 1,
      phase: opts.phase ?? 4, activeUid: "n0",
      locked: !!opts.locked, ended: false,
    },
  };
  const noa = {
    uid: "n0", name: "怪面诺亚", ref: "noa", side: "ally", hp: 100, maxHp: 130,
    hand: [], stats: { attack: 10 },
  };
  state.battle.allies.push(noa);
  (opts.enemies || [{ uid: "e0", hp: 99 }, { uid: "e1", hp: 99 }]).forEach(e =>
    state.battle.enemies.push(Object.assign({
      name: e.uid, ref: e.uid, side: "enemy", maxHp: e.hp, hand: [], block: 0,
      stats: { attack: 10 },
    }, e)));

  // 记录进入 afterCardPlayed 的每张牌（hooks 数组运行时查 window，包装有效）。
  // 记快照而非引用：runHooks 末尾 cleanup 会删掉牌上的运行时标记。
  const orig = ctx.NoaUltimateBladeSkills.afterCardPlayed;
  ctx.NoaUltimateBladeSkills.afterCardPlayed = (st, actor, target, card) => {
    hookCards.push({
      name: card?.name, virtual: !!card?.virtual,
      marker: !!card?._noaUltimateVirtual, skipHooks: !!card?.skipAfterCardPlayed,
    });
    return orig(st, actor, target, card);
  };
  // 模拟源码注释里「钩子跑到本模块时战斗已被前一个钩子挂起」：连鬼斩钩子排在
  // 终极刀魔之前，由它置 locked；stateApi.paused 独立返回 false，钩子链不提前返回。
  if (opts.pauseAtChiyo) {
    const chiyoOrig = ctx.ChiyoChainSkills.afterCardPlayed;
    let armed = true;
    ctx.ChiyoChainSkills.afterCardPlayed = (...args) => {
      if (armed) { armed = false; state.battle.locked = true; }
      return chiyoOrig(...args);
    };
  }

  const api = {
    deps: { draw: () => {} }, damage: () => {}, pushFloat: () => {},
    allUnits: b => (b.allies || []).concat(b.enemies || []),
  };
  const stateApi = {
    paused: () => false,
    putAction: (b, action) => { b._pendingHookAction = action; },
  };
  const hooks = ctx.BattleCardResumeHooks(api, stateApi);

  // useVirtualKill 桩：记录 + 扣血 + 模拟真实 useCard → finalizeUse → 嵌套 runHooks。
  // 真实链路里虚拟杀带 skipAfterCardPlayed，嵌套 runHooks 会跳过整段 hooks 数组。
  ctx.BattleSystem = {
    useVirtualKill: (st, actor, target, card) => {
      calls.push({
        actor: actor.uid, target: target.uid, card,
        skippedHooks: card.skipAfterCardPlayed === true,
        marker: !!card._noaUltimateVirtual,
      });
      card.virtual = true;
      card._skipHandMove = true;
      target.hp = Math.max(0, target.hp - (opts.damage ?? 0));
      card._countAsPlayed = true;
      hooks.runHooks(st, {
        actorUid: actor.uid, targetUid: target.uid, card,
        counted: true, hookIndex: 0, resolvedHookDone: false,
      });
      return true;
    },
  };

  const play = (card, over = {}) => {
    card._countAsPlayed = true;
    return hooks.runHooks(state, {
      actorUid: over.actorUid ?? "n0", targetUid: over.targetUid ?? "e0",
      card, counted: over.counted ?? true, hookIndex: 0, resolvedHookDone: false,
    });
  };
  return { ctx, state, noa, calls, hookCards, lines, play, hooks };
}

const entity = over => Object.assign(
  { name: "杀（普攻）", type: "slash", suit: "♠", scale: "attack", _playedFromHand: true }, over);
const group = () => entity({ name: "横扫杀", sweep: true, allTargets: ["e0", "e1"] });
const tactic = () => ({ name: "蓄力", type: "tactic", suit: "" });
const converted = () => entity({
  name: "魅杀", _skill: true, _entityConversion: true, convertedFrom: "杀（普攻）",
});
const activate = (env) => env.ctx.NoaUltimateBladeSkills.handleSpecialCard(
  env.state, env.noa, env.noa,
  { name: "终极刀魔", type: "tactic", _skill: true, ultimateBlade: true, targetless: true });
const extraLogs = env => env.state.log.filter(t => /额外结算\d+次/.test(t));

// ── A 发动后连续 5 张牌：只有第 1 张实体单体杀触发 ───────────────────────────
{
  const env = makeEnv({ damage: 0 });
  const { state, noa, calls, play } = env;
  T("A1 主动发动挂预约", activate(env) === true && noa.noaUltimateBladePending === true);
  T("A2 usedUltimateBlade 置位", noa.usedUltimateBlade === true);

  play(tactic());
  T("A3 战术牌不消耗预约、不触发", noa.noaUltimateBladePending === true && calls.length === 0);
  play(group());
  T("A4 群体实体杀不消耗预约、不触发", noa.noaUltimateBladePending === true && calls.length === 0);
  play(entity({ virtual: true, skipAfterCardPlayed: true, generatedBySkill: "螺旋桨" }));
  T("A5 虚拟杀不消耗预约、不触发", noa.noaUltimateBladePending === true && calls.length === 0);

  play(entity());  // 第 1 张实体单体杀
  T("A6 下一张实体单体杀恰好触发一次 X=1", calls.length === 1, { calls: calls.length });
  T("A7 触发后预约已消耗", !noa.noaUltimateBladePending);
  T("A8 战报恰好一条「额外结算1次」",
    extraLogs(env).length === 1 && /额外结算1次/.test(extraLogs(env)[0]),
    extraLogs(env));
  T("A9 链不残留", !state.battle.noaUltimateChain);

  const before = calls.length;
  play(entity());  // 第 2 张
  play(entity());  // 第 3 张
  play(entity());  // 第 4 张
  play(converted()); // 第 5 张（饰品转换杀，仍计入 X 但不该触发）
  T("A10 第 2 张以上实体单体杀不再触发额外结算",
    calls.length === before, { before, after: calls.length });
  T("A11 第 2 张以上不再追加「额外结算」战报",
    extraLogs(env).length === 1, extraLogs(env));
  T("A12 预约保持未挂、不可被后续杀重新激活", !noa.noaUltimateBladePending);
  T("A13 X 计数仍按本回合累加（不因消耗而停摆）", noa.noaSlashCount === 5,
    { count: noa.noaSlashCount });
  T("A14 8 张牌中 7 张进入 afterCardPlayed，虚拟杀被钩子整段跳过",
    env.hookCards.length === 7 && env.hookCards.every(h => !h.marker),
    { hookCards: env.hookCards.length });
  T("A15 链虚拟杀带 skipAfterCardPlayed + 专属标记，嵌套 runHooks 未再进入本技能钩子",
    calls.every(c => c.skippedHooks && c.marker));
}

// ── B 发动前已用杀 → X 含当前这张，触发后仍只一次 ────────────────────────────
{
  const env = makeEnv({ damage: 0 });
  const { noa, calls, play } = env;
  play(entity()); play(entity());
  T("B1 发动前 2 张只累加计数", noa.noaSlashCount === 2 && calls.length === 0);
  activate(env);
  play(entity());  // 第 3 张，X=3
  T("B2 X=3 且额外结算恰好 3 次", calls.length === 3, { calls: calls.length });
  T("B3 战报写 X=3", /额外结算3次/.test(extraLogs(env)[0] || ""), extraLogs(env));
  play(entity());  // 第 4 张
  T("B4 第 4 张不再触发", calls.length === 3 && extraLogs(env).length === 1);
  T("B5 计数继续累加到 4", noa.noaSlashCount === 4);
}

// ── C 挂起恢复后，第 2 张不重复补打 ──────────────────────────────────────────
{
  const env = makeEnv({ damage: 0, pauseAtChiyo: true });
  const { state, noa, calls, play } = env;
  activate(env);
  play(entity());
  T("C1 locked 时链挂起，预约已消耗", state.battle.noaUltimateChain?.remaining === 1
    && !noa.noaUltimateBladePending);
  state.battle.locked = false;
  env.ctx.NoaUltimateBladeSkills.resume(state);
  T("C2 恢复后补跑恰好 1 次", calls.length === 1 && !state.battle.noaUltimateChain);
  play(entity());  // 第 2 张
  play(entity());  // 第 3 张
  T("C3 恢复后第 2/3 张不再触发", calls.length === 1 && extraLogs(env).length === 1);
}

// ── D 跨回合重新发动：只在新的下一张触发一次 ─────────────────────────────────
{
  const env = makeEnv({ damage: 0 });
  const { state, noa, calls, play } = env;
  activate(env); play(entity());
  T("D1 第一回合触发 1 次", calls.length === 1);
  // 真实回合重置逻辑（每个单位回合开始调用）
  const turnSrc = read("battle-turn-state.js");
  const reset = new Function("window", turnSrc + "; return window.BattleTurnState.resetBeginTurn;")(
    { BattleTurnState: undefined });
  reset(noa, state.battle, 0);
  state.battle.turn = 2;
  T("D2 回合开始清空预约/计数/限一次", !noa.noaUltimateBladePending
    && noa.usedUltimateBlade === false && noa.noaSlashCount === 0);
  T("D3 新回合可再次发动", activate(env) === true);
  play(entity());
  T("D4 新回合只在下一张触发 1 次", calls.length === 2, { calls: calls.length });
  T("D5 战报累计恰好 2 条", extraLogs(env).length === 2, extraLogs(env));
  play(entity());
  T("D6 新回合第 2 张不触发", calls.length === 2);
}

// ── D2 边界：counted=false 的杀不进钩子，预约留给下一张有效结算的杀 ──────────
{
  const env = makeEnv({ damage: 0 });
  const { noa, calls, play } = env;
  activate(env);
  play(entity(), { counted: false });
  T("D2-1 未计入的杀不进 afterCardPlayed，预约保留、不触发",
    noa.noaUltimateBladePending === true && calls.length === 0
    && env.hookCards.length === 0);
  play(entity());  // 下一张计入的实体单体杀
  T("D2-2 下一张有效结算的杀才触发，X=1",
    calls.length === 1 && noa.noaSlashCount === 1,
    { calls: calls.length, count: noa.noaSlashCount });
  T("D2-3 战报仍只有 1 条", extraLogs(env).length === 1);
  play(entity());
  T("D2-4 再下一张不触发", calls.length === 1 && extraLogs(env).length === 1);
}

// ── E 静态接线 ──────────────────────────────────────────────────────────────
{
  const own = read("noa-ultimate-blade-skills.js");
  const cleanup = read("battle-card-cleanup.js");
  const hooks = read("battle-card-resume-hooks.js");
  T("E1 触发即删预约（第 2 张不重复的根）",
    /delete actor\.noaUltimateBladePending;/.test(own));
  T("E2 预约与 X 共用同一 isCountedKill 门",
    /const isCountedKill =/.test(own) && /if \(!isCountedKill\) return;/.test(own));
  T("E3 链虚拟杀带 skipAfterCardPlayed，嵌套钩子整段跳过",
    /skipAfterCardPlayed: true/.test(read("chiyo-chain-skills.js"))
    && /!action\.card\.skipAfterCardPlayed/.test(hooks));
  T("E4 链虚拟杀标记纳入出牌清理", /"_noaUltimateVirtual"/.test(cleanup));
  T("E5 回合开始清空预约与限一次",
    /usedUltimateBlade = false/.test(read("battle-turn-state.js"))
    && /delete unit\.noaUltimateBladePending/.test(read("battle-turn-state.js")));
}

console.log(`终极刀魔「下一张触发 / 第2张不重复」真实钩子链检查：${pass} PASS / ${reds.length} FAIL`);
if (reds.length) { reds.forEach(r => console.error(`  - ${r}`)); process.exit(1); }
