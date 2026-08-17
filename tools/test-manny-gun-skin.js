const assert = require("assert");
const fs = require("fs");

global.window = global;
require("../src/original/data-skins.js");
require("../src/original/skins.js");
require("../src/original/manny-gun-skin-actions.js");
require("../src/original/skin-fx-runtime.js");
require("../src/original/manny-gun-skin-fx.js");

const defaultSkin = SkinSystem.byId("manny_default");
const gunSkin = SkinSystem.byId("manny_gun_succubus");
assert(defaultSkin?.initial && defaultSkin.art === "./assets/images/manny-portrait.webp",
  "Manny's default portrait must remain available");
assert(gunSkin?.charId === "manny" && gunSkin.quality === "epic"
  && !gunSkin.unlockLevel && !gunSkin.specialIllustration && SkinSystem.price(gunSkin) === 12,
  "Gun Succubus must remain Manny's separate 12-essence epic skin");
assert(gunSkin.dynamicEffect === "manny-gun" && gunSkin.specialEffect === true,
  "Gun Succubus must enable its dedicated battle effects");
assert(gunSkin.art === "./assets/generated/manny-gun-succubus-weapon-skeleton.3696a917.webp" &&
  fs.existsSync(`./publish/${gunSkin.art.slice(2)}`), "Gun Succubus must reference its fixed generated art");

assert(MannyGunSkinFX.active({ skinDynamicEffect: "manny-gun" }),
  "Gun Succubus battle units must activate Manny's dedicated effect controller");
assert(!MannyGunSkinFX.active({ skinDynamicEffect: "nonoka-idol" }),
  "Other skins must not activate Manny's dedicated effects");
window.state = {
  battle: { test: false },
  chars: [{ id: "manny", locked: false, level: 10 }],
  equippedSkins: { manny: "manny_gun_succubus" },
  ownedSkins: { manny_gun_succubus: true },
};
assert(MannyGunSkinFX.active({ ref: "manny" }),
  "Manny effects must resolve from current equipment when the battle-unit cache is missing");
window.state.equippedSkins.manny = "manny_default";
assert(!MannyGunSkinFX.active({ ref: "manny", skinDynamicEffect: "manny-gun" }),
  "Switching to Manny's default skin must override stale gun-skin state");
delete window.state;

const hooks = [
  ["manny-skills.js", "MannyGunSkinFX?.armory"],
  ["manny-skills.js", "MannyGunSkinFX?.barrettJudge"],
  ["manny-skills.js", "MannyGunSkinFX?.weaponAttack"],
  ["manny-skills.js", "MannyGunSkinFX?.dimensionTransfer"],
  ["manny-skills.js", "MannyGunSkinFX?.spikeMark"],
  ["manny-skills.js", "MannyGunSkinFX?.spikeBurst"],
  ["battle-combat-attack-values.js", "MannyGunSkinFX?.ak47Burst"],
  ["battle-victory.js", "manny-gun-victory-show"],
  ["app-render.js", "MannyGunSkinFX?.sync"],
  ["battle-fx.js", "MannyGunSkinFX?.cancel"],
];
hooks.forEach(([file, token]) => {
  const source = fs.readFileSync(`./src/original/${file}`, "utf8");
  assert(source.includes(token), `${file} is missing ${token}`);
});

const css = fs.readFileSync("./publish/manny-gun-skin.css", "utf8");
["manny-gun-entry", "manny-gun-armory", "manny-portal", "manny-ak47-shot",
  "manny-barrett-shot", "manny-cannon-shot", "manny-flame-line", "manny-spike-burst",
  "manny-gun-victory-show", "manny-victory-arsenal"].forEach(token => {
  assert(css.includes(token), `Manny gun skin CSS is missing ${token}`);
});
["mannyGunIdle", "mannySmokeIdle"].forEach(token => {
  assert(!css.includes(`animation: ${token} `),
    `Gun Succubus persistent idle animation ${token} must stay disabled`);
});
const fxSource = fs.readFileSync("./src/original/manny-gun-skin-fx.js", "utf8");
assert(!fxSource.includes("ensureIdle") && !fxSource.includes("idleTimer"),
  "Gun Succubus must not retain a periodic audio-only idle timer");

console.log("Manny Gun Succubus effect tests passed");
