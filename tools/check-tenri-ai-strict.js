// 天日国鹰7研究所 · 4 只怪 AI 逻辑 + 技能描述一致性严格检查
// 真实加载 BattleAI.choose 全链（helpers / tactics / slash-planner / skill-planner /
// TenriInstituteAI），验证 4 条 AI 行为确实生效，并校验描述与接线同步。
// REVERT=<组> 对真实源码做替换后重载，要求对应组精准打红、其它组保持绿。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const DIR = path.join(ROOT, "src", "original");
const REVERT = process.env.REVERT || "";
const anyRaw = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");
const raw = n => fs.readFileSync(path.join(DIR, n), "utf8");

const REPL = {
  // 撤掉「先蓄力」（突击队 + 清理机器人两处同样文本，全局替换）
  charge: ["tenri-institute-ai.js",
    "      if (!actor.charge && charge) return { card: charge, target: actor };\n",
    "", true],
  // 撤掉「打手牌数最少」
  target: ["tenri-institute-ai.js",
    "      const target = h.topBy(aliveFoes, x => -h.visible(x) - x.hp / 1e6);",
    "      const target = h.topBy(aliveFoes, x => -x.hp);"],
  // 撤掉清理机器人全体牌分支
  group: ["tenri-institute-ai.js",
    '    if (isAi(actor, "tenri_railgun")) {\n      const groups = groupCards(hand);\n      if (!groups.length) return null;',
    '    if (isAi(actor, "tenri_railgun")) {\n      const groups = [];\n      if (!groups.length) return null;'],
  // 撤掉防爆队保留闪
  dodge: ["tenri-institute-ai.js",
    "    return (playable || []).filter(c => !isDodgeCard(c));",
    "    return playable;"],
  // 撤掉食尸鬼抢先输出
  ghoul: ["tenri-institute-ai.js",
    '    if (isAi(actor, "tenri_ghoul")) {\n      const slashes = hand.filter(c => u.isKillCard(c) && !c.virtual);',
    '    if (isAi(actor, "tenri_ghoul")) {\n      const slashes = [];'],
  // 撤掉 BattleAI 接线
  wire: ["battle-ai.js",
    "      () => window.TenriInstituteAI?.aiMove?.(\n        window.state, actor, team, foes, rawHand, canPlay, context),\n",
    ""],
  // 撤掉 aiHand 链式应用
  hand: ["battle-ai.js",
    "    const hand = window.TenriInstituteAI?.aiHand?.(\n      actor, guardHand, context) || guardHand;",
    "    const hand = guardHand;"],
  // 撤掉新文案
  text: ["data-tenri-institute-enemies.js",
    '锁定技，当我方其他角色成为单体【杀】牌的目标时，若该角色没有此技能，将此【杀】牌的目标转移给你。',
    '锁定技，当其他我方角色成为实体单体【杀】的目标时，若该角色没有此技能，此【杀】的目标转移给你。'],
  // 撤掉 aiLogic 登记
  aiLogic: ["data-tenri-institute-enemies.js",
    'ai: "tenri_assault", aiLogic: ',
    'ai: "tenri_assault", /* aiLogic: '],
};
const EXPECT = {
  charge: ["A", "C"], target: ["A"], group: ["C"], dodge: ["B"],
  ghoul: ["D"], wire: ["A", "C", "D"], hand: ["B"], text: ["E"], aiLogic: ["E"],
};
const patched = n => {
  let s = raw(n);
  const r = REPL[REVERT];
  if (r && r[0] === n) {
    if (!s.includes(r[1])) throw new Error(`REVERT=${REVERT} 目标未命中: ${r[1].slice(0, 60)}`);
    s = r[3] ? s.split(r[1]).join(r[2]) : s.replace(r[1], r[2]);
  }
  return s;
};
const load = n => vm.runInThisContext(patched(n), { filename: n });

const results = [];
const check = (g, n, ok, d = "") => results.push({ g, n, ok: !!ok, d });

