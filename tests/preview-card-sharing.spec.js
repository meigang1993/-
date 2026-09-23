const { test, expect } = require("@playwright/test");
const { startRegressionBattle } = require("./helpers/preview-game");

test("New Moon transfers selected owner cards", async ({ page }) => {
  await startRegressionBattle(page);
  const newMoon = await page.evaluate(() => {
    const battle = window.state.battle, owner = battle.allies[1], target = battle.allies[0], enemy = battle.enemies[0];
    owner.hand = [
      { name: "新月交牌A", type: "tactic", suit: "♥", text: "测试。" },
      { name: "新月保留", type: "tactic", suit: "♦", text: "测试。" },
      { name: "新月交牌B", type: "tactic", suit: "♠", text: "测试。" },
    ];
    enemy.hand = [{ name: "新月敌方哨兵", type: "tactic", suit: "♣", text: "不得被操作。" }];
    battle.activeUid = target.uid;
    battle.phase = 6;
    battle.locked = false;
    battle.animQueue = [];
    battle.newMoonShare = { unitUid: owner.uid, count: 2, indexes: [] };
    window.render();
    return { ownerUid: owner.uid, targetUid: target.uid };
  });
  await expect(page.locator(".active-hand")).toHaveAttribute("data-hand-owner", newMoon.ownerUid);
  await page.locator("[data-card-index='0']").click();
  await expect(page.locator(`[data-target="${newMoon.targetUid}"]`)).not.toHaveClass(/selectable-target/);
  await page.locator("[data-card-index='2']").click();
  await expect(page.locator(`[data-target="${newMoon.targetUid}"]`)).toHaveClass(/selectable-target/);
  await page.locator(`[data-target="${newMoon.targetUid}"]`).click();
  await expect.poll(() => page.evaluate(() => {
    const battle = window.state.battle;
    return {
      promptCleared: !battle.newMoonShare,
      ownerCards: battle.allies[1].hand.filter(card => card.name.startsWith("新月")).map(card => card.name),
      targetCards: battle.allies[0].hand.filter(card => card.name.startsWith("新月")).map(card => card.name),
      enemyCards: battle.enemies[0].hand.map(card => card.name),
    };
  })).toEqual({
    promptCleared: true,
    ownerCards: ["新月保留"],
    targetCards: ["新月交牌A", "新月交牌B"],
    enemyCards: ["新月敌方哨兵"],
  });
});

test("Half-Succubus Blood transfers selected owner cards", async ({ page }) => {
  await startRegressionBattle(page);
  const blood = await page.evaluate(() => {
    const battle = window.state.battle, owner = battle.allies[1], target = battle.allies[0], enemy = battle.enemies[0];
    owner.hand = [
      { name: "魅魔血交牌A", type: "tactic", suit: "♥", text: "测试。" },
      { name: "魅魔血保留", type: "tactic", suit: "♦", text: "测试。" },
      { name: "魅魔血交牌B", type: "tactic", suit: "♠", text: "测试。" },
    ];
    battle.activeUid = enemy.uid;
    battle.phase = 4;
    battle.animQueue = [];
    battle.kaiichiShareQueue = [];
    battle.kaiichiShare = {
      unitUid: owner.uid, sourceUid: enemy.uid, maxCount: 2, indexes: [],
      resumeEnemyUid: null, resumeUnitUid: null, resumePhase: null,
    };
    battle.locked = true;
    window.render();
    return { ownerUid: owner.uid, targetUid: target.uid };
  });
  await expect(page.locator(".active-hand")).toHaveAttribute("data-hand-owner", blood.ownerUid);
  await page.locator("[data-card-index='0']").click();
  await page.locator("[data-card-index='2']").click();
  await expect(page.locator(`[data-target="${blood.targetUid}"]`)).toHaveClass(/selectable-target/);
  await page.locator(`[data-target="${blood.targetUid}"]`).click();
  await expect.poll(() => page.evaluate(() => {
    const battle = window.state.battle;
    return {
      promptCleared: !battle.kaiichiShare,
      unlocked: !battle.locked,
      ownerCards: battle.allies[1].hand.filter(card => card.name.startsWith("魅魔血")).map(card => card.name),
      targetCards: battle.allies[0].hand.filter(card => card.name.startsWith("魅魔血")).map(card => card.name),
    };
  })).toEqual({
    promptCleared: true,
    unlocked: true,
    ownerCards: ["魅魔血保留"],
    targetCards: ["魅魔血交牌A", "魅魔血交牌B"],
  });
});

