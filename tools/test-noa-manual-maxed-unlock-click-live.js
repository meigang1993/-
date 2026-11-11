// 怪面诺亚 · 管家手册20级点亮 & 解锁兑换事件按键真实点击 严格检查
//   A 魅魔目标：level=20 点亮（.maxed / 20/20 / overall done+1），19 不点亮，未解锁灰剪影
//   B 第三次全军覆没剧情 + 殿堂兑换：真实鼠标点击（非 evaluate(el.click())），
//     验证可见/未禁用/无遮挡/命中测试/绑定生效/宝珠不足时禁用
//   C 运行时反向：破坏 maxed 判定、摘掉按钮绑定，断言必须检出
// 支持 NOA_MU=A,B,C 分批；默认全跑。
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const {
  openGame, startFreshGame, dismissOpeningStory, collectErrors, relevantErrors,
} = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const SEGS = (process.env.NOA_MU || "A,B,C").split(",").filter(Boolean);
let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return !!cond;
};

async function boot() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  await dismissOpeningStory(page);
  await page.locator("[data-open-butler]").waitFor({ state: "visible", timeout: 30000 });
  return { browser, page, errors };
}

async function setHero(page, level, locked) {
  return page.evaluate(({ level, locked }) => {
    const st = window.state;
    const c = st.chars.find(x => x.id === "noa");
    if (!c) return { has: false };
    c.locked = locked;
    c.level = level;
    st.butlerManual = true;
    st.butlerTab = "hero";
    window.render?.();
    return { has: true };
  }, { level, locked });
}

async function heroSnap(page) {
  await page.locator("[data-butler-tab='hero']").waitFor({ state: "visible", timeout: 10000 });
  return page.evaluate(() => {
    const st = window.state;
    const P = window.ButlerManualProgress;
    const nodes = [...document.querySelectorAll(".butler-hero")];
    const n = nodes.find(el => (el.querySelector("b")?.textContent || "").trim() === "怪面诺亚");
    const list = P?.heroList ? P.heroList(st) : [];
    const item = list.find(h => h.id === "noa") || null;
    return {
      found: !!n,
      maxedClass: !!n && n.classList.contains("maxed"),
      lockedClass: !!n && n.classList.contains("locked"),
      small: n?.querySelector("small")?.textContent?.trim() || "",
      item: item ? { level: item.level, maxed: item.maxed, unlocked: item.unlocked } : null,
      overall: P?.overall ? P.overall(st).heroes : null,
      total: list.length,
    };
  });
}

// 命中测试：按钮中心点必须真的落在按钮（或其子元素）上，排除被遮罩挡住。
const HIT = sel => `(() => {
  const el = document.querySelector(${JSON.stringify(sel)});
  if (!el) return { exists: false };
  const r = el.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  const cs = getComputedStyle(el);
  return {
    exists: true, disabled: !!el.disabled, pe: cs.pointerEvents,
    w: Math.round(r.width), h: Math.round(r.height),
    hit: !!hit && (hit === el || el.contains(hit)),
    text: (el.textContent || "").trim(),
  };
})()`;

async function segA(page, errors) {
  const ok = await setHero(page, 20, false);
  T("A0 角色栏含怪面诺亚", ok.has === true, ok);
  const lv20 = await heroSnap(page);
  T("A1 20级魅魔目标点亮（.maxed）", lv20.found && lv20.maxedClass === true, lv20);
  T("A2 等级显示 20/20", lv20.small === "20/20", lv20.small);
  T("A3 数据层 maxed=true / unlocked=true", lv20.item?.maxed === true
    && lv20.item?.level === 20 && lv20.item?.unlocked === true, lv20.item);
  T("A4 满级计数分母为全部可培养角色", lv20.overall?.total === 34 && lv20.total === 34,
    { overall: lv20.overall, total: lv20.total });

  await setHero(page, 19, false);
  const lv19 = await heroSnap(page);
  T("A5 19级不点亮（非恒真）", lv19.maxedClass === false && lv19.item?.maxed === false, lv19);
  T("A6 20级比19级多计1名满级", lv20.overall?.done === lv19.overall?.done + 1,
    { d20: lv20.overall?.done, d19: lv19.overall?.done });

  await setHero(page, 0, true);
  const locked = await heroSnap(page);
  T("A7 未解锁时是灰剪影占位、不点亮", locked.found && locked.lockedClass === true
    && locked.maxedClass === false && locked.small === "0/20", locked);

  await setHero(page, 20, false);
  const again = await heroSnap(page);
  T("A8 重新20级仍点亮（非一次性缓存）", again.maxedClass === true, again);
  T("A9 无页面错误", relevantErrors(errors).length === 0, relevantErrors(errors).slice(0, 3));
}

