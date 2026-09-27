/* 检查所有副本的 elite / boss 是否获得【霸王色抗性】 */
const fs = require("fs");
const vm = require("vm");
const { installGlobals, loadRuntime } = require("./skill-coverage-fixtures");

installGlobals();
loadRuntime();

[
  "battle-setup.js",
  "data-machine-factory-enemies.js",
  "data-underwater-train-enemies.js",
  "data-ruins-sand-city-enemies.js",
  "data-future-dungeons.js",
  "data-ruins-content.js",
  "data-ruins-sand-city.js",
].forEach(f => vm.runInThisContext(
  fs.readFileSync(`./src/original/${f}`, "utf8"), { filename: f },
));

window.GameRandom = window.GameRandom || {};
window.GameRandom.shuffle = (arr) => arr.slice();
window.GameRandom.sample = (arr) => arr[0];
window.GameRandom.id = (p) => `${p}-test`;
window.state = window.state || {};
window.state.chars = [];
window.state.deck = [];
window.state.party = [];
window.GameData = window.GameData || {};
window.GameData.baseDeck = [];

const api = window.BattleSetup();
const TARGET = "霸王色抗性";

const groups = Object.entries(window.GameData.enemies || {});

let fail = 0;
console.log("=== 各副本 elite/boss 的【霸王色抗性】注入检查 ===\n");

async function checkGroup(name, list) {
  if (!Array.isArray(list)) return;
  const elites = list.filter(e => ["elite", "boss"].includes(e.type));
  if (!elites.length) {
    console.log(`[${name}] 无 elite/boss`);
    return;
  }
  const res = await api.create(window.state, name, null, {
    test: true, allyIds: [], enemies: elites, deck: [],
  });
  (res.enemies || []).forEach(u => {
    const has = (u.skills || []).some(s => s.name === TARGET);
    const tag = has ? "✅" : "❌";
    if (!has) fail += 1;
    console.log(`${tag} [${name}] ${u.name}(${u.type}) 技能数=${(u.skills || []).length} 含${TARGET}=${has}`);
  });
}

(async () => {
  for (const [name, list] of groups) await checkGroup(name, list);
  console.log(`\n合计缺失 ${fail} 个`);
  process.exit(fail ? 1 : 0);
})();
