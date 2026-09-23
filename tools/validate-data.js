const fs = require("fs");
const path = require("path");
const vm = require("vm");
const Ajv = require("ajv");
const createDataValidators = require("./validate-data-schemas");

const root = path.resolve(__dirname, "..");
const sourceDir = path.join(root, "src", "original");

function loadScript(file, context) {
  const code = fs.readFileSync(path.join(sourceDir, file), "utf8");
  vm.runInNewContext(code, context, { filename: file });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const {
  validateCharacterSchema, validateEnemySchema, validateRuntimeCardSchema,
} = createDataValidators(Ajv);
assert(!validateRuntimeCardSchema({
  name: "invalid attack type",
  type: "slash",
  text: "schema regression fixture",
  suit: "test",
  attackType: "magci",
}), "runtime card schema must reject unknown attack types");

function errorsFor(validate, label) {
  return (validate.errors || []).map(err => `${label}${err.instancePath} ${err.message}`).join("\n");
}

function validateWith(validate, value, label) {
  if (!validate(value)) throw new Error(errorsFor(validate, label));
}

function ensureUnique(list, key, label) {
  const seen = new Set();
  list.forEach(item => {
    assert(!seen.has(item[key]), `Duplicate ${label}: ${item[key]}`);
    seen.add(item[key]);
  });
}

function validateCharacterSkills(character) {
  character.skills.forEach((skill, index) => {
    if (skill.type === "active") {
      assert(skill.card, `${character.id}.skills[${index}] active skill must define a virtual card`);
    }
    (skill.derivedSkills || []).forEach((derived, derivedIndex) => {
      assert(derived.name && derived.text, `${character.id}.skills[${index}].derivedSkills[${derivedIndex}] must define public wording`);
    });
  });
}

const hiddenLogicPattern = /(AI|会优先|优先使用|优先发动|应优先|建议|尽快|避免|出牌策略)/;
function validatePublicWording(owner, evaluation, skills = []) {
  assert(!hiddenLogicPattern.test(evaluation), `${owner}.evaluation exposes hidden strategy or AI logic`);
  skills.forEach(skill => {
    assert(!hiddenLogicPattern.test(skill.text), `${owner}.${skill.name} exposes hidden strategy or AI logic`);
    if (skill.card?.text) assert(!hiddenLogicPattern.test(skill.card.text), `${owner}.${skill.name}.card exposes hidden strategy or AI logic`);
    (skill.derivedSkills || []).forEach(derived => {
      assert(!hiddenLogicPattern.test(derived.text), `${owner}.${skill.name}.${derived.name} exposes hidden strategy or AI logic`);
    });
  });
}

const context = { window: {} };
context.window = context;
[
  "economy-config.js",
  "data-cards.js",
  "data-characters-core.js",
  "data-characters-extra.js",
  "data-future-characters.js",
  "data-new-characters.js",
  "data-characters.js",
  "data-future-orc-enemies.js",
  "data-bakar-enemy.js",
  "data-future-enemies.js",
  "data-orc-bondi.js",
  "data-guard-kelly.js",
  "data-sakura-risa.js",
  "data-machine-factory-enemies.js",
  "data-underwater-train-enemies.js",
  "data-combat-roles.js",
].forEach(file => loadScript(file, context));

const enemyGroups = context.GameDataFutureEnemies || {};
const machineFactoryEnemies = context.GameDataMachineFactoryEnemies || [];
const underwaterTrainEnemies = context.GameDataUnderwaterTrainEnemies || [];
assert(machineFactoryEnemies.length > 0, "GameDataMachineFactoryEnemies did not load");
assert(underwaterTrainEnemies.length > 0, "GameDataUnderwaterTrainEnemies did not load");
const enemies = [...Object.values(enemyGroups).flat(), ...machineFactoryEnemies, ...underwaterTrainEnemies];
assert(enemies.length > 0, "Enemy data did not load");
ensureUnique(enemies, "id", "enemy id");
enemies.forEach(enemy => {
  validateWith(validateEnemySchema, enemy, `enemy:${enemy.id}`);
  validatePublicWording(`enemy:${enemy.id}`, enemy.evaluation);
});

const characters = context.GameDataCharacters || [];
assert(characters.length > 0, "GameDataCharacters did not load");
ensureUnique(characters, "id", "character id");
characters.forEach(character => {
  validateWith(validateCharacterSchema, character, `character:${character.id}`);
  validateCharacterSkills(character);
  validatePublicWording(`character:${character.id}`, character.evaluation, character.skills);
});

const cards = [
  ...(context.GameDataCards?.baseDeck || []),
  ...(context.GameDataCards?.marketCards || []),
  ...(context.GameDataCards?.eliteCards || []),
];
assert(cards.length > 0, "GameDataCards did not load cards");
cards.forEach((card, index) => validateWith(validateRuntimeCardSchema, card, `card:${index}:${card.name || "unknown"}`));

const cerberus = enemyGroups.orc_dungeon?.find(enemy => enemy.id === "demon_mecha_cerberus");
assert(cerberus, "demon_mecha_cerberus not found");
assert(cerberus.bloodlust === 1, "demon_mecha_cerberus.bloodlust should be 1");
const cerberusTriple = cerberus.skills?.find(skill => skill.name === "三头齐攻");
assert(cerberus.evaluation.includes("额外结算2次")
  && cerberusTriple?.text.includes("额外结算2次"),
  "demon_mecha_cerberus must describe same-card repeats as extra settlements");

console.log(`Ajv data validation passed: ${characters.length} characters, ${enemies.length} enemies, ${cards.length} runtime cards`);
