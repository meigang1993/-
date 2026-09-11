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

test("力大无穷：实体杀伤害倍率随本回合使用数递增", async ({ page }) => {
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

test("力大无穷：虚拟杀与转换杀不触发且不计入", async ({ page }) => {
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

test("力大无穷：新回合倍率重置", async ({ page }) => {
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

test("狂战意志：受到伤害也获得标记，上限99", async ({ page }) => {
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
    actor.rageMarks = 99;
    window.AngelicaLukaSkills.afterDamage(
      state, enemy, actor, { name: "杀（普攻）", type: "slash" }, 3, deps);
    return { afterHurt, capped: actor.rageMarks };
  });

  expect(out).toEqual({ afterHurt: 1, capped: 99 });
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
