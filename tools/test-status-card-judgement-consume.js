// 状态牌「判定结算完毕后自动消耗对应状态牌」严格检查。
//   REVERT=consume 源码级撤掉判定后的 consumeRemoved（应让 A/C/F 段变红）
//   REVERT=freeze  源码级退回「靠手里还有 freeze 才清标记」（应让 E 段变红）
// 反向模式下失败是预期结果，脚本会另行校验「红得是否精准」。
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { combat, card, unit } = require("./pursue-kill-fixtures");
require("../src/original/hp-value.js");

const REVERT = process.env.REVERT || "";
const SRC = name => path.join(__dirname, "../src/original", name);
const read = name => fs.readFileSync(SRC(name), "utf8");

function reload(revertKind) {
  let storage = read("battle-status-card-storage.js");
  let triggers = read("battle-status-card-triggers.js");
  if (revertKind === "consume") {
    // 只在 judgement 函数块内撤掉消耗；resolveResistance 里也有同名调用，不能误删。
    const cut = triggers.indexOf("function triggerConfusion");
    assert(cut > 0, "trigger module layout must be stable");
    let head = triggers.slice(0, cut);
    assert(head.includes("consumeRemoved(state, unit, status, false);"),
      "judgement must contain the consume call");
    head = head.replace("，判定结算后消耗${status.name}。", "。")
      .replace(
        "consumeRemoved(state, unit, status, false);",
        "/* REVERT: judgement no longer consumes */");
    triggers = head + triggers.slice(cut);
    assert(!triggers.slice(0, cut).includes("consumeRemoved(state, unit, status, false);"),
      "REVERT=consume must actually remove the judgement consume call");
  }
  if (revertKind === "freeze") {
    storage = storage.replace(
      "if (unit?.frozenSlash) unit.frozenSlash = false;",
      "if (expired.some(c => c.freeze || c.statusKey === \"freeze\")) unit.frozenSlash = false;");
    assert(!storage.includes("if (unit?.frozenSlash) unit.frozenSlash = false;"),
      "REVERT=freeze must actually restore the old hadFreeze behaviour");
  }
  // 顺序要紧：triggers 闭包解构了 storage.consumeRemoved。
  new Function(storage)();
  new Function(triggers)();
  new Function(read("battle-status-cards.js"))();
}
if (REVERT) reload(REVERT);

const reds = [];
let pass = 0, total = 0;
function T(name, ok, extra) {
  total += 1;
  if (ok) pass += 1;
  else reds.push(name);
  if (!ok) console.log(`  ❌ ${name}`, extra === undefined ? "" : JSON.stringify(extra));
}
const has = (arr, pred) => (arr || []).some(pred);
const nameOf = c => String(c?.name || "");

function stateWith(hand, suits = []) {
  const holder = unit("judge-holder", "ally", hand);
  holder.name = "状态目标";
  holder.deck = suits.map(suit => card("闪", { suit }));
  holder.stats = { attack: 6 };
  const state = {
    log: [],
    battle: {
      allies: [holder], enemies: [], animQueue: [], played: [],
      turn: 1, phase: 2,
    },
  };
  return { state, holder };
}
function keys(holder) {
  return (holder.hand || []).filter(BattleStatusCards.isStatus)
    .map(BattleStatusCards.keyOf);
}
function consumedKeys(holder) {
  return (holder.consumed || []).filter(BattleStatusCards.isStatus)
    .map(BattleStatusCards.keyOf);
}
const LABELS = {
  stun: "眩晕", seal: "封魔", paralysis: "麻痹", confusion: "混乱", freeze: "冰冻",
};
// 带冒号 + 单位名不含「判定」，避免把「判定目标」「判定牌」之类的字样算进去。
const judged = (state, key) => state.log.filter(m =>
  m.includes(`${LABELS[key]}判定：`)).length;

