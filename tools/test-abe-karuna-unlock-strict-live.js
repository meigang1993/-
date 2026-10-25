// 实战：安倍卡露娜解锁链路的严格检查（真实触发 + 真实鼠标点击 + 命中测试）
// 覆盖：真实触发路径、五组负向对照、按钮可点击性（命中测试，防「看得见点不了」）、
//       解锁后不重复触发、断线重连恢复、管家手册目标。
// 说明：既有的 test-all-unlock-events-live.js 对该事件是直接置 pending 后开弹窗，
//       未覆盖「艾尔拉娜在队 + 遭遇安倍麦克」的真实触发条件，本文件补这一段。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startFreshGame } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  else console.log(`❌ ${name}  ← ${JSON.stringify(extra || {})}`);
  return !!cond;
};

const COMPLETE = "data-abe-karuna-unlock-complete";
const SKIP = "data-adv-skip";

// 准备：新档基线 + 艾尔拉娜入队（卡露娜保持锁定）
const reset = (page, opts = {}) => page.evaluate(o => {
  const s = window.state;
  s.chars.forEach(c => { c.locked = !(c.id === "lokar" || c.id === "besta_doll"); });
  s.flags = {};
  s.defeatedElites = [];
  s.unlockEvents = { version: 2, completed: {} };
  s.adv = null; s.hallModal = null; s.battle = null; s.explore = null; s.view = "hall";
  const u = id => { const c = s.chars.find(x => x.id === id); if (c) c.locked = false; };
  if (!o.noElrana) u("elrana");
  // 给出征队伍造成伤势，用于验证「触发后回满血」
  s.chars.forEach(c => { if (c.id === "lokar" || c.id === "elrana") c.hp = 1; });
  s.explore = {
    activeParty: o.noElrana ? ["lokar"] : ["lokar", "elrana"],
    party: o.noElrana ? ["lokar"] : ["lokar", "elrana"],
    missionId: "m1", focusId: "f1",
  };
  window.render?.();
}, opts);

// 真实触发：调用游戏自身的遭遇判定，不手工置 flag
const trigger = (page, enemies) => page.evaluate(async en => {
  const s = window.state;
  let err = null, ok = null;
  try { ok = await window.tryAbeKarunaEncounter(s, { exploration: true, enemies: en }); }
  catch (e) { err = String((e && e.message) || e); }
  // 遭遇判定只改 state，不负责重绘；不补这次 render，DOM 会停留在此前的对话框上
  window.render?.();
  const hp = id => { const c = s.chars.find(x => x.id === id); return c ? c.hp : null; };
  return {
    ok, err, view: s.view, modal: s.hallModal,
    pending: !!s.flags?.abeKarunaUnlockPending, seen: !!s.flags?.abeKarunaUnlockSeen,
    hasBattle: !!s.battle, hasExplore: !!s.explore,
    hpLokar: hp("lokar"), maxLokar: (s.chars.find(x => x.id === "lokar") || {}).stats?.maxHp,
    advKey: s.adv?.key || null,
    log0: s.log?.[0] || "",
  };
}, enemies);

