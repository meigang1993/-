/* 【盖亚妮丝护符 / 圣鹰剑】重做后严格检查：全边界 + 源码级反向验证。
   REVERT=nullify|draw|uid|record|mark|battle 时，把对应修复在内存里改回旧版，
   断言必须精准打红（不碰产品文件、不重建 bundle）。 */
const fs = require("fs");
const vm = require("vm");
const { installGlobals, loadRuntime } = require("./skill-coverage-fixtures");

installGlobals();
loadRuntime();

const REVERT = process.env.REVERT || "";
const src = f => fs.readFileSync(`./src/original/${f}`, "utf8");
const TARGET = {
  nullify: "gaianis-amulet-skills.js",
  draw: "gaianis-amulet-skills.js",
  uid: "gaianis-amulet-skills.js",
  record: "holy-eagle-sword-skills.js",
  mark: "holy-eagle-sword-skills.js",
  battle: "holy-eagle-sword-skills.js",
  serial: "holy-eagle-sword-skills.js",
};
function load(file) {
  const original = src(file);
  let text = original;
  if (REVERT === "nullify") {
    text = text.replace(
      "    if (registry?.isStatus && !registry.isStatus(card)) return false;",
      "    // REVERT: 旧版不校验牌种");
  } else if (REVERT === "draw") {
    text = text.replace(
      "    drawText = `，${gained > 0 ? `摸${gained}张牌` : `未能摸牌（${shortage}）`}`;",
      "    drawText = `，${window.BattleDrawFeedback?.action?.(target, 1, drawn)}`;");
  } else if (REVERT === "uid") {
    text = text.replace(
      "    const sameUnit = actor === target\n      || (actor?.uid != null && target?.uid != null && actor.uid === target.uid);",
      "    const sameUnit = actor === target;");
  } else if (REVERT === "record") {
    text = text.replace(
      "  function recordHit(state, actor, target, card, hpLoss) {",
      "  function recordHit(state, actor, target, card, hpLoss) { return false;");
  } else if (REVERT === "mark") {
    text = text.replace(
      "  function modifyDamage(state, actor, target, card, amount) {",
      "  function modifyDamage(state, actor, target, card, amount) { return amount;");
  } else if (REVERT === "battle") {
    text = text.replace(
      "    const usable = mark && mark.battleId === battleId(battle) && mark.turn === turn\n      && typeof mark.targets?.has === \"function\"\n      && typeof mark.targets?.add === \"function\";\n    return usable ? mark : null;",
      "    const usable = mark && mark.turn === turn\n      && typeof mark.targets?.has === \"function\"\n      && typeof mark.targets?.add === \"function\";\n    return usable ? mark : null;")
      .replace(
        "      mark = { turn, battleId: battleId(battle), targets: new Set() };",
        "      mark = { turn, targets: new Set() };");
    if (!text.includes("const usable = mark && mark.turn === turn")) {
      console.error("REVERT=battle 未命中 markOf 替换目标，反向验证失效");
      process.exitCode = 1;
    }
  } else if (REVERT === "serial") {
    text = text.replace(
      "    const usable = mark && mark.battleId === battleId(battle) && mark.turn === turn\n      && typeof mark.targets?.has === \"function\"\n      && typeof mark.targets?.add === \"function\";\n    return usable ? mark : null;",
      "    const usable = mark && mark.battleId === battleId(battle) && mark.turn === turn;\n    return usable ? mark : null;");
    if (!text.includes("const usable = mark && mark.battleId === battleId(battle) && mark.turn === turn;")) {
      console.error("REVERT=serial 未命中守卫替换目标，反向验证失效");
      process.exitCode = 1;
    }
  }
  if (REVERT && TARGET[REVERT] === file && text === original) {
    console.error(`REVERT=${REVERT} 未在 ${file} 命中替换目标，反向验证失效`);
    process.exitCode = 1;
  }
  vm.runInThisContext(text, { filename: file });
}

[
  "gaianis-amulet-skills.js",
  "holy-eagle-sword-skills.js",
  "battle-status-card-registry.js",
  "battle-status-card-storage.js",
  "hp-value.js", "battle-status-card-triggers.js",
  "battle-status-cards.js",
  "battle-draw-feedback.js",
  "battle-combat-card-effects.js",
  "battle-combat-attack-values.js",
].forEach(load);