// A. 五种判定类状态牌：成功 / 失败都必须在判定结算后消耗「对应这一张」。
const cases = [
  { key: "stun", win: "♠", lose: "♥" },
  { key: "seal", win: "♥", lose: "♠" },
  { key: "paralysis", win: "♠", lose: "♣" },
  { key: "confusion", win: "♥", lose: "♣" },
  { key: "freeze", win: "♣", lose: "♠" },
];
cases.forEach(({ key, win, lose }) => {
  [["win", win], ["lose", lose]].forEach(([tag, suit]) => {
    const status = BattleStatusCards.create(key);
    const { state, holder } = stateWith([status, card("闪", { suit: "♦" })], [suit]);
    BattleStatusCards.judgement(state, holder);
    const label = BattleStatusCards.labelOf(status);
    T(`A1 ${key}/${tag} 判定已发生`, judged(state, key) === 1, { log: state.log });
    T(`A2 ${key}/${tag} 对应状态牌离开手牌`, !has(holder.hand, c => c.statusKey === key),
      { hand: keys(holder) });
    T(`A3 ${key}/${tag} 对应状态牌进入消耗区`, consumedKeys(holder).includes(key),
      { consumed: consumedKeys(holder) });
    T(`A4 ${key}/${tag} statuses 不再显示该状态`, !(holder.statuses || []).includes(label),
      { statuses: holder.statuses });
    T(`A5 ${key}/${tag} 战报写明判定结算后消耗`,
      state.log.some(m => m.includes(`判定结算后消耗${label}`)), { log: state.log });
    T(`A6 ${key}/${tag} 其它手牌未被误消耗`,
      has(holder.hand, c => nameOf(c) === "闪"), { hand: holder.hand.map(nameOf) });
  });
});

// B. 非判定类状态牌（地雷 / 粘液）不进判定、不被消耗。
{
  const mine = BattleStatusCards.create("landmine");
  const slime = BattleStatusCards.create("slime");
  const { state, holder } = stateWith([mine, slime, card("杀（普攻）")], ["♠"]);
  BattleStatusCards.judgement(state, holder);
  T("B1 地雷仍在手牌", has(holder.hand, c => c.statusKey === "landmine"), { hand: keys(holder) });
  T("B2 粘液仍在手牌", has(holder.hand, c => c.statusKey === "slime"), { hand: keys(holder) });
  T("B3 非判定状态牌不产生判定战报",
    !state.log.some(m => m.includes("判定：")), { log: state.log });
  T("B4 非判定状态牌未进消耗区", consumedKeys(holder).length === 0,
    { consumed: consumedKeys(holder) });
}

// C. 同一回合多张状态牌各判各的、各消耗各的。
{
  const cards = ["stun", "seal", "freeze"].map(k => BattleStatusCards.create(k));
  // deck.pop() 取最后一张：♠(stun成功) → ♥(seal成功) → ♣(freeze成功)
  const { state, holder } = stateWith([...cards, card("闪")], ["♣", "♥", "♠"]);
  BattleStatusCards.judgement(state, holder);
  T("C1 三张判定牌各判定一次",
    ["stun", "seal", "freeze"].every(k => judged(state, k) === 1), { log: state.log });
  T("C2 三张状态牌全部离开手牌", keys(holder).length === 0, { hand: keys(holder) });
  T("C3 三张状态牌全部进入消耗区",
    ["stun", "seal", "freeze"].every(k => consumedKeys(holder).includes(k)),
    { consumed: consumedKeys(holder) });
  T("C4 三个判定效果都在",
    holder.skipPlayPhase === true && holder.skipPlayReason === "眩晕"
    && holder.drawLockedThisTurn === true && holder.frozenSlash === true,
    { skip: holder.skipPlayReason, seal: holder.drawLockedThisTurn, freeze: holder.frozenSlash });
  T("C5 非状态牌仍留在手牌", has(holder.hand, c => nameOf(c) === "闪"),
    { hand: holder.hand.map(nameOf) });
}

// D. 消耗不能吞掉本回合的判定效果，也不能凭空造出效果。
{
  const { state, holder } = stateWith(
    [BattleStatusCards.create("stun")], ["♠"]);
  BattleStatusCards.judgement(state, holder);
  T("D1 眩晕成功后仍跳过出牌阶段",
    holder.skipPlayPhase === true && holder.skipPlayReason === "眩晕");
  T("D2 消耗后 sync 未把 skipPlayReason 抹掉", holder.skipPlayReason === "眩晕");
}
{
  const { state, holder } = stateWith(
    [BattleStatusCards.create("freeze")], ["♠"]);
  BattleStatusCards.judgement(state, holder);
  T("D3 冰冻判定失败不设 frozenSlash", !holder.frozenSlash);
  T("D4 失败也照样消耗状态牌", !has(holder.hand, c => c.freeze), { hand: keys(holder) });
}

