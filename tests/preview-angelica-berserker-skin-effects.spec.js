const { test, expect } = require("@playwright/test");
const {
  collectErrors, relevantErrors, openGame, startFreshGame,
  openTestBattle,
} = require("./helpers/preview-game");

test("Angelica Imperial Blood Slaying renders battle effects and victory scene", async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  await openTestBattle(page);
  await page.locator("[data-test-ally='angelica']").click();
  await page.evaluate(() => {
    window.state.ownedSkins.angelica_berserker = true;
    window.state.testSkins.angelica = "angelica_berserker";
    window.GameAssets.preloadBattle = async () => {};
    window.BattleEffects.whenIdle = async () => {};
    window.BattleFX.playBattleStart = callback => callback?.();
  });
  await page.locator("[data-start-test-battle]").click();
  await expect(page.locator(".battle-screen")).toBeVisible();
  await page.evaluate(() => {
    const battle = window.state.battle;
    battle.animQueue = [];
    battle.locked = false;
    battle.phase = 4;
    battle.activeUid = battle.allies.find(unit => unit.ref === "angelica").uid;
    window.BattleEffects.recover(window.state);
    window.render();
  });
  await expect(page.locator(".unit-art img").first()).toBeVisible();

  const effectCounts = await page.evaluate(() => {
    const state = window.state;
    const battle = state.battle;
    const actor = battle.allies.find(unit => unit.ref === "angelica");
    const target = battle.enemies[0];
    window.AngelicaBerserkerSkinFX.cancel();
    window.AngelicaBerserkerSkinFX.entry(state, actor);
    window.AngelicaBerserkerSkinFX.might(state, actor, { type: "slash" });
    window.AngelicaBerserkerSkinFX.rageGain(state, actor, true);
    window.AngelicaBerserkerSkinFX.rageSpend(state, actor, 4);
    window.AngelicaBerserkerSkinFX.rageTrail(state, actor, target);
    window.AngelicaBerserkerSkinFX.crimsonRampage(state, actor, 3);
    return {
      entry: document.querySelectorAll(".angelica-berserker-entry").length,
      might: document.querySelectorAll(".angelica-berserker-might").length,
      rageGain: document.querySelectorAll(".angelica-berserker-rage-gain").length,
      rageSpend: document.querySelectorAll(".angelica-berserker-rage-slam").length,
      rageTrail: document.querySelectorAll(".angelica-berserker-rage-trail").length,
      crimsonRampage: document.querySelectorAll(".angelica-berserker-rampage-armor").length,
      entering: document.querySelectorAll(".angelica-berserker-entering").length,
    };
  });
  // might / rageSpend 走 action-first 锚点，会同时在 .portrait 与 .unit-art
  // 各挂载一份镜像节点（与 manny 皮肤特效测试口径一致），因此计数为 2。
  expect(effectCounts).toMatchObject({
    entry: 1, might: 2, rageGain: 1, rageSpend: 2, rageTrail: 1, crimsonRampage: 1,
  });
  expect(effectCounts.entering).toBe(1);

  await page.evaluate(() => {
    window.AngelicaBerserkerSkinFX.cancel();
    window.state.battle.victoryScreen = true;
    window.state.battle.locked = true;
    window.render();
  });
  await expect(page.locator(".victory-screen.angelica-berserker-victory")).toBeVisible();
  await expect(page.locator(".angelica-berserker-victory-art img")).toBeVisible();
  await expect(page.locator(".angelica-victory-embers i")).toHaveCount(5);
  await expect(page.locator(".angelica-victory-motto")).toHaveText("帝血未冷，下一场继续。");

  const layout = await page.evaluate(() => {
    const screen = document.querySelector(".victory-screen");
    const stats = document.querySelector(".victory-stats");
    const art = document.querySelector(".angelica-berserker-victory-show");
    return {
      horizontalOverflow: screen.scrollWidth - screen.clientWidth,
      verticalOverflow: screen.scrollHeight - screen.clientHeight,
      statsVisible: stats.getBoundingClientRect().width > 0,
      artVisible: art.getBoundingClientRect().width > 0,
    };
  });
  expect(layout).toEqual({
    horizontalOverflow: 0,
    verticalOverflow: 0,
    statsVisible: true,
    artVisible: true,
  });
  expect(relevantErrors(errors)).toEqual([]);
});

test("Angelica Crimson Rampage plays staged effects and pulse rings", async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  await openTestBattle(page);
  await page.locator("[data-test-ally='angelica']").click();
  await page.evaluate(() => {
    window.state.ownedSkins.angelica_berserker = true;
    window.state.testSkins.angelica = "angelica_berserker";
    window.GameAssets.preloadBattle = async () => {};
    window.BattleEffects.whenIdle = async () => {};
    window.BattleFX.playBattleStart = callback => callback?.();
  });
  await page.locator("[data-start-test-battle]").click();
  await expect(page.locator(".battle-screen")).toBeVisible();
  await page.evaluate(() => {
    const battle = window.state.battle;
    battle.animQueue = [];
    battle.locked = false;
    battle.phase = 4;
    battle.activeUid = battle.allies.find(unit => unit.ref === "angelica").uid;
    window.BattleEffects.recover(window.state);
    window.render();
  });
  await expect(page.locator(".unit-art img").first()).toBeVisible();

  const staged = await page.evaluate(async () => {
    const state = window.state;
    const actor = state.battle.allies.find(unit => unit.ref === "angelica");
    const keys = ["armor", "burst", "shock", "giant", "heal", "pulse", "rain", "core"];
    const seen = {};
    const anims = {};
    const pulseIndexes = new Set();
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const snap = () => {
      keys.forEach(key => {
        const nodes = document.querySelectorAll(`.angelica-berserker-rampage-${key}`);
        if (nodes.length) {
          seen[key] = Math.max(seen[key] || 0, nodes.length);
          const holder = nodes[0].querySelector("b") || nodes[0];
          if (holder && !anims[key]) anims[key] = getComputedStyle(holder).animationName;
        }
      });
      document.querySelectorAll(".angelica-berserker-rampage-pulse").forEach(node => {
        pulseIndexes.add(node.style.getPropertyValue("--pulse-index").trim());
      });
    };
    window.AngelicaBerserkerSkinFX.cancel();
    window.AngelicaBerserkerSkinFX.crimsonRampage(state, actor, 4);
    snap();
    for (let i = 0; i < 16; i += 1) { await wait(220); snap(); }
    return { seen, anims, pulseIndexes: Array.from(pulseIndexes).sort() };
  });

  // 血甲收束、冲击波、巨人虚影、脉冲光环、血雨与胸口核心依次出现
  ["armor", "burst", "shock", "giant", "heal", "pulse", "rain", "core"].forEach(key => {
    expect(staged.seen[key], `Crimson Rampage must render ${key} stage`).toBeGreaterThan(0);
  });
  // 弃置4枚标记 -> 脉冲光环连续触发，每圈携带独立序号
  expect(staged.pulseIndexes.length).toBeGreaterThanOrEqual(2);
  // 样式表已生效：关键阶段使用专属关键帧
  expect(staged.anims.armor).toBe("imperialArmorClench");
  expect(staged.anims.giant).toBe("imperialGiantRise");
  expect(relevantErrors(errors)).toEqual([]);
});
