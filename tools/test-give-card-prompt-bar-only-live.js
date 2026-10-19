// 交牌类技能「居中弹窗全部移除，只保留手牌区底部提示条」· 实战回归
//
// 背景：交牌类技能此前同时渲染两份提示——
//   · 居中浮层 .dimension-prompt（position:absolute; left:50%; top:48%）
//   · 手牌区底部提示条 .discard-prompt
// 玩家反馈【半魅魔血】弹窗还在，且同一个操作出现两个「不交」按钮。
// 本轮把交牌类（半魅魔血/新月之歌/收获分享/指挥官责任/战斗演练/窃取/解答迷惑）
// 的居中浮层全部去掉，统一为底部提示条 + 点击角色交出。
//
// 验证点：
//   1. 六个交牌类状态下均不出现 .dimension-prompt 居中浮层
//   2. 手牌区底部提示条 .discard-prompt 出现，且文案对应正确技能
//   3. 「不交 / 放弃」按钮仍在（解答迷惑原设计无取消按钮，故不校验）
//   4. 战斗演练真实点击队友后确实完成交牌

process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
};

const resetTpl = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false;
  b.kaiichiShare = null; b.newMoonShare = null; b.cadicisResponsibility = null;
  b.ailengDrillPicker = null; b.catherineStealPicker = null; b.wendyTutorPicker = null;
  b.selectedCardIndex = null; b.selectedSkillCard = null; b.pendingTargetUid = null;
  b.allies.forEach((a, i) => {
    a.hp = 300; a.maxHp = 300; a.block = 0; a.hand = [];
    a.name = "队友" + i;
    a.skills = [];
  });
  b.enemies.forEach(e => { e.hp = 100; e.maxHp = 100; e.hand = []; });
  st.log = [];
  return { allies: b.allies.map(a => a.uid) };
})()`;

// 设置某个交牌状态并渲染
const setStateTpl = kind => `(() => {
  const b = window.state.battle;
  const a0 = b.allies[0], a1 = b.allies[1];
  const e0 = b.enemies[0];
  if ("${kind}" === "kaiichi") {
    b.kaiichiShare = { unitUid: a0.uid, indexes: [], maxCount: 2 };
  } else if ("${kind}" === "newMoon") {
    b.newMoonShare = { unitUid: a0.uid, count: 2, indexes: [] };
  } else if ("${kind}" === "cadicis") {
    b.cadicisResponsibility = { cadicisUid: a0.uid, targetUid: a1.uid, remaining: 1 };
  } else if ("${kind}" === "drill") {
    b.ailengDrillPicker = { actorUid: a0.uid, card: { name: "杀（普攻）", type: "slash" } };
  } else if ("${kind}" === "steal") {
    b.catherineStealPicker = { actorUid: a0.uid, targetUid: e0.uid };
  } else if ("${kind}" === "tutor") {
    b.wendyTutorPicker = { uid: a0.uid, cardName: "闪" };
  }
  b.locked = true;
  window.render();
  return true;
})()`;

const domTpl = `(() => {
  const centered = [...document.querySelectorAll(".dimension-prompt")]
    .map(n => (n.textContent || "").trim());
  const bars = [...document.querySelectorAll(".hand-panel .discard-prompt")]
    .map(n => (n.textContent || "").trim());
  const bar = document.querySelector(".hand-panel .discard-prompt");
  const skip = bar && bar.parentElement
    ? [...bar.parentElement.querySelectorAll("button")].map(b => (b.textContent || "").trim())
    : [];
  return { centered, bars, barText: bar ? (bar.textContent || "").trim() : null, skip };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", err => pageErrors.push(String(err)));
  await openGame(page);
  await startRegressionBattle(page);
  await page.evaluate(resetTpl);

  const cases = [
    ["kaiichi", "半魅魔血", true],
    ["newMoon", "新月之歌", true],
    ["cadicis", "指挥官责任", true],
    ["drill", "战斗演练", true],
    ["steal", "窃取", true],
    ["tutor", "解答迷惑", false],
  ];

  for (const [kind, label, wantSkip] of cases) {
    await page.evaluate(resetTpl);
    await page.evaluate(setStateTpl(kind));
    const dom = await page.evaluate(domTpl);
    T(`${label}：不再出现居中浮层 .dimension-prompt`,
      dom.centered.length === 0, dom.centered);
    T(`${label}：手牌区底部提示条出现且文案正确`,
      !!dom.barText && dom.barText.includes(label), { barText: dom.barText });
    if (wantSkip) {
      const hasSkip = dom.skip.some(t => t === "不交" || t === "放弃");
      T(`${label}：底部提示条保留「不交/放弃」按钮`, hasSkip, dom.skip);
    }
  }

  // 战斗演练：真实点击队友完成交牌（验证去掉居中框后交互仍然走得通）
  await page.evaluate(resetTpl);
  await page.evaluate(setStateTpl("drill"));
  const before = await page.evaluate(`(() => ({
    a1: window.state.battle.allies[1].hand.length,
    locked: !!window.state.battle.locked,
  }))()`);
  const clicked = await page.evaluate(`(() => {
    const node = document.querySelector('[data-target="' + window.state.battle.allies[1].uid + '"]');
    if (!node) return false;
    node.click();
    return true;
  })()`);
  T("战斗演练：队友节点可点击", clicked, { clicked });
  await page.waitForTimeout(250);
  const after = await page.evaluate(`(() => ({
    a1: window.state.battle.allies[1].hand.length,
    locked: !!window.state.battle.locked,
    picker: !!window.state.battle.ailengDrillPicker,
  }))()`);
  T("战斗演练：点击队友后牌确实交出",
    after.a1 === before.a1 + 1, { before, after });
  T("战斗演练：交牌后 picker 清空并解锁",
    !after.picker && !after.locked, after);

  T("页面无 JS 报错", pageErrors.length === 0, pageErrors.slice(0, 3));

  console.log(`\n通过 ${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})();
