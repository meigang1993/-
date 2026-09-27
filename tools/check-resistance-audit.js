/* 检查所有副本的 elite / boss 是否获得【霸王色抗性】。
 * 逐个 enemy 调用 create()：若整批传入，create() 会抽样，只验证被抽中的部分。 */
const fs=require("fs"),vm=require("vm");
const {installGlobals,loadRuntime}=require("./skill-coverage-fixtures");
installGlobals(); loadRuntime();
["battle-setup.js","data-machine-factory-enemies.js","data-underwater-train-enemies.js",
 "data-ruins-sand-city-enemies.js","data-future-dungeons.js","data-ruins-content.js",
 "data-ruins-sand-city.js","data-world.js"].forEach(f=>{
  try{vm.runInThisContext(fs.readFileSync(`./src/original/${f}`,"utf8"),{filename:f});}catch(e){console.log("LOAD_ERR",f,e.message);}
});
window.GameRandom=window.GameRandom||{};
window.GameRandom.shuffle=a=>a.slice();
window.GameRandom.sample=a=>a[0];
window.GameRandom.id=p=>`${p}-test`;
window.state={chars:[],deck:[],party:[]};
window.GameData.baseDeck=window.GameData.baseDeck||[];
const api=window.BattleSetup();
const T="霸王色抗性";
(async()=>{
  let total=0,fail=0;
  for(const [k,list] of Object.entries(window.GameData.enemies||{})){
    for(const e of (list||[])){
      if(!["elite","boss"].includes(e.type)) continue;
      total++;
      const res=await api.create(window.state,k,null,{test:true,allyIds:[],enemies:[e],deck:[]});
      const u=(res.enemies||[]).find(x=>x.id===e.id)||(res.enemies||[])[0];
      const has=(u&&(u.skills||[]).some(s=>s.name===T))||false;
      if(!has)fail++;
      console.log(`${has?"✅":"❌"} [${k}] ${e.type.padEnd(5)} ${e.name} 技能数=${u?(u.skills||[]).length:0} 含${T}=${has}`);
    }
  }
  console.log(`\n总计 ${total} 个 elite/boss，缺失 ${fail} 个`);
  process.exit(fail?1:0);
})();
