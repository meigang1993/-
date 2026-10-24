// 【霹雳之锤】只对单体【杀】生效 + 群体杀灰屏卡死回归
//
// 玩家反馈（太阳骑士 10-24）：
//   84 卡洛斯 使用机枪扫杀，敌方全体受到扫射。
//   85 狂鲨海盗团潜水艇 自动打出闪，抵消一次伤害。
//   86 卡洛斯 的霹雳之锤可发动：选择一张手牌弃置，令该杀强制造成伤害。
//   → 然后就灰屏不能动了
//
// 两个独立问题：
//   ① 灰屏：battle-action-hand-bindings.js 的手牌点击处理器开头有
//      `if (battle?.locked) return;`，而锤子挂起时会置 battle.locked = true，
//      发动锤子的唯一交互又恰恰是「点击一张手牌弃置」：提示照常打印、
//      点手牌永远被早退挡下，不报错、不推进，界面像死了一样。
//      修复：锤子挂起时放行手牌点击（其余 locked 场景维持原样）。
//   ② 语义：霹雳之锤描述为「令此【杀】依然造成伤害」，属单次补伤。
//      群体杀一次打到多名目标，逐目标触发会连挂多次锤子、弃多张牌，
//      与描述不符。现改为只有单体【杀】能发动。
//
// 本用例断言：
//   A 组 群体杀 + 1 个敌人打闪：不挂锤子、不锁定、不弃牌
//   B 组 群体杀 + 2 个敌人均打闪：不挂锤子、两个都不补伤、群体剩余目标照常掉血
//   C 组 单体杀 + 敌人打闪：正常挂起，点击弃牌生效（灰屏回归）
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const {
  openGame, startRegressionBattle, collectErrors, relevantErrors,
} = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
};

// dodgeCount: 前 N 个敌人手牌里放【闪】
const setupTpl = dodgeCount => `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false; b.phase = 4;
  delete b.thunderHammer; delete b.greenGatlingResume;
  delete b.demonInvasionResume; delete b.manualDodgeResume;
  const carlos = b.allies[0];
  carlos.name = "卡洛斯"; carlos.ref = "carlos"; carlos.id = "carlos";
  carlos.gender = "male";
  carlos.stats = { attack: 6, magic: 3, speed: 5 };
  carlos.hp = carlos.maxHp = 100; carlos.block = 0;
  carlos.bloodlust = 1; carlos.bloodlustMax = 1;
  carlos.usedGreenGatling = true;             // 排除格林机枪干扰
  b.activeUid = carlos.uid;
  // 测试战场 testMode 下读 testEquipment，正常流程读 equipment，两处都要写
  st.equipment = st.equipment || {};
  st.equipment.carlos = ["霹雳之锤"];
  st.testEquipment = st.testEquipment || {};
  st.testEquipment.carlos = ["霹雳之锤"];
  carlos.battleRelics = ["霹雳之锤"];
  b.enemies.forEach((e, i) => {
    e.hp = e.maxHp = 60; e.block = 0; e.statuses = [];
    e.hand = i < ${dodgeCount}
      ? [{ name: "闪", type: "response", suit: "♠", text: "" }]
      : [];
    e.noResponse = false;
  });
  carlos.hand = [
    { name: "机枪扫杀", type: "slash", scale: "attack", sweep: true,
      targetless: true, responseKind: "dodge", suit: "♠", text: "" },
    { name: "杀（普攻）", type: "slash", scale: "attack",
      responseKind: "dodge", suit: "♦", text: "" },
    { name: "弃牌A", type: "consume", suit: "♥", text: "" },
    { name: "弃牌B", type: "consume", suit: "♣", text: "" },
    { name: "弃牌C", type: "consume", suit: "♦", text: "" },
  ];
  st.log = []; st.battleLog = [];
  window.render();
  return { foes: b.enemies.length,
    hasHammer: !!window.RelicSystem?.hasEquipped?.(st, carlos, "霹雳之锤") };
})()`;

const castTpl = cardName => `(() => {
  const st = window.state, b = st.battle;
  const carlos = b.allies[0];
  const card = carlos.hand.find(c => c.name === ${JSON.stringify(cardName)});
  window.BattleSystem.useCard(st, carlos, b.enemies[0], card);
  return { hp: b.enemies.map(e => e.hp), locked: !!b.locked,
    hammer: !!b.thunderHammer, demonResume: !!b.demonInvasionResume,
    hand: carlos.hand.map(c => c.name) };
})()`;

// 点一张可弃手牌，等动画落定后再读状态
const clickOnceTpl = `(async () => {
  const b = window.state.battle;
  const carlos = b.allies[0];
  const nodes = [...document.querySelectorAll("[data-card-index]")];
  const target = nodes.find(n => {
    const i = Number(n.dataset.cardIndex);
    return carlos.hand[i] && !carlos.hand[i]._pendingDraw;
  });
  if (!target) return { clicked: false, nodes: nodes.length };
  const idx = Number(target.dataset.cardIndex);
  const name = carlos.hand[idx]?.name;
  target.click();
  await new Promise(r => setTimeout(r, 1200));
  await window.BattleEffects?.whenIdle?.();
  await new Promise(r => setTimeout(r, 400));
  return { clicked: true, picked: name,
    hp: b.enemies.map(e => e.hp), locked: !!b.locked,
    hammer: !!b.thunderHammer, demonResume: !!b.demonInvasionResume,
    hand: carlos.hand.map(c => c.name),
    hammerLog: (window.state.battleLog || [])
      .filter(t => t.includes("霹雳之锤")).slice(0, 2) };
})()`;

