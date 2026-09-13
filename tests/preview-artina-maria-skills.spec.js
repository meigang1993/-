const { test, expect } = require("@playwright/test");
const {
  collectErrors, relevantErrors, openGame, startFreshGame, openTestBattle,
} = require("./helpers/preview-game");

async function enterBattleWithArtinaMaria(page) {
  await openGame(page);
  await startFreshGame(page);
  // 解锁两个新角色并选入测试战斗
  await page.evaluate(() => {
    (window.state.chars || []).forEach(char => {
      if (char.ref === "artina" || char.ref === "maria"
        || char.id === "artina" || char.id === "maria") char.locked = false;
    });
    if (!(window.state.chars || []).some(c => (c.ref || c.id) === "artina")) {
      window.state.chars.push({ id: "artina", ref: "artina", name: "亚缇娜", locked: false,
        level: 10, exp: 0, stats: { maxHp: 80, attack: 12, magic: 6, speed: 14 } });
    }
    if (!(window.state.chars || []).some(c => (c.ref || c.id) === "maria")) {
      window.state.chars.push({ id: "maria", ref: "maria", name: "玛利亚", locked: false,
        level: 10, exp: 0, stats: { maxHp: 90, attack: 8, magic: 10, speed: 12 } });
    }
    window.state.testAllies = ["artina", "maria"];
    window.render();
  });
  await openTestBattle(page);
  await page.evaluate(() => {
    window.GameAssets.preloadBattle = async () => {};
    window.BattleEffects.whenIdle = async () => {};
    window.BattleFX.playBattleStart = callback => callback?.();
  });
  await page.locator("[data-start-test-battle]").click();
  await expect(page.locator(".battle-screen")).toBeVisible();
  await page.evaluate(() => {
    const battle = window.state.battle;
    battle.animQueue = [];
    battle.locked = false;
    battle.phase = 4;
    window.BattleEffects.recover(window.state);
    window.render();
  });
}

const findUnit = ref => `(() => {
  const b = window.state.battle;
  return b.allies.find(u => u.ref === "${ref}") || b.allies.find(u => u.id === "${ref}");
})()`;

test("亚缇娜·蓄力子弹：记录花色数决定倍率，触发后清空", async ({ page }) => {
  const errors = collectErrors(page);
  await enterBattleWithArtinaMaria(page);

  const rows = await page.evaluate(() => {
    const state = window.state;
    const actor = state.battle.allies.find(u => u.ref === "artina" || u.id === "artina");
    const target = state.battle.enemies[0];
    const out = [];
    // 记录 1 种花色
    actor.artinaSuits = { "♥": true };
    let card = { name: "杀", type: "slash", suit: "♠" };
    out.push({ recorded: 1, dmg: window.ArtinaMariaSkills.modifySlashDamage(state, actor, target, 10, card), left: Object.keys(actor.artinaSuits).length });
    // 触发后应清空 → 再打一次不翻倍
    card = { name: "杀", type: "slash", suit: "♠" };
    out.push({ recorded: 0, dmg: window.ArtinaMariaSkills.modifySlashDamage(state, actor, target, 10, card), left: Object.keys(actor.artinaSuits).length });
    // 记录 2 种花色
    actor.artinaSuits = { "♥": true, "♦": true };
    card = { name: "杀", type: "slash", suit: "♠" };
    out.push({ recorded: 2, dmg: window.ArtinaMariaSkills.modifySlashDamage(state, actor, target, 10, card), left: Object.keys(actor.artinaSuits).length });
    return out;
  });

  expect(rows).toEqual([
    { recorded: 1, dmg: 20, left: 0 },   // 10 × (1+1) = 20
    { recorded: 0, dmg: 10, left: 0 },   // 无记录且不倍
    { recorded: 2, dmg: 30, left: 0 },   // 10 × (1+2) = 30
  ]);
  expect(relevantErrors(errors)).toEqual([]);
});

