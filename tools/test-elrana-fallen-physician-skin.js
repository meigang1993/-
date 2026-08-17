const assert = require("assert");
const fs = require("fs");

global.window = global;
require("../src/original/skins.js");
require("../src/original/skin-fx-runtime.js");
require("../src/original/elrana-fallen-physician-skin-fx.js");

const base = SkinSystem.byId("elrana_default");
const skin = SkinSystem.byId("elrana_fallen_physician");
assert(base?.initial && base.art === "./assets/images/elrana-new-portrait.webp"
  && fs.existsSync(`./publish/${base.art.slice(2)}`),
  "Elrana must retain a selectable default skin");
assert(skin?.charId === "elrana" && skin.quality === "epic"
  && SkinSystem.price(skin) === 10,
  "Fallen Physician must be Elrana's 10-essence epic skin");
assert(skin.dynamicEffect === "elrana-fallen-physician" && skin.specialEffect === true,
  "Fallen Physician must enable its dedicated battle effects");
assert(skin.art === "./assets/generated/elrana-fallen-physician.5fb5e43a.webp"
  && fs.existsSync(`./publish/${skin.art.slice(2)}`),
  "Fallen Physician must reference its generated portrait");

const state = {
  chars: [{ id: "elrana", locked: false, level: 0 }],
  resources: { essence: 10 },
  ownedSkins: {},
  equippedSkins: {},
};
SkinSystem.ensure(state);
assert(state.equippedSkins.elrana === "elrana_default",
  "Elrana's default skin must be equipped after unlock");
assert(SkinSystem.buy(state, skin.id) && state.resources.essence === 0,
  "Fallen Physician purchase must cost 10 essence");
assert(state.equippedSkins.elrana === skin.id
  && SkinSystem.applyToChar(state, state.chars[0]).art === skin.art,
  "Purchased Fallen Physician must equip and replace Elrana's portrait");
assert(SkinSystem.equip(state, base.id)
  && SkinSystem.applyToChar(state, state.chars[0]).art === base.art,
  "Elrana must be able to switch back to the default portrait");

assert(ElranaFallenPhysicianSkinFX.active({ skinDynamicEffect: "elrana-fallen-physician" }),
  "Fallen Physician units must activate the dedicated effect controller");
assert(!ElranaFallenPhysicianSkinFX.active({ skinDynamicEffect: "flora-sonic" }),
  "Other skin effects must not activate Elrana's controller");

window.state = {
  battle: { test: false },
  chars: state.chars,
  ownedSkins: { [skin.id]: true },
  equippedSkins: { elrana: skin.id },
};
assert(ElranaFallenPhysicianSkinFX.active({ ref: "elrana" }),
  "Elrana effects must resolve from current equipment when cache is missing");
window.state.equippedSkins.elrana = base.id;
assert(!ElranaFallenPhysicianSkinFX.active({
  ref: "elrana",
  skinDynamicEffect: "elrana-fallen-physician",
}), "Switching to default must disable stale Fallen Physician effects");
delete window.state;

const healingSource = fs.readFileSync("./src/original/elrana-healing-skills.js", "utf8");
assert(healingSource.includes('source !== "回春之手" && source !== "再生肉体"'),
  "Regeneration must not also trigger the generic healing effect");
const fxSource = fs.readFileSync("./src/original/elrana-fallen-physician-skin-fx.js", "utf8");
assert(fxSource.includes("if (activeBattle) cancel();"),
  "Skin sync must cancel mounted effects after the skin is no longer active");
const victorySource = fs.readFileSync("./src/original/battle-victory.js", "utf8");

[
  ["runtime-battle-styles.js", "elrana-fallen-physician-skin.css"],
  ["app-render.js", "ElranaFallenPhysicianSkinFX?.sync"],
  ["battle-fx.js", "ElranaFallenPhysicianSkinFX?.cancel"],
  ["elrana-healing-skills.js", "ElranaFallenPhysicianSkinFX?.heal"],
  ["elrana-healing-skills.js", "ElranaFallenPhysicianSkinFX?.care"],
  ["elrana-healing-skills.js", "ElranaFallenPhysicianSkinFX?.regenerate"],
  ["battle-victory.js", "elrana-fallen-physician-victory-show"],
].forEach(([file, token]) => {
  assert(fs.readFileSync(`./src/original/${file}`, "utf8").includes(token),
    `${file} is missing ${token}`);
});

const css = fs.readFileSync("./publish/elrana-fallen-physician-skin.css", "utf8");
[
  "elrana-fallen-physician-entry", "elrana-fallen-physician-idle",
  "elrana-fallen-physician-heal-target", "elrana-fallen-physician-care",
  "elrana-fallen-physician-regenerate", "elrana-fallen-physician-victory-show",
].forEach(token => assert(css.includes(token), `Fallen Physician CSS is missing ${token}`));
assert(css.includes("elrana-fallen-physician-organs")
  && victorySource.includes("再生的尽头，是永生。"),
  "Fallen Physician victory must include the organ-heart finale and motto");

console.log("Elrana Fallen Physician skin tests passed");
