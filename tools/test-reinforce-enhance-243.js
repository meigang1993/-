// 243/244 版严格复查：【增援部队】复活手牌 BUG 修复 + 摸至手牌上限（纯补给口径）；
// 【角色强化】5000 元 / 每项 50 次，旧存档超过 50 次的次数不保留。
// 真实加载产品源码（BattleSession.draw / BattleCombatDefeat.discardDeadHands / LocalCore 结算链），
// REVERT=hand|marker|cost|max|desc|relic|old 为源码级反向验证，须精准打红对应段、无关段保持绿。
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "src", "original");
const REVERT = process.env.REVERT || "none";
const rawCache = {};
const raw = f => rawCache[f] || (rawCache[f] = fs.readFileSync(path.join(SRC, f), "utf8"));
const rootText = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const NEW_BODY = `    const draw = window.BattleSystem?.draw;
    dead.forEach(enemy => {
      const cards = (enemy.hand || []).splice(0);
      if (cards.length) window.BattleCards?.putMany?.(state.battle, enemy, cards, "discard", { skipAfterHandLost: true });
      delete enemy.deathDiscarded;
      enemy.hp = window.BattleHpValue.maxHp(enemy);
      const limit = window.NoaSideEffectSkills?.handLimit?.(enemy)
        ?? Math.max(0, Math.floor(Number(enemy.stats?.handLimit) || 0));
      const need = Math.max(0, limit - visible(enemy).length);
      // 纯补给：不触发摸牌类饰品，也不被吸魔邪眼转交或封魔克扣。
      if (need) draw ? draw(enemy, need, state.battle, null, { cleanRefill: true })
        : refill(state, enemy, need);
    });`;
const REVERTS = {
  hand: { "ruins-elite-skills.js": [[NEW_BODY,
    `    dead.forEach(enemy => { enemy.hp = window.BattleHpValue.maxHp(enemy); });`]] },
  marker: { "ruins-elite-skills.js": [["      delete enemy.deathDiscarded;\n", ""]] },
  cost: { "character-enhance.js": [["const COST = 5000;", "const COST = 1000;"]] },
  max: { "character-enhance.js": [["const MAX_LEVEL = 50;", "const MAX_LEVEL = 999;"]] },
  desc: {
    "data-ruins-sand-city-enemies.js": [["你将已死亡的所有其他角色满血复活，弃置其所有手牌并摸至手牌上限（补牌为纯补给，不触发摸牌类饰品、不被转移或封魔克扣）。", "你复活已死亡的所有其他角色。"]],
    "update-notice-recent.js": [["【增援部队】（装甲运输车）复活后手牌修正", "【已撤回】复活后手牌修正"]],
    "05-怪物与怪物技能与饰品.txt": [["弃置其所有手牌并摸至手牌上限", "满血复活"]],
    "12-新副本素材-废墟沙城.txt": [["弃置其所有手牌并摸至手牌上限", "满血复活"]],
  },
  relic: { "battle-session.js": [["const clean = !!options?.cleanRefill;", "const clean = false;"]] },
  old: { "character-enhance.js": [["return Math.min(MAX_LEVEL, raw);", "return raw;"]] },
};
function read(f) {
  let s = raw(f);
  for (const [o, n] of (REVERTS[REVERT]?.[f] || [])) {
    if (!s.includes(o)) throw new Error(`REVERT=${REVERT} target missing in ${f}: ${o.slice(0, 80)}`);
    s = s.replace(o, n);
  }
  return s;
}
function rel(relPath) {
  let s = rootText(relPath);
  const f = path.basename(relPath);
  for (const [o, n] of (REVERTS[REVERT]?.[f] || [])) {
    if (!s.includes(o)) throw new Error(`REVERT=${REVERT} target missing in ${relPath}`);
    s = s.replace(o, n);
  }
  return s;
}

let pass = 0;
const reds = {};
function T(seg, name, cond, extra) {
  if (cond) { pass += 1; return; }
  (reds[seg] ||= []).push(name);
  console.log(`  RED [${seg}] ${name}`, extra === undefined ? "" : JSON.stringify(extra));
}
const mkCard = n => ({ name: `牌${n}`, type: "slash", suit: "♠", scale: "attack", _n: n });