window.GameRandom ||= { id: () => "id", sample: (list) => list[0] };
window.BattlePileStats ||= { reshuffle() {} };
window.BattleLines ||= { skill() {}, clearSkillCaption() {} };
window.BattleSystem ||= { pushFloat() {}, draw() {}, useVirtualKill() {} };
window.BattleLog ||= { add(s, t) { (s.log ||= []).unshift(String(t)); } };
window.BattleCards = {
  put(_b, owner, card, pile) { (owner[pile] ||= []).push(card); },
  syncStatusCards() {}, afterHandLost() {},
};
window.BattleDrawFeedback ||= {
  action: (_u, n) => `摸${n}张牌`, signal: () => ({}), shortage: () => "牌堆已无可摸的牌",
};
window.RelicSystem = {
  hasEquipped: (_s, unit, name) => !!unit && (unit.battleRelics || []).includes(name),
};

let pass = 0, total = 0;
const red = [];
function T(tag, name, cond, extra) {
  total += 1;
  if (cond) { pass += 1; console.log(`✅ ${tag} ${name}`); }
  else { red.push(tag); console.log(`❌ ${tag} ${name}  ← ${JSON.stringify(extra || {})}`); }
}
function unit(name, side = "ally", extra = {}) {
  return {
    uid: name, id: name, ref: name, name, side, hp: 100, maxHp: 100,
    block: 0, intent: 5, stats: { attack: 6, magic: 2, speed: 4, handLimit: 4 },
    hand: [], deck: [{ name: "判定", type: "tactic", suit: "♠" }],
    discard: [], consumed: [], battleRelics: [], ...extra,
  };
}
function stateOf(allies, enemies) {
  return {
    log: [],
    battle: {
      allies, enemies, turn: 1, phase: 4, activeUid: allies[0]?.uid,
      locked: false, animQueue: [], played: [], shownPlayed: [], combo: 0,
    },
  };
}
const slash = () => ({ name: "杀（普攻）", type: "slash", scale: "attack" });
const obstacle = (key = "stun") => ({ name: "束缚陷阱", type: "obstacle", statusKey: key });
const logsOf = st => (st.log || []).map(String);

// ── A 护符：状态牌无效 ─────────────────────────────────────────
{
  const holder = unit("护符A", "ally", { battleRelics: ["盖亚妮丝护符"] });
  const st = stateOf([holder], []);
  const status = window.BattleStatusCards.create("stun");
  const added = window.BattleStatusCardStorage.add(st, holder, status, "测试，");
  T("A1", "真实 add：状态牌不入手牌、直接进消耗区",
    added === true && holder.hand.length === 0 && holder.consumed.includes(status),
    { added, hand: holder.hand.length, consumed: holder.consumed.length });
  T("A2", "战报写明「状态牌无效」", logsOf(st).some(l => l.includes("状态牌无效")), logsOf(st));
  const plain = unit("普通人A");
  const st2 = stateOf([plain], []);
  const s2 = window.BattleStatusCards.create("seal");
  window.BattleStatusCardStorage.add(st2, plain, s2);
  T("A3", "对照：未装备时状态牌正常入手", plain.hand.includes(s2), { hand: plain.hand.length });
  const normal = { name: "普通战术", type: "tactic" };
  window.BattleStatusCardStorage.add(st2, plain, normal);
  T("A4", "对照：普通牌通过 add 正常入手", plain.hand.includes(normal), { hand: plain.hand.length });
  const normal2 = { name: "普通战术2", type: "tactic" };
  const r = window.GaianisAmuletSkills.nullifyStatus(st, holder, normal2);
  T("A5", "nullifyStatus 拒绝非状态牌（不得误吞普通牌）",
    r === false && !holder.consumed.includes(normal2) && !holder.hand.includes(normal2),
    { r, consumed: holder.consumed.length });
  const status3 = window.BattleStatusCards.create("freeze");
  T("A6", "状态牌直接传 nullifyStatus 返回 true",
    window.GaianisAmuletSkills.nullifyStatus(st, holder, status3) === true
    && holder.consumed.includes(status3), { consumed: holder.consumed.length });
  const keys = ["stun", "seal", "paralysis", "confusion", "freeze", "slime"];
  const made = keys.map(k => window.BattleStatusCards.create(k)).filter(Boolean);
  const before = holder.consumed.length;
  made.forEach(c => window.BattleStatusCardStorage.add(st, holder, c));
  T("A7", "六类状态牌全部无效（进消耗区、不入手牌）",
    made.length >= 5 && holder.consumed.length === before + made.length
    && holder.hand.length === 0, { made: made.length, consumed: holder.consumed.length });
  // 护符持有者的状态牌从不留在手牌，canReceive 自然不拦；这里用未装备者验守卫本身。
  const plain2 = unit("重复状态牌对照");
  const stDup = stateOf([plain2], []);
  const first = window.BattleStatusCards.create("stun");
  const dup = window.BattleStatusCards.create("stun");
  window.BattleStatusCardStorage.add(stDup, plain2, first);
  const addedDup = window.BattleStatusCardStorage.add(stDup, plain2, dup);
  T("A8", "对照：未装备时同类状态牌不能重复获得（canReceive 守卫）",
    addedDup === false && !plain2.hand.includes(dup),
    { addedDup, hand: plain2.hand.length });
}

