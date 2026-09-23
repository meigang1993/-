/* 校验每个掉落的敌人ID是否真实存在（不存在=卡牌永远解锁不了） */
const fs=require("fs"),vm=require("vm");
const { installGlobals, loadRuntime } = require("./skill-coverage-fixtures");
installGlobals(); loadRuntime();
vm.runInThisContext(fs.readFileSync("./src/original/data-ruins-content.js","utf8"),{filename:"ruins"});
const elite = window.GameDataCards.eliteUnlocks || {};
const all = [];
Object.values(window.GameData?.enemies || {}).forEach(g=>g.forEach(e=>e&&e.id&&all.push(e)));
Object.values(window.GameData?.dungeonEnemies || {}).forEach(g=>g.forEach(e=>e&&e.id&&all.push(e)));
Object.values(window.GameData?.dungeons || {}).forEach(d=>{
  (d.encounters||[]).forEach(enc=>{(enc.enemies||[]).forEach(e=>e&&e.id&&all.push(e));});
});
const ids = new Set(all.map(e=>e.id));
const names = new Map(all.map(e=>[e.id, e.name]));
console.log("敌人表规模:", ids.size);
let bad=0;
Object.entries(elite).forEach(([id,cards])=>{
  const ok = ids.has(id);
  if(!ok) bad++;
  console.log(`${ok?"✅":"❌"} ${id.padEnd(24)} ${(names.get(id)||"（未知）").padEnd(14)} ${cards.join("、")}`);
});
console.log(`\n结果: ${bad===0?"ALL_ENEMY_IDS_OK":bad+" 个ID不存在"}`);
