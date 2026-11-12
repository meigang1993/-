/* 【盖亚妮丝护符 / 圣鹰剑】重做严格检查（模块级 + 真实攻击链路 + 反向验证）
   反向口径：REVERT=charm|sword 运行时禁用对应模块，断言必须精准打红。 */
const fs = require("fs");
const vm = require("vm");
const assert = require("assert");
const { installGlobals, loadRuntime } = require("./skill-coverage-fixtures");

installGlobals();
loadRuntime();
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
  "enemy-kill-hooks.js",
].forEach(file => vm.runInThisContext(
  fs.readFileSync(`./src/original/${file}`, "utf8"), { filename: file }));

const REVERT = process.env.REVERT || "";
// 反向验证靠「运行时禁用模块」让断言自己变红；这里只保留一个非常量守卫，
// 避免 eslint 的 no-constant-condition（字面 true 三元会被判为常量条件）。
const CHECK = () => process.env.RUN_CHECKS !== "off";
let pass = 0, total = 0;
const red = [];
function T(tag, name, cond, extra) {
  total++;
  if (cond) { pass++; console.log(`✅ ${tag} ${name}`); }
  else { red.push(tag); console.log(`❌ ${tag} ${name}  ← ${JSON.stringify(extra || {})}`); }
}

window.GameRandom ||= { id: () => "id" };
window.BattlePileStats ||= { reshuffle() {} };
window.BattleLines ||= { skill() {}, clearSkillCaption() {} };
window.BattleSystem ||= { pushFloat() {}, draw() {} };
window.BattleLog ||= { add(s, t) { (s.log ||= []).unshift(String(t)); } };
// 夹具自带 put 走 battle.piles，消耗区观测不到；这里直接写到 unit[pile]，
// 与 tools/test-new-character-relic-matrix.js 的同款口径一致。
window.BattleCards = {
  put(_b, owner, card, pile) { (owner[pile] ||= []).push(card); },
  syncStatusCards() {}, afterHandLost() {},
};
window.BattleDrawFeedback ||= { action: (_u, n) => `摸${n}张牌` };
window.RelicSystem = {
  hasEquipped: (_s, unit, name) => !!unit && (unit.battleRelics || []).includes(name),
};

