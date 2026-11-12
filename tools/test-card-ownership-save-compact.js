/* 严格检查：originSide 是否真的「带进主存档压缩」，且读档后不漂移。
 *
 * 背景：store-save-schema.cardIdentity 把牌压成 {name,suit}，rebuildCard 从模板重建。
 * 牌上固化的阵营归属 originSide 若被压缩抹掉，读档后 stolenFromUid 也丢失，
 * CardOwnership 就找不到原主、入堆回落 holder —— 敌方牌被我方永久占有。
 *
 * 覆盖：A 压缩保留 / B 读档重建 / C 校验与容量 / D 三个入堆·战报·泡泡挂点 /
 *       E 两条真实写盘路径端到端（无 checkpoint 压缩路径 / 有 checkpoint 整块保留）/
 *       G 局外归属隔离与战报同源 / H 战斗瞬时牌引用统一收口（动画队列 / 挂起·恢复对象 /
 *       展示快照，两条写盘路径都不残留运行时 uid）/
 *       F 源码级反向验证 REVERT=compact|rebuild|scope|trail|transient|checkpoint|mimic 精准打红。
 *
 * 全部加载 src/original 的真实模块；不写等价实现。
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const REVERT = process.env.REVERT || "";
global.window = global;
const SRC = f => fs.readFileSync(path.join(__dirname, "..", "src", "original", f), "utf8");
let pass = 0, total = 0;
const failed = [];
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  else failed.push((name.match(/^[A-Z]\d+[a-z]?/) || [name])[0]);
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return !!cond;
};

const load = (f) => {
  let text = SRC(f);
  if (REVERT === "compact" && f === "store-save-schema.js") {
    const before = text;
    text = text.replace(
      "    if (validOriginSide(card?.originSide)) identity.originSide = card.originSide;\n", "");
    if (text === before) throw new Error("REVERT=compact 未命中 cardIdentity 锚点");
  }
  if (REVERT === "rebuild" && f === "store-save-schema.js") {
    const before = text;
    text = text.replace(
      "    if (validOriginSide(card.originSide)) rebuilt.originSide = card.originSide;\n", "");
    if (text === before) throw new Error("REVERT=rebuild 未命中 rebuildCard 锚点");
  }
  if (REVERT === "scope" && f === "store-compact.js") {
    const before = text;
    text = text.replace(/, false\)/g, ")");
    if (text === before) throw new Error("REVERT=scope 未命中局外剥除锚点");
  }
  if (REVERT === "trail" && f === "card-ownership.js") {
    const before = text;
    text = text.replace(
      "    return valid(owner?.side) || sideOf(battle, card)\n"
        + "      || valid(actor?.side) || \"ally\";",
      "    return sideOf(battle, card) || valid(actor?.side) || \"ally\";");
    if (text === before) throw new Error("REVERT=trail 未命中战报同源锚点");
  }
  if (REVERT === "mimic" && f === "store-compact.js") {
    const before = text;
    text = text.replace(
      '"kaiichiShareQueue", "reactionQueue", "pendingTargetUids",',
      '"kaiichiShareQueue", "reactionQueue", "mimicLinks", "pendingTargetUids",');
    if (text === before) throw new Error("REVERT=mimic 未命中 transientArrayKeys 锚点");
  }
  if (REVERT === "transient" || REVERT === "checkpoint") {
    if (f === "store-compact.js" && REVERT === "transient") {
      const before = text;
      text = text.replace("      stripBattleTransientCards(data.battle);\n", "");
      if (text === before) throw new Error("REVERT=transient 未命中 compactSaveData 收口锚点");
    }
    if (f === "store-main-snapshot.js") {
      const before = text;
      text = text.replace("      window.GameStoreCompact.stripBattleTransientCards(battle);\n", "");
      if (text === before) throw new Error(`REVERT=${REVERT} 未命中 checkpoint 收口锚点`);
    }
  }
  return vm.runInThisContext(text, { filename: f });
};

const template = (name) => ({ name, type: "slash", suit: "♠", power: 1, scale: "attack" });
global.GameData = {
  baseDeck: [template("杀（普攻）"), template("闪"), template("杀")],
  eliteCards: [], missions: [], difficulties: {}, testEnemies: [],
};
global.BattleLog = { add: () => {} };
global.BattleDrawPacker = { packDrawGroup: () => 0, packDiscardGroup: () => 0 };
global.BattleStatusCards = { sync: () => {} };
global.UICommon = { activeSkillName: () => "" };

// 真实模块链（顺序与 tools/publish-bundles.json 的 startup 一致）
load("store-save-schema.js");
load("store-save-validation.js");
load("store-save-limits.js");
load("store-compact.js");
load("card-ownership.js");
load("battle-cards-system.js");
load("battle-combat-trail.js");
load("abe-karuna-bubble-zone.js");
load("store-main-snapshot.js");
// 真实检查点状态机（用既有 fixture 的加载器与战斗状态构造）
const fixtures = require("./battle-resume-save-fixtures.js");
fixtures.loadCheckpointCore();

const Schema = global.GameStoreSaveSchema;
const Compact = global.GameStoreCompact;
const Limits = global.GameStoreSaveLimits;
const Ownership = global.CardOwnership;
const BattleCards = global.BattleCards;
const Trail = global.BattleCombatTrail({
  allUnits: b => [...(b.allies || []), ...(b.enemies || [])],
});
const Bubble = global.AbeKarunaBubbleZone;
const meta = {
  clone: value => JSON.parse(JSON.stringify(value)),
  version: () => 0,
  reserveVersion() {},
};
const Snapshot = global.GameStoreMainSnapshot({ meta });

const CARD = () => ({
  name: "杀（普攻）", type: "slash", suit: "♠", power: 1, scale: "attack",
});
const pile = () => ({ deck: [], discard: [], consumed: [], shuffleCount: 0 });
const unit = (uid, side, shared) => ({
  uid, name: uid, side, hp: 100, hand: [], pileStats: shared,
  deck: shared.deck, discard: shared.discard, consumed: shared.consumed,
});
function landing(card) {
  const ap = pile(), ep = pile();
  const a0 = unit("a0", "ally", ap), e0 = unit("e0", "enemy", ep);
  const b = { allies: [a0], enemies: [e0], animQueue: [], played: [] };
  BattleCards.put(b, a0, card, "discard", { skipAnim: true });
  return { ally: ap.discard.length, enemy: ep.discard.length, b, a0 };
}
function savedState(checkpoint) {
  const st = fixtures.battleState(1);
  st.deck = []; st.shopCards = []; st.chars = [];
  st.bounties = []; st.pendingBountyRewards = [];
  const c = { ...CARD(), originSide: "enemy" };
  st.battle.allies[0].hand = [c];
  st.battle.allies[0].pileStats.deck = [{ ...c }];
  if (checkpoint) {
    st.battle.resumeCheckpoint = { version: 3, turn: 1, sequence: 1 };
    st.battle.checkpointRevision = 1;
  }
  return st;
}

// ================= A 压缩 =================
console.log("\n--- A cardIdentity / compactSaveData 是否带 originSide ---");
{
  const plain = CARD();
  const owned = { ...CARD(), originSide: "enemy" };
  const bogus = { ...CARD(), originSide: "hacked" };
  T("A1 无归属牌仍严格只压 {name,suit}（旧档口径零变化）",
    JSON.stringify(Schema.cardIdentity(plain)) === JSON.stringify({ name: plain.name, suit: plain.suit }),
    Schema.cardIdentity(plain));
  T("A2 合法 originSide 随牌身份一起压缩",
    Schema.cardIdentity(owned)?.originSide === "enemy", Schema.cardIdentity(owned));
  T("A3 非法 side 不写入压缩结果（防注入）",
    !("originSide" in (Schema.cardIdentity(bogus) || {})), Schema.cardIdentity(bogus));
  const st = savedState(false);
  const compacted = Compact.compactSaveData(meta.clone(st));
  const hand = compacted.battle.allies[0].hand[0];
  const deck = compacted.battle.allies[0].pileStats.deck[0];
  const played = (() => {
    const s = meta.clone(st);
    s.battle.played = [{ ...CARD(), originSide: "enemy" }];
    return Compact.compactSaveData(s).battle.played[0];
  })();
  T("A4 战斗手牌/牌堆/出牌区压缩后都带 originSide",
    hand?.originSide === "enemy" && deck?.originSide === "enemy"
      && played?.originSide === "enemy", { hand, deck, played });
  const cp = Snapshot.finalizeSaveSnapshot(meta.clone(savedState(true)));
  const full = cp.battle.allies[0].hand[0];
  T("A5 checkpoint 路径整块保留 battle（牌仍是完整对象，含归属与运行时字段）",
    full?.originSide === "enemy" && full?.type === "slash" && full?.power === 1, full);
}

// ================= B 读档重建 =================
console.log("\n--- B rebuildCard / repairCard 是否把阵营带回来 ---");
{
  const rebuilt = Schema.rebuildCard({ ...CARD(), originSide: "enemy" });
  T("B1 rebuildCard 重建模板牌后保留 originSide",
    rebuilt?.originSide === "enemy" && rebuilt?.power === 1, rebuilt);
  T("B2 无归属牌重建后不含 originSide",
    !("originSide" in (Schema.rebuildCard(CARD()) || {})), Schema.rebuildCard(CARD()));
  T("B3 非法 side 重建时不写字段",
    !("originSide" in (Schema.rebuildCard({ ...CARD(), originSide: "hacked" }) || {})));
  T("B4 validStoredCard 接受合法归属",
    Schema.validStoredCard({ ...CARD(), originSide: "enemy" }) === true);
  T("B5 validStoredCard 拒绝非法归属（存档不被注入漂移）",
    Schema.validStoredCard({ ...CARD(), originSide: "hacked" }) === false);
  const saved = Schema.cardIdentity({ ...CARD(), originSide: "enemy" });
  const roundTrip = Schema.rebuildCard(JSON.parse(JSON.stringify(saved)));
  T("B6 压缩→JSON→重建闭环后阵营不变",
    roundTrip?.originSide === "enemy", { saved, roundTrip });
  const repairSrc = SRC("store-repairs.js");
  T("B7 StoreRepairs.repairCard 就是 schema.rebuildCard（无第二套口径）",
    /const repairCard = card => schema\.rebuildCard\(card\)/.test(repairSrc));
}

// ================= C 校验 / 容量 / 旧档 =================
console.log("\n--- C 存档校验与体积副作用 ---");
{
  const st = savedState(false);
  T("C1 validateMigrated(压缩前运行时状态) 通过", Limits.validateMigrated(st) === true);
  const data = Compact.compactSaveData(meta.clone(st));
  T("C2 真实 validateRaw(压缩后存档) 通过（新增字段不被校验拒绝）",
    Limits.validateRaw(data) === true);
  const huge = meta.clone(st);
  huge.deck = Array.from({ length: 4096 }, () => ({ ...CARD(), originSide: "enemy" }));
  const hugeData = Compact.compactSaveData(huge);
  const bytes = Limits.serializedBytes(hugeData);
  T("C3 4096 张带归属牌压缩后仍远低于 2MB 硬上限",
    bytes < Limits.limits.bytes && Limits.validateRaw(hugeData) === true,
    { bytes, limit: Limits.limits.bytes });
  const legacy = Compact.compactSaveData({
    chars: [], deck: [CARD()], shopCards: [], bounties: [], pendingBountyRewards: [],
  }).deck[0];
  T("C4 旧档无归属牌仍可重建且通过校验",
    !("originSide" in legacy) && Schema.validStoredCard(legacy) === true
      && Schema.rebuildCard(legacy)?.power === 1, legacy);
  T("C5 未知牌名 / 非法花色仍返回 null（既有语义不变）",
    Schema.cardIdentity({ name: "不存在的牌", suit: "♠" }) === null
      && Schema.cardIdentity({ name: "杀（普攻）", suit: "虚" }) === null);
}

// ================= D 三个挂点（压缩后 uid 丢失，仅靠 originSide） =================
console.log("\n--- D 读档后 uid 丢失时，入堆/战报/泡泡区不漂移 ---");
{
  const restored = { ...CARD(), originSide: "enemy" }; // 模拟读档重建结果
  const l = landing(restored);
  T("D1 put 归还敌方共享弃牌堆", l.enemy === 1, { ally: l.ally, enemy: l.enemy });
  T("D2 我方共享堆没有被塞进敌方牌（不永久占有）", l.ally === 0,
    { ally: l.ally, enemy: l.enemy });
  const snap = Trail.snapshot(restored, l.a0, l.b);
  T("D3 战报 _destinationSide 仍为 enemy（与真实入堆一致）",
    snap._destinationSide === "enemy", { side: snap._destinationSide });
  T("D4 泡泡区 destOf 指向敌方单位",
    Bubble.destOf(l.b, l.a0, restored)?.side === "enemy");
  T("D5 trailSide 直接读不可变归属",
    Ownership.trailSide(l.b, restored, l.a0) === "enemy");
  const plain = landing(CARD());
  T("D6 普通牌（无归属）仍回落 holder，零行为变化",
    plain.ally === 1 && plain.enemy === 0, { ally: plain.ally, enemy: plain.enemy });
}

// ================= E 两条真实写盘路径端到端 =================
console.log("\n--- E finalizeSaveSnapshot 端到端 ---");
{
  // 压缩路径：无稳定 checkpoint → battle 内牌被 cardIdentity 压缩 → 读档必须重建
  const compressed = Snapshot.finalizeSaveSnapshot(meta.clone(savedState(false)));
  const disk1 = JSON.parse(JSON.stringify(compressed));
  const restored1 = Schema.rebuildCard(disk1.battle.allies[0].hand[0]);
  const l1 = landing(restored1);
  T("E1 压缩路径：写盘→读档重建→put 仍归还敌方堆",
    l1.enemy === 1 && l1.ally === 0,
    { saved: disk1.battle.allies[0].hand[0], restored: restored1 && restored1.originSide,
      ally: l1.ally, enemy: l1.enemy });

  // checkpoint 路径：battle 整块摘出、不压缩 → 读档原样挂回，不需要 rebuildCard
  const checkpointed = Snapshot.finalizeSaveSnapshot(meta.clone(savedState(true)));
  const disk2 = JSON.parse(JSON.stringify(checkpointed));
  const restored2 = disk2.battle.allies[0].hand[0];
  const l2 = landing(restored2);
  T("E2 checkpoint 路径：牌完整保留，读档后同样归还敌方堆",
    l2.enemy === 1 && l2.ally === 0 && restored2.originSide === "enemy",
    { ally: l2.ally, enemy: l2.enemy });
  T("E3 两条写盘路径结果一致（阵营不因压缩而漂移）",
    l1.enemy === l2.enemy && l1.ally === l2.ally,
    { compressed: { ally: l1.ally, enemy: l1.enemy },
      checkpoint: { ally: l2.ally, enemy: l2.enemy } });
}

// ================= G 副作用：局外牌跨战斗携带 / 战报分叉 =================
console.log("\n--- G 局外归属隔离与战报同源 ---");
{
  const owned = () => Object.assign(CARD(), { originSide: "enemy", stolenFromUid: "e0" });
  const snap = {
    deck: [owned()],
    shopCards: [{ card: owned(), sold: false }],
    explore: {
      earned: { cards: [owned()] }, lastReward: { cards: [owned()] },
      rewardPopup: { cards: [owned()] },
    },
    bounties: [{ reward: { type: "card", card: owned() } }],
    pendingBountyRewards: [{ reward: { type: "card", card: owned() } }],
    _localPendingRun: { cards: [owned()] },
    pendingRun: { cards: [owned()] },
    _localRunState: { rewards: { r1: { cards: [owned()] } } },
    battle: {
      allies: [{ uid: "a0", side: "ally", hand: [owned()], pileStats: pile() }],
      enemies: [{ uid: "e0", side: "enemy", hand: [], pileStats: pile() }],
      played: [owned()], shownPlayed: [],
    },
  };
  const out = Compact.compactSaveData(snap);
  const outside = [
    ...(out.deck || []),
    ...(out.shopCards || []).map(s => s?.card),
    ...(out.explore?.earned?.cards || []),
    ...(out.explore?.lastReward?.cards || []),
    ...(out.explore?.rewardPopup?.cards || []),
    ...(out.bounties || []).map(x => x?.reward?.card),
    ...(out.pendingBountyRewards || []).map(x => x?.reward?.card),
    ...(out._localPendingRun?.cards || []),
    ...(out.pendingRun?.cards || []),
    ...Object.values(out._localRunState?.rewards || {}).flatMap(x => x?.cards || []),
  ].filter(c => c && typeof c === "object" && "name" in c);
  T("G1 局外牌压缩后全部不带 originSide（跨战斗回到中立）",
    outside.length >= 10 && outside.every(c => !("originSide" in c)),
    { count: outside.length, leaked: outside.filter(c => "originSide" in c).length });
  const inside = [out.battle.allies[0].hand[0], out.battle.played[0]].filter(Boolean);
  T("G2 战斗内牌仍带 originSide（本轮修复不被削弱）",
    inside.length === 2 && inside.every(c => c.originSide === "enemy"),
    { sides: inside.map(c => c.originSide) });
  const disk = JSON.parse(JSON.stringify(out));
  const restored = Schema.rebuildCard(disk.deck[0]);
  const l = landing(restored);
  T("G3 读档后的局外牌在新战斗归我方堆（不永久失去）",
    l.ally === 1 && l.enemy === 0,
    { saved: disk.deck[0], ally: l.ally, enemy: l.enemy });
  const again = Compact.compactSaveData({ deck: [Schema.rebuildCard(disk.deck[0])] });
  T("G4 局外牌二次压缩仍中立且键严格",
    again.deck[0] && !("originSide" in again.deck[0])
      && JSON.stringify(Object.keys(again.deck[0]).sort()) === JSON.stringify(["name", "suit"]),
    again.deck[0]);
  const ap2 = pile(), ep2 = pile();
  const a0 = unit("a0", "ally", ap2), e0 = unit("e0", "enemy", ep2);
  const b2 = { allies: [a0], enemies: [e0], played: [], animQueue: null, log: [] };
  // 读档后 stolenFromUid 丢失，牌又被重新转交给 a0：originSide 仍是首次固化的 enemy
  const c2 = Object.assign(CARD(), { originSide: "enemy", stolenFromUid: "a0" });
  const dest = Ownership.destination(b2, a0, c2);
  const trail = Trail.snapshot(c2, a0, b2);
  T("G5 二次转交：战报阵营与真实入堆去向同源（不分叉）",
    dest === a0 && trail._destinationSide === "ally",
    { destUid: dest && dest.uid, side: trail._destinationSide });
}

// ================= H 三处未压缩列表收口 =================
console.log("\n--- H 战斗瞬时牌引用统一收口（压缩路径 / checkpoint 路径） ---");
{
  // 真实运行态牌：带不可变阵营 + 可变 uid + 动画/免响应标记
  const dirtyCard = () => Object.assign(CARD(), {
    originSide: "enemy", stolenFromUid: "e0",
    _pendingDraw: true, ignoreResponse: true, noIntentCost: true,
  });
  const transientBattle = b => {
    b.animQueue = [
      { type: "gainCards", card: dirtyCard(), cards: [dirtyCard()] },
      { type: "stealCard", card: dirtyCard(), entries: [{ card: dirtyCard() }] },
    ];
    b.shownPlayed = [dirtyCard()];
    b.played = [dirtyCard()];
    b.krowRepeatResume = { actorUid: "a0", card: dirtyCard() };
    b.karunaBubble = { actorUid: "a0", card: dirtyCard() };
    b.karunaBubblePending = { actorUid: "a0", card: dirtyCard() };
    b.opheliaGuard = { actorUid: "a0", card: dirtyCard() };
    b.lastClash = { id: "c1", card: dirtyCard() };
    b.handReveal = { cards: [dirtyCard()] };
    b.thunderHammer = { card: dirtyCard() };
    b.cardResumeQueue = [{ card: dirtyCard() }];
    b.selectedSkillCard = dirtyCard();
    b.mimicLinks = [{ ownerUid: "a0", targetUid: "e0" }];
    return b;
  };
  const runtimeKeys = ["stolenFromUid", "_pendingDraw", "ignoreResponse", "noIntentCost"];
  const collectRuntime = (node, out = []) => {
    if (!node || typeof node !== "object") return out;
    if (Array.isArray(node)) { node.forEach(x => collectRuntime(x, out)); return out; }
    Object.entries(node).forEach(([k, v]) => {
      if (runtimeKeys.includes(k)) out.push(k);
      collectRuntime(v, out);
    });
    return out;
  };
  const transientKeyList = [
    "krowRepeatResume", "karunaBubble", "karunaBubblePending", "opheliaGuard",
    "lastClash", "handReveal", "thunderHammer", "selectedSkillCard",
  ];
  const noTransient = b => transientKeyList.every(k => b[k] == null || b[k] === false)
    && (!Array.isArray(b.cardResumeQueue) || b.cardResumeQueue.length === 0);

  // ---- 压缩路径（无 checkpoint） ----
  const st = savedState(false);
  transientBattle(st.battle);
  const dirtyBytes = Limits.serializedBytes(st.battle);
  const out = Compact.compactSaveData(meta.clone(st));
  T("H1 压缩路径：animQueue / shownPlayed 清空（动画事件内完整牌不进存档）",
    Array.isArray(out.battle.animQueue) && out.battle.animQueue.length === 0
      && Array.isArray(out.battle.shownPlayed) && out.battle.shownPlayed.length === 0,
    { animQueue: out.battle.animQueue?.length, shownPlayed: out.battle.shownPlayed?.length });
  T("H2 压缩路径：所有挂起/恢复对象里的 card 引用一并清除",
    noTransient(out.battle),
    Object.fromEntries(transientKeyList.map(k => [k, !!out.battle[k]])));
  T("H3 压缩路径：played 仍压成 identity 且保留 originSide（既有口径不削弱）",
    out.battle.played?.[0]?.originSide === "enemy"
      && !("type" in (out.battle.played?.[0] || {}))
      && JSON.stringify(Object.keys(out.battle.played[0]).sort())
        === JSON.stringify(["name", "originSide", "suit"]),
    { played: out.battle.played, battleKeys: Object.keys(out.battle) });
  T("H4 压缩路径：battle 子树零运行时标记残留（无永久/失去 BUG 载体）",
    collectRuntime(out.battle).length === 0, collectRuntime(out.battle));
  T("H5 压缩路径：收口后 validateRaw 仍通过",
    Limits.validateRaw(out) === true);
  T("H6 二次压缩幂等（battle 子树不再变化）",
    JSON.stringify(Compact.compactSaveData(meta.clone(out)).battle)
      === JSON.stringify(out.battle));
  T("H7 收口确实减小存档体积",
    Limits.serializedBytes(out.battle) < dirtyBytes,
    { before: dirtyBytes, after: Limits.serializedBytes(out.battle) });
  T("H8 压缩路径：持久牌（hand）仍带 originSide（本轮修复不被削弱）",
    out.battle.allies[0].hand[0].originSide === "enemy", out.battle.allies[0].hand[0]);

  // ---- checkpoint 路径：只注入 stable() 不检查、但含 card 的键 ----
  const st2 = savedState(true);
  st2.battle.played = [{ ...CARD(), originSide: "enemy" }];
  st2.battle.mimicLinks = [{ ownerUid: "a0", targetUid: "e0" }];
  st2.battle.krowRepeatResume = { actorUid: "a0", card: dirtyCard() };
  st2.battle.karunaBubble = { actorUid: "a0", card: dirtyCard() };
  st2.battle.karunaBubblePending = { actorUid: "a0", card: dirtyCard() };
  st2.battle.opheliaGuard = { actorUid: "a0", card: dirtyCard() };
  st2.battle.lastClash = { id: "c1", card: dirtyCard() };
  const cp = Snapshot.finalizeSaveSnapshot(meta.clone(st2));
  T("H9 checkpoint 路径：battle 整块保留，played 仍是完整模板（读档直接渲染）",
    !!cp.battle && cp.battle.played?.[0]?.type === "slash"
      && cp.battle.played?.[0]?.power === 1,
    cp.battle?.played?.[0]);
  T("H10 checkpoint 路径：stable() 漏检的 5 个含 card 键同样收口",
    noTransient(cp.battle || {}),
    Object.fromEntries(transientKeyList.map(k => [k, !!cp.battle?.[k]])));
  T("H11 checkpoint 路径：battle 子树零运行时标记残留",
    !!cp.battle && collectRuntime(cp.battle).length === 0,
    cp.battle ? collectRuntime(cp.battle) : null);
  T("H12 checkpoint 路径：validateRaw 通过",
    Limits.validateRaw(cp) === true);

  // ---- 副作用：读档恢复不依赖被清的瞬时键 ----
  const recoverSrc = SRC("store-unlock-recovery.js");
  T("H13 压缩路径读档由 recoverInterruptedBattle 丢弃 battle，不读任何瞬时键",
    /function recoverInterruptedBattle\(state\)/.test(recoverSrc)
      && /state\.battle = null/.test(recoverSrc)
      && !/krowRepeatResume|karunaBubble|animQueue|selectedSkillCard/.test(recoverSrc));
  const noFields = savedState(false);
  const legacyOut = Compact.compactSaveData(meta.clone(noFields));
  T("H14 旧档兼容：无瞬时键的 battle 压缩后正常、validateRaw 通过",
    Limits.validateRaw(legacyOut) === true
      && legacyOut.battle.allies[0].hand[0].originSide === "enemy");
  T("H15 压缩路径：跨回合持久状态 mimicLinks 不被收口误清（只存 uid 对、不含牌）",
    JSON.stringify(out.battle.mimicLinks)
      === JSON.stringify([{ ownerUid: "a0", targetUid: "e0" }])
      && collectRuntime(out.battle.mimicLinks).length === 0,
    out.battle.mimicLinks);
  T("H16 checkpoint 路径：mimicLinks 同样保留（读档不丢洛基/新月模仿链接）",
    JSON.stringify(cp.battle?.mimicLinks)
      === JSON.stringify([{ ownerUid: "a0", targetUid: "e0" }]),
    cp.battle?.mimicLinks);
}

// ================= F 反向验证 =================
console.log("\n--- F 源码级反向：撤掉修复必须精准打红 ---");
{
  const expected = REVERT === "compact"
    ? ["A2", "A4", "B6", "E1", "E3", "G2", "H3", "H8", "H14"]
    : REVERT === "rebuild"
      ? ["B1", "B6", "E1", "E3"]
      : REVERT === "scope"
        ? ["G1", "G3", "G4"]
        : REVERT === "trail"
          ? ["G5"]
          : REVERT === "transient"
            ? ["H1", "H2", "H4", "H10", "H11"]
            : REVERT === "checkpoint"
              ? ["H10", "H11"]
              : REVERT === "mimic"
                ? ["H15", "H16"]
                : [];
  const got = failed.slice().sort();
  const want = expected.slice().sort();
  T("F1 失败集合与预期完全一致（断言不是空转）",
    JSON.stringify(got) === JSON.stringify(want), { got, want, mode: REVERT || "none" });
  if (REVERT) console.log(`反向态预期红 ${want.join(",")}，实际红 ${got.join(",")}`);
}

console.log(`\nRESULT ${pass}/${total}`);
if (pass !== total && !REVERT) process.exitCode = 1;