// ---------- 最小但真实的 BattleAI 环境 ----------
global.window = global;
window.GameDataCards = { cardCodex: [], baseDeck: [], eliteCards: [] };
window.GameRandom = {
  sample: list => (Array.isArray(list) && list.length ? list[0] : null),
  value: () => 0.5, int: n => n,
};
window.BattleLog = { add: () => {} };
window.BattleLines = { skill: () => {} };
window.BattleAIConfig = { HEAL_THRESHOLD: 0.7 };
window.BattleStatusCards = { isStatus: () => false, has: () => false, sync: () => {} };
window.RelicSystem = { hasEquipped: () => false };
window.BattleAISkillMoves = { skillMove: () => null };
window.CardUtils = null;
[
  "card-utils.js", "battle-ai-helpers.js", "battle-ai-tactics.js",
  "battle-ai-slash-planner.js", "battle-ai-skill-helpers.js",
  "battle-ai-skill-planner.js", "tenri-institute-ai.js", "battle-ai.js",
].forEach(load);

const AI = window.TenriInstituteAI;
const T = window.BattleAI;
const slash = (name, extra = {}) => ({ name, type: "slash", suit: "♠", ...extra });
const chargeCard = () => ({ name: "蓄力", type: "tactic", charge: 1, targetless: true, suit: "♠" });
const unit = (ai, side, hp, hand = [], extra = {}) => ({
  uid: ai + "_" + Math.random().toString(36).slice(2), ai, id: ai, side,
  hp, maxHp: hp, hand, stats: { attack: 20, magic: 15, speed: 20, handLimit: 4 },
  statuses: [], skills: [], block: 0, intent: 3, battleRelics: [], ...extra,
});
const canPlay = (actor, c) => !!c && c.type !== "response" && c.type !== "status"
  && !(window.CardUtils.isKillCard(c) && !c.virtual && (actor.intent || 0) <= 0);
const choose = (actor, foes, team) => {
  const battle = { allies: foes, enemies: team || [actor], locked: false };
  window.state = { battle, settings: {} };
  return T.choose(battle, actor, canPlay);
};

// ---------- A 机械警卫突击队 ----------
{
  const f1 = unit("p1", "ally", 100, [slash("杀"), slash("杀"), slash("杀"), slash("杀"), slash("杀")]);
  const f2 = unit("p2", "ally", 100, [slash("杀")]);
  const f3 = unit("p3", "ally", 100, [slash("杀"), slash("杀"), slash("杀")]);
  const a = unit("tenri_assault", "enemy", 260,
    [chargeCard(), slash("杀（普攻）", { power: 0 }), slash("火杀", { fire: true })]);
  const first = choose(a, [f1, f2, f3]);
  check("A", "A1 优先使用【蓄力】（只叠一层）",
    first && first.card?.charge === 1 && first.target === a,
    JSON.stringify(first && { card: first.card?.name }));
  a.charge = 1;
  const second = choose(a, [f1, f2, f3]);
  check("A", "A2 蓄力后集中用【杀】，目标为手牌数最少的敌方",
    second && window.CardUtils.isKillCard(second.card)
    && second.target === f2,
    JSON.stringify(second && { card: second.card?.name, target: second.target?.uid, want: f2.uid }));
  // 无杀牌时不抢决策
  const noKill = unit("tenri_assault", "enemy", 260, [chargeCard()]);
  check("A", "A3 手里没有【杀】时不白打蓄力、交回默认 AI",
    choose(noKill, [f1, f2, f3]) === null || !window.CardUtils.isKillCard(
      (choose(noKill, [f1, f2, f3]) || {}).card));
}

