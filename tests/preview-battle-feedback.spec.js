const { test, expect } = require("@playwright/test");
const {
  openGame,
  startFreshGame,
} = require("./helpers/preview-game");

test("battle audio waits for a delayed AudioContext resume", async ({ page }) => {
  await page.addInitScript(() => {
    const param = () => ({
      value: 0,
      setValueAtTime() {},
      linearRampToValueAtTime() {},
      exponentialRampToValueAtTime() {},
    });
    window.__audioResumeTest = { starts: 0, suspendedStarts: 0, resumes: 0, contexts: [] };
    window.AudioContext = window.webkitAudioContext = class FakeAudioContext {
      constructor() {
        this.state = "suspended";
        this.currentTime = 0;
        this.sampleRate = 44100;
        this.destination = {};
        this.resumePending = null;
        window.__audioResumeTest.contexts.push(this);
      }
      resume() {
        window.__audioResumeTest.resumes += 1;
        if (!this.resumePending) {
          this.resumePending = new Promise(resolve => setTimeout(() => {
            this.state = "running";
            resolve();
          }, 80));
        }
        return this.resumePending;
      }
      node(fields = {}) {
        return {
          ...fields,
          connect() {},
          start: () => {
            const key = this.state === "running" ? "starts" : "suspendedStarts";
            window.__audioResumeTest[key] += 1;
          },
          stop() {},
        };
      }
      createOscillator() { return this.node({ frequency: param() }); }
      createGain() { return this.node({ gain: param() }); }
      createBufferSource() { return this.node(); }
      createBiquadFilter() { return this.node({ frequency: param(), Q: param() }); }
      createBuffer(channels, length) {
        return { getChannelData: () => new Float32Array(length) };
      }
      decodeAudioData() { return Promise.resolve({ duration: .1 }); }
    };
  });
  await openGame(page);
  await page.evaluate(() => {
    window.BattleFX.unlockAudio();
    window.BattleFX.cardMove();
    window.BattleDamageFX.impact({ damageTypes: ["thunder"] });
  });
  await expect.poll(() => page.evaluate(() => window.__audioResumeTest.starts)).toBeGreaterThanOrEqual(4);
  const result = await page.evaluate(() => ({
    suspendedStarts: window.__audioResumeTest.suspendedStarts,
    resumes: window.__audioResumeTest.resumes,
    states: window.__audioResumeTest.contexts.map(context => context.state),
  }));
  expect(result.suspendedStarts).toBe(0);
  expect(result.resumes).toBeGreaterThanOrEqual(2);
  expect(result.states).toEqual(["running", "running"]);
});

test("consecutive hit shakes survive damage rerenders", async ({ page }) => {
  await openGame(page);
  await startFreshGame(page);
  await page.evaluate(() => {
    window.BattleFX.cancel();
    const host = document.createElement("div");
    host.id = "combo-hit-test";
    document.body.append(host);
    const unit = { uid: "combo-target", side: "enemy", hp: 10, maxHp: 10, block: 0, defenseSystem: 0 };
    const floats = [
      { id: "combo-hit-1", type: "float", uid: unit.uid, kind: "damage", value: 1, seq: 1, hitFxId: 9101, visualHp: 9, damageTypes: ["physical"] },
      { id: "combo-hit-2", type: "float", uid: unit.uid, kind: "damage", value: 1, seq: 2, hitFxId: 9102, visualHp: 8, damageTypes: ["physical"] },
    ];
    const state = window.state;
    state.view = "battle";
    state.battle = { allies: [], enemies: [unit], floats, animQueue: floats.map(item => ({ ...item })) };
    const runtime = { version: 0, animating: false, draining: false, pendingState: null, settleBlockedBattle: null };
    const renderStep = () => {
      host.dataset.renderCount = String(Number(host.dataset.renderCount || 0) + 1);
      host.innerHTML = `<div class="unit enemy-unit" data-target="${unit.uid}"><div class="unit-main"><div class="unit-art"></div></div></div>`;
      window.BattleFX.syncBumps();
    };
    renderStep();
    const drain = window.BattleEffectDrain({
      runtime,
      isCurrent: current => current === state,
      resolveIdle() {},
      recover() {},
    });
    window.__comboHitDrain = drain(state, renderStep).then(() => {
      const currentUnit = host.querySelector(".unit"), art = currentUnit?.querySelector(".unit-art");
      host.dataset.bumpAfterDrain = currentUnit?.classList.contains("hit-bump") ? "1" : "0";
      host.dataset.animationAfterDrain = art?.getAnimations().some(animation => animation.animationName === "hitBump") ? "1" : "0";
    });
  });
  const host = page.locator("#combo-hit-test");
  await page.evaluate(() => window.__comboHitDrain);
  await expect.poll(async () => Number(await host.getAttribute("data-render-count"))).toBeGreaterThanOrEqual(4);
  await expect(host).toHaveAttribute("data-bump-after-drain", "1");
  await expect(host).toHaveAttribute("data-animation-after-drain", "1");
  const unit = page.locator("#combo-hit-test .unit");
  await expect(unit).not.toHaveClass(/hit-bump/, { timeout: 1200 });
  const leavingClass = await page.evaluate(() => {
    const state = window.state, target = state.battle.enemies[0];
    const float = { id: "leaving-hit", uid: target.uid, kind: "damage", value: 1, seq: 3, hitFxId: 9103, damageTypes: ["physical"] };
    state.battle.floats.push(float);
    window.BattleFX.popFloats(state, float.id, true);
    return document.querySelector("#combo-hit-test .unit").className;
  });
  expect(leavingClass).toContain("hit-bump");
  await page.evaluate(() => {
    window.state.view = "hall";
    window.render();
  });
  await expect(unit).not.toHaveClass(/hit-bump/);
  await page.evaluate(() => {
    window.BattleFX.cancel();
    document.querySelector("#combo-hit-test")?.remove();
    delete window.__comboHitDrain;
  });
});
