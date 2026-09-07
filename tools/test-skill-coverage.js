const {
  assert, card, unitFromCharacter, enemyFromTemplate, createState, installGlobals, loadRuntime,
} = require("./skill-coverage-fixtures");
const fs = require("fs");
const vm = require("vm");
const runAilengCoverage = require("./skill-coverage-aileng-tests");

installGlobals();
loadRuntime();

const state = createState();
const allEnemies = Object.values(GameData.enemies).flat();
const allRelicNames = [...new Set(allEnemies.flatMap(enemy => RelicSystem.enemyRelics(enemy.id)))];
const allRelics = allRelicNames.map(name => RelicSystem.data(name));

assert(GameData.characters.length >= 20, "Expected full character roster to load");
assert(allEnemies.length >= 20, "Expected full enemy roster to load");
assert(allRelics.length >= 27, "Expected full relic roster to load");
const lokarCourage = GameData.characters.find(character => character.id === "lokar")
  .skills.find(skill => skill.name === "战斗之勇");
assert(lokarCourage.text.includes("从摸牌堆摸1张牌") && !lokarCourage.text.includes("公共牌库"),
  "Battle Courage must describe drawing from the draw pile");

for (const character of GameData.characters) {
  const unit = unitFromCharacter(character);
  const listed = UICommon.skillsOf(unit);
  const listedNames = new Set(listed.map(skill => skill.name));
  for (const skill of character.skills) {
    assert(listedNames.has(skill.name), `Character skill missing from UICommon.skillsOf: ${character.id}.${skill.name}`);
    if (skill.type === "active") {
      assert(skill.card, `Active character skill missing card: ${character.id}.${skill.name}`);
      assert(skill.card.name && skill.card.type, `Active character skill card invalid: ${character.id}.${skill.name}`);
      UICommon.skillState(unit, skill, state.battle);
    }
  }
  UICommon.skillTitle(unit);
}

const aileng = runAilengCoverage(state, { assert, card, unitFromCharacter });

window.SkinSystem.applyToChar = (_state, character) => character;
[
  "villa-event-renderer.js", "villa-defeat-events.js", "villa-family-events.js",
  "villa-events.js", "villa-team.js",
].forEach(file => vm.runInThisContext(fs.readFileSync(`./src/original/${file}`, "utf8"), { filename: file }));
const teamState = {
  chars: [{ ...aileng, locked: false }],
  party: ["aileng"],
  flags: {},
  unlockedDifficulties: ["normal"],
  sortieStarting: false,
};
const rosterHtml = VillaTeamUI.teamRoster(teamState);
assert(rosterHtml.includes("【战斗之勇】") && rosterHtml.includes("【充能精华】"), "Team roster portraits must render derived skill descriptions");
const bertisCharacter = GameData.characters.find(character => character.id === "bertis");
const gerlotCharacter = GameData.characters.find(character => character.id === "gerlot");
const eventHtml = VillaEvents.gerlotUnlock({ chars: [bertisCharacter, gerlotCharacter] });
assert(eventHtml.includes("【取粮】"), "Villa event portraits must render derived skill descriptions");
const chiyoCharacter = GameData.characters.find(character => character.id === "chiyo");
assert(chiyoCharacter.entrance === "为了复仇，我要继续前进", "Chiyo character data must keep the canonical entrance line");
const chiyoEnemy = allEnemies.find(enemy => enemy.id === "invader_chiyo");
assert(chiyoCharacter.skills.every(skill => chiyoEnemy.skills.some(enemySkill => enemySkill.name === skill.name && enemySkill.text === skill.text)), "Chiyo must retain her enemy-version skills");
const soniaCharacter = GameData.characters.find(character => character.id === "sonia");
const soniaEnemy = allEnemies.find(enemy => enemy.id === "xx_witherer_1124");
assert(soniaEnemy.skills.every(enemySkill => soniaCharacter.skills.some(skill => skill.name === enemySkill.name && skill.text === enemySkill.text)), "Sonia must retain all XX Witherer 1124 skills");
vm.runInThisContext(fs.readFileSync("./src/original/succubus-codex.js", "utf8"), { filename: "succubus-codex.js" });
const codexHtml = SuccubusCodex.render({ ...state, view: "nursery", chars: GameData.characters.map(character => ({ id: character.id, name: character.name, locked: character.locked })) });
GameData.characters.forEach(character => assert(codexHtml.includes(`id="codex-${character.id}"`), `Character missing from codex: ${character.id}`));
assert(codexHtml.includes("索尼娅") && codexHtml.includes("母亲：混沌女神"), "Sonia codex entry must include her character data");
assert(codexHtml.includes("橘千樱") && codexHtml.includes("母亲：陈莲樱（已过世）"), "Chiyo codex entry must include her character data");
vm.runInThisContext(fs.readFileSync("./src/original/recruit-unlock-events.js", "utf8"), { filename: "recruit-unlock-events.js" });
const recruitState = {
  view: "hall", hallModal: null, battle: null, explore: null, flags: {},
  defeatedElites: ["mechanical_bull_king", "xx_witherer_1124"],
  chars: [GameData.characters.find(character => character.id === "lokar"), { ...chiyoCharacter }, { ...soniaCharacter }],
};
assert(RecruitUnlockEvents.triggerPending(recruitState) && recruitState.hallModal === "chiyoRecruitUnlock", "Chiyo recruit event must trigger first after Mechanical Bull King");
assert(RecruitUnlockEvents.chiyoUnlock(recruitState).includes("鹰7部队的线索"), "Chiyo recruit event must render its commission dialogue");
recruitState.chars.find(character => character.id === "chiyo").locked = false;
recruitState.flags.chiyoRecruitUnlockSeen = true;
recruitState.hallModal = null;
assert(RecruitUnlockEvents.triggerPending(recruitState) && recruitState.hallModal === "soniaNurseryUnlock", "Sonia nursery event must follow after defeating XX Witherer 1124");
assert(RecruitUnlockEvents.soniaUnlock(recruitState).includes("价格50精华宝珠"), "Sonia event must state the 50-orb nursery price");

