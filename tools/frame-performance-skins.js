const { expect } = require("@playwright/test");
const { openGame, startFreshGame } = require("../tests/helpers/preview-game");

const skinScenarios = [
  { name: "bertis", allyId: "bertis", skinId: "bertis_arrogant_queen" },
  { name: "flora", allyId: "flora", skinId: "flora_sonic_assassin" },
  { name: "manny", allyId: "manny", skinId: "manny_gun_succubus" },
  { name: "nonoka", allyId: "nonoka", skinId: "nonoka_idol_rising_star" },
  { name: "wendy", allyId: "wendy", skinId: "wendy_benevolent_teacher" },
];

async function measureSkinIdle(page, scenario) {
  await openGame(page);
  await startFreshGame(page);
  await page.evaluate(({ allyId, skinId }) => {
    window.GameAssets.preloadBattle = async () => {};
    window.state.settings.battleSpeed = 2;
    window.BattleFX.playBattleStart = callback => callback?.();
    window.BattleLines.intro = () => 0;
    window.state.testAllies = [allyId];
    window.state.testEnemies = [0];
    window.SkinSystem.testEquip(window.state, allyId, skinId);
    window.state.hallModal = "testBattle";
    window.render();
  }, scenario);
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
    battle.allies.concat(battle.enemies)
      .forEach(unit => unit.hand.forEach(card => { delete card._pendingDraw; }));
    window.render();
    window.BattleEffects.recover(window.state);
  });
  return page.evaluate(async () => {
    await Promise.race([
      Promise.all([...document.images].map(image => (
        typeof image.decode === "function" ? image.decode().catch(() => {}) : Promise.resolve()
      ))),
      new Promise(resolve => setTimeout(resolve, 5000)),
    ]);
    await new Promise(resolve => {
      const started = performance.now();
      function warm(now) {
        if (now - started >= 2200) resolve();
        else requestAnimationFrame(warm);
      }
      requestAnimationFrame(warm);
    });
    const intervals = [];
    const probe = document.createElement("i");
    probe.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:.01;pointer-events:none";
    document.body.appendChild(probe);
    const probeAnimation = probe.animate(
      [{ transform: "translateX(0)" }, { transform: "translateX(1px)" }],
      { duration: 1000, iterations: Infinity, direction: "alternate" },
    );
    let prior = performance.now();
    await new Promise(resolve => {
      const started = prior;
      function frame(now) {
        intervals.push(now - prior);
        prior = now;
        if (now - started >= 5200) resolve();
        else requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
    probeAnimation.cancel();
    probe.remove();
    const sorted = intervals.slice(1).sort((a, b) => a - b);
    return {
      frames: sorted.length,
      average: sorted.reduce((sum, value) => sum + value, 0) / Math.max(1, sorted.length),
      p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] || 0,
      max: sorted[sorted.length - 1] || 0,
    };
  });
}

module.exports = { skinScenarios, measureSkinIdle };
