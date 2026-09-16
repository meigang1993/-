/* 温蒂「解答迷惑」可选战术牌池检查：新战术牌是否可选 */
const fs = require("fs"), vm = require("vm");
const { installGlobals, loadRuntime } = require("./skill-coverage-fixtures");
installGlobals(); loadRuntime();
["data-ruins-content.js","wendy-skills.js","card-utils.js","battle-line-data.js"]
  .forEach(f => vm.runInThisContext(fs.readFileSync(`./src/original/${f}`,"utf8"), {filename:f}));

const fakeState = { deck: [], explore: { earned: { cards: [] } }, battle: { allies: [], enemies: [] } };
let pool = [];
try { pool = window.WendySkills.tutorPool(fakeState); } catch(e){ console.log("ERR", e.message); }
console.log("=== 解答迷惑 可选战术牌池 ===");
console.log("数量:", pool.length);
console.log(pool.map(c=>c.name).join(" / "));
console.log("\n=== cardCodex 规模 ===");
console.log("GameData.cardCodex:", (window.GameData?.cardCodex||[]).length,
            "| GameDataCards.cardCodex:", (window.GameDataCards?.cardCodex||[]).length,
            "| 同一数组?", window.GameData?.cardCodex === window.GameDataCards?.cardCodex);
console.log("\n=== codex 中全部 tactic 牌 ===");
const all = (window.GameData?.cardCodex || window.GameDataCards?.cardCodex || []);
const tactics = all.filter(c=>c.type==="tactic" && !c._skill && !c.virtual && !c.temporary);
console.log(tactics.map(c=>c.name).join(" / "));
console.log("\n=== 废墟沙城新卡里属于 tactic 的 ===");
const ruins = (window.GameDataRuinsContent?.cards||[]).filter(c=>c.type==="tactic").map(c=>c.name);
console.log(ruins.join(" / ") || "（无）");
ruins.forEach(n => console.log(`  ${n}: 在池中=${pool.some(c=>c.name===n) ? "✅是" : "❌否"}`));
console.log("\n=== 检查被剔除的牌（如有）===");
const inCodex = new Set(tactics.map(c=>c.name));
const inPool = new Set(pool.map(c=>c.name));
[...inCodex].filter(n=>!inPool.has(n)).forEach(n=>console.log("  被排除:", n));
