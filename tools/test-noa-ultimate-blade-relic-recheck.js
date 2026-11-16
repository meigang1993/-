// 【终极刀魔】× 饰品 独立复查（第二轮）：覆盖上一轮 effect-relics 检查未涉及的
// 组合面——多饰品同装数值守恒、妖刀村雨自动斩、反伤致死、存档/中断接线、
// 克罗研究记录复制牌边界。加载真实 card-utils / chiyo-chain / noa-ultimate-blade /
// resume-hooks / guard-kelly / holy-eagle / damage-relics / relic-turns / attack-values，
// 走真实出牌→伤害→钩子链，不用自写等价判据。
// REVERT=generated|wide|wire|thorns 分别撤回一处关键守卫，应精准打红。
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
  if (REVERT === "generated" && file === "noa-ultimate-blade-skills.js") {
    s = hit(s, s.replace("      && !card.generatedBySkill\n", ""), "generatedBySkill exclusion");
  }
  if (REVERT === "wide" && file === "chiyo-chain-skills.js") {
    s = hit(s, s.replace("      _skipPlayedSlashFlag: true,\n", "      _skipUseKillTriggers: true,\n"), "narrow flag");
  }
  if (REVERT === "thorns" && file === "chiyo-chain-skills.js") {
    s = hit(s, s.replace("    if (!alive(actor) || !alive(target) || !targetable(target, probe)) return false;",
      "    if (!alive(target) || !targetable(target, probe)) return false;"), "actor alive guard");
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
const FLAG_LINE = read("battle-combat-attack-flow.js").split("\n")
  .find(l => l.includes("_skipPlayedSlashFlag") && l.includes("playedSlashThisTurn"));
assert(FLAG_LINE && FLAG_LINE.includes("if ("), "flag line must exist");

function makeEnv(opts = {}) {
  const calls = [];
  const damageEvents = [];
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
    RuinsEnemySkills: { blocksKillTarget: () => false },
    RelicSystem: { hasEquipped: (state, unit, name) => equipped.has(name) },
    BattleSystem: { pushFloat: () => {} },
  };
  const ctx = { console, Math, JSON, Object, Array, Set, Map, String, Number,
    Boolean, RegExp, Date, Error, ...win };
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
    uid: "n0", name: "怪面诺亚", ref: "noa", side: "ally",
    hp: opts.hp ?? 100, maxHp: 130,
    hand: [], block: 0, stats: { attack: 10, magic: 0, speed: 2 },
    playedSlashThisTurn: false, samuraiArmorUsed: false,
    charge: opts.charge ?? 0,
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
    damage: () => {}, pushFloat: () => {}, cardPower: () => 0,
    allUnits: b => (b.allies || []).concat(b.enemies || []),
    statOf: (u, k) => u.stats?.[k] || 0,
    isSingleSlash: c => ctx.CardUtils.isEntitySingleKill(c),
  };
  const stateApi = { paused: () => false, putAction: (b, a) => { b._pendingHookAction = a; } };
  const hooks = ctx.BattleCardResumeHooks(api, stateApi);
  const values = ctx.BattleCombatAttackValues(api);

  // 真实伤害管线（顺序对齐 battle-combat-attack-flow.js）
  function settle(stateIn, actor, target, card) {
    const b = stateIn.battle;
    vm.runInNewContext(FLAG_LINE, { card, actor, window: ctx });
    values.applyAttackRelics(stateIn, actor, target, card);
    let amount = values.attackAmount(stateIn, actor, card, 3, true);
    amount = values.modifyAttackAmount(stateIn, actor, target, card, amount);
    amount = values.slashTargetAmount(stateIn, actor, target, card, amount);
    const hpLoss = Math.max(0, Math.min(target.hp, Math.round(amount)));
    if (hpLoss > 0) {
      target.hp = Math.max(0, target.hp - hpLoss);
      ctx.HolyEagleSwordSkills.recordHit(stateIn, actor, target, card, hpLoss);
    }
    ctx.GuardKellySkills.afterDamage(stateIn, actor, target, card, hpLoss, actor);
    const edisHit = ctx.BattleDamageRelics.canEdisSwordHitAgain(stateIn, actor, target, card);
    damageEvents.push({ actor: actor.uid, target: target.uid, card: card.name,
      virtual: !!card.virtual, hpLoss, edisHit, amount,
      chargeMultiplier: card.chargeMultiplier });
    // 反伤类饰品：目标带 thorns 时按实际伤害反噬出牌者（用于致死链测试）
    if (target.thorns && hpLoss > 0 && actor.hp > 0) {
      actor.hp = Math.max(0, actor.hp - target.thorns);
    }
    return hpLoss;
  }

  ctx.BattleSystem.useVirtualKill = (st, actor, target, card) => {
    calls.push({ actor: actor.uid, target: target.uid, card: { ...card },
      skipHooks: card.skipAfterCardPlayed === true });
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
  return { ctx, state, noa, calls, damageEvents, lines, play, hooks, settle, equipped };
}

