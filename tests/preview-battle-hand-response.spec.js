const { test, expect } = require("@playwright/test");
const { startRegressionBattle } = require("./helpers/preview-game");

test("Magic Bullet reveal remains locked until a hand card is selected", async ({ page }) => {
  await startRegressionBattle(page);
  await page.evaluate(() => {
    const battle = window.state.battle;
    const actor = battle.enemies[0];
    const target = battle.allies[0];
    actor.hand = [{ name: "同花色费用", suit: "♥", type: "tactic" }];
    target.hand = [
      window.BattleStatusCards.create("seal"),
      { name: "必须展示", suit: "♥", type: "response" },
    ];
    battle.handReveal = {
      actorUid: actor.uid,
      targetUid: target.uid,
      cardName: "魔弹特攻",
      card: { name: "魔弹特攻", type: "tactic", magicBullet: true },
      mode: "magicBulletReveal",
      repeatAfter: false,
    };
    battle.locked = true;
    window.render();
  });
  await expect(page.locator("[data-hand-reveal-close]")).toHaveCount(0);
  await expect(page.locator(".hand-panel [data-hand-reveal-pick='0']"))
    .toHaveCount(1);
  await expect(page.locator(".hand-panel [data-hand-reveal-pick]"))
    .toHaveCount(1);
  await expect(page.locator(".hand-panel [data-hand-reveal-pick='0']"))
    .toContainText("必须展示");
  await expect(page.locator(".hand-panel")).not.toContainText("封魔");
  await expect(page.locator(".hand-reveal-overlay")).toHaveCount(0);
  await page.locator(".battle-screen").dispatchEvent("contextmenu");
  await expect.poll(() => page.evaluate(() => ({
    mode: window.state.battle.handReveal?.mode,
    locked: window.state.battle.locked,
  }))).toEqual({ mode: "magicBulletReveal", locked: true });
  expect(await page.evaluate(() =>
    window.BattleSystem.resolveHandReveal(window.state, null))).toBe(true);
  expect(await page.evaluate(() => ({
    mode: window.state.battle.handReveal?.mode,
    locked: window.state.battle.locked,
  }))).toEqual({ mode: "magicBulletReveal", locked: true });
  await page.locator("[data-hand-reveal-pick='0']")
    .dispatchEvent("pointerdown");
  await expect.poll(() => page.evaluate(() => ({
    reveal: window.state.battle.handReveal,
    locked: window.state.battle.locked,
  }))).toEqual({ reveal: null, locked: false });
});

test("Magic Bullet target highlighting ignores status-only hands", async ({ page }) => {
  await startRegressionBattle(page);
  const targets = await page.evaluate(() => {
    const battle = window.state.battle;
    const actor = battle.allies[0];
    const statusOnly = battle.enemies[0];
    const displayable = battle.enemies[1];
    battle.activeUid = actor.uid;
    battle.phase = 4;
    battle.locked = false;
    actor.hand = [
      window.CardUtils.cloneEntity("魔弹特攻", { suit: "♠" }),
    ];
    statusOnly.hand = [window.BattleStatusCards.create("stun")];
    displayable.hand = [
      window.BattleStatusCards.create("seal"),
      { name: "可展示牌", suit: "♦", type: "response" },
    ];
    battle.selectedCardIndex = 0;
    window.render();
    return { statusOnly: statusOnly.uid, displayable: displayable.uid };
  });
  await expect(page.locator(`[data-target="${targets.statusOnly}"]`))
    .not.toHaveClass(/selectable-target/);
  await expect(page.locator(`[data-target="${targets.displayable}"]`))
    .toHaveClass(/selectable-target/);
});

test("manual responses and Magic Bullet costs use the hand action area", async ({ page }) => {
  await startRegressionBattle(page);
  const result = await page.evaluate(() => {
    const battle = window.state.battle;
    const ally = battle.allies[0];
    const enemy = battle.enemies[0];
    battle.activeUid = ally.uid;
    battle.phase = 4;
    battle.locked = false;
    window.render();
    const endWidth = document.querySelector("[data-end-play]")
      .getBoundingClientRect().width;
    battle.allies.slice(1).forEach(unit => { unit.hand = []; });
    ally.hand = [
      { name: "闪", suit: "♦", type: "response" },
      { name: "看破", suit: "♣", type: "response", counterTactic: true },
    ];
    battle.manualDodge = {
      actorUid: enemy.uid,
      targetUid: ally.uid,
      card: { name: "杀（普攻）", type: "slash" },
      selectedIndex: 0,
    };
    battle.locked = true;
    window.render();
    const dodge = {
      cards: document.querySelectorAll(
        ".hand-panel [data-manual-dodge-pick]").length,
      overlayCards: document.querySelectorAll(
        ".manual-dodge-overlay .manual-dodge-card").length,
      cancelWidth: document.querySelector("[data-manual-dodge-cancel]")
        .getBoundingClientRect().width,
      cancelInHead:
        !!document.querySelector(".hand-head [data-manual-dodge-cancel]"),
    };
    battle.manualDodge = null;
    battle.manualCounter = {
      actorUid: enemy.uid,
      targetUid: ally.uid,
      card: { name: "测试战术", type: "tactic" },
      selectedIndex: 0,
    };
    window.render();
    const counter = {
      cards: document.querySelectorAll(
        ".hand-panel [data-manual-counter-pick]").length,
      overlay: document.querySelectorAll(".manual-dodge-overlay").length,
      cancelWidth: document.querySelector("[data-manual-counter-cancel]")
        .getBoundingClientRect().width,
      cancelInHead:
        !!document.querySelector(".hand-head [data-manual-counter-cancel]"),
    };
    battle.manualCounter = null;
    battle.handReveal = {
      actorUid: ally.uid,
      targetUid: enemy.uid,
      cardName: "魔弹特攻",
      card: { name: "魔弹特攻", type: "tactic", magicBullet: true },
      mode: "magicBullet",
      shownSuit: "♦",
      shownCard: { name: "目标牌", suit: "♦" },
      validIndexes: [0],
    };
    window.render();
    const bullet = {
      cards: document.querySelectorAll(
        ".hand-panel [data-hand-reveal-pick]").length,
      overlay: document.querySelectorAll(".hand-reveal-overlay").length,
      cancelWidth: document.querySelector("[data-hand-reveal-close]")
        .getBoundingClientRect().width,
      cancelInHead:
        !!document.querySelector(".hand-head [data-hand-reveal-close]"),
    };
    return { endWidth, dodge, counter, bullet };
  });
  expect(result.dodge)
    .toMatchObject({ cards: 1, overlayCards: 0, cancelInHead: true });
  expect(result.counter)
    .toMatchObject({ cards: 1, overlay: 0, cancelInHead: true });
  expect(result.bullet)
    .toMatchObject({ cards: 1, overlay: 0, cancelInHead: true });
  expect(result.dodge.cancelWidth).toBeGreaterThanOrEqual(result.endWidth);
  expect(result.counter.cancelWidth).toBeGreaterThanOrEqual(result.endWidth);
  expect(result.bullet.cancelWidth).toBeGreaterThanOrEqual(result.endWidth);
});
