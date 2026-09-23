const { expect } = require("@playwright/test");

async function verifyBattleResponsiveLayout(page) {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 943, height: 520 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(() => page.evaluate(() => {
      const screen = document.querySelector(".battle-screen")?.getBoundingClientRect();
      const panel = document.querySelector(".hand-panel")?.getBoundingClientRect();
      const publicZone = document.querySelector(".public-zone")?.getBoundingClientRect();
      const cards = [...document.querySelectorAll(".hand-panel .play-card")].map(card => card.getBoundingClientRect());
      const trailCards = [...document.querySelectorAll(".public-cards .card-trail")].map(card => card.getBoundingClientRect());
      const allyUnits = [...document.querySelectorAll(".ally-row .unit")].map(unit => unit.getBoundingClientRect());
      const enemyNames = [...document.querySelectorAll(".enemy-row .unit-name")].map(name => name.getBoundingClientRect());
      const allyNames = [...document.querySelectorAll(".ally-row .unit-name")].map(name => name.getBoundingClientRect());
      const enemyPile = document.querySelector(".pile-stats.enemy")?.getBoundingClientRect();
      const controls = [...document.querySelectorAll(".hand-head button")].map(button => button.getBoundingClientRect());
      const allyBottom = Math.max(...allyUnits.map(rect => rect.bottom));
      const controlsTop = Math.min(...controls.map(rect => rect.top));
      const controlsAccessible = controls.every(rect => {
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return Boolean(hit?.closest(".hand-head button"));
      });
      const unitControlOverlap = Math.max(0, allyBottom - controlsTop);
      return {
        sixRows: getComputedStyle(document.querySelector(".battle-screen")).gridTemplateRows.split(" ").length === 6,
        cardsVisible: cards.length > 0 && cards.every(card => card.top >= panel.top - 1 && card.bottom <= panel.bottom + 1 && card.bottom <= screen.bottom + 1),
        publicVisible: publicZone.top >= screen.top - 1 && publicZone.bottom <= screen.bottom + 1,
        trailVisible: trailCards.length > 0 && trailCards.every(card => card.top >= publicZone.top - 1 && card.bottom <= publicZone.bottom + 1),
        namesClear: enemyNames.length > 0 && allyNames.length > 0
          && enemyNames.every(name => name.bottom <= enemyPile.top - 1)
          && allyNames.every(name => name.bottom <= panel.top - 1),
        controlsClear: allyUnits.length > 0 && controls.length > 0 && controlsAccessible && unitControlOverlap <= (innerHeight <= 420 ? 8 : 1),
        publicWide: publicZone.width >= Math.min(940, screen.width - 32),
        publicUnshifted: getComputedStyle(document.querySelector(".public-zone")).transform === "none",
        bodyOverflowX: document.body.scrollWidth - document.body.clientWidth,
        bodyOverflowY: document.body.scrollHeight - document.body.clientHeight,
      };
    })).toEqual({ sixRows: true, cardsVisible: true, publicVisible: true, trailVisible: true, namesClear: true, controlsClear: true, publicWide: true, publicUnshifted: true, bodyOverflowX: 0, bodyOverflowY: 0 });
    await page.evaluate(() => {
      const battle = window.state.battle, speaker = battle.allies[1] || battle.allies[0];
      battle.speech = { id: "layout-speech", lines: [{ uid: speaker.uid, text: "测试台词字号与遮挡，确保牌堆统计不会覆盖文字。" }] };
      window.render();
    });
    await expect.poll(() => page.evaluate(() => {
      const bubble = document.querySelector(".unit-speech-bubble"), pile = document.querySelector(".pile-stats.ally");
      const buttons = [...document.querySelectorAll(".hand-head button")], a = bubble?.getBoundingClientRect(), b = pile?.getBoundingClientRect();
      const left = Math.max(a?.left || 0, b?.left || 0), right = Math.min(a?.right || 0, b?.right || 0), top = Math.max(a?.top || 0, b?.top || 0), bottom = Math.min(a?.bottom || 0, b?.bottom || 0);
      const overlap = right > left && bottom > top;
      if (bubble) bubble.style.pointerEvents = "auto";
      const hit = overlap ? document.elementFromPoint((left + right) / 2, (top + bottom) / 2) : bubble;
      if (bubble) bubble.style.pointerEvents = "";
      return {
        visibleAbovePile: Boolean(bubble && (!overlap || hit?.closest(".unit-speech-bubble") === bubble)),
        fontIsSeventeen: parseFloat(getComputedStyle(bubble).fontSize) === 17,
        speechRowAbovePile: parseInt(getComputedStyle(bubble.closest(".unit-row")).zIndex, 10) > parseInt(getComputedStyle(pile).zIndex, 10),
        handAboveSpeechRow: parseInt(getComputedStyle(document.querySelector(".hand-panel")).zIndex, 10) > parseInt(getComputedStyle(bubble.closest(".unit-row")).zIndex, 10),
        controlsAccessible: buttons.length > 0 && buttons.every(button => {
          const rect = button.getBoundingClientRect(), target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
          return target?.closest(".hand-head button") === button;
        }),
      };
    })).toEqual({ visibleAbovePile: true, fontIsSeventeen: true, speechRowAbovePile: true, handAboveSpeechRow: true, controlsAccessible: true });
    for (const edge of ["left", "right"]) {
      await page.evaluate(position => {
        const battle = window.state.battle;
        const row = position === "left" ? battle.enemies : battle.allies;
        const speaker = position === "left" ? row[0] : row[row.length - 1];
        battle.speech = { id: `edge-speech-${position}`, lines: [{ uid: speaker.uid, text: "边缘角色的长台词必须完整显示，不能裁掉开头或结尾。" }] };
        window.render();
      }, edge);
      await expect.poll(() => page.evaluate(() => {
        const screen = document.querySelector(".battle-screen")?.getBoundingClientRect();
        const bubble = document.querySelector(".unit-speech-bubble")?.getBoundingClientRect();
        return !!screen && !!bubble && bubble.left >= screen.left - 1 && bubble.right <= screen.right + 1;
      })).toBe(true);
    }
    await page.evaluate(() => {
      window.state.battle.speech = { global: true, text: "测试开场对白", dismissible: true };
      window.render();
    });
    await expect.poll(() => page.locator(".battle-subtitle").evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBe(17);
  }

}

