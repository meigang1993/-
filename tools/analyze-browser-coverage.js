const fs = require("fs");
const path = require("path");
require("./repository-toolchain");
const { chromium } = require("@playwright/test");
const { startDungeon, relevantErrors, collectErrors } = require("../tests/helpers/dungeon-flow");
const { root, writeReport, formatBytes } = require("./optimization-utils");
const { startupBundlePaths } = require("./publish-bundle-groups");
const battleBundleFiles = [
  "battle-rules.min.js",
  "battle-skills.min.js",
  "battle-flow.min.js",
  "battle-ai.min.js",
  "battle-presentation.min.js",
  "battle-ui.min.js",
];

function mergeRanges(ranges) {
  const sorted = ranges.filter(range => range.end > range.start).sort((a, b) => a.start - b.start);
  const merged = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (!last || range.start > last.end) merged.push({ ...range });
    else last.end = Math.max(last.end, range.end);
  }
  return merged;
}

function summarize(entries, kind) {
  return entries.filter(entry => entry.url.startsWith("file:")).map(entry => {
    const localFile = decodeURIComponent(new URL(entry.url).pathname);
    const source = typeof entry.text === "string" ? entry.text : fs.readFileSync(localFile, "utf8");
    const ranges = kind === "js"
      ? entry.functions.flatMap(fn => fn.ranges.filter(range => range.count > 0)
        .map(range => ({ start: range.startOffset, end: range.endOffset })))
      : entry.ranges.map(range => ({ start: range.start, end: range.end }));
    const merged = mergeRanges(ranges);
    const total = Buffer.byteLength(source);
    const used = merged.reduce((sum, range) => sum + Buffer.byteLength(source.slice(range.start, range.end)), 0);
    return {
      file: path.relative(root, localFile).replace(/\\/g, "/"),
      total,
      used,
      unused: Math.max(0, total - used),
      usedPct: total ? Number((used / total * 100).toFixed(2)) : 100,
    };
  }).sort((a, b) => b.unused - a.unused);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = collectErrors(page);
  await Promise.all([
    page.coverage.startJSCoverage({ resetOnNavigation: false, reportAnonymousScripts: false }),
    page.coverage.startCSSCoverage({ resetOnNavigation: false }),
  ]);
  await startDungeon(page);
  await page.evaluate(async () => {
    window.state.explore = null;
    window.state.view = "hall";
    window.state.hallModal = null;
    window.render();
    const enemy = { ...window.GameData.enemies.machine_factory[0], speed: -1000 };
    await window.BattleSystem.start(window.state, "machine_factory", window.render, {
      test: true,
      allyIds: ["lokar", "besta_doll"],
      enemies: [enemy],
    });
    window.render();
    const target = window.state.battle.enemies[0];
    for (let index = 0; index < 4; index += 1) {
      const hitFxId = 9000 + index;
      const effect = {
        id: `coverage-${index}`,
        uid: target.uid,
        kind: "damage",
        value: 2,
        hitFxId,
        damageTypes: ["physical"],
      };
      window.state.battle.floats ||= [];
      window.state.battle.floats.push(effect);
      window.BattleFX.popFloats(window.state, effect.id, true);
    }
  });
  await page.waitForTimeout(1400);
  const [jsEntries, cssEntries] = await Promise.all([
    page.coverage.stopJSCoverage(),
    page.coverage.stopCSSCoverage(),
  ]);
  await browser.close();
  const filteredErrors = relevantErrors(errors);
  if (filteredErrors.length) throw new Error(`coverage flow emitted errors: ${filteredErrors.join(" | ")}`);
  const javascript = summarize(jsEntries, "js");
  const css = summarize(cssEntries, "css");
  const totals = [...javascript, ...css].reduce((sum, item) => ({
    total: sum.total + item.total,
    used: sum.used + item.used,
    unused: sum.unused + item.unused,
  }), { total: 0, used: 0, unused: 0 });
  const missingStartup = startupBundlePaths.filter(relative =>
    !javascript.some(item => item.file.endsWith(path.basename(relative))));
  if (missingStartup.length
    || battleBundleFiles.some(file => !javascript.some(item => item.file.endsWith(file)))
    || !javascript.some(item => item.file.endsWith("dungeon.min.js"))) {
    throw new Error(
      `browser coverage did not capture all runtime bundles; missing startup: ${missingStartup.join(", ") || "none"}`
    );
  }
  writeReport("browser-coverage", {
    generatedAt: new Date().toISOString(),
    totals,
    javascript,
    css,
  });
  console.log(
    `Browser coverage passed: ${formatBytes(totals.used)} used of ${formatBytes(totals.total)}; ` +
    `${formatBytes(totals.unused)} unused in the representative flow`
  );
})().catch(error => {
  console.error(error.message);
  process.exit(1);
});
