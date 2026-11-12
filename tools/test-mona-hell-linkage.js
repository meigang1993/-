/* 英雄级【天鹰突击队队长莫娜】三技能 × 两件重做饰品联动严格检查
   英雄级 enemyRelics:true，BOSS 会携带其掉落饰品；莫娜掉落的两件正是
   【盖亚妮丝护符】【圣鹰剑】，因此本测试同时覆盖「技能↔技能」「技能↔饰品」。
   REVERT=nonequip|sword|charm 反向验证，被撤掉的修复必须精准打红。
*/
const fs = require("fs");
const vm = require("vm");
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
].forEach(file => vm.runInThisContext(
  fs.readFileSync(`./src/original/${file}`, "utf8"), { filename: file }));

// 夹具自带 put 是空实现，这里改成真实写入 owner[pile]，才能观测消耗区。
window.BattleCards = {
  put(_b, owner, card, pile) { (owner[pile] ||= []).push(card); },
  putMany() {}, afterHandLost() {}, syncStatusCards() {},
};
window.BattlePileStats ||= { reshuffle() {}, clash: () => ({}), clashSnapshot: () => ({}) };
window.BattleLines ||= { skill() {} };
window.BattleLog ||= { add(s, t) { (s.log ||= []).push(String(t)); } };

const REVERT = process.env.REVERT || "";
let pass = 0, total = 0;
const red = [];
function T(tag, name, cond, extra) {
  total++;
  if (cond) { pass++; console.log(`✅ ${tag} ${name}`); }
  else { red.push(tag); console.log(`❌ ${tag} ${name}  ← ${JSON.stringify(extra || {})} `); }
}

const hell = window.GameData.difficulties.hell;
const bases = window.GameDataUnderwaterTrainEnemies;
const monaBase = bases.find(e => e.id === "mona_eagle_captain");
const black = c => c?.suit === "♠" || c?.suit === "♣";
const slash = (extra = {}) => ({ name: "杀（普攻）", type: "slash", scale: "attack", suit: "♠", ...extra });
const damage = (_s, target, amount) => {
  const hpLoss = Math.max(0, Math.min(target.hp, amount - (target.block || 0)));
  target.hp -= hpLoss;
  return { dodged: false, hpLoss, blockLoss: 0 };
};
const deps = {
  isKillCard: c => window.CardUtils.isKillCard(c),
  tempAttack: () => 0,
  draw: (owner, n) => {
    const got = Array.from({ length: n }, (_, i) => slash({ name: `摸牌杀${i}` }));
    owner.hand.push(...got);
    return got;
  },
  intentMax: () => 5,
};
const values = window.BattleCombatAttackValues({
  deps, damage, statOf: (u, k) => u.stats?.[k] || 0,
  pushFloat() {}, isSingleSlash: c => window.CardUtils.isSingleKill(c),
});
const effects = window.BattleCombatCardEffects({
  deps: { ...deps }, specials: {}, useCard() {}, damage,
  statOf: (u, k) => u.stats?.[k] || 0, pushFloat() {},
  checkDefeat: () => false, checkEnd() {}, repeatIfDone() {},
});

// ── 构造英雄级莫娜战场 ────────────────────────────────────────
function build(revert = "") {
  const scaled = window.GameData.scaleEnemyStats(monaBase, hell, "boss");
  const relics = window.RelicSystem.enemyRelics(monaBase.id);
  const mona = {
    uid: "e0", ref: monaBase.id, id: monaBase.id, ai: monaBase.ai,
    type: "boss", side: "enemy", name: monaBase.name, gender: "female",
    hp: scaled.hp, maxHp: scaled.hp, block: 0, intent: 5,
    stats: { attack: scaled.attack, magic: scaled.magic, speed: scaled.speed,
      maxHp: scaled.hp, handLimit: 5, bloodlust: 1 },
    skills: monaBase.skills.map(s => ({ ...s })),
    battleRelics: revert === "nonequip" ? [] : [...relics],
    hand: [], deck: [], discard: [], consumed: [], statuses: [],
    monaPiercingUsed: false, monaPiercingReady: false,
  };
  const ally = {
    uid: "a0", ref: "lokar", id: "lokar", side: "ally", name: "罗卡尔",
    hp: 1000, maxHp: 1000, block: 0, statuses: [], hand: [],
    deck: [], discard: [], consumed: [], battleRelics: [],
    stats: { attack: 6, magic: 2, speed: 4, handLimit: 4 },
  };
  const state = {
    log: [], skillLines: [], resources: { relics: [] },
    equipment: {}, testEquipment: {},
    battle: {
      test: true, allies: [ally], enemies: [mona], turn: 1, phase: 4,
      activeUid: "a0", locked: false, animQueue: [], played: [],
      shownPlayed: [], combo: 0,
    },
  };
  return { state, mona, ally, scaled, relics };
}
const baseHp = monaBase.hp;
const expHp = Math.ceil(baseHp * 2.6);
const expAttack = Math.round(monaBase.attack * 2.2);
const expSpeed = Math.round(monaBase.speed * 1.8);

