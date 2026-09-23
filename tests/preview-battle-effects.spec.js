const { test, expect } = require("@playwright/test");
const {
  startRegressionBattle,
} = require("./helpers/preview-game");

test("Nanali partial Apollo seal updates the target hand count before the flight finishes", async ({ page }) => {
  await startRegressionBattle(page);
  const result = await page.evaluate(() => {
    const battle = window.state.battle;
    const nanali = battle.allies[0];
    const source = battle.enemies[0];
    battle.allies = [nanali];
    battle.enemies = [source];
    battle.test = false;
    battle.locked = false;
    battle.animQueue = [];
    Object.assign(nanali, {
      ref: "nanali", name: "娜娜莉", hp: 20, maxHp: 20, block: 0, defenseSystem: 0,
      stats: { ...nanali.stats, attack: 3, magic: 3 }, skills: [], discard: [], consumed: [],
    });
    Object.assign(source, {
      ref: "test_enemy", name: "测试敌人", side: "enemy", ai: null, hp: 30, maxHp: 30,
      block: 0, defenseSystem: 0, skills: [], discard: [], consumed: [], nanaliSealed: [],
    });
    const slash = { name: "杀（普攻）", suit: "♠", type: "slash", power: 1, scale: "attack", ignoreResponse: true };
    nanali.hand = [slash];
    nanali.intent = 3;
    source.hand = [
      { name: "目标牌1", suit: "♣", type: "tactic" },
      { name: "目标牌2", suit: "♥", type: "tactic" },
      { name: "目标牌3", suit: "♦", type: "tactic" },
    ];
    window.render();
    const handText = () => document.querySelector(`[data-target="${source.uid}"] .unit-hand`)?.textContent.trim();
    const before = handText();
    window.BattleSystem.useCard(window.state, nanali, source, slash);
    const sealEvent = battle.animQueue.find(event => event.type === "sealCards");
    battle.animQueue = battle.animQueue.filter(event => event !== sealEvent);
    const stale = handText();
    window.__nanaliPartialSeal = window.BattleEffectCards(window.BattleEffectUtils)
      .sealCards(sealEvent, window.render, () => true);
    return {
      before,
      stale,
      during: handText(),
      targetHand: source.hand.length,
      sealed: source.nanaliSealed.length,
      flying: document.querySelectorAll(".seal-card-fly").length,
    };
  });
  expect(result).toEqual({
    before: "3/4",
    stale: "3/4",
    during: "2/4",
    targetHand: 2,
    sealed: 1,
    flying: 1,
  });
  await page.evaluate(() => window.__nanaliPartialSeal);
  await expect(page.locator(".seal-card-fly")).toHaveCount(0);
});

test("Nanali repeated Apollo seals display every hand-count decrement", async ({ page }) => {
  await startRegressionBattle(page);
  const result = await page.evaluate(async () => {
    const battle = window.state.battle;
    const nanali = battle.allies[0];
    const source = battle.enemies[0];
    battle.allies = [nanali];
    battle.enemies = [source];
    battle.test = false;
    battle.locked = false;
    battle.animQueue = [];
    Object.assign(nanali, {
      ref: "nanali", name: "娜娜莉", hp: 20, maxHp: 20, block: 0, defenseSystem: 0,
      stats: { ...nanali.stats, attack: 3, magic: 3 }, skills: [], hand: [], discard: [], consumed: [],
    });
    Object.assign(source, {
      ref: "test_enemy", name: "测试敌人", side: "enemy", ai: null, hp: 30, maxHp: 30,
      block: 0, defenseSystem: 0, skills: [], discard: [], consumed: [], nanaliSealed: [],
      hand: [
        { name: "目标牌1", suit: "♣", type: "tactic" },
        { name: "目标牌2", suit: "♥", type: "tactic" },
        { name: "目标牌3", suit: "♦", type: "tactic" },
      ],
    });
    window.render();
    const handText = () => document.querySelector(`[data-target="${source.uid}"] .unit-hand`)?.textContent.trim();
    const counts = [handText()];
    for (let i = 0; i < 3; i++) {
      const slash = { name: "杀（普攻）", suit: "♠", type: "slash", power: 1, scale: "attack", ignoreResponse: true };
      window.ElranaAceNanaliSkills.beforeKillTargeted(window.state, nanali, source, slash, { draw() {} });
    }
    const events = battle.animQueue.filter(event => event.type === "sealCards");
    window.render();
    counts.push(handText());
    battle.animQueue = [];
    const cards = window.BattleEffectCards(window.BattleEffectUtils);
    for (const event of events) {
      const running = cards.sealCards(event, window.render, () => true);
      counts.push(handText());
      await running;
    }
    window.BattleEffectHandlers.clearVisuals(window.state);
    window.render();
    counts.push(handText());
    return {
      counts,
      snapshots: events.map(event => [event.visualHandBefore, event.visualHandCount]),
      targetHand: source.hand.length,
      sealed: source.nanaliSealed.length,
    };
  });
  expect(result).toEqual({
    counts: ["3/4", "3/4", "2/4", "1/4", "0/4", "0/4"],
    snapshots: [[3, 2], [2, 1], [1, 0]],
    targetHand: 0,
    sealed: 3,
  });
});

