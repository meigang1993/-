const { test, expect } = require("@playwright/test");
const {
  collectErrors, relevantErrors, openGame, startFreshGame, startRegressionBattle,
} = require("./helpers/preview-game");

test("consumed cards keep their targeting line and burn animation", async ({ page }) => {
  await startRegressionBattle(page);
  const result = await page.evaluate(async () => {
    const battle = window.state.battle, actor = battle.allies[0], target = battle.allies[1];
    actor.hand[0] = {
      name: "愈魔瓶", type: "consume", healPct: .3, healScale: "magic",
      allyTarget: true, suit: "♥", text: "恢复生命。",
    };
    target.hp = Math.max(1, target.maxHp - 5);
    battle.activeUid = actor.uid;
    battle.phase = 4;
    battle.locked = false;
    battle.selectedCardIndex = 0;
    battle.selectedSkillCard = null;
    battle.pendingTargetUid = target.uid;
    window.render();
    const seen = { line: false, burnCard: false, burnActive: false };
    const observer = new MutationObserver(() => {
      if (document.querySelector(".burning-card")) seen.burnCard = true;
      if (document.querySelector(".burning-card.burning-active")) seen.burnActive = true;
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    document.querySelector("[data-confirm-target]").click();
    await new Promise(resolve => setTimeout(resolve, 100));
    seen.line = !!document.querySelector(".target-line.show");
    const deadline = performance.now() + 5000;
    while ((!seen.burnActive || window.BattleEffects.animating || window.BattleEffects.draining) && performance.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    while (battle.played.some(card => card.name === "愈魔瓶")
      && performance.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    observer.disconnect();
    return {
      ...seen,
      consumed: actor.consumed.some(card => card.name === "愈魔瓶"),
      publicConsumed: battle.played.some(card => card.name === "愈魔瓶"),
      effectsIdle: !window.BattleEffects.animating && !window.BattleEffects.draining,
      animationError: (window.state.battleLog || []).some(line => line.includes("战斗动画异常")),
    };
  });
  expect(result).toEqual({
    line: true,
    burnCard: true,
    burnActive: true,
    consumed: true,
    publicConsumed: false,
    effectsIdle: true,
    animationError: false,
  });
});

test("skill-generated hand cards retain one settled public source card", async ({ page }) => {
  await startRegressionBattle(page);
  const result = await page.evaluate(async () => {
    const battle = window.state.battle;
    const originalMotion = window.BattleEffectCardMotion;
    window.BattleEffectCardMotion = () => ({
      flyFrontCards: async () => {},
    });
    try {
      const handlers = window.BattleEffectCardTransfers({
        publicZone: () => ({}), drawOrigin: () => ({}),
        pileZone: () => ({}), unitArt: () => ({}), handSpot: () => ({}),
      });
      const generatedCards = [
        ...window.WendyCadicisSkills.tutorPool(window.state).map(template => ({
          ...template, temporary: true, void: true,
          wendyTutorGenerated: true, generatedBySkill: "解答迷惑",
        })),
        {
          ...window.CardUtils.cloneEntity("杀（普攻）"),
          suit: "虚", temporary: true, void: true, virtual: true,
          generatedBySkill: "狂战意志",
        },
        {
          ...window.CardUtils.cloneEntity("火杀"),
          temporary: true, void: true, withererPeekSlash: true,
          generatedBySkill: "杀欲窥视",
        },
        {
          ...window.CardUtils.cloneEntity("与我一战"),
          temporary: true, void: true, copiedByEdis: true,
          generatedBySkill: "拷贝魔眼",
        },
      ];
      const failures = [];
      for (let index = 0; index < generatedCards.length; index += 1) {
        const card = generatedCards[index];
        const trailId = `generated-audit-${index}`;
        battle.played = [{ ...card, _cardAnimationId: trailId }];
        await handlers.burnCard(window.state, {
          card, trailId, uid: battle.allies[0].uid, side: "ally",
          fromPublic: true,
        }, () => {}, () => true);
        const source = battle.played[0];
        if (battle.played.length !== 1 || source?.name !== card.name
          || !source?._destinationSettled
          || window.CardUtils.generatedSource(source) !== card.generatedBySkill) {
          failures.push(card.generatedBySkill);
        }
      }
      const ordinary = {
        name: "普通消耗牌", type: "consume", temporary: true, void: true,
      };
      battle.played = [{ ...ordinary, _cardAnimationId: "ordinary" }];
      await handlers.burnCard(window.state, {
        card: ordinary, trailId: "ordinary",
        uid: battle.allies[0].uid, side: "ally", fromPublic: true,
      }, () => {}, () => true);
      return {
        generatedCount: generatedCards.length, failures,
        ordinaryRemoved: battle.played.length === 0,
      };
    } finally {
      window.BattleEffectCardMotion = originalMotion;
    }
  });
  expect(result.generatedCount).toBe(18);
  expect(result.failures).toEqual([]);
  expect(result.ordinaryRemoved).toBe(true);
});

test("skill-generated transient mirrors do not duplicate resolved trail cards", async ({ page }) => {
  await startRegressionBattle(page);
  const result = await page.evaluate(() => {
    const battle = window.state.battle;
    const generated = [
      { name: "组合进攻", type: "tactic", suit: "♥", generatedBySkill: "解答迷惑" },
      { name: "杀（普攻）", type: "slash", suit: "虚", virtual: true, generatedBySkill: "狂战意志" },
      { name: "火杀", type: "slash", suit: "♦", generatedBySkill: "杀欲窥视" },
      { name: "与我一战", type: "tactic", suit: "♠", generatedBySkill: "拷贝魔眼" },
    ].map(card => ({ ...card, _playedByName: "测试角色" }));
    battle.played = generated.map(card => ({ ...card, _playedAction: "使用了" }));
    battle.shownPlayed = generated.map(card => ({ ...card, _playedAction: "打出了" }));
    window.render();
    const cards = [...document.querySelectorAll(".public-cards .card-trail")];
    return {
      count: cards.length,
      sourceNotes: cards.filter(card =>
        card.getAttribute("title")?.includes("生成")).length,
      labels: cards.map(card => card.textContent),
    };
  });
  expect(result.count).toBe(4);
  expect(result.sourceNotes).toBe(4);
  expect(result.labels.filter(text => text.includes("杀（普攻）"))).toHaveLength(1);
});
