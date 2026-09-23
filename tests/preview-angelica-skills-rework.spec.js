const { test, expect } = require("@playwright/test");
const {
  collectErrors, relevantErrors, openGame, startFreshGame,
  openTestBattle,
} = require("./helpers/preview-game");

async function enterBattleWithAngelica(page) {
  await openGame(page);
  await startFreshGame(page);
  await openTestBattle(page);
  await page.locator("[data-test-ally='angelica']").click();
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
    battle.activeUid = battle.allies.find(unit => unit.ref === "angelica").uid;
    window.BattleEffects.recover(window.state);
    window.render();
  });
}

test("力量爆发：实体杀伤害倍率随本回合使用数递增", async ({ page }) => {
  const errors = collectErrors(page);
  await enterBattleWithAngelica(page);

  const rows = await page.evaluate(() => {
    const state = window.state;
    const actor = state.battle.allies.find(u => u.ref === "angelica");
    actor.angelicaSlashCount = 0;
    actor.angelicaMightTurn = null;
    const out = [];
    for (let i = 0; i < 3; i += 1) {
      const card = { name: "杀（普攻）", type: "slash", power: 0, scale: "attack" };
      window.AngelicaLukaSkills.beforeCardPlayed(state, actor, card);
      out.push({
        count: actor.angelicaSlashCount,
        mul: card.angelicaMight || 0,
        dmg: window.AngelicaLukaSkills.modifyDamage(state, actor, 10, card),
      });
    }
    return out;
  });

  expect(rows).toEqual([
    { count: 1, mul: 2, dmg: 20 },
    { count: 2, mul: 3, dmg: 30 },
    { count: 3, mul: 4, dmg: 40 },
  ]);
  expect(relevantErrors(errors)).toEqual([]);
});

test("力量爆发：虚拟杀与转换杀不触发且不计入", async ({ page }) => {
  const errors = collectErrors(page);
  await enterBattleWithAngelica(page);

  const out = await page.evaluate(() => {
    const state = window.state;
    const actor = state.battle.allies.find(u => u.ref === "angelica");
    actor.angelicaSlashCount = 0;
    actor.angelicaMightTurn = null;
    const virtual = { name: "杀（普攻）", type: "slash", virtual: true };
    window.AngelicaLukaSkills.beforeCardPlayed(state, actor, virtual);
    const converted = {
      name: "杀（普攻）", type: "slash", convertedFrom: "火杀",
      withererBerserkKill: true,
    };
    window.AngelicaLukaSkills.beforeCardPlayed(state, actor, converted);
    return {
      count: actor.angelicaSlashCount || 0,
      virtualMul: virtual.angelicaMight || 0,
      convertedMul: converted.angelicaMight || 0,
      virtualDmg: window.AngelicaLukaSkills.modifyDamage(
        state, actor, 10, virtual),
    };
  });

  expect(out).toEqual({
    count: 0, virtualMul: 0, convertedMul: 0, virtualDmg: 10,
  });
  expect(relevantErrors(errors)).toEqual([]);
});

test("力量爆发：新回合倍率重置", async ({ page }) => {
  const errors = collectErrors(page);
  await enterBattleWithAngelica(page);

  const out = await page.evaluate(() => {
    const state = window.state;
    const actor = state.battle.allies.find(u => u.ref === "angelica");
    actor.angelicaSlashCount = 0;
    actor.angelicaMightTurn = null;
    for (let i = 0; i < 2; i += 1) {
      window.AngelicaLukaSkills.beforeCardPlayed(state, actor,
        { name: "杀（普攻）", type: "slash" });
    }
    const beforeReset = actor.angelicaSlashCount;
    window.AngelicaLukaSkills.beginTurn(state, actor);
    const card = { name: "杀（普攻）", type: "slash" };
    window.AngelicaLukaSkills.beforeCardPlayed(state, actor, card);
    return { beforeReset, afterResetMul: card.angelicaMight || 0 };
  });

  expect(out).toEqual({ beforeReset: 2, afterResetMul: 2 });
  expect(relevantErrors(errors)).toEqual([]);
});

test("狂战意志：每次伤害事件独立获得1枚标记", async ({ page }) => {
  const errors = collectErrors(page);
  await enterBattleWithAngelica(page);

  const out = await page.evaluate(() => {
    const state = window.state;
    const actor = state.battle.allies.find(u => u.ref === "angelica");
    const enemy = state.battle.enemies[0];
    actor.rageMarks = 0;
    const deps = { draw: () => [], pushFloat: () => {} };
    const card = { name: "双重打杀", type: "slash" };
    window.AngelicaLukaSkills.afterDamage(
      state, actor, enemy, card, 4, deps);
    const afterFirst = actor.rageMarks;
    window.AngelicaLukaSkills.afterDamage(
      state, actor, enemy, card, 4, deps);
    return { afterFirst, afterSecond: actor.rageMarks };
  });

  expect(out).toEqual({ afterFirst: 1, afterSecond: 2 });
  expect(relevantErrors(errors)).toEqual([]);
});

