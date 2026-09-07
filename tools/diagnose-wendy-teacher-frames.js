require("./repository-toolchain");
const { chromium, expect } = require("@playwright/test");
const { openGame, startFreshGame, collectErrors, relevantErrors } =
  require("../tests/helpers/preview-game");
const { writeReport } = require("./optimization-utils");
const RUNS = 3;

const teacherVariants = [
  { name: "teacher-full", css: "" },
  {
    name: "teacher-no-halo-animation",
    css: ".skin-effect-wendy-teacher::before { animation: none !important; }",
  },
  {
    name: "teacher-no-persistent-animation",
    css: [
      ".skin-effect-wendy-teacher::before,",
      ".skin-effect-wendy-teacher::after,",
      ".unit-art.skin-effect-wendy-teacher > img",
      "{ animation: none !important; }",
    ].join(" "),
  },
  {
    name: "teacher-no-persistent-shadows",
    css: [
      ".skin-effect-wendy-teacher::before { box-shadow: none !important; }",
      ".skin-effect-wendy-teacher::after { text-shadow: none !important; }",
    ].join(" "),
  },
  {
    name: "teacher-composited-persistent",
    css: [
      ".skin-effect-wendy-teacher::before,",
      ".skin-effect-wendy-teacher::after",
      "{ will-change: transform, opacity; backface-visibility: hidden; }",
    ].join(" "),
  },
];

async function prepare(page, skinId) {
  await openGame(page);
  await startFreshGame(page);
  await page.evaluate(selectedSkin => {
    window.GameAssets.preloadBattle = async () => {};
    window.state.settings.battleSpeed = 2;
    window.BattleFX.playBattleStart = callback => callback?.();
    window.BattleLines.intro = () => 0;
    window.state.testAllies = ["wendy"];
    window.state.testEnemies = [0];
    window.SkinSystem.testEquip(window.state, "wendy", selectedSkin);
    window.state.hallModal = "testBattle";
    window.render();
  }, skinId);
  await page.locator("[data-start-test-battle]").click();
  await page.locator(".battle-screen").waitFor({ state: "visible" });
  await expect.poll(() => page.evaluate(() =>
    !window.BattleEffects.animating
      && !window.BattleEffects.draining
      && !window.state?.battle?.animQueue?.length
  )).toBe(true);
  await page.evaluate(() => {
    const battle = window.state.battle;
    window.state.settings.battleSpeed = 1;
    battle.animQueue = [];
    battle.floats = [];
    battle.skillCaption = null;
    battle.relicCaption = null;
    battle.locked = false;
    battle.phase = 4;
    battle.allies.concat(battle.enemies).forEach(unit =>
      unit.hand.forEach(card => { delete card._pendingDraw; }));
    window.render();
    window.BattleEffects.recover(window.state);
    window.WendyTeacherSkinFX?.cancel?.();
  });
  await page.evaluate(async () => {
    await Promise.race([
      Promise.all([...document.images].map(image =>
        typeof image.decode === "function" ? image.decode().catch(() => {}) : Promise.resolve())),
      new Promise(resolve => setTimeout(resolve, 5000)),
    ]);
  });
  await page.waitForTimeout(700);
}

async function sample(page, css = "") {
  await page.evaluate(content => {
    let style = document.querySelector("#wendy-frame-diagnostic");
    if (!style) {
      style = document.createElement("style");
      style.id = "wendy-frame-diagnostic";
      document.head.append(style);
    }
    style.textContent = content;
  }, css);
  await page.waitForTimeout(500);
  return page.evaluate(async () => {
    const intervals = [];
    let prior = performance.now();
    await new Promise(resolve => {
      const started = prior;
      function frame(now) {
        intervals.push(now - prior);
        prior = now;
        if (now - started >= 1600) resolve();
        else requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
    const sorted = intervals.slice(1).sort((a, b) => a - b);
    const percentile = ratio => sorted[
      Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))
    ] || 0;
    return {
      frames: sorted.length,
      average: sorted.reduce((sum, value) => sum + value, 0) / Math.max(1, sorted.length),
      p95: percentile(.95),
      max: sorted[sorted.length - 1] || 0,
    };
  });
}

async function inPage(browser, skinId, errors, action) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const pageErrors = collectErrors(page);
  try {
    await prepare(page, skinId);
    return await action(page);
  } finally {
    errors.push(...relevantErrors(pageErrors));
    await page.close();
  }
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
    ],
  });
  const errors = [];
  const results = { default: [] };
  teacherVariants.forEach(variant => { results[variant.name] = []; });
  try {
    for (let run = 0; run < RUNS; run += 1) {
      results.default.push(await inPage(
        browser, "wendy_default", errors, page => sample(page),
      ));
      await inPage(browser, "wendy_benevolent_teacher", errors, async page => {
        const ordered = run % 2 ? [...teacherVariants].reverse() : teacherVariants;
        for (const variant of ordered) {
          results[variant.name].push(await sample(page, variant.css));
        }
      });
    }
  } finally {
    await browser.close();
  }
  const report = { generatedAt: new Date().toISOString(), results, errors };
  writeReport("wendy-teacher-diagnostic", report);
  Object.entries(results).forEach(([name, runs]) => {
    const median = [...runs].sort((left, right) => left.average - right.average)[
      Math.floor(runs.length / 2)
    ] || runs[0];
    console.log(`${name}: ${median.average.toFixed(1)}ms avg, ${median.p95.toFixed(1)}ms p95`);
  });
  if (errors.length) throw new Error(`diagnostic emitted errors: ${errors.join(" | ")}`);
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
