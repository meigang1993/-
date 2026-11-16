// 【终极刀魔】实际效果 + 与饰品交互的严格检查。
// 与既有测试的区别：加载真实 card-utils / battle-card-resume-hooks / chiyo-chain /
// noa-ultimate-blade / battle-combat-attack-values / guard-kelly / holy-eagle /
// battle-damage-relics / battle-relic-turns，跑真实出牌→伤害→钩子链路（含链虚拟杀
// 引起的嵌套 runHooks），而不是只调单模块函数或自写等价判据。
// REVERT=narrow|conversion|generated|armor|guardSword 分别撤回一处关键守卫，应精准打红。
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
  if (REVERT || process.env.DEBUG) console.log(`  RED ${name}`, extra === undefined ? "" : JSON.stringify(extra));
}
function read(file) { return fs.readFileSync(path.join(ROOT, file), "utf8"); }
function hit(before, after, tag) {
  assert.notStrictEqual(after, before, `REVERT=${REVERT} must hit ${tag}`);
  return after;
}
function patched(file) {
  let s = read(file);
  if (REVERT === "narrow" && file === "chiyo-chain-skills.js") {
    s = hit(s, s.replace("      _skipPlayedSlashFlag: true,\n", ""), "narrow flag");
  }
  if (REVERT === "conversion" && file === "noa-ultimate-blade-skills.js") {
    s = hit(s, s.replace("(!card._skill || !!card._entityConversion)", "(!card._skill)"), "conversion recogniser");
  }
  if (REVERT === "generated" && file === "noa-ultimate-blade-skills.js") {
    s = hit(s, s.replace("      && !card.generatedBySkill\n", ""), "generatedBySkill exclusion");
  }
  if (REVERT === "armor" && file === "battle-combat-attack-values.js") {
    s = hit(s, s.replace("      || actor.samuraiArmorUsed\n", ""), "samurai once guard");
  }
  if (REVERT === "guardSword" && file === "guard-kelly-skills.js") {
    s = hit(s, s.replace(" && !card?._skipUseKillTriggers", ""), "wide-marker guard");
  }
  return s;
}

const LOAD = [
  "card-utils.js", "battle-card-cleanup.js", "chiyo-chain-skills.js",
  "noa-ultimate-blade-skills.js", "battle-card-resume-hooks.js",
  "guard-kelly-skills.js", "holy-eagle-sword-skills.js",
  "battle-damage-relics.js", "battle-relic-turns.js",
  "battle-combat-attack-values.js",
];
// prepareSlash 里控制 playedSlashThisTurn 的真实守卫行（抽出来执行，不重写等价式）
const FLAG_LINE = read("battle-combat-attack-flow.js").split("\n")
  .find(l => l.includes("_skipPlayedSlashFlag") && l.includes("playedSlashThisTurn"));
assert(FLAG_LINE && FLAG_LINE.includes("if ("), "flag line must exist");