test("狂战意志：受到伤害也获得标记，上限10", async ({ page }) => {
  const errors = collectErrors(page);
  await enterBattleWithAngelica(page);

  const out = await page.evaluate(() => {
    const state = window.state;
    const actor = state.battle.allies.find(u => u.ref === "angelica");
    const enemy = state.battle.enemies[0];
    actor.rageMarks = 0;
    const deps = { draw: () => [], pushFloat: () => {} };
    window.AngelicaLukaSkills.afterDamage(
      state, enemy, actor, { name: "杀（普攻）", type: "slash" }, 3, deps);
    const afterHurt = actor.rageMarks;
    actor.rageMarks = 10;
    window.AngelicaLukaSkills.afterDamage(
      state, enemy, actor, { name: "杀（普攻）", type: "slash" }, 3, deps);
    return { afterHurt, capped: actor.rageMarks };
  });

  expect(out).toEqual({ afterHurt: 1, capped: 10 });
  expect(relevantErrors(errors)).toEqual([]);
});

test("狂战意志：实体杀可用1枚标记代替1点杀意消耗", async ({ page }) => {
  const errors = collectErrors(page);
  await enterBattleWithAngelica(page);

  const out = await page.evaluate(() => {
    const state = window.state;
    const actor = state.battle.allies.find(u => u.ref === "angelica");
    actor.rageMarks = 3;
    actor.intent = 2;
    const card = { name: "杀（普攻）", type: "slash" };
    const payable = window.AngelicaLukaSkills.canPayIntentWithRage(
      actor, card);
    const paid = window.AngelicaLukaSkills.beforeIntentCost(
      state, actor, card);
    const afterMarks = actor.rageMarks;
    const afterIntent = actor.intent;
    actor.rageMarks = 0;
    const noMarkPaid = window.AngelicaLukaSkills.beforeIntentCost(
      state, actor, card);
    return {
      payable, paid, afterMarks, afterIntent, noMarkPaid,
    };
  });

  expect(out).toEqual({
    payable: true, paid: true, afterMarks: 2, afterIntent: 2, noMarkPaid: false,
  });
  expect(relevantErrors(errors)).toEqual([]);
});

test("狂战意志：杀意为0时是否可打出取决于标记，虚拟杀不适用", async ({ page }) => {
  const errors = collectErrors(page);
  await enterBattleWithAngelica(page);

  const out = await page.evaluate(() => {
    const state = window.state;
    const actor = state.battle.allies.find(u => u.ref === "angelica");
    const card = { name: "杀（普攻）", type: "slash" };
    const virtual = { name: "杀（普攻）", type: "slash", virtual: true };
    actor.intent = 0;
    actor.rageMarks = 0;
    const noMark = window.AngelicaLukaSkills.canPayIntentWithRage(actor, card);
    actor.rageMarks = 1;
    const withMark = window.AngelicaLukaSkills.canPayIntentWithRage(actor, card);
    const virtualWithMark = window.AngelicaLukaSkills.canPayIntentWithRage(
      actor, virtual);
    return { noMark, withMark, virtualWithMark };
  });

  expect(out).toEqual({
    noMark: false, withMark: true, virtualWithMark: false,
  });
  expect(relevantErrors(errors)).toEqual([]);
});

test("猩红暴走：弃置全部标记、摸等量牌并按生命上限10%回复", async ({ page }) => {
  const errors = collectErrors(page);
  await enterBattleWithAngelica(page);

  const out = await page.evaluate(() => {
    const state = window.state;
    const actor = state.battle.allies.find(u => u.ref === "angelica");
    actor.maxHp = 40;
    actor.hp = 20;
    actor.rageMarks = 4;
    actor.usedCrimsonRampage = false;
    let drawnFor = -1;
    const deps = {
      draw: (unit, count) => { drawnFor = count; return count; },
    };
    const ctx = { pushFloat: () => {} };
    const card = { name: "猩红暴走", type: "tactic", crimsonRampage: true };
    window.AngelicaLukaSkills.handleSpecialCard(
      state, actor, null, card, deps, ctx);
    const first = { marks: actor.rageMarks, drawnFor, hp: actor.hp };
    actor.rageMarks = 3;
    window.AngelicaLukaSkills.handleSpecialCard(
      state, actor, null, card, deps, ctx);
    const second = { marks: actor.rageMarks, hp: actor.hp };
    return { first, second };
  });

  // 4枚标记 × 生命上限40的10% = 16点，20+16=36
  expect(out.first).toEqual({ marks: 0, drawnFor: 4, hp: 36 });
  // 出牌阶段限一次：再次发动不生效，标记与生命均不变
  expect(out.second).toEqual({ marks: 3, hp: 36 });
  expect(relevantErrors(errors)).toEqual([]);
});

test("狂战意志：标记延后到整段伤害结算完成后发放", async ({ page }) => {
  const errors = collectErrors(page);
  await enterBattleWithAngelica(page);

  const out = await page.evaluate(() => {
    const state = window.state;
    const actor = state.battle.allies.find(u => u.ref === "angelica");
    const enemy = state.battle.enemies[0];
    actor.rageMarks = 0;
    const pending = [];
    const deps = {
      draw: () => [],
      damage: { scheduleAfterDamage: fn => pending.push(fn) },
    };
    window.AngelicaLukaSkills.afterDamage(
      state, actor, enemy, { name: "杀（普攻）", type: "slash" }, 3, deps);
    const duringDamage = actor.rageMarks;
    pending.forEach(fn => fn());
    const afterPhase = actor.rageMarks;
    return { duringDamage, afterPhase };
  });

  expect(out).toEqual({ duringDamage: 0, afterPhase: 1 });
  expect(relevantErrors(errors)).toEqual([]);
});
