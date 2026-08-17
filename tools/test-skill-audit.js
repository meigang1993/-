const fs = require("fs");
const vm = require("vm");
const {
  assert, card, createState, installGlobals, loadRuntime,
} = require("./skill-coverage-fixtures");

installGlobals();
loadRuntime();
vm.runInThisContext(fs.readFileSync("./src/original/battle-draw-feedback.js", "utf8"), { filename: "battle-draw-feedback.js" });
vm.runInThisContext(fs.readFileSync("./src/original/ui-info.js", "utf8"), { filename: "ui-info.js" });
vm.runInThisContext(fs.readFileSync("./src/original/battle-card-cleanup.js", "utf8"), { filename: "battle-card-cleanup.js" });
vm.runInThisContext(fs.readFileSync("./src/original/battle-card-active-relics.js", "utf8"), { filename: "battle-card-active-relics.js" });
vm.runInThisContext(fs.readFileSync("./src/original/battle-card-hand-interactions.js", "utf8"), { filename: "battle-card-hand-interactions.js" });
vm.runInThisContext(fs.readFileSync("./src/original/battle-card-counter-interactions.js", "utf8"), { filename: "battle-card-counter-interactions.js" });
vm.runInThisContext(fs.readFileSync("./src/original/battle-card-interactions.js", "utf8"), { filename: "battle-card-interactions.js" });
vm.runInThisContext(fs.readFileSync("./src/original/battle-card-specials.js", "utf8"), { filename: "battle-card-specials.js" });
vm.runInThisContext(fs.readFileSync("./src/original/character-skill-access.js", "utf8"), { filename: "character-skill-access.js" });
vm.runInThisContext(fs.readFileSync("./src/original/battle-card-playability.js", "utf8"), { filename: "battle-card-playability.js" });
["battle-combat-card-effects.js", "battle-combat-attack-values.js",
  "battle-combat-attack-flow.js", "battle-combat-attack.js",
  "battle-combat-resolver.js", "battle-damage-triggers.js"].forEach(file => {
  vm.runInThisContext(fs.readFileSync(`./src/original/${file}`, "utf8"), { filename: file });
});

function unit(uid, side, extra = {}) {
  return {
    uid, side, name: uid, hp: 30, maxHp: 30, block: 0, intent: 2,
    stats: { attack: 3, magic: 2, bloodlust: 2, drawPerTurn: 1 },
    skills: [], hand: [], deck: [], discard: [], consumed: [], statuses: [],
    ...extra,
  };
}

const moon = unit("moon", "ally", { ref: "nonoka" });
const moonTarget = unit("moon-target", "ally");
let state;
const extractActor = unit("extract-actor", "ally", {
  ref: "besta_doll", stats: { attack: 3, magic: 4, bloodlust: 1, drawPerTurn: 2 },
  hand: [card("Heart A", "tactic", { suit: "♥" }), card("Heart B", "response", { suit: "♥" }), card("Spade", "tactic", { suit: "♠" })],
  tempMagic: 2,
});
const extractTarget = unit("extract-target", "ally", { gender: "male", hp: 20 });
state = { battle: { allies: [extractActor, extractTarget], enemies: [], animQueue: [], defeatedEnemyIds: [] }, log: [] };
let extractDraw = 0, extractFx = 0;
window.CharacterSkinFX = { extractEssence(_state, actor, target, amount) {
  if (actor === extractActor && target === extractTarget && amount === 2) extractFx += 1;
} };
BattleCardSpecials({ draw(actor, count) { if (actor === extractActor) extractDraw += count; } }, {
  holdVisual() {}, pushFloat() {}, visualOf() { return {}; },
}).extractEssence(state, extractActor, extractTarget);
assert(extractTarget.hp === 18 && extractDraw === 2 && extractActor.tempMagic === 6,
  "Extract Essence must add 50% of base magic per visible heart without multiplying existing temporary magic");
