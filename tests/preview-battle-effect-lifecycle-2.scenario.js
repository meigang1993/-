const { test, expect } = require("@playwright/test");
const {
  collectErrors, relevantErrors, openGame, startFreshGame, startRegressionBattle,
} = require("./helpers/preview-game");

test("virtual use mirrors retain identity after resolution cleanup", async ({ page }) => {
  await startRegressionBattle(page);
  const result = await page.evaluate(() => {
    const battle = window.state.battle;
    const actor = battle.allies[0];
    const card = window.CardUtils.fromEntity("魔杀", {
      suit: "♣", _cardResolutionId: "virtual-use-resolution",
    });
    battle.played = [{
      ...window.CardUtils.clean(card),
      _playedByName: actor.name,
      _playedAction: "使用了",
      _cardAnimationId: card._cardResolutionId,
    }];
    battle.shownPlayed = [];
    delete card._cardResolutionId;
    window.BattleSystem.revealPlayed(battle, card, {
      id: "virtual-use-flight",
      trailId: "virtual-use-resolution",
      uid: actor.uid,
    });
    window.render();
    const mergedCount =
      document.querySelectorAll(".public-cards .card-trail").length;

    battle.played = [
      {
        ...window.CardUtils.cloneEntity("魔杀", { suit: "♣" }),
        _playedByName: actor.name, _playedAction: "使用了",
        _cardAnimationId: "entity-use",
      },
      {
        ...window.CardUtils.fromEntity("魔杀", { suit: "♣" }),
        _playedByName: actor.name, _playedAction: "使用了",
        _cardAnimationId: "explicit-reuse",
      },
    ];
    battle.shownPlayed = [];
    window.render();
    const cards = [...document.querySelectorAll(".public-cards .card-trail")];
    return {
      mergedCount,
      reuseCount: cards.length,
      virtualCount: cards.filter(item =>
        item.querySelector(".trail-kind")?.textContent === "虚拟").length,
    };
  });
  expect(result).toEqual({
    mergedCount: 1,
    reuseCount: 2,
    virtualCount: 1,
  });
});

test("2x speed keeps burn, death, and chained damage effects synchronized", async ({ page }) => {
  await startRegressionBattle(page);
  const result = await page.evaluate(async () => {
    window.state.settings.battleSpeed = 2;
    window.BattleEffectAnimation.syncCssTiming(window.state);
    const motion = window.BattleEffectCardMotion(window.BattleEffectUtils);
    let burnStart = 0, burnEnd = 0, burnCssMs = 0;
    const burnObserver = new MutationObserver(() => {
      const card = document.querySelector(".burning-card.burning-active");
      if (card && !burnStart) {
        const animation = card.getAnimations().find(item =>
          item.effect?.target === card);
        burnStart = performance.now() - Math.max(0, animation?.currentTime || 0);
        burnCssMs = parseFloat(getComputedStyle(card).animationDuration) * 1000;
        window.state.settings.battleSpeed = 1;
        window.BattleEffectAnimation.syncCssTiming(window.state);
      }
      if (burnStart && !document.querySelector(".burning-card")) {
        burnEnd = performance.now();
      }
    });
    burnObserver.observe(document.body, {
      childList: true, subtree: true, attributes: true, attributeFilter: ["class"],
    });
    await motion.flyFrontCards({
      cards: [{ name: "愈魔瓶", type: "consume", suit: "♥" }],
      from: { x: 160, y: 520 }, to: { x: 1080, y: 160 },
      className: "consume-card-fly", burn: true,
    });
    burnObserver.disconnect();

    window.state.settings.battleSpeed = 2;
    window.BattleEffectAnimation.syncCssTiming(window.state);
    const battle = window.state.battle;
    const target = battle.enemies[0];
    target.hp = Math.max(1, target.hp);
    target.visualHp = target.hp;
    delete target.deathShown;
    battle.animQueue = [{
      type: "float", id: "speed-death", hitFxId: "speed-death-hit",
      uid: target.uid, kind: "damage", value: target.hp,
      visualHp: 0, damageTypes: ["physical"],
    }];
    let deathStart = 0, deathEnd = 0, deathCssMs = 0;
    const deathObserver = new MutationObserver(() => {
      const unit = document.querySelector(`[data-target="${target.uid}"].death-anim`);
      if (unit && !deathStart) {
        deathStart = performance.now();
        deathCssMs = parseFloat(getComputedStyle(unit).animationDuration) * 1000;
      }
      if (deathStart && !unit && !deathEnd) deathEnd = performance.now();
    });
    deathObserver.observe(document.body, {
      childList: true, subtree: true, attributes: true, attributeFilter: ["class"],
    });
    await window.BattleEffects.drain(window.state, window.render);
    deathObserver.disconnect();

    const hitTimes = [];
    const damageObserver = new MutationObserver(records => {
      records.forEach(record => [...record.addedNodes].forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE
          && node.matches?.(".damage-attribute-fx")) hitTimes.push(performance.now());
      }));
    });
    damageObserver.observe(document.body, { childList: true });
    window.BattleDamageFX.play({
      uid: battle.allies[0].uid,
      damageTypes: ["physical", "fire"],
    });
    const deadline = performance.now() + 1000;
    while (hitTimes.length < 2 && performance.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    damageObserver.disconnect();
    window.BattleDamageFX.cancel();
    return {
      burnCssMs,
      burnVisibleMs: burnEnd - burnStart,
      deathCssMs,
      deathVisibleMs: deathEnd - deathStart,
      hitGapMs: hitTimes[1] - hitTimes[0],
      effectsIdle: !window.BattleEffects.animating && !window.BattleEffects.draining,
    };
  });
  expect(result.burnCssMs).toBeCloseTo(410, -1);
  expect(result.burnVisibleMs).toBeGreaterThanOrEqual(result.burnCssMs - 25);
  expect(result.deathCssMs).toBeCloseTo(360, -1);
  expect(result.deathVisibleMs).toBeGreaterThanOrEqual(result.deathCssMs - 25);
  expect(result.hitGapMs).toBeGreaterThan(35);
  expect(result.hitGapMs).toBeLessThan(125);
  expect(result.effectsIdle).toBe(true);
});

