const { test, expect } = require("@playwright/test");
const {
  collectErrors, relevantErrors, startRegressionBattle,
} = require("./helpers/preview-game");
const { prepareBattleTrail, verifyBattleLogPanel } = require("./helpers/battle-ui-trail");
const { verifyBattleResponsiveLayout, verifyBattleResponseTrail } = require("./helpers/battle-ui-layout");

test("temporary combo attack keeps its source card beside coordinated Slashes", async ({ page }) => {
  test.setTimeout(45000);
  await startRegressionBattle(page);
  const result = await page.evaluate(async () => {
    const battle = window.state.battle;
    const actor = battle.allies[0];
    let partner = battle.allies[1];
    if (!partner) {
      partner = {
        ...actor, uid: `${actor.uid}-combo-partner`, name: `${actor.name}协攻`,
        hand: [], deck: [], discard: [], consumed: [], skills: [],
      };
      battle.allies.push(partner);
    }
    const target = battle.enemies.find(unit => unit.hp > 0);
    const combo = {
      ...window.GameData.cardCodex.find(card => card.name === "组合进攻"),
      suit: "♥", temporary: true, void: true, wendyTutorGenerated: true,
    };
    actor.hand = [combo];
    actor.skills = [];
    actor.intent = 10;
    partner.skills = [];
    battle.enemies.forEach(unit => { unit.hand = []; });
    target.hp = target.maxHp = 999;
    target.block = 0;
    target.defenseSystem = 0;
    battle.activeUid = actor.uid;
    battle.phase = 4;
    battle.locked = false;
    battle.selectedCardIndex = 0;
    battle.selectedSkillCard = null;
    battle.pendingTargetUid = null;
    battle.comboPartnerUid = null;
    const enemyFirstRejected = !window.BattleSystem.chooseTarget(window.state, target.uid);
    const partnerChosen = window.BattleSystem.chooseTarget(window.state, partner.uid);
    const partnerFirstState = {
      partnerMatches: battle.comboPartnerUid === partner.uid,
      targetEmpty: battle.pendingTargetUid == null,
    };
    const targetChosen = window.BattleSystem.chooseTarget(window.state, target.uid);
    const waitingForUse = actor.hand.includes(combo) && !battle.locked;
    window.render();
    const useButtonReady = !document.querySelector("[data-confirm-target]")?.disabled;
    await window.BattleEffects.play(window.state, () => {
      const played = window.BattleSystem.playSelectedCard(window.state);
      if (played) window.render();
      return played;
    });
    await window.BattleEffects.whenIdle();
    window.render();
    const cards = [...document.querySelectorAll(".public-zone .play-card")];
    return {
      sourceCount: battle.played.filter(card => card.name === "组合进攻").length,
      comboSlashes: battle.played.filter(card => card.comboAttackVirtual).length,
      settled: battle.played.some(card =>
        card.name === "组合进攻" && card._destinationSettled),
      consumed: (actor.consumed || actor.pileStats?.consumed || [])
        .some(card => card.name === "组合进攻"),
      inHand: actor.hand.some(card => card.name === "组合进攻"),
      visibleSource: cards.some(card => card.textContent.includes("组合进攻")),
      visibleComboMarks: cards.filter(card =>
        card.querySelector(".trail-kind.combo")).length,
      selection: {
        enemyFirstRejected, partnerChosen, partnerFirstState,
        targetChosen, waitingForUse, useButtonReady,
      },
    };
  });
  expect(result).toEqual({
    sourceCount: 1,
    comboSlashes: 2,
    settled: true,
    consumed: true,
    inHand: false,
    visibleSource: true,
    visibleComboMarks: 2,
    selection: {
      enemyFirstRejected: true,
      partnerChosen: true,
      partnerFirstState: { partnerMatches: true, targetEmpty: true },
      targetChosen: true,
      waitingForUse: true,
      useButtonReady: true,
    },
  });
});

test("combo attack confirms when the selected enemy is clicked again", async ({ page }) => {
  test.setTimeout(45000);
  await startRegressionBattle(page);
  const ids = await page.evaluate(() => {
    const battle = window.state.battle;
    const actor = battle.allies[0];
    const partner = battle.allies[1];
    const target = battle.enemies.find(unit => unit.hp > 0);
    actor.hand = [{
      ...window.GameData.cardCodex.find(card => card.name === "组合进攻"),
      suit: "♥",
    }];
    actor.skills = [];
    actor.intent = 10;
    partner.skills = [];
    target.hp = target.maxHp = 999;
    battle.enemies.forEach(unit => { unit.hand = []; });
    battle.activeUid = actor.uid;
    battle.phase = 4;
    battle.locked = false;
    battle.selectedCardIndex = null;
    battle.pendingTargetUid = null;
    battle.comboPartnerUid = null;
    window.render();
    return { actor: actor.uid, partner: partner.uid, target: target.uid };
  });
  await page.locator("[data-card-index='0']").click();
  await page.locator(`[data-target="${ids.partner}"]`).click();
  await page.locator(`[data-target="${ids.target}"]`).click();
  await expect.poll(() => page.evaluate(() => ({
    partner: window.state.battle.comboPartnerUid,
    target: window.state.battle.pendingTargetUid,
    inHand: window.BattleSystem.active(window.state.battle).hand
      .some(card => card.name === "组合进攻"),
  }))).toEqual({ partner: ids.partner, target: ids.target, inHand: true });
  await expect(page.locator("[data-confirm-target]")).toHaveText("使用");
  await page.locator(`[data-target="${ids.target}"]`).click();
  await expect.poll(() => page.evaluate(actorUid => {
    const actor = window.state.battle.allies.find(unit => unit.uid === actorUid);
    return actor.hand.some(card => card.name === "组合进攻");
  }, ids.actor)).toBe(false);
  await page.evaluate(() => window.BattleEffects.whenIdle());
  expect(await page.evaluate(() =>
    window.state.battle.played.some(card => card.name === "组合进攻"),
  )).toBe(true);
});