// ── A 段：英雄级倍率与饰品挂载 ───────────────────────────────
{
  const { state, mona, scaled, relics } = build();
  T("A1", "难度名为「英雄级」", hell.name === "英雄级", { name: hell.name });
  T("A2", "界面倍率文案为 生命260%/输出220%/速度180%",
    /生命260%.*输出220%.*速度180%/.test(hell.attrText), { attrText: hell.attrText });
  T("A3", "英雄级开启 enemyRelics（精英与BOSS携带掉落饰品）",
    hell.enemyRelics === true, { enemyRelics: hell.enemyRelics });
  T("A4", "莫娜属性按 2.6/2.2/1.8 缩放",
    scaled.hp === expHp && scaled.attack === expAttack && scaled.speed === expSpeed,
    { scaled, expHp, expAttack, expSpeed });
  T("A5", "enemyRelics(mona_eagle_captain) 恰好是重做的两件",
    relics.length === 2 && relics.includes("盖亚妮丝护符") && relics.includes("圣鹰剑"),
    { relics });
  T("A6", "hasEquipped 对两件饰品都为 true（battleRelics 生效）",
    window.RelicSystem.hasEquipped(state, mona, "盖亚妮丝护符")
    && window.RelicSystem.hasEquipped(state, mona, "圣鹰剑"),
    { battleRelics: mona.battleRelics });
  const normal = window.GameData.difficulties.normal;
  T("A7", "对照：普通级不携带饰品、不缩放属性",
    !normal.enemyRelics
    && window.GameData.scaleEnemyStats(monaBase, normal, "boss").hp === baseHp,
    { normalHp: window.GameData.scaleEnemyStats(monaBase, normal, "boss").hp });
}

// ── B 段：圣剑无双 + 圣痕 ────────────────────────────────────
{
  const { state, mona, ally } = build();
  const hooks = window.EnemyKillHooks({
    black, hasSkill: () => false, drawJudge: () => ({ success: false }),
  });
  const card = slash();
  hooks.beforeKillTargeted(state, mona, ally, card);
  T("B1", "圣剑无双：单体【杀】附加圣属性 + 双闪要求",
    card.holy === true && card.twoDodgesRequired === true, { card });
  T("B2", "圣剑无双台词已触发",
    (state.skillLines || []).some(l => /圣剑无双/.test(l)), { skillLines: state.skillLines });
  const status = window.EnemyStatusEffects({
    alive: list => list.filter(u => u.hp > 0),
    markStatus: (u, s) => (u.statuses ||= []).push(s),
  });
  status.addHolyScar(state, ally);
  T("B3", "命中后目标获得圣痕标记",
    ally.holyScar === true && ally.statuses.includes("圣痕"), { statuses: ally.statuses });
  const dmgHooks = window.EnemyDamageHooks({
    hasSkill: () => false, machine: {}, discardOne() {}, status,
  });
  const holyCard = slash({ holy: true });
  T("B4", "圣痕：圣属性伤害翻倍",
    dmgHooks.modifyDamage(state, ally, 6, holyCard) === 12, {});
  T("B5", "对照：物理杀不吃圣痕翻倍",
    dmgHooks.modifyDamage(state, ally, 6, slash()) === 6, {});
}

