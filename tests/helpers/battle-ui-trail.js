const { expect } = require("@playwright/test");
const { openGame, startFreshGame } = require("./preview-game");

async function prepareBattleTrail(page) {
  await openGame(page);
  await startFreshGame(page);
  await page.locator("[data-open-modal='team']").first().click();
  await page.getByRole("button", { name: "测试战斗" }).click();
  await page.evaluate(() => {
    window.GameAssets.preloadBattle = async () => {};
    window.BattleEffects.whenIdle = async () => {};
    window.BattleFX.playBattleStart = callback => callback?.();
  });
  await page.locator("[data-start-test-battle]").click();
  await expect(page.locator(".battle-screen")).toBeVisible();
  await page.evaluate(() => {
    const battle = window.state.battle;
    window.BattleEffects.cancel(window.state);
    battle.activeUid = battle.allies[0].uid;
    battle.phase = 4;
    battle.locked = false;
    battle.thinkingUid = null;
    battle.allies.concat(battle.enemies)
      .forEach(unit => unit.hand.forEach(card => { delete card._pendingDraw; }));
    battle.speech = { global: true, text: "测试开场对白", dismissible: true };
    battle.played = [
      { name: "毒气手雷", suit: "♣", type: "tactic", _playedByName: "克罗博士", _playedAction: "使用了" },
      { name: "杀（普攻）", suit: "♥", type: "slash", _playedByName: "罗卡尔", _playedAction: "使用了" },
    ];
    battle.shownPlayed = [];
    for (let i = 0; i < 36; i += 1) window.BattleLog.add(window.state, `测试行动记录${i + 1}`);
    window.render();
  });

  await expect(page.locator(".battle-log")).toHaveCount(0);
  await expect(page.locator(".card-trail")).toHaveCount(2);
  await expect(page.locator(".card-trail").nth(0)).toContainText(/杀（普攻）.*罗卡尔/);
  await expect(page.locator(".card-trail").nth(1)).toContainText(/毒气手雷.*克罗博士/);
  await expect(page.locator(".card-trail").first()).toContainText(/战术|杀/);
  await expect.poll(() => page.locator(".card-trail").first().evaluate(card => {
    const rect = card.getBoundingClientRect(), zone = card.closest(".public-zone").getBoundingClientRect();
    return {
      fullSize: rect.width >= 86 && rect.height >= 108,
      inside: rect.top >= zone.top && rect.bottom <= zone.bottom,
    };
  })).toEqual({ fullSize: true, inside: true });
  await page.evaluate(() => {
    window.state.battle.played = [
      { name: "神速之袭", type: "tactic", skillName: "神速之袭", _playedByName: "芙萝娅", _playedAction: "发动了" },
      { name: "闪", suit: "♥", type: "response", convertedFrom: "杀（普攻）", skillName: "错误技能", _playedByName: "护卫凯丽", _playedAction: "使用了" },
      { name: "杀（普攻）", type: "slash", virtual: true, skillName: "错误技能", _playedByName: "罗卡尔", _playedAction: "使用了" },
    ];
    window.state.battle.shownPlayed = [];
    window.render();
  });
  await expect(page.locator(".card-trail").filter({ hasText: "杀（普攻）" }).locator(".trail-kind")).toHaveText("虚拟");
  await expect(page.locator(".card-trail").filter({ hasText: "闪" }).locator(".trail-kind")).toHaveText("转换");
  await expect(page.locator(".card-trail").filter({ hasText: "神速之袭" }).locator(".trail-type")).toHaveText("技能");
  await expect(page.locator(".card-trail").filter({ hasText: "错误技能" })).toHaveCount(0);
  await page.evaluate(() => {
    const battle = window.state.battle, actor = battle.enemies[0], radar = { name: "索敌雷达", _skill: true, radar: true };
    window.BattleSystem.revealPlayed(battle, radar, { uid: actor.uid });
    window.render();
  });
  await expect(page.locator(".card-trail").filter({ hasText: "索敌雷达" }).locator(".trail-type")).toHaveText("技能");
  await page.evaluate(() => {
    window.state.battle.played = [
      { name: "毒气手雷", suit: "♣", type: "tactic", _playedByName: "克罗博士", _playedAction: "使用了" },
      { name: "杀（普攻）", suit: "♥", type: "slash", _playedByName: "罗卡尔", _playedAction: "使用了" },
    ];
    window.state.battle.shownPlayed = [];
    window.render();
  });
  await page.evaluate(() => {
    window.state.battle.shownPlayed = JSON.parse(JSON.stringify(window.state.battle.played));
    window.render();
  });
  await expect(page.locator(".card-trail")).toHaveCount(2);
  await page.evaluate(() => {
    const repeated = { name: "杀（普攻）", suit: "♥", type: "slash", _playedByName: "罗卡尔", _playedAction: "使用了" };
    window.state.battle.played = [repeated, repeated];
    window.state.battle.shownPlayed = [];
    window.render();
  });
  await expect(page.locator(".card-trail")).toHaveCount(2);
  await page.evaluate(() => {
    window.state.battle.played = Array.from({ length: 12 }, (_, i) => ({
      name: `测试牌${12 - i}`, suit: i % 2 ? "♣" : "♥", type: "tactic", _playedByName: "罗卡尔", _playedAction: "使用了",
    }));
    window.state.battle.shownPlayed = [];
    window.render();
  });
  await expect(page.locator(".card-trail")).toHaveCount(12);
  await expect.poll(() => page.locator(".public-cards").evaluate(trail => ({
    scrollable: trail.scrollWidth > trail.clientWidth,
    atLatest: trail.scrollWidth - trail.clientWidth - trail.scrollLeft < 3,
    bodyOverflow: document.body.scrollWidth - document.body.clientWidth,
  }))).toEqual({ scrollable: true, atLatest: true, bodyOverflow: 0 });

}