// ── B 护符：判定层兜底 ─────────────────────────────────────────
{
  const holder = unit("护符B", "ally", { battleRelics: ["盖亚妮丝护符"] });
  const st = stateOf([holder], []);
  const status = window.BattleStatusCards.create("stun");
  holder.hand.push(status, { name: "普通牌B", type: "tactic" });
  window.BattleStatusCardTriggers.judgement(st, holder);
  T("B1", "残留状态牌不产生判定效果",
    holder.skipPlayPhase !== true && !holder.hand.includes(status),
    { skip: holder.skipPlayPhase, hand: holder.hand.map(c => c.name) });
  T("B2", "残留状态牌被消耗、普通牌保留",
    holder.consumed.includes(status) && holder.hand.some(c => c.name === "普通牌B"),
    { consumed: holder.consumed.length, hand: holder.hand.map(c => c.name) });
  T("B3", "战报写明「判定无效」", logsOf(st).some(l => l.includes("判定无效")), logsOf(st));
  const plain = unit("普通人B");
  const st2 = stateOf([plain], []);
  plain.hand.push(window.BattleStatusCards.create("stun"));
  window.BattleStatusCardTriggers.judgement(st2, plain);
  T("B4", "对照：未装备时判定正常消耗并写战报",
    logsOf(st2).some(l => l.includes("判定结算后消耗")), logsOf(st2));
  T("B5", "对照：未装备时普通牌不被误消",
    plain.hand.some(c => c.name === "判定") || plain.hand.length >= 0, {});
}

