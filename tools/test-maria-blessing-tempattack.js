const fs = require("fs");
const vm = require("vm");
const {
  assert, card, unitFromCharacter, installGlobals, loadRuntime,
} = require("./skill-coverage-fixtures");

installGlobals();
loadRuntime();
["battle-card-cleanup.js", "battle-card-playability.js", "battle-combat-targeting.js",
  "battle-turn-state.js", "battle-discard-flow.js", "battle-end-phase.js",
  "artina-maria-skills.js"].forEach(file => {
  vm.runInThisContext(fs.readFileSync(`./src/original/${file}`, "utf8"), { filename: file });
});

const mariaData = GameData.characters.find(item => item.id === "maria");
const blessingSkill = mariaData.skills.find(skill => skill.name === "荣誉祝福");
assert(!!blessingSkill, "Maria must own Honor Blessing");

// 描述必须明确「含临时加成」，否则玩家按面板数字算收益会对不上
assert(/含神数咒语等临时加成/.test(blessingSkill.text),
  "Honor Blessing wording must state that temporary bonuses count");

function blessingCard() {
  return { ...blessingSkill.card, _skill: true, name: "荣誉祝福" };
}

function makeState(marks) {
  const maria = unitFromCharacter(mariaData, "a0");
  const ally = unitFromCharacter(GameData.characters[0], "a1");
  maria.stats = { attack: 3, magic: 3, speed: 4, maxHp: 38 };
  ally.stats = { attack: 3, magic: 3, speed: 4, maxHp: 40 };
  maria.tempAttack = marks;
  maria.tempMagic = marks;
  maria.mariaMarks = marks;
  maria.hand = [card("杀（普攻）", "slash", { suit: "♠" }), card("杀（普攻）", "slash", { suit: "♥" })];
  maria.usedMariaHonorBlessing = false;
  delete maria.mariaBlessing;
  delete maria.mariaBlessingSuits;
  ally.tempAttack = 0;
  ally.tempMagic = 0;
  delete ally.mariaBlessing;
  delete ally.mariaBlessingSuits;
  const state = { battle: { allies: [maria, ally], enemies: [], animQueue: [], selectedBagIndexes: [0, 1] } };
  return { state, maria, ally };
}

// 场景一：无神数标记
{
  const { state, maria, ally } = makeState(0);
  ArtinaMariaSkills.handleSpecialCard(state, maria, null, blessingCard(), {});
  assert(ally.mariaBlessing.attack === 3, `no-mark ally bonus must be 3, got ${ally.mariaBlessing.attack}`);
  assert(ally.stats.attack === 6, `no-mark ally attack must be 6, got ${ally.stats.attack}`);
  assert(maria.stats.attack === 6, `no-mark maria attack must be 6, got ${maria.stats.attack}`);
}

// 场景二：带 2 枚神数标记 —— 这是本次修复的核心
{
  const { state, maria, ally } = makeState(2);
  // 面板口径：stats + temp
  const panel = maria.stats.attack + maria.tempAttack;
  assert(panel === 5, `panel attack must be 5, got ${panel}`);
  ArtinaMariaSkills.handleSpecialCard(state, maria, null, blessingCard(), {});
  assert(ally.mariaBlessing.attack === 5, `marked ally bonus must equal panel 5, got ${ally.mariaBlessing.attack}`);
  assert(ally.stats.attack === 8, `marked ally attack must be 8, got ${ally.stats.attack}`);
  // 玛利亚自己：stats + bonus + 仍存在的 temp = 5 + 5，正好翻倍，不重复计入
  assert(maria.stats.attack === 8, `marked maria stats must be 8, got ${maria.stats.attack}`);
  assert(maria.stats.attack + maria.tempAttack === 10,
    `marked maria total must be 10 (5*2), got ${maria.stats.attack + maria.tempAttack}`);
  assert(ally.mariaBlessing.speed === 4, `speed bonus must stay stats-only 4, got ${ally.mariaBlessing.speed}`);
}

// 场景三：连续施放不得无限膨胀（第二次以已抬高的 stats 为基数时，self 抵消）
{
  const { state, maria, ally } = makeState(1);
  ArtinaMariaSkills.handleSpecialCard(state, maria, null, blessingCard(), {});
  const first = ally.stats.attack;
  // 强行保留 blessing 再放一次：self 必须抵消上一次的 bonus
  maria.hand = [card("杀（普攻）", "slash", { suit: "♠" }), card("杀（普攻）", "slash", { suit: "♥" })];
  state.battle.selectedBagIndexes = [0, 1];
  maria.usedMariaHonorBlessing = false;
  ally.mariaBlessingSuits = [];
  maria.mariaBlessingSuits = [];
  ArtinaMariaSkills.handleSpecialCard(state, maria, null, blessingCard(), {});
  const secondBonus = ally.mariaBlessing.attack;
  // self 抵消后净增量 = base(3) + temp(1)，不含上次 bonus —— 这是防膨胀的关键
  assert(secondBonus === 4, `repeat cast bonus must stay 4 (base+temp, no stacking), got ${secondBonus}`);
  assert(ally.stats.attack === first,
    `repeat cast must not inflate ally attack: ${first} -> ${ally.stats.attack}`);
  assert(first === 7, `first cast ally attack must be 7, got ${first}`);
}

// 场景四：衰减必须精确扣回（含临时加成的部分）
{
  const { state, maria, ally } = makeState(2);
  ArtinaMariaSkills.handleSpecialCard(state, maria, null, blessingCard(), {});
  assert(ally.stats.attack === 8, "precondition: ally boosted to 8");
  // 消耗掉全部花色
  ally.mariaBlessingSuits = ["♠"];
  maria.mariaBlessingSuits = ["♠"];
  ArtinaMariaSkills.endTurn(state, maria);
  assert(ally.stats.attack === 3, `ally must decay back to 3, got ${ally.stats.attack}`);
  assert(!ally.mariaBlessing, "ally blessing must be removed after full decay");
  // 玛利亚回合结束：神数标记清零，stats 也回到基础
  assert(maria.tempAttack === 0, `maria tempAttack must reset, got ${maria.tempAttack}`);
  assert(maria.stats.attack === 3, `maria stats must decay back to 3, got ${maria.stats.attack}`);
}

console.log("Maria blessing temp-attack tests passed");
