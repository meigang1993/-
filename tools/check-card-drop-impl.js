// 检查所有「首次击败怪物掉落」的卡牌是否定义齐全、效果是否有实现代码
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const read = f => fs.readFileSync(path.join(root, f), "utf8");
global.window = global; global.document = undefined;
// 载入数据模块
// 载入顺序：依赖先于数据
["src/original/economy-config.js","src/original/data-cards.js","src/original/data-ruins-content.js"].forEach(f=>{
  try { new Function("window","document",read(f))(global, undefined); }
  catch(e){ console.log("LOAD_FAIL",f,e.message); }
});
// 敌人表（用于把 id 翻成名字）
["src/original/data-enemies.js","src/original/data-dungeon-entries.js"].forEach(f=>{
  try { if(fs.existsSync(path.join(root,f))) new Function("window","document",read(f))(global,undefined); } catch(e){}
});
try{ ["src/original/data-ruins.js","src/original/data-ruins-enemies.js"].forEach(f=>{
  if(fs.existsSync(path.join(root,f))) new Function("window","document",read(f))(global,undefined); }); }catch(e){}
const GD = global.GameDataCards || global.GameData || {};
const codex = GD.cardCodex || [];
const elite = GD.eliteUnlocks || {};
// 按名字索引所有卡牌定义
const byName = new Map();
(GD.allCards||[]).concat(codex).forEach(c=>{ if(c&&c.name) byName.set(c.name,c); });
// 通用属性（由通用引擎处理，不需要专属实现）
const generic = new Set(["name","type","text","price","suits","suitsText","icon","scale",
  "attackType","targetless","allyTarget","source","enemy","codex","desc","count","rarity"]);
// 收集所有源文件文本（排除定义文件本身）
const srcFiles = fs.readdirSync(path.join(root,"src/original")).filter(f=>f.endsWith(".js"));
const srcText = srcFiles.filter(f=>!["data-cards.js","data-ruins-content.js","battle-line-data.js"].includes(f))
  .map(f=>read("src/original/"+f)).join("\n");
let missing=[], noEffect=[], ok=0;
const rows=[];
for (const [enemy, cards] of Object.entries(elite)) {
  for (const name of cards) {
    const def = byName.get(name);
    if (!def) { missing.push(`${enemy} → ${name}`); rows.push([enemy,name,"❌未定义","-"]); continue; }
    // 只看“真值”特效键（卡牌定义合并了全量默认值，false/0/"" 代表未启用）
    const keys = Object.keys(def).filter(k=>{
      if (generic.has(k)) return false;
      const v = def[k];
      return !(v===false || v===0 || v==="" || v===null || v===undefined);
    });
    const unimpl = keys.filter(k=>{
      // 关键字在源码中出现（作为属性访问 / 字符串）
      return !new RegExp(`[.\\["']${k.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}\\b`).test(srcText)
        && !srcText.includes(k);
    });
    if (keys.length===0) { rows.push([enemy,name,"⚠️无特效键","-"]); noEffect.push(`${enemy} → ${name}`); }
    else if (unimpl.length) { rows.push([enemy,name,"⚠️键未实现",unimpl.join(",")]); noEffect.push(`${enemy} → ${name} [${unimpl}]`); }
    else { ok++; rows.push([enemy,name,"✅",keys.join(",")]); }
  }
}
console.log("=== 掉落卡牌检查 ===");
console.log(`敌人条目 ${Object.keys(elite).length} | 卡牌总数 ${rows.length} | 正常 ${ok} | 未定义 ${missing.length} | 效果存疑 ${noEffect.length}\n`);
let last="";
rows.forEach(([e,n,s,k])=>{ if(e!==last){console.log(`\n【${e}】`); last=e;} console.log(`  ${n.padEnd(12)} ${s.padEnd(10)} ${k}`); });
if(missing.length){console.log("\n❌ 未定义:");missing.forEach(x=>console.log("   "+x));}
if(noEffect.length){console.log("\n⚠️ 需人工确认:");noEffect.forEach(x=>console.log("   "+x));}
console.log(`\n结果: ${missing.length===0&&noEffect.length===0 ? "ALL_OK" : "NEED_REVIEW"}`);