const CU = "杀（普攻）";
const entity = (env, over = {}) => env.ctx.CardUtils.cloneEntity(CU, { suit: "♠", ...over });
const converted = (env, name) => env.ctx.CardUtils.convertAs(name,
  { name: "闪", suit: "♥" }, { _skill: true, _entityConversion: true, _relicSkill: true });
const virtualOf = (env, skill) => env.ctx.CardUtils.fromEntity(CU, {
  generatedBySkill: skill, skipAfterCardPlayed: false });
const activate = env => env.ctx.NoaUltimateBladeSkills.handleSpecialCard(
  env.state, env.noa, env.noa,
  { name: "终极刀魔", type: "tactic", _skill: true, ultimateBlade: true, targetless: true });
const extraLogs = env => env.state.log.filter(t => /额外结算\d+次/.test(t));
const finite = n => Number.isFinite(n) && n >= 0;

// ── A 多饰品同装：数值守恒、一次性标记、派生段不污染回合标记 ─────────────────
{
  const env = makeEnv({
    equipped: ["武士铠甲", "精灵女神守护之剑", "伊迪斯电锯剑", "圣鹰剑",
      "名刀鬼切", "艾尔拉娜白色丝袜", "震感手炮"],
    enemies: [{ uid: "e0", hp: 20, maxHp: 100 }, { uid: "e1", hp: 99 }],
    charge: 2,
  });
  const { state, noa, calls, damageEvents, play } = env;
  noa.hand = [entity(env), entity(env)]; // 武士铠甲护甲 = 2
  activate(env);
  play(entity(env)); // 触发 X=1
  T("A1 多饰品同装时链仍恰好结算 X 次", calls.length === 1 && extraLogs(env).length === 1,
    { calls: calls.length, logs: extraLogs(env) });
  T("A2 触发牌 1 段 + 派生 1 段，伤害段守恒", damageEvents.length === 2,
    damageEvents.map(d => [d.card, d.virtual, d.hpLoss]));
  T("A3 所有伤害/倍率有限且非负（名刀鬼切+圣鹰剑+白色丝袜+charge 叠加不溢出）",
    damageEvents.every(d => finite(d.amount) && finite(d.hpLoss) && finite(d.chargeMultiplier))
    && damageEvents.every(d => d.amount <= 1e6),
    damageEvents.map(d => [d.amount, d.hpLoss, d.chargeMultiplier]));
  T("A4 charge 只在第一张实体杀消耗，派生杀不再二次乘 2",
    damageEvents[0].chargeMultiplier === 4 && damageEvents[1].chargeMultiplier === 1
    && noa.charge === 0,
    damageEvents.map(d => d.chargeMultiplier));
  const armorLogs = state.log.filter(t => /武士铠甲触发/.test(t));
  T("A5 武士铠甲每回合只触发一次（派生杀不重复吃）",
    armorLogs.length === 1 && noa.block >= 2, { armorLogs, block: noa.block });
  const swordLogs = state.log.filter(t => /精灵女神守护之剑触发/.test(t));
  T("A6 守护之剑按每张杀各触发一次（实体 + 派生）", swordLogs.length === 2,
    { swordLogs, block: noa.block });
  T("A7 伊迪斯电锯剑不认派生虚拟杀（防指数爆炸）",
    damageEvents.filter(d => d.virtual).every(d => d.edisHit === false));
  T("A8 窄标记：派生杀不置 playedSlashThisTurn、不挂宽标记",
    noa.playedSlashThisTurn === true
    && calls.every(c => c.card._skipPlayedSlashFlag === true && !c.card._skipUseKillTriggers),
    calls.map(c => Object.keys(c.card)));
  const n = calls.length;
  play(entity(env)); play(entity(env)); play(entity(env));
  T("A9 连续 4 张实体杀后链不再追加、X 战报只 1 条",
    calls.length === n && extraLogs(env).length === 1 && noa.noaSlashCount === 4,
    { calls: calls.length, count: noa.noaSlashCount });
  T("A10 震感手炮不因派生杀蓄能（本回合已出杀）",
    ctxFinish(env) === false && !noa.shockHandCannonReady);
  function ctxFinish(e) { return e.ctx.BattleRelicTurns.finishPlay(e.state, e.noa,
    (st, text) => { (st.log ||= []).push(text); }); }
}

