const { test, expect } = require("@playwright/test");
const {
  collectErrors, relevantErrors, openGame, startFreshGame, startRegressionBattle,
} = require("./helpers/preview-game");
const {
  animationNames, sampleSelectionLayout, unlockCharacters,
} = require("./helpers/render-stability");

test("same-screen interactions do not flash reused panels or portraits", async ({ page }) => {
  await openGame(page);
  await startFreshGame(page);
  await page.locator("[data-open-modal='team']").click();
  const initialEntry = await animationNames(page, [".villa-modal", ".modal-card"]);
  expect(initialEntry).toEqual(expect.arrayContaining(["fadeIn", "modalIn"]));
  await page.waitForTimeout(250);
  const portrait = await page.locator(".party-avatar img").first().elementHandle();
  await page.getByRole("button", { name: "角色列表" }).click();
  const result = await page.evaluate(oldPortrait => {
    const src = oldPortrait.getAttribute("src");
    const nextPortrait = [...document.images].find(image => image.getAttribute("src") === src);
    const runningEntry = [".villa-modal", ".modal-card"].flatMap(selector => (
      [...document.querySelectorAll(selector)].flatMap(element => (
        element.getAnimations().filter(animation => (
          ["fadeIn", "modalIn"].includes(animation.animationName)
          && animation.playState === "running"
        )).map(animation => animation.animationName)
      ))
    ));
    return {
      samePortrait: oldPortrait === nextPortrait,
      modalOpacity: getComputedStyle(document.querySelector(".villa-modal")).opacity,
      cardOpacity: getComputedStyle(document.querySelector(".modal-card")).opacity,
      runningEntry,
    };
  }, portrait);
  expect(result).toEqual({
    samePortrait: true,
    modalOpacity: "1",
    cardOpacity: "1",
    runningEntry: [],
  });
  await unlockCharacters(page, ["sonia"]);
  await page.evaluate(() => {
    window.state.party = [window.state.party[0]];
    window.render();
    document.querySelector('[data-toggle-party="sonia"]').scrollIntoView({ block: "center" });
  });
  const card = await page.locator('[data-toggle-party="sonia"]').elementHandle();
  const rosterPortrait = await page.locator('[data-toggle-party="sonia"] .portrait').elementHandle();
  for (const expected of [
    { active: true, status: "出战中", count: "当前出战 2/4" },
    { active: false, status: "点击参战", count: "当前出战 1/4" },
  ]) {
    const before = await page.evaluate(node => {
      const rect = node.getBoundingClientRect();
      return { top: rect.top, height: rect.height, scrollTop: document.querySelector(".modal-card").scrollTop };
    }, card);
    await page.locator('[data-toggle-party="sonia"]').click();
    const after = await page.evaluate(([cardNode, portraitNode]) => {
      const current = document.querySelector('[data-toggle-party="sonia"]');
      const rect = current.getBoundingClientRect();
      return {
        sameCard: current === cardNode,
        samePortrait: current.querySelector(".portrait") === portraitNode,
        top: rect.top,
        height: rect.height,
        scrollTop: document.querySelector(".modal-card").scrollTop,
        active: current.classList.contains("in-party"),
        contentVisibility: getComputedStyle(current).contentVisibility,
        status: current.querySelector("[data-party-status]").textContent,
        count: document.querySelector("[data-party-count]").textContent,
      };
    }, [card, rosterPortrait]);
    expect(after.sameCard).toBe(true);
    expect(after.samePortrait).toBe(true);
    expect(Math.abs(after.top - before.top)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.scrollTop - before.scrollTop)).toBeLessThanOrEqual(1);
    expect(after.active).toBe(expected.active);
    expect(after.contentVisibility).toBe("visible");
    expect(after.status).toBe(expected.status);
    expect(after.count).toBe(expected.count);
  }
});

test("same-screen rerenders tolerate a missing Web Animations API", async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  await page.evaluate(() => {
    Object.defineProperty(Element.prototype, "getAnimations", {
      configurable: true,
      value: undefined,
    });
  });
  await page.locator("[data-open-modal='team']").click();
  await page.getByRole("button", { name: "角色列表" }).click();
  await expect(page.locator(".villa-modal")).toBeVisible();
  await expect(page.locator(".modal-card")).toContainText("角色列表");
  expect(relevantErrors(errors)).toEqual([]);
});

test("battle rerenders preserve decoded card artwork nodes", async ({ page }) => {
  await startRegressionBattle(page);
  await expect.poll(() => page.locator(".active-hand .card-art img").first()
    .evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  const artwork = await page.locator(".active-hand .card-art img").first().elementHandle();
  const result = await page.evaluate(oldArtwork => {
    const src = oldArtwork.getAttribute("src");
    window.state.battle.selectedCardIndex = 0;
    window.render();
    const current = [...document.querySelectorAll(".active-hand .card-art img")]
      .find(image => image.getAttribute("src") === src);
    return {
      sameNode: current === oldArtwork,
      decoding: current?.getAttribute("decoding"),
      complete: current?.complete,
    };
  }, artwork);
  expect(result.sameNode).toBe(true);
  expect(result.decoding).toBe("async");
  expect(result.complete).toBe(true);
});

test("test battle character and enemy selections keep stable layout", async ({ page }) => {
  await openGame(page);
  await startFreshGame(page);
  await page.locator("[data-open-modal='team']").click();
  await page.getByRole("button", { name: "测试战斗" }).click();
  await unlockCharacters(page, ["sonia"]);
  for (const selector of ['[data-test-ally="sonia"]', '[data-test-enemy="12"]']) {
    const result = await sampleSelectionLayout(page, selector);
    const scrolls = result.samples.map(sample => sample.scrollTop), heights = result.samples.map(sample => sample.height);
    expect(result.contentVisibility).toBe("visible");
    expect(Math.max(...scrolls) - Math.min(...scrolls)).toBeLessThanOrEqual(1);
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);
  }
});

