// 256 版：废墟沙城 10 张掉落卡牌「实际效果」独立严格检查。
// 不复用既有断言：真实加载产品模块、真实调效果入口，按卡面文案核对数值与状态。
// REVERT=<组> 时撤掉对应产品源码实现，要求该组精准打红、无关段保持绿。
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ROOT = path.resolve(__dirname, "..");
const DIR = path.join(ROOT, "src", "original");
const REVERT = process.env.REVERT || "";

const {
  installGlobals, loadRuntime, unitFromCharacter, card,
} = require("./skill-coverage-fixtures");
installGlobals();
loadRuntime();

// raw 统一应用反向替换：静态断言与运行时加载看到的是同一份「注入后」源码，
// 避免「运行时打红、静态断言却读磁盘原文」的空转。
const raw = f => {
  let src = fs.readFileSync(path.join(DIR, f), "utf8");
  editsFor(f).forEach(([from, to]) => {
    if (!src.includes(from)) throw new Error(`REVERT=${REVERT} 目标未命中: ${from}`);
    src = src.replace(from, to);
  });
  return src;
};
// 反向替换表：只改产品源码的某一处，验证断言确实由该实现支撑。
const REPL = {
  hybrid: ["battle-combat-attack-values.js",
    "const bonus = card.hybridAttack && card.type === \"tactic\" ? attack + magic",
    "const bonus = false ? attack + magic"],
  clash: ["ruins-card-skills.js", "if (mine > theirs) {", "if (false) {"],
  chain: ["ruins-card-skills.js", "if (card._chainDone) return;", "if (false) return;"],
  vulnerable: ["ruins-card-skills.js", "return Math.round(amount * 150 / 100);", "return amount;"],
  steal: ["ruins-card-skills.js", "const steal = window.BattleCardStealApi;", "const steal = null;"],
  supply: ["battle-combat-card-effects.js",
    "if (card.allyDrawCards && target && target !== actor && target.hp > 0) {",
    "if (false) {"],
  status: ["battle-combat-card-effects.js",
    "window.BattleStatusCards?.apply?.(state, actor, target, card);",
    "void 0;"],
};
// 多文件反向组：删掉基础值后，两处「这张牌会打伤害」的判定必须同步保留，
// 否则牌根本不会进入伤害结算。撤掉两处条件应让 H 组精准打红。
const MULTI = {
  damageExit: [
    ["battle-combat-attack-flow.js",
      "|| (card.hybridAttack && card.type === \"tactic\");", "|| false;"],
    ["battle-combat-responses.js",
      "|| (card.hybridAttack && card.type === \"tactic\");", "|| false;"],
  ],
};
const OWN = {
  hybrid: ["B"], clash: ["C"], chain: ["C"], vulnerable: ["C"],
  steal: ["C"], supply: ["E"], status: ["D"], damageExit: ["H"],
};
const editsFor = f => [
  ...(REVERT && REPL[REVERT] && REPL[REVERT][0] === f
    ? [[REPL[REVERT][1], REPL[REVERT][2]]] : []),
  ...((MULTI[REVERT] || []).filter(([g]) => g === f)
    .map(([, from, to]) => [from, to])),
];
const load = f => vm.runInThisContext(raw(f), { filename: f });
[
  "gaianis-amulet-skills.js", "battle-status-card-registry.js",
  "battle-status-card-storage.js", "battle-status-card-triggers.js",
  "battle-status-cards.js", "data-ruins-content.js", "ruins-card-skills.js",
  "battle-combat-card-effects.js", "battle-combat-attack-values.js",
  "battle-card-counter-interactions.js", "battle-response-ui.js",
].forEach(load);

const R = [];
const T = (group, name, ok, detail = "") => R.push({ group, name, ok: !!ok, detail });

