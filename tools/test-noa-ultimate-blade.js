// 【终极刀魔】严格检查：技能定义 / 限一次登记 / 发动守卫 / X 计算 / 转移目标 /
// 挂起恢复与跨回合作废 / 存档防护 / 静态接线。
// REVERT=guard|count|transfer|store|derived 分别把对应修复撤回，应精准打红（断言不空转）。
// count 撤预约的单体杀门；derived 撤派生虚拟杀的 playedSlashThisTurn 窄标记。
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const ROOT = path.join(__dirname, "../src/original");
const TOOLS = __dirname;
const REVERT = process.env.REVERT || "";
let pass = 0;
const reds = [];
function T(name, cond, extra) {
  if (cond) { pass += 1; return; }
  reds.push(name);
  if (REVERT) console.log(`  RED ${name}`, extra === undefined ? "" : JSON.stringify(extra));
}
function read(file) { return fs.readFileSync(path.join(ROOT, file), "utf8"); }
function tool(file) { return fs.readFileSync(path.join(TOOLS, file), "utf8"); }
function hit(before, after, tag) {
  assert.notStrictEqual(after, before, `REVERT=${REVERT} must hit ${tag}`);
  return after;
}
function patched(file) {
  let s = read(file);
  if (REVERT === "guard" && file === "noa-ultimate-blade-skills.js") {
    s = hit(s, s.replace(
      "    if (b && ((b.phase != null && b.phase !== PLAY_PHASE)\n      || (b.activeUid != null && actor?.uid != null\n        && b.activeUid !== actor.uid))) return true;\n", ""), "phase guard");
  }
  if (REVERT === "count" && file === "noa-ultimate-blade-skills.js") {
    s = hit(s, s.replace(
      "    if (!isCountedKill) return;\n", ""), "shared entity single kill gate");
  }
  if (REVERT === "transfer" && file === "chiyo-chain-skills.js") {
    s = hit(s, s.replace(
      "return (list || []).filter(alive).filter(unit => targetable(unit, probe));",
      "return (list || []).filter(alive);"), "targetable filter");
    s = hit(s, s.replace(
      "if (!alive(actor) || !alive(target) || !targetable(target, probe)) return false;",
      "if (!alive(actor) || !alive(target)) return false;"), "useVirtual guard");
  }
  if (REVERT === "store" && file === "store-compact.js") {
    s = hit(s, s.replace('\n    "noaUltimateChain",', ""), "compact key");
  }
  if (REVERT === "store" && file === "battle-save-checkpoint-validation.js") {
    s = hit(s, s.replace('\n    "noaUltimateChain",', ""), "blocking key");
  }
  if (REVERT === "derived" && file === "chiyo-chain-skills.js") {
    s = hit(s, s.replace("      _skipPlayedSlashFlag: true,\n", ""),
      "derived-slash narrow flag");
  }
  return s;
}

