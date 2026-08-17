const { test, expect } = require("@playwright/test");
const {
  collectErrors, relevantErrors, openGame, startFreshGame,
} = require("./helpers/preview-game");

test("judgement reveal and clash overlays keep card artwork on short screens", async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 800, height: 420 });
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
    battle.judgement = {
      id: "art-judge",
      skill: "卡面判定",
      suit: "♣",
      name: "魔法对决",
      success: true,
      card: { name: "魔法对决", suit: "♣", type: "tactic", text: "判定卡效果" },
    };
    battle.lastClash = {
      id: "art-clash",
      result: "成功",
      actorCard: { name: "杀（普攻）", suit: "♥", type: "slash", text: "使用方效果" },
      targetCard: { name: "闪", suit: "♦", type: "response", text: "目标方效果" },
    };
    battle.revealCards = {
      id: "art-reveal",
      title: "亮出卡牌",
      cards: [
        { name: "愈魔瓶", suit: "♥", type: "consume", text: "恢复效果" },
        { name: "蓄力", suit: "♠", type: "tactic", text: "蓄力效果" },
      ],
    };
    window.render();
    document.getAnimations().forEach(animation => {
      const endTime = animation.effect?.getComputedTiming?.().endTime;
      if (Number.isFinite(endTime)) animation.finish();
    });
  });

  await expect(page.locator(".judgement-popup .play-card")).toContainText("魔法对决");
  await expect(page.locator(".judgement-popup .card-type")).toHaveText("战术");
  await expect(page.locator(".clash-popup .play-card")).toHaveCount(2);
  await expect(page.locator(".clash-popup")).toContainText("杀（普攻）");
  await expect(page.locator(".clash-popup")).toContainText("闪");
  await expect(page.locator(".reveal-card-wrap")).toHaveCount(2);
  await expect(page.locator(".reveal-popup")).toContainText("愈魔瓶");
  await expect(page.locator(".reveal-popup")).toContainText("蓄力");

  const presentation = await page.evaluate(() => {
    const artSource = selector => document.querySelector(`${selector} img`)?.getAttribute("src") || "";
    const popup = document.querySelector(".reveal-popup").getBoundingClientRect();
    const judgeCard = document.querySelector(".judgement-popup .play-card").getBoundingClientRect();
    const revealCard = document.querySelector(".reveal-popup .play-card").getBoundingClientRect();
    const clashCards = [...document.querySelectorAll(".clash-popup .play-card")]
      .map(card => card.getBoundingClientRect());
    const back = getComputedStyle(document.querySelector(".reveal-card-wrap"), "::before").backgroundImage;
    return {
      judgement: artSource(".judgement-popup .card-art"),
      clashActor: artSource(".clash-popup .play-card.slash .card-art"),
      clashTarget: artSource(".clash-popup .play-card.response .card-art"),
      reveal: [...document.querySelectorAll(".reveal-popup .card-art")]
        .map(card => card.querySelector("img")?.getAttribute("src") || ""),
      back,
      judgeCard: { width: judgeCard.width, height: judgeCard.height },
      revealCard: { width: revealCard.width, height: revealCard.height },
      clashCards: clashCards.map(card => ({ width: card.width, height: card.height })),
      popup: { top: popup.top, bottom: popup.bottom },
      viewportHeight: window.innerHeight,
    };
  });
  expect(presentation.judgement).toContain("card-art-magic-duel");
  expect(presentation.clashActor).toContain("card-art-basic-slash");
  expect(presentation.clashTarget).toContain("card-art-dodge");
  expect(presentation.reveal).toEqual([
    expect.stringContaining("card-art-healing-mana-bottle"),
    expect.stringContaining("card-art-charge"),
  ]);
  expect(presentation.back).toContain("succubus-card-back");
  expect(presentation.judgeCard).toEqual(presentation.revealCard);
  expect(presentation.clashCards[0]).toEqual(presentation.clashCards[1]);
  expect(presentation.clashCards[0]).toEqual({ width: 76, height: 96 });
  expect(presentation.popup.top).toBeGreaterThanOrEqual(0);
  expect(presentation.popup.bottom).toBeLessThanOrEqual(presentation.viewportHeight);
  expect(relevantErrors(errors)).toEqual([]);
});