// ---------- A 掉落 / 解锁 / 实体牌 ----------
const defs = window.GameDataRuinsContent.cards;
const NAMES = ["拼杀", "魔之连杀", "魅惑术", "魅杀", "偷袭", "冰冻术", "流星杀", "吸魔杀", "物资私分", "枪林弹雨"];
T("A", "10 种掉落卡定义齐全", defs.length === 10 && NAMES.every(n => defs.some(d => d.name === n)), JSON.stringify(defs.map(d => d.name)));
const pool = (window.GameDataCards.eliteCards || []).filter(c => NAMES.includes(c.name));
T("A", "展开 20 张实体牌（每种 2 花色）", pool.length === 20, `pool=${pool.length}`);
T("A", "每名各 2 张且花色合法", NAMES.every(n => {
  const list = pool.filter(c => c.name === n);
  return list.length === 2 && list.every(c => ["♠", "♥", "♣", "♦"].includes(c.suit)) && list[0].suit !== list[1].suit;
}));
T("A", "实体牌带 price / enemy / text（存档重建必需）",
  pool.every(c => Number.isInteger(c.price) && c.price > 0 && c.enemy && c.text && c.type));
T("A", "eliteUnlocks 按敌人 id 分组（不是副本 id）",
  Object.keys(window.GameDataCards.eliteUnlocks || {}).filter(k => ["mech_ai_dragon", "witherer_1312", "hilde", "attack_helicopter", "armored_carrier"].includes(k)).length === 5,
  JSON.stringify(Object.keys(window.GameDataCards.eliteUnlocks || {}).slice(0, 12)));
T("A", "5 个敌人 id 均登记 2 张卡名",
  ["mech_ai_dragon", "witherer_1312", "hilde", "attack_helicopter", "armored_carrier"]
    .every(id => (window.GameDataCards.eliteUnlocks[id] || []).length === 2));
T("A", "图鉴 10 条且标注废墟沙城来源",
  (window.GameDataCards.cardCodex || []).filter(c => NAMES.includes(c.name)).length === 10);
const byName = n => pool.find(c => c.name === n);

// ---------- B 真实伤害出口：BattleCombatAttackValues.attackAmount ----------
const AV = window.BattleCombatAttackValues({
  deps: {
    isKillCard: c => window.CardUtils.isKillCard(c),
    tempAttack: u => (u.stats?.attack || 0) + (u.tempAttack || 0),
  },
  statOf: (u, k) => u.stats?.[k] || 0,
  damage: {}, pushFloat() {}, isSingleSlash() {},
});
const mkActor = (atk, mag) => {
  const u = unitFromCharacter(window.GameData.characters[0], "a0");
  u.side = "ally";
  u.stats = { attack: atk, magic: mag, speed: 10, maxHp: 100, hp: 100 };
  u.tempAttack = 0; u.tempMagic = 0; u.charge = 0;
  return u;
};
const amountOf = (name, atk = 3, mag = 4, extra = {}) => {
  const u = mkActor(atk, mag);
  const c = { ...byName(name), ...extra };
  delete c._skill; delete c._repeat; delete c.virtual;
  return { amount: AV.attackAmount({ log: [], battle: {} }, u, c, AV.cardPower(c), true), base: AV.cardPower(c), statKey: window.CardUtils.damageStatKey(u, c), actor: u };
};
const b1 = amountOf("拼杀");
T("B", "拼杀 = 攻击力（scale attack）", b1.amount === 3 && b1.statKey === "attack", `${b1.amount}/${b1.statKey}`);
for (const n of ["魔之连杀", "魅杀", "流星杀", "吸魔杀"]) {
  const r = amountOf(n);
  T("B", `${n} = 魔力（scale magic）`, r.amount === 4 && r.statKey === "magic", `${r.amount}/${r.statKey}`);
}
const rain = amountOf("枪林弹雨");
T("B", "枪林弹雨 = 攻击力 + 魔力（已删除基础1点）",
  rain.amount === 7, `实际=${rain.amount}，期望 3+4=7，statKey=${rain.statKey}`);
