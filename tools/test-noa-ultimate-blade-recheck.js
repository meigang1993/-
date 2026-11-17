// 【终极刀魔】独立复查：不复用 test-noa-ultimate-blade.js 的 mock，
// 直接加载真实 CardUtils / ChiyoChainSkills / StoreRepairs / StoreCompact /
// BattleTurnState / BattleSaveCheckpointValidation，验证：
//   A 真实杀牌判据与 X 计数口径（实体杀 vs 技能生成的虚拟杀）
//   B 完整链路 X 不被虚拟杀放大
//   C 旧档读档后按模板补齐新技能
//   D 存档往返：挂起链清除、单位字段保留、稳定存档点阻塞
//   E 回合重置与跨回合残留链作废
//   F 静态接线
//   G 两条口径：X 只数实体单体杀（含饰品转换杀）、派生杀用窄标记
// REVERT=count 把计数撤回成 isKillCard（虚拟杀+群体杀断言打红）；
// REVERT=scope 只撤单体限定（仅群体杀断言打红）；
// REVERT=derived 撤派生杀窄标记（仅 G4/G6/G13 打红）。
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
const SCOPE_GATE = "    const isCountedKill = !!card && !!window.CardUtils?.isEntityKillCard?.(card)\n"
  + "      && !card.generatedBySkill\n"
  + "      && (!card._skill || !!card._entityConversion);";
const OLD_GATE = "    const isCountedKill = !!window.CardUtils?.isKillCard?.(card);";
function patched(file) {
  let s = read(file);
  if (REVERT === "count" && file === "noa-ultimate-blade-skills.js") {
    s = hit(s, s.replace(FIXED_GATE, OLD_GATE), "entity-only slash count");
  }
  if (REVERT === "scope" && file === "noa-ultimate-blade-skills.js") {
    s = hit(s, s.replace(FIXED_GATE, SCOPE_GATE), "single-target slash scope");
  }
  if (REVERT === "derived" && file === "chiyo-chain-skills.js") {
    s = hit(s, s.replace("      _skipPlayedSlashFlag: true,\n", ""),
      "derived-slash narrow flag");
  }
  if (REVERT === "store" && file === "store-compact.js") {
    s = hit(s, s.replace('\n    "noaUltimateChain",', ""), "compact key");
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
      { name: "咬杀", type: "slash", scale: "attack", suit: "" },
      { name: "刺杀", type: "slash", scale: "attack", suit: "" },
    ],
    baseDeck: [], eliteCards: [],
  };
  ctx.BattleLog = { add: (state, text) => { (state.log ||= []).push(text); } };
  ctx.BattleLines = { skill: () => {} };
  ctx.RuinsEnemySkills = {
    blocksKillTarget: unit => !!opts.blocked?.has?.(unit.uid),
  };
  ctx.BattleSystem = {
    useVirtualKill: (state, actor, target, card) => {
      calls.push({ actor: actor.uid, target: target.uid, card });
      target.hp = Math.max(0, target.hp - (opts.damage ?? 1));
      return true;
    },
  };
  ctx.GameStoreSaveSchema = {
    cardIdentity: card => ({ name: card?.name || "", suit: card?.suit || "" }),
    rebuildCard: card => card,
  };
  ctx.GameData = { characters: [
    { id: "noa", skills: [
      { name: "淫气改造", type: "passive", text: "结束阶段…" },
      { name: "终极刀魔", type: "active", card: {
        name: "终极刀魔", type: "tactic", ultimateBlade: true, targetless: true } },
    ] },
  ] };
  ctx.RelicSystem = { normalizeNames: x => x, data: () => null };
  ctx.GameStoreBountyRepairs = { refreshBountyGold: () => {} };
  vm.createContext(ctx);
  ["card-utils.js", "chiyo-chain-skills.js", "noa-ultimate-blade-skills.js",
    "battle-turn-state.js", "store-compact.js",
    "battle-save-checkpoint-validation.js", "store-merged-skills-repair.js", "store-repairs.js"]
    .forEach(file => vm.runInContext(patched(file), ctx, { filename: file }));
  return { ctx, calls };
}

const noa = (over = {}) => Object.assign({
  uid: "n0", name: "怪面诺亚", ref: "noa", id: "noa", side: "ally",
  hp: 100, maxHp: 130, hand: [], skills: [
    { name: "淫气改造", type: "passive", text: "结束阶段…" },
    { name: "终极刀魔", type: "active" },
  ],
}, over);
const foe = (uid, hp = 99) => ({
  uid, name: uid, ref: uid, id: uid, side: "enemy", hp, maxHp: hp, hand: [],
});
function state(opts = {}) {
  const n = opts.noa || noa();
  return {
    view: "battle", log: [],
    battle: {
      allies: [n], enemies: opts.enemies || [foe("e0")],
      turn: opts.turn ?? 5, phase: opts.phase ?? 4,
      activeUid: opts.activeUid ?? "n0", locked: !!opts.locked,
      ended: !!opts.ended, played: [], shownPlayed: [], animQueue: [],
      roundOrder: ["n0", "e0"], roundIndex: 0,
    },
  };
}
const entitySlash = over => Object.assign(
  { name: "杀（普攻）", type: "slash", scale: "attack", suit: "♠", _playedFromHand: true }, over);
