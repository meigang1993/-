const { test, expect } = require("@playwright/test");
const {
  collectErrors, relevantErrors, openGame, startRegressionBattle,
} = require("./helpers/preview-game");

test("fatal targets keep their hand until the death feedback finishes", async ({ page }) => {
  await startRegressionBattle(page);
  const results = await page.evaluate(() => {
    const battle = window.state.battle;
    battle.test = false;
    return ["ally", "enemy"].flatMap(side => ["damage", "hp-loss"].map(kind => {
      const target = side === "ally" ? battle.allies[0] : battle.enemies[0];
      target.hp = 0;
      target.hand = [{ name: `${side}-${kind}`, type: "tactic" }];
      target.deathDiscarded = false;
      battle.animQueue = [{ type: "float", kind, uid: target.uid, visualHp: 0 }];
      window.BattleSystem.checkDefeat(window.state);
      const during = { hand: target.hand.length, discarded: !!target.deathDiscarded };
      battle.animQueue = [];
      window.BattleSystem.checkDefeat(window.state);
      const after = { hand: target.hand.length, discarded: !!target.deathDiscarded };
      target.hp = 10;
      battle.failedTriggered = false;
      battle.pendingDefeat = false;
      battle.locked = false;
      return { side, kind, during, after };
    }));
  });
  expect(results).toEqual([
    { side: "ally", kind: "damage", during: { hand: 1, discarded: false }, after: { hand: 0, discarded: true } },
    { side: "ally", kind: "hp-loss", during: { hand: 1, discarded: false }, after: { hand: 0, discarded: true } },
    { side: "enemy", kind: "damage", during: { hand: 1, discarded: false }, after: { hand: 0, discarded: true } },
    { side: "enemy", kind: "hp-loss", during: { hand: 1, discarded: false }, after: { hand: 0, discarded: true } },
  ]);
});

test("Overlord resistance pays two cards before cleansing a status", async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page);
  const result = await page.evaluate(() => {
    const elite = {
      uid: "overlord-resistance-test",
      side: "enemy",
      type: "elite",
      name: "测试精英",
      skills: [{ name: "霸王色抗性" }],
      hand: [],
      deck: [],
      discard: [],
      consumed: [],
      statuses: [],
    };
    const testState = {
      log: [],
      battle: {
        allies: [],
        enemies: [elite],
        animQueue: [],
        played: [],
      },
    };
    const battle = testState.battle;
    const clearPiles = () => {
      elite.deck.length = 0;
      elite.discard.length = 0;
      elite.consumed.length = 0;
      battle.animQueue = [];
      battle.played = [];
      testState.log = [];
    };

    clearPiles();
    elite.hand = [
      window.BattleStatusCards.create("stun"),
      { name: "抗性费用A", suit: "♥", type: "tactic" },
      { name: "抗性费用B", suit: "♦", type: "response" },
    ];
    const paid = window.BattleStatusCards.resolveResistance(testState, elite);
    const discardEvent = battle.animQueue.find(event =>
      event.type === "discardBatch");
    const paidResult = {
      paid,
      hand: elite.hand.map(card => card.name),
      discard: elite.discard.map(card => card.name),
      consumed: elite.consumed.map(card => card.name),
      queue: battle.animQueue.map(event => event.type),
      discardEvent: {
        toPublic: discardEvent?.toPublic,
        cards: discardEvent?.cards.map(card => card.name) || [],
      },
      publicCards: battle.played.map(card => ({
        name: card.name,
        action: card._playedAction,
        pile: card._destinationPile,
      })),
      log: testState.log.find(message => message.includes("霸王色抗性")) || "",
    };

    clearPiles();
    elite.hand = [
      window.BattleStatusCards.create("stun"),
      { name: "仅一张费用", suit: "♥", type: "response" },
    ];
    elite.deck.push({ name: "黑色判定", suit: "♠", type: "tactic" });
    elite.skipPlayPhase = false;
    const unpaid = window.BattleStatusCards.resolveResistance(testState, elite);
    window.BattleStatusCards.judgement(testState, elite);
    return {
      paid: paidResult,
      unpaid: {
        paid: unpaid,
        hand: elite.hand.map(card => card.name),
        consumed: elite.consumed.map(card => card.name),
        queue: battle.animQueue.map(event => event.type),
        skipPlayPhase: elite.skipPlayPhase,
      },
    };
  });
  expect(result.paid).toEqual({
    paid: true,
    hand: [],
    discard: ["抗性费用A", "抗性费用B"],
    consumed: ["眩晕"],
    queue: ["discardBatch", "burnCard"],
    discardEvent: {
      toPublic: true,
      cards: ["抗性费用A", "抗性费用B"],
    },
    publicCards: [
      { name: "抗性费用B", action: "弃置了", pile: "discard" },
      { name: "抗性费用A", action: "弃置了", pile: "discard" },
    ],
    log: expect.stringContaining("弃置抗性费用A、抗性费用B，移除眩晕状态牌"),
  });
  expect(result.unpaid).toEqual({
    paid: false,
    hand: ["眩晕", "仅一张费用"],
    consumed: [],
    queue: ["judgement"],
    skipPlayPhase: true,
  });
  expect(relevantErrors(errors)).toEqual([]);
});