test("Half-Succubus Blood prompt waits for current hit animations", async ({ page }) => {
  await startRegressionBattle(page);
  const staged = await page.evaluate(() => {
    const battle = window.state.battle, kaiichi = battle.allies[0], helper = battle.allies[1], enemy = battle.enemies[0];
    Object.assign(kaiichi, {
      ref: "hoshino_kaiichi", skills: [{ name: "半魅魔血" }],
      hp: 30, maxHp: 30, block: 0, defenseSystem: 0,
    });
    helper.hp = Math.max(1, helper.hp);
    battle.activeUid = enemy.uid;
    battle.phase = 4;
    battle.locked = false;
    battle.animQueue = [];
    window.BattleSystem.damage(window.state, kaiichi, 2, "连击测试", enemy, {
      name: "连击测试", type: "skill", ignoreResponse: true, skipDamageModify: true,
    });
    window.render();
    const screen = document.querySelector(".battle-screen");
    return {
      locked: battle.locked,
      queued: battle.animQueue.length,
      hasShare: !!battle.kaiichiShare,
      skillCaption: battle.skillCaption?.name || "",
      promptVisible: !!document.querySelector(".dimension-prompt"),
      handShowsSkill: document.querySelector(".hand-head")?.textContent.includes("半魅魔血") || false,
      reactionPending: screen?.classList.contains("reaction-prompt-pending") || false,
      allyFilter: getComputedStyle(document.querySelector(".ally-row")).filter,
      handOpacity: getComputedStyle(document.querySelector(".hand-panel")).opacity,
    };
  });
  expect(staged.locked).toBe(true);
  expect(staged.queued).toBeGreaterThan(0);
  expect(staged.hasShare).toBe(true);
  expect(staged.skillCaption).toBe("");
  expect(staged.promptVisible).toBe(false);
  expect(staged.handShowsSkill).toBe(false);
  expect(staged.reactionPending).toBe(true);
  expect(staged.allyFilter).toBe("none");
  expect(staged.handOpacity).toBe("1");
  await page.evaluate(() => window.BattleEffects.drain(window.state, window.render));
  await expect(page.locator(".dimension-prompt")).toContainText("半魅魔血");
  await expect(page.locator(".hand-head")).toContainText("半魅魔血");
  await expect(page.locator(".skill-caption")).toContainText("半魅魔血");
  await page.locator("[data-kaiichi-share-skip]").first().click();
  await expect(page.locator(".dimension-prompt")).toHaveCount(0);
  await expect(page.locator(".skill-caption")).toHaveCount(0);
});
