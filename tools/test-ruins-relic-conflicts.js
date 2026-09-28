// 废墟沙城饰品 × 其他饰品 冲突检查（节点逻辑，快速可复现）
// 覆盖：
//   1. 冰心双刺剑 + 鲨鱼头套      —— 同单位两件「杀→转换」饰品，谁生效
//   2. 物资货物 + 物资货物        —— 两名角色各戴一件时的连锁反应
//   3. 武器库 + 冰心双刺剑        —— 武器库发牌能否触发接收者的转换
//   4. 冰心双刺剑 + 格林机枪/电锯剑/白丝袜 —— 转换产物是否仍被判定为【杀】
//   5. 导弹发射器 + 冰心双刺剑    —— 目标手里的【刺杀】能否用于支付额外弃置
const fs = require("fs");
const vm = require("vm");

function load(file) {
  vm.runInThisContext(fs.readFileSync(file, "utf8"), { filename: file });
}

function setup() {
  global.window = global;
  window.GameData = { enemies: {}, statDefs: [], eliteCards: [] };
  window.BattleLog = { add(state, m) { (state.log ||= []).push(m); } };
  window.BattleLines = { skill(state, unit, name) { (state.lines ||= []).push(`${unit?.name}:${name}`); } };
  window.BattleCards = { put() {} };
  window.RelicSystem = { hasEquipped: (s, u, r) => (u.relics || []).includes(r) };
  load("./src/original/game-random.js");
  ["economy-config.js", "data-cards.js", "data-ruins-content.js", "card-utils.js", "battle-card-cleanup.js"].forEach(f =>
    load(`./src/original/${f}`));
  load("./src/original/ruins-relic-ice-dagger.js");
  load("./src/original/ruins-relic-propeller.js");
  load("./src/original/ruins-relic-effects.js");
  // 鲨鱼头套是工厂函数，需传 singleSlash 后挂到 window.UnderwaterTrainSkills
  load("./src/original/underwater-train-bite-skills.js");
  window.UnderwaterTrainSkills = window.UnderwaterTrainBiteSkills({
    singleSlash: c => window.CardUtils.isSingleKill(c),
  });
}

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return !!cond;
};

function mkUnit(name, side, relics = [], deckCount = 30) {
  const deck = [];
  for (let i = 0; i < deckCount; i += 1) {
    deck.push(window.CardUtils.cloneEntity("杀（普攻）", { suit: "♠" }));
  }
  return { name, uid: name, side, hp: 200, maxHp: 200, stats: { attack: 10, magic: 6, speed: 5 },
    hand: [], deck, discard: [], relics };
}

function mkState(allies, enemies) {
  return { battle: { allies, enemies, phase: 3, animQueue: [], roundNo: 1 }, log: [], lines: [] };
}

// 复刻 battle-session.draw：抽牌后还会再次触发 afterDraw（连锁反应的根源）
function makeDraw(state) {
  return function draw(unit, count, battle) {
    const cards = [];
    for (let i = 0; i < count && unit.deck.length; i += 1) {
      const card = unit.deck.pop();
      if (battle?.animQueue) card._pendingDraw = true;
      unit.hand.push(card);
      cards.push(card);
    }
    window.RuinsRelicEffects.afterDraw(state, unit, cards, draw, {});
    return cards;
  };
}