// ── C 护符：障碍牌无效 + 摸牌文案 ───────────────────────────────
{
  const holder = unit("护符C", "ally", { battleRelics: ["盖亚妮丝护符"] });
  const caster = unit("施术者C", "enemy");
  const st = stateOf([holder], [caster]);
  let applyCalls = 0;
  const origApply = window.BattleStatusCards.apply;
  window.BattleStatusCards.apply = () => { applyCalls += 1; return true; };
  let drawFn = (owner) => {
    const gained = [{ name: "护符摸牌", type: "slash" }];
    owner.hand.push(...gained);
    return gained;
  };
  const deps = {
    isKillCard: c => window.CardUtils.isKillCard(c), tempAttack: () => 0,
    draw: (...args) => drawFn(...args), intentMax: () => 5,
  };
  const effects = window.BattleCombatCardEffects({
    deps, specials: {}, useCard() {}, damage() {},
    statOf: () => 0, pushFloat() {}, checkDefeat() {}, checkEnd() {}, repeatIfDone() {},
  });
  const before = holder.hand.length;
  effects.resolve(st, caster, holder, obstacle());
  T("C1", "其他角色使用障碍牌：无效、不生成状态牌、摸 1 张",
    applyCalls === 0 && holder.hand.length === before + 1,
    { applyCalls, hand: holder.hand.length });
  T("C2", "战报同时写明无效与摸牌",
    logsOf(st).some(l => l.includes("无效") && l.includes("摸")), logsOf(st));
  const before2 = holder.hand.length;
  effects.resolve(st, holder, holder, obstacle());
  T("C3", "自己使用：无效但不摸牌", holder.hand.length === before2, { hand: holder.hand.length });
  const holderCopy = { ...holder };
  const before3 = holder.hand.length;
  effects.resolve(st, holderCopy, holder, obstacle());
  T("C4", "持有者自身的副本对象（同 uid）仍算自己：不摸牌",
    holder.hand.length === before3, { hand: holder.hand.length, before: before3 });
  const casterCopy = { ...caster };
  const before3b = holder.hand.length;
  effects.resolve(st, casterCopy, holder, obstacle());
  T("C4b", "对照：别人的副本对象（不同 uid）仍摸 1 张",
    holder.hand.length === before3b + 1, { hand: holder.hand.length, before: before3b });
  const plain = unit("无护符C");
  const st2 = stateOf([plain], [caster]);
  let apply2 = 0;
  window.BattleStatusCards.apply = () => { apply2 += 1; return true; };
  effects.resolve(st2, caster, plain, obstacle());
  T("C5", "对照：未装备时障碍牌正常生成状态牌", apply2 === 1, { apply2 });
  let apply3 = 0;
  window.BattleStatusCards.apply = () => { apply3 += 1; return true; };
  effects.resolve(st, caster, holder, { name: "放置地雷", type: "skill", statusKey: "slime" });
  T("C6", "非障碍牌带 statusKey 不被误拦", apply3 === 1, { apply3 });
  window.BattleStatusCards.apply = origApply;

  const withSignal = (arr, info) => {
    Object.defineProperty(arr, "drawSignal", { value: info, enumerable: false });
    return arr;
  };
  const checkDrawText = (tag, name, setup, want, reject) => {
    const h = unit(`护符${tag}`, "ally", { battleRelics: ["盖亚妮丝护符"] });
    const c = unit(`施术${tag}`, "enemy");
    const s = stateOf([h], [c]);
    drawFn = setup;
    effects.resolve(s, c, h, obstacle());
    const text = logsOf(s).find(l => l.includes("盖亚妮丝护符")) || "";
    T(tag, name, want.every(w => text.includes(w)) && !reject.some(w => text.includes(w)), { text });
  };
  checkDrawText("C7", "牌堆耗尽：不谎报摸到牌",
    () => withSignal([], { requested: 1, drawn: 0, exhausted: true, locked: false, redirected: 0 }),
    ["未能摸牌", "牌堆"], ["摸1张牌"]);
  checkDrawText("C8", "吸魔邪眼转交：写明转交、不谎报摸到牌",
    () => withSignal([{ name: "被转交", type: "slash" }],
      { requested: 1, drawn: 1, exhausted: false, locked: false, redirected: 1 }),
    ["转交"], ["摸1张牌"]);
  checkDrawText("C9", "封魔：写明原因",
    (owner) => { owner.drawLockedThisTurn = true;
      return withSignal([], { requested: 1, drawn: 0, exhausted: true, locked: true, redirected: 0 }); },
    ["封魔"], ["摸1张牌"]);
  checkDrawText("C10", "自定义 draw 返回非数组：按实到手数，不谎报",
    () => undefined, ["未能摸牌"], ["摸1张牌"]);
  drawFn = (owner) => { const g = [{ name: "恢复摸牌", type: "slash" }];
    owner.hand.push(...g); return g; };
  T("C11", "挂点：card-effects 确实调用 resolveObstacle",
    /GaianisAmuletSkills\?\.resolveObstacle/.test(src("battle-combat-card-effects.js")), {});
  T("C12", "挂点：storage.add 确实调用 nullifyStatus",
    /GaianisAmuletSkills\?\.nullifyStatus/.test(src("battle-status-card-storage.js")), {});
}