async function verifyBattleResponseTrail(page) {
  const logButton = page.getByRole("button", { name: "牌局记录" });
  await page.evaluate(async () => {
    const battle = window.state.battle, responder = battle.allies[0];
    battle.played = []; battle.shownPlayed = []; battle.animQueue = [];
    window.render();
    battle.animQueue.push({ type: "response", id: "test-flash", uid: responder.uid, side: responder.side, card: { name: "闪", type: "response", suit: "♥" } });
    await window.BattleEffects.drain(window.state, window.render);
    battle.animQueue.push({ type: "response", id: "test-feint", uid: responder.uid, side: responder.side, card: { name: "佯攻", type: "response", suit: "♦", feint: true } });
    await window.BattleEffects.drain(window.state, window.render);
  });
  await expect(page.locator(".card-trail")).toHaveCount(2);
  await expect(page.locator(".public-cards")).toContainText(/闪.*佯攻/);
  const responseTrail = await page.evaluate(() => window.state.battle.played.map(card => ({ name: card.name, actor: card._playedByName, action: card._playedAction })));
  expect(responseTrail).toEqual([
    { name: "佯攻", actor: "罗卡尔", action: "打出了" },
    { name: "闪", actor: "罗卡尔", action: "使用了" },
  ]);

  await page.evaluate(() => {
    const battle = window.state.battle;
    window.BattleTurnState.cleanupTurn(battle, null, false, battle.allies.concat(battle.enemies));
    window.render();
  });
  await expect(page.locator(".card-trail")).toHaveCount(0);
  await logButton.click();
  await expect(page.locator(".battle-log-panel")).toBeVisible();
  await page.evaluate(() => {
    const replacement = window.GameStoreStateFactory.freshState();
    replacement.view = "hall";
    window.setState(replacement);
    window.render();
  });
  await expect(page.locator(".battle-log-panel")).toHaveCount(0);
  expect(await page.evaluate(() => window.battleLogOpen)).toBe(false);

}

module.exports = { verifyBattleResponsiveLayout, verifyBattleResponseTrail };
