// 248 版严格检查：【战斗演练】只在使用实体牌后触发。
// 真实加载 CardUtils + GuestAilengSkills；REVERT=guard|desc|doc|notice 为源码级反向验证。
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "src", "original");
const REVERT = process.env.REVERT || "none";
const rawCache = {};
const raw = f => rawCache[f] || (rawCache[f] = fs.readFileSync(path.join(SRC, f), "utf8"));
const rootRaw = relPath => fs.readFileSync(path.join(ROOT, relPath), "utf8");

const FIXED_GUARD = "    if (!hasSkill(actor, \"战斗演练\") || !isEntityCard(card) || (!isSlash(card) && card.type !== \"tactic\")) return;";
const OLD_GUARD = "    if (!hasSkill(actor, \"战斗演练\") || card._skill || (!isSlash(card) && card.type !== \"tactic\")) return;";
const NEW_SKILL_TEXT = "当你使用的实体【杀】或实体战术牌结算完毕后，你可以将该牌交给一名其他友方角色。技能生成的牌、虚拟牌与非实体牌不触发。";
const OLD_SKILL_TEXT = "当你使用的【杀】或战术牌结算完毕后，你可以将该牌交给一名其他友方角色。";
const NEW_DOC_TEXT = "   当你使用的实体【杀】或实体战术牌结算完毕后，你可以将该牌交给一名其他友方角色。\n   技能生成的牌、虚拟牌与非实体牌不触发。";
const OLD_DOC_TEXT = "   当你使用的【杀】或战术牌结算完毕后，你可以将该牌交给一名其他友方角色。";
const NEW_RULE_LINE = "- 艾伦格的`计算下注` resets intent to the current intent maximum, including temporary maximum bonuses. `战斗演练` only triggers after an entity card is used; virtual kills, skill-generated cards and skill payloads must not open the share picker. It moves the resolved original card if another effect returned it to hand before the transfer choice; it must never duplicate that card.";
const OLD_RULE_LINE = "- 艾伦格的`计算下注` resets intent to the current intent maximum, including temporary maximum bonuses. `战斗演练` moves the resolved original card if another effect returned it to hand before the transfer choice; it must never duplicate that card.";
const NOTICE_PREFIX = "        \"修复【艾伦格】【战斗演练】与【妖刀村雨】虚拟杀的挂起冲突：";
const NOTICE_OLD_PREFIX = "        \"【已撤回】修复【艾伦格】【战斗演练】与【妖刀村雨】虚拟杀的挂起冲突：";

const REVERTS = {
  guard: { "guest-aileng-skills.js": [[FIXED_GUARD, OLD_GUARD]] },
  desc: { "data-characters-extra.js": [[NEW_SKILL_TEXT, OLD_SKILL_TEXT]] },
  doc: {
    "03-角色与角色技能.txt": [[NEW_DOC_TEXT, OLD_DOC_TEXT]],
    "game-settings.md": [[NEW_RULE_LINE, OLD_RULE_LINE]],
  },
  notice: { "update-notice-recent.js": [[NOTICE_PREFIX, NOTICE_OLD_PREFIX]] },
};
function transform(text, key) {
  let s = text;
  for (const [o, n] of (REVERTS[REVERT]?.[key] || [])) {
    if (!s.includes(o)) throw new Error(`REVERT=${REVERT} target missing in ${key}: ${o.slice(0, 80)}`);
    s = s.replace(o, n);
  }
  return s;
}
const read = f => transform(raw(f), f);
const rootText = relPath => transform(rootRaw(relPath), path.basename(relPath));

let pass = 0;
const reds = {};
function T(seg, name, cond, extra) {
  if (cond) { pass += 1; return; }
  (reds[seg] ||= []).push(name);
  console.log(`  RED [${seg}] ${name}`, extra === undefined ? "" : JSON.stringify(extra));
}