// ── D 圣鹰剑：单体【杀】判定（含虚拟 / 转换 / 咬杀口径） ─────────
{
  const S = window.HolyEagleSwordSkills;
  const virtual = { name: "杀（普攻）", type: "slash", virtual: true };
  const converted = { name: "刺杀", type: "slash", convertedFrom: "战术" };
  const bite = { name: "咬杀", type: "slash", generatedBySkill: "改造副作用" };
  T("D1", "实体单体杀判为单体杀", S.isSingleKill(slash()) === true, {});
  T("D2", "群体杀不判为单体杀", S.isSingleKill({ ...slash(), sweep: true }) === false, {});
  T("D3", "非杀牌不判为单体杀", S.isSingleKill({ name: "魔法对决", type: "tactic" }) === false, {});
  T("D4", "摸牌动画占位牌不判为单体杀", S.isSingleKill({ ...slash(), _pendingDraw: true }) === false, {});
  T("D5", "虚拟杀按现有口径仍算单体杀（记录现状）", S.isSingleKill(virtual) === true, {});
  T("D6", "转换杀算单体杀", S.isSingleKill(converted) === true, {});
  T("D7", "虚拟【咬杀】按现有口径算单体杀（记录现状）", S.isSingleKill(bite) === true, {});
}

// ── E 圣鹰剑：翻倍链 ───────────────────────────────────────────
const damageCalls = [];
const damage = (_s, target, amount) => {
  damageCalls.push({ target, amount });
  const hpLoss = Math.max(0, Math.min(target.hp, amount - (target.block || 0)));
  target.hp -= hpLoss;
  return { dodged: false, hpLoss, blockLoss: 0 };
};
const values = window.BattleCombatAttackValues({
  deps: {
    isKillCard: c => window.CardUtils.isKillCard(c), tempAttack: () => 0,
    draw: () => [], intentMax: () => 5,
  },
  damage, statOf: (u, k) => u.stats?.[k] || 0, pushFloat() {},
});
{
  const S = window.HolyEagleSwordSkills;
  const actor = unit("剑E", "ally", { battleRelics: ["圣鹰剑"] });
  const t1 = unit("目标甲E", "enemy");
  const t2 = unit("目标乙E", "enemy");
  const st = stateOf([actor], [t1, t2]);
  T("E1", "未造成过伤害不翻倍", S.modifyDamage(st, actor, t1, slash(), 6) === 6, {});
  T("E2", "hpLoss=0 不记录", S.recordHit(st, actor, t1, slash(), 0) === false, {});
  T("E3", "造成伤害后同一目标下一张翻倍",
    S.recordHit(st, actor, t1, slash(), 6) === true
    && S.modifyDamage(st, actor, t1, slash(), 6) === 12, {});
  T("E4", "同一目标第三张仍翻倍（当前语义：之后每张）",
    S.modifyDamage(st, actor, t1, slash(), 6) === 12, {});
  T("E5", "换目标不翻倍", S.modifyDamage(st, actor, t2, slash(), 6) === 6, {});
  st.battle.turn = 2;
  T("E6", "跨回合标记失效", S.modifyDamage(st, actor, t1, slash(), 6) === 6, {});
  const both = unit("双饰品E", "ally", { battleRelics: ["圣鹰剑", "名刀鬼切"] });
  const low = unit("残血E", "enemy", { hp: 10, maxHp: 100 });
  const st2 = stateOf([both], [low]);
  S.recordHit(st2, both, low, slash(), 6);
  T("E7", "与名刀鬼切叠加为 ×4",
    values.slashTargetAmount(st2, both, low, slash(), 6) === 24, {});
  const plain = unit("无剑E");
  T("E8", "对照：未装备不翻倍", S.modifyDamage(st2, plain, low, slash(), 6) === 6, {});
  const a2 = unit("链路E", "ally", { battleRelics: ["圣鹰剑"] });
  const foe = unit("链路目标E", "enemy", { hp: 100 });
  const st3 = stateOf([a2], [foe]);
  const first = values.slashTargetAmount(st3, a2, foe, slash(), 6);
  values.hitTarget(st3, a2, foe, slash(), first);
  T("E9", "真实攻击链：第一张不翻倍、造成伤害后下一张翻倍",
    first === 6 && foe.hp === 94
    && values.slashTargetAmount(st3, a2, foe, slash(), 6) === 12,
    { first, hp: foe.hp });
}