test("play-phase draws follow the newest hand card", async ({ page }) => {
  await startRegressionBattle(page);
  await page.evaluate(() => {
    const battle = window.state.battle, actor = window.BattleSystem.active(battle);
    actor.hand = Array.from({ length: 14 }, (_, index) => ({
      name: `测试牌${index + 1}`, suit: index % 2 ? "♣" : "♥", type: "tactic",
    }));
    window.render();
    const hand = document.querySelector(".active-hand");
    hand.scrollLeft = 0;
    actor.hand.push({ name: "新摸到的牌", suit: "♦", type: "tactic", _pendingDraw: true });
    window.render();
    delete actor.hand.at(-1)._pendingDraw;
    window.render();
  });
  await expect.poll(() => page.locator(".active-hand").evaluate(hand => ({
    scrollable: hand.scrollWidth > hand.clientWidth,
    atNewest: hand.scrollWidth - hand.clientWidth - hand.scrollLeft < 3,
  }))).toEqual({ scrollable: true, atNewest: true });
});

test("Magic Bullet reveal remains locked until a hand card is selected", async ({ page }) => {
  await startRegressionBattle(page);
  await page.evaluate(() => {
    const battle = window.state.battle, actor = battle.enemies[0], target = battle.allies[0];
    actor.hand = [{ name: "同花色费用", suit: "♥", type: "tactic" }];
    target.hand = [
      window.BattleStatusCards.create("seal"),
      { name: "必须展示", suit: "♥", type: "response" },
    ];
    battle.handReveal = {
      actorUid: actor.uid,
      targetUid: target.uid,
      cardName: "魔弹特攻",
      card: { name: "魔弹特攻", type: "tactic", magicBullet: true },
      mode: "magicBulletReveal",
      repeatAfter: false,
    };
    battle.locked = true;
    window.render();
  });
  await expect(page.locator("[data-hand-reveal-close]")).toHaveCount(0);
  await expect(page.locator(".hand-panel [data-hand-reveal-pick='0']")).toHaveCount(1);
  await expect(page.locator(".hand-panel [data-hand-reveal-pick]")).toHaveCount(1);
  await expect(page.locator(".hand-panel [data-hand-reveal-pick='0']")).toContainText("必须展示");
  await expect(page.locator(".hand-panel")).not.toContainText("封魔");
  await expect(page.locator(".hand-reveal-overlay")).toHaveCount(0);
  await page.locator(".battle-screen").dispatchEvent("contextmenu");
  await expect.poll(() => page.evaluate(() => ({
    mode: window.state.battle.handReveal?.mode,
    locked: window.state.battle.locked,
  }))).toEqual({ mode: "magicBulletReveal", locked: true });
  expect(await page.evaluate(() => window.BattleSystem.resolveHandReveal(window.state, null))).toBe(true);
  expect(await page.evaluate(() => ({
    mode: window.state.battle.handReveal?.mode,
    locked: window.state.battle.locked,
  }))).toEqual({ mode: "magicBulletReveal", locked: true });
  await page.locator("[data-hand-reveal-pick='0']").dispatchEvent("pointerdown");
  await expect.poll(() => page.evaluate(() => ({
    reveal: window.state.battle.handReveal,
    locked: window.state.battle.locked,
  }))).toEqual({ reveal: null, locked: false });
});

