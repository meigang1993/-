require("./repository-toolchain");
const { chromium } = require("@playwright/test");
const { startRegressionBattle, collectErrors, relevantErrors } = require("../tests/helpers/preview-game");
const { skinScenarios, measureSkinIdle } = require("./frame-performance-skins");
const budget = require("./frame-budget.json");
const { writeReport } = require("./optimization-utils");

function assertBudget(metrics) {
  Object.entries(budget).forEach(([key, limit]) => {
    if (!Number.isFinite(metrics[key]) || metrics[key] > limit) {
      throw new Error(`${key} exceeded: ${metrics[key]} > ${limit}`);
    }
  });
}
async function measureDefault(page) {
  await startRegressionBattle(page);
  return page.evaluate(async () => {
    async function sample(duration, trigger) {
      const frameTimes = [];
      const probe = document.createElement("i");
      probe.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:.01;pointer-events:none";
      document.body.appendChild(probe);
      const probeAnimation = probe.animate(
        [{ transform: "translateX(0)" }, { transform: "translateX(1px)" }],
        { duration: 1000, iterations: Infinity, direction: "alternate" },
      );
      const started = performance.now();
      let prior = started;
      trigger?.();
      await new Promise(resolve => {
        function frame(now) {
          frameTimes.push(now - prior);
          prior = now;
          if (now - started >= duration) resolve();
          else requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
      });
      probeAnimation.cancel();
      probe.remove();
      const sorted = frameTimes.slice(1).sort((a, b) => a - b);
      const percentile = ratio => sorted[Math.min(
        sorted.length - 1, Math.floor(sorted.length * ratio),
      )] || 0;
      return {
        frames: sorted.length,
        average: sorted.reduce((sum, value) => sum + value, 0) / Math.max(1, sorted.length),
        p95: percentile(0.95),
        max: sorted[sorted.length - 1] || 0,
        intervals: sorted,
      };
    }
    const ready = Promise.all([
      document.fonts?.ready?.catch(() => {}),
      ...[...document.images].map(image => (
        typeof image.decode === "function" ? image.decode().catch(() => {}) : Promise.resolve()
      )),
    ]);
    await Promise.race([ready, new Promise(resolve => setTimeout(resolve, 5000))]);
    await sample(2200);
    const longTasks = [];
    const observer = typeof PerformanceObserver === "function"
      ? new PerformanceObserver(list => list.getEntries().forEach(entry => longTasks.push(entry.duration)))
      : null;
    try { observer?.observe({ entryTypes: ["longtask"] }); } catch (_) {}
    const baseline = await sample(1400);
    const target = window.state.battle.enemies[0];
    const stress = await sample(1800, () => {
      for (let index = 0; index < 12; index += 1) {
        setTimeout(() => {
          const effect = {
            id: `frame-${index}`, uid: target.uid, kind: "damage", value: index + 1,
            hitFxId: 12000 + index, damageTypes: [index % 2 ? "fire" : "physical"],
          };
          window.state.battle.floats ||= [];
          window.state.battle.floats.push(effect);
          window.BattleFX.popFloats(window.state, effect.id, true);
        }, index * 85);
      }
    });
    observer?.disconnect();
    const severeThreshold = Math.max(100, baseline.p95 * 1.5);
    const severeFrames = stress.intervals.filter(value => value > severeThreshold).length;
    return {
      baselineFrames: baseline.frames,
      baselineAverageFrameMs: baseline.average,
      baselineP95FrameMs: baseline.p95,
      stressFrames: stress.frames,
      stressAverageFrameMs: stress.average,
      stressP95FrameMs: stress.p95,
      slowdownRatio: stress.average / Math.max(1, baseline.average),
      severeFrameThresholdMs: severeThreshold,
      severeFrames,
      severeFrameRatio: severeFrames / Math.max(1, stress.frames),
      maxFrameMs: stress.max,
      longTaskCount: longTasks.length,
      longTaskTotalMs: longTasks.reduce((sum, value) => sum + value, 0),
    };
  });
}
async function inPage(browser, errors, action) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const pageErrors = collectErrors(page);
  try { await page.bringToFront(); return await action(page); }
  finally { errors.push(...relevantErrors(pageErrors)); await page.close(); }
}
async function launchBrowser(throughput = false) {
  const timingArgs = throughput
    ? ["--disable-frame-rate-limit", "--disable-gpu-vsync"] : [];
  return chromium.launch({
    headless: true,
    args: [
      ...timingArgs,
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
    ],
  });
}
(async () => {
  const errors = [];
  const defaultRuns = [];
  const browser = await launchBrowser(true);
  try {
    for (let run = 0; run < 3; run += 1) {
      defaultRuns.push(await inPage(browser, errors, measureDefault));
    }
  } finally {
    await browser.close();
  }
  const rankedRuns = [...defaultRuns]
    .sort((left, right) => left.stressAverageFrameMs - right.stressAverageFrameMs);
  const metrics = { ...rankedRuns[1], defaultRuns };
  const taskRuns = [];
  const taskBrowser = await launchBrowser();
  try {
    for (let run = 0; run < 3; run += 1) {
      taskRuns.push(await inPage(taskBrowser, errors, measureDefault));
    }
  } finally {
    await taskBrowser.close();
  }
  const rankedTaskRuns = [...taskRuns]
    .sort((left, right) => left.longTaskTotalMs - right.longTaskTotalMs);
  metrics.longTaskCount = rankedTaskRuns[1].longTaskCount;
  metrics.longTaskTotalMs = rankedTaskRuns[1].longTaskTotalMs;
  metrics.taskRuns = taskRuns;
  const skinIdleResults = {};
  const skinIdleRuns = {};
  const skinBrowser = await launchBrowser(true);
  try {
    for (const scenario of skinScenarios) {
      const runs = [];
      for (let run = 0; run < 3; run += 1) {
        runs.push(await inPage(
          skinBrowser, errors, page => measureSkinIdle(page, scenario),
        ));
      }
      skinIdleRuns[scenario.name] = runs;
      skinIdleResults[scenario.name] = [...runs]
        .sort((left, right) => left.average - right.average)[1];
    }
  } finally {
    await skinBrowser.close();
  }
  metrics.skinIdleRuns = skinIdleRuns;
  metrics.skinIdleResults = skinIdleResults;
  const skinResults = Object.values(skinIdleResults);
  metrics.skinIdleAverageFrameMs = Math.max(...skinResults.map(result => result.average));
  metrics.skinIdleP95FrameMs = Math.max(...skinResults.map(result => result.p95));
  if (errors.length) throw new Error(`frame test emitted errors: ${errors.join(" | ")}`);
  writeReport("frames", { generatedAt: new Date().toISOString(), budget, metrics });
  assertBudget(metrics);
  const skinSummary = Object.entries(metrics.skinIdleResults)
    .map(([name, result]) => `${name} ${result.average.toFixed(1)}ms`)
    .join(", ");
  console.log(
    `Frame performance passed: baseline ${metrics.baselineAverageFrameMs.toFixed(1)}ms, ` +
    `stress ${metrics.stressAverageFrameMs.toFixed(1)}ms, skins ${skinSummary}`
  );
})().catch(error => {
  console.error(error.message);
  process.exit(1);
});