T("B", "枪林弹雨换一组属性仍为攻+魔", amountOf("枪林弹雨", 9, 7).amount === 16, `${amountOf("枪林弹雨", 9, 7).amount}`);
T("B", "枪林弹雨实体牌不带基础伤害值", (byName("枪林弹雨").power || 0) === 0 && !/基础\s*1\s*点/.test(byName("枪林弹雨").text));
T("B", "枪林弹雨 hybridAttack 标志在位", byName("枪林弹雨").hybridAttack === true && byName("枪林弹雨").type === "tactic");
// _repeat 复制牌必须与原牌同口径（克罗研究记录额外结算）
const rep = amountOf("枪林弹雨", 3, 4, { _skill: true, _repeat: true });
T("B", "克罗记录重复结算与原牌同口径", rep.amount === rain.amount, `原=${rain.amount} 重复=${rep.amount}`);
T("B", "其它卡未被 hybrid 改动误伤（流星杀/魔王军入侵口径）",
  amountOf("流星杀").amount === 4 && window.GameDataCards.eliteCards.some(c => c.name === "魔王军入侵" && c.demonInvasion));

// ---------- C 真实 RuinsCardSkills 钩子 ----------
const RS = window.RuinsCardSkills;
const st = () => ({ log: [], battle: { allies: [], enemies: [], animQueue: [], locked: false } });
const mkUnit = (uid, side, hp = 80) => {
  const u = unitFromCharacter(window.GameData.characters[1], uid);
  u.side = side; u.hp = hp; u.maxHp = hp; u.hand = [];
  return u;
};
const slash = (name = "杀") => card(name, "slash", { suit: "♠" });
{
  const a = mkUnit("a0", "ally"), e = mkUnit("e0", "enemy");
  a.hand = [slash(), slash(), slash()]; e.hand = [slash()];
  const c = { ...byName("拼杀") };
  RS.beforeResponseCheck(st(), a, e, c);
  T("C", "拼杀：我方杀牌多 → 不可响应", c.ignoreResponse === true);
  const c2 = { ...byName("拼杀") };
  RS.beforeResponseCheck(st(), e, a, c2);
  T("C", "拼杀：不多于目标 → 可响应", c2.ignoreResponse !== true);
  const c3 = { ...byName("拼杀"), _clashChecked: true };
  RS.beforeResponseCheck(st(), a, e, c3);
  T("C", "拼杀：_clashChecked 幂等", c3.ignoreResponse !== true);
  const c4 = { ...byName("拼杀"), _playedFromHand: true };
  a.hand = [slash(), slash()]; e.hand = [slash()];
  RS.beforeResponseCheck(st(), a, e, c4);
  T("C", "拼杀：结算中的牌补回手里再比较", c4.ignoreResponse === true);
}
{
  const a = mkUnit("a0", "ally"); a.stats.magic = 6; a.hand = [slash(), slash()];
  const es = [0, 1, 2].map(i => mkUnit("e" + i, "enemy"));
  const s = st(); s.battle.allies = [a]; s.battle.enemies = es;
  const hits = [];
  const c = { ...byName("魔之连杀"), _playedFromHand: true };
  RS.chainAfterResolution(s, a, es[0], c, (_s, u, amt) => { hits.push(`${u.uid}:${amt}`); }, { hpLoss: 6 });
  T("C", "魔之连杀：按杀牌数额外指定且不含主目标",
    hits.length === 2 && !hits.some(h => h.startsWith("e0:")) && hits.every(h => h.endsWith(":6")), JSON.stringify(hits));
  const again = [];
  RS.chainAfterResolution(s, a, es[0], c, (_s, u, amt) => { again.push(`${u.uid}:${amt}`); }, { hpLoss: 6 });
  T("C", "魔之连杀：重复调用不二次连锁", again.length === 0, JSON.stringify(again));
  const c2 = { ...byName("魔之连杀") };
  RS.chainAfterResolution(s, a, es[0], c2, () => {}, { killInvalidated: true });
  T("C", "魔之连杀：killInvalidated 不连锁", !c2._chainDone);
  const s2 = st(); s2.battle.allies = [a]; s2.battle.enemies = es; s2.battle.locked = true;
  const c3 = { ...byName("魔之连杀"), _playedFromHand: true };
  const enq = [];
  window.BattleReactionQueue = { enqueue: (_s, items) => enq.push(...items.length ? [items.length] : []), damageAction: () => ({}) };
  RS.chainAfterResolution(s2, a, es[0], c3, () => { throw new Error("locked 时不应直接结算"); }, {});
  T("C", "魔之连杀：locked 时剩余目标入反应队列", enq.length === 1, JSON.stringify(enq));
  delete window.BattleReactionQueue;
}
{
  const a = mkUnit("a0", "ally"), e = mkUnit("e0", "enemy");
  const c = { ...byName("魅杀") };
  RS.applyVulnerable(st(), a, e, c);
  T("C", "魅杀：受击后施加脆弱标记", e.vulnerable === true);
  T("C", "魅杀：脆弱伤害 +50% 且整数", RS.modifyIncomingDamage(st(), e, 10, null) === 15 && RS.modifyIncomingDamage(st(), e, 9, null) === 14);
  T("C", "魅杀：无标记不放大", RS.modifyIncomingDamage(st(), mkUnit("x", "enemy"), 10, null) === 10);
  RS.clearVulnerable(st(), e);
  T("C", "魅杀：回合结束清除", !e.vulnerable);
  const dead = mkUnit("d", "enemy", 0);
  RS.applyVulnerable(st(), a, dead, { ...byName("魅杀") });
  T("C", "魅杀：目标已阵亡不加标记", !dead.vulnerable);
}
{
  const a = mkUnit("a0", "ally"), e = mkUnit("e0", "enemy"); e.hand = [slash("闪"), slash("杀")];
  let stolen = 0;
  window.BattleCardStealApi = () => { stolen += 1; };
  const c = { ...byName("吸魔杀") };
  RS.stealAfterHit(st(), a, e, c);
  T("C", "吸魔杀：受击结束后偷 1 张且只偷一次", stolen === 1, `stolen=${stolen}`);
  RS.stealAfterHit(st(), a, e, c);
  T("C", "吸魔杀：_stealDone 幂等", stolen === 1, `stolen=${stolen}`);
  const dead = mkUnit("d", "enemy", 0);
  RS.stealAfterHit(st(), a, dead, { ...byName("吸魔杀") });
  T("C", "吸魔杀：目标阵亡不偷", stolen === 1, `stolen=${stolen}`);
  delete window.BattleCardStealApi;
}

