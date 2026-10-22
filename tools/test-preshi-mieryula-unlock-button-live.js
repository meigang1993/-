// 普雷希 / 米尔尤拉 解锁事件「完成按钮」可点击性实机验证
// 走真实 UI、真实逐句推进、真实鼠标点击，不手工塞解锁结果。
// 覆盖：静态绑定一一对应、逐句点到底、跳到结尾、读档残留、关闭后重开、排队不吞。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const { openGame, startFreshGame, dismissOpeningStory } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  else console.log(`❌ ${name}  ← ${JSON.stringify(extra || {})}`);
  return !!cond;
};

/* 把当前弹窗推进到最后一句：逐句点「继续」，模拟玩家正常阅读。 */
async function advanceToEndByClicking(page, tag) {
  for (let guard = 0; guard < 60; guard++) {
    const done = await page.$(".actions button");
    if (done) return true;
    const next = await page.$("[data-adv-next]");
    if (!next) return false;
    await next.click();
    await page.waitForTimeout(60);
  }
  return false;
}

/* 取结尾完成按钮的 data-* 属性名 */
const finishAttr = page => page.evaluate(() => {
  const btns = [...document.querySelectorAll(".actions button")];
  for (const b of btns) {
    const a = [...b.attributes].map(x => x.name)
      .find(n => n.startsWith("data-") && n !== "data-close-modal");
    if (a) return { attr: a, text: b.textContent.trim(), disabled: b.disabled };
  }
  return null;
});