// ---------- B 机械警卫防爆队 ----------
{
  const dodge = { name: "闪", type: "response", suit: "♦" };
  const g = unit("tenri_guard", "enemy", 300, [dodge, slash("杀（普攻）")]);
  const f = unit("p1", "ally", 100, []);
  check("B", "B1 aiHand 剥掉【闪】/响应牌，保留其它正常牌", (() => {
    const kept = AI.aiHand(g, [dodge, g.hand[1]]);
    return kept.length === 1 && kept[0] === g.hand[1] && !kept.includes(dodge);
  })());
  check("B", "B2 aiMove 返回 null，不抢默认决策",
    AI.aiMove(window.state, g, [g], [f], g.hand, canPlay, {}) === null);
  const move = choose(g, [f]);
  check("B", "B3 正常使用卡牌（不会把【闪】打出去）",
    move === null || move.card?.name !== "闪",
    JSON.stringify(move && { card: move.card?.name }));
  check("B", "B4 自动响应链不限制目标阵营，转移来的杀可用【闪】抵消", (() => {
    const r = raw("battle-damage-resolution.js");
    const d = raw("battle-dodge-deflect.js");
    return /target\.hand\.filter\(candidate => canDodge\(effectiveCard, candidate\)\)/.test(r)
      && /responseCards\[0\]/.test(r)
      && /function autoDodge\(state, actor, target, amount, source, card, response\)/.test(d);
  })());
  check("B", "B5 非防爆队不受 aiHand 影响", (() => {
    const a = unit("tenri_assault", "enemy", 260, [dodge]);
    return AI.aiHand(a, [dodge]) === null;
  })());
  check("B", "B6 BattleAI 确实把 playable 手牌链式交给 Tenri aiHand",
    /const guardHand = window\.GuardKellySkills\?\.aiHand/.test(patched("battle-ai.js"))
    && /const hand = window\.TenriInstituteAI\?\.aiHand\?\.\(\s*actor, guardHand, context\)/
      .test(patched("battle-ai.js")));
}

// ---------- C 清理机器人 ----------
{
  const sweep = slash("机枪扫杀", { sweep: true, targetless: true, scale: "attack" });
  const single = slash("杀（普攻）");
  const r = unit("tenri_railgun", "enemy", 220, [chargeCard(), sweep, single]);
  const foes = [unit("p1", "ally", 100), unit("p2", "ally", 100)];
  const first = choose(r, foes);
  check("C", "C1 优先使用【蓄力】", first && first.card?.charge === 1,
    JSON.stringify(first && { card: first.card?.name }));
  r.charge = 1;
  const second = choose(r, foes);
  check("C", "C2 随后优先【机枪扫杀】等全体攻击牌而非单体杀",
    second && second.card === sweep && second.target === r,
    JSON.stringify(second && { card: second.card?.name }));
  const invasion = { name: "魔王军入侵", type: "tactic", targetless: true,
    demonInvasion: true, hybridAttack: true, attackType: "magic" };
  const r2 = unit("tenri_railgun", "enemy", 220, [invasion, single]);
  check("C", "C3 无 sweep 的【魔王军入侵】也按全体牌优先",
    (() => { const m = choose(r2, foes); return m && m.card === invasion; })(),
    JSON.stringify(choose(r2, foes) && { card: choose(r2, foes).card?.name }));
  const noGroup = unit("tenri_railgun", "enemy", 220, [single]);
  check("C", "C4 没有全体牌时交回默认 AI",
    (() => { const m = choose(noGroup, foes); return m === null || m.card === single; })());
}

// ---------- D 无垢食尸鬼 ----------
{
  const heal = { name: "物资补给", type: "tactic", teamHealPct: 20, targetless: true };
  const kill = slash("杀（普攻）", { power: 0 });
  const mate = unit("mate", "enemy", 30, []);
  const gh = unit("tenri_ghoul", "enemy", 60, [heal, kill], { maxHp: 200 });
  const foes = [unit("p1", "ally", 100)];
  const move = choose(gh, foes, [gh, mate]);
  check("D", "D1 悍不畏死：跳过治疗牌，直接出最高伤害【杀】",
    move && move.card === kill && move.target,
    JSON.stringify(move && { card: move.card?.name }));
  const noKill = unit("tenri_ghoul", "enemy", 60, [heal], { maxHp: 200 });
  check("D", "D2 没有【杀】时交回默认 AI（不强行抢决策）",
    (() => { const m = choose(noKill, foes, [noKill, mate]); return m === null || m.card === heal; })());
}

