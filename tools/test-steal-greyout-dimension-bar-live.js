// 【窃取】用后置灰 + 【次元转移】居中浮层移除 · 实战回归
//
// 背景一：玩家反馈「窃取这个技能使用后没有灰，还能点击」。
//   根因：blockedByUsage（battle-card-playability.js）是所有「出牌阶段限一次」
//   技能的置灰判据，但里面唯独没有 catherineSteal 这一条。
//   于是 handleSpecialCard 里 actor.usedCatherineSteal = true 之后，
//   按钮仍按「可发动」渲染；玩家点了会走进 handleSpecialCard 被
//   `if (actor.usedCatherineSteal) return false` 静默拦掉——点了没反应。
//   本轮已补 `card.catherineSteal && actor.usedCatherineSteal`。
//   （交叉排查了全部 46 个 used* 标记，确认只有这一处真漏：
//    其余 15 个未直接引用的分别是敌方技能、被动技、或已有独立判定函数。）
//
// 背景二：【次元转移】此前与交牌类一样同时渲染两份提示——
//   居中浮层 .dimension-prompt + 手牌区底部提示条 .discard-prompt。
//   本轮去掉居中浮层，两步进度（是否已选黑色牌）改由底部条文案承载。
//
// 验证点：
//   A 窃取：未使用时按钮可点；用过后按钮置灰（class disabled + aria-disabled、
//           且不再带 data-skill-index）；tooltip 状态文案变为条件不足
//   B 次元转移：不再出现 .dimension-prompt；底部条出现且两步文案正确；
//           放弃按钮仍在；完整流程（选黑色牌 → 指定敌人）能真正转移伤害

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

// ── A 组：把我方 0 号改造成凯瑟琳 ────────────────────────────────
const stealSetupTpl = `(() => {
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
  // 必须显式复位：上一组把 usedCatherineSteal 置成了 true，
  // 不复位的话按钮本来就灰着，后面的「真实点击」会等不到 data-skill-index。
  c.usedCatherineSteal = false;
  b.activeUid = c.uid; b.phase = 4;
  b.allies.forEach((u, i) => {
    if (i === 0) return;
    u.hp = 100; u.maxHp = 100; u.hand = []; u.skills = [];
  });
  b.enemies.forEach((u, i) => {
    u.hp = 100; u.maxHp = 100; u.block = 0;
    u.hand = i === 0 ? [{ name: "杀", type: "slash", suit: "♥", scale: "attack" }] : [];
    u.hand.forEach(x => { delete x._pendingDraw; });
  });
  st.log = [];
  return { ok: !!c.skills.length, uid: c.uid };
})()`;

// 读取【窃取】技能按钮的 DOM 状态
const stealBtnTpl = `(() => {
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

// ── B 组：构造曼妮 + 次元转移状态 ────────────────────────────────
const dimensionSetupTpl = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false;
  b.dimensionTransfer = null; b.selectedCardIndex = null;
  const victim = b.allies[0], manny = b.allies[1];
  victim.name = "受伤队友"; victim.hp = 100; victim.maxHp = 100;
  const src = (window.GameDataCharactersCore || [])
    .find(item => item.id === "manny");
  manny.name = "曼妮"; manny.ref = "manny"; manny.id = "manny";
  const tplStats = src?.stats || { attack: 3, magic: 2, speed: 3, maxHp: 26 };
  manny.hp = tplStats.maxHp; manny.maxHp = tplStats.maxHp; manny.block = 0;
  manny.stats = { ...tplStats };
  manny.skills = [];
  // 手牌：0 号黑色（♣），1 号红色（♥）——只有 0 号能当次元转移的消耗
  manny.hand = [
    { name: "杀", type: "slash", suit: "♣", scale: "attack" },
    { name: "闪", type: "response", suit: "♥" },
  ];
  manny.hand.forEach(x => { delete x._pendingDraw; });
  b.enemies.forEach((u, i) => {
    u.hp = i === 0 ? 100 : 90; u.maxHp = 100; u.block = 0; u.hand = [];
  });
  b.activeUid = manny.uid; b.phase = 4;
  st.log = [];
  return { mannyUid: manny.uid, victimUid: victim.uid, enemyUid: b.enemies[0].uid };
})()`;

