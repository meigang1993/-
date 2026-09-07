const { test, expect } = require("@playwright/test");
const {
  collectErrors, relevantErrors, startRegressionBattle,
} = require("./helpers/preview-game");

test("draw animations use whole card backs with staggered launches", async ({ page }) => {
  const errors = collectErrors(page);
  await startRegressionBattle(page);
  const immediate = await page.evaluate(() => {
    document.querySelectorAll(".draw-card-fly").forEach(card => card.remove());
    const battle = window.state.battle;
    const actor = battle.allies[0];
    const cards = [
      { name: "测试摸牌一", suit: "♥", type: "tactic", _pendingDraw: true },
      { name: "测试摸牌二", suit: "♠", type: "slash", _pendingDraw: true },
    ];
    actor.hand.push(...cards);
    window.render();
    const launches = [];
    const started = performance.now();
    const originalBack = window.BattleEffectCardDOM.back;
    window.BattleEffectCardDOM.back = (card, ...args) => {
      if (/测试摸牌[一二]/.test(card?.name || "")) {
        launches.push(performance.now() - started);
      }
      return originalBack(card, ...args);
    };
    window.__drawLaunches = launches;
    window.__drawMotion = window.BattleEffectCards(window.BattleEffectUtils)
      .finishDraw({
        type: "drawBatch",
        uid: actor.uid,
        side: actor.side,
        count: cards.length,
        cards,
      }, window.render, () => true)
      .finally(() => { window.BattleEffectCardDOM.back = originalBack; });
    const flight = document.querySelector(".draw-card-fly");
    const style = getComputedStyle(flight);
    const backStyle = getComputedStyle(flight.querySelector(".card-flight-back"));
    return {
      face: flight?.dataset.cardFace,
      wholeCard: !!flight?.querySelector(".card-flight-back"),
      formalBack: backStyle.backgroundImage
        .includes("succubus-card-back.cca22db5.webp"),
      width: Math.round(parseFloat(style.width) || 0),
      opacity: Number(style.opacity),
    };
  });
  expect(immediate).toEqual({
    face: "back", wholeCard: true, formalBack: true, width: 86, opacity: 1,
  });
  await expect.poll(() => page.evaluate(() => window.__drawLaunches.length))
    .toBe(2);
  await page.evaluate(() => window.__drawMotion);
  const launches = await page.evaluate(() => window.__drawLaunches);
  expect(launches).toHaveLength(2);
  expect(launches[1] - launches[0]).toBeGreaterThanOrEqual(70);
  await expect(page.locator(".draw-card-fly")).toHaveCount(0);
  expect(await page.evaluate(() => window.state.battle.allies[0].hand
    .some(card => card._pendingDraw))).toBe(false);
  expect(relevantErrors(errors)).toEqual([]);
});

test("skill-cost discard flies face-up into the public play area", async ({ page }) => {
  const errors = collectErrors(page);
  await startRegressionBattle(page);
  const result = await page.evaluate(() => {
    const battle = window.state.battle;
    const actor = battle.allies[0];
    const card = { name: "公开费用牌", suit: "♦", type: "response" };
    actor.hand = [card];
    battle.animQueue = [];
    window.render();
    actor.hand.splice(0, 1);
    window.BattleCards.put(
      battle, actor, card, "discard", { showDiscard: true });
    const event = battle.animQueue.shift();
    window.__discardMotion = window.BattleEffectCards(window.BattleEffectUtils)
      .discardBatch(event, window.render, () => true);
    const flight = document.querySelector(".discard-card-fly");
    return {
      destination: event.toPublic,
      face: flight?.dataset.cardFace,
      title: flight?.textContent,
    };
  });
  expect(result.destination).toBe(true);
  expect(result.face).toBe("front");
  expect(result.title).toContain("♦");
  expect(result.title).toContain("公开费用牌");
  await page.evaluate(() => window.__discardMotion);
  await expect(page.locator(".discard-card-fly")).toHaveCount(0);
  expect(relevantErrors(errors)).toEqual([]);
});

test("real skill flights use named artwork without replacing represented card art", async ({ page }) => {
  await startRegressionBattle(page);
  const artwork = await page.evaluate(() => {
    const cards = {
      player: { name: "榨取精华", type: "tactic", _skill: true },
      enemy: { name: "控神魔眼", type: "tactic", _skill: true },
      relic: { name: "鬼王扑克", type: "tactic", _skill: true },
      virtual: { name: "机枪扫杀", type: "slash", _skill: true, virtual: true },
      converted: {
        name: "雷杀", type: "slash", _skill: true,
        skillName: "测试转换", convertedFrom: "测试转换",
      },
      unknown: { name: "未来主动技能", type: "tactic", _skill: true },
    };
    const source = card =>
      card.querySelector(".card-art img")?.getAttribute("src") || "";
    const nodes = Object.fromEntries(Object.entries(cards).map(([key, card]) =>
      [key, window.BattleEffectCardDOM.front(card)]));
    const result = Object.fromEntries(Object.entries(nodes).map(([key, node]) =>
      [key, source(node)]));
    Object.values(nodes).forEach(node => node.remove());
    return result;
  });
  expect(artwork.player).toContain("skill-art-essence-extract.b7145c8f.webp");
  expect(artwork.enemy).toContain("skill-art-control-eye.1291a4db.webp");
  expect(artwork.relic).toContain("skill-art-demon-poker.22d93d33.webp");
  expect(artwork.virtual).toContain("card-art-gatling-slash.295b69b7.webp");
  expect(artwork.converted).toContain("card-art-thunder-slash.9263b699.webp");
  expect(artwork.unknown).toContain("card-art-charge.bfb8fcb9.webp");
});

test("flying-card motion starts without waiting for artwork decode", async ({ page }) => {
  await startRegressionBattle(page);
  const result = await page.evaluate(async () => {
    const originalDecode = HTMLImageElement.prototype.decode;
    let decodeCalls = 0;
    HTMLImageElement.prototype.decode = function delayedFlightDecode() {
      if (!this.src.includes("skill-art-military-order.3c919eca.webp")) {
        return originalDecode.call(this);
      }
      decodeCalls += 1;
      return new Promise(resolve => setTimeout(resolve, 600));
    };
    const starts = [];
    const base = window.BattleEffectUtils;
    const motion = window.BattleEffectCardMotion({
      ...base,
      runAnim: (node, frames, options) => {
        const image = node.querySelector(".card-art img");
        starts.push({
          elapsed: performance.now() - started,
          source: image?.getAttribute("src") || "",
        });
        return base.runAnim(node, frames, options);
      },
    });
    const started = performance.now();
    try {
      await motion.flyFrontCards({
        cards: [{ name: "军令状", type: "tactic", _skill: true }],
        from: { x: 120, y: 120 },
        to: { x: 360, y: 240 },
      });
    } finally {
      HTMLImageElement.prototype.decode = originalDecode;
    }
    return { ...starts[0], decodeCalls };
  });
  expect(result.elapsed).toBeLessThan(300);
  expect(result.source).toContain("skill-art-military-order.3c919eca.webp");
  expect(result.decodeCalls).toBe(0);
});
