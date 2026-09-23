const { test, expect } = require("@playwright/test");
const { startRegressionBattle } = require("./helpers/preview-game");

test("out-of-turn transfer prompts render the skill owner's hand", async ({ page }) => {
  await startRegressionBattle(page);
  const result = await page.evaluate(() => {
    const battle = window.state.battle, owner = battle.allies[1], enemy = battle.enemies[0];
    owner.hand = [
      { name: "交牌测试A", type: "tactic", suit: "♥", text: "用于回合外交牌测试。" },
      { name: "交牌测试B", type: "tactic", suit: "♦", text: "用于回合外交牌测试。" },
    ];
    battle.activeUid = enemy.uid;
    battle.phase = 4;
    battle.locked = true;
    battle.cadicisResponsibility = {
      cadicisUid: owner.uid, targetUid: battle.allies[0].uid,
      count: 2, remaining: 2, actorUid: enemy.uid,
      card: { name: "杀（普攻）", type: "slash" },
    };
    window.render();
    const hand = document.querySelector(".active-hand");
    return {
      ownerUid: owner.uid,
      shownOwner: hand?.dataset.handOwner || "",
      heading: document.querySelector(".hand-head")?.textContent || "",
      cardCount: hand?.querySelectorAll("[data-card-index]").length || 0,
      overlayCardButtons: document.querySelectorAll("[data-cadicis-give-index]").length,
      panelLocked: document.querySelector(".hand-panel")?.classList.contains("locked") || false,
    };
  });
  expect(result.shownOwner).toBe(result.ownerUid);
  expect(result.heading).toContain("指挥官责任");
  expect(result.cardCount).toBe(2);
  expect(result.overlayCardButtons).toBe(0);
  expect(result.panelLocked).toBe(false);
  await page.locator("[data-card-index='0']").click();
  await expect.poll(() => page.evaluate(() => {
    const battle = window.state.battle, prompt = battle.cadicisResponsibility;
    return {
      remaining: prompt?.remaining || 0,
      ownerCards: battle.allies[1].hand.filter(card => card.name.startsWith("交牌测试")).length,
      targetCards: battle.allies[0].hand.filter(card => card.name.startsWith("交牌测试")).length,
      shownOwner: document.querySelector(".active-hand")?.dataset.handOwner || "",
    };
  })).toEqual({
    remaining: 1,
    ownerCards: 1,
    targetCards: 1,
    shownOwner: result.ownerUid,
  });
  await page.locator("[data-card-index='0']").click();
  await expect.poll(() => page.evaluate(() => {
    const battle = window.state.battle;
    return {
      promptCleared: !battle.cadicisResponsibility,
      unlocked: !battle.locked,
      ownerCards: battle.allies[1].hand.filter(card => card.name.startsWith("交牌测试")).length,
      targetCards: battle.allies[0].hand.filter(card => card.name.startsWith("交牌测试")).length,
    };
  })).toEqual({
    promptCleared: true,
    unlocked: true,
    ownerCards: 0,
    targetCards: 2,
  });
});

test("hidden Half-Succubus Blood prompt rejects another ally hand input", async ({ page }) => {
  await startRegressionBattle(page);
  const ids = await page.evaluate(() => {
    const battle = window.state.battle, active = battle.allies[0], owner = battle.allies[1];
    active.hand = [{ name: "当前行动者手牌", type: "tactic", suit: "♥", text: "不可套用到海一。" }];
    owner.hand = [{ name: "海一手牌", type: "tactic", suit: "♦", text: "保持未选择。" }];
    battle.activeUid = active.uid;
    battle.phase = 4;
    battle.animQueue = [{ type: "float", uid: owner.uid, kind: "damage", amount: 1 }];
    battle.kaiichiShareQueue = [];
    battle.kaiichiShare = {
      unitUid: owner.uid, sourceUid: battle.enemies[0].uid, maxCount: 1, indexes: [],
      resumeEnemyUid: null, resumeUnitUid: active.uid, resumePhase: 4,
    };
    window.HoshinoSkills.shareVisible = () => false;
    battle.locked = true;
    window.render();
    return { activeUid: active.uid };
  });
  await expect(page.locator(".active-hand")).toHaveAttribute("data-hand-owner", ids.activeUid);
  expect(await page.locator(".hand-panel").evaluate(panel => ({
    blocked: (() => {
      const card = panel.querySelector("[data-card-index]"), rect = card.getBoundingClientRect();
      return !document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.closest("[data-card-index]");
    })(),
    sharing: panel.closest(".battle-screen").classList.contains("hand-sharing"),
  }))).toEqual({ blocked: true, sharing: false });
  await page.evaluate(() => document.querySelector("[data-card-index='0']").click());
  expect(await page.evaluate(() => ({
    indexes: window.state.battle.kaiichiShare.indexes,
    selectedCardIndex: window.state.battle.selectedCardIndex,
  }))).toEqual({ indexes: [], selectedCardIndex: null });
});

