// 米尔尤拉【无谋霸姬】对「虚拟战术牌」的免疫 实机回归
//
// 用户提问：无谋霸姬能不能免疫虚拟战术牌？以【军令状】（饰品生成的虚拟【魔王军入侵】）
// 和【魔法巡飞弹】（敌方技能生成的虚拟【魔弹特攻】）为样本。
//
// 关键点：这两张虚拟牌都带 _skill 标记（军令状：_skill + _relicSkill；巡飞弹：_skill）。
// 免疫判据里若只按「_skill 即豁免」处理，就会把虚拟战术牌整段放行 —— 那样「战术牌对你无效」
// 会被军令状/巡飞弹/鬼王扑克之类完全绕过。本测试走真实结算链路（不走直接调函数的假路径）。
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const {
  startRegressionBattle, collectErrors, relevantErrors,
} = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}`
    + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
};

// allies[0] 女队友（对照组，应正常掉血）/ allies[1] 米尔尤拉 / allies[2] 男队友
const setupTpl = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.reactionQueue = []; b.locked = false; b.phase = 4;
  while (b.allies.length < 3) {
    const n = b.allies.length;
    b.allies.push({ uid: "fill" + n, name: "补位" + n, ref: "fill" + n, id: "fill" + n,
      gender: "female", side: "ally", hp: 50, maxHp: 50, block: 0, hand: [], skills: [],
      statuses: [], deck: [], discard: [], consumed: [], pileStats: {}, relicStats: {},
      relicStatsApplied: {}, charge: 0, actionCount: 1, tempMagic: 0, intent: 1,
      stats: { attack: 4, magic: 4, speed: 4 } });
  }
  const female = b.allies[0], m = b.allies[1], male = b.allies[2];
  female.name = "曼妮"; female.ref = "manny"; female.id = "manny"; female.gender = "female";
  female.hp = female.maxHp = 50; female.block = 0; female.hand = []; female.skills = [];
  m.name = "米尔尤拉"; m.ref = "mieryula"; m.id = "mieryula"; m.gender = "female";
  m.stats = { attack: 4, magic: 2, speed: 5 };
  m.tempAttack = 0; m.tempMagic = 0; m.block = 0; m.intent = 1;
  m.hp = m.maxHp = 52; m.bloodlust = 1; m.bloodlustMax = 1;
  m.skills = [{ name: "无谋霸姬", type: "passive" }];
  m.hand = [];
  male.name = "罗卡尔"; male.ref = "lokar"; male.id = "lokar"; male.gender = "male";
  male.hp = male.maxHp = 62; male.block = 0; male.hand = []; male.skills = [];
  const suits = ["♥", "♦", "♠", "♣"];
  b.enemies.forEach((e, i) => {
    e.gender = "male"; e.hp = e.maxHp = 60; e.block = 0; e.statuses = [];
    e.stats = { attack: 5, magic: 5, speed: 3 };
    e.hand = suits.map((suit, k) => ({ name: "杀（普攻）", type: "slash",
      suit, uid: "eh" + i + k }));
  });
  b.allies.concat(b.enemies).forEach(u =>
    u.hand.forEach(c => { delete c._pendingDraw; }));
  b.activeUid = m.uid;
  b.demonInvasionResume = null; b.selectedBagIndexes = [];
  b.selectedSkillCard = null; b.selectedCardIndex = null; b.pendingTargetUid = null;
  b.handReveal = null;
  st.log = []; st.battleLog = [];
  window.render();
  window.BattleEffects.recover(st);
  return { m: m.uid, male: male.uid, female: female.uid,
    foes: b.enemies.map(e => e.uid) };
})()`;

// 军令状生成的牌到底长什么样（证明它是「虚拟 + 战术牌 + 带 _skill」）
const probeArmyOrderCard = `(() => {
  const inv = window.CardUtils.cloneEntity("魔王军入侵", {
    virtual: true, _skill: true, _relicSkill: true, sourceName: "军令状",
  });
  return { name: inv.name, type: inv.type, virtual: !!inv.virtual,
    skill: !!inv._skill, targetless: !!inv.targetless };
})()`;