test("Magic Bullet target highlighting ignores status-only hands", async ({ page }) => {
  await startRegressionBattle(page);
  const targets = await page.evaluate(() => {
    const battle = window.state.battle, actor = battle.allies[0];
    const statusOnly = battle.enemies[0], displayable = battle.enemies[1];
    battle.activeUid = actor.uid;
    battle.phase = 4;
    battle.locked = false;
    actor.hand = [window.CardUtils.cloneEntity("魔弹特攻", { suit: "♠" })];
    statusOnly.hand = [window.BattleStatusCards.create("stun")];
    displayable.hand = [
      window.BattleStatusCards.create("seal"),
      { name: "可展示牌", suit: "♦", type: "response" },
    ];
    battle.selectedCardIndex = 0;
    window.render();
    return { statusOnly: statusOnly.uid, displayable: displayable.uid };
  });
  await expect(page.locator(`[data-target="${targets.statusOnly}"]`))
    .not.toHaveClass(/selectable-target/);
  await expect(page.locator(`[data-target="${targets.displayable}"]`))
    .toHaveClass(/selectable-target/);
});

test("manual responses and Magic Bullet costs use the hand action area", async ({ page }) => {
  await startRegressionBattle(page);
  const result = await page.evaluate(() => {
    const battle = window.state.battle, ally = battle.allies[0], enemy = battle.enemies[0];
    battle.activeUid = ally.uid;
    battle.phase = 4;
    battle.locked = false;
    window.render();
    const endWidth = document.querySelector("[data-end-play]").getBoundingClientRect().width;
    battle.allies.slice(1).forEach(unit => { unit.hand = []; });
    ally.hand = [{ name: "闪", suit: "♦", type: "response" }, { name: "看破", suit: "♣", type: "response", counterTactic: true }];
    battle.manualDodge = { actorUid: enemy.uid, targetUid: ally.uid, card: { name: "杀（普攻）", type: "slash" }, selectedIndex: 0 };
    battle.locked = true;
    window.render();
    const dodge = {
      cards: document.querySelectorAll(".hand-panel [data-manual-dodge-pick]").length,
      overlayCards: document.querySelectorAll(".manual-dodge-overlay .manual-dodge-card").length,
      cancelWidth: document.querySelector("[data-manual-dodge-cancel]").getBoundingClientRect().width,
      cancelInHead: !!document.querySelector(".hand-head [data-manual-dodge-cancel]"),
    };
    battle.manualDodge = null;
    battle.manualCounter = { actorUid: enemy.uid, targetUid: ally.uid, card: { name: "测试战术", type: "tactic" }, selectedIndex: 0 };
    window.render();
    const counter = {
      cards: document.querySelectorAll(".hand-panel [data-manual-counter-pick]").length,
      overlay: document.querySelectorAll(".manual-dodge-overlay").length,
      cancelWidth: document.querySelector("[data-manual-counter-cancel]").getBoundingClientRect().width,
      cancelInHead: !!document.querySelector(".hand-head [data-manual-counter-cancel]"),
    };
    battle.manualCounter = null;
    battle.handReveal = {
      actorUid: ally.uid, targetUid: enemy.uid, cardName: "魔弹特攻",
      card: { name: "魔弹特攻", type: "tactic", magicBullet: true },
      mode: "magicBullet", shownSuit: "♦", shownCard: { name: "目标牌", suit: "♦" }, validIndexes: [0],
    };
    window.render();
    const bullet = {
      cards: document.querySelectorAll(".hand-panel [data-hand-reveal-pick]").length,
      overlay: document.querySelectorAll(".hand-reveal-overlay").length,
      cancelWidth: document.querySelector("[data-hand-reveal-close]").getBoundingClientRect().width,
      cancelInHead: !!document.querySelector(".hand-head [data-hand-reveal-close]"),
    };
    return { endWidth, dodge, counter, bullet };
  });
  expect(result.dodge).toMatchObject({ cards: 1, overlayCards: 0, cancelInHead: true });
  expect(result.counter).toMatchObject({ cards: 1, overlay: 0, cancelInHead: true });
  expect(result.bullet).toMatchObject({ cards: 1, overlay: 0, cancelInHead: true });
  expect(result.dodge.cancelWidth).toBeGreaterThanOrEqual(result.endWidth);
  expect(result.counter.cancelWidth).toBeGreaterThanOrEqual(result.endWidth);
  expect(result.bullet.cancelWidth).toBeGreaterThanOrEqual(result.endWidth);
});

