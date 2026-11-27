// 【次元转移】实体单体杀触发 + 【傲慢雌小鬼】攻/魔 2 倍 · 严格检查
// 运行：node tools/test-dimension-entity-arrogance-double.js
//       REVERT=entity|source|double|desc|notice|docs|weapon|spike|flamer|flamerfx node ... （源码级反向验证）
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ROOT = path.resolve(__dirname, "..", "src", "original");
const DOCS = path.resolve(__dirname, "..", "docs");
const REVERT = process.env.REVERT || "";

const src = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const doc = f => fs.readFileSync(path.join(DOCS, f), "utf8");
let CODE = {};
function codeOf(f) {
  if (CODE[f] !== undefined) return CODE[f];
  let s = src(f);
  if (REVERT === "entity" && f === "manny-skills.js") {
    const from = "!entitySingleSlash(card) || card.dimensionTransferred";
    if (!s.includes(from)) throw new Error("REVERT=entity must hit transfer guard");
    s = s.replace(from, "!singleSlash(card) || card.dimensionTransferred");
  }
  if (REVERT === "source" && f === "manny-skills.js") {
    const from = "singleSlash(c) && window.CardUtils.isEntityCard(c)";
    if (!s.includes(from)) throw new Error("REVERT=source must hit entity source");
    s = s.replace(from, "singleSlash(c)");
  }
  if (REVERT === "weapon" && f === "manny-skills.js") {
    const from = "    if (!entitySingle) return;";
    if (!s.includes(from)) throw new Error("REVERT=weapon must hit beforeSlash guard");
    s = s.replace(from, "    if (!single) return;");
  }
  if (REVERT === "spike" && f === "manny-skills.js") {
    const from = "entitySingleSlash(card) && actor.mannyWeapon === \"cannon\"";
    if (!s.includes(from)) throw new Error("REVERT=spike must hit afterDamage guard");
    s = s.replace(from, "singleSlash(card) && actor.mannyWeapon === \"cannon\"");
  }
  if (REVERT === "flamer" && f === "battle-combat-attack-values.js") {
    const from = "deps.isKillCard(card) && window.CardUtils?.isEntityCard?.(card)";
    if (!s.includes(from)) throw new Error("REVERT=flamer must hit baseCardCanFlame guard");
    s = s.replace(from, "deps.isKillCard(card)");
  }
  if (REVERT === "flamerfx" && f === "manny-skills.js") {
    const from = "const fxSingle = weapon === \"flamer\" ? false";
    if (!s.includes(from)) throw new Error("REVERT=flamerfx must hit fxSingle guard");
    s = s.replace(from, "const fxSingle = weapon === \"flamer\" ? single");
  }
  if (REVERT === "double" && f === "bertis-gerlot-skills.js") {
    const from = "{ attack: 200, magic: 200, bloodlust: 200, handLimit: 200 }";
    if (!s.includes(from)) throw new Error("REVERT=double must hit arrogance multipliers");
    s = s.replace(from, "{ attack: 150, magic: 150, bloodlust: 200, handLimit: 200 }");
  }
  if (REVERT === "desc" && f === "data-characters-core.js") {
    s = s.replace("实体单体【杀】的伤害时", "单体【杀】的伤害时");
  }
  if (REVERT === "desc" && f === "data-characters-extra.js") {
    s = s.replace("基础值的2倍", "基础值的1.5倍");
  }
  if (REVERT === "notice" && f === "update-notice-recent.js") {
    const from = "        \"【曼妮】实体单体【杀】口径统一";
    if (!s.includes(from)) throw new Error("REVERT=notice must hit new notice item");
    s = s.split("\n").filter(l => !l.includes("【曼妮】实体单体【杀】口径统一")
      && !l.includes("【傲慢雌小鬼】（贝尔蒂丝）满血增益上调")).join("\n");
  }
  return (CODE[f] = s);
}
function docOf(f) {
  let s = doc(f);
  if (REVERT === "docs" && f === "03-角色与角色技能.txt") {
    s = s.replace("实体单体【杀】的伤害时", "单体【杀】的伤害时").replace("基础值的2倍", "基础值的1.5倍");
  }
  return s;
}

let pass = 0, total = 0; const reds = [];
const T = (group, name, ok, extra) => {
  total++;
  if (ok) pass++;
  else { reds.push({ group, name }); console.log(`  RED ${group} ${name}`, extra !== undefined ? JSON.stringify(extra) : ""); }
};
const isInt = v => Number.isInteger(v) && Number.isFinite(v);

