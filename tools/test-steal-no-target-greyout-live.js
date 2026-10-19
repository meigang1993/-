// 【窃取】无可用目标 / 无接收者时必须置灰。
//
// 背景：handleSpecialCard 在「没有有牌可偷的敌人」或「没有其他存活同阵营角色」
// 时会直接 return false，玩家点了毫无反馈——按钮看着可点但按下去什么也不发生。
// 因此在 canPlay 阶段就要判掉（battle-card-playability.js 的 canCatherineSteal），
// 让玩家从按钮外观就能看出这一手打不出来。
//
// 与 test-steal-greyout-dimension-bar-live.js 的 A 组互补：那边验「用过后置灰」，
// 这边验「压根没有可用目标时置灰」。
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let passed = 0, failed = 0;
const T = (name, cond, extra) => {
  if (cond) { passed++; console.log("✅ " + name); } else {
    failed++; console.log("❌ " + name + (extra ? "  ← " + JSON.stringify(extra) : ""));
  }
};

// 把我方 0 号改造成凯瑟琳；场景由参数决定
const setupTpl = scenario => `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false;
  b.selectedCardIndex = null; b.selectedSkillCard = null; b.pendingTargetUid = null;
  b.catherineStealPicker = null; b.handReveal = null;
  const c = b.allies[0];
  const src = (window.GameDataCharactersExtra || [])
    .find(item => item.id === "catherine");
  const tplStats = src?.stats || { attack: 1, magic: 3, speed: 2, maxHp: 28 };
  c.name = "凯瑟琳"; c.ref = "catherine"; c.id = "catherine";
  c.hp = tplStats.maxHp; c.maxHp = tplStats.maxHp;
  c.block = 0; c.intent = 3;
  c.stats = { ...tplStats };
  c.skills = src ? JSON.parse(JSON.stringify(src.skills)) : [];
  c.usedCatherineSteal = false;
  // 队友：${scenario === "noMate" ? "全部阵亡" : "存活（无手牌不影响，接收者只要活着）"}
  b.allies.forEach((u, i) => {
    if (i === 0) return;
    u.hp = ${scenario === "noMate" ? 0 : 100};
    u.maxHp = 100; u.hand = []; u.skills = [];
  });
  // 敌人：${scenario === "noHand" ? "全部空手牌" : "0 号持一张实体杀"}
  b.enemies.forEach((u, i) => {
    u.hp = 100; u.maxHp = 100; u.block = 0;
    u.hand = ${scenario === "noHand" ? "[]" : "(i === 0 ? [{ name: \"杀\", type: \"slash\", suit: \"♥\", scale: \"attack\" }] : [])"};
    u.hand.forEach(x => { delete x._pendingDraw; });
  });
  b.activeUid = c.uid; b.phase = 4;
  st.log = [];
  window.render();
  return { ok: !!c.skills.length };
})()`;

const btnTpl = `(() => {
  const nodes = [...document.querySelectorAll("button.skill")]
    .filter(n => (n.getAttribute("title") || "").includes("窃取"));
  if (!nodes.length) return { found: false };
  const n = nodes[0];
  return {
    found: true,
    disabledClass: n.classList.contains("disabled"),
    ariaDisabled: n.getAttribute("aria-disabled"),
    hasIndex: n.hasAttribute("data-skill-index"),
    title: (n.getAttribute("title") || "").trim(),
  };
})()`;

const setup = async (page, scenario) => {
  await page.evaluate(setupTpl(scenario));
  await page.waitForTimeout(300);
  return page.evaluate(btnTpl);
};