test("battle skin loading ignores superseded and stale scene requests", async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  await page.locator("[data-open-modal='team']").first().click();
  await page.getByRole("button", { name: "测试战斗" }).click();
  await page.evaluate(() => {
    window.state.ownedSkins.lokar_motherbound = true;
    window.state.equippedSkins.lokar = "lokar_default";
    window.GameAssets.preloadBattle = async () => {};
    window.BattleEffects.whenIdle = async () => {};
    window.BattleFX.playBattleStart = callback => callback?.();
  });
  await page.locator("[data-start-test-battle]").click();
  await expect(page.locator(".battle-screen")).toBeVisible();
  await page.evaluate(() => {
    const lokar = window.state.battle.allies.find(unit => unit.ref === "lokar");
    window.state.infoUnit = lokar.uid;
    window.state.infoTab = "skins";
    window.__skinStyleLoads = [];
    const originalLoad = window.GameBundles.load;
    window.GameBundles.load = (name, context) => {
      if (name !== "battle" || !context?.skinIds) return originalLoad(name, context);
      return new Promise(resolve => window.__skinStyleLoads.push(resolve));
    };
    window.GameStore.saveSettings = async settings => settings;
    window.render();
  });

  await page.evaluate(() => {
    const staleButton = document.createElement("button");
    staleButton.dataset.battleEquipSkin = "removed_skin";
    document.body.append(staleButton);
    staleButton.click();
    staleButton.remove();
  });
  await page.waitForTimeout(50);
  expect(await page.evaluate(() => ({
    loads: window.__skinStyleLoads.length,
    equipped: window.state.equippedSkins.lokar,
  }))).toEqual({ loads: 0, equipped: "lokar_default" });

  const special = page.locator('[data-battle-equip-skin="lokar_motherbound"]');
  await special.click();
  await page.evaluate(() => window.render());
  await page.evaluate(() =>
    document.querySelector('[data-battle-equip-skin="lokar_motherbound"]').click());
  await expect.poll(() => page.evaluate(() => window.__skinStyleLoads.length)).toBe(2);
  await page.evaluate(() => window.__skinStyleLoads[0]());
  await expect.poll(() => page.evaluate(() => window.state.equippedSkins.lokar))
    .toBe("lokar_default");
  await page.evaluate(() => window.__skinStyleLoads[1]());
  await expect.poll(() => page.evaluate(() => window.state.equippedSkins.lokar))
    .toBe("lokar_motherbound");
  await expect.poll(() => page.evaluate(() => window.state.appearanceSaving)).toBe(false);

  await page.evaluate(() => {
    window.state.equippedSkins.lokar = "lokar_default";
    window.render();
  });
  await page.evaluate(() =>
    document.querySelector('[data-battle-equip-skin="lokar_motherbound"]').click());
  await expect.poll(() => page.evaluate(() => window.__skinStyleLoads.length)).toBe(3);
  await page.evaluate(() => {
    window.state.battle = null;
    window.state.view = "hall";
    window.state.infoUnit = null;
    window.render();
    window.__skinStyleLoads[2]();
  });
  await expect.poll(() => page.evaluate(() => window.state.equippedSkins.lokar))
    .toBe("lokar_default");
  await expect(page.locator(".villa-hall")).toBeVisible();
  expect(relevantErrors(errors)).toEqual([]);
});

test("battle skin selection waits for settings persistence and restores over an older main save", async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  await page.locator("[data-open-modal='team']").first().click();
  await page.getByRole("button", { name: "测试战斗" }).click();
  await page.evaluate(() => {
    window.state.ownedSkins.lokar_motherbound = true;
    window.state.equippedSkins.lokar = "lokar_default";
    window.GameAssets.preloadBattle = async () => {};
    window.BattleEffects.whenIdle = async () => {};
    window.BattleFX.playBattleStart = callback => callback?.();
  });
  await page.locator("[data-start-test-battle]").click();
  await expect(page.locator(".battle-screen")).toBeVisible();
  await page.evaluate(() => {
    const lokar = window.state.battle.allies.find(unit => unit.ref === "lokar");
    window.state.infoUnit = lokar.uid;
    window.state.infoTab = "skins";
    window.__mainSaveCalls = 0;
    window.GameStore.save = async () => { window.__mainSaveCalls += 1; };
    window.GameStore.saveSettings = settings => new Promise(resolve => {
      window.__appearanceSettings = settings;
      window.__resolveAppearanceSave = () => resolve(settings);
    });
    window.render();
  });

  await page.evaluate(() =>
    document.querySelector('[data-battle-equip-skin="lokar_motherbound"]').click());
  await expect(page.locator('[data-battle-equip-skin="lokar_motherbound"]')).toBeDisabled();
  await expect(page.locator('[data-battle-equip-skin="lokar_motherbound"]')).toContainText("保存中");
  const pending = await page.evaluate(() => ({
    skin: window.__appearanceSettings?.equippedSkins?.lokar,
    updatedAt: window.__appearanceSettings?.appearanceUpdatedAt,
    mainSaves: window.__mainSaveCalls,
  }));
  expect(pending.skin).toBe("lokar_motherbound");
  expect(pending.updatedAt).toBeGreaterThan(0);
  expect(pending.mainSaves).toBe(0);

  await page.evaluate(() => window.__resolveAppearanceSave());
  await expect(page.locator('[data-battle-equip-skin="lokar_motherbound"]')).toContainText("已装备");
  const restored = await page.evaluate(() => {
    const loaded = window.GameStore.freshState();
    loaded.ownedSkins.lokar_motherbound = true;
    loaded.equippedSkins.lokar = "lokar_default";
    loaded.settings.appearanceUpdatedAt = window.__appearanceSettings.appearanceUpdatedAt - 1;
    const applied = window.SkinSystem.applySavedAppearance(
      loaded, window.__appearanceSettings,
    );
    return { applied, skin: loaded.equippedSkins.lokar };
  });
  expect(restored).toEqual({ applied: true, skin: "lokar_motherbound" });
  expect(relevantErrors(errors)).toEqual([]);
});
