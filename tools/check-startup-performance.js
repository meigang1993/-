const fs = require("fs");
const path = require("path");
require("./repository-toolchain");
const { chromium } = require("@playwright/test");
const budget = require("./performance-budget.json");
const { startupBundlePaths } = require("./publish-bundle-groups");

const root = path.resolve(__dirname, "..");
const publish = path.join(root, "publish");
const output = path.join(root, ".qa-artifacts", "performance", "startup.json");

function stylesheetBytes(hrefs) {
  return hrefs.reduce((total, href) => {
    const file = path.basename(href);
    const target = path.join(publish, file);
    return total + (fs.existsSync(target) ? fs.statSync(target).size : 0);
  }, 0);
}

function assertBudget(name, value) {
  if (!Number.isFinite(value) || value > budget[name]) {
    throw new Error(`${name} exceeded: ${Math.round(value)} > ${budget[name]}`);
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  const resourceRequests = new Set();
  page.on("console", message => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => {
    if (request.resourceType() !== "document") resourceRequests.add(request.url());
  });
  await page.context().setOffline(true);
  await page.addInitScript(() => {
    let seed = 2971485;
    Math.random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  });
  const started = Date.now();
  await page.goto(`file://${path.join(publish, "index.html")}`);
  await page.locator("[data-start-game]").waitFor({ state: "visible" });
  const startupReadyMs = Date.now() - started;
  const session = await page.context().newCDPSession(page);
  await session.send("Performance.enable");
  const cdp = await session.send("Performance.getMetrics");
  const cdpMetrics = Object.fromEntries(cdp.metrics.map(item => [item.name, item.value]));
  const browserMetrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const paints = Object.fromEntries(performance.getEntriesByType("paint")
      .map(entry => [entry.name, entry.startTime]));
    return {
      domContentLoadedMs: nav?.domContentLoadedEventEnd || 0,
      loadEventMs: nav?.loadEventEnd || 0,
      firstContentfulPaintMs: paints["first-contentful-paint"] || nav?.loadEventEnd || 0,
      resourceTimingCount: performance.getEntriesByType("resource").length,
      scripts: document.scripts.length,
      stylesheetCount: document.querySelectorAll('link[rel="stylesheet"]').length,
      stylesheetHrefs: [...document.querySelectorAll('link[rel="stylesheet"]')]
        .map(link => link.getAttribute("href")),
    };
  });
  const metrics = {
    measuredAt: new Date().toISOString(),
    startupReadyMs,
    ...browserMetrics,
    resourceCount: resourceRequests.size,
    jsHeapUsedBytes: cdpMetrics.JSHeapUsedSize || 0,
    domNodes: cdpMetrics.Nodes || 0,
    startupBundleBytes: startupBundlePaths.reduce(
      (total, relative) => total + fs.statSync(path.join(publish, relative)).size,
      0
    ),
    startupBundleCount: startupBundlePaths.length,
    stylesheetBytes: stylesheetBytes(browserMetrics.stylesheetHrefs),
  };
  await browser.close();
  if (errors.length) throw new Error(`startup emitted errors: ${errors.join(" | ")}`);
  Object.keys(budget).forEach(name => assertBudget(name, metrics[name]));
  if (metrics.scripts !== startupBundlePaths.length) {
    throw new Error(
      `startup loaded ${metrics.scripts} scripts; expected ${startupBundlePaths.length}`
    );
  }
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify({ budget, metrics }, null, 2)}\n`);
  console.log(
    `Startup performance passed: ready ${metrics.startupReadyMs}ms, ` +
    `FCP ${Math.round(metrics.firstContentfulPaintMs)}ms, heap ${(metrics.jsHeapUsedBytes / 1048576).toFixed(1)} MiB`
  );
})().catch(error => {
  console.error(error.message);
  process.exit(1);
});