assert(extractActor.extractMagicAttack && extractFx === 1,
  "Extract Essence must keep physical-card conversion and dispatch its equipped-skin effect");
for (const hearts of [0, 1, 3]) {
  const baseMagic = 5, initialTempMagic = 3;
  const actor = unit(`extract-${hearts}`, "ally", {
    ref: "besta_doll",
    stats: { attack: 3, magic: baseMagic, bloodlust: 1, drawPerTurn: 2 },
    hand: [
      ...Array.from({ length: hearts }, (_, i) => card(`Visible Heart ${i}`, "tactic", { suit: "♥" })),
      card("Pending Heart", "tactic", { suit: "♥", _pendingDraw: true }),
      card("Visible Spade", "tactic", { suit: "♠" }),
    ],
    tempMagic: initialTempMagic,
  });
  const target = unit(`extract-target-${hearts}`, "ally", { gender: "male", hp: 20 });
  const extractState = { battle: { allies: [actor, target], enemies: [], animQueue: [], defeatedEnemyIds: [] }, log: [] };
  let drawn = 0;
  BattleCardSpecials({ draw(unitActor, count) { if (unitActor === actor) drawn += count; } }, {
    holdVisual() {}, pushFloat() {}, visualOf() { return {}; },
  }).extractEssence(extractState, actor, target);
  assert(actor.tempMagic === initialTempMagic + baseMagic * .5 * hearts,
    `Extract Essence ${hearts}-heart case must add half base magic per visible heart`);
  assert(actor.stats.magic + actor.tempMagic === baseMagic + initialTempMagic + baseMagic * .5 * hearts,
    `Extract Essence ${hearts}-heart case must produce the exact effective magic`);
  assert(target.hp === 20 - hearts && drawn === hearts,
    `Extract Essence ${hearts}-heart case must keep HP loss and draw equal to visible hearts`);
  assert(actor.extractMagicAttack,
    `Extract Essence ${hearts}-heart case must enable physical-card magic conversion`);
}
const idolFx = [];
window.NonokaIdolSkinFX = {
  newMoon: (_state, actor, suit) => idolFx.push(["moon", actor.uid, suit]),
  mimic: (_state, actor, target) => idolFx.push(["mimic", actor.uid, target.uid]),
  kiss: (_state, actor, target) => idolFx.push(["kiss", actor.uid, target.uid]),
};
moon.newMoonActive = true; moon.newMoonSuits = [];
state = { battle: { allies: [moon, moonTarget], enemies: [], animQueue: [], mimicLinks: [] } };
NonokaLokiSkills.afterCardPlayed(state, moon, moonTarget, card("Heart Stage", "tactic", { suit: "♥" }), { draw() {} });
assert(idolFx.some(event => event.join("|") === `moon|${moon.uid}|♥`), "New Moon must dispatch the equipped-skin suit effect");
NonokaLokiSkills.handleSpecialCard(state, moon, moonTarget, { mimicVoice: true }, {});
assert(idolFx.some(event => event.join("|") === `mimic|${moon.uid}|${moonTarget.uid}`), "Mimic Voice must dispatch the target silhouette effect");
moon.usedIdolKiss = false; moon.hand = [card("Heart Cost", "tactic", { suit: "♥" })];
NonokaLokiSkills.handleSpecialCard(state, moon, moonTarget, { idolKiss: true, _costCard: moon.hand[0] }, {
  statOf: () => 2, pushFloat() {}, damage() {}, draw() {},
});
assert(idolFx.some(event => event.join("|") === `kiss|${moon.uid}|${moonTarget.uid}`), "Idol Kiss must dispatch the heart-and-star effect");

