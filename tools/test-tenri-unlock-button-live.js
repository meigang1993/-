// 天日国鹰7研究所 · 解锁剧情按键真实浏览器点击检查（255 版）
// 回答：事件弹窗里「继续 / 上一句 / 跳到结尾 / 各自准备，明天出发」是否真的能点、
// 点击后是否真的完成解锁并关闭弹窗；顺带核对大厅入口 devLocked「未开发完成」。
// 不改任何产品源码，只在页面运行时构造触发条件与老档补触发场景。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || "/data/workspace/.pw-browsers";
const { chromium } = require("playwright");
const path = require("path");
const { dismissOpeningStory } = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const ROOT = path.resolve(__dirname, "..");
const results = [];
const check = (group, name, ok, detail = "") => {
  results.push({ group, name, ok: !!ok, detail });
  console.log(`${ok ? "✅" : "❌"} [${group}] ${name}${detail ? " · " + detail : ""}`);
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + String(e)));
  page.on("console", m => { if (m.type() === "error" && !/favicon/.test(m.text())) errors.push("console: " + m.text()); });

  await page.goto("file://" + path.join(ROOT, "publish", "index.html"));
  await page.locator("#view").waitFor({ state: "visible" });
  await page.waitForTimeout(2200);
  await page.locator("[data-start-game]").click();
  await dismissOpeningStory(page);
  await page.locator(".villa-hall").waitFor({ state: "visible" });
  await page.evaluate(() => Promise.all([
    window.GameBundles.load("battle"), window.GameBundles.load("dungeon"), window.GameBundles.load("hall"),
  ]));
  await page.waitForTimeout(400);

  // 通用按钮「可点击」探针：存在 / 可见 / enabled / 有尺寸 / pointer-events / 命中测试无遮挡
  const probe = selector => page.evaluate(sel => {
    const el = document.querySelector(sel);
    if (!el) return { exists: false };
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const top = document.elementFromPoint(cx, cy);
    return {
      exists: true,
      visible: r.width > 0 && r.height > 0 && cs.display !== "none" && cs.visibility !== "hidden",
      disabled: !!el.disabled,
      w: Math.round(r.width), h: Math.round(r.height),
      pointerEvents: cs.pointerEvents,
      hit: top === el || (top && el.contains(top)),
      topInfo: top ? `${top.tagName}.${String(top.className || "").slice(0, 60)}` : "null",
      text: (el.textContent || "").trim().slice(0, 40),
    };
  }, selector);
  const clickable = p => p.exists && p.visible && !p.disabled && p.pointerEvents !== "none" && p.hit;

  // 清场并把状态恢复到「尚未触发研究所剧情」
  const reset = async ({ viaRun = true } = {}) => {
    await page.evaluate(({ viaRun }) => {
      const st = window.state;
      st.flags = st.flags || {};
      delete st.flags.tenriInstituteUnlocked;
      delete st.flags.tenriInstituteUnlockSeen;
      delete st.flags.tenriInstituteUnlockPending;
      if (window.UnlockEventProgress?.fresh) st.unlockEvents = window.UnlockEventProgress.fresh();
      ["preshi", "mieryula"].forEach(id => { const c = (st.chars || []).find(x => x.id === id); if (c) c.locked = false; });
      st.view = "hall"; st.hallModal = null; st.explore = null; st.battle = null; st.adv = null;
      if (viaRun) {
        const run = { missionId: "ruins_sand_city", difficultyId: "adventure", complete: true };
        window.triggerTenriInstituteUnlockEvent(st, run);
      } else {
        st.flags.tenriInstituteUnlockPending = true;
        window.HallUnlockEvents.triggerAll();
      }
      if (window.render) window.render();
    }, { viaRun });
    await page.waitForTimeout(500);
  };

  // ---------- A 首次通关触发：弹窗出现 ----------
  await reset({ viaRun: true });
  const modal = await page.evaluate(() => ({
    hallModal: window.state.hallModal,
    title: document.querySelector(".villa-modal h2")?.textContent || "",
    speaker: document.querySelector(".adv-name")?.textContent || "",
    text: document.querySelector(".adv-text")?.textContent || "",
    progress: document.querySelector(".adv-progress")?.textContent || "",
    advBox: !!document.querySelector("[data-adv-advance]"),
  }));
  check("A", "触发后 hallModal = tenriInstituteUnlock", modal.hallModal === "tenriInstituteUnlock", modal.hallModal);
  check("A", "弹窗标题「天日国鹰7研究所 · 出发前夜」", modal.title.includes("天日国鹰7研究所") && modal.title.includes("出发前夜"), modal.title);
  check("A", "首句为橘千樱台词", modal.speaker === "橘千樱" && modal.text.includes("好了，我帮你做完了事"), `${modal.speaker}｜${modal.text.slice(0, 24)}`);
  check("A", "进度显示 1 / 9", modal.progress.includes("1 / 9"), modal.progress);
  check("A", "对话框已渲染（可点击推进）", modal.advBox);
  await page.screenshot({ path: "/data/workspace/研究所解锁事件-首句.png" });

  // ---------- B 逐句「继续 ▸」真实点击 ----------
  const LINES = await page.evaluate(() => window.TenriInstituteUnlockEvents.LINES.map(x => x.slice()));
  let advOk = true;
  for (let i = 1; i <= 8; i++) {
    const p = await probe("[data-adv-next]");
    if (!clickable(p)) { advOk = false; check("B", `第 ${i} 次「继续」按钮可点`, false, JSON.stringify(p)); break; }
    await page.locator("[data-adv-next]").click();
    await page.waitForTimeout(180);
    const cur = await page.evaluate(() => ({
      index: window.state.adv?.index,
      total: window.state.adv?.total,
      speaker: document.querySelector(".adv-name")?.textContent || "",
      text: document.querySelector(".adv-text")?.textContent || "",
      progress: document.querySelector(".adv-progress")?.textContent || "",
    }));
    const hitLine = cur.index === i && cur.total === 9 && cur.speaker === LINES[i][0] && cur.text === LINES[i][1];
    if (!hitLine) { advOk = false; check("B", `第 ${i + 1} 句与本轮台词一致`, false, JSON.stringify(cur)); }
  }
  check("B", "8 次真实点击逐句推进到第 9 句", advOk, `台词 ${LINES.length} 句`);

  // ---------- C 末句「各自准备，明天出发」按钮可点 ----------
  const doneP = await probe("[data-tenri-institute-unlock-complete]");
  check("C", "完成按钮存在 / 可见 / 未禁用 / 无遮挡", clickable(doneP), JSON.stringify(doneP));
  check("C", "按钮文案「各自准备，明天出发」", doneP.text === "各自准备，明天出发", doneP.text);
  check("C", "末句提示含「未开发完成」说明", await page.evaluate(() => (document.querySelector(".villa-modal .muted")?.textContent || "").includes("未开发完成")));
  check("C", "此时不再有「继续」按钮（按钮只末句出现）", !(await probe("[data-adv-next]")).exists);
  await page.screenshot({ path: "/data/workspace/研究所解锁事件-完成按钮.png" });

  // ---------- D 真实点击完成按钮 → 解锁并关闭 ----------
  await page.locator("[data-tenri-institute-unlock-complete]").click();
  await page.waitForTimeout(1600);
  const after = await page.evaluate(() => {
    const st = window.state;
    return {
      hallModal: st.hallModal,
      modalVisible: !!document.querySelector(".villa-modal"),
      unlocked: !!st.flags?.tenriInstituteUnlocked,
      seen: !!st.flags?.tenriInstituteUnlockSeen,
      pending: !!st.flags?.tenriInstituteUnlockPending,
      completed: st.unlockEvents?.completed?.tenri_institute === true,
      log: (st.log || []).slice(0, 3).join(" | "),
      view: st.view,
    };
  });
  check("D", "点击后弹窗关闭", after.hallModal === null && !after.modalVisible, `hallModal=${after.hallModal}`);
  check("D", "写入 Unlocked / Seen 并清 Pending", after.unlocked && after.seen && !after.pending);
  check("D", "UnlockEventProgress 登记完成", after.completed);
  check("D", "日志提示剧情已解锁", after.log.includes("剧情已解锁"), after.log.slice(0, 80));
  check("D", "停留在大厅", after.view === "hall", after.view);

  // ---------- E 幂等 + 入口仍锁 ----------
  const idem = await page.evaluate(() => {
    const st = window.state;
    const run = { missionId: "ruins_sand_city", difficultyId: "adventure", complete: true };
    const again = window.triggerTenriInstituteUnlockEvent(st, run);
    const pendingAgain = window.TenriInstituteUnlockEvents.triggerPending(st);
    const m = (window.GameData?.missions || []).find(x => x.id === "tenri_institute");
    return { again, pendingAgain, hallModal: st.hallModal, devLocked: !!m?.devLocked, devHint: m?.devHint || "" };
  });
  check("E", "已解锁后不再重复弹窗", idem.again === false && idem.pendingAgain === false && idem.hallModal === null);
  check("E", "剧情解锁不改入口锁", idem.devLocked && idem.devHint === "未开发完成", `devHint=${idem.devHint}`);

  // ---------- F 老档补触发路径：按钮同样能点 ----------
  await reset({ viaRun: false });
  const legacy = await page.evaluate(() => ({
    hallModal: window.state.hallModal,
    hasDialogue: !!document.querySelector("[data-adv-advance]"),
    title: document.querySelector(".villa-modal h2")?.textContent || "",
  }));
  check("F", "老档 pending 补触发弹窗出现", legacy.hallModal === "tenriInstituteUnlock" && legacy.hasDialogue, legacy.title);
  const boxP = await probe("[data-adv-advance]");
  check("F", "对话框可点（点击推进）", clickable(boxP), JSON.stringify(boxP));
  await page.locator("[data-adv-advance]").click({ position: { x: 40, y: 20 } }).catch(() => {});
  await page.waitForTimeout(220);
  const afterBox = await page.evaluate(() => window.state.adv?.index);
  check("F", "点对话框真的推进到下一句", afterBox === 1, `index=${afterBox}`);
  const prevP = await probe("[data-adv-prev]");
  check("F", "「上一句」按钮可点", clickable(prevP), JSON.stringify(prevP));
  await page.locator("[data-adv-prev]").click();
  await page.waitForTimeout(220);
  check("F", "点「上一句」回到第 1 句", (await page.evaluate(() => window.state.adv?.index)) === 0);
  const skipP = await probe("[data-adv-skip]");
  check("F", "「跳到结尾」按钮可点", clickable(skipP), JSON.stringify(skipP));
  await page.locator("[data-adv-skip]").click();
  await page.waitForTimeout(220);
  check("F", "跳到结尾出现完成按钮", (await probe("[data-tenri-institute-unlock-complete]")).exists);
  const done2 = await probe("[data-tenri-institute-unlock-complete]");
  check("F", "老档路径完成按钮同样可点", clickable(done2), JSON.stringify(done2));
  await page.locator("[data-tenri-institute-unlock-complete]").click();
  await page.waitForTimeout(1500);
  check("F", "老档路径点击后也完成解锁", await page.evaluate(() => !!window.state.flags?.tenriInstituteUnlocked && window.state.hallModal === null));

  // ---------- G 前置不满足不弹 ----------
  await page.evaluate(() => {
    const st = window.state;
    delete st.flags.tenriInstituteUnlocked; delete st.flags.tenriInstituteUnlockSeen; delete st.flags.tenriInstituteUnlockPending;
    st.unlockEvents = window.UnlockEventProgress.fresh();
    const c = (st.chars || []).find(x => x.id === "mieryula"); if (c) c.locked = true;
    st.view = "hall"; st.hallModal = null; st.adv = null;
    window.triggerTenriInstituteUnlockEvent(st, { missionId: "ruins_sand_city", difficultyId: "adventure", complete: true });
    if (window.render) window.render();
  });
  await page.waitForTimeout(350);
  check("G", "米尔尤拉未解锁时不弹窗", await page.evaluate(() => window.state.hallModal === null && !document.querySelector("[data-adv-advance]")));

  // ---------- I 大厅副本入口：devLocked 置灰，点不动也不进副本 ----------
  await page.evaluate(() => {
    const st = window.state;
    st.hallModal = "team"; st.adv = null; st.view = "hall"; st.explore = null; st.battle = null;
    if (window.render) window.render();
  });
  await page.waitForTimeout(350);
  const entry = await page.evaluate(() => {
    const b = document.querySelector('[data-start="tenri_institute"]');
    if (!b) return { exists: false };
    return {
      exists: true, disabled: !!b.disabled, text: (b.textContent || "").trim(),
      hint: (b.closest("div")?.textContent || "").includes("未开发完成"),
    };
  });
  check("I", "大厅入口按钮存在 / 置灰 / 文案与提示「未开发完成」",
    entry.exists && entry.disabled && entry.text.includes("未开发完成") && entry.hint, JSON.stringify(entry));
  const forced = await page.evaluate(async () => {
    const b = document.querySelector('[data-start="tenri_institute"]');
    if (!b) return { ok: false, reason: "无按钮" };
    b.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 400));
    return {
      ok: window.state.view === "hall" && !window.state.explore,
      view: window.state.view, explore: !!window.state.explore,
      log: (window.state.log || []).slice(0, 2).join(" | "),
    };
  });
  check("I", "强制派发点击仍被守卫挡住（不进副本）", forced.ok, JSON.stringify(forced));
  // 直接调真实出征函数（难度判据默认含 normal，必命中 devLocked 分支），
  // 避免拿剧情解锁日志里恰好含「未开发完成」的旧条目当成守卫证据。
  const guard = await page.evaluate(async () => {
    const st = window.state;
    st.log = [];
    await window.startMission("tenri_institute", "normal");
    return { log: (st.log || []).slice(0, 3), view: st.view, explore: !!st.explore };
  });
  check("I", "devLocked 守卫精确提示「未开发完成」且不进副本",
    guard.log[0] === "未开发完成" && guard.view === "hall" && !guard.explore, JSON.stringify(guard));

  // ---------- J 键盘按键：空格 / 回车推进，回车完成 ----------
  await reset({ viaRun: true });
  await page.keyboard.press("Space");
  await page.waitForTimeout(220);
  check("J", "空格推进对话", (await page.evaluate(() => window.state.adv?.index)) === 1);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(220);
  check("J", "回车继续推进对话", (await page.evaluate(() => window.state.adv?.index)) === 2);
  await page.locator("[data-adv-skip]").click();
  await page.waitForTimeout(220);
  await page.locator("[data-tenri-institute-unlock-complete]").focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1600);
  check("J", "回车按下完成按钮也完成解锁并关闭",
    await page.evaluate(() => !!window.state.flags?.tenriInstituteUnlocked && window.state.hallModal === null));

  // ---------- K 右上角关闭 X 也是完成动作 ----------
  await reset({ viaRun: true });
  await page.locator("[data-adv-skip]").click();
  await page.waitForTimeout(220);
  const xP = await probe("[data-close-modal]");
  check("K", "关闭 X 按钮存在且可点", clickable(xP), JSON.stringify(xP));
  if (clickable(xP)) {
    await page.locator("[data-close-modal]").first().click();
    await page.waitForTimeout(1600);
    check("K", "点 X 同样完成解锁并关闭弹窗",
      await page.evaluate(() => !!window.state.flags?.tenriInstituteUnlocked && window.state.hallModal === null));
  }

  check("H", "页面无 JS 错误", errors.length === 0, errors.slice(0, 3).join(" | ") || "无");

  await browser.close();
  const bad = results.filter(r => !r.ok);
  console.log(`\nTOTAL ${results.length - bad.length}/${results.length}`);
  if (bad.length) bad.forEach(r => console.log(`  ❌ [${r.group}] ${r.name} ${r.detail}`));
  process.exit(bad.length || errors.length ? 1 : 0);
})().catch(e => { console.error("LIVE_THREW", e && e.stack ? e.stack : e); process.exit(2); });
