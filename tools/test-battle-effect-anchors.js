const assert = require("assert");

global.window = global;
require("../src/original/battle-effect-anchors.js");

const battleArt = {
  getBoundingClientRect: () => ({ left: 10, top: 20, width: 80, height: 100 }),
};
const actionArt = {
  getBoundingClientRect: () => ({ left: 300, top: 400, width: 120, height: 160 }),
};
const battleRoot = {
  dataset: { target: "a0" },
  querySelector: selector => selector === ".unit-art" ? battleArt : null,
};
const actionRoot = {
  dataset: { activeInfo: "a0" },
  querySelector: selector => selector === ".portrait" ? actionArt : null,
};

global.document = {
  querySelectorAll(selector) {
    if (selector === "[data-target]") return [battleRoot];
    if (selector === "[data-active-info]") return [actionRoot];
    return [];
  },
};

assert.strictEqual(BattleEffectAnchors.battlefield("a0"), battleArt,
  "Battlefield anchors must resolve the unit row portrait");
assert.strictEqual(BattleEffectAnchors.action({ uid: "a0" }), actionArt,
  "Action anchors must resolve the active-info portrait");
assert.strictEqual(BattleEffectAnchors.resolve("a0", "action-first"), actionArt,
  "Action-first anchors must prefer the action area");
assert.strictEqual(BattleEffectAnchors.resolve("missing", "action-first"), null,
  "Missing units must not borrow another unit's action anchor");

const node = { style: {} };
const placed = BattleEffectAnchors.place(node, "a0", "action-first");
assert.deepStrictEqual(placed.center, { x: 360, y: 480 },
  "Anchor measurement must expose the action portrait center");
assert.deepStrictEqual(node.style, {
  left: "300px", top: "400px", width: "120px", height: "160px",
}, "Anchor placement must copy the measured fixed-position box");
const mirrored = BattleEffectAnchors.mirror({
  style: {}, cloneNode: () => ({ style: {}, cloned: true }),
}, "a0", "battlefield");
assert(mirrored?.node.cloned && mirrored.anchor.element === battleArt,
  "Skin self effects must be cloneable onto the battlefield portrait");

actionRoot.dataset.activeInfo = "a1";
assert.strictEqual(BattleEffectAnchors.resolve("a0", "action-first"), battleArt,
  "Action-first anchors must fall back to the battlefield portrait");

console.log("Battle effect anchor tests passed");