// ---------- 1. 冰心双刺剑 + 鲨鱼头套 ----------
function caseIceShark() {
  console.log("\n【1】冰心双刺剑 + 鲨鱼头套（同一角色）");
  const a = mkUnit("A", "ally", ["冰心双刺剑", "鲨鱼头套"]);
  const b = mkUnit("B", "ally", ["鲨鱼头套"]); // 对照组：只有鲨鱼头套
  const st = mkState([a, b], [mkUnit("E", "enemy")]);
  const draw = makeDraw(st);
  const cardA = window.CardUtils.cloneEntity("杀（普攻）", { suit: "♠" });
  const cardB = window.CardUtils.cloneEntity("杀（普攻）", { suit: "♠" });
  a.hand.push(cardA); b.hand.push(cardB);
  window.RuinsRelicEffects.afterDraw(st, a, [cardA], draw, {});
  window.RuinsRelicEffects.afterDraw(st, b, [cardB], draw, {});
  T("冰心双刺剑把【杀（普攻）】转换为【刺杀】", cardA.name === "刺杀", { name: cardA.name });
  T("对照组（仅鲨鱼头套）牌名仍为【杀（普攻）】", cardB.name === "杀（普攻）", { name: cardB.name });
  const shownA = window.UnderwaterTrainSkills.displayBiteCard(st, a, cardA);
  const shownB = window.UnderwaterTrainSkills.displayBiteCard(st, b, cardB);
  T("冰心+鲨鱼头套：鲨鱼头套生效（不再是死的）",
    shownA.biteKill === true && shownA.name === "咬杀", { biteKill: shownA.biteKill, name: shownA.name });
  T("叠加后保留冰心的不消耗杀意", shownA.noIntentCost === true, { noIntentCost: shownA.noIntentCost });
  T("叠加后保留刺杀的弃置手牌效果", shownA.assassinate === true, { assassinate: shownA.assassinate });
  T("对照组：仅鲨鱼头套时正常把【杀（普攻）】视为【咬杀】",
    shownB.biteKill === true && shownB.name === "咬杀", { biteKill: shownB.biteKill, name: shownB.name });
  // 反向锚点：没有冰心时普通【刺杀】不应被鲨鱼头套接管，否则会波及刺客胶衣等产物
  const d = mkUnit("D", "ally", ["鲨鱼头套"]);
  const stD = mkState([d], [mkUnit("E3", "enemy")]);
  const plainAssassin = window.CardUtils.cloneEntity("刺杀", { suit: "♠" });
  d.hand.push(plainAssassin);
  const shownD = window.UnderwaterTrainSkills.displayBiteCard(stD, d, plainAssassin);
  T("对照组：非冰心产物的普通【刺杀】不被鲨鱼头套接管",
    shownD.biteKill !== true && shownD.name === "刺杀", { biteKill: shownD.biteKill, name: shownD.name });
}

// ---------- 2. 物资货物 连锁 ----------
function caseCargoChain() {
  console.log("\n【2】物资货物 × 物资货物（两名友方各戴一件）");
  const a = mkUnit("A", "ally", ["物资货物"]);
  const b = mkUnit("B", "ally", ["物资货物"]);
  const c = mkUnit("C", "ally", []);
  const st = mkState([a, b, c], [mkUnit("E", "enemy")]);
  st.battle.phase = 3;
  const draw = makeDraw(st);
  const drawnByA = draw(a, 2, st.battle); // A 摸 2 张，触发物资货物
  const cargoLogs = (st.log || []).filter(l => l.includes("物资货物"));
  const handLens = { A: a.hand.length, B: b.hand.length, C: c.hand.length };
  console.log(`   物资货物触发日志 ${cargoLogs.length} 条；手牌 ${JSON.stringify(handLens)}`);
  T("两名角色各戴物资货物时不再连锁（只触发 1 次）",
    cargoLogs.length === 1, { logs: cargoLogs.length, handLens });
  T("牌库不再被抽干（每人手牌不超过 A 摸牌数 2 张）",
    Math.max(a.hand.length, b.hand.length, c.hand.length) <= 2, handLens);
  T("友方确实被喂到牌（B、C 各 2 张）",
    b.hand.length === 2 && c.hand.length === 2, handLens);
  T("防护标志用完即清（不会残留到后续摸牌）",
    st.battle._supplyCargoFeeding === undefined, { flag: st.battle._supplyCargoFeeding });
  // 对照组：只有 A 戴
  const a2 = mkUnit("A2", "ally", ["物资货物"]);
  const b2 = mkUnit("B2", "ally", []);
  const c2 = mkUnit("C2", "ally", []);
  const st2 = mkState([a2, b2, c2], [mkUnit("E2", "enemy")]);
  st2.battle.phase = 3;
  const draw2 = makeDraw(st2);
  draw2(a2, 2, st2.battle);
  const logs2 = (st2.log || []).filter(l => l.includes("物资货物"));
  console.log(`   对照组（仅 A 戴）：触发 ${logs2.length} 条；手牌 A=${a2.hand.length} B=${b2.hand.length} C=${c2.hand.length}`);
  T("对照组：仅一人佩戴时只触发 1 次", logs2.length === 1, { logs: logs2.length });
  T("对照组：友方各摸 2 张（等量，不连锁）",
    b2.hand.length === 2 && c2.hand.length === 2, { B: b2.hand.length, C: c2.hand.length });
}