// ---------- A. 源码与文案 ----------
const manny = codeOf("manny-skills.js");
const bertis = codeOf("bertis-gerlot-skills.js");
const core = codeOf("data-characters-core.js");
const extra = codeOf("data-characters-extra.js");
const recent = codeOf("update-notice-recent.js");
const d03 = docOf("03-角色与角色技能.txt");
const deepseek = doc("deepseek-rebuild/02-characters.md");
const settings = doc("original/game-settings.md");
const ruins = src("ruins-card-skills.js");

T("A", "A1 transferSlash 使用实体单体杀判据",
  manny.includes("!entitySingleSlash(card) || card.dimensionTransferred"));
T("A", "A2 实体判定统一走 CardUtils.isEntityCard",
  /singleSlash\(c\) && window\.CardUtils\.isEntityCard\(c\)/.test(manny));
T("A", "A3 次元转移角色表描述为实体单体杀且写明虚拟不触发",
  core.includes("实体单体【杀】的伤害时") && core.includes("虚拟【杀】与技能伤害不触发")
  && !core.includes("受到单体【杀】的伤害时"));
T("A", "A4 傲慢雌小鬼四项倍率统一 200 且无 150 残留",
  bertis.includes("{ attack: 200, magic: 200, bloodlust: 200, handLimit: 200 }")
  && !/attack: 150/.test(bertis));
T("A", "A5 角色表描述为 2 倍",
  extra.includes("基础值的2倍") && !extra.includes("1.5倍"));
T("A", "A6 设定文档三处同步",
  d03.includes("实体单体【杀】的伤害时") && d03.includes("基础值的2倍")
  && deepseek.includes("实体单体【杀】伤害时") && deepseek.includes("基础的 2 倍")
  && settings.includes("基础值的2倍") && settings.includes("CardUtils.isEntityCard 单一判定源"),
  { d03: d03.includes("基础值的2倍"), deepseek: deepseek.includes("基础的 2 倍"), settings: settings.includes("基础值的2倍") });
T("A", "A7 公告首期写明两条且行数未超 150",
  recent.includes("【曼妮】实体单体【杀】口径统一")
  && recent.includes("【巴特雷】") && recent.includes("【反坦克炮】")
  && recent.includes("【傲慢雌小鬼】（贝尔蒂丝）满血增益上调")
  && recent.split("\n").length <= 150, recent.split("\n").length);
T("A", "A8 废墟脆弱 1.5 倍等其它倍率未被误伤",
  ruins.includes("Math.round(amount * 150 / 100)") && src("angelica-luka-skills.js").includes("+ 0.5;"));
T("A", "A9 巴特雷/反坦克炮源码守卫与武器描述已收窄",
  manny.includes("    if (!entitySingle) return;")
  && manny.includes("entitySingleSlash(card) && actor.mannyWeapon === \"cannon\"")
  && /name: "巴特雷"[^\n]*实体单体【杀】/.test(manny)
  && /name: "反坦克炮"[^\n]*实体单体【杀】/.test(manny)
  && manny.includes("虚拟【杀】与技能生成牌不触发"));
T("A", "A10 设定文档虚拟杀接受列表已移除全部曼妮武器",
  !settings.includes("曼妮`聚焦喷火器`") && !settings.includes("曼妮`巴特雷`/`反坦克炮`/`聚焦喷火器`")
  && settings.includes("曼妮`刺刀AK47`/`巴特雷`/`反坦克炮`/`聚焦喷火器`/`次元转移`")
  && d03.includes("巴特雷（同花色杀伤害翻倍且不可响应）")
  && d03.includes("聚焦喷火器（附加火属性并改为全体目标"));
T("A", "A11 mannyDouble 伤害翻倍消费端未改动",
  src("battle-combat-attack-values.js").includes("return card.mannyDouble ? amount * 2 : amount;"));
T("A", "A12 聚焦喷火器三处判定均叠加 CardUtils.isEntityCard",
  codeOf("battle-combat-attack-values.js").includes("deps.isKillCard(card) && window.CardUtils?.isEntityCard?.(card)")
  && src("battle-effect-play.js").includes("&& !!window.CardUtils?.isEntityCard?.(card)")
  && src("battle-effect-card-plays.js").includes("&& !!window.CardUtils?.isEntityCard?.(card)"));