test("stale transfer hand input is rejected after the prompt owner changes", async ({ page }) => {
  await startRegressionBattle(page);
  const ids = await page.evaluate(() => {
    const battle = window.state.battle, first = battle.allies[1], second = battle.allies[0];
    first.hand = [{ name: "旧归属手牌", type: "tactic", suit: "♥", text: "不得落入新提示。" }];
    second.hand = [{ name: "新归属手牌", type: "tactic", suit: "♦", text: "保持未选择。" }];
    battle.activeUid = second.uid;
    battle.phase = 6;
    battle.locked = false;
    battle.newMoonShare = { unitUid: first.uid, count: 1, indexes: [] };
    window.render();
    return { firstUid: first.uid, secondUid: second.uid };
  });
  await page.evaluate(secondUid => {
    const staleCard = document.querySelector("[data-card-index='0']");
    window.state.battle.newMoonShare = { unitUid: secondUid, count: 1, indexes: [] };
    staleCard.click();
  }, ids.secondUid);
  await expect.poll(() => page.evaluate(() => {
    const battle = window.state.battle;
    return {
      shownOwner: document.querySelector(".active-hand")?.dataset.handOwner || "",
      picked: battle.newMoonShare?.indexes || [],
      firstCards: battle.allies[1].hand.map(card => card.name),
      secondCards: battle.allies[0].hand.map(card => card.name),
    };
  })).toEqual({
    shownOwner: ids.secondUid,
    picked: [],
    firstCards: ["旧归属手牌"],
    secondCards: ["新归属手牌"],
  });
});

test("friendly Steal and Dismantle keep every revealed card at the standard size", async ({ page }) => {
  await page.setViewportSize({ width: 809, height: 483 });
  await startRegressionBattle(page);
  const modes = ["steal", "discard"];
  for (const mode of modes) {
    const sizes = await page.evaluate(currentMode => {
      const battle = window.state.battle;
      const actor = battle.allies[0], teammate = battle.allies[1];
      teammate.hand = [
        { name: "肉", type: "response", suit: "♥", text: "当你成为杀的目标时，你可以使用此牌。" },
        { name: "肉", type: "response", suit: "♥", text: "当你成为杀的目标时，你可以使用此牌。" },
        { name: "封魔", type: "status", suit: "", void: true, text: "状态牌，持有者无法再摸牌，判定阶段进行判定，回合结束后消耗。" },
      ];
      battle.handReveal = {
        actorUid: actor.uid,
        targetUid: teammate.uid,
        cardName: currentMode === "steal" ? "偷窃" : "拆解",
        mode: currentMode,
      };
      battle.locked = true;
      window.render();
      return [...document.querySelectorAll(".hand-reveal-card")].map(button => {
        const card = button.querySelector(".play-card");
        const buttonRect = button.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();
        const buttonStyle = getComputedStyle(button);
        const cardStyle = getComputedStyle(card);
        return {
          cssButtonWidth: Math.round(parseFloat(buttonStyle.width)),
          cssCardWidth: Math.round(parseFloat(cardStyle.width)),
          cssCardHeight: Math.round(parseFloat(cardStyle.height)),
          visualWidth: Math.round(cardRect.width),
          visualHeight: Math.round(cardRect.height),
          matchesButton: Math.abs(buttonRect.width - cardRect.width) < 1,
        };
      });
    }, mode);
    expect(sizes).toHaveLength(3);
    expect(new Set(sizes.map(size => `${size.visualWidth}x${size.visualHeight}`)).size).toBe(1);
    expect(sizes).toEqual(Array.from({ length: 3 }, () => ({
      cssButtonWidth: 104,
      cssCardWidth: 104,
      cssCardHeight: 132,
      visualWidth: sizes[0].visualWidth,
      visualHeight: sizes[0].visualHeight,
      matchesButton: true,
    })));
  }
});

