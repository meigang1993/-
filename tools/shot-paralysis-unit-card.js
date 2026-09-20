// 截图 + 录像：麻痹判定时单位卡是否显示"麻"标记并灰化。
// 产物：/data/workspace/shot-paralysis-unit-card.png 与 paralysis-unit-card-demo.webm
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const { startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const VIDEO_DIR = "/data/workspace/vidtmp";
const SHOT = "/data/workspace/shot-paralysis-unit-card.png";
const VIDEO = "/data/workspace/paralysis-unit-card-demo.webm";
const WITH_VIDEO = process.env.SHOT_VIDEO === "1";

// 注入麻痹锁定（模拟判定成功后的状态）
const lockTpl = `(() => {
  const b = window.state.battle;
  const me = b.allies[0];
  me.hand = [{ name: "杀", type: "kill", suit: "♠" },
             { name: "闪", type: "response", suit: "♥" }];
  me.skipPlayPhase = true;
  me.skipPlayReason = "麻痹";
  b.activeUid = me.uid;
  b.phase = 4;
  b.locked = false;
  window.render();
  return me.name;
})()`;

const unlockTpl = `(() => {
  const b = window.state.battle;
  const me = b.allies[0];
  me.skipPlayPhase = false;
  me.skipPlayReason = null;
  b.activeUid = me.uid;
  b.phase = 4;
  b.locked = false;
  window.render();
  return true;
})()`;

const checkTpl = `(() => {
  const b = window.state.battle;
  const me = b.allies[0];
  const el = document.querySelector('.unit[data-target="' + me.uid + '"]');
  const icon = el && el.querySelector(".status-icon.paralysis-locked");
  return {
    unitHasClass: !!(el && el.classList.contains("has-paralysis-locked")),
    iconText: icon ? icon.innerText : null,
    iconTip: icon ? icon.getAttribute("title") : null,
    iconBg: icon ? getComputedStyle(icon).backgroundColor : null,
    mainFilter: el && el.querySelector(".unit-main")
      ? getComputedStyle(el.querySelector(".unit-main")).filter : null,
    unitName: me.name,
  };
})()`;

(async () => {
  fs.rmSync(VIDEO_DIR, { recursive: true, force: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    ...(WITH_VIDEO ? { recordVideo: { dir: VIDEO_DIR, size: { width: 1280, height: 800 } } } : {}),
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  const pass = [], fail = [];
  let st = null, free = null;
  const t = (name, ok, info) => (ok ? pass : fail).push({ name, ...(info || {}) });

  try {
    await startRegressionBattle(page);
    await page.waitForTimeout(800);

    // 1) 正常状态（录像起始帧）
    await page.waitForTimeout(1500);

    // 2) 注入麻痹锁定
    await page.evaluate(lockTpl);
    await page.waitForTimeout(400);
    st = await page.evaluate(checkTpl);
    t("单位卡带 has-paralysis-locked 类", st.unitHasClass, { v: st.unitHasClass });
    t("单位卡显示「麻」标记", st.iconText === "麻", { v: st.iconText });
    t("标记 tooltip 说明原因", /麻痹/.test(String(st.iconTip || "")), { v: st.iconTip });
    t("单位卡整体灰化（grayscale+brightness）",
      /grayscale/.test(String(st.mainFilter || ""))
      && /brightness/.test(String(st.mainFilter || "")), { v: st.mainFilter });

    const unit = page.locator(".unit.has-paralysis-locked").first();
    await unit.screenshot({ path: SHOT }).catch(() => {});
    await page.waitForTimeout(1800); // 录像停留，便于看清

    // 3) 对照：解除麻痹后标记消失
    await page.evaluate(unlockTpl);
    await page.waitForTimeout(600);
    free = await page.evaluate(checkTpl);
    t("对照：解除后无 has-paralysis-locked", !free.unitHasClass, { v: free.unitHasClass });
    t("对照：解除后无「麻」标记", !free.iconText, { v: free.iconText });
    t("对照：解除后无灰化", !/grayscale/.test(String(free.mainFilter || "")),
      { v: free.mainFilter });
    await page.waitForTimeout(1200);

    // 保存录像
    // 录像不调用 saveAs（该环境 ffmpeg finalize 会卡住），改为从 VIDEO_DIR 直接取
  } catch (e) {
    fail.push({ name: "脚本异常", err: String(e && e.message || e) });
  } finally {
    await context.close();
    await browser.close();
  }

  console.log("单位卡=" + JSON.stringify(st || {}));
  console.log("对照  =" + JSON.stringify(free || {}));
  console.log("页面错误 " + errors.length + (errors.length ? " :: " + errors[0] : ""));
  pass.forEach(p => console.log("✅ " + p.name + (p.v !== undefined ? "  " + JSON.stringify(p.v) : "")));
  fail.forEach(p => console.log("❌ " + p.name + "  " + JSON.stringify(p)));
  console.log("汇总：" + pass.length + " 通过 / " + fail.length + " 失败");
  console.log("截图=" + (fs.existsSync(SHOT) ? "OK" : "缺失")
    + "  录像=" + (fs.existsSync(VIDEO) ? "OK" : "缺失"));
  process.exit(fail.length ? 1 : 0);
})();
