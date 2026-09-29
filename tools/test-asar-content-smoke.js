// app.asar 内容冒烟：解包后以 file:// 打开，验证游戏能启动且版本号为 55。
// 目的：Electron 加载的就是 asar 内的 index.html（file:// 协议），
// 用真实浏览器跑一遍可排除打包遗漏/路径错误。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return !!cond;
};

// 默认校验 publish（仓库内），传参可校验 asar 解包目录（打包后回归）
const DIR = process.argv[2]
  || path.resolve(__dirname, "..", "publish");

(async () => {
  const entry = path.join(DIR, "index.html");
  T("目标目录含 index.html", fs.existsSync(entry), { dir: DIR });
  T("目标目录含 bundles", fs.existsSync(path.join(DIR, "bundles")));
  T("目标目录含 assets", fs.existsSync(path.join(DIR, "assets")));

  // Electron 入口三项：仅 asar 解包目录才有（publish 下没有，故按有无 package.json 判断）
  const isAsarRoot = fs.existsSync(path.join(DIR, "package.json"));
  if (isAsarRoot) {
    T("含 package.json", true);
    T("含 main.js", fs.existsSync(path.join(DIR, "main.js")));
    T("含 preload.js", fs.existsSync(path.join(DIR, "preload.js")));
    const pkg = JSON.parse(fs.readFileSync(path.join(DIR, "package.json"), "utf8"));
    T("package.json 的 main 指向存在的入口",
      !!pkg.main && fs.existsSync(path.join(DIR, pkg.main)), { main: pkg.main });
  } else {
    console.log("ℹ️  非 asar 根目录（无 package.json），跳过 Electron 入口三项检查");
  }

  const html = fs.readFileSync(entry, "utf8");
  T("index.html 版本为 55", /v26\.0915\.55/.test(html));
  T("index.html 无 54 残留", !/20260915-54/.test(html));

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });

  await page.context().setOffline(true);
  await page.addInitScript(() => {
    let v = 2971485;
    Math.random = () => { v = (v * 1664525 + 1013904223) >>> 0; return v / 4294967296; };
    try {
      Object.defineProperty(navigator, "onLine", { get: () => false, configurable: true });
    } catch (e) { /* ignore */ }
  });

  await page.goto(`file://${entry}`);
  await page.locator("#view").waitFor({ state: "visible", timeout: 30000 });

  T("file:// 下游戏界面渲染成功", await page.locator("#view").isVisible());
  T("存在开始游戏入口", await page.locator("[data-start-game]").count() > 0,
    { count: await page.locator("[data-start-game]").count() });

  await page.locator("[data-start-game]").click();
  await page.waitForTimeout(1200);
  const hallOk = await page.locator("[data-open-butler]").count() > 0
    || await page.locator("#hall").count() > 0;
  T("可进入大厅", hallOk);

  const ver = await page.evaluate(() => {
    const el = document.querySelector("[data-version], .version-badge, #version");
    return el ? el.textContent.trim() : (document.body.textContent.match(/v26\.\d+\.\d+/) || [""])[0];
  });
  T("页面显示版本 55", /55/.test(ver), { ver });

  const imgBroken = await page.evaluate(() => {
    const imgs = [...document.images].filter(i => i.complete && i.naturalWidth === 0);
    return imgs.length;
  });
  T("无破损图片", imgBroken === 0, { imgBroken });
  T("无页面错误", errors.length === 0, { errors: errors.slice(0, 5) });

  await browser.close();
  console.log(`\n结果: ${pass}/${total}`);
  process.exit(pass === total ? 0 : 1);
})().catch(e => { console.error("脚本异常:", e); process.exit(2); });