// ---------- 沙箱：真实 BattleSession.draw + 真实 BattleCombatDefeat ----------
function makeBox() {
  const logs = [];
  const noop = () => {};
  const target = {};
  const lazy = () => new Proxy({}, {
    get(o, k) { return k in o ? o[k] : (typeof k === "string" ? (o[k] = () => undefined) : undefined); },
  });
  const win = new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k === "string" && /^[A-Z]/.test(k)) return (t[k] = lazy());
      return undefined;
    },
    set(t, k, v) { t[k] = v; return true; },
    has() { return true; },
  });
  const ctx = { window: win, console, Math, JSON, Number, Array, Object, String,
    Boolean, Symbol, Date, RegExp, Error, Infinity, NaN, parseInt, parseFloat, isNaN, setTimeout, clearTimeout };
  vm.createContext(ctx);
  Object.assign(win, {
    BattleLog: { add: (s, text) => logs.push(String(text)) },
    BattleLines: { skill: noop, line: noop },
    BattlePileStats: { reshuffle: noop },
    BattleHpValue: { maxHp: u => Math.max(1, Math.round(Number(u?.maxHp ?? u?.stats?.maxHp) || 1)),
      applyDamage: (u, n) => { u.hp = Math.max(0, (u.hp || 0) - n); }, clean: n => Math.round(n) },
    BattleCards: { putMany: (b, holder, cards, pile) => { (holder[pile] ||= []).push(...cards); return cards.length; } },
    BattleSessionSettlement: () => ({ finishBattle: noop }),
    SakuraRisaSkills: { pendingRevival: () => false },
    CardUtils: { isKillCard: c => c?.type === "slash", isSingleKill: c => !!c && !c.sweep && !c.allTargets,
      isEntityCard: c => !c?.virtual && !c?.generatedBySkill && c?.type !== "skill" },
    MieryulaTimeStop: { isSkillDisabled: () => false },
    GameRandom: { id: () => "x" },
  });
  const load = f => vm.runInContext(read(f), ctx, { filename: f });
  return { ctx, win, logs, load };
}
const box = makeBox();
["hp-value.js", "battle-session.js", "battle-combat-defeat.js", "ruins-elite-skills.js"].forEach(box.load);
const W = box.win;
// 真实 draw 工厂：注入的 setup.shuffle / 依赖桩不影响 draw() 的牌堆与手牌语义。
const session = W.BattleSession({
  setup: { shuffle: a => a }, cleanupBattlePrompts: () => {}, clearBattleLog: () => {},
  record: () => {}, wait: async () => {}, waitEffects: async () => {}, isCurrentState: () => true,
  initialDrawCount: () => 0, revealPending: () => {}, nextAnim: (() => { let i = 0; return () => ++i; })(),
  getCombat: () => ({}), getAdvanceToInput: () => (() => {}),
});
W.BattleSystem = { draw: session.draw, pushFloat: () => {} };
const defeat = W.BattleCombatDefeat({
  deps: {}, allUnits: b => [...(b.allies || []), ...(b.enemies || [])],
  pendingFatalAnim: b => !!b.pendingFatal, clearSelection: () => {},
});

function mkEnemy(uid, limit, deckCount, handCount) {
  return { uid, name: uid, side: "enemy", ai: "ruins_grunt", hp: 0, maxHp: 100,
    stats: { handLimit: limit }, hand: Array.from({ length: handCount }, (_, i) => mkCard(`${uid}-old-${i}`)),
    deck: Array.from({ length: deckCount }, (_, i) => mkCard(`${uid}-deck-${i}`)), discard: [],
    deathDiscarded: true };
}
function mkState(dead) {
  const carrier = { uid: "carrier", name: "装甲运输车", side: "enemy", ai: "ruins_carrier",
    hp: 500, maxHp: 100, stats: { handLimit: 4 }, hand: [], deck: [], discard: [] };
  return { carrier, state: { battle: { allies: [], enemies: [carrier, ...dead], turn: 1, animQueue: [] } } };
}

