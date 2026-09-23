/* 实战：温蒂「解答迷惑」能否选择并使用新战术牌（枪林弹雨等） */
const fs=require("fs"),vm=require("vm");
const { assert, unitFromCharacter, installGlobals, loadRuntime } = require("./skill-coverage-fixtures");
installGlobals(); loadRuntime();
["data-ruins-content.js","wendy-skills.js","card-utils.js","battle-line-data.js","ruins-card-skills.js"]
  .forEach(f=>vm.runInThisContext(fs.readFileSync(`./src/original/${f}`,"utf8"),{filename:f}));

const results=[];
const record=(n,ok,d)=>{results.push({n,ok,d});console.log(`${ok?"✅":"❌"} ${n}${d?` — ${d}`:""}`);};

const state={ deck:[], explore:{earned:{cards:[]}}, battle:{allies:[],enemies:[],locked:false,animQueue:[]} };
const wendy=unitFromCharacter(GameData.characters[0],"w1"); wendy.side="ally"; wendy.ref="wendy"; wendy.name="温蒂";
const mate=unitFromCharacter(GameData.characters[0],"m1"); mate.side="ally";
const foe=unitFromCharacter(GameData.characters[0],"e1"); foe.side="enemy";
state.battle.allies=[wendy,mate]; state.battle.enemies=[foe];

// 1. 池中包含新战术牌
const pool=window.WendySkills.tutorPool(state);
record("池含枪林弹雨", pool.some(c=>c.name==="枪林弹雨"), `池${pool.length}张`);

// 2. 发动技能
window.WendySkills.tutor(state, wendy);
record("技能已开启选择器", !!state.battle.wendyTutorPicker, "uid="+state.battle.wendyTutorPicker?.uid);

// 3. 选择枪林弹雨（两步：先选牌，再选目标；第二传 null=加入自己手牌）
const step1=window.WendySkills.chooseTutorCard(state,"枪林弹雨",null);
record("第一步-选牌成功", step1===true && state.battle.wendyTutorPicker?.cardName==="枪林弹雨");
const picked=window.WendySkills.chooseTutorCard(state,"枪林弹雨",null);
record("第二步-入手成功", picked===true, "返回值="+picked);
record("选择器已关闭", state.battle.wendyTutorPicker===null && state.battle.locked===false);

const card=(wendy.hand||[]).find(c=>c.name==="枪林弹雨");
record("临时牌已入手", !!card);
if(card){
  record("标记为临时牌", card.temporary===true && card.void===true);
  record("保留 hybridAttack", card.hybridAttack===true, `=${card.hybridAttack}`);
  record("保留 power=1", card.power===1, `=${card.power}`);
  record("保留 sweep", card.sweep===true, `=${card.sweep}`);
  record("type 仍为 tactic", card.type==="tactic", `=${card.type}`);
  record("带花色", !!card.suit, `=${card.suit}`);
  // 伤害公式：1 + 攻 + 魔
  wendy.stats.attack=3; wendy.stats.magic=4;
  const amount=(card.power||0)+wendy.stats.attack+wendy.stats.magic;
  record("伤害=1+3+4=8", amount===8, `=${amount}`);
}

// 4. 交给队友
const state2={ deck:[], explore:{earned:{cards:[]}}, battle:{allies:[],enemies:[],locked:false,animQueue:[]} };
const w2=unitFromCharacter(GameData.characters[0],"w2"); w2.side="ally"; w2.ref="wendy";
const mate2=unitFromCharacter(GameData.characters[0],"m2"); mate2.side="ally"; mate2.uid="m2";
state2.battle.allies=[w2,mate2]; state2.battle.enemies=[foe];
window.WendySkills.tutor(state2,w2);
window.WendySkills.chooseTutorCard(state2,"枪林弹雨",null);
const ok2=window.WendySkills.chooseTutorCard(state2,"枪林弹雨","m2");
record("可交给队友", ok2===true && (mate2.hand||[]).some(c=>c.name==="枪林弹雨"));

// 5. 交给芙萝娅应可再次发动
const state3={ deck:[], explore:{earned:{cards:[]}}, battle:{allies:[],enemies:[],locked:false,animQueue:[]} };
const w3=unitFromCharacter(GameData.characters[0],"w3"); w3.side="ally"; w3.ref="wendy";
const flora=unitFromCharacter(GameData.characters[0],"f3"); flora.side="ally"; flora.ref="flora"; flora.uid="f3";
state3.battle.allies=[w3,flora]; state3.battle.enemies=[foe];
window.WendySkills.tutor(state3,w3);
window.WendySkills.chooseTutorCard(state3,"枪林弹雨",null);
window.WendySkills.chooseTutorCard(state3,"枪林弹雨","f3");
record("交给芙萝娅后本回合可再发动", w3.usedWendyTutor===false && w3.wendyTutorResetDone===true);

// 6. 一次性限制
const state4={ deck:[], explore:{earned:{cards:[]}}, battle:{allies:[],enemies:[],locked:false,animQueue:[]} };
const w4=unitFromCharacter(GameData.characters[0],"w4"); w4.side="ally"; w4.ref="wendy";
state4.battle.allies=[w4,mate]; state4.battle.enemies=[foe];
window.WendySkills.tutor(state4,w4);
window.WendySkills.chooseTutorCard(state4,"枪林弹雨",null);
record("未给芙萝娅时不可二次发动", w4.usedWendyTutor===true);

const failed=results.filter(r=>!r.ok);
console.log(`\n===== 汇总：${results.length-failed.length}/${results.length} 通过 =====`);
failed.forEach(f=>console.log(`  ❌ ${f.n} — ${f.d}`));
console.log("\nWendy tutor new tactics:", failed.length?"FAILED":"passed");
process.exit(failed.length?1:0);
