const assert = require("assert");
const fs = require("fs");

global.window = global;
require("../src/original/data-skins.js");
require("../src/original/skins.js");
require("../src/original/skin-fx-runtime.js");
require("../src/original/nonoka-idol-skin-fx.js");

const skin = SkinSystem.byId("nonoka_idol_rising_star");
const base = SkinSystem.byId("nonoka_default");
assert(base?.initial && base.art === "./assets/images/nonoka-portrait.webp",
  "Nonoka must retain a selectable default skin");
assert(skin?.charId === "nonoka" && skin.quality === "epic",
  "Idol Rising Star must be an epic Nonoka skin");
assert(SkinSystem.price(skin) === 10 && skin.specialEffect,
  "Idol Rising Star must cost exactly 10 essence and advertise its special effects");
assert(skin.art === "./assets/generated/nonoka-idol-rising-star-star-eyes.97cc2566.webp",
  "Idol Rising Star must reference the generated portrait");
assert(NonokaIdolSkinFX.active({ skinDynamicEffect: "nonoka-idol" }),
  "Idol Rising Star battle units must activate the dedicated effect controller");
assert(!NonokaIdolSkinFX.active({ skinDynamicEffect: null }),
  "Other skins must not activate Nonoka's dedicated effects");
window.state = {
  battle: { test: true },
  testSkins: { nonoka: "nonoka_idol_rising_star" },
  equippedSkins: { nonoka: "nonoka_default" },
  ownedSkins: {},
};
assert(NonokaIdolSkinFX.active({ ref: "nonoka" }),
  "Nonoka effects must follow the currently tested skin instead of a missing battle-unit cache");
window.state.testSkins.nonoka = "nonoka_default";
assert(!NonokaIdolSkinFX.active({ ref: "nonoka", skinDynamicEffect: "nonoka-idol" }),
  "Switching test equipment to Nonoka's default skin must disable stale idol effects");
delete window.state;

const css = fs.readFileSync("./publish/nonoka-idol-skin.css", "utf8");
["suit-heart", "suit-diamond", "suit-spade", "suit-club", "idol-victory-fireworks"].forEach(token => {
  assert(css.includes(token), `Nonoka skin CSS is missing ${token}`);
});
["nonokaIdolIdle", "nonokaBraceletGlow"].forEach(token => {
  assert(!css.includes(`animation: ${token} `),
    `Idol Rising Star persistent idle animation ${token} must stay disabled`);
});

console.log("Nonoka Idol Rising Star skin tests passed");