test("亚缇娜·狙击目标：命中后下一张杀不可响应", async ({ page }) => {
  const errors = collectErrors(page);
  await enterBattleWithArtinaMaria(page);

  const result = await page.evaluate(() => {
    const state = window.state;
    const actor = state.battle.allies.find(u => u.ref === "artina" || u.id === "artina");
    const target = state.battle.enemies[0];
    actor.usedArtinaSniper = false;
    actor.artinaSuits = {};
    // 给双方手牌，保证展示逻辑有牌可show
    actor.hand = [{ name: "牌A", suit: "♥" }, { name: "牌B", suit: "♥" }];
    target.hand = [{ name: "敌牌", suit: "♥" }];
    const ok = window.ArtinaMariaSkills.handleSpecialCard(
      state, actor, target, { artinaSniper: true, name: "狙击目标" });
    const sniped = actor.artinaChargedTargetUid === target.uid;
    const card = { name: "杀", type: "slash", suit: "♠" };
    window.ArtinaMariaSkills.modifySlashDamage(state, actor, target, 10, card);
    return { ok, sniped, ignoreResponse: !!card.ignoreResponse,
      suit: actor.artinaSniperSuit, used: actor.usedArtinaSniper };
  });

  expect(result.ok).toBe(true);
  expect(result.suit).toBe("♥");
  expect(result.sniped).toBe(true);
  expect(result.ignoreResponse).toBe(true);
  expect(result.used).toBe(true);
  expect(relevantErrors(errors)).toEqual([]);
});

test("玛利亚·神数咒语：出牌计数递增并摸牌，回合结束清零", async ({ page }) => {
  const errors = collectErrors(page);
  await enterBattleWithArtinaMaria(page);

  const rows = await page.evaluate(() => {
    const state = window.state;
    const actor = state.battle.allies.find(u => u.ref === "maria" || u.id === "maria");
    actor.mariaMarks = 0; actor.mariaUseCount = 0;
    actor.mariaNext = 1; actor.mariaTier = 1;
    let drawn = 0;
    const deps = { draw: (unit, count) => { drawn += count; return new Array(count).fill({}); } };
    const out = [];
    for (let i = 1; i <= 4; i += 1) {
      window.ArtinaMariaSkills.beforeCardPlayed(
        state, actor, { name: "牌", suit: "♠", type: "slash" }, deps);
      out.push({ play: i, marks: actor.mariaMarks,
        tempAttack: actor.tempAttack, tempMagic: actor.tempMagic });
    }
    window.ArtinaMariaSkills.endTurn(state, actor);
    return { out, drawn, afterEndTurn: { marks: actor.mariaMarks, count: actor.mariaUseCount } };
  });

  // 神数：每使用一张牌获得1枚标记；使用牌数达到目标数时摸等量牌，
  // 随后重新计数、目标数+1（目标 1 → 2 → 3）。
  // 第1张: marks=1, 使用1张达目标1 → 摸1张，目标升为2、计数归零
  // 第2张: marks=2, 使用1张未达目标2 → 不摸
  // 第3张: marks=3, 使用2张达目标2 → 摸2张，目标升为3、计数归零
  // 第4张: marks=4, 使用1张未达目标3 → 不摸
  expect(rows.out).toEqual([
    { play: 1, marks: 1, tempAttack: 1, tempMagic: 1 },
    { play: 2, marks: 2, tempAttack: 2, tempMagic: 2 },
    { play: 3, marks: 3, tempAttack: 3, tempMagic: 3 },
    { play: 4, marks: 4, tempAttack: 4, tempMagic: 4 },
  ]);
  expect(rows.drawn).toBe(3);   // 1 + 2
  expect(rows.afterEndTurn).toEqual({ marks: 0, count: 0 });
  expect(relevantErrors(errors)).toEqual([]);
});