// ---------- 3. 武器库 + 冰心双刺剑 ----------
function caseArsenalIce() {
  console.log("\n【3】武器库发牌 → 接收者戴冰心双刺剑");
  const a = mkUnit("A", "ally", ["武器库"]);
  const b = mkUnit("B", "ally", ["冰心双刺剑"]);
  const c = mkUnit("C", "ally", []); // 对照组：无饰品
  const st = mkState([a, b, c], [mkUnit("E", "enemy")]);
  window.state = st;
  const killForB = window.CardUtils.cloneEntity("杀（普攻）", { suit: "♠" });
  const killForC = window.CardUtils.cloneEntity("杀（普攻）", { suit: "♠" });
  b.hand.push(killForB);
  c.hand.push(killForC);
  // 武器库推的是 gainCards 事件（落位后触发 afterCardsLanded）
  window.RuinsRelicEffects.afterCardsLanded({ type: "gainCards", uid: b.uid, cards: [killForB] });
  window.RuinsRelicEffects.afterCardsLanded({ type: "gainCards", uid: c.uid, cards: [killForC] });
  T("接收者戴冰心双刺剑：武器库发的【杀】被转换为【刺杀】",
    killForB.name === "刺杀", { name: killForB.name });
  T("对照组（接收者无饰品）：牌名保持【杀（普攻）】",
    killForC.name === "杀（普攻）", { name: killForC.name });
}

// ---------- 4. 冰心双刺剑 + 需要「杀」的饰品 ----------
function caseIceWithSlashRelics() {
  console.log("\n【4】冰心双刺剑 + 依赖【杀】判定的饰品（格林机枪/电锯剑/白丝袜）");
  const a = mkUnit("A", "ally", ["冰心双刺剑"]);
  const st = mkState([a], [mkUnit("E", "enemy")]);
  const draw = makeDraw(st);
  const c1 = window.CardUtils.cloneEntity("杀（普攻）", { suit: "♠" });
  const c2 = window.CardUtils.cloneEntity("杀（普攻）", { suit: "♥" });
  a.hand.push(c1, c2);
  window.RuinsRelicEffects.afterDraw(st, a, [c1, c2], draw, {});
  T("转换产物【刺杀】仍被 isKillCard 判定为【杀】",
    window.CardUtils.isKillCard(c1) && window.CardUtils.isKillCard(c2));
  T("转换产物仍满足 isEntitySingleKill（伊迪斯电锯剑/格林机枪可用）",
    window.CardUtils.isEntitySingleKill(c1) && window.CardUtils.isEntitySingleKill(c2));
  T("格林机枪队列口径 isKillCard 仍能找到它们（不会被冰心整件废掉）",
    a.hand.filter(c => window.CardUtils.isKillCard(c)).length === 2,
    { count: a.hand.filter(c => window.CardUtils.isKillCard(c)).length });
}

// ---------- 5. 导弹发射器 + 冰心双刺剑 ----------
function caseMissileIce() {
  console.log("\n【5】导弹发射器 vs 戴冰心双刺剑的目标（手里是【刺杀】）");
  const actor = mkUnit("Attacker", "enemy", ["导弹发射器"]);
  const target = mkUnit("Target", "ally", ["冰心双刺剑"]);
  const st = mkState([target], [actor]);
  const flash = window.CardUtils.cloneEntity("闪", { suit: "♥" });
  const assassin = window.CardUtils.cloneEntity("刺杀", { suit: "♠" }); // 冰心转换后的产物
  target.hand.push(flash, assassin);
  const card = window.CardUtils.cloneEntity("杀（普攻）", { suit: "♠" });
  const ok = window.RuinsRelicEffects.missileLauncherBlock(
    st, actor, target, card, [flash], flash);
  const logText = (st.log || []).join(" | ");
  T("目标手里的【刺杀】可用于支付导弹发射器的额外弃置（响应成功）", ok === true, { ok });
  T("日志记为弃置【刺杀】", logText.includes("额外弃1张") && logText.includes("刺杀"), { logText });
  // 对照组：没有额外杀
  const target2 = mkUnit("Target2", "ally", []);
  const st2 = mkState([target2], [actor]);
  const flash2 = window.CardUtils.cloneEntity("闪", { suit: "♥" });
  target2.hand.push(flash2);
  const ok2 = window.RuinsRelicEffects.missileLauncherBlock(
    st2, actor, target2, card, [flash2], flash2);
  T("对照组：目标无额外【杀】时响应失败", ok2 === false, { ok: ok2 });
}

setup();
caseIceShark();
caseCargoChain();
caseArsenalIce();
caseIceWithSlashRelics();
caseMissileIce();
console.log(`\n结果 ${pass}/${total}`);
process.exit(pass === total ? 0 : 1);
