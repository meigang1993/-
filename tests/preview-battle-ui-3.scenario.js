const { test, expect } = require("@playwright/test");
const {
  collectErrors, relevantErrors, startRegressionBattle,
} = require("./helpers/preview-game");
const { prepareBattleTrail, verifyBattleLogPanel } = require("./helpers/battle-ui-trail");
const { verifyBattleResponsiveLayout, verifyBattleResponseTrail } = require("./helpers/battle-ui-layout");

test("Joker Carnival suit appears on Raff portraits after judgement animation", async ({ page }) => {
  await startRegressionBattle(page);
  await page.evaluate(() => {
    const battle = window.state.battle;
    const raff = battle.enemies[0];
    raff.ai = "raff_assassin";
    raff.name = "内英组杀手拉芙";
    raff.deck = [{ name: "判定牌", type: "tactic", suit: "♦" }];
    raff.discard = [];
    window.UnderwaterTrainSkills.prepare(window.state, raff, () => {});
    battle.activeUid = raff.uid;
    battle.phase = 4;
    battle.locked = false;
    window.render();
    window.BattleEffects.drain(window.state, window.render);
  });
  await expect(page.locator(".judgement-popup")).toBeVisible();
  await expect(page.locator(".joker-suit-badge")).toHaveCount(0);
  await expect(page.locator(".judgement-popup")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.state.battle.enemies[0].jokerSuit)).toBe("♦");
  const result = await page.evaluate(() => {
    const battle = window.state.battle;
    const raff = battle.enemies[0];
    battle.activeUid = raff.uid;
    battle.phase = 4;
    battle.locked = false;
    window.render();
    const battlefield = document.querySelector(`[data-target="${raff.uid}"] .joker-suit-badge`);
    const active = document.querySelector(".active-portrait-shell .joker-suit-badge");
    const inside = (badge, portrait) => {
      if (!badge || !portrait) return false;
      const mark = badge.getBoundingClientRect();
      const art = portrait.getBoundingClientRect();
      return mark.left >= art.left && mark.right <= art.right && mark.top >= art.top && mark.bottom <= art.bottom;
    };
    return {
      suit: raff.jokerSuit,
      mode: raff.jokerMode,
      battlefieldText: battlefield?.textContent,
      activeText: active?.textContent,
      battlefieldInside: inside(battlefield, battlefield?.closest(".unit-main")?.querySelector(".unit-art")),
      activeInside: inside(active, active?.closest(".active-portrait-shell")?.querySelector(".portrait.large")),
    };
  });
  expect(result).toEqual({
    suit: "♦",
    mode: "red",
    battlefieldText: "♦",
    activeText: "♦",
    battlefieldInside: true,
    activeInside: true,
  });
});

