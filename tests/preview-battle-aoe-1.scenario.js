const { test, expect } = require("@playwright/test");
const {
  startRegressionBattle, prepareAoeLineCapture, capturedAoeLineCount,
} = require("./helpers/preview-game");

test("selecting full-target cards previews a visible line to every living enemy", async ({ page }) => {
  await startRegressionBattle(page);
  const results = await page.evaluate(() => {
    const battle = window.state.battle;
    const actor = window.BattleSystem.active(battle);
    actor.intent = Math.max(actor.intent || 0, 1);
    const targetCount = battle.enemies.filter(unit => unit.hp > 0).length;
    const inspect = card => {
      actor.hand = [card];
      battle.selectedCardIndex = null;
      battle.selectedSkillCard = null;
      window.BattleSystem.selectCard(window.state, 0);
      window.render();
      window.BattleEffects.sync(window.state);
      const lines = [...document.querySelectorAll(".target-line.aoe-line.show")]
        .map(line => ({
          width: line.getBoundingClientRect().width,
          opacity: Number(getComputedStyle(line).opacity),
        }));
      window.BattleEffectUtils.hideLine();
      return lines;
    };
    return {
      targetCount,
      sweep: inspect(window.CardUtils.cloneEntity("机枪扫杀", { suit: "♥" })),
      invasion: inspect(window.CardUtils.cloneEntity("魔王军入侵", { suit: "♠" })),
    };
  });
  for (const lines of [results.sweep, results.invasion]) {
    expect(lines).toHaveLength(results.targetCount);
    expect(lines.every(line => line.width > 20 && line.opacity > 0)).toBe(true);
  }
});

test("hand-played group attacks show exactly one full-target line batch", async ({ page }) => {
  await startRegressionBattle(page);
  for (const attack of [
    { name: "机枪扫杀", suit: "♥", temporary: false },
    { name: "机枪扫杀", suit: "♦", temporary: true },
    { name: "魔王军入侵", suit: "♠", temporary: true },
  ]) {
    const targetCount = await page.evaluate(card => {
      const battle = window.state.battle, actor = window.BattleSystem.active(battle);
      actor.intent = Math.max(actor.intent || 0, 3);
      actor.hand = [window.CardUtils.cloneEntity(card.name, {
        suit: card.suit,
        ...(card.temporary ? {
          temporary: true, void: true, wendyTutorGenerated: true,
          generatedBySkill: "解答迷惑",
        } : {}),
      })];
      battle.enemies.forEach(enemy => {
        enemy.hp = Math.max(enemy.hp, 999);
        enemy.maxHp = Math.max(enemy.maxHp, 999);
        enemy.hand = [];
      });
      battle.selectedCardIndex = null;
      battle.selectedSkillCard = null;
      battle.pendingTargetUid = null;
      battle.pendingTargetUids = null;
      battle.animQueue = [];
      window.state.settings.battleSpeed = 2;
      window.render();
      window.BattleEffectUtils.hideLine();
      return battle.enemies.filter(enemy => enemy.hp > 0).length;
    }, attack);
    await page.locator('[data-card-index="0"]').click();
    await expect(page.locator(".target-line.aoe-line.show")).toHaveCount(targetCount);
    await page.evaluate(() => {
      window.__groupLineBatches = [];
      window.__groupLineObserver = new MutationObserver(records => {
        const count = records.flatMap(record => [...record.addedNodes])
          .filter(node => node.nodeType === Node.ELEMENT_NODE
            && node.matches?.(".target-line.aoe-line.show")).length;
        if (count) window.__groupLineBatches.push(count);
      });
      window.__groupLineObserver.observe(document.body, { childList: true });
    });
    await page.locator('[data-card-index="0"]').click();
    await expect.poll(() => page.evaluate(() =>
      !window.BattleEffects.animating
        && !window.BattleEffects.draining
        && !window.state.battle.animQueue.length
    )).toBe(true);
    const batches = await page.evaluate(() => {
      window.__groupLineObserver.disconnect();
      return window.__groupLineBatches;
    });
    expect(batches).toEqual([targetCount]);
    await expect(page.locator(".target-line.aoe-line")).toHaveCount(0);
  }
});

