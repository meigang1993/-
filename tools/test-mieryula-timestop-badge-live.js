// 米尔尤拉【神奇怀表】时停标记 · UI 徽章回归
//
// 背景：标记确实挂在 unit.statuses 上，UI 也会渲染出一个 status-icon，
// 但此前 statusText 走 status[0] 兜底，只显示一个「时」字，且没有专属样式类
// —— 与「计时」的「计」同为单字、同为默认粉色圆点，混在状态栏里完全分不清，
// 玩家反馈「向敌方施加时停没有徽章」。
//
// 本文件走真实出牌链路（useCard），不手工调 render，验证：
//   1. 敌方单位出现专属类 time-stop 的徽章
//   2. 文案是「停」而不是与其他状态混淆的单字
//   3. title 写全三个负面效果
//   4. 计算样式不是默认粉色圆点（专属 CSS 真的生效）
//   5. 对照组：未施加时停时不存在该徽章
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const {
  openGame, startFreshGame, startRegressionBattle, dismissOpeningStory,
  collectErrors, relevantErrors,
} = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
};

const setupTpl = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false;
  b.mieryulaTimeStopOwner = null; b.phase = 4; b.mieryulaBloodthirstPicker = null;
  const m = b.allies[0];
  m.name = "米尔尤拉"; m.ref = "mieryula"; m.id = "mieryula"; m.gender = "female";
  m.stats = { attack: 4, magic: 2, speed: 5 };
  m.hp = m.maxHp = 52; m.bloodlust = 1; m.bloodlustMax = 1;
  b.activeUid = m.uid;
  m.skills = [
    { name: "无谋霸姬", type: "passive" },
    { name: "神奇怀表", type: "active", card: { name: "神奇怀表", type: "tactic",
      mieryulaTimeStop: true, targetless: true, icon: "\\u1F53A", text: "t" } },
  ];
  m.usedMieryulaTimeStop = false;
  m.hand = [];
  b.enemies.forEach(e => { e.statuses = []; e.hp = e.maxHp = 60; e.block = 0; e.hand = []; });
  st.log = [];
  window.render();
  return { ok: true, allies: b.allies.length, foes: b.enemies.length };
})()`;

// cast=false 时不打牌，作为对照组
const castTpl = cast => `(() => {
  const st = window.state, b = st.battle;
  const m = b.allies[0];
  if (${cast}) {
    const card = { name: "神奇怀表", type: "tactic", mieryulaTimeStop: true,
      targetless: true, icon: "\\u1F53A", text: "t", _skill: true };
    m.hand.push(card);
    window.BattleSystem.useCard(st, m, m, card);
  }
  window.render();
  return { marked: (b.enemies || []).filter(e => (e.statuses || []).includes("\\u65f6\\u505c")).length,
    foes: (b.enemies || []).length };
})()`;

const readTpl = `(() => {
  const nodes = [...document.querySelectorAll(".enemy-main")];
  const badges = [];
  nodes.forEach(n => {
    n.querySelectorAll(".status-icon").forEach(s => {
      const cs = getComputedStyle(s);
      badges.push({ cls: s.className, txt: (s.textContent || "").trim(), title: s.title || "",
        bg: cs.backgroundImage !== "none" ? cs.backgroundImage : cs.backgroundColor,
        color: cs.color, shadow: cs.boxShadow });
    });
  });
  const ts = badges.filter(x => /time-stop/.test(x.cls));
  return { total: badges.length, tsCount: ts.length, ts: ts,
    wounded: [...document.querySelectorAll(".enemy-main")].length };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  await dismissOpeningStory(page);
  await startRegressionBattle(page);

  const setup = await page.evaluate(setupTpl);
  T("环境就绪（战斗已开启）", setup.ok && setup.foes >= 1, setup);

  console.log("---- A 组：施加时停后敌方单位出现专属徽章 ----");
  await page.evaluate(setupTpl);
  const cast = await page.evaluate(castTpl(true));
  T("A1 全部敌方角色都被施加了时停标记", cast.marked === cast.foes && cast.marked > 0, cast);
  await page.waitForTimeout(800);
  const a = await page.evaluate(readTpl);
  T("A2 敌方单位渲染出 time-stop 专属徽章", a.tsCount === cast.foes && a.tsCount > 0, a);
  T("A3 徽章文案是「停」（不是与其他状态混淆的单字「时」）",
    a.ts.length > 0 && a.ts.every(x => x.txt === "停"), { txts: (a.ts || []).map(x => x.txt) });
  T("A4 徽章 title 写全三个负面效果",
    a.ts.length > 0 && a.ts.every(x => /跳过其回合/.test(x.title) && /不可响应/.test(x.title)
      && /技能失效/.test(x.title)), { titles: (a.ts || []).map(x => x.title) });
  T("A5 专属样式生效（非默认粉色圆点 #e35a9a）",
    a.ts.length > 0 && a.ts.every(x => !/227,\s*90,\s*154/.test(x.bg)), { bgs: (a.ts || []).map(x => x.bg) });
  T("A6 时停徽章带发光阴影，视觉上醒目",
    a.ts.length > 0 && a.ts.every(x => x.shadow && x.shadow !== "none"),
    { shadows: (a.ts || []).map(x => x.shadow) });

  console.log("---- B 组：对照组（未施加时停）----");
  await page.evaluate(setupTpl);
  await page.evaluate(castTpl(false));
  await page.waitForTimeout(800);
  const b = await page.evaluate(readTpl);
  T("B1 未施加时停时不存在 time-stop 徽章", b.tsCount === 0, b);

  const bad = relevantErrors(errors);
  T("E0 页面无 JS 报错", bad.length === 0, bad.slice(0, 3));

  console.log(`\n通过 ${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})();
