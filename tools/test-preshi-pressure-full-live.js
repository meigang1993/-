// 女王威压 · 全效果严格实战回归
//
// ⭐ 女王威压（锁定技）
//   ① 使用的牌指定敌方角色为目标时，若你的手牌数大于该角色，该角色不可响应你的牌。
//   ② 若你的手牌数为全场最多，你使用实体牌造成或受到的伤害为 2 倍
//      （技能伤害 / 技能生成的牌 / 虚拟牌一律不翻倍）。
//
// 与既有 test-preshi-skills-live.js 的分工：
//   既有那份直接调用 modify* 钩子查返回值，属「规则层」；
//   本份走真实出牌链路（BattleSystem.useCard），断言血量真的掉、响应牌真的被消耗
//   或真的没被消耗，并补上既有那份未覆盖的几处：
//     · 真实出牌下目标确实无法响应（此前只查了 card.ignoreResponse 标记）
//     · 并列最多是否算「全场最多」
//     · 阵亡后是否停止生效
//     · 出牌后 ignoreResponse 是否残留在牌上（弃牌堆会被重洗复用）
//     · 群体牌是否按「逐个目标」分别判定，而不是一次判定压制全场
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startFreshGame, startRegressionBattle, dismissOpeningStory, collectErrors, relevantErrors } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
};

// 构造普雷希：pHand = 普雷希手牌数，foeHands = 各敌人手牌数（数组），
// flash = 敌人手牌里是否放【闪】（用于观察响应是否被消耗）
const setupTpl = (pHand, foeHands, flash) => `(() => {
  const st = window.state, b = st.battle;
  st.settings = st.settings || {};
  st.settings.manualResponse = false;
  b.animQueue = []; b.locked = false;
  const p = b.allies[0];
  p.name = "普雷希"; p.ref = "preshi"; p.id = "preshi"; p.gender = "female";
  p.stats = { attack: 3, magic: 4, speed: 3 };
  p.tempMagic = 0; p.tempAttack = 0; p.block = 0; p.noResponse = false;
  p.hp = p.maxHp = 56;
  p.skills = [{ name: "女王威压", type: "passive" }];
  p.usedPreshiDrain = false;
  p.hand = [];
  for (let i = 0; i < ${pHand}; i++) p.hand.push({ name: "闪", type: "basic", suit: "♠", uid: "ph" + i });
  const hands = ${JSON.stringify(foeHands)};
  b.enemies.forEach((e, i) => {
    e.hand = [];
    e.hp = e.maxHp = 60; e.block = 0; e.noResponse = false;
    e.skills = []; e.ai = null;
    const n = hands[i] == null ? 0 : hands[i];
    for (let k = 0; k < n; k++) {
      e.hand.push(${flash}
        ? { name: "闪", type: "response", suit: "♥", uid: "fh" + i + "_" + k }
        : { name: "蓄力", type: "tactic", suit: "♥", uid: "fh" + i + "_" + k });
    }
  });
  // 其余队友清空手牌，避免干扰「全场最多」判定
  b.allies.slice(1).forEach(a => { a.hand = []; a.hp = a.maxHp = 60; });
  st.log = [];
  window.render();
  return { allies: b.allies.length, foes: b.enemies.length };
})()`;

const flashCount = `(() => {
  const st = window.state;
  return st.battle.enemies.map(e => e.hand.filter(c => c.name === "闪" && !c._pendingDraw).length);
})()`;

const hpOf = `(() => window.state.battle.enemies.map(e => e.hp))()`;

// ── ① 真实出牌：手牌多于目标 → 目标无法响应 ────────────────
const playMore = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false;
  const p = b.allies[0], foe = b.enemies[0];
  const before = { hp: foe.hp, flash: foe.hand.filter(c => c.name === "闪" && !c._pendingDraw).length };
  const card = { name: "杀（普攻）", type: "slash", suit: "♠", uid: "T1" };
  p.hand.push(card);
  window.BattleSystem.useCard(st, p, foe, card);
  return {
    before,
    after: { hp: foe.hp, flash: foe.hand.filter(c => c.name === "闪" && !c._pendingDraw).length },
    log: (st.log || []).map(String).filter(t => t.includes("女王威压")),
  };
})()`;

// ── ① 对照组：手牌不多于目标 → 目标正常响应 ────────────────
const playLess = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false;
  const p = b.allies[0], foe = b.enemies[0];
  p.hand = [];                       // 普雷希 0 张，敌方 8 张 → 不多于
  const before = { hp: foe.hp, flash: foe.hand.filter(c => c.name === "闪" && !c._pendingDraw).length };
  const card = { name: "杀（普攻）", type: "slash", suit: "♠", uid: "T2" };
  p.hand.push(card);
  window.BattleSystem.useCard(st, p, foe, card);
  return {
    before,
    after: { hp: foe.hp, flash: foe.hand.filter(c => c.name === "闪" && !c._pendingDraw).length },
  };
})()`;