T("A", "A13 聚焦喷火器描述与动画分支已收窄",
  /name: "聚焦喷火器"[^\n]*实体单体【杀】/.test(manny)
  && manny.includes("虚拟【杀】与技能生成牌不触发")
  && manny.includes("weapon === \"flamer\" ? false")
  && manny.includes("card?._tempSweep\n      && !!window.CardUtils?.isEntityCard?.(card)"));
T("A", "A14 公告写明四件武器统一实体口径",
  recent.includes("【聚焦喷火器】（附加火属性、改全体目标、两段不可响应）")
  && recent.includes("不转全体火杀"));

// ---------- B. 真实 MannySkills.transferSlash ----------
function mkContext() {
  const c = { console, Math, Number, Object, Array, JSON, String, Boolean, Set, Map, Error, Date, RegExp, isNaN, parseInt, parseFloat };
  c.window = c;
  vm.createContext(c);
  c.GameDataCards = { cardCodex: [], baseDeck: [], eliteCards: [] };
  vm.runInContext(codeOf("card-utils.js"), c, { filename: "card-utils.js" });
  c.BattleLog = { add() {} };
  c.BattleLines = { skill() {}, promptVisible: () => true };
  c.__fx = 0;
  c.MannyGunSkinFX = { weaponAttack() { c.__fx += 1; }, spikeMark() {} };
  c.BattleCards = { put(_b, unit, card) { unit.discard.push(card); } };
  vm.runInContext(codeOf("manny-skills.js"), c, { filename: "manny-skills.js" });
  vm.runInContext(codeOf("battle-combat-attack-values.js"), c,
    { filename: "battle-combat-attack-values.js" });
  c.GerlotRevengeSkills = () => ({ resolveRevengeTrigger() {}, queueHeadshot() {}, modifyIncomingDamage() {} });
  vm.runInContext(codeOf("bertis-gerlot-skills.js"), c, { filename: "bertis-gerlot-skills.js" });
  return c;
}
const c = mkContext();
const entitySlash = () => ({ name: "杀（普攻）", type: "slash", suit: "♦", power: 1, scale: "attack" });
function makeState() {
  const mannyUnit = { uid: "m", ref: "manny", name: "曼妮", side: "ally", hp: 30, maxHp: 30,
    hand: [{ name: "黑牌", type: "response", suit: "♠" }], deck: [], discard: [] };
  const prot = { uid: "p", name: "友方", side: "ally", hp: 30, maxHp: 30, hand: [], stats: {} };
  const atk = { uid: "a", name: "敌方", side: "enemy", hp: 30, maxHp: 30, hand: [] };
  const foe = { uid: "f", name: "转移目标", side: "enemy", hp: 30, maxHp: 30, hand: [] };
  return { state: { battle: { allies: [mannyUnit, prot], enemies: [atk, foe], animQueue: [], locked: false }, log: [] },
    mannyUnit, prot, atk, foe };
}
function probe(cardPatch, opts = {}) {
  const x = makeState();
  const card = { ...entitySlash(), ...cardPatch };
  const target = opts.enemyTarget ? x.foe : x.prot;
  const ok = c.MannySkills.transferSlash(x.state, x.atk, target, 4, "杀", card);
  return { ok, prompt: !!x.state.battle.dimensionTransfer, locked: x.state.battle.locked, x };
}
T("B", "B1 实体单体杀正常触发并弹出转移提示",
  (() => { const r = probe({}); return r.ok && r.prompt && r.locked; })());
T("B", "B2 虚拟杀不触发、不弹提示、不锁战斗",
  (() => { const r = probe({ virtual: true }); return !r.ok && !r.prompt && !r.locked; })());
T("B", "B3 技能生成牌不触发", !probe({ generatedBySkill: true }).ok);
T("B", "B4 type:skill 伤害载荷不触发", !probe({ type: "skill" }).ok);
T("B", "B5 _skill 非转换牌不触发", !probe({ _skill: true }).ok);
T("B", "B6 群体杀不触发", !probe({ sweep: true }).ok);
T("B", "B7 转换杀（实体）照常触发", probe({ convertedFrom: "闪" }).ok);
T("B", "B8 饰品实体转换牌照常触发", probe({ _skill: true, _entityConversion: true }).ok);
T("B", "B9 已转移过的伤害不二次触发", !probe({ dimensionTransferred: true }).ok);
T("B", "B10 敌方受击不触发", !probe({}, { enemyTarget: true }).ok);
T("B", "B11 完整转移结算：弃黑牌、伤害给敌人、解锁",
  (() => {
    const r = probe({}); const { state, mannyUnit, foe } = r.x;
    c.MannySkills.selectDimensionTransferCard(state, 0);
    let hit = null;
    const ok = c.MannySkills.resolveDimensionTransfer(state, foe.uid, (_s, target) => { hit = target; });
    return ok && hit === foe && mannyUnit.hand.length === 0 && mannyUnit.discard.length === 1
      && !state.battle.dimensionTransfer && state.battle.locked === false;
  })());