test("Speed Wing combo responses display each hand-count decrement", async ({ page }) => {
  await startRegressionBattle(page);
  const result = await page.evaluate(async () => {
    const battle = window.state.battle;
    const flora = battle.allies[0];
    const attacker = battle.enemies[0];
    battle.allies = [flora];
    battle.enemies = [attacker];
    battle.test = false;
    battle.locked = false;
    battle.animQueue = [];
    window.state.settings.manualResponse = false;
    Object.assign(flora, {
      ref: "flora", name: "芙萝娅", side: "ally", hp: 20, maxHp: 20,
      block: 0, defenseSystem: 0, skills: [{ name: "神速之翼" }],
      stats: { ...flora.stats, handLimit: 5 },
      hand: [
        { name: "翼牌1", suit: "♣", type: "tactic" },
        { name: "翼牌2", suit: "♥", type: "tactic" },
        { name: "翼牌3", suit: "♦", type: "tactic" },
      ],
      discard: [], consumed: [],
    });
    Object.assign(attacker, {
      ref: "combo_enemy", name: "连击敌人", side: "enemy", ai: null,
      hp: 30, maxHp: 30, block: 0, defenseSystem: 0, skills: [],
      hand: [], discard: [], consumed: [],
      stats: { ...attacker.stats, attack: 2, magic: 0 },
    });
    window.render();
    const handText = () => document.querySelector(
      `[data-target="${flora.uid}"] .unit-hand`
    )?.textContent.trim();
    const counts = [handText()];
    for (let i = 0; i < 3; i += 1) {
      window.BattleSystem.damage(window.state, flora, 2, "连击测试", attacker, {
        name: "杀（普攻）", suit: "♠", type: "slash",
        power: 1, scale: "attack",
      });
    }
    const events = battle.animQueue.filter(event => event.type === "response");
    window.render();
    counts.push(handText());
    battle.animQueue = [];
    for (const event of events) {
      const running = window.BattleEffectHandlers.response(
        window.state, event, window.render, () => true
      );
      counts.push(handText());
      await running;
    }
    window.BattleEffectHandlers.clearVisuals(window.state);
    window.render();
    counts.push(handText());
    return {
      counts,
      snapshots: events.map(event => [
        event.visualHandBefore, event.visualHandCount,
      ]),
      hand: flora.hand.length,
      discard: (flora.pileStats || flora).discard.length,
      hp: flora.hp,
    };
  });
  expect(result).toEqual({
    counts: ["3/5", "3/5", "2/5", "1/5", "0/5", "0/5"],
    snapshots: [[3, 2], [2, 1], [1, 0]],
    hand: 0,
    discard: 3,
    hp: 20,
  });
});

test("response follow-up draws update the held hand count on arrival", async ({ page }) => {
  await startRegressionBattle(page);
  const result = await page.evaluate(async () => {
    const battle = window.state.battle;
    const responder = battle.allies[0];
    const opponent = battle.enemies[0];
    battle.allies = [responder];
    battle.enemies = [opponent];
    battle.animQueue = [];
    battle.activeUid = responder.uid;
    const drawn = {
      name: "响应后摸牌", suit: "♣", type: "tactic", _pendingDraw: true,
    };
    Object.assign(responder, {
      hand: [drawn], discard: [], consumed: [], visualHandCount: 1,
      stats: { ...responder.stats, handLimit: 5 },
    });
    window.render();
    const handText = () => document.querySelector(
      `[data-target="${responder.uid}"] .unit-hand, `
      + `[data-active-info="${responder.uid}"] .unit-hand`
    )?.textContent.trim();
    const counts = [handText()];
    await window.BattleEffectHandlers.response(window.state, {
      type: "response", id: "response-draw-test",
      uid: responder.uid, side: responder.side,
      card: { name: "闪", suit: "♥", type: "response" },
      visualHandBefore: 1, visualHandCount: 0, visualHandDelta: -1,
    }, window.render, () => true);
    counts.push(handText());
    await window.BattleEffectCards(window.BattleEffectUtils).finishDraw({
      type: "drawBatch", uid: responder.uid, side: responder.side,
      count: 1, cards: [drawn],
    }, window.render, () => true);
    counts.push(handText());
    return {
      counts,
      pending: !!drawn._pendingDraw,
    };
  });
  expect(result).toEqual({
    counts: ["1/5", "0/5", "1/5"],
    pending: false,
  });
});

