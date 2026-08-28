const { test, expect } = require("@playwright/test");
const {
  openGame, startFreshGame,
} = require("./helpers/preview-game");
const { startupBundlePaths } = require("../tools/publish-bundle-groups");

test("scene bundles stay deferred until requested", async ({ page }) => {
  await openGame(page, { loadFeatures: false });
  expect(await page.evaluate(() => ({
    hall: window.GameBundles.isReady("hall"),
    battle: window.GameBundles.isReady("battle"),
    dungeon: window.GameBundles.isReady("dungeon"),
    hallCollection: typeof window.VillaCollectionUI,
    hallModules: [
      window.VillaUI,
      window.SuccubusCodex,
      window.ShopSystem,
      window.BountySystem,
      window.AppHallBindings,
    ].map(value => typeof value),
    battleUi: [
      window.GameUIBattlePickers,
      window.GameUIBattleTargeting,
      window.GameUIBattleUnits,
    ].map(value => typeof value),
    scripts: [...document.scripts].map(script => script.getAttribute("src")?.split(/[?#]/)[0]).filter(Boolean),
    versionedEntries: (() => {
      const buildVersion = document.querySelector('meta[name="game-build"]')?.content;
      const entries = [...document.scripts].map(script => script.getAttribute("src")).filter(Boolean);
      return !!buildVersion && entries.length > 0
        && entries.every(entry =>
          new URL(entry, document.baseURI).searchParams.get("v") === buildVersion);
    })(),
    styles: [...document.querySelectorAll('link[rel="stylesheet"]')]
      .map(link => link.getAttribute("href")?.split(/[?#]/)[0]),
    stylesVersioned: [...document.querySelectorAll('link[rel="stylesheet"]')]
      .every(link => new URL(link.href).searchParams.get("v")
        === document.querySelector('meta[name="game-build"]')?.content),
  }))).toEqual({
    hall: false,
    battle: false,
    dungeon: false,
    hallCollection: "undefined",
    hallModules: Array(5).fill("undefined"),
    battleUi: ["undefined", "undefined", "undefined"],
    scripts: startupBundlePaths,
    versionedEntries: true,
    styles: [
      "base.css",
      "villa.css",
      "info-victory.css",
      "animations.css",
      "save-slots.css",
      "gothic-theme.css",
      "gothic-start.css",
    ],
    stylesVersioned: true,
  });
  expect(await page.evaluate(() => [
    "./nonoka-idol-skin.css",
    "./manny-gun-skin.css",
    "./bertis-queen-skin.css",
    "./character-skin-fx.css",
    "./battle-victory.css",
  ].filter(href => [...document.querySelectorAll('link[rel="stylesheet"]')]
    .some(link => link.dataset.gameStyleSource === href)))).toEqual([]);
  const battleLoad = await page.evaluate(async () => {
    const insertBefore = document.head.insertBefore.bind(document.head);
    let styleFailures = 2;
    document.head.insertBefore = (node, anchor) => {
      if (node.dataset?.gameStyle === "battle"
        && node.dataset.gameStyleSource === "./battle-style.css" && styleFailures) {
        styleFailures -= 1;
        queueMicrotask(() => node.onerror?.());
        return node;
      }
      return insertBefore(node, anchor);
    };
    const first = await window.GameBundles.load("battle").then(
      () => "resolved",
      error => error.code
    );
    const stagedAfterFailure = [...document.querySelectorAll('link[data-game-style="battle"]')]
      .map(link => link.media);
    document.head.insertBefore = insertBefore;
    await Promise.all([
      window.GameBundles.load("battle"),
      window.GameBundles.load("battle"),
      window.GameBundles.load("battle"),
    ]);
    const mediaAfterRetry = [...document.querySelectorAll('link[data-game-style="battle"]')]
      .map(link => link.media);
    return { first, failedAttempts: 2 - styleFailures, stagedAfterFailure, mediaAfterRetry };
  });
  expect(battleLoad.first).toBe("SCENE_STYLE_LOAD_FAILED");
  expect(battleLoad.failedAttempts).toBe(2);
  expect(battleLoad.stagedAfterFailure.length).toBeGreaterThan(0);
  expect(new Set(battleLoad.stagedAfterFailure)).toEqual(new Set(["not all"]));
  expect(new Set(battleLoad.mediaAfterRetry)).toEqual(new Set(["all"]));
  expect(await page.evaluate(() => ({
    battle: window.GameBundles.isReady("battle"),
    dungeon: window.GameBundles.isReady("dungeon"),
    battleUi: [
      window.GameUIBattlePickers,
      window.GameUIBattleTargeting,
      window.GameUIBattleUnits,
    ].map(value => typeof value),
    battleScripts: [...document.querySelectorAll('script[data-game-bundle="battle"]')]
      .map(script => script.dataset.gameBundlePart?.split("/").pop()),
    battleStyles: document.querySelectorAll('link[data-game-style="battle"]').length,
  }))).toEqual({
    battle: true,
    dungeon: false,
    battleUi: ["function", "object", "function"],
    battleScripts: [
      "battle-rules.min.js",
      "battle-skills.min.js",
      "battle-flow.min.js",
      "battle-ai.min.js",
      "battle-presentation.min.js",
      "battle-ui.min.js",
    ],
    battleStyles: 8,
  });
  const optionalStyles = await page.evaluate(async () => {
    window.state.testSkins.nonoka = "nonoka_idol_rising_star";
    await window.GameBundles.load("battle", {
      state: window.state, test: true, allyIds: ["nonoka"],
    });
    const afterNonoka = [...document.querySelectorAll('link[data-game-style="battle"]')]
      .map(link => link.dataset.gameStyleSource);
    window.state.testSkins.manny = "manny_gun_succubus";
    await window.GameBundles.load("battle", {
      state: window.state, test: true, allyIds: ["manny"],
    });
    const afterManny = [...document.querySelectorAll('link[data-game-style="battle"]')]
      .map(link => link.dataset.gameStyleSource);
    return { afterNonoka, afterManny };
  });
  expect(optionalStyles.afterNonoka).toContain("./nonoka-idol-skin.css");
  expect(optionalStyles.afterNonoka).not.toContain("./manny-gun-skin.css");
  expect(optionalStyles.afterManny).toContain("./nonoka-idol-skin.css");
  expect(optionalStyles.afterManny).toContain("./manny-gun-skin.css");
  const failedDungeonLoads = await page.evaluate(async () => {
    const append = document.head.append.bind(document.head);
    let failure = "invalid";
    document.head.append = node => {
      if (node.dataset?.gameBundle === "dungeon" && failure) {
        const current = failure;
        failure = current === "invalid" ? "network" : null;
        queueMicrotask(() => current === "invalid" ? node.onload?.() : node.onerror?.());
        return node;
      }
      return append(node);
    };
    const attempt = () => window.GameBundles.load("dungeon").then(
      () => "resolved",
      error => error.code
    );
    return [await attempt(), await attempt()];
  });
  expect(failedDungeonLoads).toEqual(["BUNDLE_INVALID", "BUNDLE_LOAD_FAILED"]);
  await page.evaluate(() => window.GameBundles.load("dungeon"));
  expect(await page.evaluate(() => ({
    battle: window.GameBundles.isReady("battle"),
    dungeon: window.GameBundles.isReady("dungeon"),
    dungeonScripts: document.querySelectorAll('script[data-game-bundle="dungeon"]').length,
    dungeonStyles: document.querySelectorAll('link[data-game-style="dungeon"]').length,
  }))).toEqual({ battle: true, dungeon: true, dungeonScripts: 1, dungeonStyles: 1 });
});

test("a failed battle bundle part resumes without reloading completed parts", async ({ page }) => {
  await openGame(page, { loadFeatures: false });
  const result = await page.evaluate(async () => {
    const append = document.head.append.bind(document.head);
    let failed = false;
    document.head.append = node => {
      if (!failed && node.dataset?.gameBundlePart?.endsWith("/battle-skills.min.js")) {
        failed = true;
        queueMicrotask(() => node.onerror?.());
        return node;
      }
      return append(node);
    };
    const first = await window.GameBundles.load("battle").then(
      () => "resolved",
      error => error.code
    );
    document.head.append = append;
    const afterFailure = [...document.querySelectorAll('script[data-game-bundle="battle"]')]
      .map(script => script.dataset.gameBundlePart?.split("/").pop());
    await window.GameBundles.load("battle");
    const afterRetry = [...document.querySelectorAll('script[data-game-bundle="battle"]')]
      .map(script => script.dataset.gameBundlePart?.split("/").pop());
    return { first, afterFailure, afterRetry };
  });
  expect(result).toEqual({
    first: "BUNDLE_LOAD_FAILED",
    afterFailure: ["battle-rules.min.js"],
    afterRetry: [
      "battle-rules.min.js",
      "battle-skills.min.js",
      "battle-flow.min.js",
      "battle-ai.min.js",
      "battle-presentation.min.js",
      "battle-ui.min.js",
    ],
  });
});

test("hall collection bundle loads before entering a new game", async ({ page }) => {
  await openGame(page, { loadFeatures: false });
  await startFreshGame(page);
  expect(await page.evaluate(() => ({
    ready: window.GameBundles.isReady("hall"),
    collection: typeof window.VillaCollectionUI,
    hallModules: [
      window.VillaUI,
      window.SuccubusCodex,
      window.ShopSystem,
      window.BountySystem,
      window.AppHallBindings,
    ].map(value => typeof value),
    scripts: document.querySelectorAll('script[data-game-bundle="hall"]').length,
  }))).toEqual({
    ready: true,
    collection: "function",
    hallModules: ["object", "object", "object", "object", "object"],
    scripts: 1,
  });
  await page.locator("[data-open-modal='deck']").click();
  await expect(page.getByRole("heading", { name: "公共牌库" })).toBeVisible();
});

test("a transient battle stylesheet failure retries before scene startup aborts", async ({ page }) => {
  await openGame(page, { loadFeatures: false });
  const result = await page.evaluate(async () => {
    const insertBefore = document.head.insertBefore.bind(document.head);
    let failures = 1;
    let attempts = 0;
    document.head.insertBefore = (node, anchor) => {
      if (node.dataset?.gameStyle === "battle"
        && node.dataset.gameStyleSource === "./battle-units.css") {
        attempts += 1;
        if (failures) {
          failures -= 1;
          queueMicrotask(() => node.onerror?.());
          return node;
        }
      }
      return insertBefore(node, anchor);
    };
    const outcome = await window.GameBundles.load("battle").then(
      () => "resolved",
      error => error.code
    );
    document.head.insertBefore = insertBefore;
    return {
      outcome,
      attempts,
      ready: window.GameBundles.isReady("battle"),
      media: [...document.querySelectorAll('link[data-game-style="battle"]')]
        .map(link => link.media),
    };
  });
  expect(result).toEqual({
    outcome: "resolved",
    attempts: 2,
    ready: true,
    media: Array(8).fill("all"),
  });
});

test("a failed optional skin stylesheet stays retryable", async ({ page }) => {
  await openGame(page, { loadFeatures: false });
  await page.evaluate(() => window.GameBundles.load("battle"));
  const result = await page.evaluate(async () => {
    const insertBefore = document.head.insertBefore.bind(document.head);
    let failures = 2;
    document.head.insertBefore = (node, anchor) => {
      if (node.dataset.gameStyleSource === "./bertis-queen-skin.css" && failures) {
        failures -= 1;
        queueMicrotask(() => node.onerror?.());
        return node;
      }
      return insertBefore(node, anchor);
    };
    const context = {
      state: window.state,
      skinIds: ["bertis_arrogant_queen"],
    };
    const first = await window.GameBundles.load("battle", context).then(
      () => "resolved",
      error => error.code,
    );
    document.head.insertBefore = insertBefore;
    const second = await window.GameBundles.load("battle", context).then(
      () => "resolved",
      error => error.code,
    );
    return {
      first,
      second,
      hrefs: [...document.querySelectorAll('link[data-game-style="battle"]')]
        .map(link => link.dataset.gameStyleSource),
    };
  });
  expect(result.first).toBe("SCENE_STYLE_LOAD_FAILED");
  expect(result.second).toBe("resolved");
  expect(result.hrefs).toContain("./bertis-queen-skin.css");
});