function makeEnv(opts = {}) {
  const calls = [];       // 链虚拟杀结算记录
  const damageEvents = []; // 全部实际伤害段
  const lines = [];
  const equipped = new Set(opts.equipped || []);
  const win = {
    GameDataCards: {
      cardCodex: [
        { name: "杀（普攻）", type: "slash", suit: "♠", scale: "attack" },
        { name: "魅杀", type: "slash", suit: "♥", scale: "attack" },
        { name: "刺杀", type: "slash", suit: "♠", scale: "attack" },
      ],
      baseDeck: [], eliteCards: [],
    },
    BattleLog: { add: (state, text) => { (state.log ||= []).push(text); } },
    BattleLines: { skill: (state, unit, name) => lines.push({ uid: unit.uid, name }) },
    RuinsEnemySkills: { blocksKillTarget: unit => !!opts.blocked?.has?.(unit.uid) },
    RelicSystem: { hasEquipped: (state, unit, name) => equipped.has(name) },
    BattleSystem: { pushFloat: () => {} },
  };
  const ctx = {
    console, Math, JSON, Object, Array, Set, Map, String, Number,
    Boolean, RegExp, Date, Error, ...win,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  LOAD.forEach(file => vm.runInContext(patched(file), ctx, { filename: file }));

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
    hand: [], block: 0, stats: { attack: 10, magic: 0 },
    playedSlashThisTurn: false, samuraiArmorUsed: false,
  };
  state.battle.allies.push(noa);
  (opts.enemies || [{ uid: "e0", hp: 99 }, { uid: "e1", hp: 99 }]).forEach(e =>
    state.battle.enemies.push(Object.assign({
      name: e.uid, ref: e.uid, side: "enemy", maxHp: e.hp, hand: [], block: 0,
      stats: { attack: 10 },
    }, e)));

  const api = {
    deps: {
      isKillCard: ctx.CardUtils.isKillCard,
      tempAttack: u => (u.stats?.attack || 0) + (u.tempAttack || 0),
    },
    damage: () => {}, pushFloat: () => {},
    allUnits: b => (b.allies || []).concat(b.enemies || []),
    statOf: (u, k) => u.stats?.[k] || 0,
    isSingleSlash: c => ctx.CardUtils.isEntitySingleKill(c),
    cardPower: () => 0,
  };
  const stateApi = { paused: () => false, putAction: (b, a) => { b._pendingHookAction = a; } };
  const hooks = ctx.BattleCardResumeHooks(api, stateApi);
  const values = ctx.BattleCombatAttackValues(api);

  // 真实伤害管线（顺序对齐 battle-combat-attack-flow.js:23~47）
  function settle(stateIn, actor, target, card, opts2 = {}) {
    const b = stateIn.battle;
    const units = api.allUnits(b);
    // prepareSlash 的 playedSlashThisTurn 守卫行
    vm.runInNewContext(FLAG_LINE, { card, actor, window: ctx });
    if (ctx.CardUtils.isKillCard(card) && !card.virtual) {
      // spendIntent：本测试不关心杀意，跳过
    }
    values.applyAttackRelics(stateIn, actor, target, card);
    const base = 3;
    let amount = values.modifyAttackAmount(stateIn, actor, target, card, base);
    amount = values.slashTargetAmount(stateIn, actor, target, card, amount);
    const hpLoss = Math.max(0, Math.min(target.hp, Math.round(amount)));
    if (hpLoss > 0) {
      target.hp = Math.max(0, target.hp - hpLoss);
      ctx.HolyEagleSwordSkills.recordHit(stateIn, actor, target, card, hpLoss);
    }
    ctx.GuardKellySkills.afterDamage(stateIn, actor, target, card, hpLoss, actor);
    const edisHit = ctx.BattleDamageRelics.canEdisSwordHitAgain(stateIn, actor, target, card);
    damageEvents.push({ actor: actor.uid, target: target.uid, card: card.name,
      virtual: !!card.virtual, hpLoss, edisHit, amount });
    return hpLoss;
  }

  ctx.BattleSystem.useVirtualKill = (st, actor, target, card) => {
    // runHooks 末尾 cleanup 会删掉牌上的运行时标记，必须记快照而非引用。
    calls.push({ actor: actor.uid, target: target.uid, card: { ...card },
      skipHooks: card.skipAfterCardPlayed === true,
      marker: !!card._noaUltimateVirtual });
    settle(st, actor, target, card);
    card._countAsPlayed = true;
    hooks.runHooks(st, {
      actorUid: actor.uid, targetUid: target.uid, card,
      counted: true, hookIndex: 0, resolvedHookDone: false,
    });
    return true;
  };

  const play = (card, over = {}) => {
    const units = api.allUnits(state.battle);
    const actor = units.find(u => u.uid === (over.actorUid ?? "n0"));
    const target = units.find(u => u.uid === (over.targetUid ?? "e0"));
    card._countAsPlayed = true;
    card._playedFromHand = true;
    settle(state, actor, target, card);
    return hooks.runHooks(state, {
      actorUid: actor.uid, targetUid: target.uid, card,
      counted: over.counted ?? true, hookIndex: 0, resolvedHookDone: false,
    });
  };
  const finishPlay = () => ctx.BattleRelicTurns.finishPlay(state, noa,
    (st, text) => { (st.log ||= []).push(text); });
  return { ctx, state, noa, calls, damageEvents, lines, play, hooks, finishPlay, equipped };
}