function makeWin(opts = {}) {
  const win = {};
  const calls = [];
  const lines = [];
  win.BattleLog = { add: (state, text) => { (state.log ||= []).push(text); } };
  win.BattleLines = { skill: (state, unit, name) => lines.push({ uid: unit.uid, name }) };
  win.CardUtils = {
    fromEntity: (name, extra) => Object.assign(
      { name, type: "slash", scale: "attack", suit: "", virtual: true }, extra),
    isKillCard: card => card?.type === "slash" || /杀/.test(card?.name || ""),
    isEntityKillCard: card => !!card && (card.type === "slash" || /杀/.test(card.name || ""))
      && !card.virtual,
    isEntitySingleKill: card => !!card && card.type === "slash"
      && !card.virtual && !card.sweep && !card.allTargets
      && !card.aoeLineShown && !card.targetless,
  };
  win.RuinsEnemySkills = {
    blocksKillTarget: unit => !!opts.blocked?.has?.(unit.uid),
  };
  win.BattleSystem = {
    useVirtualKill: (state, actor, target, card) => {
      calls.push({ actor: actor.uid, target: target.uid, card });
      target.hp = Math.max(0, target.hp - (opts.damage ?? 1));
      return true;
    },
  };
  const ctx = {
    console, Math, JSON, Object, Array, Set, Map, String, Number,
    Boolean, RegExp, Date, Error, ...win,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  ["skill-once-per-turn.js", "character-skill-access.js",
    "chiyo-chain-skills.js", "noa-ultimate-blade-skills.js"]
    .forEach(file => vm.runInContext(patched(file), ctx, { filename: file }));
  return { ctx, calls, lines };
}

function noa(over = {}) {
  return Object.assign({
    uid: "n0", name: "怪面诺亚", ref: "noa", side: "ally", hp: 100, maxHp: 130,
    hand: [], skills: [
      { name: "淫气改造", type: "passive" },
      { name: "终极刀魔", type: "active", card: { name: "终极刀魔", ultimateBlade: true } },
    ],
  }, over);
}
function foe(uid, hp = 5, over = {}) {
  return Object.assign({ uid, name: uid, ref: uid, side: "enemy", hp, maxHp: hp, hand: [] }, over);
}
function state(opts = {}) {
  const n = opts.noa || noa();
  const enemies = opts.enemies || [foe("e0", 5), foe("e1", 5)];
  return {
    log: [],
    battle: {
      allies: [n], enemies, turn: opts.turn ?? 1,
      phase: opts.phase ?? 4, activeUid: opts.activeUid ?? "n0",
      locked: !!opts.locked, ended: !!opts.ended,
    },
  };
}
const entitySlash = over => Object.assign(
  { name: "杀（普攻）", type: "slash", suit: "♠", _playedFromHand: true }, over);
const tactic = () => ({ name: "蓄力", type: "tactic", suit: "" });

// ── A 技能定义 ──────────────────────────────────────────────────────────────
{
  const s = read("data-new-characters.js");
  const block = s.slice(s.indexOf('id: "noa"'), s.indexOf('id: "gerda"'));
  T("A1 诺亚技能表含【终极刀魔】主动技", /name: "终极刀魔", type: "active"/.test(block));
  T("A2 技能卡带 ultimateBlade 标记", /ultimateBlade: true/.test(block));
  T("A3 描述含 X 口径（只数实体单体杀、含当前这张）", /X为你本回合已使用的实体单体【杀】牌数，包含当前这张【杀】牌/.test(block));
  T("A4 描述含转移目标", /剩余未结算的次数可指定另一名存活的敌方角色为目标/.test(block));
  T("A5 技能卡为 targetless 自选发动", /targetless: true/.test(block));
  T("A6 淫气改造仍在（合并技能未被覆盖）", /name: "淫气改造"/.test(block));
  T("A7 角色评价同步新技能", /【终极刀魔】/.test(s.slice(0, s.indexOf('id: "gerda"'))));
}

// ── B 出牌阶段限一次 + 技能访问定义 ──────────────────────────────────────────
{
  const { ctx } = makeWin();
  const skillCard = { name: "终极刀魔", type: "tactic", _skill: true, ultimateBlade: true, targetless: true };
  T("B1 登记表认 ultimateBlade → usedUltimateBlade",
    ctx.SkillOncePerTurn.fieldFor(skillCard) === "usedUltimateBlade");
  T("B2 已发动后置灰", ctx.SkillOncePerTurn.blocked({ usedUltimateBlade: true }, skillCard));
  T("B3 未发动时可用", !ctx.SkillOncePerTurn.blocked({}, skillCard));
  T("B4 CharacterSkillAccess 有对应定义",
    ctx.CharacterSkillAccess.definitions.some(d => d.name === "终极刀魔" && d.target === "self"));
  const st = state();
  T("B5 canResolve 正常出牌阶段放行",
    ctx.CharacterSkillAccess.canResolve(st, st.battle.allies[0], st.battle.allies[0], skillCard, () => true) === true);
  const p1 = state({ phase: 1 });
  T("B6 canResolve 非出牌阶段拦下",
    ctx.CharacterSkillAccess.canResolve(p1, p1.battle.allies[0], p1.battle.allies[0],
      skillCard, () => true) === false);
}

// ── C 发动守卫 ──────────────────────────────────────────────────────────────
{
  const { ctx, lines } = makeWin();
  const st = state();
  const n = st.battle.allies[0];
  T("C1 正常发动挂预约", ctx.NoaUltimateBladeSkills.handleSpecialCard(st, n, n,
    { name: "终极刀魔", ultimateBlade: true }) === true);
  T("C2 预约标记 + 回合", n.noaUltimateBladePending === true && n.noaUltimateBladeTurn === 1);
  T("C3 usedUltimateBlade 置位", n.usedUltimateBlade === true);
  T("C4 播发动台词", lines.some(x => x.name === "终极刀魔"));
  T("C5 战报写明预约", st.log.some(t => t.includes("下一张实体单体【杀】")));
  const bad = state({ phase: 1 });
  const badN = bad.battle.allies[0];
  ctx.NoaUltimateBladeSkills.handleSpecialCard(bad, badN, badN, { ultimateBlade: true });
  T("C6 非出牌阶段不挂预约", !badN.noaUltimateBladePending);
  const other = state({ activeUid: "e0" });
  const otherN = other.battle.allies[0];
  ctx.NoaUltimateBladeSkills.handleSpecialCard(other, otherN, otherN, { ultimateBlade: true });
  T("C7 别家回合不挂预约", !otherN.noaUltimateBladePending);
  const twice = state();
  const tN = twice.battle.allies[0];
  tN.usedUltimateBlade = true;
  ctx.NoaUltimateBladeSkills.handleSpecialCard(twice, tN, tN, { ultimateBlade: true });
  T("C8 本回合二次发动不重复挂预约", !tN.noaUltimateBladePending);
  T("C9 非本技能牌不被截获",
    ctx.NoaUltimateBladeSkills.handleSpecialCard(state(), noa(), noa(), tactic()) === false);
}

// ── D X 计算与预约消耗 ──────────────────────────────────────────────────────
{
  const { ctx, calls } = makeWin({ damage: 0 });
  const st = state({ enemies: [foe("e0", 99)] });
  const n = st.battle.allies[0];
  const e0 = st.battle.enemies[0];
  // 发动前本回合已用 2 张【杀】：预约未挂，只累加计数。
  ctx.NoaUltimateBladeSkills.afterCardPlayed(st, n, e0, entitySlash());
  ctx.NoaUltimateBladeSkills.afterCardPlayed(st, n, e0, entitySlash());
  ctx.NoaUltimateBladeSkills.handleSpecialCard(st, n, n, { ultimateBlade: true });
  T("D1 发动前的杀只累加计数", n.noaSlashCount === 2 && calls.length === 0);
  // 第 3 张（当前这张）触发，X 含当前这张 = 3
  ctx.NoaUltimateBladeSkills.afterCardPlayed(st, n, e0, entitySlash());
  T("D2 X = 本回合已用杀数（含当前这张）= 3", n.noaSlashCount === 3);
  T("D3 额外结算恰好 3 次", calls.length === 3, { calls: calls.length });
  T("D4 预约已消耗", !n.noaUltimateBladePending);
  T("D5 战报写明 X 与额外结算次数", st.log.some(t => t.includes("额外结算3次")));
  T("D6 虚拟杀带防自激标记",
    calls.every(c => c.card._noaUltimateVirtual && c.card.skipAfterCardPlayed && c.card.ignoreResponse));
  const virt = { name: "杀（普攻）", type: "slash", virtual: true, _noaUltimateVirtual: true };
  ctx.NoaUltimateBladeSkills.afterCardPlayed(st, n, e0, virt);
  T("D7 本技能虚拟杀不计入 X", n.noaSlashCount === 3);
  T("D13 派生虚拟杀带窄标记、不带旧宽标记",
    calls.every(c => c.card._skipPlayedSlashFlag === true
      && !c.card._skipUseKillTriggers));
  T("D14 真实置真行同时认宽/窄两个标记",
    /if \(!card\._skipUseKillTriggers && !card\._skipPlayedSlashFlag\) actor\.playedSlashThisTurn = true;/
      .test(read("battle-combat-attack-flow.js")));

  const { ctx: c2, calls: k2 } = makeWin({ damage: 0 });
  const s2 = state({ enemies: [foe("e0", 99)] });
  const n2 = s2.battle.allies[0], t2 = s2.battle.enemies[0];
  c2.NoaUltimateBladeSkills.handleSpecialCard(s2, n2, n2, { ultimateBlade: true });
  c2.NoaUltimateBladeSkills.afterCardPlayed(s2, n2, t2, tactic());
  T("D8 战术牌不消耗预约", n2.noaUltimateBladePending === true && k2.length === 0);
  c2.NoaUltimateBladeSkills.afterCardPlayed(s2, n2, t2,
    entitySlash({ sweep: true, allTargets: ["e0"] }));
  T("D9 群体实体杀不消耗预约、也不计入 X",
    n2.noaUltimateBladePending === true && !n2.noaSlashCount && k2.length === 0,
    { count: n2.noaSlashCount });
  c2.NoaUltimateBladeSkills.afterCardPlayed(s2, n2, t2, entitySlash());
  T("D10 下一张实体单体杀触发且 X=1", k2.length === 1, { calls: k2.length });

  const { ctx: c3, calls: k3 } = makeWin({ damage: 0 });
  const s3 = state({ enemies: [foe("e0", 99)] });
  const n3 = s3.battle.allies[0];
  c3.NoaUltimateBladeSkills.handleSpecialCard(s3, n3, n3, { ultimateBlade: true });
  s3.battle.turn = 2;
  c3.NoaUltimateBladeSkills.afterCardPlayed(s3, n3, s3.battle.enemies[0], entitySlash());
  T("D11 跨回合预约自动失效，不凭空额外结算", k3.length === 0 && !n3.noaUltimateBladePending);
  T("D12 计数按回合重置", n3.noaSlashCount === 1);
}

// ── E 转移目标 ──────────────────────────────────────────────────────────────
{
  // X=3（发动前 2 张 + 触发 1 张）：每次伤害 5，e0 只有 5 血 → 第 1 次打死，
  // 剩余 2 次依次转移给血量最低者，验证「不浪费 / 不重复 / 守恒」。
  const { ctx, calls } = makeWin({ damage: 5 });
  const st = state({ enemies: [foe("e0", 5), foe("e1", 99), foe("e2", 2)] });
  const n = st.battle.allies[0], e0 = st.battle.enemies[0];
  ctx.NoaUltimateBladeSkills.afterCardPlayed(st, n, e0, entitySlash());
  ctx.NoaUltimateBladeSkills.afterCardPlayed(st, n, e0, entitySlash());
  ctx.NoaUltimateBladeSkills.handleSpecialCard(st, n, n, { ultimateBlade: true });
  ctx.NoaUltimateBladeSkills.afterCardPlayed(st, n, e0, entitySlash());
  T("E1 次数守恒（3 次恰好打完）", calls.length === 3, { calls: calls.length });
  T("E2 原目标阵亡后剩余次数转移", calls.slice(1).every(c => c.target !== "e0"));
  T("E3 转移优先血量最低者", calls[1].target === "e2", { second: calls[1]?.target });
  T("E4 战报写明转移", st.log.some(t => t.includes("转移至")));
  T("E5 链跑完不残留", !st.battle.noaUltimateChain);

  const { ctx: c2, calls: k2 } = makeWin({ damage: 5, blocked: new Set(["e1"]) });
  const s2 = state({ enemies: [foe("e0", 5), foe("e1", 99)] });
  const n2 = s2.battle.allies[0], t2 = s2.battle.enemies[0];
  c2.NoaUltimateBladeSkills.afterCardPlayed(s2, n2, t2, entitySlash());
  c2.NoaUltimateBladeSkills.handleSpecialCard(s2, n2, n2, { ultimateBlade: true });
  c2.NoaUltimateBladeSkills.afterCardPlayed(s2, n2, t2, entitySlash());
  T("E6 不可指定的存活敌方被排除", k2.every(c => c.target !== "e1"));
  T("E7 无可指定目标时终止并写战报",
    s2.log.some(t => t.includes("已无可指定的存活敌方")) && !s2.battle.noaUltimateChain);
}

// ── F 挂起 / 恢复 / 作废 ────────────────────────────────────────────────────
{
  const { ctx, calls } = makeWin({ damage: 0 });
  const st = state({ locked: true, enemies: [foe("e0", 99)] });
  const n = st.battle.allies[0];
  ctx.NoaUltimateBladeSkills.handleSpecialCard(st, n, n, { ultimateBlade: true });
  ctx.NoaUltimateBladeSkills.afterCardPlayed(st, n, st.battle.enemies[0], entitySlash());
  T("F1 locked 时链挂起不丢次数", st.battle.noaUltimateChain?.remaining === 1);
  st.battle.locked = false;
  ctx.NoaUltimateBladeSkills.resume(st);
  T("F2 恢复后补跑剩余次数", calls.length === 1 && !st.battle.noaUltimateChain);

  const { ctx: c2, calls: k2 } = makeWin({ damage: 0 });
  const s2 = state({ locked: true, enemies: [foe("e0", 99)] });
  const n2 = s2.battle.allies[0];
  c2.NoaUltimateBladeSkills.handleSpecialCard(s2, n2, n2, { ultimateBlade: true });
  c2.NoaUltimateBladeSkills.afterCardPlayed(s2, n2, s2.battle.enemies[0], entitySlash());
  s2.battle.locked = false; s2.battle.turn = 2;
  c2.NoaUltimateBladeSkills.resume(s2);
  T("F3 跨回合残留链作废，不补打", k2.length === 0 && !s2.battle.noaUltimateChain);

  const { ctx: c3, calls: k3 } = makeWin({ damage: 0 });
  const s3 = state({ locked: true, enemies: [foe("e0", 99)] });
  const n3 = s3.battle.allies[0];
  c3.NoaUltimateBladeSkills.handleSpecialCard(s3, n3, n3, { ultimateBlade: true });
  c3.NoaUltimateBladeSkills.afterCardPlayed(s3, n3, s3.battle.enemies[0], entitySlash());
  s3.battle.locked = false; s3.battle.ended = true;
  c3.NoaUltimateBladeSkills.resume(s3);
  T("F4 战斗结束残留链作废", k3.length === 0 && !s3.battle.noaUltimateChain);

  const { ctx: c4, calls: k4 } = makeWin({ damage: 0 });
  const s4 = state({ locked: true, enemies: [foe("e0", 99)] });
  const n4 = s4.battle.allies[0];
  c4.NoaUltimateBladeSkills.handleSpecialCard(s4, n4, n4, { ultimateBlade: true });
  c4.NoaUltimateBladeSkills.afterCardPlayed(s4, n4, s4.battle.enemies[0], entitySlash());
  s4.battle.locked = false; n4.hp = 0;
  c4.NoaUltimateBladeSkills.resume(s4);
  T("F5 出牌者阵亡残留链作废", k4.length === 0 && !s4.battle.noaUltimateChain);
  T("F6 重复 resume 幂等", (c4.NoaUltimateBladeSkills.resume(s4), k4.length === 0));
}

// ── G 存档防护 ──────────────────────────────────────────────────────────────
{
  const compact = patched("store-compact.js");
  const checkpoint = patched("battle-save-checkpoint-validation.js");
  T("G1 主存档压缩清除挂起链", /"noaUltimateChain"/.test(compact)
    && /transientStateKeys/.test(compact.slice(0, compact.indexOf('"noaUltimateChain"'))));
  T("G2 稳定存档点阻塞键含挂起链", /"noaUltimateChain"/.test(checkpoint));
  const turn = read("battle-turn-state.js");
  T("G3 回合开始重置 usedUltimateBlade", /unit.usedUltimateBlade = false/.test(turn));
  T("G4 回合开始重置杀数计数", /unit.noaSlashCount = 0/.test(turn));
  T("G5 回合开始清除预约", /delete unit.noaUltimateBladePending/.test(turn));
  const cleanup = read("battle-card-cleanup.js");
  T("G6 虚拟杀标记纳入出牌清理", /"_noaUltimateVirtual"/.test(cleanup));
}

// ── H 静态接线 ──────────────────────────────────────────────────────────────
{
  const combat = read("battle-combat.js");
  const hooks = read("battle-card-resume-hooks.js");
  const manual = read("battle-manual-continuation.js");
  const bundles = tool("publish-bundles.json");
  const catalog = tool("qa-test-catalog.js");
  const notice = read("update-notice-recent.js");
  const lines = read("new-character-line-data.js");
  T("H1 出牌主链接入 handleSpecialCard", /NoaUltimateBladeSkills\?\.handleSpecialCard/.test(combat));
  T("H2 出牌后钩子接入 afterCardPlayed", /NoaUltimateBladeSkills\?\.afterCardPlayed/.test(hooks));
  T("H3 两处中断恢复接入 resume",
    (manual.match(/NoaUltimateBladeSkills\?\.resume/g) || []).length === 2);
  T("H4 bundle 清单登记且排在 chiyo 之后",
    bundles.indexOf('"noa-ultimate-blade-skills.js"') > bundles.indexOf('"chiyo-chain-skills.js"'));
  T("H5 QA 目录超时表 + 分组均登记",
    (catalog.match(/test-noa-ultimate-blade\.js/g) || []).length === 2);
  T("H6 台词表写入发动语", /"终极刀魔": "全部！全部砍碎！！！"/.test(lines));
  T("H7 今日公告写入新技能", /新增主动技【终极刀魔】/.test(notice));
  T("H8 共享夹具加载新模块", /noa-ultimate-blade-skills\.js/.test(tool("skill-coverage-fixtures.js")));
  T("H9 AI 评估认新技能卡", /card\.ultimateBlade/.test(read("battle-ai-skill-evaluation.js")));
  T("H10 新技能文件行数不超硬约束", read("noa-ultimate-blade-skills.js").split("\n").length <= 189);
  const own = read("noa-ultimate-blade-skills.js");
  const shared = read("chiyo-chain-skills.js");
  T("H11 新技能委托通用链执行器（不重复实现）",
    /ChiyoChainSkills\?\.run\?\.\(state, chain\)/.test(own)
    && !/function useVirtual\(/.test(own));
  T("H12 连鬼斩导出通用 run / resume",
    /return \{ afterCardPlayed, resume, run \};/.test(shared)
    && /function resume\(state, chainKey = "chiyoChain"\)/.test(shared));
  T("H13 通用执行器按 chain 参数化技能名与链键",
    /chain\.skillName \|\| "红缨连鬼斩"/.test(shared)
    && /chain\.chainKey \|\| "chiyoChain"/.test(shared));
  const art = read("card-art.js");
  const m = art.match(/"终极刀魔": "\.\/assets\/generated\/cards\/(skill-art-[^"]+\.webp)"/);
  T("H14 专属技能卡图已登记且文件在位",
    !!m && fs.existsSync(path.join(__dirname, "../publish/assets/generated/cards", m[1])), m?.[1]);
}

console.log(`终极刀魔严格检查：${pass} PASS / ${reds.length} FAIL`);
if (reds.length) { reds.forEach(r => console.error(`  - ${r}`)); process.exit(1); }