const domTpl = `(() => {
  const centered = [...document.querySelectorAll(".dimension-prompt")]
    .map(n => (n.textContent || "").trim());
  const bar = document.querySelector(".hand-panel .discard-prompt");
  const skip = bar && bar.parentElement
    ? [...bar.parentElement.querySelectorAll("button")].map(b => (b.textContent || "").trim())
    : [];
  return { centered, barText: bar ? (bar.textContent || "").trim() : null, skip };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", err => pageErrors.push(String(err)));
  await openGame(page);
  await startRegressionBattle(page);

  // ══ A 组 · 窃取用后是否置灰 ══════════════════════════════════
  console.log("── A 组 · 窃取用后置灰 ──");
  await page.evaluate(stealSetupTpl);
  await page.evaluate(`(() => {
    window.state.battle.allies[0].usedCatherineSteal = false;
    window.render(); return true;
  })()`);
  const before = await page.evaluate(stealBtnTpl);
  T("窃取按钮能被找到", before.found, before);
  T("未使用时：按钮可点（带 data-skill-index）",
    before.found && before.hasIndex && !before.disabledClass, before);
  T("未使用时：状态文案为「可发动」",
    before.found && before.title.includes("可发动"), { title: before.title });

  await page.evaluate(`(() => {
    window.state.battle.allies[0].usedCatherineSteal = true;
    window.render(); return true;
  })()`);
  const after = await page.evaluate(stealBtnTpl);
  T("用过后：按钮带 disabled 样式", after.disabledClass === true, after);
  T("用过后：按钮带 aria-disabled", after.ariaDisabled === "true", after);
  T("用过后：不再带 data-skill-index（点了不生效）",
    after.hasIndex === false, after);
  T("用过后：状态文案不再是可发动",
    after.found && !after.title.includes("可发动"), { title: after.title });

  // 真实走一次窃取（点技能 → 点敌人 → 点我方角色），确认用完后确实置灰
  await page.evaluate(stealSetupTpl);
  // 必须用真实鼠标点击 + 等状态真正切换：
  // page.evaluate 里的 node.click() 走不到事件委托绑定；固定 sleep 会采到
  // 「已设定目标、picker 尚未置位」的中间态（此前诊断正是采到这个中间态）。
  await page.locator("[data-skill-index]").first().click();
  await page.waitForTimeout(1000);
  const foeUid = await page.evaluate(
    `(() => window.state.battle.enemies[0].uid)()`);
  await page.locator(`[data-target="${foeUid}"]`).first().click();
  await page.waitForFunction(
    () => !!window.state.battle?.catherineStealPicker, null, { timeout: 8000 })
    .catch(() => {});
  const midState = await page.evaluate(`(() => ({
    picker: !!window.state.battle.catherineStealPicker,
    used: !!window.state.battle.allies[0].usedCatherineSteal,
  }))()`);
  T("真实点击：进入接收方选择", midState.picker, midState);
  T("真实点击：已标记本回合用过", midState.used, midState);
  // 完整走完这次窃取：点我方接收者 → 打开敌方手牌 → 选一张转移。
  // 走到「真正完成」才是玩家说的「使用后」，此时按钮必须灰掉。
  const mateUid = await page.evaluate(
    `(() => window.state.battle.allies[1]?.uid || null)()`);
  await page.locator(`[data-target="${mateUid}"]`).first()
    .click({ timeout: 5000 }).catch(() => {});
  await page.waitForFunction(() => !!window.state.battle?.handReveal,
    null, { timeout: 8000 }).catch(() => {});
  const done = await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const p = b.handReveal;
    if (!p) return { ok: false };
    const units = b.allies.concat(b.enemies);
    const actor = units.find(u => u.uid === p.actorUid);
    const victim = units.find(u => u.uid === p.targetUid);
    const card = (victim?.hand || [])[0];
    if (!card) return { ok: false };
    b.handReveal = null; b.locked = false;
    window.CatherineSkills?.resolveSteal?.(st, actor, victim, p, card);
    window.render();
    return { ok: true, used: !!actor?.usedCatherineSteal,
      mateHand: b.allies[1].hand.length, locked: !!b.locked };
  })()`);
  T("窃取完整流程走完（牌已转移给接收者）",
    done.ok && done.mateHand >= 1, done);
  const afterReal = await page.evaluate(stealBtnTpl);
  T("真实用过一次后：按钮置灰",
    afterReal.found && afterReal.disabledClass === true
    && afterReal.hasIndex === false, afterReal);

  // ══ B 组 · 次元转移居中浮层 ══════════════════════════════════
  // 用独立页面：A 组结束时战斗仍停在窃取接收方选择（locked + picker），
  // 残留状态会让 B 组采到错乱的界面（此前表现为底部提示条压根不出现）。
  console.log("── B 组 · 次元转移 ──");
  const page2 = await browser.newPage();
  page2.on("pageerror", err => pageErrors.push(String(err)));
  await openGame(page2);
  await startRegressionBattle(page2);
  await page2.evaluate(dimensionSetupTpl);
  const mkState = await page2.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const victim = b.allies[0], foe = b.enemies[0];
    const card = { name: "杀", type: "slash", suit: "♥", scale: "attack" };
    const ok = window.MannySkills?.transferSlash?.(
      st, foe, victim, 5, "杀", card);
    window.render();
    return { ok, has: !!b.dimensionTransfer };
  })()`);
  T("次元转移状态构造成功", mkState.ok && mkState.has, mkState);

  const d1 = await page2.evaluate(domTpl);
  T("次元转移：不再出现居中浮层 .dimension-prompt",
    d1.centered.length === 0, d1.centered);
  T("次元转移：底部提示条出现",
    !!d1.barText && d1.barText.includes("次元转移"), { barText: d1.barText });
  T("次元转移：未选牌时提示「选择1张黑色牌」",
    !!d1.barText && d1.barText.includes("选择1张黑色牌"), { barText: d1.barText });
  T("次元转移：底部条保留「放弃发动」按钮",
    d1.skip.some(t => t.includes("放弃")), d1.skip);

  // 选黑色牌后，文案应切到第二步
  const d2 = await page2.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const ok = window.MannySkills?.selectDimensionTransferCard?.(st, 0);
    window.render();
    const bar = document.querySelector(".hand-panel .discard-prompt");
    return { ok, costIndex: b.dimensionTransfer?.costIndex,
      barText: bar ? (bar.textContent || "").trim() : null };
  })()`);
  T("次元转移：能选中黑色牌", d2.ok && d2.costIndex === 0, d2);
  T("次元转移：已选牌时提示「点击一名敌方角色」",
    !!d2.barText && d2.barText.includes("敌方角色"), { barText: d2.barText });

  // 完整流程：指定敌人，伤害应转移过去
  const d3 = await page2.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const foe = b.enemies[0], manny = b.allies[1];
    const hpBefore = foe.hp, handBefore = manny.hand.length;
    window.MannySkills?.resolveDimensionTransfer?.(st, foe.uid,
      (s, t, amount, source) => { t.hp -= amount; });
    window.render();
    return {
      hpBefore, hpAfter: foe.hp,
      handBefore, handAfter: manny.hand.length,
      cleared: !b.dimensionTransfer, locked: !!b.locked,
    };
  })()`);
  T("次元转移：敌人确实承受了伤害",
    d3.hpAfter === d3.hpBefore - 5, d3);
  T("次元转移：曼妮弃置了1张黑色牌",
    d3.handAfter === d3.handBefore - 1, d3);
  T("次元转移：结算后状态清空并解锁",
    d3.cleared && !d3.locked, d3);

  T("页面无 JS 报错", pageErrors.length === 0, pageErrors.slice(0, 3));

  console.log(`\n通过 ${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})();