// ── C 段：圣天破军剑 × 圣鹰剑（三张杀的联动） ─────────────────
{
  const { state, mona, ally } = build();
  const dmgSkills = window.UnderwaterTrainDamageSkills({
    alive: list => list.filter(u => u.hp > 0),
    singleSlash: c => window.CardUtils.isSingleKill(c),
    visible: u => (u.hand || []).filter(c => !c._pendingDraw),
  });
  const actions = window.UnderwaterTrainTargetActions({
    black, isSlash: c => window.CardUtils.isKillCard(c),
    singleSlash: c => window.CardUtils.isSingleKill(c),
    counters: { swordShieldCounter() {}, scissorBlade() {} },
  });
  const c1 = slash();
  values.hitTarget(state, mona, ally, c1, 6);          // 第 1 张：真实命中、记录圣鹰剑标记
  dmgSkills.afterDamageBeforeBite(state, mona, ally, c1, 6, damage);
  T("C1", "圣天破军剑：首张单体杀命中后蓄势",
    mona.monaPiercingReady === true && mona.monaPiercingUsed === true
    && state.log.some(l => /蓄势完成/.test(l)), { ready: mona.monaPiercingReady, log: state.log });
  const c2 = slash();
  actions.beforeKillTargeted(state, mona, ally, c2);
  T("C2", "第 2 张单体杀被转为全体（sweep + holy + 双闪）",
    c2.sweep === true && c2.holy === true && c2.twoDodgesRequired === true
    && c2.monaPiercingSweep === true, { c2 });
  T("C3", "蓄势标记已消耗，不会连转第三张",
    mona.monaPiercingReady === false, { ready: mona.monaPiercingReady });
  T("C4", "已群体化的杀不再是单体杀，不吃圣鹰剑翻倍",
    window.CardUtils.isSingleKill(c2) === false
    && values.slashTargetAmount(state, mona, ally, c2, 6) === 6, {});
  const c3 = slash();
  T("C5", "第 3 张回到单体杀：圣鹰剑仍翻倍（标记未被消耗）",
    values.slashTargetAmount(state, mona, ally, c3, 6) === 12, {});
  const hooks = window.EnemyKillHooks({
    black, hasSkill: () => false, drawJudge: () => ({ success: false }),
  });
  hooks.beforeKillTargeted(state, mona, ally, c3);
  // 圣痕来自「圣属性杀命中后」：本段第 1 张已带 holy，先补上标记再验叠加。
  const scarStatus = window.EnemyStatusEffects({
    alive: list => list.filter(u => u.hp > 0),
    markStatus: (u, s) => (u.statuses ||= []).push(s),
  });
  scarStatus.addHolyScar(state, ally);
  const dmgHooks = window.EnemyDamageHooks({
    hasSkill: () => false, machine: {}, discardOne() {},
    status: { addShock() {}, addPoison() {}, addHolyScar() {} },
  });
  T("C6", "圣鹰剑 × 圣痕可叠成 ×4（基础 6 → 12 → 24）",
    dmgHooks.modifyDamage(state, ally, 12, c3) === 24, {});
}

// ── D 段：剑盾反攻 ────────────────────────────────────────────
{
  const { state, mona, ally } = build();
  const originalDraw = window.BattleSystem.draw;
  const originalDamage = window.BattleSystem.damage;
  let damageCalls = 0, drawCount = 0;
  window.BattleSystem.draw = (owner, n) => {
    drawCount = n;
    const got = [slash({ name: "摸到的杀" }), slash({ name: "摸到的杀2" })].slice(0, n);
    owner.hand.push(...got);
    return got;
  };
  window.BattleSystem.damage = () => { damageCalls++; return { hpLoss: 1 }; };
  const counters = window.UnderwaterTrainTargetCounters({
    stat: (u, k) => u.stats?.[k] || 0,
  });
  const before = mona.hand.length;
  counters.swordShieldCounter(state, mona, ally, slash());
  // 摸 2 张，其中 1 张被当作虚拟反击【杀】移出手牌进弃牌堆，故净增 1 张。
  T("D1", "剑盾反攻：真实摸 2 张，其中 1 张用于反击（净增 1 张）",
    drawCount === 2 && mona.hand.length - before === 1
    && state.log.some(l => /摸2张牌/.test(l)),
    { drawCount, before, after: mona.hand.length, log: state.log });
  T("D2", "剑盾反攻战报已写入",
    state.log.some(l => /剑盾反攻/.test(l)), { log: state.log });
  const virtual = (state.battle.animQueue || []).find(e => e.type === "virtualPlay");
  T("D3", "摸到单体杀后视为对来源使用虚拟【杀】（带圣属性/双闪）",
    !!virtual && virtual.card?.holy === true
    && virtual.card?.twoDodgesRequired === true && virtual.targetUid === ally.uid,
    { virtual });
  T("D4", "反击伤害真实走 damage()",
    damageCalls === 1, { damageCalls });
  window.BattleSystem.draw = originalDraw;
  window.BattleSystem.damage = originalDamage;
}

