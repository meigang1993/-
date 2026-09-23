const { test, expect } = require("@playwright/test");
const {
  collectErrors, relevantErrors, startRegressionBattle,
} = require("./helpers/preview-game");
const { prepareBattleTrail, verifyBattleLogPanel } = require("./helpers/battle-ui-trail");
const { verifyBattleResponsiveLayout, verifyBattleResponseTrail } = require("./helpers/battle-ui-layout");

test("battle play trail and expandable log stay compact and interactive", async ({ page }) => {
  test.setTimeout(120000);
  const errors = collectErrors(page);
  await prepareBattleTrail(page);
  await verifyBattleLogPanel(page);
  await verifyBattleResponsiveLayout(page);
  await verifyBattleResponseTrail(page);
  expect(relevantErrors(errors)).toEqual([]);
});

test("battle hand actions stay large in compact landscape", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await startRegressionBattle(page);
  const sizes = await page.evaluate(() => {
    const battle = window.state.battle, actor = battle.allies[0];
    battle.activeUid = actor.uid;
    battle.phase = 4;
    battle.locked = false;
    battle.selectedCardIndex = null;
    battle.selectedSkillCard = null;
    window.render();
    const rect = selector => {
      const button = document.querySelector(selector), box = button.getBoundingClientRect();
      return { width: box.width, height: box.height, fontSize: parseFloat(getComputedStyle(button).fontSize) };
    };
    const end = rect("[data-end-play]");
    battle.phase = 1;
    battle.awaitingExtractUid = actor.uid;
    window.render();
    const skipSkill = rect("[data-skip-extract]");
    battle.awaitingExtractUid = null;
    battle.phase = 4;
    battle.newMoonShare = { unitUid: actor.uid, count: 1, indexes: [] };
    window.render();
    const declineSkill = rect("[data-new-moon-skip]");
    battle.newMoonShare = null;
    battle.selectedCardIndex = 0;
    battle.pendingTargetUid = battle.enemies.find(unit => unit.hp > 0)?.uid || null;
    window.render();
    const confirm = rect("[data-confirm-target]"), cancel = rect("[data-cancel-target]");
    battle.phase = 5;
    battle.selectedCardIndex = null;
    battle.pendingTargetUid = null;
    actor.stats.handLimit = 1;
    battle.discardPick = { unitUid: actor.uid, indexes: actor.hand.map((_, index) => index) };
    window.render();
    const discard = rect("[data-confirm-discard]");
    const enemy = battle.enemies.find(unit => unit.hp > 0);
    actor.hand = [{ name: "闪", type: "response", suit: "♥", text: "测试。" }];
    battle.discardPick = null;
    battle.phase = 4;
    battle.manualDodge = {
      actorUid: enemy.uid, targetUid: actor.uid,
      card: { name: "杀（普攻）", type: "slash" }, selectedIndex: 0,
    };
    battle.locked = true;
    window.render();
    const panel = document.querySelector(".hand-panel").getBoundingClientRect();
    const responseCard = document.querySelector(".hand-response-card .play-card");
    const response = responseCard.getBoundingClientRect();
    return {
      end, skipSkill, declineSkill, confirm, cancel, discard,
      response: {
        width: responseCard.offsetWidth, height: responseCard.offsetHeight,
        inside: response.top >= panel.top - 1 && response.bottom <= panel.bottom + 1,
      },
    };
  });
  expect(sizes.end.width).toBeGreaterThanOrEqual(96);
  expect(sizes.discard.width).toBeGreaterThanOrEqual(96);
  expect(sizes.confirm.width).toBeGreaterThanOrEqual(76);
  expect(sizes.cancel.width).toBeGreaterThanOrEqual(76);
  [sizes.end, sizes.skipSkill, sizes.declineSkill, sizes.confirm, sizes.cancel, sizes.discard].forEach(size => {
    expect(size.height).toBeGreaterThanOrEqual(34);
    expect(size.fontSize).toBeGreaterThanOrEqual(14);
    expect(size.width).toBeGreaterThanOrEqual(76);
  });
  expect(sizes.response).toEqual({ width: 76, height: 96, inside: true });
});