const moonCards = ["A", "B", "C"].map(name => card(name));
moon.hand = moonCards.slice();
state = { battle: { allies: [moon, moonTarget], enemies: [], animQueue: [], mimicLinks: [], newMoonShare: { unitUid: moon.uid, count: 2, indexes: [] } } };
assert(NonokaLokiSkills.toggleNewMoonCard(state, 0), "New Moon should select the first chosen card");
assert(!NonokaLokiSkills.resolveNewMoonShare(state, moonTarget.uid), "New Moon must reject an incomplete selection");
assert(NonokaLokiSkills.toggleNewMoonCard(state, 2), "New Moon should select a non-leading card");
assert(NonokaLokiSkills.resolveNewMoonShare(state, moonTarget.uid), "New Moon should resolve after selecting exactly X cards");
assert(moon.hand.length === 1 && moon.hand[0] === moonCards[1], "New Moon must remove only selected cards");
assert(moonTarget.hand[0] === moonCards[0] && moonTarget.hand[1] === moonCards[2], "New Moon must preserve selected card order");

const moonDrawn = unit("moon-drawn", "ally", { ref: "nonoka", newMoonActive: true, newMoonSuits: ["♥", "♠"] });
const moonDrawTarget = unit("moon-draw-target", "ally");
state = { battle: { allies: [moonDrawn, moonDrawTarget], enemies: [], animQueue: [], mimicLinks: [] } };
assert(NonokaLokiSkills.endTurn(state, moonDrawn, {
  draw(actor, count) {
    for (let i = 0; i < count; i += 1) actor.hand.push(card(`Pending ${i}`, "tactic", { _pendingDraw: true }));
  },
}) === false, "New Moon should wait for sharing after its end-turn draw");
assert(state.battle.newMoonShare?.count === 2, "New Moon must include cards pending their draw animation in the share count");

const aileng = unit("aileng", "ally", { ref: "aileng", intent: 0, intentMaxBonus: 3 });
aileng.hand = [card("Bet A"), card("Bet B")];
state = { battle: { allies: [aileng], enemies: [], selectedBagIndexes: [] } };
const discarded = [];
assert(GuestCharacterSkills.handleSpecialCard(state, aileng, aileng, { ailengBet: true, _bagIndexes: [0, 1] }, {
  draw() {}, intentMax: actor => actor.stats.bloodlust + actor.intentMaxBonus,
}, { putMany: (_state, _actor, cards) => discarded.push(...cards) }), "Calculation Bet should resolve");
assert(aileng.intent === 5 && discarded.length === 2, "Calculation Bet must reset to the current boosted intent maximum");

const drillCard = card("Returned Slash", "slash");
const drillActor = unit("drill", "ally", { ref: "aileng", hand: [drillCard] });
const drillTarget = unit("drill-target", "ally");
state = { battle: { allies: [drillActor, drillTarget], enemies: [], animQueue: [], locked: true, ailengDrillPicker: { actorUid: drillActor.uid, card: drillCard } } };
assert(GuestCharacterSkills.resolveBattleDrill(state, drillTarget.uid), "Battle Drill should resolve");
assert(!drillActor.hand.includes(drillCard) && drillTarget.hand.filter(item => item === drillCard).length === 1, "Battle Drill must move a returned original card without duplication");

const ace = unit("ace", "ally", { ref: "ace" });
const attacker = unit("attacker", "enemy");
let draws = 0;
state = { battle: { turn: 7, allies: [ace], enemies: [attacker], animQueue: [] } };
const incoming = card("Virtual Slash", "slash", { virtual: true });
ElranaAceNanaliSkills.beforeKillTargeted(state, attacker, ace, incoming, { draw: () => { draws += 1; } });
ElranaAceNanaliSkills.beforeKillTargeted(state, attacker, ace, incoming, { draw: () => { draws += 1; } });
state.battle.turn = 8;
ElranaAceNanaliSkills.beforeKillTargeted(state, attacker, ace, incoming, { draw: () => { draws += 1; } });
assert(draws === 2, "Urgent Escape must trigger once per global turn and work again next turn");

