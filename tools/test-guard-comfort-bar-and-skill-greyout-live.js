// 1) 为我护驾 / 萌虎慰劳：居中浮层移除，统一为底部提示条
// 2) 技能置灰通用化：敌方技能同样置灰，且支持「未来复制他人技能」的角色
//
// 背景：
//   · .dimension-prompt 是居中浮层（position:absolute; left:50%; top:48%），
//     交牌类已全部改为底部 .discard-prompt，护驾与慰劳此前仍是居中浮层，口径不一致。
//   · 护驾发生在敌方回合，当前行动人是敌方单位，手牌区渲染空态面板，
//     因此护驾的提示条由 ui-hand.js 的空态分支承载（不是 renderControls）。
//   · 置灰判据此前只登记了我方技能，敌方技能（猛龙断空斩/震感闪光弹/魔法巡飞弹等）
//     的 used* 标记没有对应判据；一旦这些技能卡落到我方角色手上（复制技能类角色）
//     就永远不会置灰。现已改为统一映射表 + 命名约定自动推导。

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
  console.log(`${cond ? "✅" : "❌"} ${name}`
    + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
};

const baseTpl = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false;
  b.opheliaGuard = null; b.gerdaComfort = null;
  b.selectedCardIndex = null; b.selectedSkillCard = null; b.pendingTargetUid = null;
  b.allies.forEach((a, i) => {
    a.hp = 300; a.maxHp = 300; a.block = 0; a.hand = [];
    a.name = "队友" + i;
  });
  b.enemies.forEach(e => { e.hp = 100; e.maxHp = 100; e.hand = []; });
  st.log = [];
  return true;
})()`;

// ---------- A 组：为我护驾 ----------
const setGuardTpl = `(() => {
  const st = window.state, b = st.battle;
  const a0 = b.allies[0], e0 = b.enemies[0];
  a0.ref = "ophelia"; a0.name = "奥菲莉亚";
  b.activeUid = e0.uid;               // 敌方回合：当前行动人是敌方
  b.opheliaGuard = { actorUid: e0.uid, targetUid: a0.uid, amount: 5,
    source: "slash", card: { name: "杀（普攻）", type: "slash" } };
  b.locked = true;
  window.render();
  return true;
})()`;

const domTpl = `(() => {
  const centered = [...document.querySelectorAll(".dimension-prompt")]
    .map(n => (n.textContent || "").trim());
  const bars = [...document.querySelectorAll(".hand-panel .discard-prompt")]
    .map(n => (n.textContent || "").trim());
  const panel = document.querySelector(".hand-panel");
  const btn = panel ? [...panel.querySelectorAll("button")]
    .map(b => (b.textContent || "").trim()) : [];
  return { centered, bars, barText: bars[0] || null, buttons: btn,
    hasPanel: !!panel };
})()`;

// ---------- B 组：萌虎慰劳 ----------
const setComfortTpl = `(() => {
  const st = window.state, b = st.battle;
  const a0 = b.allies[0];
  a0.ref = "gerda"; a0.name = "葛尔达";
  b.activeUid = a0.uid; b.phase = 6;
  b.gerdaComfort = { unitUid: a0.uid };
  b.locked = true;
  window.render();
  return true;
})()`;

const handCountTpl = `(() => window.state.battle.allies
  .map(a => ({ name: a.name, n: (a.hand || []).length })))()`;

// ---------- C 组：技能置灰通用化（含敌方技能） ----------
// card flag -> used 字段；前 4 个是敌方技能，后 2 个验证自动推导与不误伤
const GREY_CASES = [
  ["dragonSlash", "usedDragonSlash", "猛龙断空斩（敌方·阿贝麦克）"],
  ["flashbang", "usedFlashbang", "震感闪光弹（敌方·水下列车）"],
  ["controlEye", "usedControlEye", "控神魔眼（敌方·水下列车）"],
  ["magicMissile", "usedMagicMissile", "魔法巡飞弹（敌方·兽人）"],
  ["droneExtract", "usedDroneExtract", "无人机采精（敌方·兽人）"],
  ["ruinsSnipe", "usedRuinsSnipe", "狙击目标（敌方·废墟）"],
  ["ruinsTankShell", "usedRuinsTankShell", "坦克炮弹（敌方·废墟）"],
  ["greenGatling", "usedGreenGatling", "格林机枪（敌方）"],
  ["futureSkill", "usedFutureSkill", "未登记的未来技能（自动推导）"],
];

const greyTpl = cases => `(() => {
  const st = window.state, b = st.battle;
  const a0 = b.allies[0], e0 = b.enemies[0];
  b.animQueue = []; b.locked = false; b.phase = 4;
  b.activeUid = a0.uid;
  a0.hp = 300; a0.maxHp = 300; a0.intent = 3; a0.hand = [];
  const deps = {
    isKillCard: c => c?.type === "slash",
    isSingleKillCard: c => c?.type === "slash" && !c.sweep,
    active: bb => bb.enemies[0],
  };
  const { canPlay } = window.BattleCardPlayability(deps);
  const out = [];
  ${JSON.stringify(cases)}.forEach(([flag, field, label]) => {
    a0[field] = false;
    const before = canPlay(a0, { name: label, _skill: true, [flag]: true,
      targetless: true }, b);
    a0[field] = true;
    const after = canPlay(a0, { name: label, _skill: true, [flag]: true,
      targetless: true }, b);
    a0[field] = false;
    out.push({ flag, label, before, after });
  });
  return out;
})()`;

// 不误伤：实体牌（无 _skill）不应被自动推导置灰
const noFalseTpl = `(() => {
  const st = window.state, b = st.battle;
  const a0 = b.allies[0];
  b.animQueue = []; b.locked = false; b.phase = 4; b.activeUid = a0.uid;
  a0.hp = 300; a0.maxHp = 300; a0.intent = 3; a0.hand = [];
  a0.usedExtract = true;   // 用过的榨取，与这张实体杀牌无关
  const deps = {
    isKillCard: c => c?.type === "slash",
    isSingleKillCard: c => c?.type === "slash" && !c.sweep,
    active: bb => bb.enemies[0],
  };
  const { canPlay } = window.BattleCardPlayability(deps);
  const slash = { name: "杀（普攻）", type: "slash", suit: "♠" };
  return { entitySlash: canPlay(a0, slash, b) };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", err => errors.push(String(err)));
  await openGame(page);
  await startRegressionBattle(page);

  console.log("\n【A】为我护驾：居中浮层移除，改为底部提示条");
  await page.evaluate(baseTpl);
  await page.evaluate(setGuardTpl);
  const guard = await page.evaluate(domTpl);
  T("A1 不再出现居中浮层", guard.centered.length === 0, guard.centered);
  T("A2 底部提示条出现", !!guard.barText, guard);
  T("A3 提示条文案为为我护驾", (guard.barText || "").includes("为我护驾"),
    guard.barText);
  T("A4 提示条点名奥菲莉亚", (guard.barText || "").includes("奥菲莉亚"),
    guard.barText);

  console.log("\n【B】萌虎慰劳：居中浮层移除，改为底部提示条");
  await page.evaluate(baseTpl);
  await page.evaluate(setComfortTpl);
  const comfort = await page.evaluate(domTpl);
  T("B1 不再出现居中浮层", comfort.centered.length === 0, comfort.centered);
  T("B2 底部提示条出现", !!comfort.barText, comfort);
  T("B3 提示条文案为萌虎慰劳", (comfort.barText || "").includes("萌虎慰劳"),
    comfort.barText);
  T("B4 保留放弃按钮", comfort.buttons.some(t => t.includes("放弃")),
    comfort.buttons);

  // 真实点击队友完成慰劳：双方各摸 2 张
  const before = await page.evaluate(handCountTpl);
  const allyClicked = await page.evaluate(`(() => {
    const b = window.state.battle;
    const a1 = b.allies[1];
    const node = document.querySelector(
      '.ally-row [data-uid="' + a1.uid + '"]')
      || [...document.querySelectorAll(".ally-row .unit")]
        .find(n => (n.textContent || "").includes(a1.name));
    if (!node) return "NO_NODE";
    node.click();
    return "OK";
  })()`);
  await page.waitForTimeout(600);
  await page.evaluate(`window.render()`);
  const after = await page.evaluate(handCountTpl);
  T("B5 点击队友后慰劳结算（双方各摸牌）",
    allyClicked === "OK" && after[0].n >= before[0].n + 2
      && after[1].n >= before[1].n + 2,
    { allyClicked, before, after });

  console.log("\n【C】技能置灰通用化（含敌方技能 / 未来复制技能）");
  await page.evaluate(baseTpl);
  const greys = await page.evaluate(greyTpl(GREY_CASES));
  greys.forEach(row => {
    T(`C·${row.label}：未使用时可用`, row.before === true, row);
    T(`C·${row.label}：用过后置灰`, row.after === false, row);
  });
  const noFalse = await page.evaluate(noFalseTpl);
  T("C末 实体牌不被自动推导误置灰", noFalse.entitySlash === true, noFalse);

  T("页面无 JS 报错", errors.length === 0, errors.slice(0, 3));

  console.log(`\n通过 ${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})();