// ---------- A. 增援：补弃 + 清标记 + 摸至上限 ----------
{
  const e = mkEnemy("e0", 4, 10, 3);
  const oldCards = [...e.hand];
  const { carrier, state } = mkState([e]);
  W.RuinsEliteSkills.prepare(state, carrier);
  T("A", "A1 满血复活", e.hp === 100, { hp: e.hp });
  T("A", "A2 死亡前旧手牌全部进弃牌堆（不再保留）",
    e.discard.length === 3 && oldCards.every(c => e.discard.includes(c)) && e.hand.every(c => !oldCards.includes(c)),
    { discard: e.discard.length, hand: e.hand.length });
  T("A", "A3 复活后手牌恰好等于手牌上限 4", e.hand.length === 4, { hand: e.hand.length });
  T("A", "A4 摸牌来自本单位牌堆（10-4=6）", e.deck.length === 6, { deck: e.deck.length });
  T("A", "A5 deathDiscarded 已清除（再次阵亡仍能弃牌）", !("deathDiscarded" in e) || !e.deathDiscarded);
  T("A", "A6 战报写明满血复活与弃置手牌摸至上限",
    box.logs.some(t => t.includes("满血复活1名友军") && t.includes("弃置其所有手牌并摸至手牌上限")), box.logs.slice(-2));
  T("A", "A7 代价=人数×10%上限，施术者不被自己复活", carrier.hp === 490 && carrier.hand.length === 0, { hp: carrier.hp });
  // 二次阵亡：标记清除后真实 discardDeadHands 必须能再弃一次
  e.hp = 0; e.hand = [mkCard("second-life")]; const beforeDiscard = e.discard.length;
  defeat.discardDeadHands(state, state.battle);
  T("A", "A8 复活后再次阵亡仍能弃置手牌（真 BUG 修复）",
    e.hand.length === 0 && e.discard.length === beforeDiscard + 1, { hand: e.hand.length, discard: e.discard.length });
  box.logs.length = 0;
}
// ---------- B. 死亡浮字未播完（checkDefeat 跳过弃牌）的时序复现 ----------
{
  const e = mkEnemy("e1", 3, 6, 2);
  const { carrier, state } = mkState([e]);
  state.battle.pendingFatal = true;
  const defeated = defeat.checkDefeat(state);
  T("B", "B1 pendingFatalAnim 时 checkDefeat 不弃牌（BUG 触发前提）",
    defeated === false && e.hand.length === 2, { defeated, hand: e.hand.length });
  state.battle.pendingFatal = false;
  W.RuinsEliteSkills.prepare(state, carrier);
  T("B", "B2 复活仍补弃旧牌并摸至上限 3", e.hand.length === 3 && e.discard.length === 2 && e.deathDiscarded !== true,
    { hand: e.hand.length, discard: e.discard.length });
  T("B", "B3 牌堆按 6-3=3 消耗", e.deck.length === 3, { deck: e.deck.length });
  box.logs.length = 0;
}
// ---------- C. 多目标 / 牌堆耗尽 / 自定义上限 / 幂等 ----------
{
  const a = mkEnemy("a", 4, 10, 5);   // 旧手牌比上限多
  const b = mkEnemy("b", 2, 1, 0);    // 牌堆不足
  const c = mkEnemy("c", 6, 20, 1);
  const { carrier, state } = mkState([a, b, c]);
  W.NoaSideEffectSkills = { handLimit: u => u.uid === "c" ? 3 : null }; // 优先于 stats
  W.RuinsEliteSkills.prepare(state, carrier);
  T("C", "C1 旧手牌超上限也先清干净再摸到上限", a.hand.length === 4 && a.discard.length === 5 && a.deck.length === 6);
  T("C", "C2 牌堆耗尽最多摸到上限、不凭空造牌", b.hand.length === 1 && b.deck.length === 0, { hand: b.hand.length });
  T("C", "C3 自定义 handLimit 优先（3 而非 stats 的 6）", c.hand.length === 3 && c.deck.length === 17);
  T("C", "C4 代价按 3 人计", carrier.hp === 470, { hp: carrier.hp });
  const snap = carrier.hp;
  W.RuinsEliteSkills.prepare(state, carrier);
  T("C", "C5 无死者时幂等、不重复扣血或摸牌", carrier.hp === snap && a.hand.length === 4 && c.deck.length === 17);
  delete W.NoaSideEffectSkills;
  box.logs.length = 0;
}