const snapTpl = `(() => {
  const b = window.state.battle, carlos = b.allies[0];
  return { hp: b.enemies.map(e => e.hp), locked: !!b.locked,
    hammer: !!b.thunderHammer, demonResume: !!b.demonInvasionResume,
    hand: carlos.hand.map(c => c.name),
    discarded: (window.state.battleLog || [])
      .filter(t => t.includes("弃置") && t.includes("霹雳之锤")).length };
})()`;

// 反复点击直到锁定解除，返回过程快照
async function clickUntilIdle(page, maxClicks = 6) {
  const steps = [];
  let snap = await page.evaluate(snapTpl);
  let clicks = 0;
  while ((snap.locked || snap.demonResume) && clicks < maxClicks) {
    clicks += 1;
    await page.waitForTimeout(300);
    const c = await page.evaluate(clickOnceTpl);
    steps.push(c);
    snap = await page.evaluate(snapTpl);
    if (!c.clicked) break;
  }
  return { steps, clicks, final: snap };
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = collectErrors(page);
  await openGame(page);
  await startRegressionBattle(page);

  // ---------- A 组：群体杀 + 1 个敌人打闪 ----------
  console.log("\n---- A 组：群体杀（机枪扫杀）+ 1/2 敌人打出【闪】 ----");
  const setupA = await page.evaluate(setupTpl(1));
  T("A0 霹雳之锤已装备（前置成立）", setupA.hasHammer === true, setupA);

  const castA = await page.evaluate(castTpl("机枪扫杀"));
  T("A1 群体杀不触发霹雳之锤（未挂起）", castA.hammer === false, castA);
  T("A2 群体杀未进入锁定态", castA.locked === false, castA);
  T("A3 被闪的目标未被强制补伤", castA.hp[0] === 60, castA);
  T("A4 群体杀剩余目标照常掉血", castA.hp[1] === 54, castA);
  // 打出的「机枪扫杀」本身离手，其余 4 张（含三张弃牌用牌）必须一张没动
  T("A5 没有额外弃置任何手牌", castA.hand.length === 4
    && ["杀（普攻）", "弃牌A", "弃牌B", "弃牌C"]
      .every(n => castA.hand.includes(n)), castA);

  const idleA = await clickUntilIdle(page);
  T("A6 全程无需弃牌、无残留挂起", idleA.clicks === 0 && idleA.final.hammer === false,
    idleA.final);

  // ---------- B 组：群体杀 + 2 个敌人都打闪 ----------
  console.log("\n---- B 组：群体杀（机枪扫杀）+ 2/2 敌人均打出【闪】 ----");
  const setupB = await page.evaluate(setupTpl(2));
  T("B0 霹雳之锤已装备（前置成立）", setupB.hasHammer === true, setupB);

  const castB = await page.evaluate(castTpl("机枪扫杀"));
  T("B1 两个闪都不触发霹雳之锤（不弃等量牌）", castB.hammer === false, castB);
  T("B2 未进入锁定态", castB.locked === false, castB);
  T("B3 两个被闪目标均未被强制补伤", castB.hp[0] === 60 && castB.hp[1] === 60, castB);
  T("B4 手牌一张未弃", castB.hand.length === 4
    && ["杀（普攻）", "弃牌A", "弃牌B", "弃牌C"]
      .every(n => castB.hand.includes(n)), castB);

  // ---------- C 组：单体杀仍能触发（灰屏回归） ----------
  console.log("\n---- C 组：单体杀（杀·普攻）+ 敌人打出【闪】 ----");
  const setupC = await page.evaluate(setupTpl(1));
  T("C0 霹雳之锤已装备（前置成立）", setupC.hasHammer === true, setupC);

  const castC = await page.evaluate(castTpl("杀（普攻）"));
  T("C1 单体杀被闪后正常挂起锤子", castC.hammer === true, castC);
  T("C2 进入锁定态（等待弃牌）", castC.locked === true, castC);

  const runC = await clickUntilIdle(page);
  console.log("  C 过程:", JSON.stringify(runC.steps.map(s => s.picked)));
  T("C3 点击手牌后锁定解除（不灰屏）", runC.final.locked === false, runC.final);
  T("C4 锤子已清空", runC.final.hammer === false, runC.final);
  T("C5 只弃置了 1 张牌", runC.clicks === 1, runC);
  T("C6 被闪的目标强制补伤", runC.final.hp[0] === 54, runC.final);
  T("C7 非目标敌人未被误伤", runC.final.hp[1] === 60, runC.final);

  const errs = relevantErrors(errors);
  T("全程无 JS 错误", errs.length === 0, errs.slice(0, 3));

  await browser.close();
  console.log(`\n通过 ${pass}/${total}`);
  process.exit(pass === total ? 0 : 1);
})().catch(e => { console.error("FATAL", e); process.exit(2); });