// ---------- D 状态牌（魅惑术 / 冰冻术）真实生成与判定 ----------
{
  const a = mkUnit("a0", "ally"), e = mkUnit("e0", "enemy");
  const s = st(); s.battle.allies = [a]; s.battle.enemies = [e];
  const before = (e.hand || []).length;
  const effects = window.BattleCombatCardEffects({
    deps: { draw: () => [], isKillCard: c => window.CardUtils.isKillCard(c) },
    specials: { repeatTactic() {} }, useCard() {}, damage() {},
    statOf: (u, k) => u.stats?.[k] || 0, pushFloat() {},
    checkDefeat() {}, checkEnd() {}, repeatIfDone() {},
  });
  effects.resolve(s, a, e, { ...byName("魅惑术") });
  T("D", "魅惑术：真实生成【混乱】状态牌",
    (e.hand || []).length === before + 1 && window.BattleStatusCards.has(e, "confusion"),
    JSON.stringify((e.hand || []).map(c => c.name)));
  const e2 = mkUnit("e1", "enemy");
  effects.resolve(s, a, e2, { ...byName("冰冻术") });
  T("D", "冰冻术：真实生成【冰冻】状态牌", window.BattleStatusCards.has(e2, "freeze"));
  T("D", "冰冻术：判定♦/♣触发本回合禁杀",
    /♦|方块/.test(window.BattleStatusCardRegistry.create("freeze").text)
    && /♣|梅花/.test(window.BattleStatusCardRegistry.create("freeze").text));
}
// ---------- E 物资私分真实结算 ----------
{
  const a = mkUnit("a0", "ally"), ally = mkUnit("a1", "ally");
  const s = st(); s.battle.allies = [a, ally]; s.battle.enemies = [mkUnit("e0", "enemy")];
  const drawn = [];
  const effects = window.BattleCombatCardEffects({
    deps: { draw: (u, n) => { drawn.push(`${u.uid}:${n}`); return n; }, isKillCard: c => window.CardUtils.isKillCard(c) },
    specials: { repeatTactic() {} }, useCard() {}, damage() {},
    statOf: (u, k) => u.stats?.[k] || 0, pushFloat() {},
    checkDefeat() {}, checkEnd() {}, repeatIfDone() {},
  });
  effects.resolve(s, a, ally, { ...byName("物资私分") });
  T("E", "物资私分：使用者摸 3 张", drawn.includes("a0:3"), JSON.stringify(drawn));
  T("E", "物资私分：指定友方也摸 3 张", drawn.includes("a1:3"), JSON.stringify(drawn));
  T("E", "物资私分：excludeSelf 声明在位", byName("物资私分").excludeSelf === true && byName("物资私分").allyTarget === true);
  const drawn2 = [];
  const eff2 = window.BattleCombatCardEffects({
    deps: { draw: (u, n) => { drawn2.push(`${u.uid}:${n}`); return n; }, isKillCard: c => window.CardUtils.isKillCard(c) },
    specials: { repeatTactic() {} }, useCard() {}, damage() {},
    statOf: (u, k) => u.stats?.[k] || 0, pushFloat() {},
    checkDefeat() {}, checkEnd() {}, repeatIfDone() {},
  });
  eff2.resolve(s, a, a, { ...byName("物资私分") });
  T("E", "物资私分：目标为自己时不给第二份", drawn2.filter(d => d === "a1:3").length === 0, JSON.stringify(drawn2));
}

