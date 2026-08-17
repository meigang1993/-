const { test, expect } = require("@playwright/test");
const {
  collectErrors, relevantErrors, startRegressionBattle,
} = require("./helpers/preview-game");

test("flying-card artwork falls back after a named skill image fails", async ({ page }) => {
  await page.route("**/skill-art-military-order.3c919eca.webp", route => route.abort());
  await startRegressionBattle(page);
  const result = await page.evaluate(async () => {
    const card = { name: "军令状", type: "tactic", _skill: true };
    const primary = window.CardArt.url(card);
    const flight = window.BattleEffectCardDOM.front(card);
    await window.BattleEffectCardDOM.ready(flight);
    const image = flight.querySelector(".card-art img");
    const state = {
      primaryFailed: window.GameAssets.failed(primary),
      source: image?.getAttribute("src") || "",
      complete: !!image?.complete,
      width: image?.naturalWidth || 0,
    };
    flight.remove();
    return state;
  });
  expect(result).toEqual({
    primaryFailed: true,
    source: expect.stringContaining("card-art-charge.bfb8fcb9.webp"),
    complete: true,
    width: expect.any(Number),
  });
  expect(result.width).toBeGreaterThan(0);
});

test("player and enemy skill trail snapshots keep their named artwork", async ({ page }) => {
  await startRegressionBattle(page);
  const result = await page.evaluate(() => {
    const battle = window.state.battle;
    const player = battle.allies[0];
    const enemy = battle.enemies[0];
    player.ref = "skill_art_test_player";
    player.skills = [{
      name: "榨取精华", type: "active",
      card: { name: "榨取精华", type: "tactic" },
    }];
    enemy.id = "skill_art_test_enemy";
    enemy.ref = "skill_art_test_enemy";
    enemy.skills = [{ name: "毒气手雷", type: "active" }];
    battle.played = [];
    window.BattleSystem.useCard(
      window.state, player, player,
      { name: "榨取精华", type: "tactic", _skill: true });
    window.BattleSystem.useCard(
      window.state, enemy, enemy,
      { name: "毒气手雷", type: "tactic", _skill: true });
    return battle.played.map(card => ({
      name: card.name,
      skillName: card.skillName,
      isSkill: window.CardArt.isSkill(card),
      art: window.CardArt.url(card),
      flightLabel: window.BattleEffectCardDOM.front(card).textContent,
    }));
  });
  expect(result).toEqual([
    expect.objectContaining({
      name: "毒气手雷",
      skillName: "毒气手雷",
      isSkill: true,
      art: expect.stringContaining("skill-art-poison-grenade.fe4bfefd.webp"),
      flightLabel: expect.stringContaining("技能"),
    }),
    expect.objectContaining({
      name: "榨取精华",
      skillName: "榨取精华",
      isSkill: true,
      art: expect.stringContaining("skill-art-essence-extract.b7145c8f.webp"),
      flightLabel: expect.stringContaining("技能"),
    }),
  ]);
  await page.evaluate(() =>
    document.querySelectorAll(".flying-card").forEach(card => card.remove()));
});

test("enemy skill animation and resolved snapshot render one public card", async ({ page }) => {
  await startRegressionBattle(page);
  const state = await page.evaluate(async () => {
    const battle = window.state.battle;
    const enemy = battle.enemies[0];
    enemy.skills = [{ name: "毒气手雷", type: "active" }];
    enemy.ai = "krow_doctor";
    enemy.hand = [
      { name: "魔弹特攻", type: "tactic", suit: "♠" },
      { name: "灵魂锁链", type: "tactic", suit: "♠" },
    ];
    battle.played = [];
    battle.shownPlayed = [];
    const card = {
      name: "毒气手雷", type: "tactic", _skill: true,
      poisonGrenade: true, _playedFlightDone: true, targetless: true,
    };
    window.BattleSystem.revealPlayed(battle, card, { uid: enemy.uid });
    window.BattleSystem.useCard(window.state, enemy, enemy, card);
    window.render();
    await Promise.all([...document.querySelectorAll(".public-cards .card-art img")]
      .map(image => image.decode()));
    const trails = [...document.querySelectorAll(".public-cards .card-trail")];
    const poison = trails.filter(trail =>
      trail.querySelector(".card-title b")?.textContent === "毒气手雷");
    const names = trails.map(trail =>
      trail.querySelector(".card-title b")?.textContent);
    return {
      played: battle.played.length,
      shown: battle.shownPlayed.length,
      rendered: trails.length,
      firstName: names[0],
      costNames: names.slice(1).sort(),
      poisonCount: poison.length,
      label: poison[0]?.textContent || "",
      art: poison[0]?.querySelector(".card-art img")?.getAttribute("src") || "",
      decoded: [...document.querySelectorAll(".public-cards .card-art img")]
        .every(image => image.complete && image.naturalWidth > 0),
    };
  });
  expect(state).toEqual({
    played: 3,
    shown: 1,
    rendered: 3,
    firstName: "毒气手雷",
    costNames: ["灵魂锁链", "魔弹特攻"],
    poisonCount: 1,
    label: expect.stringContaining("技能"),
    art: expect.stringContaining("skill-art-poison-grenade.fe4bfefd.webp"),
    decoded: true,
  });
});