const virtualBite = () => ({
  name: "咬杀", type: "slash", scale: "attack", suit: "", virtual: true,
  temporary: true, void: true, noIntentCost: true,
  generatedBySkill: "淫气改造", ignoreResponse: true,
});
const propellerVirtual = () => ({
  name: "杀（普攻）", type: "slash", scale: "attack", suit: "", virtual: true,
  temporary: true, void: true, noIntentCost: true,
  generatedBySkill: "螺旋桨",
});
const ownVirtual = () => ({
  name: "杀（普攻）", type: "slash", virtual: true, temporary: true, void: true,
  noIntentCost: true, ignoreResponse: true, skipAfterCardPlayed: true,
  _noaUltimateVirtual: true, generatedBySkill: "终极刀魔",
});

// ── A 真实杀牌判据 ──────────────────────────────────────────────────────────
{
  const { ctx } = makeWin({ damage: 0 });
  T("A1 真实 CardUtils 导出 isEntityKillCard",
    typeof ctx.CardUtils.isEntityKillCard === "function");
  T("A2 实体单体杀被真实判据认作杀",
    ctx.CardUtils.isKillCard(entitySlash()) && ctx.CardUtils.isEntitySingleKill(entitySlash()));
  const cases = [
    ["A3 淫气改造虚拟咬杀不计入 X", virtualBite()],
    ["A4 螺旋桨虚拟杀不计入 X", propellerVirtual()],
    ["A5 本技能虚拟杀不计入 X", ownVirtual()],
  ];
  cases.forEach(([name, card]) => {
    const st = state();
    const n = st.battle.allies[0];
    ctx.NoaUltimateBladeSkills.afterCardPlayed(st, n, st.battle.enemies[0], card);
    T(name, !n.noaSlashCount, { count: n.noaSlashCount });
  });
  {
    const st = state();
    const n = st.battle.allies[0];
    ctx.NoaUltimateBladeSkills.afterCardPlayed(st, n, st.battle.enemies[0],
      entitySlash({ sweep: true, allTargets: ["e0"] }));
    T("A6 群体实体杀不计入 X、不消耗预约", !n.noaSlashCount
      && !n.noaUltimateBladePending, { count: n.noaSlashCount });
  }
  {
    const groupFlags = [
      { sweep: true, allTargets: ["e0"] }, { allTargets: ["e0"] },
      { aoeLineShown: true }, { targetless: true },
    ];
    groupFlags.forEach((flags, i) => {
      const st = state();
      const n = st.battle.allies[0];
      ctx.NoaUltimateBladeSkills.afterCardPlayed(st, n, st.battle.enemies[0],
        entitySlash(flags));
      T(`A9.${i + 1} 群体/无目标实体杀不计入 X`, !n.noaSlashCount,
        { flags, count: n.noaSlashCount });
    });
  }
  {
    const st = state();
    const n = st.battle.allies[0];
    ctx.NoaUltimateBladeSkills.afterCardPlayed(st, n, st.battle.enemies[0],
      entitySlash({ name: "刺杀", convertedFrom: "杀（普攻）" }));
    T("A7 转换杀（不带 virtual）计入 X", n.noaSlashCount === 1);
  }
  {
    const st = state();
    const other = foe("x0", 99);
    ctx.NoaUltimateBladeSkills.afterCardPlayed(st, other, st.battle.enemies[0], entitySlash());
    T("A8 非诺亚出牌不计数", !other.noaSlashCount);
  }
}

// ── B 完整链路：虚拟杀不得放大 X ─────────────────────────────────────────────
{
  const { ctx, calls } = makeWin({ damage: 0 });
  const st = state();
  const n = st.battle.allies[0], e0 = st.battle.enemies[0];
  // 发动前：淫气改造虚拟咬杀 + 螺旋桨虚拟杀（都不带 skipAfterCardPlayed，
  // 真实链路 useVirtualKill → useCard → finalizeUse → runHooks 会调到钩子）。
  ctx.NoaUltimateBladeSkills.afterCardPlayed(st, n, e0, virtualBite());
  ctx.NoaUltimateBladeSkills.afterCardPlayed(st, n, e0, propellerVirtual());
  ctx.NoaUltimateBladeSkills.handleSpecialCard(st, n, n,
    { name: "终极刀魔", _skill: true, ultimateBlade: true });
  ctx.NoaUltimateBladeSkills.afterCardPlayed(st, n, e0, entitySlash());
  T("B1 发动前的两张虚拟杀不进 X", n.noaSlashCount === 1,
    { count: n.noaSlashCount });
  T("B2 额外结算恰好 1 次（X 含当前这张）", calls.length === 1,
    { calls: calls.length });
  T("B3 战报写明 X=1", st.log.some(t => t.includes("额外结算1次")), st.log);
  T("B4 预约已消耗、链不残留",
    !n.noaUltimateBladePending && !st.battle.noaUltimateChain);
}

