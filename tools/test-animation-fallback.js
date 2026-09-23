global.window = global;
global.document = {
  documentElement: {
    style: {
      values: new Map(),
      setProperty(name, value) { this.values.set(name, value); },
      getPropertyValue(name) { return this.values.get(name) || ""; },
    },
  },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  createElement() { return {}; },
  body: { appendChild() {} },
};

require("../src/original/battle-effect-geometry.js");
require("../src/original/battle-effect-animation.js");
require("../src/original/battle-effect-utils.js");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

(async () => {
  global.state = { settings: { battleSpeed: 2 } };
  assert(window.BattleEffectUtils.scaleMs(300) === 150,
    "2x battle speed must halve JavaScript animation time");
  window.BattleEffectUtils.syncCssTiming(global.state);
  assert(global.document.documentElement.style
    .getPropertyValue("--battle-ms-820") === "410ms",
  "2x battle speed must halve CSS animation time");
  const stamped = {
    style: {
      values: new Map(),
      setProperty(name, value) { this.values.set(name, value); },
      getPropertyValue(name) { return this.values.get(name) || ""; },
    },
  };
  window.BattleEffectUtils.stampCssTiming(stamped, global.state);
  global.state.settings.battleSpeed = 1;
  window.BattleEffectUtils.syncCssTiming(global.state);
  assert(stamped.style.getPropertyValue("--battle-ms-820") === "410ms",
    "stamped effects must keep their creation-time battle speed");
  let releaseIdle;
  global.BattleEffects = {
    animating: true,
    draining: false,
    whenIdle: () => new Promise(resolve => { releaseIdle = resolve; }),
  };
  global.state.settings.battleSpeed = 2;
  const pendingSpeed = window.BattleEffectUtils.setSpeed(global.state, 1);
  await Promise.resolve();
  assert(global.state.settings.battleSpeed === 2,
    "speed changes during battle effects must wait for the queue to become idle");
  global.BattleEffects.animating = false;
  releaseIdle();
  assert(await pendingSpeed && global.state.settings.battleSpeed === 1,
    "the latest deferred speed change must apply after battle effects become idle");
  delete global.BattleEffects;
  assert(window.BattleEffectUtils.isFollowUp({
    card: { _extraSlashResolution: true },
  }), "extra slash resolutions must use compact follow-up holds");
  global.state.settings.battleSpeed = 1;
  const nativeSetTimeout = global.setTimeout;
  const nativeArrayAt = Array.prototype.at;
  const delays = [];
  global.setTimeout = (callback, ms, ...args) => {
    delays.push(ms);
    return nativeSetTimeout(callback, 0, ...args);
  };
  Array.prototype.at = undefined;
  try {
    const unsupported = { style: {} };
    await window.BattleEffectUtils.runAnim(unsupported, [
      { opacity: "0", transform: "translateX(0)" },
      { opacity: "1", transform: "translateX(12px)" },
    ], { duration: 40, fill: "forwards" });
    assert(unsupported.style.opacity === "1"
      && unsupported.style.transform === "translateX(12px)",
    "missing Element.animate must apply the final frame without Array.at");

    const throwingAnimate = {
      style: {},
      animate() { throw new Error("unsupported keyframes"); },
    };
    await window.BattleEffectUtils.runAnim(throwingAnimate, {
      opacity: ["0", "1"],
      transform: ["translateX(0)", "translateX(8px)"],
    }, { duration: 15 });
    assert(throwingAnimate.style.opacity === "1"
      && throwingAnimate.style.transform === "translateX(8px)",
    "throwing Element.animate must use the final property-indexed keyframe");

    const missingFinished = {
      style: {},
      animate() { return {}; },
    };
    await window.BattleEffectUtils.runAnim(missingFinished, [
      { opacity: "0" }, { opacity: "1" },
    ], { duration: 25 });
    const stalledFinished = {
      style: {},
      finishCalls: 0,
      animate() {
        return {
          finished: new Promise(() => {}),
          finish: () => { stalledFinished.finishCalls += 1; },
        };
      },
    };
    await window.BattleEffectUtils.runAnim(stalledFinished, [
      { opacity: "0" }, { opacity: "1" },
    ], { duration: 30 });
    assert(stalledFinished.finishCalls === 1 && stalledFinished.style.opacity === "1",
      "a stalled animation.finished promise must time out and apply its final frame");
    assert(delays.includes(40) && delays.includes(25) && delays.includes(150),
      "animation fallbacks must settle after their configured duration");
  } finally {
    Array.prototype.at = nativeArrayAt;
    global.setTimeout = nativeSetTimeout;
  }
  console.log("Battle animation fallback tests passed");
})().catch(error => {
  console.error(error.message);
  process.exit(1);
});