T("B", "B12 虚拟杀后仍可正常用实体杀开启提示",
  (() => {
    const x = makeState();
    c.MannySkills.transferSlash(x.state, x.atk, x.prot, 4, "虚拟", { ...entitySlash(), virtual: true });
    const ok = c.MannySkills.transferSlash(x.state, x.atk, x.prot, 4, "实体", entitySlash());
    return ok && !!x.state.battle.dimensionTransfer;
  })());

// ---------- C. 真实 BertisGerlotSkills.refreshArrogance ----------
function arroganceUnit(attack, magic) {
  return { uid: "b", ref: "bertis", side: "ally", hp: 50, maxHp: 50,
    skills: [{ name: "傲慢雌小鬼" }], stats: { attack, magic, bloodlust: 1, handLimit: 3 }, intent: 0 };
}
function refresh(u) {
  c.BertisGerlotSkills.refreshArrogance({ battle: { allies: [u], enemies: [] } });
  return { ...u.stats };
}
const u1 = arroganceUnit(9, 7);
const full1 = refresh(u1);
T("C", "C1 满血攻/魔/淫气/手牌上限均为 2 倍",
  full1.attack === 18 && full1.magic === 14 && full1.bloodlust === 2 && full1.handLimit === 6, full1);
T("C", "C2 2 倍换算后四项仍为整数", Object.values(full1).every(isInt), full1);
u1.hp = 49;
const hurt = refresh(u1);
T("C", "C3 掉血后回落基础值",
  hurt.attack === 9 && hurt.magic === 7 && hurt.bloodlust === 1 && hurt.handLimit === 3, hurt);
u1.hp = 50;
const full2 = refresh(u1);
T("C", "C4 恢复满血再次加成且幂等（不叠加）",
  full2.attack === 18 && full2.magic === 14 && JSON.stringify(full2) === JSON.stringify(full1), full2);
const u2 = arroganceUnit(3, 4);
const small = refresh(u2);
T("C", "C5 小基值 3/4 同样精确 2 倍",
  small.attack === 6 && small.magic === 8 && small.bloodlust === 2 && small.handLimit === 6, small);
T("C", "C6 满血增益不再写 1.5 倍小数属性", !Object.values(full1).some(v => !isInt(v)));

// ---------- D. 巴特雷 / 反坦克炮 真实 beforeSlash / afterDamage ----------
function weaponProbe(weapon, patch = {}, suit = "♠") {
  const actor = { uid: "mw", ref: "manny", name: "曼妮", hp: 30, maxHp: 30,
    stats: { attack: 5 }, mannyWeapon: weapon,
    mannyBarrettSuit: weapon === "barrett" ? suit : null };
  const card = { name: "杀（普攻）", type: "slash", suit, power: 1, scale: "attack", ...patch };
  c.__fx = 0;
  c.MannySkills.beforeSlash({ battle: {} }, actor, { uid: "t" }, card);
  return { card, fx: c.__fx };
}
function spikeProbe(patch = {}) {
  const target = { uid: "t", name: "目标", side: "enemy", hp: 30, maxHp: 30,
    statuses: [], spikeShell: false };
  const actor = { uid: "mw", ref: "manny", name: "曼妮", hp: 30, maxHp: 30,
    mannyWeapon: "cannon", stats: { attack: 5 } };
  const card = { name: "杀（普攻）", type: "slash", suit: "♦", power: 1, scale: "attack", ...patch };
  c.MannySkills.afterDamage(
    { battle: { allies: [actor], enemies: [target] }, log: [] },
    actor, target, card, 5, {}, () => {});
  return target;
}
T("D", "D1 实体杀：巴特雷翻倍且不可响应、播放武器特效",
  (() => { const r = weaponProbe("barrett"); return r.card.mannyDouble && r.card.ignoreResponse && r.fx === 1; })());
T("D", "D2 虚拟杀：巴特雷不翻倍、不锁响应、不播特效（花色匹配也不行）",
  (() => { const r = weaponProbe("barrett", { virtual: true }); return !r.card.mannyDouble && !r.card.ignoreResponse && r.fx === 0; })());