test("displayed battle cards keep one bounded size across reveal surfaces", async ({ page }) => {
  await page.setViewportSize({ width: 809, height: 483 });
  await startRegressionBattle(page);
  const sizes = await page.evaluate(() => {
    const battle = window.state.battle, actor = battle.enemies[0], target = battle.allies[0];
    target.hand = [
      { name: "展示牌一", suit: "♥", type: "response", text: "展示测试。" },
      { name: "展示牌二", suit: "♦", type: "tactic", text: "展示测试。" },
      { name: "展示牌三", suit: "♣", type: "slash", text: "展示测试。" },
    ];
    battle.handReveal = {
      actorUid: actor.uid, targetUid: target.uid, cardName: "魔弹特攻",
      card: { name: "魔弹特攻", type: "tactic", magicBullet: true },
      mode: "magicBulletReveal",
    };
    battle.locked = true;
    window.render();
    const read = selector => [...document.querySelectorAll(selector)].map(element => {
      const rect = element.getBoundingClientRect();
      return [element.offsetWidth || Math.round(rect.width), element.offsetHeight || Math.round(rect.height)];
    });
    const hand = {
      buttons: read(".response-hand-panel .hand-response-card"),
      cards: read(".response-hand-panel .hand-response-card .play-card"),
    };
    battle.handReveal = null;
    battle.revealCards = {
      id: "display-size-reveal",
      title: "展示测试",
      cards: [{ name: "展示牌一", suit: "♥", type: "response", text: "展示测试。" }],
    };
    window.render();
    const reveal = {
      wraps: read(".reveal-card-wrap"),
      cards: read(".reveal-card-wrap .play-card"),
    };
    return { hand, reveal };
  });
  expect(sizes.hand.buttons).toHaveLength(3);
  expect(new Set(sizes.hand.buttons.map(size => size.join("x"))).size).toBe(1);
  expect(sizes.hand.cards).toEqual(sizes.hand.buttons);
  expect(sizes.hand.buttons[0][0]).toBe(104);
  expect(sizes.hand.buttons[0][1]).toBeGreaterThan(0);
  expect(sizes.reveal.wraps).toEqual([[88, 132]]);
  expect(sizes.reveal.cards).toEqual([[88, 132]]);
});

test("battle clash stays above captions without locked-screen dimming", async ({ page }) => {
  await startRegressionBattle(page);
  const styles = await page.evaluate(() => {
    const battle = window.state.battle, actor = battle.enemies[0];
    battle.skillCaption = { id: "whip-caption", side: actor.side, text: `${actor.name} 发动了 爱之鞭挞` };
    battle.lastClash = { id: "whip-clash", result: "成功", a: "♥", t: "♠" };
    battle.locked = true;
    window.render();
    const clash = getComputedStyle(document.querySelector(".clash-popup"));
    const caption = getComputedStyle(document.querySelector(".skill-caption"));
    return { clashZ: Number(clash.zIndex), captionZ: Number(caption.zIndex), filter: clash.filter };
  });
  expect(styles.clashZ).toBeGreaterThan(styles.captionZ);
  expect(styles.filter).toBe("none");
});

test("battle detail shows one primary role beside the name and in skill hover text", async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 800, height: 420 });
  await startRegressionBattle(page);
  await page.evaluate(() => {
    const actor = window.BattleSystem.active(window.state.battle);
    actor.ref = "manny";
    actor.name = "曼妮";
    actor.combatRoles = ["输出", "控制"];
    window.render();
  });
  const unit = page.locator(".ally-row .unit").first();
  const art = unit.locator(".unit-art");
  const expected = await unit.evaluate(node => {
    const target = window.state.battle.allies.find(item => item.uid === node.dataset.target);
    return window.UICommon.skillSummary(target);
  });
  await expect(art).toHaveAttribute("title", expected);
  await expect(art).not.toHaveAttribute("title", /实战定位：/);
  await expect(unit.locator(".unit-name .combat-role")).toHaveCount(0);
  const activeSkill = page.locator(".active-skills .skill").first();
  await expect(activeSkill).toBeVisible();
  await expect(activeSkill).toHaveAttribute("title", /实战定位：/);
  await page.locator("[data-active-info]").first().click();
  const detailTitle = page.locator(".info-overlay .info-title-row");
  await expect(detailTitle.locator("h2")).toBeVisible();
  await expect(detailTitle.locator(".combat-role")).toHaveCount(1);
  const expectedRole = await page.evaluate(() => {
    const battle = window.state.battle;
    const unitData = [...battle.allies, ...battle.enemies]
      .find(item => item.uid === window.state.infoUnit);
    return window.UICommon.combatRolesOf(unitData)[0];
  });
  await expect(detailTitle.locator(".combat-role")).toHaveText(expectedRole);
  expect(await detailTitle.evaluate(row => {
    const bounds = row.getBoundingClientRect();
    const section = row.closest("section").getBoundingClientRect();
    return bounds.left >= section.left && bounds.right <= section.right;
  })).toBe(true);
  await page.locator("[data-info-tab='skills']").click();
  await expect(page.locator(".info-overlay .role-position")).toHaveCount(1);
  await expect(page.locator(".skill-detail .skill").first())
    .toHaveAttribute("title", new RegExp(`实战定位：${expectedRole}`));
  await expect(page.locator(".battle-screen .unit-skill-tooltip")).toHaveCount(0);
  expect(relevantErrors(errors)).toEqual([]);
});