/* 真实鼠标点击（走 hit-testing，被遮挡/不可见会真失败） */
async function realClickFinish(page, attr) {
  const el = await page.$(`[${attr}]`);
  if (!el) return { clicked: false, reason: "selector-missing" };
  const box = await el.boundingBox();
  if (!box || box.width <= 0 || box.height <= 0) return { clicked: false, reason: "zero-size" };
  const visible = await el.isVisible();
  if (!visible) return { clicked: false, reason: "not-visible" };
  await el.click({ timeout: 5000 });
  await page.waitForTimeout(900);
  return { clicked: true, box };
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });

  /* ── A. 静态绑定检查：按钮属性必须在 app-hall-bindings 里有对应 bind ── */
  const srcDir = path.join(__dirname, "..", "src", "original");
  const bindings = fs.readFileSync(path.join(srcDir, "app-hall-bindings.js"), "utf8");
  const views = ["preshi-unlock-complete", "mieryula-unlock-complete"];
  for (const attr of views) {
    T(`静态：app-hall-bindings 绑定了 data-${attr}`,
      bindings.includes(`[data-${attr}]`), { attr });
  }
  // 反向：所有 render 出来的 buttonAttribute 都不能漏绑
  const viewFiles = ["new-character-unlock-events.js", "extra-unlock-event-views.js",
    "recruit-unlock-events.js", "orc-unlock-events.js", "villa-defeat-events.js",
    "villa-family-events.js", "villa-story-events.js"];
  const missing = [];
  for (const f of viewFiles) {
    const p = path.join(srcDir, f);
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, "utf8");
    // 文件里两种写法都有：buttonAttribute: `data-${action}`（动态）与直接写死 "data-xxx"
    const re = /"(?:data-)?([a-z0-9-]+-complete)"/g;
    let m;
    while ((m = re.exec(text))) {
      const attr = m[1];
      if (!bindings.includes(`[data-${attr}]`)) missing.push(`${f} → ${attr}`);
    }
  }
  T("静态：所有解锁事件按钮属性均已绑定（无漏绑）", missing.length === 0, missing);

  /* ── B. 真实开局 ── */
  await openGame(page);
  await startFreshGame(page);
  await dismissOpeningStory(page);
  await page.waitForTimeout(300);

  const base = await page.evaluate(() => {
    const s = window.state;
    const g = id => s.chars.find(c => c.id === id);
    return {
      preshiLocked: !!g("preshi")?.locked,
      mieryulaLocked: !!g("mieryula")?.locked,
      elites: [...(s.defeatedElites || [])], view: s.view,
    };
  });
  T("新档：普雷希锁定", base.preshiLocked === true, base);
  T("新档：米尔尤拉锁定", base.mieryulaLocked === true, base);
  T("新档：defeatedElites 为空", base.elites.length === 0, base);

  /* ── C. 负向：未击败时不弹窗 ── */
  const neg = await page.evaluate(() => {
    const s = window.state;
    s.hallModal = null; s.defeatedElites = [];
    const fired = window.NewCharacterUnlockEvents?.triggerPending?.(s);
    return { fired: !!fired, modal: s.hallModal };
  });
  T("负向：未击败任何BOSS时不弹出普雷希/米尔尤拉弹窗",
    neg.modal !== "preshiUnlock" && neg.modal !== "mieryulaUnlock", neg);

  /* ── D. 击败机械AI龙 → 普雷希弹窗 → 逐句点到底 → 真实点击完成 ── */
  const beat = await page.evaluate(async () => {
    const s = window.state;
    const run = {
      missionId: "ruins_sand_city", focusId: "ruins_sand_city", difficultyId: "normal",
      complete: true, party: ["lokar"], activeParty: ["lokar"],
    };
    window.DungeonSettlementActions.queueBattleExtras(
      s, run, "boss", { defeatedEnemyIds: ["mech_ai_dragon"] });
    try { await window.DungeonSettlementActions.retryPending(s); }
    catch (e) { return { error: String(e) }; }
    return { elites: [...(s.defeatedElites || [])] };
  });
  T("击败机械AI龙：真实结算写入 defeatedElites",
    (beat.elites || []).includes("mech_ai_dragon"), beat);

  const preshiOpen = await page.evaluate(() => {
    const s = window.state;
    s.view = "hall"; s.explore = null; s.battle = null; s.hallModal = null;
    const fired = window.NewCharacterUnlockEvents?.triggerPending?.(s);
    window.render?.();
    return { fired: !!fired, modal: s.hallModal };
  });
  T("普雷希：击败后回大厅自动弹出解锁弹窗", preshiOpen.modal === "preshiUnlock", preshiOpen);

  await page.waitForSelector(".adv-box", { timeout: 5000 });
  // 逐句点「继续」到结尾（不跳）
  const reachedEnd = await advanceToEndByClicking(page);
  T("普雷希：逐句点击「继续」能推进到结尾", reachedEnd === true, { reachedEnd });
  await page.waitForSelector(".actions button", { timeout: 5000 });

  const preshiBtn = await finishAttr(page);
  T("普雷希：结尾完成按钮属性为 data-preshi-unlock-complete",
    preshiBtn?.attr === "data-preshi-unlock-complete", preshiBtn);
  T("普雷希：完成按钮未被 disabled", preshiBtn?.disabled === false, preshiBtn);

  const preshiClick = await realClickFinish(page, "data-preshi-unlock-complete");
  T("普雷希：真实鼠标点击完成按钮成功（按钮可见且有尺寸）",
    preshiClick.clicked === true, preshiClick);

  const afterPreshi = await page.evaluate(() => {
    const s = window.state;
    const p = s.chars.find(c => c.id === "preshi");
    let saved = null;
    const raw = localStorage.getItem("succubus-kill-save-v1");
    if (raw) {
      const o = JSON.parse(raw);
      saved = { locked: Object.fromEntries((o.chars || []).map(x => [x.id, !!x.locked])),
        seen: !!(o.flags || {}).preshiUnlockSeen };
    }
    return {
      locked: !!p?.locked, hp: p?.hp, seen: !!s.flags?.preshiUnlockSeen,
      modal: s.hallModal, saved,
    };
  });
  T("普雷希：点击后角色解锁", afterPreshi.locked === false, afterPreshi);
  T("普雷希：解锁后满血", afterPreshi.hp > 0, afterPreshi);
  T("普雷希：preshiUnlockSeen 置位", afterPreshi.seen === true, afterPreshi);
  T("普雷希：弹窗关闭", afterPreshi.modal === null, afterPreshi);
  T("普雷希：存档已落盘且为解锁态",
    !!afterPreshi.saved && afterPreshi.saved.seen === true
    && afterPreshi.saved.locked.preshi === false, afterPreshi.saved);

  /* ── E. 击败1312号 → 米尔尤拉弹窗 → 跳到结尾 → 真实点击完成 ── */
  const beat2 = await page.evaluate(async () => {
    const s = window.state;
    const run = {
      missionId: "ruins_sand_city", focusId: "ruins_sand_city", difficultyId: "normal",
      complete: true, party: ["lokar"], activeParty: ["lokar"],
    };
    window.DungeonSettlementActions.queueBattleExtras(
      s, run, "boss", { defeatedEnemyIds: ["witherer_1312"] });
    try { await window.DungeonSettlementActions.retryPending(s); }
    catch (e) { return { error: String(e) }; }
    return { elites: [...(s.defeatedElites || [])] };
  });
  T("击败1312号：真实结算写入 defeatedElites",
    (beat2.elites || []).includes("witherer_1312"), beat2);

  const mieryulaOpen = await page.evaluate(() => {
    const s = window.state;
    s.view = "hall"; s.explore = null; s.battle = null; s.hallModal = null;
    const fired = window.NewCharacterUnlockEvents?.triggerPending?.(s);
    window.render?.();
    return { fired: !!fired, modal: s.hallModal };
  });
  T("米尔尤拉：击败后回大厅自动弹出解锁弹窗", mieryulaOpen.modal === "mieryulaUnlock", mieryulaOpen);

  await page.waitForSelector(".adv-box", { timeout: 5000 });
  await page.click("[data-adv-skip]");
  await page.waitForSelector(".actions button", { timeout: 5000 });
  const mieryulaBtn = await finishAttr(page);
  T("米尔尤拉：跳到结尾后完成按钮属性正确",
    mieryulaBtn?.attr === "data-mieryula-unlock-complete", mieryulaBtn);
  T("米尔尤拉：完成按钮未被 disabled", mieryulaBtn?.disabled === false, mieryulaBtn);

  const mieryulaClick = await realClickFinish(page, "data-mieryula-unlock-complete");
  T("米尔尤拉：真实鼠标点击完成按钮成功",
    mieryulaClick.clicked === true, mieryulaClick);

  const afterMieryula = await page.evaluate(() => {
    const s = window.state;
    const m = s.chars.find(c => c.id === "mieryula");
    return {
      locked: !!m?.locked, hp: m?.hp, seen: !!s.flags?.mieryulaUnlockSeen,
      modal: s.hallModal,
    };
  });
  T("米尔尤拉：点击后角色解锁", afterMieryula.locked === false, afterMieryula);
  T("米尔尤拉：解锁后满血", afterMieryula.hp > 0, afterMieryula);
  T("米尔尤拉：mieryulaUnlockSeen 置位", afterMieryula.seen === true, afterMieryula);
  T("米尔尤拉：弹窗关闭", afterMieryula.modal === null, afterMieryula);

  /* ── F. 读档残留：adv 停在结尾时重开弹窗，完成按钮仍可点 ── */
  const reload = await page.evaluate(() => {
    const s = window.state;
    const m = s.chars.find(c => c.id === "mieryula");
    if (m) m.locked = true;
    s.flags.mieryulaUnlockSeen = false;
    // 模拟读档残留：进度停在最后一句
    s.adv = { key: "mieryulaUnlock", index: 99, total: 13 };
    s.hallModal = null;
    window.NewCharacterUnlockEvents?.triggerPending?.(s);
    window.render?.();
    return { modal: s.hallModal, adv: { ...(s.adv || {}) } };
  });
  T("读档残留：进度停尾句时仍弹出米尔尤拉弹窗", reload.modal === "mieryulaUnlock", reload);
  const reloadBtn = await finishAttr(page);
  T("读档残留：完成按钮直接可见（无需重新逐句）",
    reloadBtn?.attr === "data-mieryula-unlock-complete", reloadBtn);
  if (reloadBtn?.attr) {
    const rc = await realClickFinish(page, reloadBtn.attr);
    const done = await page.evaluate(() => !window.state.chars.find(c => c.id === "mieryula")?.locked);
    T("读档残留：完成按钮点击生效", rc.clicked === true && done === true, { rc, done });
  }

  /* ── G. 关闭弹窗后重开：不点完成直接关掉，再次触发仍能开 ── */
  const reopen = await page.evaluate(() => {
    const s = window.state;
    const m = s.chars.find(c => c.id === "mieryula");
    if (m) m.locked = true;
    s.flags.mieryulaUnlockSeen = false;
    s.adv = { key: "mieryulaUnlock", index: 0, total: 13 };
    s.hallModal = null;
    window.NewCharacterUnlockEvents?.triggerPending?.(s);
    const first = s.hallModal;
    s.hallModal = null;           // 模拟玩家关闭
    window.NewCharacterUnlockEvents?.triggerPending?.(s);
    return { first, second: s.hallModal };
  });
  T("重开：关闭后可再次触发同一弹窗（不会被吞）",
    reopen.first === "mieryulaUnlock" && reopen.second === "mieryulaUnlock", reopen);
  await page.evaluate(() => window.render?.());
  await page.waitForSelector(".adv-box", { timeout: 5000 });
  await page.click("[data-adv-skip]");
  await page.waitForSelector(".actions button", { timeout: 5000 });
  const reopenBtn = await finishAttr(page);
  T("重开：完成按钮再次可见", reopenBtn?.attr === "data-mieryula-unlock-complete", reopenBtn);
  const rc2 = await realClickFinish(page, "data-mieryula-unlock-complete");
  const reopenDone = await page.evaluate(() =>
    !window.state.chars.find(c => c.id === "mieryula")?.locked);
  T("重开：完成按钮点击生效", rc2.clicked === true && reopenDone === true, { rc2, reopenDone });

  /* ── H. 排队：两条件同时满足，先普雷希，完成后轮到米尔尤拉 ── */
  const queue = await page.evaluate(() => {
    const s = window.state;
    const p = s.chars.find(c => c.id === "preshi");
    const m = s.chars.find(c => c.id === "mieryula");
    if (p) p.locked = true;
    if (m) m.locked = true;
    s.flags.preshiUnlockSeen = false;
    s.flags.mieryulaUnlockSeen = false;
    s.defeatedElites = ["mech_ai_dragon", "witherer_1312"];
    s.adv = { key: "", index: 0, total: 0 };
    s.hallModal = null;
    window.NewCharacterUnlockEvents?.triggerPending?.(s);
    const first = s.hallModal;
    // 完成普雷希
    if (p) p.locked = false;
    s.flags.preshiUnlockSeen = true;
    s.hallModal = null;
    window.NewCharacterUnlockEvents?.triggerPending?.(s);
    return { first, second: s.hallModal };
  });
  T("排队：两条件同时满足时先弹普雷希", queue.first === "preshiUnlock", queue);
  T("排队：普雷希完成后再次触发轮到米尔尤拉（不被永久吞掉）",
    queue.second === "mieryulaUnlock", queue);

  /* ── I. 小视口：完成按钮必须仍在视口内可点（台词多时容易被挤出屏幕） ── */
  for (const vp of [{ width: 1280, height: 720 }, { width: 1024, height: 768 }]) {
    await page.setViewportSize(vp);
    const opened = await page.evaluate(() => {
      const s = window.state;
      const m = s.chars.find(c => c.id === "mieryula");
      if (m) m.locked = true;
      s.flags.mieryulaUnlockSeen = false;
      s.adv = { key: "mieryulaUnlock", index: 99, total: 13 };
      s.hallModal = null;
      window.NewCharacterUnlockEvents?.triggerPending?.(s);
      window.render?.();
      return s.hallModal;
    });
    if (opened !== "mieryulaUnlock") { T(`小视口 ${vp.width}x${vp.height}：弹窗打开`, false, { opened }); continue; }
    await page.waitForSelector(".actions button", { timeout: 5000 });
    const inView = await page.evaluate(v => {
      const b = document.querySelector("[data-mieryula-unlock-complete]");
      if (!b) return { found: false };
      const r = b.getBoundingClientRect();
      return { found: true, top: Math.round(r.top), bottom: Math.round(r.bottom),
        h: Math.round(r.height), vh: v.height,
        inside: r.top >= 0 && r.bottom <= v.height && r.width > 0 && r.height > 0 };
    }, vp);
    T(`小视口 ${vp.width}x${vp.height}：完成按钮完整落在视口内`,
      inView.found === true && inView.inside === true, inView);
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  T("全程无 JS 错误", errors.length === 0, errors.slice(0, 3));
  console.log(`\n通过 ${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})();