test("玛利亚·荣誉祝福：全队获得属性与花色，花色每回合消失一个且清空后属性失效", async ({ page }) => {
  const errors = collectErrors(page);
  await enterBattleWithArtinaMaria(page);

  const result = await page.evaluate(() => {
    const state = window.state;
    const actor = state.battle.allies.find(u => u.ref === "maria" || u.id === "maria");
    const mate = state.battle.allies.find(u => u !== actor);
    actor.usedMariaHonorBlessing = false;
    actor.hand = [
      { name: "A", suit: "♥" }, { name: "B", suit: "♦" }, { name: "C", suit: "♠" },
    ];
    state.battle.selectedBagIndexes = [0, 1, 2];
    const baseMate = { attack: mate.stats.attack, magic: mate.stats.magic, speed: mate.stats.speed };
    const baseSelf = { attack: actor.stats.attack, magic: actor.stats.magic, speed: actor.stats.speed };
    const ok = window.ArtinaMariaSkills.handleSpecialCard(
      state, actor, null, { mariaHonorBlessing: true, name: "荣誉祝福" });
    const buffed = {
      mateAttack: mate.stats.attack - baseMate.attack,
      selfAttack: actor.stats.attack - baseSelf.attack,
      mateSuits: [...(mate.mariaBlessingSuits || [])],
      selfSuits: [...(actor.mariaBlessingSuits || [])],
    };
    // 衰减由玛利亚的回合结束统一驱动，队友自己的回合结束不衰减
    window.ArtinaMariaSkills.endTurn(state, mate);
    const afterMateTurn = (mate.mariaBlessingSuits || []).length;
    window.ArtinaMariaSkills.endTurn(state, actor);
    const t1 = (mate.mariaBlessingSuits || []).length;
    window.ArtinaMariaSkills.endTurn(state, actor);
    const t2 = (mate.mariaBlessingSuits || []).length;
    window.ArtinaMariaSkills.endTurn(state, actor);
    const afterExpire = {
      mateAttack: mate.stats.attack - baseMate.attack,
      hasBlessing: !!mate.mariaBlessing,
      suits: (mate.mariaBlessingSuits || []).length,
    };
    return { ok, buffed, afterMateTurn, t1, t2, afterExpire };
  });

  expect(result.ok).toBe(true);
  // 我方全体（含玛利亚本人）都显示本次弃置的花色
  expect(result.buffed.mateSuits.length).toBe(3);
  expect(result.buffed.selfSuits.length).toBe(3);
  expect(result.buffed.mateAttack).toBeGreaterThan(0);
  expect(result.buffed.selfAttack).toBeGreaterThan(0);
  expect(result.afterMateTurn).toBe(3);   // 队友回合结束不衰减
  expect(result.t1).toBe(2);
  expect(result.t2).toBe(1);
  // 花色全部消失后，属性提升精确失效、无残留
  expect(result.afterExpire.hasBlessing).toBe(false);
  expect(result.afterExpire.suits).toBe(0);
  expect(result.afterExpire.mateAttack).toBe(0);
  expect(relevantErrors(errors)).toEqual([]);
});

test("UI：头像显示蓄力花色标记与神数计数", async ({ page }) => {
  const errors = collectErrors(page);
  await enterBattleWithArtinaMaria(page);

  const result = await page.evaluate(() => {
    const state = window.state;
    const artina = state.battle.allies.find(u => u.ref === "artina" || u.id === "artina");
    const maria = state.battle.allies.find(u => u.ref === "maria" || u.id === "maria");
    artina.artinaSuits = { "♥": true, "♦": true };
    // 头像神数显示的是当前「使用牌目标数」
    maria.mariaNext = 2; maria.mariaUseCount = 0; maria.mariaMarks = 2;
    state.infoUnit = null;
    window.render();
    const html = document.body.innerHTML;
    return {
      suitBadge: /蓄力\s*♥♦/.test(html),
      suitTitle: /伤害×3/.test(html),
      mariaBadge: /神数×2/.test(html),
    };
  });

  expect(result.suitBadge).toBe(true);
  expect(result.suitTitle).toBe(true);
  expect(result.mariaBadge).toBe(true);
  expect(relevantErrors(errors)).toEqual([]);
});

test("结束回合：亚缇娜花色与狙击状态全部清空", async ({ page }) => {
  const errors = collectErrors(page);
  await enterBattleWithArtinaMaria(page);

  const result = await page.evaluate(() => {
    const state = window.state;
    const artina = state.battle.allies.find(u => u.ref === "artina" || u.id === "artina");
    artina.artinaSuits = { "♥": true };
    artina.artinaSniperTargetUid = "x";
    artina.artinaSniperSuit = "♥";
    artina.artinaChargedTargetUid = "y";
    window.ArtinaMariaSkills.endTurn(state, artina);
    return {
      suits: Object.keys(artina.artinaSuits).length,
      sniperUid: artina.artinaSniperTargetUid,
      suit: artina.artinaSniperSuit,
      charged: artina.artinaChargedTargetUid,
    };
  });

  expect(result).toEqual({ suits: 0, sniperUid: null, suit: null, charged: null });
  expect(relevantErrors(errors)).toEqual([]);
});

