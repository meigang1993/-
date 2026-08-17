const assert = require("assert");
const fs = require("fs");

global.window = global;
require("../src/original/data-skins.js");
require("../src/original/skins.js");
require("../src/original/skin-fx-runtime.js");
require("../src/original/wendy-teacher-skin-fx.js");
require("../src/original/wendy-teacher-skin-actions.js");

const base = SkinSystem.byId("wendy_default");
const skin = SkinSystem.byId("wendy_benevolent_teacher");
assert(base?.initial && base.art === "./assets/images/wendy-portrait.f262b034.webp"
  && fs.existsSync(`./publish/${base.art.slice(2)}`),
  "Wendy must retain a selectable default skin");
assert(skin?.charId === "wendy" && skin.quality === "epic"
  && SkinSystem.price(skin) === 10,
  "Benevolent Teacher must be Wendy's 10-essence epic skin");
assert(skin.dynamicEffect === "wendy-teacher" && skin.specialEffect === true,
  "Benevolent Teacher must enable its dedicated battle effects");
assert(skin.art === "./assets/generated/wendy-benevolent-teacher-desert-school.bcfc0372.webp"
  && fs.existsSync(`./publish/${skin.art.slice(2)}`),
  "Benevolent Teacher must reference the compressed generated portrait");

const state = {
  chars: [{ id: "wendy", locked: false, level: 0 }],
  resources: { essence: 10 },
  ownedSkins: {},
  equippedSkins: {},
};
SkinSystem.ensure(state);
assert(state.equippedSkins.wendy === "wendy_default",
  "Wendy's default skin must be equipped after unlock");
assert(SkinSystem.buy(state, skin.id) && state.resources.essence === 0,
  "Benevolent Teacher purchase must cost 10 essence");
assert(state.equippedSkins.wendy === skin.id
  && SkinSystem.applyToChar(state, state.chars[0]).art === skin.art,
  "Purchased Benevolent Teacher must equip and replace Wendy's portrait");

assert(WendyTeacherSkinFX.active({ skinDynamicEffect: "wendy-teacher" }),
  "Wendy teacher units must activate the dedicated effect controller");
assert(!WendyTeacherSkinFX.active({ skinDynamicEffect: "flora-sonic" }),
  "Other skin effects must not activate Wendy's controller");

let tones = 0;
window.BattleAudio = { tone() { tones += 1; } };
window.state = {
  battle: { test: false },
  chars: state.chars,
  ownedSkins: { wendy_default: true, [skin.id]: true },
  equippedSkins: { wendy: "wendy_default" },
};
const staleTeacherUnit = { ref: "wendy", skinDynamicEffect: "wendy-teacher" };
WendyTeacherSkinFX.wisdom(window.state, staleTeacherUnit);
assert.strictEqual(tones, 0,
  "Wendy's default skin must not play Benevolent Teacher wisdom audio");
window.state.equippedSkins.wendy = skin.id;
WendyTeacherSkinFX.wisdom(window.state, staleTeacherUnit);
assert.strictEqual(tones, 2,
  "Benevolent Teacher wisdom must play its two dedicated tones");
delete window.state;
delete window.BattleAudio;

[
  ["runtime-battle-styles.js", "wendy-teacher-skin.css"],
  ["app-render.js", "WendyTeacherSkinFX?.sync"],
  ["battle-fx.js", "WendyTeacherSkinFX?.cancel"],
  ["battle-victory.js", "wendy-teacher-victory-show"],
  ["wendy-skills.js", "WendyTeacherSkinFX?.cover"],
  ["wendy-skills.js", "WendyTeacherSkinFX?.wisdom"],
  ["wendy-skills.js", "WendyTeacherSkinFX?.answer"],
].forEach(([file, token]) => {
  assert(fs.readFileSync(`./src/original/${file}`, "utf8").includes(token),
    `${file} is missing ${token}`);
});

const css = fs.readFileSync("./publish/wendy-teacher-skin.css", "utf8");
["wendy-teacher-entry", "wendy-teacher-idle", "wendy-teacher-cover",
  "wendy-teacher-answer", "wendy-teacher-victory-show"].forEach(token => {
  assert(css.includes(token), `Wendy teacher skin CSS is missing ${token}`);
});
["wendyTeacherGlyphHalo", "wendyTeacherBookmark", "wendyTeacherIdle"].forEach(token => {
  assert(!css.includes(`animation: ${token} `) && !css.includes(`@keyframes ${token} {`),
    `Persistent teacher idle animation ${token} must stay disabled`);
});

console.log("Wendy Benevolent Teacher skin tests passed");