// ── B 妖刀村雨自动斩（回合开始、虚拟 + 宽标记）不污染 X / 预约 ───────────────
{
  const env = makeEnv({ equipped: ["妖刀村雨"] });
  const { ctx, state, noa, play } = env;
  activate(env);
  let autoCard = null;
  ctx.BattleRelicTurns.prepare(state, noa, (st, actor, target, card) => {
    // runHooks 末尾 clearPlayFlags 会剥掉本次结算专属标记，必须取快照。
    autoCard = { ...card };
    card._countAsPlayed = true;
    env.settle(st, actor, target, card);
    env.hooks.runHooks(st, { actorUid: actor.uid, targetUid: target.uid, card,
      counted: true, hookIndex: 0, resolvedHookDone: false });
  }, (st, text) => { (st.log ||= []).push(text); });
  T("B1 妖刀村雨自动斩是虚拟杀且带旧宽标记", !!autoCard
    && autoCard.virtual === true && autoCard._skipUseKillTriggers === true,
    autoCard ? Object.keys(autoCard) : null);
  T("B2 自动斩不计入 X、不消耗预约",
    noa.noaSlashCount === undefined || noa.noaSlashCount === 0,
    { count: noa.noaSlashCount, pending: noa.noaUltimateBladePending });
  T("B3 预约仍在，下一张实体杀 X=1 触发", noa.noaUltimateBladePending === true);
  play(entity(env));
  T("B4 触发后 X=1、链 1 次", /额外结算1次/.test(extraLogs(env)[0] || "")
    && env.calls.length === 1, { logs: extraLogs(env), calls: env.calls.length });
}

// ── C 反伤致死：出牌者中途阵亡时链终止，不继续扣血、不残留 ──────────────────
{
  const env = makeEnv({ hp: 3, enemies: [{ uid: "e0", hp: 99, thorns: 5 }, { uid: "e1", hp: 99 }] });
  activate(env);
  env.noa.noaSlashCount = 4; env.noa.noaSlashTurn = 1;
  env.ctx.NoaUltimateBladeSkills.afterCardPlayed(env.state, env.noa,
    env.state.battle.enemies[0], entity(env));
  T("C1 反伤致死后链在出牌者阵亡处终止（不继续对敌方扣血）",
    env.noa.hp === 0 && env.calls.length === 1
    && env.state.battle.enemies[0].hp === 99 - env.damageEvents[0].hpLoss,
    { hp: env.noa.hp, calls: env.calls.length, events: env.damageEvents.length });
  T("C2 终止后链不残留在 battle 上", !env.state.battle.noaUltimateChain);
}