const CU = "杀（普攻）";
const entity = (env, over = {}) => env.ctx.CardUtils.cloneEntity(CU, { suit: "♠", ...over });
const converted = (env, name) => env.ctx.CardUtils.convertAs(name,
  { name: "闪", suit: "♥" }, { _skill: true, _entityConversion: true, _relicSkill: true });
const group = env => entity(env, { name: "横扫杀", sweep: true, allTargets: ["e0", "e1"] });
const tactic = () => ({ name: "蓄力", type: "tactic", suit: "" });
const virtualOf = (env, skill) => env.ctx.CardUtils.fromEntity(CU, {
  generatedBySkill: skill, skipAfterCardPlayed: false });
// 【杀欲窥视】复制牌：copyPlayable → cloneEntity，不带 virtual，是实体单体杀，
// 但带 generatedBySkill。这正是 !card.generatedBySkill 排除项真正守住的形态。
const copiedEntityKill = env => env.ctx.CardUtils.copyPlayable(entity(env), {
  temporary: true, void: true, noIntentCost: true,
  withererPeekSlash: true, generatedBySkill: "杀欲窥视" });
const activate = env => env.ctx.NoaUltimateBladeSkills.handleSpecialCard(
  env.state, env.noa, env.noa,
  { name: "终极刀魔", type: "tactic", _skill: true, ultimateBlade: true, targetless: true });
const extraLogs = env => env.state.log.filter(t => /额外结算\d+次/.test(t));