test("player card use freezes redraw and settles on first impact", async ({ page }) => {
  await startRegressionBattle(page);
  const timing = await page.evaluate(async () => {
    const battle = window.state.battle, actor = battle.allies[0], enemy = battle.enemies.find(unit => unit.hp > 0);
    actor.hand[0] = {
      name: "杀（普攻）", type: "slash", power: 1, scale: "attack",
      suit: "♠", text: "测试出牌响应速度。",
    };
    actor.intent = Math.max(3, actor.intent || 0);
    enemy.hand = [];
    battle.activeUid = actor.uid;
    battle.phase = 4;
    battle.locked = false;
    battle.selectedCardIndex = 0;
    battle.selectedSkillCard = null;
    battle.pendingTargetUid = enemy.uid;
    window.render();
    const handRect = document.querySelector(".active-hand [data-card-index='0']").getBoundingClientRect();
    const handOrigin = { x: handRect.left + handRect.width / 2, y: handRect.top + handRect.height / 2 };
    const result = {
      click: 0, flight: 0, impact: 0, commit: 0, visible: 0, hitFx: 0, float: 0,
      lineDuringAim: false, flyingAtCommit: null, frozenAtCommit: null,
      frozenDuringFlight: null, stableDuringFlight: null, originDistance: null,
    };
    const original = window.BattleSystem.playSelectedCard;
    const originalLand = window.BattleFX.cardLand;
    let measuredFlight = null;
    window.BattleSystem.playSelectedCard = function measuredPlay(...args) {
      if (!result.commit) result.commit = performance.now();
      result.flyingAtCommit = !!document.querySelector(".flying-card");
      result.frozenAtCommit = window.BattleEffects.renderFrozen;
      return original.apply(this, args);
    };
    window.BattleFX.cardLand = function measuredImpact(...args) {
      if (result.click && !result.commit && measuredFlight?.isConnected) {
        result.impact = performance.now();
      }
      return originalLand.apply(this, args);
    };
    const observer = new MutationObserver(records => {
      const added = records.flatMap(record => [...record.addedNodes])
        .filter(node => node.nodeType === Node.ELEMENT_NODE);
      const contains = selector => added.some(node => node.matches?.(selector) || node.querySelector?.(selector));
      const playedFlight = added.find(node =>
        node.matches?.(".flying-card")
        && node.textContent?.includes("杀（普攻）"));
      if (!result.flight && playedFlight) {
        measuredFlight = playedFlight;
        result.flight = performance.now();
        result.originDistance = Math.hypot(
          parseFloat(playedFlight.style.left) - handOrigin.x,
          parseFloat(playedFlight.style.top) - handOrigin.y);
      }
      if (!result.hitFx && contains(".damage-attribute-fx, .slash-line")) result.hitFx = performance.now();
      if (!result.float && contains(".float-num")) result.float = performance.now();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const button = document.querySelector("[data-confirm-target]");
    button.addEventListener("click", () => { result.click = performance.now(); }, { capture: true, once: true });
    button.click();
    await new Promise(resolve => setTimeout(resolve, 70));
    result.lineDuringAim = !!document.querySelector(".target-line.show");
    const battleScreen = document.querySelector(".battle-screen");
    battle.speech = { id: "redraw-test", global: true, text: "外部状态更新", dismissible: false };
    window.render();
    result.frozenDuringFlight = window.BattleEffects.renderFrozen;
    result.stableDuringFlight = document.querySelector(".battle-screen") === battleScreen;
    const deadline = performance.now() + 4000;
    while ((!result.commit || !result.visible || !result.hitFx || !result.float
      || window.BattleEffects.animating || window.BattleEffects.renderFrozen) && performance.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 10));
      if (!result.visible && document.querySelector(".public-cards .card-trail")) result.visible = performance.now();
    }
    observer.disconnect();
    window.BattleSystem.playSelectedCard = original;
    window.BattleFX.cardLand = originalLand;
    return {
      flightDelay: result.flight - result.click,
      impactDelay: result.impact - result.click,
      commitDelay: result.commit - result.click,
      visibleDelay: result.visible - result.click,
      hitFxDelay: result.hitFx - result.click,
      floatDelay: result.float - result.click,
      lineDuringAim: result.lineDuringAim,
      flyingAtCommit: result.flyingAtCommit,
      frozenAtCommit: result.frozenAtCommit,
      frozenDuringFlight: result.frozenDuringFlight,
      stableDuringFlight: result.stableDuringFlight,
      originDistance: result.originDistance,
      frozenAfterAnimation: window.BattleEffects.renderFrozen,
    };
  });
  expect(timing.flightDelay).toBeGreaterThanOrEqual(0);
  expect(timing.flightDelay).toBeLessThan(100);
  expect(timing.lineDuringAim).toBe(true);
  expect(timing.originDistance).toBeLessThan(2);
  expect(timing.impactDelay).toBeGreaterThanOrEqual(0);
  expect(Math.abs(timing.commitDelay - timing.impactDelay)).toBeLessThan(80);
  expect(timing.commitDelay).toBeLessThan(850);
  expect(timing.visibleDelay).toBeGreaterThanOrEqual(timing.commitDelay);
  expect(timing.visibleDelay - timing.commitDelay).toBeLessThan(150);
  expect(timing.hitFxDelay).toBeGreaterThanOrEqual(timing.commitDelay);
  expect(timing.floatDelay).toBeGreaterThanOrEqual(timing.commitDelay);
  expect(timing.flyingAtCommit).toBe(true);
  expect(timing.frozenAtCommit).toBe(true);
  expect(timing.frozenDuringFlight).toBe(true);
  expect(timing.stableDuringFlight).toBe(true);
  expect(timing.frozenAfterAnimation).toBe(false);
});

test("virtual Slash reaches a Minotaur before its judgement and queues one flight", async ({ page }) => {
  await startRegressionBattle(page);
  const result = await page.evaluate(() => {
    const battle = window.state.battle;
    const actor = battle.allies[0];
    const target = battle.enemies[0];
    target.ai = "minotaur";
    target.deck = [{ name: "黑色判定", type: "tactic", suit: "♠" }];
    target.discard = [];
    target.hand = [];
    battle.animQueue = [];
    battle.activeUid = actor.uid;
    battle.phase = 4;
    battle.locked = false;
    const slash = window.CardUtils.fromEntity("杀（普攻）", {
      virtual: true, noIntentCost: true, _skill: true,
    });
    window.BattleSystem.useCard(window.state, actor, target, slash);
    return {
      types: battle.animQueue.map(event => event.type),
      flights: battle.animQueue.filter(event =>
        event.type === "virtualPlay" && event.card === slash).length,
      targetUid: battle.animQueue.find(event =>
        event.type === "virtualPlay" && event.card === slash)?.targetUid,
    };
  });
  expect(result.types.indexOf("virtualPlay")).toBeGreaterThanOrEqual(0);
  expect(result.types.indexOf("virtualPlay")).toBeLessThan(
    result.types.indexOf("judgement"));
  expect(result.flights).toBe(1);
  expect(result.targetUid).toBeTruthy();
});

test("an explicitly queued Slash is not queued again by damage resolution", async ({ page }) => {
  await startRegressionBattle(page);
  const result = await page.evaluate(() => {
    const battle = window.state.battle;
    const actor = battle.allies[0];
    const target = battle.enemies[0];
    const slash = window.CardUtils.fromEntity("魔杀", {
      virtual: true, noIntentCost: true, _skill: true,
    });
    target.hand = [];
    battle.animQueue = [{
      type: "virtualPlay", id: "dedupe-flight", uid: actor.uid,
      side: actor.side, targetUid: target.uid, card: slash,
      enemyLine: false, slashText: true,
    }];
    window.BattleSystem.damage(
      window.state, target, 1, "目标线去重测试", actor, slash);
    return battle.animQueue.filter(event =>
      event.type === "virtualPlay" && event.card === slash).length;
  });
  expect(result).toBe(1);
});