test("battle skill and relic captions keep animation progress across rerenders", async ({ page }) => {
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
    const actor = window.state.battle.allies[0];
    window.state.battle.skillCaption = { id: "skill-caption-test", side: actor.side, text: `${actor.name} 发动了 测试技能` };
    window.state.battle.relicCaption = { id: "relic-caption-test", side: actor.side, text: `${actor.name} 使用了 测试饰品` };
    window.render();
  });
  const result = await page.evaluate(() => {
    const read = selector => {
      const element = document.querySelector(selector);
      const animation = element.getAnimations().find(item => item.animationName === "skillCaptionCenter");
      return { opacity: Number(getComputedStyle(element).opacity), time: Number(animation?.currentTime || 0) };
    };
    void document.body.offsetHeight;
    document.querySelectorAll(".skill-caption").forEach(element => {
      const animation = element.getAnimations().find(item => item.animationName === "skillCaptionCenter");
      animation.currentTime = 2000;
    });
    const before = {
      skill: read(".skill-caption:not(.relic-caption)"),
      relic: read(".relic-caption"),
    };
    window.render();
    return {
      before,
      after: {
        skill: read(".skill-caption:not(.relic-caption)"),
        relic: read(".relic-caption"),
      },
    };
  });
  for (const type of ["skill", "relic"]) {
    expect(result.before[type].opacity).toBeGreaterThan(0.95);
    expect(result.after[type].opacity).toBeGreaterThanOrEqual(result.before[type].opacity - 0.05);
    expect(result.after[type].time).toBeGreaterThanOrEqual(1990);
  }
  const replacementTimes = await page.evaluate(() => {
    const actor = window.state.battle.allies[0];
    window.state.battle.skillCaption = { id: "skill-caption-new", side: actor.side, text: `${actor.name} 发动了 新技能` };
    window.state.battle.relicCaption = { id: "relic-caption-new", side: actor.side, text: `${actor.name} 使用了 新饰品` };
    window.render();
    return [...document.querySelectorAll(".skill-caption")].map(element => (
      Number(element.getAnimations().find(item => item.animationName === "skillCaptionCenter")?.currentTime || 0)
    ));
  });
  replacementTimes.forEach(time => expect(time).toBeLessThan(100));
});

test("hand selection lifts and returns without replaying on stable rerenders", async ({ page }) => {
  await startRegressionBattle(page);
  const result = await page.evaluate(() => {
    const battle = window.state.battle, actor = battle.allies[0];
    battle.activeUid = actor.uid;
    battle.phase = 4;
    battle.locked = false;
    battle.selectedCardIndex = null;
    battle.selectedSkillCard = null;
    window.render();
    const initialHand = document.querySelector(".active-hand");
    const initialCard = initialHand.querySelector("[data-card-index='0']");
    const before = {
      top: initialCard.getBoundingClientRect().top,
      height: initialHand.getBoundingClientRect().height,
    };
    battle.selectedCardIndex = 0;
    window.render();
    const selected = document.querySelector(".active-hand [data-card-index='0']");
    const enter = selected.getAnimations().find(animation => animation.animationName === "handCardSelect");
    const enterFrames = enter?.effect.getKeyframes() || [];
    const enterEasing = getComputedStyle(selected).animationTimingFunction;
    if (enter) enter.currentTime = enter.effect.getComputedTiming().duration * .75;
    const liftedTop = selected.getBoundingClientRect().top;
    window.render();
    const stable = document.querySelector(".active-hand [data-card-index='0']");
    const stableAnimations = stable.getAnimations().map(animation => animation.animationName);
    const stableHeight = document.querySelector(".active-hand").getBoundingClientRect().height;
    battle.selectedCardIndex = null;
    window.render();
    const returned = document.querySelector(".active-hand [data-card-index='0']");
    const leave = returned.getAnimations().find(animation => animation.animationName === "handCardReturn");
    const leaveFrames = leave?.effect.getKeyframes() || [];
    const returnEasing = getComputedStyle(returned).animationTimingFunction;
    return {
      enter: enter?.animationName || "",
      enterEasing,
      enterUses3d: enterFrames.every(frame => String(frame.transform).startsWith("translate3d")),
      liftedBy: before.top - liftedTop,
      stable: stable.classList.contains("selection-stable"),
      stableAnimations,
      returnAnimation: leave?.animationName || "",
      returnEasing,
      returnUses3d: leaveFrames.every(frame => String(frame.transform).startsWith("translate3d")),
      handHeightDelta: Math.abs(before.height - stableHeight),
    };
  });
  expect(result.enter).toBe("handCardSelect");
  expect(result.enterEasing).toBe("cubic-bezier(0.16, 1, 0.3, 1)");
  expect(result.enterUses3d).toBe(true);
  expect(result.liftedBy).toBeGreaterThan(14);
  expect(result.stable).toBe(true);
  expect(result.stableAnimations).not.toContain("handCardSelect");
  expect(result.returnAnimation).toBe("handCardReturn");
  expect(result.returnEasing).toBe("cubic-bezier(0.4, 0, 0.2, 1)");
  expect(result.returnUses3d).toBe(true);
  expect(result.handHeightDelta).toBeLessThanOrEqual(1);
});