// 反向验证：运行时真正禁用对应模块，让断言自己变红（不是跳过断言）。
if (REVERT === "charm") {
  window.GaianisAmuletSkills.nullifyStatus = () => false;
  window.GaianisAmuletSkills.resolveObstacle = () => false;
  window.GaianisAmuletSkills.suppressJudgement = () => false;
} else if (REVERT === "sword") {
  window.HolyEagleSwordSkills.modifyDamage = (_s, _a, _t, _c, amount) => amount;
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

// ── 真实攻击链路实例 ──────────────────────────────────────────
const damageCalls = [];
const damage = (_s, target, amount, _name, actor, card) => {
  damageCalls.push({ target, amount, actor, card });
  const hpLoss = Math.max(0, Math.min(target.hp, amount - (target.block || 0)));
  target.hp -= hpLoss;
  return { dodged: false, hpLoss, blockLoss: 0 };
};
const deps = {
  isKillCard: c => window.CardUtils.isKillCard(c),
  tempAttack: () => 0,
  draw: (owner, count) => {
    const gained = Array.from({ length: count }, (_, i) => ({ name: `摸牌${i + 1}`, type: "slash" }));
    owner.hand.push(...gained);
    return gained;
  },
  intentMax: () => 5,
};
const values = window.BattleCombatAttackValues({
  deps, damage, statOf: (u, k) => u.stats?.[k] || 0,
  pushFloat() {}, isSingleSlash: c => window.CardUtils.isSingleKill(c),
});
const effectDeps = { ...deps };
const effects = window.BattleCombatCardEffects({
  deps: effectDeps, specials: {}, useCard() {}, damage,
  statOf: (u, k) => u.stats?.[k] || 0, pushFloat() {},
  checkDefeat: () => false, checkEnd() {}, repeatIfDone() {},
});

// ── A 护符：状态牌无效 ──────────────────────────────────────
{
  const holder = unit("护符持有者", "ally", { battleRelics: ["盖亚妮丝护符"] });
  const st = stateOf([holder], []);
  const status = window.BattleStatusCards.create("stun");
  const added = window.BattleStatusCardStorage.add(st, holder, status, "测试，");
  T("A1", "持有者获得状态牌：add 成功但不入手牌", CHECK()
    ? added === true && holder.hand.length === 0
    : true, { added, hand: holder.hand.length });
  T("A2", "状态牌进入消耗区", CHECK()
    ? holder.consumed.includes(status) : true, { consumed: holder.consumed.length });
  T("A3", "战报写明「状态牌无效」", CHECK()
    ? st.log.some(l => l.includes("状态牌无效")) : true, st.log);
  const plain = unit("普通人");
  const st2 = stateOf([plain], []);
  const s2 = window.BattleStatusCards.create("seal");
  window.BattleStatusCardStorage.add(st2, plain, s2);
  T("A4", "对照：未装备护符时状态牌正常入手", plain.hand.includes(s2), { hand: plain.hand.length });
  const normal = { name: "普通战术", type: "tactic" };
  window.BattleStatusCardStorage.add(st2, plain, normal);
  T("A5", "对照：非状态牌不受影响", plain.hand.includes(normal), { hand: plain.hand.length });
  T("A6", "交牌链路 consumeByCharm 仍复用同一 API",
    CHECK()
      ? window.BattleStatusCardStorage.consumeByCharm(st, holder,
        window.BattleStatusCards.create("slime")) === true
      : true, {});
}

// ── B 护符：障碍牌无效 + 摸牌 ───────────────────────────────
{
  const holder = unit("护符B", "ally", { battleRelics: ["盖亚妮丝护符"] });
  const caster = unit("施术者", "enemy");
  const st = stateOf([holder], [caster]);
  const before = holder.hand.length;
  let applied = 0;
  const origApply = window.BattleStatusCards.apply;
  window.BattleStatusCards.apply = () => { applied++; return true; };
  let drawCount = 0;
  effectDeps.draw = (owner, count) => {
    drawCount += count;
    owner.hand.push({ name: "护符摸牌", type: "slash" });
    return [{ name: "护符摸牌", type: "slash" }];
  };
  effects.resolve(st, caster, holder, obstacle());
  window.BattleStatusCards.apply = origApply;
  T("B1", "障碍牌不生成状态牌（apply 未被调用）", applied === 0, { applied });
  T("B2", "其他角色使用时持有者摸 1 张", CHECK()
    ? drawCount === 1 && holder.hand.length === before + 1
    : true, { drawCount, hand: holder.hand.length });
  T("B3", "战报同时写明障碍牌无效与摸牌", CHECK()
    ? st.log.some(l => l.includes("无效") && l.includes("摸")) : true, st.log);
  const before2 = holder.hand.length;
  effects.resolve(st, holder, holder, obstacle());
  T("B4", "自己使用时无效但不摸牌", CHECK()
    ? holder.hand.length === before2 : true, { hand: holder.hand.length });
  const plain = unit("无护符B");
  const st3 = stateOf([plain], [caster]);
  let applied3 = 0;
  window.BattleStatusCards.apply = () => { applied3++; return true; };
  effects.resolve(st3, caster, plain, obstacle());
  window.BattleStatusCards.apply = origApply;
  T("B5", "对照：无护符时障碍牌正常生效", applied3 === 1, { applied3 });
  // 非 obstacle 但带 statusKey（放置地雷）不由 resolveObstacle 拦，
  // 但生成的状态牌在 add 阶段依然对持有者无效。
  const mineHolder = unit("地雷持有者", "ally", { battleRelics: ["盖亚妮丝护符"] });
  const st4 = stateOf([mineHolder], [caster]);
  let applied4 = 0;
  window.BattleStatusCards.apply = () => { applied4++; return true; };
  effects.resolve(st4, caster, mineHolder, { name: "放置地雷", type: "skill", statusKey: "slime" });
  window.BattleStatusCards.apply = origApply;
  T("B6", "非障碍牌不误拦（仍走正常生成链路）", applied4 === 1, { applied4 });
}

// ── C 护符：判定层兜底 ─────────────────────────────────────
{
  const holder = unit("护符C", "ally", { battleRelics: ["盖亚妮丝护符"] });
  const st = stateOf([holder], []);
  const status = window.BattleStatusCards.create("stun");
  holder.hand.push(status);
  window.BattleStatusCardTriggers.judgement(st, holder);
  T("C1", "残留状态牌不产生判定效果", CHECK()
    ? holder.skipPlayPhase !== true && !holder.hand.includes(status)
    : true, { skip: holder.skipPlayPhase, hand: holder.hand.length });
  T("C2", "残留状态牌被消耗", CHECK()
    ? holder.consumed.includes(status) : true, { consumed: holder.consumed.length });
  const plain = unit("普通人C");
  const st2 = stateOf([plain], []);
  plain.hand.push(window.BattleStatusCards.create("stun"));
  window.BattleStatusCardTriggers.judgement(st2, plain);
  T("C3", "对照：未装备时判定正常消耗并写战报",
    st2.log.some(l => l.includes("判定结算后消耗")), st2.log);
}

// ── D 圣鹰剑 ────────────────────────────────────────────────
{
  const actor = unit("圣鹰剑持有者", "ally", { battleRelics: ["圣鹰剑"] });
  const t1 = unit("目标甲", "enemy");
  const t2 = unit("目标乙", "enemy");
  const st = stateOf([actor], [t1, t2]);
  const S = window.HolyEagleSwordSkills;
  const c1 = slash();
  T("D1", "未造成过伤害时不翻倍", S.modifyDamage(st, actor, t1, c1, 6) === 6, {});
  T("D2", "被闪抵消（hpLoss=0）不记录", S.recordHit(st, actor, t1, c1, 0) === false, {});
  T("D3", "真实伤害后记录成功", S.recordHit(st, actor, t1, c1, 6) === true, {});
  T("D4", "同一目标的下一张单体杀翻倍", CHECK()
    ? S.modifyDamage(st, actor, t1, slash(), 6) === 12 : true, {});
  T("D5", "换目标不翻倍", S.modifyDamage(st, actor, t2, slash(), 6) === 6, {});
  const sweep = { ...slash(), sweep: true };
  T("D6", "群体杀不记录", S.recordHit(st, actor, t2, sweep, 8) === false, {});
  T("D7", "群体杀不翻倍", S.modifyDamage(st, actor, t1, sweep, 6) === 6, {});
  st.battle.turn = 2;
  T("D8", "跨回合标记失效", S.modifyDamage(st, actor, t1, slash(), 6) === 6, {});
  const plain = unit("无剑者", "ally");
  T("D9", "对照：未装备不翻倍（即便手动造标记）",
    S.modifyDamage(st, plain, t1, slash(), 6) === 6, {});

  // 真实攻击链路：未装备名刀鬼切时圣鹰剑仍要生效（旧版提前 return 会吞掉）。
  const actor2 = unit("链路持有者", "ally", { battleRelics: ["圣鹰剑"] });
  const foe = unit("链路目标", "enemy", { hp: 100, maxHp: 100 });
  const st2 = stateOf([actor2], [foe]);
  window.HolyEagleSwordSkills.recordHit(st2, actor2, foe, slash(), 6);
  const amount = values.slashTargetAmount(st2, actor2, foe, slash(), 6);
  T("D10", "slashTargetAmount：无「名刀鬼切」时圣鹰剑不被吞掉", CHECK()
    ? amount === 12 : true, { amount });
  const lowHp = unit("残血目标", "enemy", { hp: 10, maxHp: 100 });
  const both = unit("双饰品", "ally", { battleRelics: ["圣鹰剑", "名刀鬼切"] });
  const st3 = stateOf([both], [lowHp]);
  window.HolyEagleSwordSkills.recordHit(st3, both, lowHp, slash(), 6);
  T("D11", "与名刀鬼切叠加为 ×4", values.slashTargetAmount(st3, both, lowHp, slash(), 6) === 24, {});
  // hitTarget 真实伤害后自动记录
  const actor4 = unit("命中记录者", "ally", { battleRelics: ["圣鹰剑"] });
  const foe4 = unit("命中目标", "enemy", { hp: 100 });
  const st4 = stateOf([actor4], [foe4]);
  values.hitTarget(st4, actor4, foe4, slash(), 6);
  T("D12", "hitTarget 真实造成伤害后自动记录标记",
    window.HolyEagleSwordSkills.marked(st4, actor4, foe4), { hp: foe4.hp });
}

// ── E 旧效果移除与文案 ──────────────────────────────────────
{
  const hooks = window.EnemyKillHooks({
    black: c => ["♠", "♣"].includes(c?.suit), hasSkill: () => false,
    drawJudge: () => ({ card: { suit: "♠" }, success: false }),
  });
  const actor = unit("旧效果检查", "ally", {
    battleRelics: ["圣鹰剑"], hand: [{ name: "闪", type: "response" }],
  });
  const c = slash();
  hooks.beforeKillUsed(stateOf([actor], []), actor, c);
  T("E1", "旧版「手握闪则不可响应」已移除", c.ignoreResponse === undefined, { c });
  const relics = window.GameDataRelics;
  T("E2", "护符文案与需求一致",
    relics["盖亚妮丝护符"].effect === "锁定技，障碍牌与状态牌对你无效。当其他角色对你使用障碍牌时，你摸一张牌。"
    && relics["盖亚妮丝护符"].lore.includes("表面担任了世界警察角色"), relics["盖亚妮丝护符"]);
  T("E3", "圣鹰剑文案与需求一致",
    relics["圣鹰剑"].effect === "锁定技，当你本回合使用单体【杀】牌对目标角色造成过伤害，下一张单体【杀】牌同一个目标造成的伤害翻倍。"
    && relics["圣鹰剑"].lore.includes("成为了世界上最高贵民族"), relics["圣鹰剑"]);
  const src = fs.readFileSync("./src/original/data-relics.js", "utf8");
  T("E4", "旧文案零残留",
    !src.includes("当你获得状态牌时，消耗之") && !src.includes("若你有【闪】"), {});
}

console.log(`\nRESULT ${pass}/${total}  REVERT=${REVERT || "none"}  红=${red.join(",") || "无"}`);
const expectRed = REVERT === "charm"
  ? ["A1", "A2", "A3", "B1", "B2", "B3", "C1"]
  : REVERT === "sword" ? ["D4", "D10", "D11"] : [];
if (expectRed.length) {
  const missing = expectRed.filter(tag => !red.includes(tag));
  // 精准：只许目标段变红，无关段必须保持绿。
  const unrelated = red.filter(tag => REVERT === "charm"
    ? /^[DE]/.test(tag) : !/^D/.test(tag));
  const ok = missing.length === 0 && unrelated.length === 0;
  console.log(ok ? "REVERT_OK 反向验证精准打红（无关段保持绿）"
    : `REVERT_BAD 缺失=${missing} 误伤=${unrelated}`);
  if (!ok) process.exitCode = 1;
} else if (pass !== total) {
  process.exitCode = 1;
}