// ---------- 沙箱：真实 CardUtils + 真实 GuestAilengSkills ----------
function makeBox() {
  const logs = [];
  const ctx = { console, Math, JSON, Object, Array, String, Number, Boolean, RegExp,
    Error, Infinity, NaN, parseInt, parseFloat, isNaN, Symbol, Date, setTimeout, clearTimeout };
  vm.createContext(ctx);
  ctx.window = ctx;
  ctx.GameData = { characters: [] };
  ctx.GameDataCards = {
    cardCodex: [
      { name: "杀（普攻）", type: "slash", suit: "♠", scale: "attack", text: "基础杀" },
      { name: "拆解", type: "tactic", suit: "♥", text: "拆解一张牌" },
    ],
    baseDeck: [],
    eliteCards: [],
  };
  ctx.BattleLog = { add: (s, text) => logs.push(String(text)) };
  ctx.BattleLines = { skill: () => {} };
  ctx.NoaCharmSkills = { onHandGained: () => {} };
  const load = f => vm.runInContext(read(f), ctx, { filename: f });
  return { ctx, logs, load };
}
const box = makeBox();
["card-utils.js", "guest-aileng-skills.js"].forEach(box.load);
const W = box.ctx;

function mkState() {
  const actor = { uid: "a0", name: "艾伦格", ref: "aileng", side: "ally", hp: 100, maxHp: 100,
    skills: [{ name: "战斗演练", type: "passive" }], hand: [], discard: [], consumed: [] };
  const mate = { uid: "a1", name: "队友", ref: "lokar", side: "ally", hp: 100, maxHp: 100, hand: [], discard: [], consumed: [] };
  const enemy = { uid: "e0", name: "敌人", side: "enemy", hp: 100, maxHp: 100, hand: [] };
  const state = { battle: { allies: [actor, mate], enemies: [enemy], locked: false,
    animQueue: [], ailengDrillPicker: null } };
  return { state, actor, mate, enemy };
}
function play(card) {
  const { state, actor, mate } = mkState();
  actor.hand.push(card);
  W.GuestAilengSkills.afterCardPlayed(state, actor, card);
  return { state, actor, mate,
    prompt: !!state.battle.ailengDrillPicker,
    locked: !!state.battle.locked,
    cardName: state.battle.ailengDrillPicker?.card?.name || null };
}
const entitySlash = () => W.CardUtils.cloneEntity("杀（普攻）", { suit: "♠" });
const entityTactic = () => W.CardUtils.cloneEntity("拆解", { suit: "♥" });
const convertedSlash = () => W.CardUtils.cloneEntity("杀（普攻）", {
  suit: "♠", convertedFrom: "杀（普攻）", _skill: true, _entityConversion: true });
const virtualSlash = () => W.CardUtils.fromEntity("杀（普攻）", {
  noIntentCost: true, sourceName: "妖刀村雨", _skipUseKillTriggers: true });
const virtualTactic = () => W.CardUtils.fromEntity("拆解", { sourceName: "测试虚拟战术" });
const generatedSlash = () => W.CardUtils.cloneEntity("杀（普攻）", {
  suit: "♠", generatedBySkill: "测试技能", _skill: true });
const skillCard = () => ({ name: "计算下注", type: "tactic", _skill: true, ailengBet: true });
const skillPayload = () => ({ name: "燃烧", type: "skill" });
const pendingEntity = () => W.CardUtils.cloneEntity("杀（普攻）", { suit: "♠", _pendingDraw: true });