// ── ① 边界：手牌数相等（不是「大于」）→ 不应压制 ──────────
const playEqual = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false;
  const p = b.allies[0], foe = b.enemies[0];
  // 出牌后普雷希计 3 张（3 张蓄力 + 正在打出的这张被排除），敌方 3 张 → 相等
  p.hand = [];
  for (let i = 0; i < 3; i++) p.hand.push({ name: "蓄力", type: "tactic", suit: "♠", uid: "pe" + i });
  foe.hand = [];
  for (let i = 0; i < 3; i++) foe.hand.push({ name: "闪", type: "response", suit: "♥", uid: "fe" + i });
  const before = { hp: foe.hp, flash: 3 };
  const card = { name: "杀（普攻）", type: "slash", suit: "♠", uid: "T3" };
  p.hand.push(card);
  window.BattleSystem.useCard(st, p, foe, card);
  return { before, after: { hp: foe.hp, flash: foe.hand.filter(c => c.name === "闪" && !c._pendingDraw).length } };
})()`;

// ── ② 并列最多是否算「全场最多」 ─────────────────────────
const tieTop = `(() => {
  const st = window.state, b = st.battle;
  const p = b.allies[0];
  p.hand = []; for (let i = 0; i < 3; i++) p.hand.push({ name: "蓄力", type: "tactic", suit: "♠", uid: "tp" + i });
  b.enemies.forEach(e => { e.hand = []; });
  b.enemies[0].hand = [{ name: "蓄力", suit: "♥", uid: "te0" }, { name: "蓄力", suit: "♥", uid: "te1" }, { name: "蓄力", suit: "♥", uid: "te2" }];
  b.allies.slice(1).forEach(a => { a.hand = []; });
  b.animQueue = []; b.locked = false;
  const top = window.PreshiSkills.topHand(st, p);
  const foe = b.enemies[0]; foe.hp = foe.maxHp = 60; foe.block = 0; foe.hand = [];
  const card = { name: "杀（普攻）", type: "slash", suit: "♠", ignoreResponse: true };
  window.BattleSystem.damage(st, foe, 10, "测试", p, card);
  return { top, out: 60 - foe.hp };
})()`;

// ── ② 阵亡后不再生效 ────────────────────────────────────
const deadNoEffect = `(() => {
  const st = window.state, b = st.battle;
  const p = b.allies[0];
  p.hand = []; for (let i = 0; i < 5; i++) p.hand.push({ name: "蓄力", type: "tactic", suit: "♠", uid: "dp" + i });
  b.enemies.forEach(e => { e.hand = []; });
  b.allies.slice(1).forEach(a => { a.hand = []; });
  const alive = window.PreshiSkills.modifyOutgoingDamage(st, p, 10, { name: "杀（普攻）", type: "slash" });
  p.hp = 0;
  const dead = window.PreshiSkills.modifyOutgoingDamage(st, p, 10, { name: "杀（普攻）", type: "slash" });
  const deadInc = window.PreshiSkills.modifyIncomingDamage(st, p, 10, { name: "杀（普攻）", type: "slash" });
  p.hp = 56;
  return { alive, dead, deadInc };
})()`;

// ── ③ 出牌后 ignoreResponse 是否残留在牌上 ────────────────
// 弃牌堆会被重洗回摸牌堆（BattlePileStats.reshuffle 直接 splice 同一批牌对象），
// 若 ignoreResponse 未被清理，这张牌再次上手后将永久不可被响应。
const residueTpl = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false;
  const p = b.allies[0], foe = b.enemies[0];
  foe.hand = [];
  const card = { name: "杀（普攻）", type: "slash", suit: "♠", uid: "RESIDUE" };
  p.hand.push(card);
  window.BattleSystem.useCard(st, p, foe, card);
  const pile = p.pileStats || p;
  const disc = pile.discard || [];
  const found = disc.find(c => c.uid === "RESIDUE") || null;
  return {
    found: !!found,
    ignoreResponse: !!found?.ignoreResponse,
    tempFlag: !!found?._tempIgnoreResponse,
    discardCount: disc.length,
  };
})()`;