// ---------- E 描述 / AI 登记 / 接线一致性 ----------
{
  const data = patched("data-tenri-institute-enemies.js");
  const texts = [
    "锁定技，当你使用实体单体【杀】指定目标时，若你手牌中的【杀】牌数量大于该目标角色，你使用的此【杀】不可响应。你的【杀】牌数每超过该目标角色1张，伤害+100%。",
    "锁定技，当我方其他角色成为单体【杀】牌的目标时，若该角色没有此技能，将此【杀】牌的目标转移给你。",
    "锁定技，你使用的全体类实体牌不可被响应，且造成的伤害翻倍。",
    "锁定技，当你死亡后，下一个回合开始时若我方其他角色存活，你复活并恢复所有生命值。",
  ];
  check("E", "E1 数据表 4 段公开描述逐字等于用户新稿",
    texts.every(t => data.includes(t)));
  check("E", "E2 数据表 4 只怪都登记 aiLogic 字段且与用户原稿一致",
    ["tenri_assault", "tenri_guard", "tenri_railgun", "tenri_ghoul"].every(id =>
      data.includes(`ai: "${id}", aiLogic: "`))
    && ["优先使用蓄力，随后集中使用【杀】牌攻击手牌数最少的敌方角色。",
      "正常使用卡牌，优先保留【闪】用于响应转移到自身的伤害。",
      "优先使用蓄力，随后优先使用【机枪扫杀】等全体攻击牌。",
      "悍不畏死，优先使用高伤害的【杀】牌进行输出。"].every(t => data.includes(t)));
  const docs = ["docs/05-怪物与怪物技能与饰品.txt",
    "docs/12-新副本素材-废墟沙城.txt",
    "docs/reference/天日国鹰7研究所怪物设计.md"];
  check("E", "E3 三份文档同步新文案与 4 条 AI 逻辑",
    docs.every(p => {
      const s = anyRaw(p);
      return texts.every(t => s.includes(t))
        && s.includes("优先使用蓄力，随后集中使用【杀】牌攻击手牌数最少的敌方角色。")
        && s.includes("悍不畏死，优先使用高伤害的【杀】牌进行输出。");
    }));
  const ai = raw("battle-ai.js");
  check("E", "E4 BattleAI 接线：aiMove 在 characterMoves 最前、aiHand 链式应用",
    /const characterMoves = \[[\s\S]{0,220}TenriInstituteAI\?\.aiMove/.test(ai)
    && ai.indexOf("TenriInstituteAI?.aiMove") < ai.indexOf("BattleAITactics.tacticMove")
    && /TenriInstituteAI\?\.aiHand/.test(ai)
    && /GuardKellySkills\?\.aiHand/.test(ai));
  check("E", "E5 bundle / runtime-globals 登记新模块", (() => {
    const bundles = JSON.parse(anyRaw("tools/publish-bundles.json"));
    return Object.values(bundles).flat().includes("tenri-institute-ai.js")
      && raw("runtime-globals.js").includes('"TenriInstituteAI"');
  })());
  check("E", "E6 两处文案/实现差异已按新稿对齐（单体【杀】含虚拟 / 只在复活瞬间判队友）",
    /isSingleKillCard/.test(raw("tenri-guard-skills.js"))
    && !/isEntitySingleKill/.test(raw("tenri-guard-skills.js"))
    && raw("tenri-ghoul-revival.js").split("teamAlive(state, unit)").length - 1 === 2
    && !/preventDeath[\s\S]{0,500}teamAlive/.test(raw("tenri-ghoul-revival.js"))
    && /TenriInstituteSkills\?\.shouldHoldRevival/.test(raw("sakura-risa-skills.js")));
  check("E", "E7 第五部分开发建议已落地（14 层 / 5 倍经验 / 25 级 / 1.3 成长 / 掉落复用）",
    /layers: 14/.test(raw("data-tenri-institute.js"))
    && /tenri_institute: 5/.test(raw("character-progression.js"))
    && /const maxLevel = 25/.test(raw("character-progression.js"))
    && /const growthScale = 1\.3/.test(raw("character-progression.js")));
}

const failed = results.filter(r => !r.ok);
if (REVERT) {
  const want = EXPECT[REVERT] || [];
  const own = failed.filter(r => want.includes(r.g)).length;
  const other = failed.filter(r => !want.includes(r.g)).length;
  console.log(`REVERT=${REVERT} ${own > 0 && other === 0 ? "OK" : "IMPRECISE"} own=${own} other=${other}`);
  failed.forEach(r => console.log(`  ❌ ${r.g} ${r.n} ${r.d}`));
  process.exit(own > 0 && other === 0 ? 0 : 1);
}
results.forEach(r => console.log(`  ${r.ok ? "✅" : "❌"} ${r.g} ${r.n}${r.d ? " — " + r.d : ""}`));
console.log(`RESULT ${results.length - failed.length}/${results.length} · 反向组 ${Object.keys(REPL).join("/")}`);
process.exit(failed.length ? 1 : 0);