T("D", "D3 技能生成牌：巴特雷不触发",
  !weaponProbe("barrett", { generatedBySkill: true }).card.mannyDouble);
T("D", "D4 实体杀：反坦克炮无视护甲、播放武器特效",
  (() => { const r = weaponProbe("cannon"); return r.card.ignoreBlock && r.fx === 1; })());
T("D", "D5 虚拟杀：反坦克炮不无视护甲、不播特效",
  (() => { const r = weaponProbe("cannon", { virtual: true }); return !r.card.ignoreBlock && r.fx === 0; })());
T("D", "D6 实体转换杀与饰品实体转换牌照常生效",
  weaponProbe("cannon", { convertedFrom: "闪" }).card.ignoreBlock
  && weaponProbe("barrett", { _skill: true, _entityConversion: true }).card.mannyDouble);
T("D", "D7 群体杀不触发两件武器",
  !weaponProbe("barrett", { sweep: true }).card.mannyDouble
  && !weaponProbe("cannon", { allTargets: ["x"] }).card.ignoreBlock);
T("D", "D8 聚焦喷火器虚拟杀不播动画、伪造 _tempSweep 也不播；实体杀照常",
  weaponProbe("flamer", { virtual: true }).fx === 0
  && weaponProbe("flamer", { virtual: true, _tempSweep: true }).fx === 0
  && weaponProbe("flamer", { _tempSweep: true }).fx === 1);
T("D", "D8b 刺刀AK47 口径不变（虚拟杀仍播动画）",
  weaponProbe("ak47", { virtual: true }).fx === 1);
T("D", "D9 刺弹：实体杀挂标记，虚拟杀与技能生成牌不挂",
  !!spikeProbe().spikeShell && !spikeProbe({ virtual: true }).spikeShell
  && !spikeProbe({ generatedBySkill: true }).spikeShell);
T("D", "D10 刺弹标记同步写状态图标且不重复叠加",
  (() => { const t = spikeProbe(); return t.statuses.filter(s => s === "刺弹").length === 1; })());
const flameValues = c.BattleCombatAttackValues({
  deps: { isKillCard: x => x?.type === "slash" },
});
const flameActor = { ref: "manny", mannyWeapon: "flamer" };
const flameCard = p => ({ name: "杀（普攻）", type: "slash", suit: "♦", power: 1, ...p });
T("D", "D11 真实 baseCardCanFlame：实体单体杀放行、虚拟/技能/群体拒绝",
  flameValues.baseCardCanFlame(flameActor, flameCard({}))
  && flameValues.baseCardCanFlame(flameActor, flameCard({ convertedFrom: "闪" }))
  && !flameValues.baseCardCanFlame(flameActor, flameCard({ virtual: true }))
  && !flameValues.baseCardCanFlame(flameActor, flameCard({ generatedBySkill: true }))
  && !flameValues.baseCardCanFlame(flameActor, flameCard({ type: "skill" }))
  && !flameValues.baseCardCanFlame(flameActor, flameCard({ sweep: true })));
T("D", "D12 非曼妮 / 非喷火器武器不误触发",
  !flameValues.baseCardCanFlame({ ref: "lokar", mannyWeapon: "flamer" }, flameCard({}))
  && !flameValues.baseCardCanFlame({ ref: "manny", mannyWeapon: "ak47" }, flameCard({})));

// ---------- 汇总 / 反向 ----------
console.log(`RESULT ${pass}/${total}`);
if (reds.length) {
  const groups = [...new Set(reds.map(r => r.group))];
  console.log(`REVERT=${REVERT || "none"} REDS=${JSON.stringify(reds.map(r => r.name))} GROUPS=${JSON.stringify(groups)}`);
  const expected = { entity: ["A", "B"], source: ["A", "B", "D"], double: ["A", "C"],
    desc: ["A"], notice: ["A"], docs: ["A"],
    weapon: ["A", "D"], spike: ["A", "D"],
    flamer: ["A", "D"], flamerfx: ["A", "D"] }[REVERT];
  if (REVERT) {
    const ok = expected && expected.every(g => groups.includes(g))
      && groups.every(g => expected.includes(g));
    console.log(ok ? `REVERT=${REVERT} OK own>0 other=0` : `REVERT=${REVERT} IMPRECISE`);
    if (!ok) process.exit(1);
  } else process.exit(1);
} else {
  if (REVERT) { console.log(`REVERT=${REVERT} FAILED (no red, assertion is a no-op)`); process.exit(1); }
}