async function triggerThirdDefeat(page) {
  return page.evaluate(() => {
    const st = window.state;
    st.butlerManual = false;
    st.view = "hall";
    st.flags = st.flags || {};
    st.flags.thirdDefeatSeen = true;
    delete st.flags.noaNurseryUnlocked;
    st.hallModal = null;
    const c = st.chars.find(x => x.id === "noa");
    if (c) { c.locked = true; c.level = 0; }
    const fired = !!window.StoreUnlockMigrations?.recoverPendingDefeatEvents?.(st);
    window.render?.();
    return { fired, modal: st.hallModal };
  });
}

async function segB(page, errors) {
  const trig = await triggerThirdDefeat(page);
  T("B0 第三次全军覆没触发剧情弹窗", trig.fired && trig.modal === "thirdDefeat", trig);
  await page.locator(".adv-box").waitFor({ state: "visible", timeout: 10000 });

  // 逐句用真实鼠标点击推进（现有集成测试用的是 evaluate(el.click())，绕过了命中/遮挡）。
  const lines = [];
  let advClicks = 0;
  for (let i = 0; i < 16; i++) {
    // 先记当前帧文本，再判断是否结束：完成按钮出现的那一帧仍显示最后一句对话。
    const cur = await page.evaluate(() => ({
      text: (document.querySelector(".adv-box")?.textContent || "").trim(),
      done: !!document.querySelector("[data-third-defeat-complete]"),
      adv: !!document.querySelector(".adv-box[data-adv-advance]"),
    }));
    if (cur.text) lines.push(cur.text);
    if (cur.done || !cur.adv) break;
    await page.locator(".adv-box[data-adv-advance]").click({ timeout: 6000 });
    advClicks++;
    await page.waitForTimeout(130);
  }
  const joined = lines.join("|");
  T("B1 真实点击推进对话，关键句齐全", advClicks >= 3
    && ["罗卡尔，你又失败了。", "地下室封印着强大的淫气改造者",
      "多给她男人，不然她会发狂的。", "好的，妈妈，有了我会试试。"]
      .every(s => joined.includes(s)), { advClicks, lines: lines.length, joined: joined.slice(0, 160) });

  const done = page.locator("[data-third-defeat-complete]");
  await done.waitFor({ state: "visible", timeout: 10000 });
  const doneHit = await page.evaluate(HIT("[data-third-defeat-complete]"));
  T("B2 剧情完成按钮可点（未禁用/有尺寸/无遮挡/pointer-events正常）",
    doneHit.exists && doneHit.disabled === false && doneHit.pe !== "none"
    && doneHit.w > 0 && doneHit.h > 0 && doneHit.hit === true, doneHit);
  await done.click({ timeout: 8000 });
  await page.waitForTimeout(400);
  const afterEvent = await page.evaluate(() => ({
    flag: !!window.state.flags?.noaNurseryUnlocked,
    locked: !!window.state.chars.find(c => c.id === "noa")?.locked,
    modal: window.state.hallModal,
  }));
  T("B3 真实点击完成按钮后开放兑换且未直接入栏",
    afterEvent.flag === true && afterEvent.locked === true, afterEvent);

  // ===== 孕育殿堂兑换 =====
  await page.evaluate(() => {
    const st = window.state;
    st.resources.essence = 100;
    st.view = "nursery";
    st.hallModal = null;
    window.render?.();
  });
  const buy = page.locator("[data-unlock='noa']");
  await buy.waitFor({ state: "visible", timeout: 10000 });
  // 殿堂页面较长，按钮可能在视口外；elementFromPoint 用的是视口坐标，必须先滚动。
  await buy.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  const buyHit = await page.evaluate(HIT("[data-unlock='noa']"));
  T("B4 兑换按钮可点（未禁用/有尺寸/无遮挡/pointer-events正常）",
    buyHit.exists && buyHit.disabled === false && buyHit.pe !== "none"
    && buyHit.w > 0 && buyHit.h > 0 && buyHit.hit === true, buyHit);
  T("B5 兑换按钮文案为注入宝珠唤醒", buyHit.text.includes("注入宝珠唤醒"), buyHit.text);

  // 宝珠不足时按钮应禁用（负向对照，避免"任何时候都能点"）。
  const poor = await page.evaluate(() => {
    const st = window.state;
    st.resources.essence = 99;
    window.render?.();
    const el = document.querySelector("[data-unlock='noa']");
    return { disabled: !!el?.disabled, essence: st.resources.essence };
  });
  T("B6 宝珠不足时兑换按钮禁用", poor.disabled === true, poor);

  await page.evaluate(() => { window.state.resources.essence = 100; window.render?.(); });
  await buy.click({ timeout: 8000 });
  await page.waitForTimeout(500);
  const bought = await page.evaluate(() => {
    const c = window.state.chars.find(x => x.id === "noa");
    return { locked: !!c?.locked, essence: window.state.resources.essence };
  });
  T("B7 真实点击兑换后唤醒成功且扣除100宝珠",
    bought.locked === false && bought.essence === 0, bought);
  T("B8 无页面错误", relevantErrors(errors).length === 0, relevantErrors(errors).slice(0, 3));
}

