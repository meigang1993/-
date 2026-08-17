global.window = global;
require("../src/original/game-random.js");

const timers = [];
const originalSetTimeout = global.setTimeout;
const originalClearTimeout = global.clearTimeout;
global.setTimeout = callback => {
  timers.push(callback);
  return timers.length;
};
global.clearTimeout = () => {};

let artAvailable = false;
let appended = 0;
let artRect = { left: 10, top: 10, width: 80, height: 80 };
const appendedClasses = [];
const feedbackOrder = [];
const unitClasses = new Set();
const unit = {
  dataset: { target: "a0" },
  style: { setProperty() {}, removeProperty() {} },
  classList: {
    add(...names) { names.forEach(name => unitClasses.add(name)); },
    remove(...names) { names.forEach(name => unitClasses.delete(name)); },
  },
};
const art = {
  getBoundingClientRect: () => artRect,
  closest: selector => selector === ".unit" ? unit : null,
  addEventListener() {},
  removeEventListener() {},
};
global.document = {
  addEventListener() {},
  querySelector(selector) {
    if (selector.includes(".unit-art")) return artAvailable ? art : null;
    return null;
  },
  querySelectorAll() { return []; },
  createElement() {
    return {
      className: "",
      style: { setProperty() {} },
      remove() {},
    };
  },
  body: {
    appendChild(element) {
      appended += 1;
      appendedClasses.push(element.className);
      feedbackOrder.push(`append:${element.className}`);
    },
  },
};

global.BattleDamageFX = {
  play() { feedbackOrder.push("attribute"); },
  impact(evt) { feedbackOrder.push(`impact:${evt.attackType === "magic" || evt.magicDamage ? "magic" : evt.damageTypes?.[0] || "physical"}`); },
  cancel() {},
};
require("../src/original/battle-audio-samples.js");
require("../src/original/battle-audio.js");
window.BattleAudio.floatSfx = kind => feedbackOrder.push(`sfx:${kind}`);
require("../src/original/battle-bump-fx.js");
require("../src/original/battle-hit-fx-fallback.js");
require("../src/original/battle-float-numbers.js");
require("../src/original/battle-float-fx.js");
require("../src/original/battle-fx.js");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function flushTimers() {
  while (timers.length) timers.shift()();
}

function cleanup() {
  global.setTimeout = originalSetTimeout;
  global.clearTimeout = originalClearTimeout;
}

module.exports = {
  appendedClasses,
  assert,
  BattleFX: window.BattleFX,
  cleanup,
  feedbackOrder,
  flushTimers,
  getAppended: () => appended,
  setArtAvailable: value => { artAvailable = value; },
  setArtRect: value => { artRect = value; },
};