test("玛利亚·头像徽章：神数显示使用牌目标数，祝福显示弃置花色", async ({ page }) => {
  const errors = collectErrors(page);
  await enterBattleWithArtinaMaria(page);

  const badges = await page.evaluate(() => {
    const maria = { ref: "maria", name: "玛利亚", mariaMarks: 0, mariaNext: 1, mariaUseCount: 0 };
    const I = window.GameUIInfo(window.UICommon);
    const start = I.mariaNumberMark(maria);
    // 达到目标 1 后重新计数，目标数升为 2
    maria.mariaNext = 2; maria.mariaUseCount = 0; maria.mariaMarks = 2;
    const afterOne = I.mariaNumberMark(maria);
    const blessed = { ref: "maria", name: "玛利亚", mariaBlessingSuits: ["♥", "♦"] };
    const bless = I.mariaBlessingMark(blessed);
    // 荣誉祝福作用于全体，非玛利亚角色同样显示花色
    const mate = { ref: "rokar", name: "罗卡尔", mariaBlessingSuits: ["♠"],
      mariaBlessing: { attack: 1, magic: 1, speed: 1 } };
    const mateBadge = I.mariaBlessingMark(mate);
    blessed.mariaBlessingSuits = [];
    const faded = I.mariaBlessingMark(blessed);
    return { start, afterOne, bless, mateBadge, faded };
  });

  expect(badges.start).toContain("神数×1");
  expect(badges.start).toContain("再使用1张牌");
  expect(badges.afterOne).toContain("神数×2");
  expect(badges.afterOne).toContain("再使用2张牌");
  expect(badges.bless).toContain("祝福 ♥♦");
  expect(badges.mateBadge).toContain("祝福 ♠");
  expect(badges.faded).toBe("");
  expect(relevantErrors(errors)).toEqual([]);
});

test("玛利亚·荣誉祝福：弃置花色每回合消失一个，未清空前无法再次发动", async ({ page }) => {
  const errors = collectErrors(page);
  await enterBattleWithArtinaMaria(page);

  const result = await page.evaluate(() => {
    const state = window.state;
    const maria = state.battle.allies.find(u => u.ref === "maria" || u.id === "maria");
    const refill = () => { maria.hand = [
      { name: "甲", type: "tactic", suit: "♥" },
      { name: "乙", type: "tactic", suit: "♦" }]; };
    refill();
    const card = { name: "荣誉祝福", type: "tactic", mariaHonorBlessing: true, _bagIndexes: [0, 1] };
    const first = window.ArtinaMariaSkills.handleSpecialCard(state, maria, maria, { ...card }, {});
    const suitsAfterCast = [...(maria.mariaBlessingSuits || [])];
    window.ArtinaMariaSkills.endTurn(state, maria);
    const suitsAfterTurn = [...(maria.mariaBlessingSuits || [])];
    refill();
    maria.usedMariaHonorBlessing = false;
    const blocked = window.ArtinaMariaSkills.handleSpecialCard(state, maria, maria, { ...card }, {});
    window.ArtinaMariaSkills.endTurn(state, maria);
    const suitsEmpty = (maria.mariaBlessingSuits || []).length === 0;
    refill();
    maria.usedMariaHonorBlessing = false;
    const recast = window.ArtinaMariaSkills.handleSpecialCard(state, maria, maria, { ...card }, {});
    return { first, suitsAfterCast, suitsAfterTurn, blocked, suitsEmpty, recast };
  });

  expect(result.first).toBe(true);
  expect(result.suitsAfterCast.sort()).toEqual(["♥", "♦"]);
  expect(result.suitsAfterTurn.length).toBe(1);
  expect(result.blocked).toBe(false);
  expect(result.suitsEmpty).toBe(true);
  expect(result.recast).toBe(true);
  expect(relevantErrors(errors)).toEqual([]);
});