// 真实走【军令状】：临时让饰品系统认为已装备，调用 useArmyOrder 生成虚拟【魔王军入侵】
const castArmyOrder = `(() => {
  const st = window.state, b = st.battle;
  const foe = b.enemies[0];
  b.animQueue = []; b.reactionQueue = []; b.locked = false; b.phase = 4;
  b.activeUid = foe.uid; b.handReveal = null;
  foe.hand = [{ name: "杀（普攻）", type: "slash", suit: "♠", uid: "ao0" },
    { name: "火杀", type: "slash", suit: "♠", uid: "ao1" }];
  const relic = window.RelicSystem, orig = relic.hasEquipped;
  relic.hasEquipped = () => true;
  const before = { m: b.allies[1].hp, other: b.allies[0].hp, male: b.allies[2].hp };
  let ok = false, err = null;
  try {
    ok = window.BakarRelicSkills.useArmyOrder(st, foe,
      { name: "军令状", type: "tactic", armyOrder: true, _bagIndexes: [0, 1] },
      (s, a, t, c) => window.BattleSystem.useCard(s, a, t, c));
  } catch (e) { err = String(e); }
  relic.hasEquipped = orig;
  return { ok, err, before,
    after: { m: b.allies[1].hp, other: b.allies[0].hp, male: b.allies[2].hp },
    // 注意：state.log 只保留最近 30 条（battle-log.js:4），战报多了会把免疫说明挤出去，
    // 因此免疫计数改看无上限的 state.battleLog。
    immune: (st.battleLog || []).filter(x => String(x).includes("免疫战术牌")).length,
    logs: (st.log || []).slice(-4) };
})()`;

// 真实走【魔法巡飞弹】：打出 {magicMissile:true} 技能牌 → 生成虚拟【魔弹特攻】
// 若进入「展示手牌」等待（说明没被免疫、流程继续往下走了），则代为确认一张。
const castMissile = `(() => {
  const st = window.state, b = st.battle;
  const foe = b.enemies[0], m = b.allies[1];
  foe.ai = "demon_witch"; foe.usedMagicMissile = false; foe.magicMissileStopped = false;
  const suits = ["♥", "♦", "♠", "♣"];
  foe.hand = suits.map((suit, k) => ({ name: "杀（普攻）", type: "slash", suit,
    uid: "mw" + k }));
  m.hand = [{ name: "杀（普攻）", type: "slash", suit: "♠", uid: "mh0" }];
  b.animQueue = []; b.reactionQueue = []; b.locked = false; b.phase = 4;
  b.activeUid = foe.uid; b.handReveal = null;
  const before = m.hp;
  let err = null;
  try {
    window.BattleSystem.useCard(st, foe, m,
      { name: "魔法巡飞弹", _skill: true, magicMissile: true, uid: "mm0" });
  } catch (e) { err = String(e); }
  const midHp = m.hp, hadReveal = !!b.handReveal;
  if (hadReveal) {
    window.BattleSystem.resolveHandReveal(st, 0, () => {});
  }
  return { before, midHp, after: m.hp, err, hadReveal,
    // 注意：state.log 只保留最近 30 条（battle-log.js:4），战报多了会把免疫说明挤出去，
    // 因此免疫计数改看无上限的 state.battleLog。
    immune: (st.battleLog || []).filter(x => String(x).includes("免疫战术牌")).length,
    logs: (st.log || []).slice(-5) };
})()`;

// 底层兜底：以虚拟【魔弹特攻】的名义直接结算伤害
const probeVirtualDamage = `(() => {
  const st = window.state, b = st.battle;
  const m = b.allies[1], foe = b.enemies[0];
  b.animQueue = []; b.reactionQueue = []; b.locked = false; b.handReveal = null;
  const virtualTactic = window.CardUtils.cloneEntity("魔弹特攻",
    { virtual: true, _skill: true, magicBullet: true, magicMissileVirtual: true });
  const hp0 = m.hp;
  window.BattleSystem.damage(st, m, 7, "魔弹特攻", foe, virtualTactic);
  const afterTactic = m.hp;
  window.BattleSystem.damage(st, m, 7, "杀（普攻）", foe,
    { name: "杀（普攻）", type: "slash" });
  const afterSlash = m.hp;
  return { hp0, afterTactic, afterSlash,
    tacticLoss: hp0 - afterTactic, slashLoss: afterTactic - afterSlash };
})()`;