for (const relic of allRelics) {
  const data = RelicSystem.data(relic.name);
  assert(data.name && data.effect, `Relic data incomplete: ${relic.name}`);
  RelicSystem.statText(relic.name);
  RelicSystem.statsForNames([relic.name]);
  const skills = RelicSystem.skillsForNames([relic.name]);
  if (RelicSystem.isActive(relic.name)) {
    assert(skills.length === 1, `Active relic skill missing: ${relic.name}`);
    assert(skills[0].card?.name && skills[0].card?.type, `Active relic card invalid: ${relic.name}`);
  }
}

const activeRelics = allRelics.filter(relic => RelicSystem.isActive(relic.name)).map(relic => relic.name);
state.testEquipment.lokar = activeRelics;
assert(RelicSystem.activeSkills(state, "lokar").length === activeRelics.length, "Active relic skills should be exposed for equipped relics");

const relicAi = {
  uid: "relic-ai", side: "enemy", name: "饰品测试敌人", hp: 20, maxHp: 20,
  hand: [{ name: "闪", type: "response", suit: "♦" }],
  skills: [], battleRelics: ["鬼王扑克"], stats: {},
};
const relicFoe = {
  uid: "relic-foe", side: "ally", name: "饰品测试目标", hp: 20, maxHp: 20,
  hand: [], skills: [], battleRelics: [], stats: {},
};
const relicBattle = { allies: [relicFoe], enemies: [relicAi] };
window.state = { ...state, battle: relicBattle };
const relicMove = BattleAI.choose(relicBattle, relicAi, () => true);
assert(relicMove?.card?._relicSkill, "AI active relic cards must preserve their relic source");

for (const enemy of allEnemies) {
  const unit = enemyFromTemplate(enemy);
  const listed = UICommon.skillsOf(unit);
  assert(listed.length >= enemy.skills.length, `Enemy skills missing from UICommon.skillsOf: ${enemy.id}`);
  const ally = unitFromCharacter(GameData.characters[0], "a-test");
  state.battle.allies = [ally];
  state.battle.enemies = [unit];
  window.state = state;

  EnemySkills.prepare(state, unit, () => ({ hpLoss: 0 }), () => 1);
  EnemySkills.beforeKillTargeted(state, unit, ally, card("杀（普攻）", "slash", { power: 1, scale: "attack", suit: "♠" }));
  EnemySkills.afterDamage(state, unit, ally, card("杀（普攻）", "slash", { power: 1, scale: "attack" }), 1, () => ({ hpLoss: 0 }));
  EnemySkills.endTurn(state, unit, () => []);

  const move = BattleAI.choose(state.battle, unit, () => true);
  if (move) assert(move.card && move.target, `BattleAI move is malformed for enemy: ${enemy.id}`);
}

[
  "NonokaLokiSkills", "FloraCarlosSkills", "WendyCadicisSkills", "LokarSkills", "MannySkills",
  "MillerSkills", "BertisGerlotSkills", "AngelicaLukaSkills", "ElranaAceNanaliSkills",
  "EdisSkills", "EnemySkills", "AbeMikeSkills", "UnderwaterTrainSkills", "OrcDungeonSkills",
  "BakarSkills", "SakuraRisaSkills", "GuestCharacterSkills",
].forEach(name => assert(window[name] && typeof window[name] === "object", `Skill module did not load: ${name}`));

console.log(`Skill coverage tests passed: ${GameData.characters.length} characters, ${allRelics.length} relics, ${allEnemies.length} enemies`);