// ── ③ 残留的实际影响：把那张牌重新拿回手里再打一次 ──────────
// 此时普雷希手牌 0 张、敌方 8 张，不满足「手牌多于目标」，本不该压制。
// 若上一轮的 ignoreResponse 没被清掉，这次目标就仍然无法响应 —— 即效果泄漏。
const residueImpactTpl = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false;
  const p = b.allies[0], foe = b.enemies[0];
  const pile = p.pileStats || p;
  const card = (pile.discard || []).find(c => c.uid === "RESIDUE");
  if (!card) return { skip: true };
  p.hand = [];
  foe.hand = [];
  for (let i = 0; i < 8; i++) foe.hand.push({ name: "闪", type: "response", suit: "♥", uid: "ri" + i });
  foe.hp = foe.maxHp = 60; foe.block = 0;
  const before = foe.hand.filter(c => c.name === "闪" && !c._pendingDraw).length;
  p.hand.push(card);
  window.BattleSystem.useCard(st, p, foe, card);
  return {
    residueFlag: !!card.ignoreResponse,
    hp: foe.hp,
    flashBefore: before,
    flashAfter: foe.hand.filter(c => c.name === "闪" && !c._pendingDraw).length,
  };
})()`;

// ── ④ 群体牌：是否按逐个目标分别判定 ──────────────────────
// 普雷希 5 张（出牌后 4 张）：敌人 A 手牌 0（应被压制）、敌人 B 手牌 8（应可响应）
const sweepTpl = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false;
  const p = b.allies[0], a = b.enemies[0], c = b.enemies[1];
  if (!c) return { skip: true };
  p.hand = [];
  for (let i = 0; i < 5; i++) p.hand.push({ name: "蓄力", type: "tactic", suit: "♠", uid: "sp" + i });
  b.allies.slice(1).forEach(x => { x.hand = []; });
  a.hand = []; a.hp = a.maxHp = 60; a.block = 0;
  c.hand = []; for (let i = 0; i < 8; i++) c.hand.push({ name: "闪", type: "response", suit: "♥", uid: "sc" + i });
  c.hp = c.maxHp = 60; c.block = 0;
  const card = { name: "机枪扫杀", type: "slash", suit: "♠", sweep: true, uid: "SWEEP" };
  p.hand.push(card);
  window.BattleSystem.useCard(st, p, a, card);
  return {
    aHp: a.hp, aFlash: 0,
    cHp: c.hp, cFlash: c.hand.filter(x => x.name === "闪" && !x._pendingDraw).length,
  };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  await dismissOpeningStory(page);
  await startRegressionBattle(page);

  // ① 真实出牌 · 手牌多于目标
  await page.evaluate(setupTpl(5, [1, 0], true));
  const more = await page.evaluate(playMore);
  T("① 手牌多于目标：目标掉血（未被【闪】抵消）",
    more.after.hp < more.before.hp, more);
  T("① 手牌多于目标：【闪】未被消耗（不可响应）",
    more.after.flash === more.before.flash && more.before.flash > 0, more);
  T("① 手牌多于目标：战报记录了女王威压",
    more.log.length > 0, more.log);

  // ① 对照组 · 手牌不多于目标
  await page.evaluate(setupTpl(5, [8, 0], true));
  const less = await page.evaluate(playLess);
  T("① 对照组：手牌不多于目标时目标不掉血（【闪】生效）",
    less.after.hp === less.before.hp, less);
  T("① 对照组：手牌不多于目标时【闪】被消耗",
    less.after.flash === less.before.flash - 1, less);

  // ① 边界 · 手牌相等
  await page.evaluate(setupTpl(5, [3, 0], true));
  const eq = await page.evaluate(playEqual);
  T("① 边界：手牌数相等不是「大于」，不压制（【闪】被消耗）",
    eq.after.flash === eq.before.flash - 1, eq);

  // ② 并列最多
  await page.evaluate(setupTpl(5, [0, 0], false));
  const tie = await page.evaluate(tieTop);
  T("② 并列最多同样算「全场最多」", tie.top === true, tie);
  T("② 并列最多时造成伤害翻倍（10 → 20）", tie.out === 20, tie);

  // ② 阵亡
  await page.evaluate(setupTpl(5, [0, 0], false));
  const dead = await page.evaluate(deadNoEffect);
  T("② 存活时造成伤害翻倍（10 → 20）", dead.alive === 20, dead);
  T("② 阵亡后不再造成翻倍（10 → 10）", dead.dead === 10, dead);
  T("② 阵亡后不再受到翻倍（10 → 10）", dead.deadInc === 10, dead);

  // ③ ignoreResponse 残留
  await page.evaluate(setupTpl(5, [1, 0], false));
  const res = await page.evaluate(residueTpl);
  T("③ 触发压制的牌确实进入了弃牌堆", res.found === true, res);
  T("③ 出牌后牌上不残留 ignoreResponse（避免重洗后永久不可响应）",
    res.ignoreResponse === false, res);

  const impact = await page.evaluate(residueImpactTpl);
  if (impact.skip) {
    console.log("  （弃牌堆未找到该牌，跳过残留影响验证）");
  } else {
    T("③ 残留影响：同一张牌再次打出时不应再压制（【闪】应被消耗、不掉血）",
      impact.flashAfter === impact.flashBefore - 1 && impact.hp === 60, impact);
  }

  // ④ 群体牌逐个目标判定
  await page.evaluate(setupTpl(5, [0, 8], true));
  const sw = await page.evaluate(sweepTpl);
  if (sw.skip) {
    console.log("  （战场敌人数不足 2，跳过群体牌分组判定）");
  } else {
    T("④ 群体牌：手牌少于普雷希的目标被压制（掉血）", sw.aHp < 60, sw);
    T("④ 群体牌：手牌多于普雷希的目标仍可响应（【闪】被消耗、未掉血）",
      sw.cFlash === 7 && sw.cHp === 60, sw);
  }

  const bad = relevantErrors(errors);
  T("页面无 JS 错误", bad.length === 0, bad.slice(0, 3));

  console.log(`\n通过 ${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})();