test("restricted skill costs disable and reject illegal hand cards", async ({ page }) => {
  await startRegressionBattle(page);
  const result = await page.evaluate(() => {
    const battle = window.state.battle, actor = battle.allies[0];
    actor.hand = [
      { name: "合法红桃", type: "response", suit: "♥", text: "偶像之吻费用。" },
      { name: "非法黑桃", type: "response", suit: "♠", text: "不可作为偶像之吻费用。" },
    ];
    battle.activeUid = actor.uid;
    battle.phase = 4;
    battle.locked = false;
    battle.selectedCardIndex = null;
    battle.selectedSkillCard = {
      name: "偶像之吻", type: "tactic", _skill: true,
      idolKiss: true, allyTarget: true,
    };
    window.render();
    const illegal = document.querySelector("[data-card-index='1']");
    const legal = document.querySelector("[data-card-index='0']");
    illegal.click();
    const afterIllegal = battle.selectedCardIndex;
    legal.click();
    return {
      illegalDisabled: illegal.classList.contains("disabled"),
      legalDisabled: legal.classList.contains("disabled"),
      afterIllegal,
      afterLegal: battle.selectedCardIndex,
    };
  });
  expect(result).toEqual({
    illegalDisabled: true,
    legalDisabled: false,
    afterIllegal: null,
    afterLegal: 0,
  });
});

test("selected hand cards keep their lift while hovered", async ({ page }) => {
  await startRegressionBattle(page);
  await page.evaluate(() => {
    const battle = window.state.battle;
    const actor = battle.allies[0];
    battle.activeUid = actor.uid;
    battle.phase = 4;
    battle.locked = false;
    actor.intent = 1;
    actor.hand[0] = window.CardUtils.cloneEntity("杀（普攻）", { suit: "♠" });
    battle.selectedCardIndex = 0;
    battle.selectedSkillCard = null;
    battle.pendingTargetUid = null;
    window.render();
  });
  const card = page.locator(".active-hand .play-card").first();
  await expect(card).toHaveClass(/selected/);
  await card.hover();
  await expect.poll(() => card.evaluate(element => {
    const transform = getComputedStyle(element).transform;
    return transform && transform !== "none" ? new DOMMatrix(transform).m42 : 0;
  })).toBeLessThanOrEqual(-17);
});

test("battle hand remains reachable in minimum compact landscape", async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 270 });
  await startRegressionBattle(page);
  const layout = await page.evaluate(() => {
    const battle = document.querySelector(".battle-screen");
    const before = battle.scrollTop;
    battle.scrollTop = battle.scrollHeight;
    const battleRect = battle.getBoundingClientRect();
    const handRect = document.querySelector(".hand-panel").getBoundingClientRect();
    const endRect = document.querySelector("[data-end-play]").getBoundingClientRect();
    return {
      pageOverflowX: document.scrollingElement.scrollWidth > innerWidth,
      pageOverflowY: document.scrollingElement.scrollHeight > innerHeight,
      internalScrollable: battle.scrollHeight > battle.clientHeight,
      internalScrolled: battle.scrollTop > before,
      handVisible: handRect.top >= battleRect.top && handRect.bottom <= battleRect.bottom,
      endVisible: endRect.top >= battleRect.top && endRect.bottom <= battleRect.bottom,
    };
  });
  expect(layout).toEqual({
    pageOverflowX: false,
    pageOverflowY: false,
    internalScrollable: true,
    internalScrolled: true,
    handVisible: true,
    endVisible: true,
  });
});

test("test retreat stays clickable and Wendy picker keeps its scroll", async ({ page }) => {
  await startRegressionBattle(page);
  await page.evaluate(() => {
    window.state.battle.test = true;
    window.render();
  });
  await page.locator(".enemy-row .unit").first().hover();
  expect(await page.evaluate(() => {
    const retreat = document.querySelector("[data-retreat]");
    const box = retreat.getBoundingClientRect();
    return document.elementFromPoint(
      box.left + box.width / 2, box.top + box.height / 2,
    )?.closest("[data-retreat]") === retreat;
  })).toBe(true);
  const initial = await page.evaluate(() => {
    const battle = window.state.battle;
    const actor = battle.allies[0];
    actor.ref = "wendy";
    battle.locked = true;
    battle.wendyTutorPicker = { uid: actor.uid };
    battle.speech = { global: true, text: "测试对白", dismissible: true };
    window.render();
    const picker = document.querySelector("[data-battle-picker-scroll]");
    picker.scrollTop = Math.min(180, picker.scrollHeight - picker.clientHeight);
    const before = picker.scrollTop;
    window.render();
    return {
      before,
      after: document.querySelector("[data-battle-picker-scroll]").scrollTop,
    };
  });
  expect(initial.before).toBeGreaterThan(0);
  expect(initial.after).toBe(initial.before);
  await page.locator("[data-retreat]").click();
  await expect(page.getByRole("heading", { name: "结束测试" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.state.battle?.speech?.text)).toBe("测试对白");
});