// ---------- F 偷袭 / 响应 / 扫场 / 淫气 ----------
{
  const a = mkUnit("a0", "ally"); a.hand = [{ ...byName("偷袭") }];
  const e = mkUnit("e0", "enemy");
  const b = { allies: [a], enemies: [e], manualCounter: { actorUid: e.uid, targetUid: a.uid, card: { name: "战术牌", type: "tactic" } } };
  const view = window.BattleResponseUI.manualCounterHand(b);
  T("F", "偷袭：真实进入手动响应候选并标注「偷袭」",
    view.includes("偷袭") && view.includes("data-manual-counter-pick"), view.slice(0, 160));
  const ci = window.BattleCardCounterInteractions({}, { damage() {} }, { log() {} });
  const s3 = { battle: { allies: [a], enemies: [e] }, log: [], settings: { manualResponse: true } };
  const entered = ci.counterTactic(s3, e, a, { name: "战术牌", type: "tactic" });
  T("F", "偷袭：真实进入战术牌响应窗口", entered === true && !!s3.battle.manualCounter, `entered=${entered}`);
  const view2 = window.BattleResponseUI.manualCounterHand(s3.battle);
  T("F", "偷袭：响应候选标注 ambush 口径且可见",
    /偷袭/.test(view2) && /响应牌/.test(view2), view2.slice(0, 160));
  const meteor = byName("流星杀");
  T("F", "流星杀：全体魔力魔法伤害 + 消耗淫气 + 可闪",
    meteor.sweep === true && meteor.targetless === true && meteor.scale === "magic"
    && meteor.attackType === "magic" && meteor.responseKind === "dodge"
    && meteor.type === "slash" && /消耗1点淫气/.test(meteor.text));
  const rain = byName("枪林弹雨");
  T("F", "枪林弹雨：全体 + 无基础值 + 可闪 + 复合属性",
    rain.sweep === true && rain.targetless === true && (rain.power || 0) === 0
    && !/基础\s*1\s*点/.test(rain.text)
    && rain.responseKind === "dodge" && rain.hybridAttack === true && /敌方可用【闪】抵消/.test(rain.text));
}