(async () => {
  const browser = await chromium.launch();
  const pageErrors = [];

  const page = await browser.newPage();
  page.on("pageerror", err => pageErrors.push(String(err)));
  await openGame(page);
  await startRegressionBattle(page);

  // ══ 1 · 正常场景：敌人有牌可偷 + 有存活队友 → 可点 ══════════
  console.log("── 1 · 正常场景（应可点）──");
  const ok = await setup(page, "ok");
  T("按钮存在", ok.found, ok);
  T("正常场景：按钮可点（带 data-skill-index）",
    ok.found && ok.hasIndex && !ok.disabledClass, ok);
  T("正常场景：状态文案为「可发动」",
    ok.found && ok.title.includes("可发动"), { title: ok.title });

  // ══ 2 · 队友全部阵亡（无接收者）→ 置灰 ══════════════════════
  console.log("── 2 · 队友全部阵亡（应置灰）──");
  const noMate = await setup(page, "noMate");
  T("队友全阵亡：按钮带 disabled 样式", noMate.disabledClass === true, noMate);
  T("队友全阵亡：按钮带 aria-disabled", noMate.ariaDisabled === "true", noMate);
  T("队友全阵亡：不再带 data-skill-index（点了不生效）",
    noMate.hasIndex === false, noMate);
  T("队友全阵亡：状态文案不再是可发动",
    noMate.found && !noMate.title.includes("可发动"), { title: noMate.title });

  // 真实点击：确认不会进入 picker、不会锁死界面
  await page.evaluate(setupTpl("noMate"));
  await page.locator("button.skill").first().click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(800);
  const noMateClick = await page.evaluate(`(() => ({
    picker: !!window.state.battle?.catherineStealPicker,
    locked: !!window.state.battle?.locked,
    used: !!window.state.battle?.allies[0]?.usedCatherineSteal,
  }))()`);
  T("队友全阵亡：真实点击不会进入接收方选择",
    noMateClick.picker === false, noMateClick);
  T("队友全阵亡：真实点击不会锁死界面",
    noMateClick.locked === false, noMateClick);
  T("队友全阵亡：真实点击不会白吃一次出牌次数",
    noMateClick.used === false, noMateClick);

  // ══ 3 · 敌方全部空手牌（无目标）→ 置灰 ══════════════════════
  console.log("── 3 · 敌方全空手牌（应置灰）──");
  const noHand = await setup(page, "noHand");
  T("敌方全空手牌：按钮带 disabled 样式", noHand.disabledClass === true, noHand);
  T("敌方全空手牌：按钮带 aria-disabled", noHand.ariaDisabled === "true", noHand);
  T("敌方全空手牌：不再带 data-skill-index",
    noHand.hasIndex === false, noHand);

  await page.evaluate(setupTpl("noHand"));
  await page.locator("button.skill").first().click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(800);
  const noHandClick = await page.evaluate(`(() => ({
    picker: !!window.state.battle?.catherineStealPicker,
    locked: !!window.state.battle?.locked,
    used: !!window.state.battle?.allies[0]?.usedCatherineSteal,
  }))()`);
  T("敌方全空手牌：真实点击不会进入接收方选择",
    noHandClick.picker === false, noHandClick);
  T("敌方全空手牌：真实点击不会锁死界面",
    noHandClick.locked === false, noHandClick);
  T("敌方全空手牌：真实点击不会白吃一次出牌次数",
    noHandClick.used === false, noHandClick);

  // ══ 4 · 已用过仍置灰（与登记表判据不冲突）══════════════════
  console.log("── 4 · 已用过（应置灰）──");
  await page.evaluate(setupTpl("ok"));
  await page.evaluate(`(() => {
    window.state.battle.allies[0].usedCatherineSteal = true;
    window.render(); return true;
  })()`);
  await page.waitForTimeout(300);
  const used = await page.evaluate(btnTpl);
  T("已用过：按钮带 disabled 样式", used.disabledClass === true, used);
  T("已用过：不再带 data-skill-index", used.hasIndex === false, used);

  T("无页面 JS 错误", pageErrors.length === 0, { errors: pageErrors });

  console.log(`\n通过 ${passed} / 失败 ${failed}`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
