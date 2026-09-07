const { test, expect } = require("@playwright/test");
const {
  collectErrors, relevantErrors, openGame, startFreshGame,
} = require("./helpers/preview-game");

test("damage attributes render in priority order and style critical numbers", async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  await page.locator("[data-open-modal='team']").first().click();
  await page.getByRole("button", { name: "测试战斗" }).click();
  await page.evaluate(() => {
    window.GameAssets.preloadBattle = async () => {};
    window.BattleEffects.whenIdle = async () => {};
    window.BattleFX.playBattleStart = callback => callback?.();
  });
  await page.locator("[data-start-test-battle]").click();
  await expect(page.locator(".battle-screen")).toBeVisible();

  const targetUid = await page.evaluate(() => window.state.battle.enemies[0].uid);
  await page.evaluate(uid => {
    window.__damageFxObserved = { order: [], darkStyled: false, physicalBounds: null, magic: null };
    window.__damageFxObserver = new MutationObserver(records => {
      records.flatMap(record => [...record.addedNodes]).forEach(node => {
        if (!(node instanceof HTMLElement) || !node.classList.contains("damage-attribute-fx")) return;
        const type = [...node.classList].find(name => name.startsWith("damage-attribute-") && name !== "damage-attribute-fx");
        if (node.classList.contains("damage-magic-fx")) {
          window.__damageFxObserved.order.push("magic");
          window.__damageFxObserved.magic = {
            critical: node.classList.contains("critical"),
            circles: node.querySelectorAll(".damage-magic-circle").length,
            beams: node.querySelectorAll(".damage-magic-beam").length,
          };
        }
        else if (type) window.__damageFxObserved.order.push(type.replace("damage-attribute-", ""));
        if (node.classList.contains("damage-attribute-physical")) {
          const rect = node.getBoundingClientRect();
          window.__damageFxObserved.physicalBounds = {
            left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
            width: innerWidth, height: innerHeight, critical: node.classList.contains("critical"),
          };
        }
        if (node.classList.contains("damage-attribute-dark")) {
          window.__damageFxObserved.darkStyled = getComputedStyle(node, "::before").backgroundColor !== "rgba(0, 0, 0, 0)";
        }
      });
    });
    window.__damageFxObserver.observe(document.body, { childList: true });
    window.BattleDamageFX.play({ uid, damageTypes: ["dark", "fire", "physical"], effectCritical: true });
  }, targetUid);
  await expect.poll(() => page.evaluate(() => window.__damageFxObserved.order.length)).toBe(3);
  const observed = await page.evaluate(() => window.__damageFxObserved);
  const effectBounds = observed.physicalBounds;
  expect(effectBounds.critical).toBe(true);
  expect(effectBounds.left).toBeGreaterThanOrEqual(4);
  expect(effectBounds.top).toBeGreaterThanOrEqual(4);
  expect(effectBounds.right).toBeLessThanOrEqual(effectBounds.width - 4);
  expect(effectBounds.bottom).toBeLessThanOrEqual(effectBounds.height - 4);
  await expect(page.locator(`[data-target="${targetUid}"] .unit-art`)).not.toHaveClass(/damage-tint-dark/);
  expect(observed.order).toEqual(["physical", "fire", "dark"]);
  expect(observed.darkStyled).toBe(true);
  await page.evaluate(uid => {
    window.__damageFxObserved.order = [];
    window.BattleDamageFX.play({ uid, damageTypes: ["dark"], magicDamage: true, effectCritical: true });
  }, targetUid);
  await expect.poll(() => page.evaluate(() => window.__damageFxObserved.order.length)).toBe(2);
  expect(await page.evaluate(() => window.__damageFxObserved.order)).toEqual(["dark", "magic"]);
  expect(await page.evaluate(() => window.__damageFxObserved.magic)).toEqual({
    critical: true,
    circles: 1,
    beams: 6,
  });
  await page.evaluate(uid => {
    window.BattleFloatFX.cancel();
    window.__damageFxObserved.order = [];
    const battle = window.state.battle;
    const event = {
      id: "queen-tail-hit", uid, kind: "damage", value: 4,
      hitFxId: 2001, damageTypes: ["physical"],
      attackType: "magic", magicDamage: true,
    };
    battle.hitFxId = event.hitFxId;
    battle.lastHitUid = uid;
    battle.floats = [event];
    window.BattleFX.slashHit(window.state, event);
    window.BattleFX.slashHit(window.state);
  }, targetUid);
  await expect.poll(() => page.evaluate(() => window.__damageFxObserved.order))
    .toEqual(["magic"]);
  await page.waitForTimeout(560);
  await page.evaluate(uid => {
    window.__damageFxObserved.order = [];
    window.BattleDamageFX.play({ uid, damageTypes: ["physical"], attackType: "magic", hybridAttack: true });
  }, targetUid);
  await expect.poll(() => page.evaluate(() => window.__damageFxObserved.order.length)).toBe(2);
  expect(await page.evaluate(() => window.__damageFxObserved.order)).toEqual(["physical", "magic"]);
  await page.waitForTimeout(560);
  const layers = await page.evaluate(uid => new Promise(resolve => {
    window.__damageFxObserver.disconnect();
    delete window.__damageFxObserver;
    delete window.__damageFxObserved;
    window.state.battle.judgement = { id: "layer-check", skill: "层级检查", suit: "♠", name: "判定", success: true };
    window.render();
    const observer = new MutationObserver(records => {
      const effect = records.flatMap(record => [...record.addedNodes]).find(node =>
        node instanceof HTMLElement && node.matches(".damage-attribute-physical:not(.critical)"));
      if (!effect) return;
      observer.disconnect();
      resolve({
        effect: Number(getComputedStyle(effect).zIndex),
        popup: Number(getComputedStyle(document.querySelector(".judgement-popup")).zIndex),
      });
    });
    observer.observe(document.body, { childList: true });
    window.BattleDamageFX.play({ uid, damageTypes: ["physical"] });
  }), targetUid);
  await expect(page.locator(".judgement-popup")).toBeVisible();
  expect(layers.popup).toBeGreaterThan(layers.effect);
  await page.evaluate(() => {
    window.state.battle.judgement = null;
    window.render();
  });
  await page.waitForTimeout(560);
  await expect(page.locator(".damage-attribute-fx")).toHaveCount(0);
  await expect(page.locator(`[data-target="${targetUid}"] .unit-art`)).not.toHaveClass(/damage-tint-dark/);

  await page.evaluate(() => {
    const host = document.createElement("div");
    host.id = "damage-fx-rerender-test";
    const renderTarget = () => {
      host.innerHTML = '<div data-target="fx-rerender-target"><div class="unit-art" style="width:80px;height:80px"></div></div>';
    };
    renderTarget();
    document.body.append(host);
    window.BattleDamageFX.play({ uid: "fx-rerender-target", damageTypes: ["physical", "fire"] });
    setTimeout(() => { host.innerHTML = ""; }, 110);
    setTimeout(renderTarget, 210);
  });
  await expect(page.locator(".damage-attribute-physical")).toBeVisible();
  await expect(page.locator(".damage-attribute-fire")).toBeVisible();
  await page.evaluate(() => document.querySelector("#damage-fx-rerender-test")?.remove());
  await page.waitForTimeout(560);
  await expect(page.locator(".damage-attribute-fx")).toHaveCount(0);

  await page.evaluate(uid => {
    const battle = window.state.battle;
    const float = { id: "attribute-critical", uid, kind: "damage", value: 9, critical: true, seq: 1, hitFxId: 999, damageTypes: ["thunder"] };
    battle.floats = [float];
    window.BattleFX.popFloats(window.state, float.id, true);
  }, targetUid);
  const number = page.locator(".float-num.damage-type-thunder.critical");
  await expect(number).toBeVisible();
  await expect(number).toHaveCSS("color", "rgb(79, 217, 255)");
  await expect(number).toHaveCSS("font-size", "45px");
  await page.evaluate(uid => {
    const float = { id: "magic-critical", uid, kind: "damage", value: 12, critical: true, seq: 2, hitFxId: 1001, damageTypes: ["dark"], magicDamage: true };
    window.state.battle.floats.push(float);
    window.BattleFX.popFloats(window.state, float.id, true);
  }, targetUid);
  const magicNumber = page.locator(".float-num.damage-magic.critical");
  await expect(magicNumber).toBeVisible();
  await expect(magicNumber).toHaveCSS("color", "rgb(239, 196, 255)");
  await expect(magicNumber).toHaveCSS("font-size", "45px");
  await page.evaluate(uid => {
    const float = { id: "attribute-defense", uid, kind: "defense", value: 3, critical: false, seq: 2, hitFxId: 1000, damageTypes: ["thunder"] };
    window.state.battle.floats.push(float);
    window.BattleFX.popFloats(window.state, float.id, true);
  }, targetUid);
  const defenseNumber = page.locator(".float-num.defense");
  await expect(defenseNumber).toBeVisible();
  await expect(defenseNumber).toHaveCSS("color", "rgb(255, 232, 90)");
  await expect(defenseNumber).not.toHaveClass(/damage-type-/);
  await page.evaluate(uid => {
    for (let index = 1; index <= 6; index += 1) {
      const float = {
        id: `rapid-float-${index}`, uid, kind: "damage", value: index,
        seq: index, hitFxId: 3000 + index, damageTypes: ["physical"],
      };
      window.state.battle.floats.push(float);
      window.BattleFX.popFloats(window.state, float.id, true);
    }
  }, targetUid);
  await expect(page.locator(".float-num")).toHaveCount(3);
  await expect(page.locator(".float-num", { hasText: "-6" })).toBeVisible();
  expect(relevantErrors(errors)).toEqual([]);
});
