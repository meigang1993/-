const assert = require("assert");
const fs = require("fs");

global.window = global;
window.CardUtils = {
  isKillCard: card => card?.type === "slash" || /杀(?:（[^）]*）)?$/.test(card?.name || ""),
};
const battleLogs = [];
window.BattleLog = { add: (_state, message) => battleLogs.push(message) };
require("../src/original/data-skins.js");
require("../src/original/skins.js");
require("../src/original/skin-fx-runtime.js");
require("../src/original/angelica-berserker-skin-fx.js");
require("../src/original/angelica-luka-skills.js");

window.BattleLines = { skill() {} };
const turnState = { battle: { turn: 1 } };

// 力量爆发（重做后）：本回合每张实体【杀】倍率递增，首张 ×2。
const mightActor = { ref: "angelica", name: "安洁莉卡" };
const mightRows = [1, 2, 3].map(() => {
  const card = { name: "杀（普攻）", type: "slash", power: 0 };
  AngelicaLukaSkills.beforeCardPlayed(turnState, mightActor, card);
  return {
    count: mightActor.angelicaSlashCount,
    might: card.angelicaMight,
    damage: AngelicaLukaSkills.modifyDamage(turnState, mightActor, 10, card),
  };
});
assert.deepStrictEqual(mightRows, [
  { count: 1, might: 2, damage: 20 },
  { count: 2, might: 3, damage: 30 },
  { count: 3, might: 4, damage: 40 },
], "力量爆发 must scale damage by the number of entity slashes used this turn");

// 非实体杀（锦囊 / 虚拟杀 / 转换杀）既不触发倍率，也不计入本回合计数。
const tacticCard = { type: "tactic", drawCards: 2 };
const virtualCard = { name: "杀（普攻）", type: "slash", virtual: true };
const convertedCard = {
  name: "杀（普攻）", type: "slash", convertedFrom: "火杀", withererBerserkKill: true,
};
[tacticCard, virtualCard, convertedCard].forEach(card =>
  AngelicaLukaSkills.beforeCardPlayed(turnState, mightActor, card));
assert(mightActor.angelicaSlashCount === 3 && !tacticCard.angelicaMight
  && !virtualCard.angelicaMight && !convertedCard.angelicaMight,
  "non-entity slashes must neither trigger nor count toward 力量爆发");

// 新回合重置，倍率回到 ×2。
AngelicaLukaSkills.beginTurn(turnState, mightActor);
const nextTurnCard = { name: "杀（普攻）", type: "slash" };
AngelicaLukaSkills.beforeCardPlayed(turnState, mightActor, nextTurnCard);
assert(nextTurnCard.angelicaMight === 2 && mightActor.angelicaSlashCount === 1,
  "力量爆发 must restart at x2 on a new turn");

// 狂战意志（重做后）：每次伤害事件独立结算，各获得 1 枚标记。
const rageState = { battle: { turn: 1 } };
const rageActor = { ref: "angelica", name: "安洁莉卡", hp: 40, maxHp: 40, rageMarks: 0 };
const rageTarget = { ref: "guard", name: "目标", hp: 30, maxHp: 30 };
const noopDeps = { draw: () => [], pushFloat: () => {} };
const multiHitCard = { name: "双重打杀", type: "slash" };
AngelicaLukaSkills.afterDamage(rageState, rageActor, rageTarget, multiHitCard, 4, noopDeps);
const afterFirstHit = rageActor.rageMarks;
AngelicaLukaSkills.afterDamage(rageState, rageActor, rageTarget, multiHitCard, 4, noopDeps);
AngelicaLukaSkills.afterDamage(rageState, rageActor, rageTarget, multiHitCard, 4, noopDeps);
assert(afterFirstHit === 1 && rageActor.rageMarks === 3,
  "each damage event must grant its own rage mark instead of only the first");

// 受到伤害同样获得标记，且上限为 99。
AngelicaLukaSkills.afterDamage(rageState, rageTarget, rageActor,
  { name: "杀（普攻）", type: "slash" }, 3, noopDeps);
assert(rageActor.rageMarks === 4, "taking damage must also grant a rage mark");
rageActor.rageMarks = 10;
AngelicaLukaSkills.afterDamage(rageState, rageTarget, rageActor,
  { name: "杀（普攻）", type: "slash" }, 3, noopDeps);