test("Edis Magic Eye copied group attacks show exactly one enemy line batch", async ({ page }) => {
  await startRegressionBattle(page);
  for (const attack of [
    { name: "机枪扫杀", suit: "♥" },
    { name: "魔王军入侵", suit: "♠" },
  ]) {
    const targetCount = await page.evaluate(cardData => {
      const battle = window.state.battle;
      const edis = battle.enemies[0];
      const target = battle.allies[0];
      const card = window.CardUtils.cloneEntity(cardData.name, {
        suit: cardData.suit,
        copiedByEdis: true,
        temporary: true,
        void: true,
        generatedBySkill: "拷贝魔眼",
      });
      Object.assign(edis, {
        ai: "pursuer_edis",
        name: "内英组杀手伊迪斯",
        hand: [card],
        intent: 10,
      });
      battle.allies.forEach((ally, index) => {
        ally.hp = Math.max(ally.hp, 999);
        ally.maxHp = Math.max(ally.maxHp, 999);
        ally.hand = [];
        ally.ref = `edis-copy-target-${index}`;
        ally.skills = [];
        ally.relics = [];
        ally.statuses = [];
      });
      battle.phase = 4;
      battle.locked = false;
      battle.animQueue = [];
      card._playedFlightDone = true;
      card._playedTargetUid = target.uid;
      window.__edisCopyLineBatches = [];
      window.__edisCopyLineObserver = new MutationObserver(records => {
        const count = records.flatMap(record => [...record.addedNodes])
          .filter(node => node.nodeType === Node.ELEMENT_NODE
            && node.matches?.(".target-line.aoe-line.show")).length;
        if (count) window.__edisCopyLineBatches.push(count);
      });
      window.__edisCopyLineObserver.observe(document.body, { childList: true });
      battle.animQueue.push({
        id: `edis-copy-${cardData.name}`,
        type: "enemyPlay",
        uid: edis.uid,
        side: edis.side,
        targetUid: target.uid,
        card,
        slashText: window.CardUtils.isKillCard(card),
        commit: () => window.BattleSystem.useCard(window.state, edis, target, card),
      });
      window.render();
      window.__edisCopyDrain = window.BattleEffects.drain(window.state, window.render);
      return battle.allies.filter(ally => ally.hp > 0).length;
    }, attack);
    await expect.poll(() => page.evaluate(() =>
      !window.BattleEffects.animating
        && !window.BattleEffects.draining
        && !window.state.battle.animQueue.length
    )).toBe(true);
    const batches = await page.evaluate(() => {
      window.__edisCopyLineObserver.disconnect();
      return window.__edisCopyLineBatches;
    });
    expect(batches).toEqual([targetCount]);
    await expect(page.locator(".target-line.aoe-line")).toHaveCount(0);
  }
});

test("converted group attacks show a line to every living enemy", async ({ page }) => {
  await startRegressionBattle(page);
  for (const setup of ["crazy-shooting", "manny-flamer"]) {
    await page.evaluate(mode => {
      const battle = window.state.battle, actor = window.BattleSystem.active(battle);
      battle.selectedSkillCard = null;
      battle.pendingTargetUid = null;
      battle.pendingTargetUids = null;
      actor.ref = mode === "manny-flamer" ? "manny" : "flora";
      actor.mannyWeapon = mode === "manny-flamer" ? "flamer" : null;
      actor.hand = [window.CardUtils.cloneEntity("杀（普攻）", { suit: "♥" })];
      battle.selectedCardIndex = 0;
      if (mode === "crazy-shooting") {
        battle.selectedSkillCard = { name: "疯狂射击", type: "tactic", _skill: true, crazyShooting: true, targetless: true };
      }
      window.render();
      window.BattleEffectUtils.hideLine();
    }, setup);
    await prepareAoeLineCapture(page, "__convertedGroupLineCapture");
    await page.evaluate(() => {
      window.__convertedGroupLinePlay = window.BattleEffects.play(window.state, () => {
        window.BattleSystem.cancelSelection(window.state);
        return true;
      });
    });
    expect(await capturedAoeLineCount(page, "__convertedGroupLineCapture")).toBe(2);
    await page.evaluate(() => window.__convertedGroupLinePlay);
    await expect(page.locator(".target-line.aoe-line")).toHaveCount(0);
  }
});

test("focused flamer extra settlement replays only to its current target", async ({ page }) => {
  await startRegressionBattle(page);
  const result = await page.evaluate(async () => {
    const battle = window.state.battle;
    const actor = window.BattleSystem.active(battle);
    window.BattleEffects.cancel(window.state);
    window.BattleFX.cancel();
    battle.animQueue = [];
    actor.ref = "manny";
    actor.mannyWeapon = "flamer";
    const targets = battle.enemies.filter(unit => unit.hp > 0);
    window.render();
    let singleLines = 0;
    let groupLines = 0;
    let flyingCards = 0;
    const observer = new MutationObserver(records => {
      records.forEach(record => {
        [...record.addedNodes].forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE
            && node.matches?.(".flying-card")) flyingCards += 1;
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const effectUtils = {
      ...window.BattleEffectUtils,
      setLine(...args) {
        singleLines += 1;
        window.BattleEffectUtils.setLine(...args);
      },
      setLines(...args) {
        groupLines += 1;
        window.BattleEffectUtils.setLines(...args);
      },
    };
    const effects = window.BattleEffectCards(effectUtils);
    const publicBefore = (battle.played?.length || 0)
      + (battle.shownPlayed?.length || 0);
    await effects.virtualPlay(window.state, {
      uid: actor.uid,
      side: actor.side,
      targetUid: targets[0].uid,
      card: {
        ...window.CardUtils.fromEntity("杀（普攻）"),
        fire: true,
      },
      enemyLine: false,
      show: false,
      slashText: true,
      extraSlashReplay: true,
    }, () => {}, () => true);
    observer.disconnect();
    return {
      singleLines,
      groupLines,
      flyingCards,
      publicBefore,
      publicAfter: (battle.played?.length || 0)
        + (battle.shownPlayed?.length || 0),
    };
  });
  expect(result.singleLines).toBe(1);
  expect(result.groupLines).toBe(0);
  expect(result.flyingCards).toBe(1);
  expect(result.publicAfter).toBe(result.publicBefore);
});