// ── A 实际效果：X 的来源、结算次数、虚拟杀属性、伤害守恒、转移目标 ────────────
{
  // A1 用独立 env：不能在主角色的计数序列里提前发动，否则第 1 张杀就会触发预约。
  const envA1 = makeEnv();
  T("A1 发动只挂预约、不立即结算", activate(envA1) === true
    && envA1.noa.noaUltimateBladePending === true && envA1.calls.length === 0);
  const env = makeEnv({ equipped: ["武士铠甲", "精灵女神守护之剑"] , enemies: [{ uid: "e0", hp: 99 }, { uid: "e1", hp: 99 }] });
  const { state, noa, calls, damageEvents, play } = env;
  // 先出 2 张实体单体杀（未发动预约前），再发动，再出触发牌 → X=3
  play(entity(env));
  play(entity(env));
  T("A2 发动前已用 2 张实体单体杀被正确计数", noa.noaSlashCount === 2, noa.noaSlashCount);
  activate(env);
  const before = calls.length;
  const beforeDmg = damageEvents.length;
  play(entity(env));   // 第 3 张，触发
  T("A3 X = 本回合已用实体单体杀数（含当前这张）= 3",
    extraLogs(env).length === 1 && /额外结算3次/.test(extraLogs(env)[0]), extraLogs(env));
  T("A4 额外结算恰好 3 次虚拟杀", calls.length - before === 3, calls.length - before);
  T("A5 触发牌 1 次 + 派生 3 次 = 4 段伤害，不多不少",
    damageEvents.length - beforeDmg === 4 && damageEvents.slice(-3).every(d => d.virtual),
    damageEvents.slice(beforeDmg).map(d => [d.card, d.virtual, d.hpLoss]));
  T("A6 每张派生杀属性完整（普攻/免费/不可响应/跳过钩子/窄标记/来源）",
    calls.slice(-3).every(c => c.card.type === "slash"
      && c.card.noIntentCost === true && c.card.ignoreResponse === true
      && c.card.skipAfterCardPlayed === true && c.card.virtual === true
      && c.card._skipPlayedSlashFlag === true && !c.card._skipUseKillTriggers
      && c.card.generatedBySkill === "终极刀魔" && c.marker === true
      && c.skipHooks === true),
    calls.slice(-3).map(c => Object.keys(c.card)));
  T("A7 触发后预约已消耗、链不残留",
    !noa.noaUltimateBladePending && !state.battle.noaUltimateChain);
  const n2 = calls.length;
  play(entity(env)); play(entity(env));
  T("A8 第 4/5 张杀不再触发", calls.length === n2 && extraLogs(env).length === 1);
  T("A9 计数继续累加但与消费解耦", noa.noaSlashCount === 5, noa.noaSlashCount);
  // 目标死亡转移
  const env2 = makeEnv({ enemies: [{ uid: "e0", hp: 1 }, { uid: "e1", hp: 99 }] });
  activate(env2);
  env2.noa.noaSlashCount = 3; env2.noa.noaSlashTurn = 1; // 已用 3 张 + 当前这张 = 4 次
  env2.ctx.NoaUltimateBladeSkills.afterCardPlayed(env2.state, env2.noa,
    env2.state.battle.enemies[0], entity(env2)); // 直接挂链（等价于出牌触发）
  const chainCalls = env2.calls;
  T("A10 原目标阵亡后剩余次数转移给另一名存活敌方",
    chainCalls.length >= 1 && chainCalls[0].target === "e0"
    && chainCalls.every(c => ["e0", "e1"].includes(c.target))
    && env2.state.log.some(t => /转移至e1/.test(t)),
    { calls: chainCalls.map(c => c.target), log: env2.state.log });
}
// ── B 与饰品交互 ─────────────────────────────────────────────────────────────
{
  const env = makeEnv({ equipped: ["武士铠甲", "精灵女神守护之剑", "伊迪斯电锯剑", "圣鹰剑", "震感手炮"] });
  const { ctx, state, noa, calls, damageEvents, play } = env;
  noa.hand = [entity(env), entity(env)]; // 武士铠甲护甲 = 2
  activate(env);
  play(entity(env)); // 触发 X=1
  const armorLogs = state.log.filter(t => /武士铠甲触发/.test(t));
  T("B1 武士铠甲每回合只触发一次，派生杀不重复吃『第一次』",
    armorLogs.length === 1 && /获得2点护甲/.test(armorLogs[0]) && noa.block >= 2,
    { armorLogs, block: noa.block });
  const swordLogs = state.log.filter(t => /精灵女神守护之剑触发/.test(t));
  T("B2 精灵女神守护之剑按每次单体杀伤害各触发一次（实体杀+派生杀）",
    swordLogs.length === 2, { swordLogs, block: noa.block });
  T("B3 派生杀不置 playedSlashThisTurn（震感手炮/母亲怀表不被污染）",
    noa.playedSlashThisTurn === true
    && calls.every(c => c.card._skipPlayedSlashFlag === true),
    { flag: noa.playedSlashThisTurn, calls: calls.length });
  T("B4 震感手炮 finishPlay 因本回合已出杀不蓄能",
    env.finishPlay() === false && !noa.shockHandCannonReady);
  T("B5 伊迪斯电锯剑只认实体单体杀，派生虚拟杀不触发（防指数爆炸）",
    damageEvents.filter(d => d.virtual).every(d => d.edisHit === false),
    damageEvents.map(d => [d.virtual, d.edisHit]));
  T("B6 圣鹰剑按既有口径对派生杀记录命中并翻倍（如实记录，非新 BUG）",
    damageEvents.filter(d => d.virtual).length >= 1
    && damageEvents.some(d => d.virtual && d.amount > 3),
    damageEvents.map(d => d.amount));
  // 妖刀村雨宽标记：旧口径仍被武士铠甲/守护之剑排除
  const wide = ctx.CardUtils.fromEntity(CU, { _skipUseKillTriggers: true, sourceName: "妖刀村雨" });
  const stWide = { log: [], battle: state.battle };
  ctx.GuardKellySkills.afterDamage(stWide, noa, state.battle.enemies[0], wide, 3, noa);
  T("B7 妖刀村雨旧宽标记仍被精灵女神守护之剑排除（口径未漂）",
    !stWide.log.some(t => /精灵女神守护之剑触发/.test(t)), stWide.log);
  // 转换杀（魅魔钢叉 / 刺客胶衣）计入 X 并消耗预约
  const e2 = makeEnv();
  activate(e2);
  e2.play(converted(e2, "魅杀"));
  T("B8 魅魔钢叉/刺客胶衣转换杀计入 X 且消耗预约",
    !e2.noa.noaUltimateBladePending && e2.calls.length === 1
    && /额外结算1次/.test(extraLogs(e2)[0] || ""),
    { pending: e2.noa.noaUltimateBladePending, calls: e2.calls.length, logs: extraLogs(e2) });
  const e3 = makeEnv();
  activate(e3);
  e3.play(converted(e3, "刺杀"));
  T("B9 刺客胶衣转换杀同样计入 X", !e3.noa.noaUltimateBladePending && e3.calls.length === 1);
  // 技能生成的虚拟杀 / 群体杀 / 战术牌都不计入 X、不消耗预约
  const e4 = makeEnv();
  activate(e4);
  ["淫气改造", "螺旋桨", "外神之眼", "杀欲窥视"].forEach(s => e4.play(virtualOf(e4, s)));
  e4.play(copiedEntityKill(e4)); // 不带 virtual 的技能生成实体杀
  e4.play(group(e4));
  e4.play(tactic());
  T("B10 虚拟咬杀/螺旋桨/外神之眼/复制牌/群体杀/战术牌都不消耗预约",
    e4.noa.noaUltimateBladePending === true && e4.calls.length === 0,
    { pending: e4.noa.noaUltimateBladePending, calls: e4.calls.length });
  e4.play(entity(e4));
  T("B11 上述牌不计入 X，下一张实体杀仍是 X=1",
    /额外结算1次/.test(extraLogs(e4)[0] || "") && e4.calls.length === 1,
    extraLogs(e4));
  // 跨回合预约作废 + 计数重置（真实清理字段在 battle-turn-state.js）
  const e5 = makeEnv();
  activate(e5);
  e5.state.battle.turn = 2;
  e5.play(entity(e5));
  T("B12 跨回合的预约作废、不补打", e5.calls.length === 0
    && !e5.noa.noaUltimateBladePending && e5.noa.noaSlashCount === 1,
    { calls: e5.calls.length, count: e5.noa.noaSlashCount });
}
// ── C 静态口径（描述 / 登记表 / bundle 顺序） ────────────────────────────────
{
  const s = read("data-new-characters.js");
  const block = s.slice(s.indexOf('id: "noa"'), s.indexOf('id: "gerda"'));
  T("C1 描述写明 X 只数实体单体【杀】且含当前这张",
    /X为你本回合已使用的实体单体【杀】牌数，包含当前这张【杀】牌/.test(block));
  T("C2 描述写明目标死亡后剩余次数转移",
    /剩余未结算的次数可指定另一名存活的敌方角色为目标/.test(block));
  const cfg = fs.readFileSync(path.join(__dirname, "publish-bundles.json"), "utf8");
  T("C3 连鬼斩执行块排在终极刀魔之前（bundle 装配顺序）",
    cfg.indexOf("chiyo-chain-skills.js") < cfg.indexOf("noa-ultimate-blade-skills.js"));
  T("C4 真实钩子执行器里终极刀魔排在连鬼斩之后",
    read("battle-card-resume-hooks.js").indexOf("ChiyoChainSkills?.afterCardPlayed")
    < read("battle-card-resume-hooks.js").indexOf("NoaUltimateBladeSkills?.afterCardPlayed"));
  T("C5 X 计数与预约消耗使用同一个 isCountedKill 布尔",
    (read("noa-ultimate-blade-skills.js").match(/isCountedKill/g) || []).length >= 3);
}

console.log(`RESULT ${pass}/${pass + reds.length}`);
if (reds.length) console.log("FAILED:", reds.join(" | "));
process.exit(reds.length ? 1 : 0);