// ---------- G 装配与静态 ----------
{
  const dmgRes = raw("battle-damage-resolution.js");
  const trig = raw("battle-damage-triggers.js");
  const dmg = raw("battle-damage.js");
  const end = raw("battle-end-phase.js");
  T("G", "拼杀挂在响应判定前", dmgRes.includes("window.RuinsCardSkills?.beforeResponseCheck?.("));
  T("G", "脆弱放大挂在统一伤害结算链", dmgRes.includes("window.RuinsCardSkills?.modifyIncomingDamage?.("));
  T("G", "魅杀/吸魔杀挂在受击结算后", trig.includes("window.RuinsCardSkills?.applyVulnerable?.(") && trig.includes("window.RuinsCardSkills?.stealAfterHit?.("));
  T("G", "魔之连杀挂在伤害出口（命中/被闪/锁定都连锁）", dmg.includes("window.RuinsCardSkills?.chainAfterResolution?.("));
  T("G", "回合结束清脆弱", end.includes("window.RuinsCardSkills?.clearVulnerable?.("));
  const order = JSON.parse(fs.readFileSync(path.join(ROOT, "tools", "publish-bundles.json"), "utf8"));
  const flat = JSON.stringify(order);
  T("G", "装配清单含废墟卡牌模块", flat.includes("ruins-card-skills") && flat.includes("data-ruins-content"));
  const notice = raw("update-notice-recent.js");
  T("G", "公告含废墟沙城掉落卡条目", notice.includes("废墟沙城") && notice.includes("枪林弹雨"));
}

// ---------- H 删除基础伤害值后的全局口径 ----------
{
  const flow = raw("battle-combat-attack-flow.js");
  const resp = raw("battle-combat-responses.js");
  T("H", "attack-flow：无基础值的复合战术牌仍进入伤害结算",
    flow.includes("|| (card.hybridAttack && card.type === \"tactic\");"));
  T("H", "响应续跑链同口径",
    resp.includes("|| (card.hybridAttack && card.type === \"tactic\");"));
  const allCards = [...(window.GameData.baseDeck || []), ...(window.GameDataCards.eliteCards || [])];
  const withPower = allCards.filter(c => (c.power || 0) > 0);
  T("H", `全库 ${allCards.length} 张实体牌没有任何基础伤害值`, withPower.length === 0,
    `power>0: ${JSON.stringify(withPower.map(c => `${c.name}:${c.power}`))}`);
  const docs = ["docs/04-卡牌.txt", "docs/废墟沙城怪物设计最新版本.txt"];
  T("H", "设定文档不再写基础1点",
    docs.every(p => !/基础\s*1\s*点/.test(fs.readFileSync(path.join(ROOT, p), "utf8"))));
  const latest = raw("update-notice-recent.js").split("\n").slice(0, 30).join("\n");
  T("H", "当期公告不再写基础1点", !/基础\s*1\s*点/.test(latest));
  const cardDefs = raw("data-ruins-content.js");
  T("H", "卡牌定义不再声明 power 字段",
    !/name:\s*"枪林弹雨"[^}]*power\s*:/.test(cardDefs));
}

const bad = R.filter(r => !r.ok);
if (REVERT) {
  const own = bad.filter(r => (OWN[REVERT] || []).includes(r.group));
  const other = bad.filter(r => !own.includes(r));
  const ok = own.length > 0 && other.length === 0;
  console.log(`REVERT=${REVERT} ${ok ? "OK" : "FAILED"} own=${own.length} other=${other.length}` +
    (other.length ? ` [${other.map(r => r.group + ":" + r.name).join(" | ")}]` : ""));
  process.exit(ok ? 0 : 1);
}
console.log(`废墟沙城掉落卡牌实际效果 严格检查 通过 ${R.length - bad.length} / ${R.length}（${new Set(R.map(r => r.group)).size} 组）`);
bad.forEach(r => console.log(`  ❌ [${r.group}] ${r.name}${r.detail ? " — " + r.detail : ""}`));
process.exit(bad.length ? 1 : 0);