test("Borrowed Blade selects the exact card from the teammate hand area", async ({ page }) => {
  await startRegressionBattle(page);
  const setup = await page.evaluate(() => {
    const battle = window.state.battle;
    const actor = battle.allies[0], partner = battle.allies[1], target = battle.enemies[0];
    partner.stats.attack = 2;
    target.block = 0;
    target.defenseSystem = 0;
    target.hand = [];
    partner.hand = [
      { name: "闪", type: "response", suit: "♥", text: "不可用于借刀杀人。" },
      window.CardUtils.cloneEntity("雷杀", {
        suit: "♦", text: "对目标造成雷属性伤害。",
      }),
    ];
    battle.activeUid = actor.uid;
    battle.phase = 4;
    battle.handReveal = {
      actorUid: actor.uid, targetUid: partner.uid, attackTargetUid: target.uid,
      cardName: "借刀杀人",
      card: { name: "借刀杀人", type: "tactic", borrowSlash: true },
      mode: "borrowSlashChoice", validIndexes: [1], repeatAfter: false,
    };
    battle.locked = true;
    window.render();
    return { partnerUid: partner.uid, targetUid: target.uid, targetHp: target.hp };
  });
  await expect(page.locator(".active-hand")).toHaveAttribute(
    "data-hand-owner", setup.partnerUid);
  await expect(page.locator(".hand-head")).toContainText("借刀杀人");
  await expect(page.locator(".hand-reveal-overlay")).toHaveCount(0);
  await expect(page.locator("[data-card-index='0']")).toHaveClass(/disabled/);
  await page.locator("[data-card-index='1']").click();
  await expect.poll(() => page.evaluate(targetUid => {
    const battle = window.state.battle;
    return {
      promptCleared: !battle.handReveal,
      unlocked: !battle.locked,
      partnerHand: battle.allies[1].hand.map(card => card.name),
    };
  }, setup.targetUid)).toEqual({
    promptCleared: true,
    unlocked: true,
    partnerHand: ["闪"],
  });
  expect(await page.evaluate(targetUid =>
    window.state.battle.enemies.find(unit => unit.uid === targetUid).hp,
  setup.targetUid)).toBeLessThan(setup.targetHp);
});

test("Borrowed Blade fallback selects the exact card handed over", async ({ page }) => {
  await startRegressionBattle(page);
  const setup = await page.evaluate(() => {
    const battle = window.state.battle;
    const actor = battle.allies[0], partner = battle.allies[1], target = battle.enemies[0];
    const borrowedBlade = {
      ...window.GameData.cardCodex.find(card => card.name === "借刀杀人"), suit: "♣",
    };
    actor.hand = [borrowedBlade];
    actor.intent = 10;
    partner.hand = [
      { name: "闪", type: "response", suit: "♥", text: "响应牌。" },
      { name: "愈魔瓶", type: "consume", suit: "♦", text: "回复牌。" },
    ];
    battle.enemies.forEach(enemy => { enemy.hand = []; });
    battle.activeUid = actor.uid;
    battle.phase = 4;
    battle.locked = false;
    window.BattleSystem.playActiveCard(window.state, 0, target.uid, partner.uid);
    window.render();
    return { actorUid: actor.uid, partnerUid: partner.uid };
  });
  await expect(page.locator(".active-hand")).toHaveAttribute(
    "data-hand-owner", setup.partnerUid);
  await expect(page.locator(".hand-head")).toContainText("要获得的1张手牌");
  await page.evaluate(() => {
    window.__borrowedBladeTransferStarted = false;
    const observer = new MutationObserver(records => {
      if (records.some(record => [...record.addedNodes].some(node =>
        node.nodeType === Node.ELEMENT_NODE
        && (node.matches?.(".steal-card-fly")
          || node.querySelector?.(".steal-card-fly"))))) {
        window.__borrowedBladeTransferStarted = true;
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.__borrowedBladeObserver = observer;
  });
  await page.locator("[data-card-index='1']").click();
  await expect.poll(() => page.evaluate(({ actorUid, partnerUid }) => {
    const battle = window.state.battle;
    const actor = battle.allies.find(unit => unit.uid === actorUid);
    const partner = battle.allies.find(unit => unit.uid === partnerUid);
    return {
      promptCleared: !battle.handReveal,
      actorHand: actor.hand.map(card => card.name),
      partnerHand: partner.hand.map(card => card.name),
    };
  }, setup)).toEqual({
    promptCleared: true,
    actorHand: ["愈魔瓶"],
    partnerHand: ["闪"],
  });
  expect(await page.evaluate(() => {
    window.__borrowedBladeObserver?.disconnect();
    return window.__borrowedBladeTransferStarted;
  })).toBe(true);
});
