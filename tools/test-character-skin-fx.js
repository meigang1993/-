const assert = require("assert");
const fs = require("fs");

global.window = global;
require("../src/original/data-skins.js");
require("../src/original/skins.js");
require("../src/original/skin-fx-runtime.js");
require("../src/original/character-skin-fx.js");

const lokarSkin = SkinSystem.byId("lokar_motherbound");
const bestaSkin = SkinSystem.byId("besta_doll_energy_queen");
assert(lokarSkin?.specialEffect && lokarSkin.dynamicEffect === "lokar-motherbound",
  "Motherbound Hero must advertise and activate Lokar's dedicated effects");
assert(bestaSkin?.specialEffect && bestaSkin.dynamicEffect === "besta-mecha",
  "Mecha Doll must advertise and activate Besta Doll's dedicated effects");
assert(bestaSkin?.damagedArt?.includes("besta-doll-critical-damage"),
  "Mecha Doll must define its Extract Essence state portrait");
assert(CharacterSkinFX.active({ skinDynamicEffect: "lokar-motherbound" }, "lokar-motherbound"),
  "Lokar's controller must activate for Motherbound Hero");
assert(!CharacterSkinFX.active({ skinDynamicEffect: "besta-mecha" }, "lokar-motherbound"),
  "Skin effects must not cross-activate");
window.state = {
  battle: { test: false },
  chars: [
    { id: "lokar", locked: false },
    { id: "besta_doll", locked: false },
  ],
  equippedSkins: { lokar: "lokar_motherbound", besta_doll: "besta_doll_energy_queen" },
  ownedSkins: { lokar_motherbound: true, besta_doll_energy_queen: true },
};
assert(CharacterSkinFX.active({ ref: "lokar" }, "lokar-motherbound"),
  "Lokar effects must resolve from the currently equipped skin when the battle-unit cache is missing");
assert(CharacterSkinFX.active({ ref: "besta_doll" }, "besta-mecha"),
  "Besta Doll effects must resolve from the currently equipped skin when the battle-unit cache is missing");
const damagedBesta = {
  ref: "besta_doll", hp: 30, maxHp: 30, extractMagicAttack: true,
};
assert(SkinSystem.damagedArtOf(window.state, damagedBesta) === bestaSkin.damagedArt,
  "Mecha Doll must use its alternate portrait while Extract Essence is active");
damagedBesta.extractMagicAttack = false;
assert(!SkinSystem.damagedArtOf(window.state, damagedBesta),
  "Mecha Doll must restore its normal portrait after Extract Essence ends");
window.state.equippedSkins.besta_doll = "besta_doll_default";
const staleDamageFields = {
  ref: "besta_doll", name: "贝丝妲魔偶", hp: 15, maxHp: 30,
  extractMagicAttack: true, skinDamagedArt: bestaSkin.damagedArt,
};
assert(!SkinSystem.damagedArtOf(window.state, staleDamageFields),
  "Default Besta Doll must ignore the Mecha Doll state portrait");
const defaultApplied = SkinSystem.applyToChar(window.state, {
  id: "besta_doll", art: "./default.webp", avatar: "./default.webp",
});
assert(!defaultApplied.skinDamagedArt,
  "Default skins must not expose a skill-state variant to battle preloading");
window.state.equippedSkins.besta_doll = "besta_doll_energy_queen";
delete window.state.ownedSkins.besta_doll_energy_queen;
assert(!SkinSystem.damagedArtOf(window.state, {
  ref: "besta_doll", extractMagicAttack: true,
}), "An unowned equipped skin id must not activate its skill-state portrait");
window.state.ownedSkins.besta_doll_energy_queen = true;
window.state.equippedSkins.lokar = "lokar_default";
assert(!CharacterSkinFX.active({ ref: "lokar", skinDynamicEffect: "lokar-motherbound" }, "lokar-motherbound"),
  "Switching to Lokar's default skin must override a stale special-effect cache");
delete window.state;

const state = { battle: { allies: [], enemies: [] } };
const lokar = { uid: "a0", skinDynamicEffect: "lokar-motherbound" };
const besta = { uid: "a1", skinDynamicEffect: "besta-mecha" };
CharacterSkinFX.bloodPact(state, lokar, 4);
CharacterSkinFX.extractEssence(state, besta, { ref: "other_male" }, 3);
assert(lokar.skinBloodPactActive && lokar.skinBloodPactPower === 4,
  "Blood Pact must retain its turn-long skin state and consumed-pile strength");
assert(besta.skinExtractActive && besta.skinExtractStrong,
  "Extract Essence must retain the stronger non-Lokar male variant");
CharacterSkinFX.endTurn(state, lokar);
CharacterSkinFX.endTurn(state, besta);
assert(!lokar.skinBloodPactActive && !besta.skinExtractActive,
  "Turn end must clear persistent skin effects");

const hooks = [
  ["character-skin-fx.js", "BattleEffectAnchors?.place"],
  ["character-skin-fx.js", "BattleEffectAnchors?.mirror"],
  ["character-skin-fx.js", "\"action-first\""],
  ["character-skin-fx.js", "\"battlefield\""],
  ["battle-card-specials.js", "CharacterSkinFX?.bloodPact"],
  ["battle-card-specials.js", "CharacterSkinFX?.extractEssence"],
  ["battle-effect-event-runner.js", "CharacterSkinFX?.battleCourageResult"],
  ["lokar-skills.js", "CharacterSkinFX?.windSlashEnd"],
  ["battle-damage-triggers.js", "CharacterSkinFX?.soulBlade"],
  ["battle-damage-triggers.js", "CharacterSkinFX?.soulScythe"],
  ["battle-damage-utils.js", "CharacterSkinFX?.attackTrail"],
  ["battle-end-phase.js", "CharacterSkinFX?.endTurn"],
  ["character-skin-fx.js", '!!unit?.skinBloodPactActive && active(unit, "lokar-motherbound")'],
  ["character-skin-fx.js", '!!unit?.skinExtractActive && active(unit, "besta-mecha")'],
  ["app-battle-skin-actions.js", "forEach(fx => fx?.cancel?.())"],
  ["battle.js", "return combat.triggerBattleCourage"],
];
hooks.forEach(([file, token]) => {
  const source = fs.readFileSync(`./src/original/${file}`, "utf8");
  assert(source.includes(token), `${file} is missing ${token}`);
});

const css = fs.readFileSync("./publish/character-skin-fx.css", "utf8");
["skinfx-courage", "skinfx-blood-pact", "skinfx-wind-start", "skinfx-soul-card",
  "skinfx-scythe", "skinfx-extract-line", "skin-blood-pact-active", "skin-extract-active",
].forEach(token => {
  assert(css.includes(token), `Character skin CSS is missing ${token}`);
});
assert(!css.includes("battle-damage-skin-overlay"),
  "Character skin CSS must not retain the removed six-second art overlay");

console.log("Lokar and Besta Doll skin effect tests passed");
