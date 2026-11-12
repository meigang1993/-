/* 严格检查：卡牌「阵营归属」是否固定、会不会造成永久 / 失去 BUG。
 *
 * 口径：
 *   - 阵营归属 = 这张实体牌属于 ally 共享牌堆还是 enemy 共享牌堆（battle-setup.teamPile）。
 *   - 现状：模板中立，归属完全靠运行时字段 stolenFromUid（原主 uid）在
 *     BattleCards.put / BattleCombatTrail.trailDestination / AbeKarunaBubbleZone.destOf
 *     里反查 unit.side 动态推断；没有不可变的阵营字段。
 *   - 检查：A 模板中立 / B 首次写入固定 / C 跨阵营归还 / D 入堆残留与重洗复用 /
 *     E 原主离场导致阵营漂移（永久占有 / 永久失去）/ F 派生牌继承归属 /
 *     G 战报阵营与真实入堆去向分叉 / H 反向：撤掉阵营级归属后 E3 必须变红。
 *
 * 全部加载 src/original 的真实模块，不写等价实现。REVERT=fix 时源码级撤掉修复。
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const SRC = f => path.join(__dirname, "..", "src", "original", f);
const read = f => fs.readFileSync(SRC(f), "utf8");
const REVERT = process.env.REVERT || "";
let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return !!cond;
};

const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
const ANCHOR_DEST = "window.CardOwnership?.destination?.(b, holder, card) || owner || holder";
const load = (f, src) => {
  let text = src == null ? read(f) : src;
  if (REVERT === "fix" && f === "battle-cards-system.js") {
    const before = text;
    text = text.replace(ANCHOR_DEST, "owner || holder")
      .replace("window.CardOwnership?.fix?.(b, card);", "");
    if (text === before) throw new Error("REVERT=fix 未命中 put 锚点");
  }
  return vm.runInContext(text, ctx, { filename: f });
};
ctx.GameRandom = { shuffle: list => [...list], sample: list => list[0] };
ctx.BattleLog = { add: () => {} };
ctx.BattleLines = { skill: () => {} };
ctx.BattleDrawPacker = { packDrawGroup: () => 0, packDiscardGroup: () => 0 };
ctx.SakuraRisaSkills = { drawRecipient: () => null, onDrawRedirected: () => {} };
ctx.RuinsRelicEffects = { afterDraw: () => {} };
ctx.BattleStatusCards = { sync: () => {} };
ctx.UICommon = { activeSkillName: () => "" };
ctx.GameEconomy = { shop: { defaultCardPrice: 500 } };
ctx.GameData = { missions: [], baseDeck: [], eliteCards: [] };

// ---- 真实模块（顺序与 publish-bundles.json 一致）----
load("data-cards.js");
load("card-utils.js");
load("card-ownership.js");
load("battle-pile-stats.js");
load("battle-cards-system.js");
load("battle-combat-trail.js", read("battle-combat-trail.js"));
load("battle-card-cleanup.js");
const CardUtils = ctx.CardUtils, BattleCards = ctx.BattleCards, PileStats = ctx.BattlePileStats;
const Trail = ctx.BattleCombatTrail({ allUnits: b => [...(b.allies || []), ...(b.enemies || [])] });
const Cleanup = ctx.BattleCardCleanup;

const card = (name, extra = {}) => ({
  name, type: "slash", suit: "♠", power: 0, scale: "attack", ...extra,
});
function teamPile(cards) {
  return { deck: [...cards], discard: [], consumed: [], shuffleCount: 0 };
}
function unit(uid, side, pile, extra = {}) {
  return {
    uid, ref: uid, name: uid, side, hp: 100, maxHp: 100, hand: [],
    pileStats: pile, deck: pile.deck, discard: pile.discard, consumed: pile.consumed,
    ...extra,
  };
}
function battle(allyPile, enemyPile, opts = {}) {
  const a0 = unit("a0", "ally", allyPile), a1 = unit("a1", "ally", allyPile);
  const e0 = unit("e0", "enemy", enemyPile), e1 = unit("e1", "enemy", enemyPile);
  const b = { allies: [a0, a1], enemies: [e0, e1], animQueue: [], played: [], ...opts };
  return { b, a0, a1, e0, e1 };
}
// 真实 BattleSession.draw（注入最小 deps），用于验证重洗后摸出的牌是否带残留标记
const sessionDeps = {
  setup: { shuffle: list => [...list], create: async () => ({ allies: [], enemies: [] }) },
  cleanupBattlePrompts: () => {}, clearBattleLog: () => {}, record: () => {},
  wait: async () => {}, waitEffects: async () => {}, isCurrentState: () => true,
  initialDrawCount: () => 0, revealPending: () => {}, nextAnim: () => "x",
  getCombat: () => ({}), getAdvanceToInput: () => async () => {},
};
ctx.BattleSessionSettlement = () => async () => {};
load("battle-session.js");
const Session = ctx.BattleSession(sessionDeps);

// ================= A 模板中立 =================
console.log("\n--- A 卡牌模板是否带固定阵营归属 ---");
{
  const names = ["杀（普攻）", "闪", "偷窃", "火杀"];
  const samples = names.map(n => ctx.GameDataCards.baseDeck.find(c => c.name === n)
    || ctx.GameDataCards.eliteCards.find(c => c.name === n)).filter(Boolean);
  const ownerKeys = ["side", "camp", "faction", "ownerUid", "originSide", "stolenFromUid", "owner"];
  const leaked = samples.flatMap(c => ownerKeys.filter(k => k in c).map(k => `${c.name}.${k}`));
  T("A1 模板牌不含任何阵营/归属字段（归属未固定在牌上）", leaked.length === 0, { leaked });
  T("A2 模板牌可自由复制进不同阵营牌堆", samples.every(c => !Object.isFrozen(c)));
  const src = read("data-cards.js");
  T("A3 cardFields 定义里确实没有 side/camp/faction/origin",
    !/\b(side|camp|faction|originSide|ownerUid)\s*:/.test(src.slice(src.indexOf("const cardFields"), src.indexOf("const makeDeck"))));
}

// ================= B 首次写入即固定 =================
console.log("\n--- B stolenFromUid 的写入语义 ---");
{
  const src = read("battle-card-hand-interactions.js");
  T("B1 偷牌路径用 if (!card.stolenFromUid) 只写一次",
    /if\s*\(!stolen\.stolenFromUid\)\s*stolen\.stolenFromUid\s*=/.test(src));
  const all = ["ace-skills.js", "bakar-core-skills.js", "battle-card-tactics.js",
    "catherine-skills.js", "guest-aileng-skills.js", "hitwell-skills.js",
    "miller-skills.js", "nonoka-new-moon-skills.js", "orc-drone-skills.js",
    "ruins-witherer-skills.js", "underwater-train-target-actions.js",
    "witherer-relic-skills.js", "cadicis-responsibility.js",
    "hoshino-kaiichi-share-resolution.js"];
  const guarded = all.filter(f => /if\s*\(![\w.]*\.?stolenFromUid\)/.test(read(f)));
  T("B2 全库转交路径一致使用「已有则不覆盖」守卫", guarded.length >= 12,
    { guarded: guarded.length, total: all.length });
  const c = card("杀（普攻）", { stolenFromUid: "e0" });
  if (!c.stolenFromUid) c.stolenFromUid = "a0";
  T("B3 二次转交不覆盖首次归属（阵营归属固定）", c.stolenFromUid === "e0", { uid: c.stolenFromUid });
}

// ================= C 跨阵营归还 =================
console.log("\n--- C 偷来的牌结算后进原主阵营共享堆 ---");
{
  const ap = teamPile([card("我方牌")]), ep = teamPile([]);
  const { b, a0 } = battle(ap, ep);
  const stolen = card("偷来的敌方牌", { stolenFromUid: "e0" });
  BattleCards.put(b, a0, stolen, "discard", { skipAnim: true });
  T("C1 敌方牌归还敌方共享弃牌堆", ep.discard.includes(stolen),
    { enemyDiscard: ep.discard.length, allyDiscard: ap.discard.length });
  T("C2 我方共享堆没有被塞进敌方牌", ap.discard.length === 0);
  const own = card("我方自己的牌");
  BattleCards.put(b, a0, own, "discard", { skipAnim: true });
  T("C3 未被偷的牌正常回我方堆", ap.discard.includes(own));
  T("C4 首次结算把 uid 归属固化成不可变阵营",
    stolen.originSide === "enemy", { originSide: stolen.originSide });
}

// ================= D 入堆残留 / 重洗复用 =================
console.log("\n--- D 归属标记是否在牌堆循环里永久残留 ---");
{
  const ap = teamPile([]), ep = teamPile([]);
  const { b, a0 } = battle(ap, ep);
  const stolen = card("循环牌", { stolenFromUid: "e0" });
  BattleCards.put(b, a0, stolen, "discard", { skipAnim: true });
  const inPile = ep.discard[0];
  T("D1 入堆对象仍带 stolenFromUid（未被结算清除）",
    inPile?.stolenFromUid === "e0", { inPile: inPile && Object.keys(inPile) });
  T("D2 入堆对象与手牌原对象是同一引用（revertConvertedCopy 无快照时返回原对象）",
    inPile === stolen);
  const cleaned = CardUtils.clean(stolen);
  T("D3 CardUtils.clean 不剥除 stolenFromUid（普通字段，非下划线运行时键）",
    cleaned.stolenFromUid === "e0", { cleaned: Object.keys(cleaned) });
  Cleanup.clearPlayFlags(stolen);
  T("D4 clearPlayFlags 也不清 stolenFromUid", stolen.stolenFromUid === "e0");
  // 重洗：弃牌堆 -> 摸牌堆（同一批对象）。原地清空，保持 unit.deck 与 pile.deck 同一引用。
  ep.deck.length = 0;
  PileStats.reshuffle({ pileStats: ep });
  T("D5 reshuffle 直接 splice 复用同一批牌对象，标记仍在",
    ep.deck.includes(stolen) && stolen.stolenFromUid === "e0",
    { deck: ep.deck.length, discard: ep.discard.length });
  const e0 = b.enemies[0];
  const got = Session.draw(e0, 1, b);
  T("D6 真实 BattleSession.draw 摸出的牌仍带旧归属标记",
    got.length === 1 && got[0] === stolen && got[0].stolenFromUid === "e0",
    { drawn: got.length, marker: got[0]?.stolenFromUid });
  T("D7 本次是敌方正常摸牌（无跨阵营转交），标记却指向上一次转交",
    got[0]?.stolenFromUid === "e0" && got[0]?._pendingDraw === true);
  T("D8 固化后的阵营字段随重洗复用保留（固定，不丢失）",
    stolen.originSide === "enemy", { originSide: stolen.originSide });
}

// ================= E 原主离场：阵营漂移 =================
console.log("\n--- E 原主离场后 put 的去向 ---");
{
  const ap = teamPile([]), ep = teamPile([]);
  const { b, a0 } = battle(ap, ep);
  const stolen = card("敌方孤儿牌", { stolenFromUid: "e0" });
  // 模拟原主离场（从 enemies 移除），同阵营仍有其他单位与共享牌堆
  b.enemies = [b.enemies[1]];
  BattleCards.put(b, a0, stolen, "discard", { skipAnim: true });
  const drifted = ap.discard.includes(stolen);
  T("E1 原主离场时（未固化）现状会回落 holder：敌方牌落进我方堆", drifted,
    { allyDiscard: ap.discard.length, enemyDiscard: ep.discard.length });
  const putSrc = read("battle-cards-system.js");
  T("E2 阵营级归属模块存在且 put 已接入 destination",
    /CardOwnership\?\.destination/.test(putSrc) && /originSide/.test(read("card-ownership.js")));
  // 已结算过一次的牌（originSide 已固化）即便原主离场，仍归还正确阵营堆
  const fixed = card("敌方孤儿牌（阵营固定）", { stolenFromUid: "e0", originSide: "enemy" });
  BattleCards.put(b, a0, fixed, "discard", { skipAnim: true });
  T("E3 修复态：原主离场仍归还敌方共享堆，不漂移",
    ep.discard.includes(fixed) && !ap.discard.includes(fixed),
    { allyDiscard: ap.discard.length, enemyDiscard: ep.discard.length, mode: REVERT || "none" });
}

// ================= F 派生牌继承归属 =================
console.log("\n--- F 派生 / 复制牌是否继承归属 ---");
{
  const base = card("杀（普攻）", { stolenFromUid: "e0", originSide: "enemy" });
  const spread = { ...base, sweep: true };
  const cleaned = CardUtils.clean(base, { virtual: true });
  const copied = CardUtils.copyPlayable(base);
  T("F1 展开派生牌继承 stolenFromUid", spread.stolenFromUid === "e0");
  T("F2 CardUtils.clean 派生牌继承 stolenFromUid", cleaned.stolenFromUid === "e0");
  T("F3 copyPlayable 走模板分支时生成干净的牌（不继承 uid）",
    !copied.stolenFromUid, { copied: Object.keys(copied) });
  const c = card("自定义派生", { stolenFromUid: "e0", originSide: "enemy" });
  const copied2 = CardUtils.copyPlayable(c);
  T("F4 copyPlayable 走 clean 分支时继承归属（固定阵营也一起继承）",
    copied2.stolenFromUid === "e0" && copied2.originSide === "enemy");
}

// ================= G 战报阵营与真实去向分叉 =================
console.log("\n--- G 战报阵营与入堆去向一致性 ---");
{
  const ap = teamPile([]), ep = teamPile([]);
  const { b, a0 } = battle(ap, ep);
  const c = card("分叉牌", { stolenFromUid: "e0" });
  const snap = Trail.snapshot(c, a0, b);
  T("G1 owner 在场时战报 _destinationSide = enemy", snap._destinationSide === "enemy",
    { side: snap._destinationSide });
  b.enemies = [b.enemies[1]];
  const snap2 = Trail.snapshot(c, a0, b);
  BattleCards.put(b, a0, c, "discard", { skipAnim: true });
  T("G2 owner 离场且未固化时，战报与入堆去向同为 ally（现状一致漂移）",
    snap2._destinationSide === "ally" && ap.discard.includes(c),
    { side: snap2._destinationSide, allyDiscard: ap.discard.length });
  const fixed = card("分叉牌（已固化）", { stolenFromUid: "e0", originSide: "enemy" });
  const snap3 = Trail.snapshot(fixed, a0, b);
  BattleCards.put(b, a0, fixed, "discard", { skipAnim: true });
  T("G3 修复态：阵营固定后战报仍为 enemy，入堆也回敌方堆（不再分叉）",
    snap3._destinationSide === "enemy" && ep.discard.includes(fixed),
    { side: snap3._destinationSide, enemyDiscard: ep.discard.length, mode: REVERT || "none" });
}

// ================= H 反向验证 =================
console.log("\n--- H 反向：撤掉阵营级归属后修复态断言必须变红 ---");
if (REVERT === "fix") {
  const loaded = String(ctx.BattleCards.put);
  T("H1 反向态实际加载的 put 不含 CardOwnership.destination",
    !/CardOwnership/.test(loaded), { loaded: loaded.slice(0, 160) });
  T("H2 反向态 C4 / D8 / E3 / G3 精准打红（共 4 项）",
    pass === total - 4, { pass, total });
}

console.log(`\nRESULT ${pass}/${total}`);
if (pass !== total && REVERT !== "fix") process.exitCode = 1;