async function segC(page, browser) {
  // C1 运行时破坏 maxed 判定 → 点亮必须消失（证明 A1 不是恒真断言）。
  await setHero(page, 20, false);
  const broken = await page.evaluate(() => {
    const P = window.ButlerManualProgress;
    if (!P?.heroList) return { ok: false };
    const orig = P.heroList;
    P.heroList = st => orig(st).map(h => ({ ...h, maxed: false }));
    window.render?.();
    const n = [...document.querySelectorAll(".butler-hero")]
      .find(el => (el.querySelector("b")?.textContent || "").trim() === "怪面诺亚");
    const res = { ok: true, maxedClass: !!n && n.classList.contains("maxed") };
    P.heroList = orig;
    window.render?.();
    return res;
  });
  T("C1 破坏 maxed 判定后点亮消失（反向成立）", broken.ok && broken.maxedClass === false, broken);

  // C2 摘掉兑换按钮绑定 → 真实点击不应改变状态。
  await page.evaluate(() => {
    const st = window.state;
    const c = st.chars.find(x => x.id === "noa");
    if (c) c.locked = true;
    st.flags = st.flags || {};
    st.flags.noaNurseryUnlocked = true; // C 段单独跑时也要先开放兑换
    st.resources.essence = 100;
    st.view = "nursery";
    st.hallModal = null;
    window.render?.();
    const el = document.querySelector("[data-unlock='noa']");
    if (el) el.onclick = null;
  });
  const buy = page.locator("[data-unlock='noa']");
  await buy.waitFor({ state: "visible", timeout: 10000 });
  await buy.click({ timeout: 8000 });
  await page.waitForTimeout(300);
  const unbound = await page.evaluate(() => ({
    locked: !!window.state.chars.find(x => x.id === "noa")?.locked,
    essence: window.state.resources.essence,
  }));
  T("C2 摘掉绑定后真实点击不生效（反向成立）",
    unbound.locked === true && unbound.essence === 100, unbound);

  // C3 破坏 HallUnlockEvents.complete → 完成按钮真实点击不应置旗标。
  // ADV 对话是全局单例：同一页面二次触发会停在"已播放完"的状态，完成按钮不再出现。
  // 用全新页面重跑一遍剧情，才能真实点击完成按钮做绑定反向验证。
  const p2 = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  try {
    await openGame(p2);
    await startFreshGame(p2);
    await dismissOpeningStory(p2);
    await p2.locator("[data-open-butler]").waitFor({ state: "visible", timeout: 30000 });
    const retrig = await p2.evaluate(() => {
      const st = window.state;
      st.flags = st.flags || {};
      st.flags.thirdDefeatSeen = true;
      delete st.flags.noaNurseryUnlocked;
      st.view = "hall";
      st.hallModal = null;
      const fired = !!window.StoreUnlockMigrations?.recoverPendingDefeatEvents?.(st);
      window.render?.();
      // 破坏完成回调：真实点击按钮后不应置旗标。
      if (window.HallUnlockEvents) window.HallUnlockEvents.complete = () => {};
      return { fired, modal: st.hallModal };
    });
    T("C3a 新页面剧情重新触发", retrig.fired && retrig.modal === "thirdDefeat", retrig);
    for (let i = 0; i < 16; i++) {
      if (await p2.locator("[data-third-defeat-complete]").count()) break;
      const box = p2.locator(".adv-box[data-adv-advance]");
      if (!await box.count()) break;
      await box.click({ timeout: 6000 });
      await p2.waitForTimeout(120);
    }
    const done = p2.locator("[data-third-defeat-complete]");
    await done.waitFor({ state: "visible", timeout: 10000 });
    await done.click({ timeout: 8000 });
    await p2.waitForTimeout(300);
    const noComplete = await p2.evaluate(() => !!window.state.flags?.noaNurseryUnlocked);
    T("C3 破坏完成回调后点击不置旗标（反向成立）", noComplete === false, { flag: noComplete });
  } finally { await p2.close(); }
}

(async () => {
  const { browser, page, errors } = await boot();
  try {
    if (SEGS.includes("A")) await segA(page, errors);
    if (SEGS.includes("B")) await segB(page, errors);
    if (SEGS.includes("C")) await segC(page, browser);
  } finally { await browser.close(); }
  console.log(`\nRESULT ${pass}/${total} SEGS=${SEGS.join(",")}`);
  if (pass !== total) process.exit(1);
})().catch(e => { console.error("FATAL", e); process.exit(2); });