// ── C 旧档兼容：按模板补齐新增技能 ────────────────────────────────────────────
{
  const { ctx } = makeWin();
  const st = state();
  const n = st.battle.allies[0];
  n.skills = [{ name: "淫气改造", type: "passive", text: "结束阶段…" }];
  n.usedUltimateBlade = false;
  const changed = ctx.StoreRepairs.normalizeMergedSkills(st);
  T("C1 旧档缺新技能时触发重建", changed === true);
  T("C2 读档后获得【终极刀魔】主动技",
    n.skills.some(s => s.name === "终极刀魔" && s.type === "active"));
  T("C3 技能卡带 ultimateBlade 标记",
    n.skills.some(s => s.card?.ultimateBlade === true));
  const before = JSON.stringify(n.skills);
  ctx.StoreRepairs.normalizeMergedSkills(st);
  T("C4 二次规范化幂等", JSON.stringify(n.skills) === before);
  n.skills.push({ name: "临时复制技", type: "active" });
  ctx.StoreRepairs.normalizeMergedSkills(st);
  T("C5 模板外的动态技能保留",
    n.skills.some(s => s.name === "临时复制技"));
}

// ── D 存档往返 ──────────────────────────────────────────────────────────────
{
  const { ctx } = makeWin();
  const st = state();
  const n = st.battle.allies[0];
  n.usedUltimateBlade = true;
  n.noaUltimateBladePending = true;
  n.noaUltimateBladeTurn = 5;
  st.battle.noaUltimateChain = {
    actorUid: "n0", side: "ally", targetUid: "e0", remaining: 2,
    turn: 5, skillName: "终极刀魔", chainKey: "noaUltimateChain",
  };
  T("D1 挂起链存在时稳定存档点不成立",
    ctx.BattleSaveCheckpointValidation.stable(st) === false);
  const compacted = patched("store-compact.js");
  T("D2 压缩清单登记挂起链", /"noaUltimateChain"/.test(compacted));
  ctx.GameStoreCompact.stripBattleTransientCards(st.battle);
  T("D3 压缩清除挂起链", !st.battle.noaUltimateChain);
  T("D4 单位上的限一次/预约字段保留（读档续玩）",
    n.usedUltimateBlade === true && n.noaUltimateBladePending === true
    && n.noaUltimateBladeTurn === 5);
  st.battle.locked = false;
  T("D5 清链后稳定存档点恢复",
    ctx.BattleSaveCheckpointValidation.stable(st) === true);
  const st2 = state();
  ctx.GameStoreCompact.stripBattleTransientCards(st2.battle);
  T("D6 普通战斗清链为零副作用",
    !st2.battle.noaUltimateChain && st2.battle.turn === 5);
}

// ── E 回合重置与跨回合残留链 ──────────────────────────────────────────────────
{
  const { ctx, calls } = makeWin({ damage: 0 });
  const st = state();
  const n = st.battle.allies[0];
  n.usedUltimateBlade = true; n.noaSlashCount = 7; n.noaSlashTurn = 5;
  n.noaUltimateBladePending = true; n.noaUltimateBladeTurn = 5;
  ctx.BattleTurnState.resetBeginTurn(n, st.battle, 1);
  T("E1 回合开始重置 usedUltimateBlade", n.usedUltimateBlade === false);
  T("E2 回合开始重置杀数计数", n.noaSlashCount === 0 && n.noaSlashTurn === null);
  T("E3 回合开始清除预约",
    !n.noaUltimateBladePending && !n.noaUltimateBladeTurn);

  const s2 = state({ locked: true });
  const n2 = s2.battle.allies[0];
  ctx.NoaUltimateBladeSkills.handleSpecialCard(s2, n2, n2, { ultimateBlade: true });
  ctx.NoaUltimateBladeSkills.afterCardPlayed(s2, n2, s2.battle.enemies[0], entitySlash());
  T("E4 locked 时链挂起", s2.battle.noaUltimateChain?.remaining === 1);
  s2.battle.locked = false; s2.battle.turn = 6;
  ctx.NoaUltimateBladeSkills.resume(s2);
  T("E5 跨回合残留链作废、不补打",
    calls.length === 0 && !s2.battle.noaUltimateChain);
}