async function verifyBattleLogPanel(page) {
  const logButton = page.getByRole("button", { name: "牌局记录" });
  const settingsButton = page.locator(".battle-tools [data-open-settings]");
  await expect(logButton).toBeVisible();
  await expect(settingsButton).toBeVisible();
  const tools = await page.evaluate(() => {
    const log = document.querySelector("[data-open-battle-log]").getBoundingClientRect();
    const settings = document.querySelector(".battle-tools [data-open-settings]").getBoundingClientRect();
    return { logRight: log.right, settingsLeft: settings.left };
  });
  expect(tools.settingsLeft).toBeGreaterThanOrEqual(tools.logRight);

  await logButton.click();
  await expect(page.locator(".battle-log-panel")).toBeVisible();
  expect(await page.evaluate(() => window.state.battle.speech?.text)).toBe("测试开场对白");
  await expect(page.locator(".battle-log-entry").last()).toContainText("进入测试战斗");
  await expect.poll(() => page.locator(".battle-log-list").evaluate(list => ({
    scrollable: list.scrollHeight > list.clientHeight,
    atLatest: list.scrollTop < 3,
  }))).toEqual({ scrollable: true, atLatest: true });
  await page.evaluate(() => {
    window.BattleLog.add(window.state, "顶部跟随测试");
    window.render();
  });
  await expect(page.locator(".battle-log-entry").first()).toContainText("顶部跟随测试");
  await expect.poll(() => page.locator(".battle-log-list").evaluate(list => list.scrollTop < 3)).toBe(true);
  const readingTop = await page.locator(".battle-log-list").evaluate(async list => {
    list.style.scrollBehavior = "auto";
    list.scrollTop = list.scrollHeight;
    await new Promise(resolve => requestAnimationFrame(resolve));
    return list.scrollTop;
  });
  expect(readingTop).toBeGreaterThan(24);
  await page.evaluate(() => {
    window.BattleLog.add(window.state, "阅读位置保持测试");
    window.render();
  });
  await expect.poll(() => page.locator(".battle-log-list").evaluate(list => list.scrollTop))
    .toBeGreaterThanOrEqual(readingTop - 2);

  await page.getByRole("button", { name: "关闭牌局记录" }).click();
  await expect(page.locator(".battle-log-panel")).toHaveCount(0);
  await logButton.click();
  await page.locator(".battle-log-panel").click({ button: "right" });
  await expect(page.locator(".battle-log-panel")).toHaveCount(0);
  expect(await page.evaluate(() => window.battleLogOpen)).toBe(false);
  await settingsButton.click();
  await expect(page.locator(".settings-menu")).toBeVisible();
  await page.locator("[data-close-settings]").click();
  await expect(page.locator(".battle-screen")).toBeVisible();
  await page.setViewportSize({ width: 844, height: 390 });
  await logButton.click();
  await expect.poll(() => page.locator(".battle-log-panel").evaluate(
    panel => getComputedStyle(panel).transform === "none",
  )).toBe(true);
  const compactLogLayout = await page.evaluate(() => {
    const panel = document.querySelector(".battle-log-panel").getBoundingClientRect();
    const close = document.querySelector("[data-close-battle-log]").getBoundingClientRect();
    const battle = document.querySelector(".battle-screen").getBoundingClientRect();
    return {
      inCanvas: panel.top >= battle.top && panel.left >= battle.left
        && panel.right <= battle.right && panel.bottom <= battle.bottom,
      closeTarget: close.width >= 44 && close.height >= 44,
      pageOverflow: document.scrollingElement.scrollHeight > innerHeight,
      bodyOverflowX: document.body.scrollWidth - document.body.clientWidth,
      bodyOverflowY: document.body.scrollHeight - document.body.clientHeight,
    };
  });
  expect(compactLogLayout).toEqual({
    inCanvas: true,
    closeTarget: true,
    pageOverflow: false,
    bodyOverflowX: 0,
    bodyOverflowY: 0,
  });
  const pageStayedFixed = await page.evaluate(() => {
    document.scrollingElement.scrollTop = document.scrollingElement.scrollHeight;
    return document.scrollingElement.scrollTop === 0;
  });
  expect(pageStayedFixed).toBe(true);
  await page.getByRole("button", { name: "关闭牌局记录" }).click();

}

module.exports = { prepareBattleTrail, verifyBattleLogPanel };
