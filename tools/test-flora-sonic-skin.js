const assert = require("assert");
const fs = require("fs");

global.window = global;
require("../src/original/data-skins.js");
require("../src/original/skins.js");
require("../src/original/skin-fx-runtime.js");
require("../src/original/flora-sonic-skin-fx.js");

const base = SkinSystem.byId("flora_default");
const sonic = SkinSystem.byId("flora_sonic_assassin");
assert(base?.initial && base.art === "./assets/images/flora-portrait.71c5d516.webp"
  && fs.existsSync(`./publish/${base.art.slice(2)}`),
  "Flora must retain a selectable default skin");
assert(sonic?.charId === "flora" && sonic.quality === "epic"
  && !sonic.unlockLevel && !sonic.specialIllustration && SkinSystem.price(sonic) === 10,
  "Sonic Assassin must remain Flora's separate 10-essence epic skin");
assert(sonic.dynamicEffect === "flora-sonic" && sonic.specialEffect === true,
  "Sonic Assassin must enable its dedicated battle effects");
assert(sonic.art === "./assets/generated/flora-sonic-assassin.8543df2c.webp"
  && fs.existsSync(`./publish/${sonic.art.slice(2)}`),
  "Sonic Assassin must reference its generated portrait");
assert(sonic.victoryArt === "./assets/generated/flora-sonic-assassin-victory.7ab2b6cd.webp"
  && fs.existsSync(`./publish/${sonic.victoryArt.slice(2)}`),
  "Sonic Assassin must reference its dedicated victory portrait");
const applied = SkinSystem.applyToChar({
  chars: [{ id: "flora", locked: false, level: 10 }],
  equippedSkins: { flora: "flora_sonic_assassin" },
  ownedSkins: { flora_sonic_assassin: true },
}, { id: "flora" });
assert(applied.skinVictoryArt === sonic.victoryArt,
  "equipped Sonic Assassin characters must carry victory art into battle");
assert(FloraSonicSkinFX.active({ skinDynamicEffect: "flora-sonic" }),
  "Sonic Assassin battle units must activate the dedicated controller");
assert(!FloraSonicSkinFX.active({ skinDynamicEffect: "nonoka-idol" }),
  "Other skins must not activate Flora's dedicated effects");

window.state = {
  battle: { test: false },
  chars: [{ id: "flora", locked: false, level: 10 }],
  equippedSkins: { flora: "flora_sonic_assassin" },
  ownedSkins: { flora_sonic_assassin: true },
};
assert(FloraSonicSkinFX.active({ ref: "flora" }),
  "Flora effects must resolve from current equipment when the battle cache is missing");
window.state.equippedSkins.flora = "flora_default";
assert(!FloraSonicSkinFX.active({ ref: "flora", skinDynamicEffect: "flora-sonic" }),
  "Switching to Flora's default skin must disable stale Sonic Assassin effects");
delete window.state;

[
  ["flora-speed-assault.js", "FloraSonicSkinFX?.assault"],
  ["flora-speed-assault.js", "FloraSonicSkinFX?.assaultDefeat"],
  ["flora-skills.js", "FloraSonicSkinFX?.wing"],
  ["flora-skills.js", "FloraSonicSkinFX?.flyingBlade"],
  ["battle-victory.js", "flora-sonic-victory-show"],
  ["app-render.js", "FloraSonicSkinFX?.sync"],
  ["battle-fx.js", "FloraSonicSkinFX?.cancel"],
].forEach(([file, token]) => {
  assert(fs.readFileSync(`./src/original/${file}`, "utf8").includes(token),
    `${file} is missing ${token}`);
});

const css = fs.readFileSync("./publish/flora-sonic-skin.css", "utf8");
[
  "flora-sonic-entry", "flora-sonic-idle-shift", "flora-sonic-assault-hit",
  "flora-sonic-wing-shield", "flora-sonic-blade-x",
  "flora-sonic-victory-show", "flora-sonic-victory-echoes",
].forEach(token => assert(css.includes(token), `Flora Sonic CSS is missing ${token}`));
assert(css.includes(".flora-sonic-victory-echoes { position: absolute; inset: 0; overflow: hidden; }"),
  "victory echoes must be clipped to Flora's art region");
["floraSonicIdle", "floraSonicHum", "floraSonicField"]
  .forEach(token => assert(!css.includes(`animation: ${token} `),
    `Sonic Assassin persistent idle animation ${token} must stay disabled`));

console.log("Flora Sonic Assassin skin tests passed");
