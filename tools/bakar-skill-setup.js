const fs = require("fs");
const vm = require("vm");

global.window = global;

function load(file) {
  vm.runInThisContext(fs.readFileSync(file, "utf8"), { filename: file });
}
load("./src/original/game-random.js");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

window.BattleLog = { add(state, text) { (state.log ||= []).push(text); } };
window.BattleLines = { skill(state, unit, name) { (state.lines ||= []).push(`${unit.name}:${name}`); } };
window.BattleSystem = {
  draw(unit, count) {
    const cards = Array.from({ length: count }, (_, index) => ({
      name: `天赋摸牌${index}`, type: "tactic", suit: "♠",
    }));
    unit.hand.push(...cards);
    return cards;
  },
};
window.BattleCards = {
  putMany(battle, unit, cards, pile) { (unit[pile] ||= []).push(...cards); },
};

[
  "src/original/economy-config.js",
  "src/original/data-cards.js",
  "src/original/card-utils.js",
  "src/original/data-future-orc-enemies.js",
  "src/original/data-bakar-enemy.js",
  "src/original/data-future-enemies.js",
  "src/original/data-future-relics.js",
  "src/original/data-relics.js",
  "src/original/relics.js",
  "src/original/battle-draw-feedback.js",
  "src/original/battle-card-playability.js",
  "src/original/battle-combat-targeting.js",
  "src/original/bakar-relic-skills.js",
  "src/original/bakar-core-skills.js",
  "src/original/bakar-fire-skills.js",
  "src/original/bakar-skills.js",
].forEach(load);

const boss = window.GameDataFutureEnemies.orc_dungeon.find(enemy => enemy.id === "demon_king_bakaar");
assert(boss && boss.type === "boss" && boss.gender === "male", "Bakaar must be a male boss");
assert(boss.bloodlust === 2 && boss.handLimit === 4, "Bakaar hand and intent limits mismatch");
assert(boss.drawPerTurn === 2 && boss.initialDraw === 2, "Bakaar draw bonuses must be +2/+2");
assert(boss.skills.every(skill => !skill.text.includes("AI")), "AI logic must not appear in Bakaar skill descriptions");
assert(boss.evaluation.includes("其他角色使用实体【魔王军入侵】") && boss.evaluation.includes("自己使用的入侵不会被回收"), "Bakaar positioning must exclude his own invasion from capture");
assert(boss.skills.find(skill => skill.name === "魔王军统领")?.text.includes("其他角色使用实体【魔王军入侵】"), "Commander wording must exclude Bakaar himself");
const talentText = boss.skills.find(skill => skill.name === "天赋异能")?.text || "";
assert(talentText.includes("发动技能") && !talentText.includes("饰品"), "Talent wording must exclude relic use");

const fireKill = window.GameDataCards.cardCodex.find(card => card.name === "火杀");
assert(fireKill?.price === 600 && fireKill.fire && fireKill.burnCard, "Fire Kill data mismatch");
assert(fireKill.text.includes("“燃烧”属性持续至战斗结束"), "Fire Kill must state battle-long burning duration");

const armyOrder = window.RelicSystem.data("军令状");
assert(armyOrder.effect === "出牌阶段，你可以将2张花色完全相同的牌当【魔王军入侵】使用。", "Army Order wording mismatch");
assert(!armyOrder.effect.includes("无限次数"), "Army Order must not say unlimited uses");

module.exports = { assert };