// ── E 段：盖亚妮丝护符与莫娜技能/状态牌联动 ───────────────────
{
  const { state, mona, ally } = build();
  const status = window.BattleStatusCards.create("stun");
  const added = window.BattleStatusCardStorage.add(state, mona, status, "测试，");
  T("E1", "护符：状态牌对莫娜无效，不入手牌、直接消耗",
    added === true && !mona.hand.includes(status) && mona.consumed.includes(status),
    { hand: mona.hand.length, consumed: mona.consumed.length });
  T("E2", "战报写明「状态牌无效」",
    state.log.some(l => /状态牌无效/.test(l)), { log: state.log });
  const obstacle = { name: "束缚陷阱", type: "obstacle", statusKey: "stun", suit: "♠" };
  const handBefore = mona.hand.length;
  const resolved = effects.resolve(state, ally, mona, obstacle);
  T("E3", "护符：其他角色对莫娜使用障碍牌 → 无效且莫娜摸 1 张",
    resolved === true && mona.hand.length - handBefore === 1
    && state.log.some(l => /盖亚妮丝护符令.*无效/.test(l)),
    { resolved, hand: mona.hand.length, log: state.log });
  // 圣痕是「伤害标记」而非状态牌，护符只管加在持有者身上的状态牌；
  // 这里在本段 state 里补一次圣痕，确认它照常落在目标身上、不被吞掉。
  const scarStatus = window.EnemyStatusEffects({
    alive: list => list.filter(u => u.hp > 0),
    markStatus: (u, s) => (u.statuses ||= []).push(s),
  });
  scarStatus.addHolyScar(state, ally);
  T("E4", "圣痕标记落在目标身上，不被持有者护符吞掉",
    ally.holyScar === true && ally.statuses.includes("圣痕"),
    { statuses: ally.statuses });
  const stray = window.BattleStatusCards.create("seal");
  mona.hand.push(stray);
  const suppressed = window.GaianisAmuletSkills.suppressJudgement(state, mona, stray);
  T("E5", "判定层兜底：残留状态牌被消耗",
    suppressed === true && !mona.hand.includes(stray), { hand: mona.hand.length });
}

// ── F 段：文案 / 背景 / 数值口径 ──────────────────────────────
{
  const texts = monaBase.skills.map(s => `${s.name}：${s.text}`).join("\n");
  T("F1", "莫娜三技能文案齐备且均为锁定技/触发技",
    monaBase.skills.length === 3 && /圣剑无双/.test(texts)
    && /圣天破军剑/.test(texts) && /剑盾反攻/.test(texts), { names: monaBase.skills.map(s => s.name) });
  const r1 = window.GameDataRelics["盖亚妮丝护符"];
  const r2 = window.GameDataRelics["圣鹰剑"];
  T("F2", "护符描述与本次重做一致",
    r1.effect === "锁定技，障碍牌与状态牌对你无效。当其他角色对你使用障碍牌时，你摸一张牌。"
    && /盖亚妮丝是天界国最高统治者/.test(r1.lore), { effect: r1.effect });
  T("F3", "圣鹰剑描述/背景与本次重做一致",
    r2.effect === "锁定技，当你本回合使用单体【杀】牌对目标角色造成过伤害，下一张单体【杀】牌同一个目标造成的伤害翻倍。"
    && /世界贵族掌握了天使永生的黑暗技术/.test(r2.lore), { effect: r2.effect });
  T("F4", "两件饰品的掉落来源都是莫娜",
    r1.enemy === "mona_eagle_captain" && r2.enemy === "mona_eagle_captain", {});
}

// ── G 段：反向验证（撤掉的修复必须打红） ──────────────────────
{
  const revert = REVERT;
  // 反向禁用必须在 add / hitTarget 之前生效，否则断言会被正向结果掩盖。
  if (revert === "sword") {
    window.HolyEagleSwordSkills.modifyDamage = (_s, _a, _t, _c, amount) => amount;
  }
  if (revert === "charm") {
    window.GaianisAmuletSkills.nullifyStatus = () => false;
  }
  const { state, mona, ally } = build(revert);
  const status = window.BattleStatusCards.create("stun");
  window.BattleStatusCardStorage.add(state, mona, status, "反向，");
  const c1 = slash();
  values.hitTarget(state, mona, ally, c1, 6);
  const c2 = slash();
  const third = values.slashTargetAmount(state, mona, ally, c2, 6);
  T("G1", "反向：正常态第 2 张单体杀翻倍（撤 sword/nonequip 应打红）",
    third === 12, { third, revert });
  T("G2", "反向：正常态两件饰品都生效（撤 nonequip 应打红）",
    window.RelicSystem.hasEquipped(state, mona, "盖亚妮丝护符")
    && window.RelicSystem.hasEquipped(state, mona, "圣鹰剑"),
    { battleRelics: mona.battleRelics, revert });
  T("G3", "反向：正常态状态牌不入手牌（撤 charm/nonequip 应打红）",
    !mona.hand.includes(status), { hand: mona.hand.length, revert });
  T("G4", "英雄级倍率常量为 2.6 / 2.2 / 1.8",
    hell.enemy.boss.hp === 2.6 && hell.enemy.boss.power === 2.2
    && hell.enemy.boss.speed === 1.8, { boss: hell.enemy.boss });
}

console.log(`\n结论 ${pass}/${total}${red.length ? `  红项: ${red.join(",")}` : ""}`);
process.exit(pass === total ? 0 : 1);