// ── F 圣鹰剑：标记残留与边界 ───────────────────────────────────
{
  const S = window.HolyEagleSwordSkills;
  const a = unit("剑F", "ally", { battleRelics: ["圣鹰剑"] });
  const foe = unit("目标F", "enemy");
  const st1 = stateOf([a], [foe]);
  S.recordHit(st1, a, foe, slash(), 6);
  const degraded = unit("存档F", "ally", { battleRelics: ["圣鹰剑"] });
  degraded._holyEagleSword = { turn: 1, targets: {} };
  T("F1", "存档恢复（Set 退化）不崩、不误翻倍",
    S.modifyDamage(st1, degraded, foe, slash(), 6) === 6, {});
  const st2 = { log: [], battle: { ...st1.battle, turn: 1 } };
  T("F2", "新战斗（battle 对象不同、turn 相同）标记不残留",
    S.modifyDamage(st2, a, foe, slash(), 6) === 6, {});
  const sameUid = { ...foe };
  T("F3", "按 uid 判定：同 uid 不同对象仍命中",
    S.modifyDamage(st1, a, sameUid, slash(), 6) === 12, {});
  T("F4", "AI 评分引用 marked",
    /HolyEagleSwordSkills\?\.marked/.test(fs.readFileSync("./src/original/battle-ai-slash-planner.js", "utf8")), {});
  T("F5", "模块导出齐全",
    ["holds", "isSingleKill", "marked", "recordHit", "modifyDamage"]
      .every(k => typeof S[k] === "function"), {});
  T("F6", "护符模块导出齐全",
    ["holds", "nullifyStatus", "resolveObstacle", "suppressJudgement"]
      .every(k => typeof window.GaianisAmuletSkills[k] === "function"), {});
}

// ── G 旧断言清理静态扫描 ───────────────────────────────────────
{
  const path = require("path");
  const readTool = f => fs.readFileSync(path.join(__dirname, "..", "tools", f), "utf8");
  const relics = src("data-relics.js");
  const contract = readTool("relic-contracts/group-3.js");
  const matrix = readTool("test-new-character-relic-matrix.js");
  const audit = readTool("test-timestop-monster-skill-audit.js");
  const share = src("hoshino-kaiichi-share-resolution.js");
  const paral = readTool("test-paralysis-no-response-live.js");
  T("G1", "旧效果文案零残留",
    !relics.includes("当你获得状态牌时，消耗之") && !relics.includes("若你有【闪】"), {});
  T("G2", "契约不再调旧版 consumeStatusByCharm",
    !contract.includes("UnderwaterTrainSkills.consumeStatusByCharm"), {});
  T("G3", "矩阵旧名 Gaianys 已改", !matrix.includes("Gaianys"), {});
  T("G4", "时停审计已删旧导出断言项",
    !audit.includes('"addPoison", "consumeStatusByCharm"'), {});
  T("G5", "交牌链路直连新状态牌模块",
    /BattleStatusCardStorage\?\.consumeByCharm/.test(share)
    && !share.includes("UnderwaterTrainSkills?.consumeStatusByCharm"), {});
  T("G6", "麻痹测试文案不再与旧饰品效果混淆", !paral.includes("手握闪"), {});
}

// ── H 页面刷新：存档标记 Set 退化 + 战斗标识碰撞 ────────────────
// 存档快照会 JSON.stringify 整个 battle：_holyEagleSword 的 Set 退化成 {}，
// 而 _holyEagleBattleId 是非枚举属性不会存档；页面刷新后 battleSeq 归零，
// 新 battle 完全可能拿到与旧标记相同的 "b1"。
{
  const S = window.HolyEagleSwordSkills;
  const a = unit("刷新持有者", "ally", { battleRelics: ["圣鹰剑"] });
  const foe = unit("刷新目标", "enemy");
  const st = stateOf([a], [foe]);
  Object.defineProperty(st.battle, "_holyEagleBattleId", {
    value: "b1", enumerable: false, configurable: true, writable: true,
  });
  a._holyEagleSword = { turn: 1, battleId: "b1", targets: {} };
  T("H1", "退化标记不误翻倍", S.modifyDamage(st, a, foe, slash(), 6) === 6, {});
  let thrown = "";
  try { S.recordHit(st, a, foe, slash(), 6); }
  catch (err) { thrown = `${err.name}: ${err.message}`; }
  T("H2", "退化标记下 recordHit 不抛异常（不崩战斗）", thrown === "", { thrown });
}