assert(rageActor.rageMarks === 10, "rage marks must cap at 10");

// 伤害后阶段：标记不在伤害过程中发放，而是在伤害实例结算完成后统一发放。
const phaseState = { battle: { turn: 1 } };
const phaseActor = { ref: "angelica", name: "安洁莉卡", hp: 40, maxHp: 40, rageMarks: 0 };
const phaseTarget = { ref: "guard", name: "目标", hp: 30, maxHp: 30 };
const pendingHooks = [];
const phaseDeps = {
  draw: () => [],
  pushFloat: () => {},
  damage: { scheduleAfterDamage: fn => pendingHooks.push(fn) },
};
AngelicaLukaSkills.afterDamage(phaseState, phaseActor, phaseTarget,
  { name: "杀（普攻）", type: "slash" }, 4, phaseDeps);
assert(phaseActor.rageMarks === 0 && pendingHooks.length === 1,
  "rage marks must wait for the post-damage phase instead of landing mid-damage");
pendingHooks.splice(0).forEach(hook => hook());
assert(phaseActor.rageMarks === 1,
  "rage marks must be granted once the post-damage phase flushes");

// 猩红暴走：出牌阶段限一次，弃全部标记并摸等量牌，再回复 标记数×生命上限10%。
const rampageState = { battle: { turn: 1, locked: false, animQueue: [] } };
const rampageActor = {
  ref: "angelica", name: "安洁莉卡", uid: "a0", hp: 20, maxHp: 40, rageMarks: 4,
};
const rampageDraws = [];
const rampageDeps = {
  draw: (unit_, count) => { rampageDraws.push(count); return count; },
  pushFloat: () => {},
};
assert(AngelicaLukaSkills.canUseCrimsonRampage(rampageActor) === true,
  "Crimson Rampage must be available while rage marks remain");
AngelicaLukaSkills.handleSpecialCard(rampageState, rampageActor, rampageActor,
  { crimsonRampage: true }, rampageDeps, {});
assert(rampageActor.rageMarks === 0
  && rampageDraws.length === 1 && rampageDraws[0] === 4,
  "Crimson Rampage must spend every mark and draw that many cards");
assert(rampageActor.hp === 20 + Math.round(4 * 40 * 0.1),
  "Crimson Rampage must heal marks x 10% of maxHp");
assert(AngelicaLukaSkills.canUseCrimsonRampage(rampageActor) === false,
  "Crimson Rampage must be limited to once per turn");
rampageActor.usedCrimsonRampage = false;
rampageActor.rageMarks = 0;
assert(AngelicaLukaSkills.canUseCrimsonRampage(rampageActor) === false,
  "Crimson Rampage must be unusable without rage marks");

// 实体【杀】可用 1 枚标记代替 1 点杀意；无标记或虚拟杀不适用。
const intentCard = { name: "杀（普攻）", type: "slash" };
rageActor.rageMarks = 3;
assert(AngelicaLukaSkills.canPayIntentWithRage(rageActor, intentCard) === true
  && AngelicaLukaSkills.beforeIntentCost(rageState, rageActor, intentCard) === true
  && rageActor.rageMarks === 2,
  "one rage mark must pay one intent cost for an entity slash");
rageActor.rageMarks = 0;
assert(!AngelicaLukaSkills.canPayIntentWithRage(rageActor, intentCard)
  && AngelicaLukaSkills.beforeIntentCost(rageState, rageActor, intentCard) === false,
  "without rage marks the intent cost must be paid normally");
rageActor.rageMarks = 1;
assert(!AngelicaLukaSkills.canPayIntentWithRage(rageActor,
  { name: "杀（普攻）", type: "slash", virtual: true }),
  "virtual slashes must not be payable with rage marks");

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
assert(berserker.art === "./assets/generated/angelica-berserker.371936f3.webp"
  && fs.existsSync(`./publish/${berserker.art.slice(2)}`),
  "Berserker must reference its generated portrait");
const roles = fs.readFileSync("./src/original/data-combat-roles.js", "utf8");
assert(roles.includes('angelica: ["输出"]'),
  "Angelica's combat role must be output");