// ---------- A. 触发矩阵：只有实体【杀】/实体战术牌/实体转换牌触发 ----------
{
  const a1 = play(entitySlash());
  T("A", "A1 实体【杀】触发交牌", a1.prompt && a1.locked && a1.cardName === "杀（普攻）", a1);
  const a2 = play(entityTactic());
  T("A", "A2 实体战术牌触发交牌", a2.prompt && a2.locked && a2.cardName === "拆解", a2);
  const a3 = play(convertedSlash());
  T("A", "A3 实体转换牌仍按实体牌触发", a3.prompt && a3.locked, a3);
  const a4 = play(virtualSlash());
  T("A", "A4 妖刀村雨虚拟【杀】不触发、不锁界面", !a4.prompt && !a4.locked, a4);
  const a5 = play(virtualTactic());
  T("A", "A5 虚拟战术牌不触发、不锁界面", !a5.prompt && !a5.locked, a5);
  const a6 = play(generatedSlash());
  T("A", "A6 技能生成牌不触发、不锁界面", !a6.prompt && !a6.locked, a6);
  const a7 = play(skillCard());
  T("A", "A7 技能卡不触发、不锁界面", !a7.prompt && !a7.locked, a7);
  const a8 = play(skillPayload());
  T("A", "A8 非牌伤害载荷不触发、不锁界面", !a8.prompt && !a8.locked, a8);
  const a9 = play(pendingEntity());
  T("A", "A9 待落袋牌不触发、不锁界面", !a9.prompt && !a9.locked, a9);
}

// ---------- B. 实体牌触发后的既有交牌链路不受影响 ----------
{
  const r = play(entitySlash());
  const ok = W.GuestAilengSkills.resolveBattleDrill(r.state, r.mate.uid);
  T("B", "B1 实体牌交出接口仍成功", ok === true);
  T("B", "B2 原牌从艾伦格手牌移出", r.actor.hand.length === 0, { hand: r.actor.hand.length });
  T("B", "B3 牌进入队友手牌", r.mate.hand.some(card => card.name === "杀（普攻）"));
  T("B", "B4 交牌后清空 picker 并解锁", !r.state.battle.ailengDrillPicker && !r.state.battle.locked);
  T("B", "B5 借牌归属仍标记原主", r.mate.hand[0]?.stolenFromUid === r.actor.uid);
}

// ---------- C. 设定文档同步 ----------
{
  const doc = rootText("docs/03-角色与角色技能.txt");
  const rules = rootText("docs/original/game-settings.md");
  T("C", "C1 角色文档写明实体【杀】/实体战术牌", doc.includes("实体【杀】或实体战术牌"));
  T("C", "C2 底层设定写明 only entity card", rules.includes("only triggers after an entity card is used"));
  T("C", "C3 评价同步为已结算的实体牌", doc.includes("战斗演练把已结算的实体牌交给队友"));
}

// ---------- D. 玩家可见技能描述同步 ----------
{
  const data = read("data-characters-extra.js");
  T("D", "D1 技能描述写明实体牌后触发", data.includes("当你使用的实体【杀】或实体战术牌结算完毕后"));
  T("D", "D2 技能描述排除虚拟/技能生成牌", data.includes("技能生成的牌、虚拟牌与非实体牌不触发"));
  T("D", "D3 评价同步为已结算的实体牌", data.includes("战斗演练把已结算的实体牌交给队友"));
}

// ---------- E. 今日公告同步 ----------
{
  const notice = read("update-notice-recent.js");
  T("E", "E1 今日公告写明本次修复", notice.includes(NOTICE_PREFIX));
  T("E", "E2 公告写明统一判定源", notice.includes("CardUtils.isEntityCard 作为唯一判定源"));
  T("E", "E3 公告行数未超 150 行硬约束", notice.split("\n").length <= 150,
    { lines: notice.split("\n").length });
}

const redTotal = Object.values(reds).reduce((n, list) => n + list.length, 0);
const EXPECTED = { guard: ["A"], desc: ["D"], doc: ["C"], notice: ["E"] };
if (REVERT === "none") {
  console.log(`\n汇总：${pass} 通过 / ${redTotal} 失败`);
  process.exit(redTotal ? 1 : 0);
}
const want = EXPECTED[REVERT] || [];
const redSegs = Object.keys(reds).sort();
const precise = want.length && want.every(seg => (reds[seg] || []).length > 0)
  && redSegs.every(seg => want.includes(seg));
console.log(`\nREVERT=${REVERT} 反向验证：red=${JSON.stringify(reds)} precise=${precise}`);
process.exit(precise ? 0 : 1);