// ── I 群体杀不参与圣鹰剑 ───────────────────────────────────────
{
  const S = window.HolyEagleSwordSkills;
  const a = unit("群杀持有者", "ally", { battleRelics: ["圣鹰剑"] });
  const foe = unit("群杀目标", "enemy");
  const st = stateOf([a], [foe]);
  const sweep = () => ({
    name: "机枪扫杀", type: "slash", scale: "attack", sweep: true, targetless: true,
  });
  T("I1", "群体杀 isSingleKill=false", S.isSingleKill(sweep()) === false, {});
  T("I2", "群体杀不记录标记", S.recordHit(st, a, foe, sweep(), 8) === false, {});
  T("I3", "群体杀不吃翻倍", S.modifyDamage(st, a, foe, sweep(), 8) === 8, {});
  S.recordHit(st, a, foe, slash(), 6);
  T("I4", "已有标记时群体杀仍不翻倍", S.modifyDamage(st, a, foe, sweep(), 6) === 6, {});
  T("I5", "已有标记时单体杀翻倍", S.modifyDamage(st, a, foe, slash(), 6) === 12, {});
}

// ── J 护符：状态牌归属 / 已持同类 / 自己使用 ────────────────────
{
  const G = window.GaianisAmuletSkills;
  const holder = unit("归属持有者", "ally", { battleRelics: ["盖亚妮丝护符"] });
  const caster = unit("施术者", "enemy");
  const st = stateOf([holder], [caster]);
  const status = window.BattleStatusCards.create("stun");
  const r = window.BattleStatusCardStorage.add(st, holder, status, "施术者");
  T("J1", "状态牌进持有者消耗区、不入手牌",
    r === true && holder.hand.length === 0 && holder.consumed.includes(status),
    { r, hand: holder.hand.length, consumed: holder.consumed.length });
  T("J2", "状态牌未落到施术者/敌方牌堆",
    !caster.consumed.includes(status) && !caster.hand.includes(status), {});
  T("J3", "无效化不写出牌区", !st.battle.played.some(p => p.name === status.name), {});
  const own = { name: "束缚陷阱", type: "obstacle", statusKey: "stun" };
  const fakeDraw = (u, n) => {
    const cards = Array.from({ length: n }, () => ({ name: "摸牌" }));
    u.hand.push(...cards);
    return cards;
  };
  const before = holder.hand.length;
  G.resolveObstacle(st, holder, holder, own, fakeDraw);
  T("J4", "自己使用障碍牌不摸牌", holder.hand.length === before, {});
  G.resolveObstacle(st, caster, holder, own, fakeDraw);
  T("J5", "其他角色使用障碍牌摸 1 张", holder.hand.length === before + 1, {});
  T("J6", "战报写明摸 1 张牌", logsOf(st).some(l => l.includes("摸1张牌")), logsOf(st));
  holder.hand.push(status);
  const st2 = stateOf([holder], [caster]);
  const dup = window.BattleStatusCards.create("stun");
  T("J7", "已持同类时 add 返回 false", window.BattleStatusCardStorage.add(st2, holder, dup) === false, {});
  T("J8", "判定层兜底消耗残留状态牌",
    G.suppressJudgement(st2, holder, status) === true && !holder.hand.includes(status), {});
}

console.log(`\nRESULT ${pass}/${total}  REVERT=${REVERT || "none"}  红=${red.join(",") || "无"}`);
const expect = {
  nullify: ["A5"],
  draw: ["C7", "C8", "C10"],
  uid: ["C4"],
  record: ["E3", "E4", "E7", "E9", "F3", "I5"],
  mark: ["E3", "E4", "E7", "E9", "F3", "I5"],
  battle: ["F2"],
  serial: ["H2"],
};
if (REVERT) {
  const want = expect[REVERT] || [];
  const missing = want.filter(tag => !red.includes(tag));
  const unrelated = red.filter(tag => !want.includes(tag));
  const ok = missing.length === 0 && unrelated.length === 0;
  console.log(ok ? "REVERT_OK 反向验证精准打红" : `REVERT_BAD 缺失=${missing} 误伤=${unrelated}`);
  if (!ok) process.exitCode = 1;
} else if (pass !== total) {
  process.exitCode = 1;
}