const applied = SkinSystem.applyToChar({
  chars: [{ id: "angelica", locked: false, level: 10 }],
  equippedSkins: { angelica: "angelica_berserker" },
  ownedSkins: { angelica_berserker: true },
}, { id: "angelica" });
assert(applied.art === berserker.art
  && applied.skinDynamicEffect === "angelica-berserker"
  && applied.skinName === "帝血弑天",
  "equipping Imperial Blood Slaying must resolve through SkinSystem");

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
  ["angelica-luka-skills.js", "AngelicaBerserkerSkinFX?.queueEntry"],
  ["angelica-luka-skills.js", "AngelicaBerserkerSkinFX?.rageSpend"],
  ["angelica-luka-skills.js", "AngelicaBerserkerSkinFX?.rageGain"],
  ["angelica-luka-skills.js", "crimsonRampage"],
  ["angelica-luka-skills.js", "AngelicaBerserkerSkinFX?.crimsonRampage"],
  ["angelica-luka-skills.js", "scheduleAfterDamage"],
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
  "angelica-berserker-entry", "angelica-berserker-entering",
  "angelica-berserker-might",
  "angelica-berserker-rage-gain", "angelica-berserker-rage-slam",
  "angelica-berserker-rage-trail",
  "angelica-berserker-victory-show",
  "angelica-berserker-rampage-armor", "angelica-berserker-rampage-burst",
  "angelica-berserker-rampage-shock", "angelica-berserker-rampage-giant",
  "angelica-berserker-rampage-heal", "angelica-berserker-rampage-pulse",
  "angelica-berserker-rampage-rain", "angelica-berserker-rampage-core",
].forEach(token => assert(css.includes(token), `Berserker CSS is missing ${token}`));
assert(css.includes("imperialSwordSummon") && css.includes("imperialMarkShatter")
  && css.includes("imperialBloodRing") && css.includes("imperialTrail"),
  "Imperial Blood Slaying must retain greatsword, rage marks, blood ring and rage trail identities");
assert(css.includes("imperialGiantRise") && css.includes("imperialPulseRing")
  && css.includes("imperialCoreSink") && css.includes("imperialBloodRain"),
  "Crimson Rampage must keep giant phantom, pulse rings, chest core and blood rain");
const victorySource = fs.readFileSync("./src/original/battle-victory.js", "utf8");
assert(victorySource.includes("帝血未冷，下一场继续。"),
  "Imperial Blood Slaying must use its dedicated victory line");
window.UICommon = { artBox: () => "<span>ART</span>" };
window.BattleStats = {
  ranking: battle => battle.allies.map((unit, index) => ({
    unit, stats: { damage: 1, healing: 0, kills: 0, cards: 1, responses: 0 },
    score: 1, rank: index + 1, title: "test", isMvp: index === 0,
  })),
};
["MannyGun", "NonokaIdol", "BertisQueen", "FloraSonic",
  "WendyTeacher", "ElranaFallenPhysician"].forEach(name => {
  window[`${name}SkinFX`] = { active: () => false };
});
require("../src/original/battle-victory.js");
window.state = {
  view: "battle",
  chars: [{ id: "angelica", locked: false, level: 10 }],
  equippedSkins: { angelica: "angelica_berserker" },
  ownedSkins: { angelica_berserker: true },
  battle: {
    test: true, turn: 1, enemyCount: 1, enemies: [{}],
    allies: [{ ref: "angelica", name: "安洁莉卡", art: berserker.art }],
  },
};
const victoryHtml = BattleVictory.render(window.state);
assert(victoryHtml.includes("angelica-berserker-victory")
  && victoryHtml.includes("angelica-berserker-victory-show")
  && victoryHtml.includes("帝血未冷，下一场继续。"),
  "Imperial Blood Slaying victory markup must be inserted into the rendered screen");
delete window.state;

const skinActionSource = fs.readFileSync("./src/original/app-battle-skin-actions.js", "utf8");
assert(skinActionSource.includes("if (isCurrent()) {\n      actionState.appearanceSaving = false;"),
  "Stale battle skin requests must not rerender or clear the current appearance save state");
assert(skinActionSource.includes("previous[index]?.image?.cloneNode?.(true)"),
  "Skin transitions must clone old portraits before mounting the transition layer");
assert(skinActionSource.includes('skin.dynamicEffect === "angelica-berserker"')
  && skinActionSource.includes("AngelicaBerserkerSkinFX?.queueEntry"),
  "Switching to Imperial Blood Slaying in battle must explicitly queue its entry effect");

console.log("test-angelica-berserker-skin: all assertions passed");