const beast = unit("beast", "enemy", { ai: "demon_beast_unit" });
const triggerSlash = card("Full Slash", "slash", { suit: "♠", sweep: true });
OrcDungeonSkills.beforeIntentCost({ battle: {} }, beast, triggerSlash);
assert(!OrcDungeonSkills.noIntentCost(beast, triggerSlash), "The slash that triggers Quick Reload must still cost intent");
const laterSlash = card("Later Slash", "slash", { suit: "♠" });
OrcDungeonSkills.beforeIntentCost({ battle: {} }, beast, laterSlash);
assert(OrcDungeonSkills.noIntentCost(beast, laterSlash), "Later same-suit slashes must be free after Quick Reload");
BattleCardCleanup.clearPlayFlags(triggerSlash);
assert(!triggerSlash.beastReloadTrigger && !CardUtils.copyPlayable({ ...triggerSlash, beastReloadTrigger: true }).beastReloadTrigger, "Quick Reload runtime flags must not leak into reusable cards");
const suppressionTarget = unit("suppression-target", "ally");
const virtualSuppression = card("Virtual Suppression", "slash", { virtual: true });
OrcDungeonSkills.prepareSlash({ battle: {} }, beast, suppressionTarget, virtualSuppression);
assert(virtualSuppression.sweep && virtualSuppression.name === "机枪扫杀", "Fire Suppression must convert virtual single Slashes");
const convertedSuppression = card("Converted Suppression", "slash", { convertedFrom: "闪" });
OrcDungeonSkills.prepareSlash({ battle: {} }, beast, suppressionTarget, convertedSuppression);
assert(convertedSuppression.sweep && convertedSuppression.name === "机枪扫杀", "Fire Suppression must convert converted single Slashes");
const cerberus = unit("cerberus", "enemy", { ai: "demon_mecha_cerberus" });
const virtualTriple = card("Virtual Triple", "slash", { virtual: true });
OrcDungeonSkills.prepareSlash({ battle: {} }, cerberus, suppressionTarget, virtualTriple);
assert(!virtualTriple.gatlingRepeats, "Three-Headed Assault must reject virtual Slashes");
const convertedTriple = card("Converted Triple", "slash", { convertedFrom: "闪" });
OrcDungeonSkills.prepareSlash({ battle: {} }, cerberus, suppressionTarget, convertedTriple);
assert(convertedTriple.gatlingRepeats === 3, "Three-Headed Assault must accept converted entity-source Slashes");

const radarTarget = unit("radar-target", "ally", { lockSuit: "♦" });
const radarCard = card("Multi Slash", "slash", { suit: "♦", gatlingRepeats: 2 });
state = createState();
const radarLogStart = (state.log || []).length;
assert(EnemySkills.modifyDamage(state, radarTarget, 3, radarCard) === 6, "Radar must double the first hit");
assert(EnemySkills.modifyDamage(state, radarTarget, 3, radarCard) === 6, "Radar must double every repeated hit");
assert((state.log || []).slice(radarLogStart).filter(line => line.includes("锁定标记触发")).length === 1, "Radar should log once per card");
const radarRoot = card("Sweep Root", "slash", { suit: "♦" });
const radarCloneLogStart = (state.log || []).length;
assert(EnemySkills.modifyDamage(state, radarTarget, 2, { ...radarRoot, _entitySourceCard: radarRoot }) === 4, "Radar must double a cloned sweep hit");
assert(EnemySkills.modifyDamage(state, radarTarget, 2, { ...radarRoot, _entitySourceCard: radarRoot }) === 4, "Radar must double every cloned sweep hit");
assert((state.log || []).slice(radarCloneLogStart).filter(line => line.includes("锁定标记触发")).length === 1, "Radar should log once across cloned hits from the same card");

require("./skill-audit-combat-tests")({ assert, card, unit, incoming });
require("./skill-audit-soul-scythe-tests")({ assert, card, unit });
require("./skill-audit-presentation-tests")({ assert, card, unit });
require("./skill-audit-active-boundary-tests")({ assert, card, unit });

console.log("Full character and enemy skill audit regression tests passed");
