const { test, expect } = require("@playwright/test");
const {
  collectErrors, relevantErrors, openGame, startFreshGame,
} = require("./helpers/preview-game");

test("Flora Sonic Assassin renders combat and victory effects", async ({ page }) => {
  test.setTimeout(45000);
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  await page.evaluate(() => {
    window.GameAssets.preloadBattle = async () => {};
    window.__floraOriginalWhenIdle = window.BattleEffects.whenIdle;
    window.BattleEffects.whenIdle = async () => {};
    window.BattleFX.playBattleStart = callback => callback?.();
    window.state.testAllies = ["flora", "lokar"];
    window.state.testEnemies = [0];
    window.SkinSystem.testEquip(window.state, "flora", "flora_sonic_assassin");
    window.state.hallModal = "testBattle";
    window.render();
  });
  await page.locator("[data-start-test-battle]").click();
  await expect(page.locator(".battle-screen")).toBeVisible();
  await page.evaluate(async () => {
    await window.BattleActionGuard.whenIdle();
    window.BattleEffects.cancel(window.state);
    window.BattleEffects.whenIdle = window.__floraOriginalWhenIdle;
    delete window.__floraOriginalWhenIdle;
  });
  await expect(page.locator(".ally-unit .skin-effect-flora-sonic")).toHaveCount(1);
  expect(await page.locator(".ally-unit .skin-effect-flora-sonic > img")
    .evaluate(image => getComputedStyle(image).animationName)).toBe("none");
  expect(await page.evaluate(() => window.state.battle.allies
    .find(unit => unit.ref === "flora")?._floraSonicEntryShown)).toBe(true);

  await page.evaluate(() => {
    const actor = window.state.battle.allies.find(unit => unit.ref === "flora");
    const source = window.state.battle.allies.find(unit => unit.ref === "lokar");
    const target = window.state.battle.enemies[0];
    window.state.battle.activeUid = actor.uid;
    window.render();
    window.FloraSonicSkinFX.idleShift(window.state, actor);
    window.FloraSonicSkinFX.assault(window.state, actor, target);
    window.FloraSonicSkinFX.assaultDefeat(window.state, actor);
    window.FloraSonicSkinFX.wing(window.state, actor, target);
    window.FloraSonicSkinFX.flyingBlade(window.state, actor, target);
    window.FloraSonicSkinFX.flyingBlade(window.state, actor, source);
  });
  const counts = await page.evaluate(() => Object.fromEntries([
    ".flora-sonic-idle-shift", ".flora-sonic-assault-launch",
    ".flora-sonic-assault-line", ".flora-sonic-assault-hit",
    ".flora-sonic-assault-return", ".flora-sonic-wing-shield",
    ".flora-sonic-wing-shards", ".flora-sonic-blade-dash",
    ".flora-sonic-blade-x",
  ].map(selector => [selector, document.querySelectorAll(selector).length])));
  expect(counts).toEqual({
    ".flora-sonic-idle-shift": 1,
    ".flora-sonic-assault-launch": 2,
    ".flora-sonic-assault-line": 1,
    ".flora-sonic-assault-hit": 1,
    ".flora-sonic-assault-return": 2,
    ".flora-sonic-wing-shield": 1,
    ".flora-sonic-wing-shards": 1,
    ".flora-sonic-blade-dash": 2,
    ".flora-sonic-blade-x": 2,
  });

  await page.evaluate(() => window.BattleActionGuard.whenIdle());
  const endWindow = await page.evaluate(() => {
    const battle = window.state.battle;
    const flora = battle.allies.find(unit => unit.ref === "flora");
    const target = battle.enemies[0];
    window.BattleEffects.cancel(window.state);
    battle.activeUid = flora.uid;
    battle.phase = 5;
    battle.locked = false;
    flora.usedSpeedAssault = true;
    flora.usedSpeedAssaultPrepare = true;
    flora.usedSpeedAssaultEnd = false;
    flora.faceDown = false;
    flora.statuses = (flora.statuses || []).filter(status => status !== "翻面");
    target.maxHp = target.hp = target.visualHp = 100;
    target.block = target.armor = target.defense = 0;
    target.hand = [{ name: "测试弃牌", type: "tactic", suit: "♣" }];
    target.pileStats.discard.length = 0;
    target.discard = target.pileStats.discard;
    delete battle.endPhaseStep;
    delete battle.endPhaseUnitUid;
    const endPhase = window.BattleEndPhase({
      allUnits: current => current.allies.concat(current.enemies),
      combat: window.BattleSystem,
      draw: window.BattleSystem.draw,
    });
    window.__floraEndPhaseTest = endPhase;
    const waiting = endPhase.run(window.state, flora) === false;
    window.render();
    return {
      waiting,
      phase: battle.phase,
      awaitingUid: battle.awaitingSpeedAssaultUid,
      floraUid: flora.uid,
      targetUid: target.uid,
      targetHp: target.hp,
      targetHand: target.hand.length,
      turn: battle.turn,
      animating: window.BattleEffects.animating,
      draining: window.BattleEffects.draining,
    };
  });
  expect(endWindow).toEqual({
    waiting: true,
    phase: 6,
    awaitingUid: endWindow.floraUid,
    floraUid: endWindow.floraUid,
    targetUid: endWindow.targetUid,
    targetHp: 100,
    targetHand: 1,
    turn: endWindow.turn,
    animating: false,
    draining: false,
  });
  await expect(page.locator(".hand-panel")).toContainText(
    "结束阶段：点击敌方角色可发动神速之袭"
  );
  await page.evaluate(() => window.BattleEffects.whenIdle());
  await page.locator(`[data-target="${endWindow.targetUid}"]`).click();
  await expect.poll(() => page.evaluate(() => window.state.battle.allies
    .find(unit => unit.ref === "flora")?.usedSpeedAssaultEnd)).toBe(true);
  await page.evaluate(() => window.BattleActionGuard.whenIdle());
  const resolved = await page.evaluate(() => {
    const battle = window.state.battle;
    const flora = battle.allies.find(unit => unit.ref === "flora");
    const target = battle.enemies[0];
    delete window.__floraEndPhaseTest;
    return {
      used: flora.usedSpeedAssault,
      usedPrepare: flora.usedSpeedAssaultPrepare,
      usedEnd: flora.usedSpeedAssaultEnd,
      faceDown: flora.faceDown,
      faceDownStatus: flora.statuses.includes("翻面"),
      targetHp: target.hp,
      targetDiscard: target.pileStats.discard.length,
      discardedTestCard: target.pileStats.discard.some(card => card.name === "测试弃牌"),
      awaitingUid: battle.awaitingSpeedAssaultUid || null,
      endPhaseStep: battle.endPhaseStep ?? null,
      turn: battle.turn,
    };
  });
  expect(resolved.used).toBe(true);
  expect(resolved.usedPrepare).toBe(true);
  expect(resolved.usedEnd).toBe(true);
  expect(resolved.faceDown).toBe(true);
  expect(resolved.faceDownStatus).toBe(true);
  expect(resolved.targetHp).toBeLessThan(endWindow.targetHp);
  expect(resolved.targetDiscard).toBeGreaterThanOrEqual(1);
  expect(resolved.discardedTestCard).toBe(true);
  expect(resolved).toMatchObject({
    awaitingUid: null,
    endPhaseStep: null,
  });
  expect(resolved.turn).toBeGreaterThan(endWindow.turn);

  await page.evaluate(() => {
    const battle = window.state.battle;
    const flora = battle.allies.find(unit => unit.ref === "flora");
    flora.faceDown = false;
    flora.statuses = flora.statuses.filter(status => status !== "翻面");
    battle.victoryScreen = true;
    battle.locked = true;
    window.render();
  });
  await expect(page.locator(".victory-screen.flora-sonic-victory")).toBeVisible();
  const victoryArt = page.locator(".flora-sonic-victory-art img");
  await expect(victoryArt).toBeVisible();
  await expect(victoryArt).toHaveAttribute("src", /flora-sonic-assassin-victory\.7ab2b6cd\.webp/);
  await expect(page.locator(".flora-sonic-victory-echoes i")).toHaveCount(4);
  const memberEffectPosition = await page.locator(".member-row .skin-effect-flora-sonic")
    .evaluate(element => getComputedStyle(element).position);
  expect(memberEffectPosition).not.toBe("static");
  await page.waitForTimeout(1600);
  const overlap = await page.evaluate(() => {
    const echoes = [...document.querySelectorAll(".flora-sonic-victory-echoes i")]
      .map(element => element.getBoundingClientRect());
    const stats = document.querySelector(".victory-stats").getBoundingClientRect();
    return {
      echoesRight: Math.max(...echoes.map(rect => rect.right)),
      statsLeft: stats.left,
      statsVisible: stats.width > 0 && stats.height > 0,
    };
  });
  expect(overlap.statsVisible).toBe(true);
  expect(overlap.echoesRight).toBeLessThanOrEqual(overlap.statsLeft + 1);
  const overflow = await page.locator(".victory-screen").evaluate(element => ({
    x: element.scrollWidth - element.clientWidth,
    y: element.scrollHeight - element.clientHeight,
  }));
  expect(overflow.x).toBeLessThanOrEqual(1);
  expect(overflow.y).toBeLessThanOrEqual(1);
  expect(relevantErrors(errors)).toEqual([]);
});
