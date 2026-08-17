const assert = require("assert");
const fs = require("fs");

global.window = global;
require("../src/original/skins.js");
require("../src/original/skin-fx-runtime.js");
require("../src/original/bertis-queen-skin-fx.js");

const base = SkinSystem.byId("bertis_default");
const queen = SkinSystem.byId("bertis_arrogant_queen");
assert(base?.initial && base.art === "./assets/images/bertis-portrait.png",
  "Bertis must retain a selectable default skin");
assert(queen?.charId === "bertis" && queen.quality === "epic" && SkinSystem.price(queen) === 10,
  "Arrogant Queen must be Bertis's 10-essence epic skin");
assert(queen.dynamicEffect === "bertis-queen" && queen.specialEffect === true,
  "Arrogant Queen must enable its dedicated battle effects");
assert(queen.art === "./assets/generated/bertis-arrogant-queen-mist-gothic.cd523966.webp" &&
  fs.existsSync(`./publish/${queen.art.slice(2)}`), "Arrogant Queen must reference its fixed generated art");
assert(queen.damagedArt === "./assets/generated/bertis-arrogant-queen-critical-damage.e0a10370.webp"
  && fs.existsSync(`./publish/${queen.damagedArt.slice(2)}`),
  "Arrogant Queen must define its fixed inactive-arrogance portrait");
assert(BertisQueenSkinFX.active({ skinDynamicEffect: "bertis-queen" }),
  "Arrogant Queen battle units must activate the dedicated controller");
assert(!BertisQueenSkinFX.active({ skinDynamicEffect: "manny-gun" }),
  "Other skins must not activate Bertis's dedicated effects");
window.state = {
  battle: { test: false },
  equippedSkins: { bertis: "bertis_arrogant_queen" },
  ownedSkins: { bertis_arrogant_queen: true },
};
assert(BertisQueenSkinFX.active({ ref: "bertis" }),
  "Bertis effects must resolve from current equipment when the battle-unit cache is missing");
const damagedBertis = { ref: "bertis", hp: 30, maxHp: 30, bertisArrogant: false };
assert(SkinSystem.damagedArtOf(window.state, damagedBertis) === queen.damagedArt,
  "Arrogant Queen must use its alternate portrait when Arrogant Brat is inactive");
damagedBertis.visualHp = damagedBertis.maxHp;
assert(!SkinSystem.damagedArtOf(window.state, damagedBertis),
  "Queued damage must retain Arrogant Queen's normal portrait until its visual hit commits");
damagedBertis.visualHp = damagedBertis.maxHp - 1;
assert(SkinSystem.damagedArtOf(window.state, damagedBertis) === queen.damagedArt,
  "Arrogant Queen must switch portrait when the queued damage reaches Bertis");
damagedBertis.bertisArrogant = true;
damagedBertis.visualHp = damagedBertis.maxHp - 1;
assert(SkinSystem.damagedArtOf(window.state, damagedBertis) === queen.damagedArt,
  "Queued healing must retain Arrogant Queen's damaged portrait until its visual heal commits");
damagedBertis.visualHp = damagedBertis.maxHp;
assert(!SkinSystem.damagedArtOf(window.state, damagedBertis),
  "Arrogant Queen must restore its normal portrait when the full-heal visual commits");
delete damagedBertis.visualHp;
window.state.equippedSkins.bertis = "bertis_default";
damagedBertis.bertisArrogant = false;
assert(!SkinSystem.damagedArtOf(window.state, damagedBertis),
  "Bertis's default skin must ignore the Arrogant Queen state portrait");
assert(!BertisQueenSkinFX.active({ ref: "bertis", skinDynamicEffect: "bertis-queen" }),
  "Switching to Bertis's default skin must override stale queen-skin state");
delete window.state;

[
  ["bertis-gerlot-skills.js", "BertisQueenSkinFX?.arrogance"],
  ["bertis-gerlot-skills.js", "BertisQueenSkinFX?.whip"],
  ["bertis-gerlot-skills.js", "BertisQueenSkinFX?.growth"],
  ["bertis-gerlot-skills.js", "BertisQueenSkinFX?.takeFood"],
  ["bertis-gerlot-skills.js", "BertisQueenSkinFX?.hit"],
  ["battle-victory.js", "bertis-queen-victory-show"],
  ["app-render.js", "BertisQueenSkinFX?.sync"],
  ["battle-fx.js", "BertisQueenSkinFX?.cancel"],
].forEach(([file, token]) => {
  assert(fs.readFileSync(`./src/original/${file}`, "utf8").includes(token), `${file} is missing ${token}`);
});

const css = fs.readFileSync("./publish/bertis-queen-skin.css", "utf8");
["bertis-queen-entry", "bertis-queen-arrogance", "bertis-queen-whip-line",
  "bertis-queen-whip-hit", "bertis-queen-growth", "bertis-queen-food-flight",
  "bertis-queen-angry-fx", "bertis-queen-victory-show"].forEach(token => {
  assert(css.includes(token), `Bertis Queen CSS is missing ${token}`);
});
["bertisQueenIdle", "bertisRoseHalo", "bertisRosePulse", "bertisCrownIdle"]
  .forEach(token => assert(!css.includes(`animation: ${token} `),
    `Arrogant Queen persistent idle animation ${token} must stay disabled`));

console.log("Bertis Arrogant Queen skin tests passed");
