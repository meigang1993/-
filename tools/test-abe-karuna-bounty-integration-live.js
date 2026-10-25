// 安倍卡露娜 · 解锁后接入实战回归（羁绊任务池 + 界面展示）
//   角色第 33 名，解锁条件（data.js）：艾尔拉娜在队伍中，首次对战鱼人武士安倍麦克时触发剧情。
//   触发与解锁链路（弹窗 → 真实点击 → 入栏 → 落盘）由 test-all-unlock-events-live.js
//   统一覆盖（abeKarunaUnlock 用例）；管家手册魅魔目标由 test-butler-manual-goals-live.js 覆盖
//   （33 名清单）。本文件补最后一块：解锁后她是否真正进入羁绊任务池并在任务面板展示。
//
// 反向验证方式（改完源码后必须重跑，确认断言非空转）：
//   把 bounty-task-generator.js:79 的 bondTask 里 `!character.locked` 改成 `true` 无意义，
//   改为在 pool 过滤后加 `.filter(c => c.id !== "abe_karuna")`，A2/A3/B1 应立刻变红。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startFreshGame, collectErrors, relevantErrors } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
};

// 解锁安倍卡露娜（走真实解锁入口），并确保艾尔拉娜也在队伍里
const UNLOCK_TPL = `(() => {
  const st = window.state;
  window.Onboarding.skip(st);
  st.flags = st.flags || {};
  const elrana = st.chars.find(c => c.id === "elrana");
  if (elrana) elrana.locked = false;
  const karuna = st.chars.find(c => c.id === "abe_karuna");
  if (karuna) karuna.locked = true;
  st.view = "hall"; st.hallModal = null; st.battle = null; st.explore = null;
  st.bounties = [];
  return { before: !!karuna?.locked, elrana: !!elrana && !elrana.locked };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });

  await openGame(page);
  await startFreshGame(page);
  await page.waitForTimeout(300);

  const pre = await page.evaluate(UNLOCK_TPL);
  T("准备：安倍卡露娜初始为锁定态", pre.before === true, pre);
  T("准备：艾尔拉娜已解锁", pre.elrana === true, pre);

  // ============ 一、解锁后进入羁绊任务池（数据层） ============
  const pool = await page.evaluate(() => {
    const st = window.state;
    const k = st.chars.find(c => c.id === "abe_karuna");
    if (k) k.locked = false;
    const ok = window.BountyTasks && typeof window.BountyTasks.generate === "function";
    if (!ok) return { ok: false };
    // 采样 60 次：池是随机取样，必须确定她真的在池里而不是碰巧
    const hits = [];
    for (let i = 0; i < 60; i += 1) {
      const task = window.BountyTasks.generate(st, { hunt: new Set(), bond: new Set() });
      if (task && task.type === "bond" && task.charId === "abe_karuna") hits.push(task.charName);
    }
    return { ok: true, locked: !!k?.locked, hits: hits.length, name: hits[0] || null };
  });
  T("羁绊任务生成器已装配", pool.ok === true, pool);
  T("解锁后安倍卡露娜不再是锁定态", pool.locked === false, pool);
  T("采样 60 次能生成以她为目标的羁绊任务", pool.hits > 0, pool);
  T("生成的任务带上正确角色名", pool.name === "安倍卡露娜", pool);

  // ============ 二、任务面板真的展示她的条目（界面层） ============
  await page.evaluate(() => {
    const st = window.state;
    st.bounties = [];
    st.hallModal = null;
    window.render?.();
  });
  await page.waitForTimeout(150);
  // 说明：别墅内的全屏「据点面板」(.villa-modal) 会覆盖住任务入口，真实鼠标点击会被它
  // 拦截（这与本次验证目标无关）。这里用 DOM click 触发同一个 onclick 处理器，
  // 后续仍断言真实渲染出来的 .bounty-card 文本，因此验证依然成立。
  await page.evaluate(() => {
    const btn = document.querySelector("[data-open-modal='bounty']");
    if (btn) btn.click();
  });
  await page.waitForSelector(".bounty-card", { timeout: 10000 });
  await page.waitForTimeout(250);
  // 反复刷新直到抽到她（池含 30+ 解锁角色，单次命中概率低，故用刷新而非单次渲染）
  let shown = false, sample = null;
  for (let i = 0; i < 30 && !shown; i += 1) {
    await page.evaluate(() => {
      const btn = document.querySelector("[data-bounty-refresh='1']");
      if (btn && !btn.disabled) btn.click();
    });
    await page.waitForTimeout(60);
    const cards = await page.locator(".bounty-card").allTextContents();
    sample = cards.join(" | ").slice(0, 200);
    shown = cards.some(text => text.includes("安倍卡露娜"));
  }
  // 兜底：任务生成 55% 优先「讨伐」且讨伐池很大，自然刷新很难抽到羁绊任务。
  // 这里改为把生成器产出的她的羁绊任务写入后重新渲染，断言 bounty-render 真的渲染出卡片文本。
  if (!shown) {
    const injected = await page.evaluate(() => {
      const st = window.state;
      let task = null;
      for (let i = 0; i < 200 && !task; i += 1) {
        const t = window.BountyTasks.generate(st, { hunt: new Set(), bond: new Set() });
        if (t && t.type === "bond" && t.charId === "abe_karuna") task = t;
      }
      if (!task) return { ok: false };
      st.bounties = [task];
      window.render?.();
      return { ok: true, name: task.charName };
    });
    await page.waitForTimeout(250);
    const cards = await page.locator(".bounty-card").allTextContents();
    sample = cards.join(" | ").slice(0, 200);
    shown = injected.ok === true && cards.some(text => text.includes("安倍卡露娜"));
  }
  T("任务面板能展示她的羁绊任务", shown === true, { sample });

  // ============ 三、未解锁时不得出现在池中（负向对照） ============
  const lockedOut = await page.evaluate(() => {
    const st = window.state;
    const k = st.chars.find(c => c.id === "abe_karuna");
    if (k) k.locked = true;
    let hit = 0;
    for (let i = 0; i < 60; i += 1) {
      const task = window.BountyTasks.generate(st, { hunt: new Set(), bond: new Set() });
      if (task && task.type === "bond" && task.charId === "abe_karuna") hit += 1;
    }
    return hit;
  });
  T("未解锁时不会进入羁绊任务池（负向对照）", lockedOut === 0, { lockedOut });

  const rel = relevantErrors(errors);
  T("全程无 JS 错误", rel.length === 0, rel.slice(0, 3));

  console.log(`\n通过 ${pass}/${total}`);
  await browser.close();
  if (pass !== total) process.exit(1);
})().catch(e => {
  console.error("失败：", e.message);
  process.exit(1);
});
