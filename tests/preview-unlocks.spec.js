const { test, expect } = require("@playwright/test");
const {
  collectErrors, relevantErrors, openGame, startFreshGame,
} = require("./helpers/preview-game");
test("offline defeat event can be completed after local settlement", async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  await page.evaluate(async () => {
    await window.ServerCore.call("settleDefeat", { defeatId: "preview-first-defeat" }, window.state);
    window.state.hallModal = "firstDefeat";
    window.render();
  });
  await expect(page.locator(".first-defeat-event")).toBeVisible();
  await page.locator("[data-first-defeat-complete]").click();
  await expect(page.locator(".first-defeat-event")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => ({
    seen: !!window.state.flags.firstDefeatSeen,
    unlocked: !window.state.chars.find(character => character.id === "loki")?.locked,
    completed: !!window.state.unlockEvents?.completed?.first_defeat,
  }))).toEqual({ seen: true, unlocked: true, completed: true });
  expect(relevantErrors(errors)).toEqual([]);
});
test("pending defeat story resumes after another hall modal closes", async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  await page.evaluate(() => {
    window.state.flags.firstDefeatSeen = true;
    window.state.chars.find(character => character.id === "loki").locked = false;
    delete window.state.unlockEvents.completed.first_defeat;
    window.state.hallModal = "updates";
    window.render();
  });
  await expect(page.locator("[data-close-modal]")).toBeVisible();
  await page.locator("[data-close-modal]").click();
  await expect(page.locator(".first-defeat-event")).toBeVisible();
  expect(relevantErrors(errors)).toEqual([]);
});
test("every unlock event X dispatches its completion action", async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  const directActions = {
    littleElranaUnlock: "completeLittleElranaUnlockEvent",
    aceUnlock: "completeAceUnlockEvent",
    underwaterTrainUnlock: "completeUnderwaterTrainUnlockEvent",
    opheliaUnlock: "completeOpheliaUnlockEvent",
    bestaNurseryUnlock: "completeBestaNurseryUnlockEvent",
    orcDungeonUnlock: "completeOrcDungeonUnlockEvent",
    soniaNurseryUnlock: "completeSoniaNurseryUnlockEvent",
    chiyoRecruitUnlock: "completeChiyoRecruitUnlockEvent",
    gerdaNurseryUnlock: "completeGerdaNurseryUnlockEvent",
    hoshinoFamilyUnlock: "completeHoshinoFamilyUnlockEvent",
  };
  const hallActions = [
    "firstDefeat", "secondDefeat", "millerUnlock",
    "gerlotUnlock", "cadicisUnlock", "lukaUnlock",
  ];
  await page.evaluate(({ direct, hall }) => {
    window.__unlockCloseCalls = [];
    Object.entries(direct).forEach(([modal, action]) => {
      window[action] = () => {
        window.__unlockCloseCalls.push(modal);
        window.state.hallModal = null;
        window.render();
      };
    });
    window.HallUnlockEvents.complete = modal => {
      if (!hall.includes(modal)) return false;
      window.__unlockCloseCalls.push(modal);
      window.state.hallModal = null;
      window.render();
      return true;
    };
  }, { direct: directActions, hall: hallActions });

  const results = await page.evaluate(async modals => {
    const close = document.createElement("button");
    close.dataset.closeModal = "1";
    document.body.appendChild(close);
    const checks = [];
    for (const modal of modals) {
      window.state.hallModal = modal;
      close.click();
      await new Promise(resolve => setTimeout(resolve, 0));
      checks.push({
        modal,
        closed: window.state.hallModal === null,
        dispatched: window.__unlockCloseCalls.includes(modal),
      });
    }
    close.remove();
    return checks;
  }, [...hallActions, ...Object.keys(directActions)]);
  expect(results.every(result => result.closed && result.dispatched)).toBe(true);
  expect(relevantErrors(errors)).toEqual([]);
});
test("unlock modal remains locked until its durable save settles", async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  await page.evaluate(() => {
    window.state.hallModal = "littleElranaUnlock";
    window.completeLittleElranaUnlockEvent = async () => {
      window.state.hallModal = null;
      await new Promise(resolve => { window.__resolveUnlockSave = resolve; });
      window.render();
      return true;
    };
    window.render();
  });
  const close = page.locator("[data-close-modal]");
  await expect(close).toBeVisible();
  await close.click();
  await expect(close).toBeVisible();
  await close.click();
  await expect(close).toBeVisible();
  expect(await page.evaluate(() =>
    window.AppActionGuard.isActive("unlock-event-completion"))).toBe(true);
  await page.evaluate(() => window.__resolveUnlockSave());
  await expect(close).toHaveCount(0);
  expect(relevantErrors(errors)).toEqual([]);
});
test("bounty modal closes with a left click on its backdrop", async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  await page.locator("[data-open-modal='bounty']").click();
  await expect(page.getByRole("heading", { name: "任务列表" })).toBeVisible();
  await page.locator(".villa-modal").click({ position: { x: 2, y: 2 } });
  await expect(page.locator(".villa-modal")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.state.hallModal)).toBe(null);
  expect(relevantErrors(errors)).toEqual([]);
});