// ── D 存档 / 中断接线（静态 + 半真实挂起） ───────────────────────────────────
{
  const compact = read("store-compact.js");
  const checkpoint = read("battle-save-checkpoint-validation.js");
  const continuation = read("battle-manual-continuation.js");
  const wireText = REVERT === "wire" ? "" : continuation;
  T("D1 主存档压缩把 noaUltimateChain 列为瞬时态", compact.includes("noaUltimateChain"));
  T("D2 稳定存档点把 noaUltimateChain 列为阻塞键", checkpoint.includes("noaUltimateChain"));
  T("D3 玩家响应恢复与中断恢复两处都接了 resume",
    (wireText.match(/NoaUltimateBladeSkills\?\.resume/g) || []).length === 2);
  const env = makeEnv({ locked: true });
  activate(env);
  env.noa.noaSlashCount = 2; env.noa.noaSlashTurn = 1;
  env.ctx.NoaUltimateBladeSkills.afterCardPlayed(env.state, env.noa,
    env.state.battle.enemies[0], entity(env));
  // 直接调 afterCardPlayed 时传入的这张触发牌本身也计入 X：2 张已用 + 当前 = 3。
  T("D4 钩子处于挂起态时链先落盘、不当场补打", !!env.state.battle.noaUltimateChain
    && env.calls.length === 0 && env.state.battle.noaUltimateChain.remaining === 3);
  env.state.battle.locked = false;
  env.ctx.NoaUltimateBladeSkills.resume(env.state);
  T("D5 解锁后 resume 补跑剩余次数且链清空", env.calls.length === 3
    && !env.state.battle.noaUltimateChain, { calls: env.calls.length });
  T("D6 挂起/恢复不重置限一次与饰品 once 标记",
    env.noa.usedUltimateBlade === true && env.noa.samuraiArmorUsed === false);
  // 跨回合 / 出牌者阵亡作废沿用通用执行器守卫
  const e2 = makeEnv({ locked: true });
  activate(e2);
  e2.noa.noaSlashCount = 3; e2.noa.noaSlashTurn = 1;
  e2.ctx.NoaUltimateBladeSkills.afterCardPlayed(e2.state, e2.noa,
    e2.state.battle.enemies[0], entity(e2));
  e2.state.battle.locked = false;
  e2.state.battle.turn = 2;
  e2.ctx.NoaUltimateBladeSkills.resume(e2.state);
  T("D7 跨回合残留链作废、不补打", e2.calls.length === 0
    && !e2.state.battle.noaUltimateChain);
}

// ── E 边界口径：转换杀 / 技能生成杀 / 克罗研究记录复制牌 ─────────────────────
{
  const e1 = makeEnv();
  activate(e1);
  e1.play(converted(e1, "魅杀"));
  T("E1 饰品转换杀（_entityConversion）计入 X 并消耗预约",
    !e1.noa.noaUltimateBladePending && e1.calls.length === 1
    && /额外结算1次/.test(extraLogs(e1)[0] || ""));
  const e2 = makeEnv();
  activate(e2);
  ["淫气改造", "螺旋桨", "外神之眼"].forEach(s => e2.play(virtualOf(e2, s)));
  T("E2 技能生成虚拟杀不计入 X、不消耗预约", e2.noa.noaUltimateBladePending === true
    && e2.calls.length === 0 && (e2.noa.noaSlashCount || 0) === 0);
  e2.play(entity(e2));
  T("E3 下一张实体杀仍是 X=1", /额外结算1次/.test(extraLogs(e2)[0] || "")
    && e2.calls.length === 1);
  // 克罗研究记录：额外结算复制牌带 _skill + _repeat，按现行口径不算「已使用的实体单体杀」
  const e3 = makeEnv();
  activate(e3);
  const repeatCard = entity(e3, { _skill: true, _repeat: true, suit: "♠" });
  e3.play(repeatCard);
  T("E4 克罗研究记录复制牌不计入 X、不消耗预约（现行口径，如实记录）",
    e3.noa.noaUltimateBladePending === true && e3.calls.length === 0,
    { pending: e3.noa.noaUltimateBladePending, calls: e3.calls.length });
  // 【杀欲窥视】copyPlayable 复制出的牌不带 virtual，是「实体单体杀」形态，
  // 只有 generatedBySkill 能把它与玩家真正打出的杀区分开。这是 !card.generatedBySkill
  // 排除项真正守住的形态（REVERT=generated 时本项应精准打红）。
  const e4 = makeEnv();
  activate(e4);
  const peek = e4.ctx.CardUtils.copyPlayable(entity(e4), {
    temporary: true, void: true, noIntentCost: true,
    withererPeekSlash: true, generatedBySkill: "杀欲窥视",
  });
  e4.play(peek);
  T("E5 杀欲窥视复制的实体单体杀不计入 X、不消耗预约",
    e4.noa.noaUltimateBladePending === true && e4.calls.length === 0
    && (e4.noa.noaSlashCount || 0) === 0,
    { pending: e4.noa.noaUltimateBladePending, calls: e4.calls.length,
      count: e4.noa.noaSlashCount });
}

console.log(`RESULT ${pass}/${pass + reds.length}`);
if (reds.length) console.log("FAILED:", reds.join(" | "));
process.exit(reds.length ? 1 : 0);