test("all playable characters keep readable skill buttons in the active battle panel", async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 800, height: 420 });
  await startRegressionBattle(page);
  const result = await page.evaluate(() => {
    const battle = window.state.battle;
    const actor = battle.allies[0];
    const snapshots = [];
    window.GameData.characters.forEach(template => {
      actor.ref = template.id;
      actor.name = template.name;
      actor.combatRoles = template.combatRoles;
      actor.skills = template.skills;
      actor.side = "ally";
      actor.hp = actor.maxHp = 100;
      actor.intent = 10;
      battle.activeUid = actor.uid;
      battle.phase = 4;
      battle.locked = false;
      battle.selectedSkillCard = null;
      window.render();
      const expected = window.UICommon.skillsOf(actor)
        .filter(skill => skill.source !== "relic" && skill.source !== "derived");
      const buttons = [...document.querySelectorAll(".active-skills .skill")];
      const activeBox = document.querySelector(".active-info").getBoundingClientRect();
      const skillViewport = document.querySelector(".active-skills");
      const skillBox = skillViewport.getBoundingClientRect();
      const overflow = skillBox.left < activeBox.left - 1
        || skillBox.right > activeBox.right + 1
        || skillBox.top < activeBox.top - 1
        || skillBox.bottom > activeBox.bottom + 1;
      skillViewport.scrollTop = skillViewport.scrollHeight;
      const last = buttons[buttons.length - 1]?.getBoundingClientRect();
      const lastReachable = !last || (
        last.top >= skillBox.top - 1 && last.bottom <= skillBox.bottom + 1
      );
      snapshots.push({
        id: template.id,
        expected: expected.length,
        rendered: buttons.length,
        missingIcon: buttons.some(button => !button.querySelector("span")?.textContent.trim()),
        missingName: buttons.some(button => !button.querySelector("em")?.textContent.trim()),
        missingTip: buttons.some(button => !button.title.includes(template.combatRoles[0])),
        overflow,
        scrollable: skillViewport.scrollHeight > skillViewport.clientHeight,
        lastReachable,
        skillViewport: {
          left: skillBox.left, right: skillBox.right,
          top: skillBox.top, bottom: skillBox.bottom,
        },
        activePanel: {
          left: activeBox.left, right: activeBox.right,
          top: activeBox.top, bottom: activeBox.bottom,
        },
      });
    });
    return snapshots;
  });
  result.forEach(snapshot => {
    expect(snapshot.rendered, `${snapshot.id} skill count`).toBe(snapshot.expected);
    expect(snapshot.missingIcon, `${snapshot.id} icon`).toBe(false);
    expect(snapshot.missingName, `${snapshot.id} name`).toBe(false);
    expect(snapshot.missingTip, `${snapshot.id} tooltip`).toBe(false);
    expect(snapshot.overflow,
      `${snapshot.id} skill viewport overflow ${JSON.stringify(snapshot)}`)
      .toBe(false);
    if (snapshot.expected > 2) {
      expect(snapshot.scrollable, `${snapshot.id} skill list scroll`).toBe(true);
    }
    expect(snapshot.lastReachable, `${snapshot.id} last skill reachable`).toBe(true);
  });
});
