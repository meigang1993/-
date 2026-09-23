// 验证废墟沙城 + 兽人地下城：固定规则不破坏 + 精英节点出现 + 精英怪覆盖
const fs = require("fs"), vm = require("vm");
const { installGlobals, loadRuntime } = require("./skill-coverage-fixtures");
installGlobals(); loadRuntime();
["dungeon-map.js","dungeon-enemies.js","data-future-enemies.js","data-future-dungeons.js",
 "data-ruins-sand-city-enemies.js","data-ruins-sand-city.js","data-ruins-content.js"]
 .forEach(f => vm.runInThisContext(fs.readFileSync(`./src/original/${f}`,"utf8"),{filename:f}));
const GameData = window.GameData;
if (!GameData.enemies.ruins_sand_city) GameData.enemies.ruins_sand_city = window.GameDataRuinsSandCity.enemies;
if (!GameData.enemies.orc_dungeon) GameData.enemies.orc_dungeon = window.GameDataFutureEnemies.orc_dungeon;
let pass=0, fail=0;
const ok=(n,c,e="")=>{c?(pass++,console.log(`✅ ${n}${e?"  "+e:""}`)):(fail++,console.log(`❌ ${n}${e?"  "+e:""}`))};
const keys=Object.keys(GameData.difficulties);
const dNormal=keys.find(k=>/normal/i.test(k))||keys[0];
const dHeroic=keys.find(k=>/hero|hell|hard/i.test(k))||keys[keys.length-1];
console.log("难度档位:",keys.join(","),"| 使用:",dNormal,dHeroic);
function check(name,mission,expLayers,restL,chestL,bossL,eliteIds,diffId){
  console.log(`\n===== ${name} / ${diffId} =====`);
  const diff=GameData.difficulties[diffId]; const N=200;
  let eliteTotal=0, layersOk=true, fixedOk=true; const layouts=new Set();
  for(let i=0;i<N;i++){
    const layers=window.DungeonMap.buildLayers(mission,diff,window.state);
    const nodes=layers.flat();
    if(layers.length!==expLayers) layersOk=false;
    const by={}; nodes.forEach(n=>{(by[n.layer]||=[]).push(n)});
    if(!(by[1]?.length===1&&by[1][0].type==="start")) fixedOk=false;
    if(!(by[bossL]?.length===1&&by[bossL][0].type==="boss")) fixedOk=false;
    restL.forEach(L=>{ if(!(by[L]?.length===1&&by[L][0].type==="rest")) fixedOk=false; });
    if(!(by[chestL]?.length===1&&by[chestL][0].type==="chest")) fixedOk=false;
    eliteTotal+=nodes.filter(n=>n.type==="elite").length;
    layouts.add(nodes.map(n=>n.type).join(""));
  }
  ok(`${expLayers}层`,layersOk);
  ok(`固定节点 start1/boss${bossL}/rest[${restL}]/chest${chestL}`,fixedOk);
  ok(`布局随机`,layouts.size>1,`${layouts.size}种/200局`);
  ok(`精英节点>0`,eliteTotal>0,`200局共${eliteTotal}个 (均${(eliteTotal/N).toFixed(1)}/局)`);
  const run={missionId:mission.id,difficultyId:diffId}; const seen=new Set();
  for(let i=0;i<600;i++)(window.DungeonEnemyGroups.enemiesFor(run,"elite",window.state)||[]).forEach(e=>seen.add(e.id));
  const missing=eliteIds.filter(id=>!seen.has(id));
  ok(`精英怪覆盖[${eliteIds.join(",")}]`,missing.length===0,missing.length?`缺失:${missing}`:"全覆盖");
}
const ruins=window.GameDataRuinsSandCity.mission;
const orc=window.GameDataFutureDungeons.find(m=>m.id==="orc_dungeon");
const rElite=["hilde","attack_helicopter","armored_carrier"];
const oElite=["orc_king_bondi","guard_kelly","assassin_sakura_risa","witherer_1124_split"];
check("废墟沙城",ruins,15,[4,9],7,15,rElite,dNormal);
check("废墟沙城",ruins,15,[4,9],7,15,rElite,dHeroic);
check("兽人地下城",orc,13,[9],7,13,oElite,dNormal);
check("兽人地下城",orc,13,[9],7,13,oElite,dHeroic);
console.log(`\n===== 汇总 ${pass}/${pass+fail} 通过 =====`);
process.exit(fail?1:0);
