const fs = require("fs");
const vm = require("vm");

global.window = global;
require("../src/original/game-random.js");
global.render = () => {};
window.RelicSystem = {
  isKnown: name => name === "测试饰品",
  isActive: () => false,
};

function load(file) {
  vm.runInThisContext(fs.readFileSync(file, "utf8"), { filename: file });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

load("./src/original/battle-line-data.js");
load("./src/original/battle-log.js");
load("./src/original/battle-line-intro.js");
load("./src/original/battle-speech-controller.js");
load("./src/original/battle-caption-controller.js");
load("./src/original/battle-lines.js");

const actor = {
  uid: "a1",
  ref: "actor",
  name: "记录角色",
  side: "ally",
  hp: 10,
  skills: [{ name: "测试技能" }],
  battleRelics: ["测试饰品"],
};
const target = { uid: "e1", name: "受击目标", side: "enemy", hp: 10, skills: [] };
const state = { battle: { allies: [actor], enemies: [target] }, battleLog: [], log: [] };

window.BattleLines.skill(state, actor, "测试技能", target);
assert(state.battleLog[0] === "记录角色发动技能【测试技能】，目标为受击目标。", "character skill action should enter the battle record");
window.BattleLog.add(state, "记录角色发动测试技能，获得2点护甲。");
assert(state.battleLog[0] === "记录角色发动测试技能，获得2点护甲。", "a detailed skill result should replace its generic action");
assert(state.battleLog.filter(text => text.includes("测试技能")).length === 1, "skill action should not be duplicated");
window.BattleLines.skill(state, actor, "测试技能", target);
assert(state.battleLog.filter(text => text.includes("测试技能")).length === 1, "the immediate caption duplicate should be suppressed");
window.BattleLines.skill(state, actor, "测试技能", target);
window.BattleLines.skill(state, actor, "测试技能", target);
assert(state.battleLog.filter(text => text.includes("测试技能")).length === 3, "two real consecutive skill actions should both be recorded");

window.BattleLog.add(state, "记录角色 的测试饰品触发，摸1张牌。");
assert(state.battleLog[0] === "记录角色 的测试饰品触发，摸1张牌。", "relic action should enter the battle record");
assert(state.battleLog.filter(text => text.includes("测试饰品")).length === 1, "relic action should not be duplicated");

window.BattleLines.cancel(state);
console.log("Battle record coverage tests passed");