test("purchased skins can switch to default and back", async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  await page.evaluate(() => {
    window.state.resources.essence = 20;
    window.state.hallModal = "skins";
    window.state.skinFilterChar = "lokar";
    window.render();
  });
  await page.locator('[data-buy-skin="lokar_motherbound"]').click();
  await page.locator("[data-confirm-ok]").click();
  await expect.poll(() => page.evaluate(() => ({
    essence: window.state.resources.essence,
    owned: !!window.state.ownedSkins.lokar_motherbound,
    equipped: window.state.equippedSkins.lokar,
  }))).toEqual({ essence: 12, owned: true, equipped: "lokar_motherbound" });

  await page.locator('[data-equip-skin="lokar_default"]').click();
  await expect.poll(() => page.evaluate(() => ({
    equipped: window.state.equippedSkins.lokar,
    art: window.SkinSystem.applyToChar(
      window.state, window.state.chars.find(character => character.id === "lokar")).art,
  }))).toEqual({ equipped: "lokar_default", art: "./assets/images/lokar-portrait.webp" });

  await page.locator('[data-equip-skin="lokar_motherbound"]').click();
  await expect.poll(() => page.evaluate(() => ({
    equipped: window.state.equippedSkins.lokar,
    art: window.SkinSystem.applyToChar(
      window.state, window.state.chars.find(character => character.id === "lokar")).art,
  }))).toEqual({
    equipped: "lokar_motherbound",
    art: "./assets/generated/lokar-motherbound-refined-bg.235e8f11.webp",
  });
  expect(relevantErrors(errors)).toEqual([]);
});

test("pending underwater train unlock events rebuild from durable flags", async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  await page.evaluate(() => {
    window.state.flags.underwaterTrainFirstClear = true;
    window.state.flags.bestaNurseryUnlockPending = true;
    window.state.flags.opheliaUnlockSeen = false;
    window.state.flags.bestaNurseryUnlocked = false;
    window.state.flags.bestaNurseryUnlockSeen = false;
    window.state.chars.find(character => character.id === "ophelia").locked = true;
    window.state.chars.find(character => character.id === "besta").locked = true;
    window.state.hallModal = null;
    window.render();
  });
  await expect(page.locator("[data-ophelia-unlock-complete]")).toBeVisible();
  await page.evaluate(() => {
    window.state.flags.opheliaUnlockSeen = true;
    window.state.chars.find(character => character.id === "ophelia").locked = false;
    window.state.hallModal = null;
    window.render();
  });
  await expect(page.locator("[data-besta-nursery-unlock-complete]")).toBeVisible();
  expect(relevantErrors(errors)).toEqual([]);
});
