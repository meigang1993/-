const { test, expect } = require("@playwright/test");
const { startRegressionBattle } = require("./helpers/preview-game");

async function waitForBattleIdle(page) {
  await expect.poll(() => page.evaluate(() => ({
    animating: window.BattleEffects.animating,
    draining: window.BattleEffects.draining,
    frozen: window.BattleEffects.renderFrozen,
  })), { timeout: 5000 }).toEqual({
    animating: false,
    draining: false,
    frozen: false,
  });
}

test("rapid target confirmations commit once and the next card still plays", async ({ page }) => {
  test.setTimeout(45000);
  await startRegressionBattle(page);
  await page.evaluate(() => {
    const battle = window.state.battle, actor = battle.allies[0], enemy = battle.enemies[0];
    actor.hand = [
      { name: "杀（普攻）", type: "slash", power: 1, scale: "attack", suit: "♠", _stressId: "first" },
      { name: "杀（普攻）", type: "slash", power: 1, scale: "attack", suit: "♣", _stressId: "second" },
    ];
    actor.skills = (actor.skills || []).filter(skill => skill.name !== "战斗之勇");
    actor.discard = [];
    actor.intent = 10;
    enemy.hp = enemy.maxHp = 999;
    enemy.block = 0;
    enemy.defenseSystem = 0;
    enemy.hand = [];
    battle.activeUid = actor.uid;
    battle.phase = 4;
    battle.locked = false;
    battle.selectedCardIndex = 0;
    battle.selectedSkillCard = null;
    battle.pendingTargetUid = enemy.uid;
    window.__stressCommits = 0;
    window.__stressOriginalPlay = window.BattleSystem.playSelectedCard;
    window.BattleSystem.playSelectedCard = function stressCountedPlay(...args) {
      window.__stressCommits += 1;
      return window.__stressOriginalPlay.apply(this, args);
    };
    window.render();
    const confirm = document.querySelector("[data-confirm-target]");
    for (let i = 0; i < 12; i += 1) confirm.click();
  });
  await waitForBattleIdle(page);
  expect(await page.evaluate(() => window.__stressCommits)).toBe(1);

  await page.evaluate(() => {
    const battle = window.state.battle, enemy = battle.enemies[0];
    battle.selectedCardIndex = 0;
    battle.pendingTargetUid = enemy.uid;
    window.render();
    const confirm = document.querySelector("[data-confirm-target]");
    for (let i = 0; i < 12; i += 1) confirm.click();
  });
  await waitForBattleIdle(page);
  const result = await page.evaluate(() => {
    const actor = window.state.battle.allies[0];
    const discard = actor.pileStats?.discard || actor.discard || [];
    window.BattleSystem.playSelectedCard = window.__stressOriginalPlay;
    delete window.__stressOriginalPlay;
    return {
      commits: window.__stressCommits,
      discarded: discard.filter(card => card._stressId).map(card => card._stressId),
      remaining: actor.hand.filter(card => card._stressId).map(card => card._stressId),
      selected: window.state.battle.selectedCardIndex,
    };
  });
  expect(result).toEqual({
    commits: 2,
    discarded: ["first", "second"],
    remaining: [],
    selected: null,
  });
});

test("targetless click and double-click competition commits once", async ({ page }) => {
  await startRegressionBattle(page);
  await page.evaluate(() => {
    const battle = window.state.battle, actor = battle.allies[0];
    actor.hand = [{
      name: "机枪扫杀", type: "slash", power: 1, sweep: true,
      targetless: true, suit: "♥", _stressId: "targetless",
    }];
    actor.skills = (actor.skills || []).filter(skill => skill.name !== "战斗之勇");
    actor.discard = [];
    actor.intent = 10;
    battle.enemies.forEach(enemy => {
      enemy.hp = enemy.maxHp = 999;
      enemy.block = 0;
      enemy.defenseSystem = 0;
      enemy.hand = [];
    });
    battle.activeUid = actor.uid;
    battle.phase = 4;
    battle.locked = false;
    battle.selectedCardIndex = 0;
    battle.selectedSkillCard = null;
    battle.pendingTargetUid = null;
    window.__stressTargetlessCommits = 0;
    window.__stressTargetlessOriginal = window.BattleSystem.playSelectedCard;
    window.BattleSystem.playSelectedCard = function stressTargetlessPlay(...args) {
      window.__stressTargetlessCommits += 1;
      return window.__stressTargetlessOriginal.apply(this, args);
    };
    window.render();
    const card = document.querySelector("[data-card-index='0']");
    card.click();
    card.click();
    card.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  });
  await waitForBattleIdle(page);
  const result = await page.evaluate(() => {
    const actor = window.state.battle.allies[0];
    const discard = actor.pileStats?.discard || actor.discard || [];
    window.BattleSystem.playSelectedCard = window.__stressTargetlessOriginal;
    delete window.__stressTargetlessOriginal;
    return {
      commits: window.__stressTargetlessCommits,
      discarded: discard.filter(card => card._stressId).length,
      remaining: actor.hand.filter(card => card._stressId).length,
    };
  });
  expect(result).toEqual({ commits: 1, discarded: 1, remaining: 0 });
});

test("commit failure releases the animation lock and allows retry", async ({ page }) => {
  await startRegressionBattle(page);
  await page.evaluate(() => {
    const battle = window.state.battle, actor = battle.allies[0], enemy = battle.enemies[0];
    actor.hand = [{
      name: "杀（普攻）", type: "slash", power: 1, scale: "attack",
      suit: "♦", _stressId: "retry",
    }];
    actor.skills = (actor.skills || []).filter(skill => skill.name !== "战斗之勇");
    actor.discard = [];
    actor.intent = 10;
    enemy.hp = enemy.maxHp = 999;
    enemy.block = 0;
    enemy.defenseSystem = 0;
    enemy.hand = [];
    battle.activeUid = actor.uid;
    battle.phase = 4;
    battle.locked = false;
    battle.selectedCardIndex = 0;
    battle.selectedSkillCard = null;
    battle.pendingTargetUid = enemy.uid;
    window.__stressFailureOriginal = window.BattleSystem.playSelectedCard;
    window.BattleSystem.playSelectedCard = () => {
      throw new Error("strict injected commit failure");
    };
    window.render();
    document.querySelector("[data-confirm-target]").click();
  });
  await waitForBattleIdle(page);
  const recovered = await page.evaluate(() => ({
    locked: window.state.battle.locked,
    selected: window.state.battle.selectedCardIndex,
    handCount: window.state.battle.allies[0].hand.filter(card => card._stressId === "retry").length,
    flyingCards: document.querySelectorAll(".flying-card").length,
    targetLines: document.querySelectorAll(".target-line.show").length,
  }));
  expect(recovered).toEqual({
    locked: false,
    selected: null,
    handCount: 1,
    flyingCards: 0,
    targetLines: 0,
  });

  await page.evaluate(() => {
    const battle = window.state.battle, enemy = battle.enemies[0];
    window.BattleSystem.playSelectedCard = window.__stressFailureOriginal;
    delete window.__stressFailureOriginal;
    battle.selectedCardIndex = 0;
    battle.pendingTargetUid = enemy.uid;
    window.render();
    document.querySelector("[data-confirm-target]").click();
  });
  await waitForBattleIdle(page);
  expect(await page.evaluate(() => {
    const actor = window.state.battle.allies[0];
    const discard = actor.pileStats?.discard || actor.discard || [];
    return {
      discarded: discard.filter(card => card._stressId === "retry").length,
      remaining: actor.hand.filter(card => card._stressId === "retry").length,
    };
  })).toEqual({ discarded: 1, remaining: 0 });
});