// 命中测试：按钮中心点的最顶层元素必须是按钮自身或其后代
const hitTest = (page, sel) => page.evaluate(s => {
  const el = document.querySelector(s);
  if (!el) return { exists: false };
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const top = document.elementFromPoint(cx, cy);
  const cls = top && top.className ? String(top.className).split(" ")[0] : "";
  return {
    exists: true,
    visible: r.width > 0 && r.height > 0,
    pe: getComputedStyle(el).pointerEvents,
    disabled: !!el.disabled,
    hitSelf: !!top && (top === el || el.contains(top)),
    top: top ? `${top.tagName}${cls ? "." + cls : ""}` : null,
    box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
  };
}, sel);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await openGame(page);
  await startFreshGame(page);
  await page.waitForTimeout(400);

  const karunaLocked = () => page.evaluate(() => {
    const c = window.state.chars.find(x => x.id === "abe_karuna");
    return c ? !!c.locked : null;
  });

  // ——— A 组：真实触发路径 ———
  await reset(page);
  const a = await trigger(page, [{ id: "abe_mike" }]);
  T("A1 条件齐备时触发成功", a.ok === true && !a.err, a);
  T("A2 战斗被强制终止", a.hasBattle === false && a.hasExplore === false, a);
  T("A3 返回大厅并弹出事件", a.view === "hall" && a.modal === "abeKarunaUnlock", a);
  T("A4 pending 标记置位", a.pending === true, a);
  T("A5 出征队伍回满血", a.hpLokar === a.maxLokar && a.hpLokar > 1, a);
  T("A6 日志写明战斗被强制终止", /强制终止/.test(a.log0), { log0: a.log0 });

  // ——— B 组：负向对照（任一条件不满足即不得触发）———
  await reset(page, { noElrana: true });
  const b1 = await trigger(page, [{ id: "abe_mike" }]);
  T("B1 队伍没有艾尔拉娜时不触发", b1.ok === false && b1.modal !== "abeKarunaUnlock", b1);

  await reset(page);
  await page.evaluate(() => { const c = window.state.chars.find(x => x.id === "elrana"); if (c) c.locked = true; });
  const b2 = await trigger(page, [{ id: "abe_mike" }]);
  T("B2 艾尔拉娜未解锁时不触发", b2.ok === false, b2);

  await reset(page);
  const b3 = await trigger(page, [{ id: "other_enemy" }]);
  T("B3 敌人不是安倍麦克时不触发", b3.ok === false, b3);

  await reset(page);
  await page.evaluate(() => { window.state.flags.abeKarunaUnlockSeen = true; });
  const b4 = await trigger(page, [{ id: "abe_mike" }]);
  T("B4 已完成过时不触发", b4.ok === false, b4);

  await reset(page);
  await page.evaluate(() => {
    const c = window.state.chars.find(x => x.id === "abe_karuna");
    if (c) { c.locked = false; c.level = 10; }
  });
  const b5 = await trigger(page, [{ id: "abe_mike" }]);
  T("B5 卡露娜已解锁时不触发", b5.ok === false, b5);

  // ——— C 组：按钮可点击性（真实鼠标 + 命中测试）———
  await reset(page);
  await trigger(page, [{ id: "abe_mike" }]);
  await page.waitForSelector(".adv-box", { timeout: 5000 });

  const skip = await hitTest(page, `[${SKIP}]`);
  T("C1 「跳到结尾」按钮存在且可见", skip.exists && skip.visible, skip);
  T("C2 「跳到结尾」未被禁用点击", skip.pe !== "none" && !skip.disabled, skip);
  T("C3 「跳到结尾」命中测试指向自身", skip.hitSelf === true, skip);

  await page.click(`[${SKIP}]`);
  await page.waitForSelector(`[${COMPLETE}]`, { timeout: 5000 });
  T("C4 点击后推进到结尾", true);

  const btn = await hitTest(page, `[${COMPLETE}]`);
  T("C5 完成按钮存在且可见", btn.exists && btn.visible, btn);
  T("C6 完成按钮未被禁用点击", btn.pe !== "none" && !btn.disabled, btn);
  T("C7 完成按钮命中测试指向自身（未被遮挡）", btn.hitSelf === true, btn);
  T("C8 完成按钮文案正确", await page.textContent(`[${COMPLETE}]`) === "带安倍卡露娜回别墅");

  await page.click(`[${COMPLETE}]`);
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => {
    const s = window.state;
    return {
      locked: !!s.chars.find(x => x.id === "abe_karuna")?.locked,
      seen: !!s.flags?.abeKarunaUnlockSeen,
      pending: !!s.flags?.abeKarunaUnlockPending,
      completed: !!s.unlockEvents?.completed?.abe_karuna,
      modal: s.hallModal,
      savedLocked: !!window.store?.read?.()?.chars?.find?.(x => x.id === "abe_karuna")?.locked,
    };
  });
  T("C9 真实点击后角色解锁", after.locked === false, after);
  T("C10 seen 标记置位", after.seen === true, after);
  T("C11 pending 标记清除", after.pending === false, after);
  T("C12 解锁进度已记录", after.completed === true, after);
  // 完成卡露娜事件后可能紧接着触发「艾斯」解锁（艾尔拉娜已解锁且艾斯仍锁定），
  // 属正常连锁，故只断言卡露娜自身的弹窗已关闭。
  T("C13 卡露娜弹窗已关闭", after.modal !== "abeKarunaUnlock", after);
  T("C14 解锁状态已落盘", after.savedLocked === false, after);

  // ——— D 组：解锁后不重复触发 ———
  await page.evaluate(() => {
    const s = window.state;
    s.explore = { activeParty: ["lokar", "elrana"], party: ["lokar", "elrana"], missionId: "m2" };
    s.hallModal = null;
    window.render?.();
  });
  const d = await trigger(page, [{ id: "abe_mike" }]);
  T("D1 解锁后再遇不触发", d.ok === false, d);
  T("D2 不再弹窗", d.modal !== "abeKarunaUnlock", d);
  T("D3 探索未被无故终止", d.hasExplore === true, d);

  // ——— E 组：断线重连（pending 未完成即重载）———
  await reset(page);
  await page.evaluate(() => {
    const s = window.state;
    s.flags.abeKarunaUnlockPending = true;
    s.view = "hall"; s.hallModal = null;
    window.render?.();
  });
  const e1 = await page.evaluate(() => {
    const fn = window.StoreUnlockRecovery?.recoverPendingAbeKarunaEvent;
    if (typeof fn !== "function") return { hasFn: false };
    fn(window.state);
    window.render?.();
    return {
      hasFn: true, modal: window.state.hallModal,
      seen: !!window.state.flags?.abeKarunaUnlockSeen,
      pending: !!window.state.flags?.abeKarunaUnlockPending,
    };
  });
  if (!e1.hasFn) {
    T("E1 恢复函数存在", false, { note: "未找到 StoreUnlockRecovery 的恢复入口" });
    T("E2 未完成时重载回到事件弹窗", false, { skipped: true });
    T("E3 恢复后仍可完成解锁", false, { skipped: true });
  } else {
    T("E1 恢复函数存在", true);
    T("E2 未完成时重载回到事件弹窗", e1.modal === "abeKarunaUnlock", e1);
    // 卡露娜仍锁定时，恢复只负责把玩家送回弹窗，不替玩家完成解锁
    T("E3 未完成时保留 pending、不替玩家完成", e1.seen === false && e1.pending === true, e1);
    // 回到弹窗后真实点击完成按钮，应能正常解锁
    await page.waitForSelector(".adv-box", { timeout: 5000 });
    await page.click(`[${SKIP}]`);
    await page.waitForSelector(`[${COMPLETE}]`, { timeout: 5000 });
    await page.click(`[${COMPLETE}]`);
    await page.waitForTimeout(500);
    const e4 = await page.evaluate(() => {
      const s = window.state;
      return {
        locked: !!s.chars.find(x => x.id === "abe_karuna")?.locked,
        seen: !!s.flags?.abeKarunaUnlockSeen,
        pending: !!s.flags?.abeKarunaUnlockPending,
      };
    });
    T("E4 重连后真实点击仍能完成解锁",
      e4.locked === false && e4.seen === true && e4.pending === false, e4);
  }

  // ——— F 组：管家手册 ———
  await page.locator("[data-open-butler]").waitFor({ state: "visible", timeout: 30000 });
  const f = await page.evaluate(() => {
    const heroes = (window.GameData?.characters || []).map(c => c.name);
    return { count: heroes.length, has: heroes.some(h => String(h).includes("安倍卡露娜")), sample: heroes.slice(0, 3) };
  });
  T("F1 管家手册目标含安倍卡露娜", f.has === true, f);
  T("F2 目标总数为 33", f.count === 33, f);

  // ——— G 组：全程无 JS 错误 ———
  T("G1 全程无 JS 错误", errors.length === 0, errors.slice(0, 3));

  await browser.close();
  console.log(`\n通过 ${pass}/${total}`);
  process.exit(pass === total ? 0 : 1);
})();
