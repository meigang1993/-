const assert = require("assert");
const fs = require("fs");

global.window = global;
require("../src/original/data-skins.js");
require("../src/original/skins.js");
require("../src/original/skin-fx-runtime.js");
require("../src/original/angelica-berserker-skin-fx.js");
require("../src/original/angelica-luka-skills.js");

const firstCardActor = { ref: "angelica" };
window.BattleLines = { skill() {} };
const turnState = { battle: { turn: 1 } };
AngelicaLukaSkills.beforeCardPlayed(turnState, firstCardActor, { type: "tactic", drawCards: 2 });
assert(!firstCardActor.angelicaFirstCardDone,
  "non-damaging cards must not consume Angelica's first-damage-card bonus");
AngelicaLukaSkills.beforeCardPlayed(turnState, firstCardActor, { type: "slash", power: 1 });
assert(firstCardActor.angelicaFirstCardDone,
  "the first damaging card must consume Angelica's first-damage-card bonus");
turnState.battle.turn = 2;
AngelicaLukaSkills.beforeCardPlayed(turnState, firstCardActor, { type: "slash", power: 1 });
assert(firstCardActor.angelicaFirstCardTurn === 2,
  "the first damaging card must be available again on the next turn");

const base = SkinSystem.byId("angelica_default");
const berserker = SkinSystem.byId("angelica_berserker");
assert(base?.initial && base.art === "./assets/images/angelica-portrait.webp"
  && fs.existsSync(`./publish/${base.art.slice(2)}`),
  "Angelica must retain a selectable default skin");
assert(berserker?.charId === "angelica" && berserker.quality === "epic"
  && !berserker.unlockLevel && !berserker.specialIllustration && SkinSystem.price(berserker) === 10,
  "Berserker must be Angelica's separate 10-essence epic skin");
assert(berserker.dynamicEffect === "angelica-berserker" && berserker.specialEffect === true,
  "Berserker must enable its dedicated battle effects");
assert(berserker.art === "./assets/generated/angelica-berserker.f7d20f40.webp"
  && fs.existsSync(`./publish/${berserker.art.slice(2)}`),
  "Berserker must reference its generated portrait");

const applied = SkinSystem.applyToChar({
  chars: [{ id: "angelica", locked: false, level: 10 }],
  equippedSkins: { angelica: "angelica_berserker" },
  ownedSkins: { angelica_berserker: true },
}, { id: "angelica" });
assert(applied.art === berserker.art
  && applied.skinDynamicEffect === "angelica-berserker"
  && applied.skinName === "狂暴战士",
  "equipping Berserker must resolve through SkinSystem");

assert(AngelicaBerserkerSkinFX.active({ skinDynamicEffect: "angelica-berserker" }),
  "Berserker battle units must activate the dedicated controller");
assert(!AngelicaBerserkerSkinFX.active({ skinDynamicEffect: "flora-sonic" }),
  "Other skins must not activate Angelica's dedicated effects");

window.state = {
  battle: { test: false },
  chars: [{ id: "angelica", locked: false, level: 10 }],
  equippedSkins: { angelica: "angelica_berserker" },
  ownedSkins: { angelica_berserker: true },
};
assert(AngelicaBerserkerSkinFX.active({ ref: "angelica" }),
  "Berserker effects must resolve from current equipment when the battle cache is missing");
window.state.equippedSkins.angelica = "angelica_default";
assert(!AngelicaBerserkerSkinFX.active({ ref: "angelica", skinDynamicEffect: "angelica-berserker" }),
  "Switching to Angelica's default skin must disable stale Berserker effects");
delete window.state;

[
  ["angelica-luka-skills.js", "AngelicaBerserkerSkinFX?.might"],
  ["angelica-luka-skills.js", "AngelicaBerserkerSkinFX?.rageSpend"],
  ["angelica-luka-skills.js", "AngelicaBerserkerSkinFX?.taunt"],
  ["angelica-luka-skills.js", "AngelicaBerserkerSkinFX?.rageGain"],
  ["battle-damage-utils.js", "AngelicaBerserkerSkinFX?.rageTrail"],
  ["battle-victory.js", "angelica-berserker-victory-show"],
  ["app-render.js", "AngelicaBerserkerSkinFX?.sync"],
  ["battle-fx.js", "AngelicaBerserkerSkinFX?.cancel"],
].forEach(([file, token]) => {
  assert(fs.readFileSync(`./src/original/${file}`, "utf8").includes(token),
    `${file} is missing ${token}`);
});

const styles = fs.readFileSync("./src/original/runtime-battle-styles.js", "utf8");
assert(styles.includes('"angelica-berserker": "./angelica-berserker-skin.css"'),
  "runtime battle styles must map angelica-berserker to its css");

const css = fs.readFileSync("./publish/angelica-berserker-skin.css", "utf8");
[
  "angelica-berserker-entering", "angelica-berserker-might",
  "angelica-berserker-rage-gain", "angelica-berserker-rage-slam",
  "angelica-berserker-rage-trail", "angelica-berserker-taunt",
  "angelica-berserker-victory-show",
].forEach(token => assert(css.includes(token), `Berserker CSS is missing ${token}`));

const skinActionSource = fs.readFileSync("./src/original/app-battle-skin-actions.js", "utf8");
assert(skinActionSource.includes("if (isCurrent()) {\n      actionState.appearanceSaving = false;"),
  "Stale battle skin requests must not rerender or clear the current appearance save state");

console.log("test-angelica-berserker-skin: all assertions passed");