test("Harvest Share card clicks follow the prompt owner after active unit changes", async ({ page }) => {
  await startRegressionBattle(page);
  const ids = await page.evaluate(() => {
    const battle = window.state.battle, owner = battle.allies[1], target = battle.allies[0], enemy = battle.enemies[0];
    owner.ref = "miller";
    owner.skills = [{ name: "收获分享", type: "trigger", text: "测试。" }];
    owner.stats.handLimit = 1;
    owner.hand = [
      { name: "收获交牌A", type: "tactic", suit: "♥", text: "测试。" },
      { name: "收获交牌B", type: "tactic", suit: "♦", text: "测试。" },
      { name: "收获保留", type: "tactic", suit: "♠", text: "测试。" },
    ];
    enemy.hand = [{ name: "敌方保留牌", type: "tactic", suit: "♣", text: "不得被操作。" }];
    battle.activeUid = enemy.uid;
    battle.phase = 5;
    battle.locked = false;
    battle.animQueue = [];
    const selected = owner.hand[0];
    battle.millerShare = { unitUid: owner.uid, indexes: [0], cards: [selected] };
    owner.hand.unshift(
      { name: "收获后插入", type: "tactic", suit: "♣", text: "不得被交出。" },
    );
    window.render();
    return { ownerUid: owner.uid, targetUid: target.uid, enemyUid: enemy.uid };
  });
  await expect(page.locator(".active-hand")).toHaveAttribute("data-hand-owner", ids.ownerUid);
  await page.locator("[data-card-index='2']").click();
  await expect.poll(() => page.evaluate(() => ({
    picked: window.state.battle.millerShare?.indexes || [],
    enemyCards: window.state.battle.enemies[0].hand.map(card => card.name),
  }))).toEqual({
    picked: [1, 2],
    enemyCards: ["敌方保留牌"],
  });
  await page.locator(`[data-target="${ids.targetUid}"]`).click();
  await expect.poll(() => page.evaluate(() => {
    const battle = window.state.battle;
    return {
      promptCleared: !battle.millerShare,
      ownerCards: battle.allies[1].hand.filter(card => card.name.startsWith("收获")).map(card => card.name),
      targetCards: battle.allies[0].hand.filter(card => card.name.startsWith("收获")).map(card => card.name),
      enemyCards: battle.enemies[0].hand.map(card => card.name),
    };
  })).toEqual({
    promptCleared: true,
    ownerCards: ["收获后插入", "收获保留"],
    targetCards: ["收获交牌A", "收获交牌B"],
    enemyCards: ["敌方保留牌"],
  });
});

test("transfer decline buttons leave the owner hand unchanged", async ({ page }) => {
  await startRegressionBattle(page);
  const ownerUid = await page.evaluate(() => {
    const battle = window.state.battle, owner = battle.allies[1], enemy = battle.enemies[0];
    owner.hand = [{ name: "不交测试牌", type: "tactic", suit: "♥", text: "测试。" }];
    battle.activeUid = enemy.uid;
    battle.phase = 4;
    battle.animQueue = [];
    battle.kaiichiShareQueue = [];
    battle.kaiichiShare = {
      unitUid: owner.uid, sourceUid: enemy.uid, maxCount: 1, indexes: [0],
      resumeEnemyUid: null, resumeUnitUid: null, resumePhase: null,
    };
    battle.locked = true;
    window.render();
    return owner.uid;
  });
  await page.locator("[data-kaiichi-share-skip]").first().click();
  await expect.poll(() => page.evaluate(uid => {
    const battle = window.state.battle, owner = battle.allies.find(unit => unit.uid === uid);
    return { promptCleared: !battle.kaiichiShare, unlocked: !battle.locked, cards: owner.hand.map(card => card.name) };
  }, ownerUid)).toEqual({
    promptCleared: true,
    unlocked: true,
    cards: ["不交测试牌"],
  });
});