// E. 冰冻标记：判定后状态牌已消耗，回合结束仍必须清掉「本回合禁杀」。
{
  const { state, holder } = stateWith(
    [BattleStatusCards.create("freeze"), card("杀（普攻）")], ["♣"]);
  BattleStatusCards.judgement(state, holder);
  T("E1 判定成功后 frozenSlash 生效", holder.frozenSlash === true);
  assert(combat.canPlay(holder, card("杀（普攻）"), state.battle) === false,
    "fixture sanity: freeze must block kill cards");
  BattleStatusCards.endTurn(state, holder);
  T("E2 判定已消耗状态牌，回合结束仍清掉 frozenSlash",
    holder.frozenSlash === false, { frozenSlash: holder.frozenSlash });
  T("E3 endTurn 不重复写「回合结束，消耗」战报",
    !state.log.some(m => m.includes("回合结束，消耗")), { log: state.log });
}

// F. 跨回合不重复判定，也不会把旧牌的效果带进下一回合。
{
  const { state, holder } = stateWith(
    [BattleStatusCards.create("stun")], ["♠"]);
  BattleStatusCards.judgement(state, holder);
  const first = state.log.length;
  state.battle.turn = 2;
  BattleStatusCards.judgement(state, holder);
  T("F1 第二回合不再产生判定战报", state.log.length === first,
    { first, now: state.log.length, log: state.log });
  T("F2 第二回合不重复消耗", consumedKeys(holder).filter(k => k === "stun").length === 1,
    { consumed: consumedKeys(holder) });
  T("F3 消耗区只进一次、不复制卡牌", consumedKeys(holder).length === 1,
    { consumed: consumedKeys(holder) });
}

// G. 牌面描述同步，且未判定的状态牌仍由回合结束兜底清理。
{
  const texts = cases.map(({ key }) => BattleStatusCards.create(key).text);
  T("G1 五张判定牌描述均改为判定结算后消耗",
    texts.every(t => t.includes("判定结算后消耗此牌")), { texts });
  T("G2 描述不再保留「回合结束后消耗此牌」",
    texts.every(t => !t.includes("回合结束后消耗此牌")), { texts });
  const { state, holder } = stateWith(
    [BattleStatusCards.create("paralysis"), card("闪")], []);
  BattleStatusCards.endTurn(state, holder);
  T("G3 未判定就到回合结束的状态牌仍被兜底消耗",
    !has(holder.hand, c => c.paralysis) && consumedKeys(holder).includes("paralysis"),
    { hand: keys(holder), consumed: consumedKeys(holder) });
}

// 反向验证本身也要有把关：红必须精准落在被撤掉的那层。
if (REVERT === "consume") {
  const affected = reds.filter(n => /^(A2|A3|A5|C2|C3|F1|F2)/.test(n));
  const untouched = reds.filter(n => /^B/.test(n));
  T("REVERT=consume 精准打红判定消耗相关断言", affected.length >= 5,
    { affected: affected.slice(0, 8), reds: reds.length });
  T("REVERT=consume 不影响非判定状态牌", untouched.length === 0, { untouched });
  console.log(`REVERT=consume  红 ${reds.length} 项：` + reds.slice(0, 12).join(" | "));
} else if (REVERT === "freeze") {
  const affected = reds.filter(n => /^E2/.test(n));
  const others = reds.filter(n => !/^E2/.test(n));
  T("REVERT=freeze 精准打红 E2", affected.length === 1, { affected });
  T("REVERT=freeze 不影响其它段", others.length === 0, { others });
  console.log(`REVERT=freeze  红 ${reds.length} 项：` + reds.join(" | "));
} else {
  console.log(`RESULT ${pass}/${total}`);
  if (reds.length) process.exitCode = 1;
}