test("pending-revival Risa receives Magic Refinement draws", async ({ page }) => {
  await startRegressionBattle(page);
  const setup = await page.evaluate(async () => {
    await window.BattleActionGuard.whenIdle();
    window.BattleEffects.cancel(window.state);
    const battle = window.state.battle;
    const actor = battle.allies[0];
    const risa = battle.enemies[0];
    battle.allies = [actor];
    battle.enemies = [risa];
    battle.activeUid = actor.uid;
    battle.phase = 4;
    battle.test = false;
    battle.locked = true;
    battle.animQueue = [];
    battle.played = [];
    battle.shownPlayed = [];
    battle.turn = (battle.turn || 0) + 1;
    battle.roundOrder = [actor.uid, risa.uid];
    battle.roundIndex = 1;
    battle.selectedCardIndex = null;
    battle.selectedSkillCard = null;
    battle.pendingTargetUid = null;
    delete battle.prepareUnitUid;
    delete battle.endPhaseUnitUid;
    battle.risaEye = null;
    battle.risaEyePrompt = {
      targetUid: actor.uid,
      risaUids: [risa.uid],
      index: 0,
      attempts: 0,
      tied: false,
      result: {
        eyeChoice: "石头",
        targetChoice: "剪刀",
        outcome: "risa",
      },
    };
    Object.assign(actor, {
      name: "被标记者", side: "ally", hp: 30, maxHp: 30,
      hand: [{
        name: "魔力提炼", suit: "♥", type: "tactic",
        drawCards: 2, targetless: true,
      }],
      deck: [
        { name: "提炼牌A", suit: "♣", type: "tactic" },
        { name: "提炼牌B", suit: "♠", type: "slash" },
      ],
    });
    Object.assign(risa, {
      id: "assassin_sakura_risa", ref: "assassin_sakura_risa",
      ai: "assassin_sakura_risa", name: "内英组杀手樱羽丽莎",
      side: "enemy", hp: 30, maxHp: 30,
      hand: [{ name: "待复活手牌", suit: "♦", type: "response" }],
      visualHandCount: 1,
      stats: { ...risa.stats, handLimit: 4 },
    });
    window.render();
    return { actorUid: actor.uid, risaUid: risa.uid };
  });
  await page.locator("[data-risa-eye-result-confirm]").click();
  await page.evaluate(() => window.BattleActionGuard.whenIdle());
  const afterConfirm = await page.evaluate(() => ({
    marked: window.state.battle.risaEye?.targetUid,
    locked: window.state.battle.locked,
  }));
  expect(afterConfirm).toEqual({
    marked: setup.actorUid,
    locked: false,
  });
  await page.evaluate(() => {
    const risa = window.state.battle.enemies[0];
    risa.hp = 0;
    risa.risaRevivePending = true;
    risa.statuses = ["待复活"];
    window.render();
  });
  const magicRefining = page.locator(
    `[data-hand-owner="${setup.actorUid}"] [data-card-index="0"]`
  );
  await magicRefining.click();
  await magicRefining.click();
  await page.evaluate(() => window.BattleActionGuard.whenIdle());
  await page.evaluate(() => window.BattleEffects.whenIdle());
  const result = await page.evaluate(() => {
    const battle = window.state.battle;
    const actor = battle.allies[0];
    const risa = battle.enemies[0];
    const handText = document.querySelector(
      `[data-target="${risa.uid}"] .unit-hand`
    )?.textContent.trim();
    const value = {
      actorHand: actor.hand.map(card => card.name),
      risaHand: risa.hand.map(card => card.name),
      pending: risa.hand.filter(card => card._pendingDraw).length,
      handText,
      queue: battle.animQueue.length,
      animating: window.BattleEffects.animating,
      draining: window.BattleEffects.draining,
    };
    return value;
  });
  expect(result).toEqual({
    actorHand: [],
    risaHand: ["待复活手牌", "提炼牌B", "提炼牌A"],
    pending: 0,
    handText: "3/4",
    queue: 0,
    animating: false,
    draining: false,
  });
});