const dropSkill = `(() => {
  const b = window.state.battle;
  b.allies[1].skills = b.allies[1].skills.filter(s => s.name !== "无谋霸姬");
  return { skills: b.allies[1].skills.map(s => s.name) };
})()`;

const resetAll = `(() => {
  const st = window.state, b = st.battle;
  b.allies.forEach(u => { u.hp = u.maxHp; u.hand = []; });
  b.enemies.forEach(u => { u.hp = u.maxHp; });
  b.animQueue = []; b.reactionQueue = []; b.locked = false;
  b.handReveal = null; b.demonInvasionResume = null;
  st.log = []; st.battleLog = [];
  window.render();
  window.BattleEffects.recover(st);
  return { ok: true };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = collectErrors(page);
  await startRegressionBattle(page);
  await page.waitForTimeout(300);
  const info = await page.evaluate(setupTpl);
  console.log(`   setup: 米尔尤拉=${info.m} 女队友=${info.female} 男队友=${info.male}`);

  // ── A 组：【军令状】生成的虚拟【魔王军入侵】 ──────────────────
  const shape = await page.evaluate(probeArmyOrderCard);
  console.log(`   军令状生成的牌：${JSON.stringify(shape)}`);
  T("A1 军令状生成的是「虚拟战术牌」且带 _skill 标记",
    shape.type === "tactic" && shape.virtual === true && shape.skill === true, shape);

  const ao = await page.evaluate(castArmyOrder);
  console.log(`   军令状结算：${JSON.stringify(ao)}`);
  T("A2 米尔尤拉不掉血（免疫虚拟【魔王军入侵】）", ao.after.m === ao.before.m, ao);
  T("A3 同阵营其他人正常掉血（免疫没波及全队）",
    ao.after.other < ao.before.other || ao.after.male < ao.before.male, ao);
  T("A4 战报出现免疫说明", ao.immune > 0, ao.logs);
  T("A5 军令状本身正常发动（不是被饰品前置挡掉）", ao.ok === true, ao);

  // ── B 组：【魔法巡飞弹】生成的虚拟【魔弹特攻】 ─────────────────
  await page.evaluate(resetAll);
  const ms = await page.evaluate(castMissile);
  console.log(`   魔法巡飞弹结算：${JSON.stringify(ms)}`);
  T("B1 米尔尤拉不掉血（免疫虚拟【魔弹特攻】）", ms.after === ms.before, ms);
  T("B2 没有进入「展示手牌」等待（整张牌一步都没结算）", ms.hadReveal === false, ms);
  T("B3 战报出现免疫说明", ms.immune > 0, ms.logs);

  // ── C 组：底层兜底（任何路径的虚拟战术牌都打不掉血） ───────────
  await page.evaluate(resetAll);
  const dmg = await page.evaluate(probeVirtualDamage);
  console.log(`   直接伤害：${JSON.stringify(dmg)}`);
  T("C1 虚拟战术牌名义的伤害被拦下", dmg.tacticLoss === 0, dmg);
  T("C2 杀牌伤害正常生效（没有一刀切免疫）", dmg.slashLoss > 0, dmg);

  // ── D 组：对照组 —— 去掉无谋霸姬后两张虚拟牌都能打到她 ──────────
  await page.evaluate(resetAll);
  await page.evaluate(dropSkill);
  const ao2 = await page.evaluate(castArmyOrder);
  console.log(`   去掉技能后·军令状：${JSON.stringify(ao2)}`);
  T("D1 去掉无谋霸姬后军令状能打到她（证明免疫确由该技能引起）",
    ao2.after.m < ao2.before.m, ao2);

  await page.evaluate(resetAll);
  const ms2 = await page.evaluate(castMissile);
  console.log(`   去掉技能后·巡飞弹：${JSON.stringify(ms2)}`);
  T("D2 去掉无谋霸姬后巡飞弹进入展示手牌流程（未被拦截）",
    ms2.hadReveal === true, ms2);
  T("D3 去掉无谋霸姬后巡飞弹对她造成伤害", ms2.after < ms2.before, ms2);

  const bad = relevantErrors(errors);
  T("D4 页面无相关报错", bad.length === 0, bad.slice(0, 3));

  console.log(`\n通过 ${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})();