// ── F 静态接线 ──────────────────────────────────────────────────────────────
{
  const own = patched("noa-ultimate-blade-skills.js");
  T("F1 计数只认实体单体杀（修复在位）", own.includes(FIXED_GATE));
  T("F2 虚拟杀排除仍保留", /_noaUltimateVirtual/.test(own));
  const hooks = read("battle-card-resume-hooks.js");
  T("F3 新技能钩子排在连鬼斩之后",
    hooks.indexOf("NoaUltimateBladeSkills") > hooks.indexOf("ChiyoChainSkills"));
  const manual = read("battle-manual-continuation.js");
  T("F4 两处中断恢复都接入 resume",
    (manual.match(/NoaUltimateBladeSkills\?\.resume/g) || []).length === 2);
}

// ── G 两条口径收口：X 只数实体单体杀、派生虚拟杀不算「使用杀」 ───────────────
{
  const { ctx, calls } = makeWin({ damage: 0 });
  const st = state();
  const n = st.battle.allies[0], e0 = st.battle.enemies[0];
  ctx.NoaUltimateBladeSkills.afterCardPlayed(st, n, e0,
    entitySlash({ sweep: true, allTargets: ["e0"] }));
  T("G1 群体实体杀不给 X 灌水", !n.noaSlashCount, { count: n.noaSlashCount });
  ctx.NoaUltimateBladeSkills.handleSpecialCard(st, n, n,
    { name: "终极刀魔", _skill: true, ultimateBlade: true });
  ctx.NoaUltimateBladeSkills.afterCardPlayed(st, n, e0, entitySlash());
  T("G2 X = 本回合实体单体【杀】数（含当前这张）= 1",
    n.noaSlashCount === 1 && calls.length === 1,
    { count: n.noaSlashCount, calls: calls.length });
  T("G3 战报写明新口径", st.log.some(t => t.includes("已使用1张实体单体【杀】")));

  // 真实链产生的派生虚拟杀（不是测试自造对象）。
  const card = calls[0]?.card || {};
  T("G4 派生虚拟杀带窄标记、不再带旧宽标记", card._skipPlayedSlashFlag === true
    && !card._skipUseKillTriggers
    && card.skipAfterCardPlayed === true && card.virtual === true);

  // 从真实源码抽出 playedSlashThisTurn 的置真行执行，不用自写等价式。
  const flow = read("battle-combat-attack-flow.js");
  const line = (flow.match(
    /^[ \t]*if \(!card\._skipUseKillTriggers && !card\._skipPlayedSlashFlag\) actor\.playedSlashThisTurn = true;[ \t]*$/m
  ) || [])[0];
  T("G5 真实置真行受抑制标记保护", !!line);
  if (line) {
    const stmt = new Function("card", "actor", line.trim());
    const derived = {}, normal = {};
    stmt(card, derived);
    stmt(entitySlash(), normal);
    T("G6 派生杀不置 playedSlashThisTurn", !derived.playedSlashThisTurn);
    T("G7 正常实体单体杀仍置 playedSlashThisTurn", normal.playedSlashThisTurn === true);
  }
  const discard = read("battle-discard-flow.js");
  const relic = read("battle-relic-turns.js");
  T("G8 母亲怀表 / 震感手炮仍读 playedSlashThisTurn",
    /!unit\.playedSlashThisTurn/.test(discard)
    && /unit\.playedSlashThisTurn/.test(relic));

  const chars = read("data-new-characters.js");
  const notice = read("update-notice-recent.js");
  const own = read("noa-ultimate-blade-skills.js");
  const ai = read("battle-ai-skill-evaluation.js");
  T("G9 角色表与卡面写明实体单体【杀】牌数",
    (chars.match(/已使用的实体单体【杀】牌数/g) || []).length === 2
    && /已用实体单体【杀】牌数/.test(chars));
  T("G10 公告写明两条口径（转换杀计入、派生杀窄标记+饰品照常触发）",
    /只数实体单体【杀】/.test(notice) && /_skipPlayedSlashFlag/.test(notice)
    && /照常触发/.test(notice) && /_entityConversion/.test(notice));
  T("G11 技能战报写明新口径", /已使用\$\{times\}张实体单体【杀】/.test(own));
  T("G12 AI 只认实体单体杀", /isEntitySingleKill\?\.\(item\)/.test(ai));
  T("G13 连鬼斩虚拟杀同口径（窄标记）",
    /_skipPlayedSlashFlag: true/.test(patched("chiyo-chain-skills.js")));
  T("G14 旧口径文案已清零",
    !/X为你本回合已使用的【杀】牌数/.test(chars)
    && !/X为你本回合已使用的【杀】牌数/.test(notice));
}

console.log(`终极刀魔独立复查：${pass} PASS / ${reds.length} FAIL`);
if (reds.length) { reds.forEach(r => console.error(`  - ${r}`)); process.exit(1); }