// ---------- D. 角色强化：5000 元 / 每项 50 次（真实 LocalCore 链路） ----------
function coreCtx() {
  const ctx = vm.createContext({ console, window: {}, Date, Math, JSON, Object, Array, String, Number });
  ctx.window = ctx;
  const load = f => vm.runInContext(read(f), ctx, { filename: f });
  ctx.GameData = { characters: [{ id: "lokar", name: "罗卡尔", stats: { maxHp: 130, attack: 6, magic: 4, speed: 8 } }],
    baseDeck: [], eliteCards: [], protectedBaseDeck: [], initialShopCardNames: [] };
  ctx.GameRandom = { snapshot: () => ({}), sample: () => null, int: () => 0, create: () => ({}) };
  ctx.GameEconomy = { shop: { refreshCost: 500 }, relic: { smeltGold: 180 }, startingGold: 0 };
  ["character-progression.js", "character-enhance.js", "store-state-factory.js",
    "local-core-utils.js", "local-core-character.js", "local-core.js",
    "server-core-apply.js", "server-core.js", "store-compact.js"].forEach(load);
  ctx.GameStore = { baseStats: () => ({ attack: 0, magic: 0, speed: 0, maxHp: 10, bloodlust: 1, handLimit: 0, drawPerTurn: 0, initialDraw: 2 }) };
  ctx.StoreRepairs = { cardKey: () => "", repairCard: c => c };
  load("store-migration-characters.js");
  return ctx;
}
const C = coreCtx();
const E = C.CharacterEnhance;
const mkCore = (gold, enhance) => ({
  resources: { gold, essence: 0, relics: [] },
  chars: [{ id: "lokar", name: "罗卡尔", locked: false, level: 3, exp: 0, hp: 200, stats: {}, ...(enhance ? { enhance } : {}) }],
  random: {}, deck: [], shopCards: [], bounties: [], pendingBountyRewards: [], flags: {}, ownedSkins: {},
  equippedSkins: {}, unlockedDifficulties: ["normal"], unlockedShopCards: [], defeatedElites: [],
  dungeonUnlocks: {}, view: "hall",
});
(async () => {
  T("D", "D1 价格为 5000 莉莉丝元", E.COST === 5000, { cost: E.COST });
  T("D", "D2 每项上限为 50 次", E.MAX_LEVEL === 50, { max: E.MAX_LEVEL });
  T("D", "D3 超出 50 次的旧档收敛为 50", E.cleanLevel(999) === 50 && E.cleanLevel(50) === 50 && E.cleanLevel(51) === 50);
  T("D", "D4 四项独立、单次加成不变",
    JSON.stringify(E.BONUS) === JSON.stringify({ maxHp: 3, attack: 1, magic: 1, speed: 1 }) && E.statKeys.length === 4);
  const exact = mkCore(5000);
  const r1 = await C.ServerCore.call("enhanceChar", { id: "lokar", stat: "attack" }, exact);
  T("D", "D5 恰好 5000 可强化且余额归零", r1.ok === true && exact.resources.gold === 0 && E.levelOf(exact.chars[0], "attack") === 1,
    { gold: exact.resources.gold });
  const poor = mkCore(4999);
  const r2 = await C.ServerCore.call("enhanceChar", { id: "lokar", stat: "speed" }, poor);
  T("D", "D6 4999 拒绝且不扣费", !r2.ok && poor.resources.gold === 4999 && E.levelOf(poor.chars[0], "speed") === 0);
  const big = mkCore(5000 * 60);
  let last;
  for (let i = 0; i < 50; i += 1) last = await C.ServerCore.call("enhanceChar", { id: "lokar", stat: "magic" }, big);
  const r51 = await C.ServerCore.call("enhanceChar", { id: "lokar", stat: "magic" }, big);
  T("D", "D7 第 50 次成功、第 51 次拒绝", last.ok === true && !r51.ok && E.levelOf(big.chars[0], "magic") === 50,
    { level: E.levelOf(big.chars[0], "magic") });
  const other = await C.ServerCore.call("enhanceChar", { id: "lokar", stat: "speed" }, big);
  T("D", "D8 某项满级不影响其它三项", other.ok === true && E.levelOf(big.chars[0], "speed") === 1);
  const legacy = { enhanceLevel: 999 };
  T("D", "D9 旧档 999 次读档按四项各 50 次还原、加成不双算",
    JSON.stringify(E.levelsOf(legacy)) === JSON.stringify({ maxHp: 50, attack: 50, magic: 50, speed: 50 })
    && E.bonusOf(legacy).maxHp === 150);
  const panel = rel("src/original/ui-info.js");
  T("D", "D10 面板兜底价与 50 次提示同步",
    panel.includes("?? 5000") && panel.includes("每项最多 50 次"));
  const hall = rel("src/original/hall-enhance-actions.js");
  T("D", "D11 动作层战报兜底价同步 5000", hall.includes("?? 5000"));
  // ---------- E. 描述 / 公告 / 文档同步 ----------
  const skill = rel("src/original/data-ruins-sand-city-enemies.js");
  T("E", "E1 技能描述写明弃置手牌并摸至上限",
    skill.includes("弃置其所有手牌并摸至手牌上限") && !skill.includes("你复活已死亡的所有其他角色。"));
  const notice = rel("src/original/update-notice-recent.js");
  T("E", "E2 公告写明复活手牌修正与 5000/50 次",
    notice.includes("【增援部队】（装甲运输车）复活后手牌修正")
    && notice.includes("【角色强化】价格与次数上限调整")
    && notice.includes("5000 莉莉丝元") && notice.includes("50 次"));
  T("E", "E3 两份 docs 同步",
    ["docs/05-怪物与怪物技能与饰品.txt", "docs/12-新副本素材-废墟沙城.txt"]
      .every(p => rel(p).includes("弃置其所有手牌并摸至手牌上限")));
  T("E", "E4 公告未超 150 行归档线", notice.split("\n").length <= 150, { lines: notice.split("\n").length });
  T("E", "E5 增援源码未超 180 行硬约束", raw("ruins-elite-skills.js").split("\n").length <= 180,
    { lines: raw("ruins-elite-skills.js").split("\n").length });

  // ---------- F. 纯补给口径 + 旧档超限不保留（真实 draw / compactSaveData） ----------
  let relicCalls = 0;
  let redirectCalls = 0;
  const thief = { uid: "thief", side: "ally", hand: [], deck: [], discard: [], hp: 100 };
  W.RuinsRelicEffects = { afterDraw: () => { relicCalls += 1; } };
  W.SakuraRisaSkills = {
    pendingRevival: () => false,
    drawRecipient: () => thief,
    onDrawRedirected: () => { redirectCalls += 1; },
  };
  {
    const e = mkEnemy("f1", 4, 10, 2);
    const { carrier, state } = mkState([e]);
    relicCalls = 0; redirectCalls = 0; thief.hand.length = 0;
    W.RuinsEliteSkills.prepare(state, carrier);
    T("F", "F1 复活补牌不触发【螺旋桨/物资货物/冰心双刺剑】等摸牌类饰品",
      relicCalls === 0, { relicCalls });
    T("F", "F2 复活补牌不被吸魔邪眼转交（牌全进复活者手牌）",
      redirectCalls === 0 && e.hand.length === 4 && thief.hand.length === 0,
      { redirectCalls, hand: e.hand.length, thief: thief.hand.length });
    box.logs.length = 0;
  }
  {
    const e = mkEnemy("f3", 4, 10, 1);
    e.drawLockedThisTurn = true;
    const { carrier, state } = mkState([e]);
    W.RuinsEliteSkills.prepare(state, carrier);
    T("F", "F3 封魔/摸牌锁定不克扣复活补牌，仍恰好摸齐上限",
      e.hand.length === 4 && e.deck.length === 6, { hand: e.hand.length, deck: e.deck.length });
    box.logs.length = 0;
  }
  {
    // 对照：不带 cleanRefill 的普通摸牌，三类钩子必须照常生效（没有误伤其它调用方）。
    const battle = { allies: [thief], enemies: [], turn: 1, animQueue: [] };
    const plain = { uid: "plain", side: "ally", hand: [], discard: [], hp: 100,
      deck: [mkCard("p1"), mkCard("p2"), mkCard("p3")] };
    relicCalls = 0; redirectCalls = 0; thief.hand.length = 0;
    const got = session.draw(plain, 2, battle, null);
    T("F", "F4 普通摸牌仍触发饰品与转交回调",
      relicCalls === 1 && redirectCalls > 0 && got.length === 2 && thief.hand.length === 2,
      { relicCalls, redirectCalls, got: got.length, thief: thief.hand.length });
    const locked = { uid: "locked", side: "ally", hand: [], discard: [], hp: 100,
      deck: [mkCard("l1"), mkCard("l2")], drawLockedThisTurn: true };
    const got2 = session.draw(locked, 2, battle, null);
    T("F", "F5 普通摸牌仍受封魔阻断", got2.length === 0 && got2.drawSignal?.locked === true,
      { got: got2.length });
  }
  {
    // 旧存档超过 50 次不保留：落盘后四元组各 50、旧 enhanceLevel 字段不再写回。
    const old = { id: "lokar", locked: false, level: 3, exp: 0, hp: 200, enhanceLevel: 999 };
    const saved = C.GameStoreCompact.compactSaveData({
      view: "hall", chars: [old], deck: [], shopCards: [], bounties: [], pendingBountyRewards: [],
    });
    const ch = saved.chars[0];
    T("F", "F6 旧档 999 次落盘不保留，四元组各 50 且无 enhanceLevel",
      JSON.stringify(ch.enhance) === JSON.stringify({ maxHp: 50, attack: 50, magic: 50, speed: 50 })
      && !("enhanceLevel" in ch) && E.bonusOf(ch).maxHp === 150, ch.enhance);
    const mixed = { id: "lokar", level: 1, hp: 10,
      enhance: { maxHp: 999, attack: 51, magic: 50, speed: -3 }, enhanceLevel: 88 };
    T("F", "F7 新旧字段混合档也不保留超限、负数与旧字段",
      JSON.stringify(E.levelsOf(mixed)) === JSON.stringify({ maxHp: 50, attack: 50, magic: 50, speed: 0 }),
      E.levelsOf(mixed));
  }
  T("F", "F8 公告写明纯补给与旧档超限不保留",
    notice.includes("复活补牌另定为纯补给") && notice.includes("超过 50 次的强化次数不保留")
    && notice.includes("旧 enhanceLevel 字段不再写回"));
  T("F", "F9 技能描述与两份 docs 写明纯补给",
    skill.includes("补牌为纯补给")
    && ["docs/05-怪物与怪物技能与饰品.txt", "docs/12-新副本素材-废墟沙城.txt"]
      .every(p => rel(p).includes("补牌为纯补给")));
  T("F", "F10 纯补给接线在位（静态源码）",
    read("battle-session.js").includes("const clean = !!options?.cleanRefill;")
    && read("ruins-elite-skills.js").includes("cleanRefill: true"));
  T("F", "F11 两个改动源码均未超 180 行硬约束",
    raw("battle-session.js").split("\n").length <= 180
    && raw("ruins-elite-skills.js").split("\n").length <= 180,
    { session: raw("battle-session.js").split("\n").length, ruins: raw("ruins-elite-skills.js").split("\n").length });

  const segs = Object.keys(reds);
  console.log(`\n=== ${pass}/${pass + segs.reduce((n, k) => n + reds[k].length, 0)} 通过，红段=${segs.join(",") || "无"} ===`);
  if (segs.length) process.exitCode = 1;
})();
