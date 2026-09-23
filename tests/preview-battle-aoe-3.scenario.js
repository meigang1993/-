const { test, expect } = require("@playwright/test");
const {
  startRegressionBattle, prepareAoeLineCapture, capturedAoeLineCount,
} = require("./helpers/preview-game");

test("target line color follows the acting side", async ({ page }) => {
  await startRegressionBattle(page);
  const result = await page.evaluate(async () => {
    const battle = window.state.battle;
    const actor = battle.allies[0];
    while (battle.enemies.filter(unit => unit.hp > 0).length < 2) {
      battle.enemies.push({
        ...battle.enemies[0],
        uid: `line-enemy-${battle.enemies.length}`,
        hand: [],
        hp: 10,
        maxHp: 10,
      });
    }
    const targets = battle.enemies.filter(unit => unit.hp > 0).slice(0, 2);
    actor.hand = [{
      name: "灵魂锁链", type: "tactic", soulChain: true, suit: "♠",
    }];
    battle.activeUid = actor.uid;
    battle.phase = 4;
    battle.locked = false;
    battle.selectedCardIndex = 0;
    battle.selectedSkillCard = null;
    battle.pendingTargetUid = targets[0].uid;
    battle.pendingTargetUids = targets.map(unit => unit.uid);
    window.render();
    window.BattleEffects.sync(window.state);
    const aimed = {
      count: document.querySelectorAll(".target-line.aoe-line.show").length,
      red: document.querySelectorAll(".target-line.aoe-line.enemy-line").length,
    };
    window.BattleEffectUtils.hideLine();
    const used = window.BattleSystem.playSelectedCard(window.state);
    const soulChain = {
      used,
      played: battle.played.filter(card => card.name === "灵魂锁链").length,
      queuedCopies: battle.animQueue.filter(event =>
        event.type === "virtualPlay"
          && event.card?.name === "灵魂锁链").length,
    };

    const colors = [];
    const effectUtils = {
      ...window.BattleEffectUtils,
      setLines(...args) {
        colors.push(!!args[3]);
        window.BattleEffectUtils.setLines(...args);
      },
    };
    const effects = window.BattleEffectCards(effectUtils);
    await effects.virtualPlay(window.state, {
      uid: actor.uid,
      side: actor.side,
      targetUids: targets.map(unit => unit.uid),
      card: { name: "我方虚拟群攻", type: "slash", targetless: true },
      show: false,
    }, () => {}, () => true);
    await effects.virtualPlay(window.state, {
      uid: targets[0].uid,
      side: targets[0].side,
      targetUids: [actor.uid],
      card: { name: "敌方虚拟攻击", type: "slash", targetless: true },
      show: false,
    }, () => {}, () => true);
    return { aimed, soulChain, colors };
  });
  expect(result).toEqual({
    aimed: { count: 2, red: 0 },
    soulChain: { used: true, played: 1, queuedCopies: 0 },
    colors: [false, true],
  });
  await expect(page.locator(".target-line.aoe-line")).toHaveCount(0);
});
