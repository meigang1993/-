/* global BertisGerlotSkills, CardArt, CardUtils, GameData, RelicSystem */
/* global GameDataFutureRelics, GameDataRelics, GuestCharacterSkills, MachineFactorySkills, MannySkills */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

module.exports = ({ assert, unit }) => {
  const enemies = Object.values(GameData.enemies).flat();
  const templates = [...GameData.characters, ...enemies];
  const skills = templates.flatMap(template => template.skills || []);
  const relics = Object.keys({ ...GameDataRelics, ...GameDataFutureRelics });

  assert(GameData.characters.length === 28,
    "skill audit must cover all 28 playable characters");
  assert(enemies.length === 36, "skill audit must cover all 36 enemies");
  assert(GameData.characters.flatMap(template => template.skills || []).length === 75,
    "skill audit must cover all 75 playable-character skills");
  assert(enemies.flatMap(template => template.skills || []).length === 72,
    "skill audit must cover all 72 enemy skills");
  assert(relics.length === 30, "relic audit must cover all 30 formal relics");
  const combatRoleNames = new Set([
    "输出", "控制", "辅助/续航", "防御/嘲讽", "成长/资源",
  ]);
  templates.forEach(template => {
    assert(template.combatRoles?.length === 1,
      `${template.id} must define exactly one primary combat role`);
    assert(template.combatRoles.every(role => combatRoleNames.has(role)),
      `${template.id} must use only canonical combat roles`);
    assert(window.UICommon.combatRoleText(template).includes(template.combatRoles[0]),
      `${template.id} combat roles must appear in public hover wording`);
  });
  assert(JSON.stringify(window.GameCombatRoles.byId.little_elrana)
    === JSON.stringify(["输出"]),
  "Little Elrana must use only her primary output role");
  assert(JSON.stringify(window.GameCombatRoles.byId.mechanical_goblin)
    === JSON.stringify(["控制"]),
  "Mechanical Goblin must remain a hand-control unit rather than generic output");
  assert(window.UICommon.combatRoleBadges({ combatRoles: ["辅助/续航"] })
    .includes(">辅助/续航<"),
  "character detail role badges must render one complete canonical role name");

  const previousState = window.state;
  const bertis = unit("bertis-art-audit", "ally", {
    ref: "bertis", skills: [{ name: "快速生长" }],
  });
  const foodUser = unit("food-art-audit", "ally", { ref: "food-user" });
  window.state = { battle: { allies: [bertis, foodUser], enemies: [] } };
  const takeFood = BertisGerlotSkills.skills(foodUser)[0];
  window.state = previousState;
  const hammerApi = MachineFactorySkills({
    alive: () => [], stat: () => 0, black: () => false,
    hpPct: actor => actor.hp / actor.maxHp,
    markStatus() {}, drawJudge() {},
  });
  const terrorHammer = hammerApi.hammerMove({
    ai: "mechanical_bull_king", annihilationMode: true,
    hp: 70, maxHp: 100,
  })?.card;
  const derivedActiveSkills = [
    GuestCharacterSkills.chargeSkill(),
    takeFood,
    MannySkills.skills({ mannyWeapon: "barrett" })[0],
    terrorHammer && { name: terrorHammer.name, type: "active", card: terrorHammer },
  ];
  assert(derivedActiveSkills.every(Boolean),
    "skill artwork audit must resolve all runtime-derived active skills");

  const activeSkills = [
    ...GameData.characters.flatMap(template =>
      (template.skills || []).filter(skill => skill.type === "active")),
    ...enemies.flatMap(template =>
      (template.skills || []).filter(skill => skill.type === "active")),
    ...relics.filter(name => RelicSystem.isActive(name))
      .flatMap(name => RelicSystem.skillsForNames([name])),
    ...derivedActiveSkills,
  ];
  const namedActiveSkills = new Map();
  activeSkills.forEach(skill => namedActiveSkills.set(skill.name, skill));
  assert(namedActiveSkills.size === 46,
    "skill artwork audit must cover all 46 named active skills");
  const artOwners = new Map();
  const hashOwners = new Map();
  namedActiveSkills.forEach((skill, name) => {
    const runtimeCard = {
      ...(skill.card || { name, type: "tactic" }),
      _skill: true,
      skillName: name,
    };
    const art = CardArt.url(runtimeCard);
    const file = path.resolve("publish", art.replace(/^\.\//, ""));
    assert(art.includes("/skill-art-"),
      `${name} must resolve dedicated skill artwork`);
    assert(fs.existsSync(file), `${name} skill artwork file is missing`);
    assert(!artOwners.has(art),
      `${name} shares artwork path with ${artOwners.get(art)}`);
    artOwners.set(art, name);
    const hash = crypto.createHash("sha256")
      .update(fs.readFileSync(file)).digest("hex");
    assert(!hashOwners.has(hash),
      `${name} duplicates artwork bytes from ${hashOwners.get(hash)}`);
    hashOwners.set(hash, name);
    const snapshot = CardUtils.clean(runtimeCard, { skillName: name });
    assert(CardArt.url(snapshot) === art && CardArt.isSkill(snapshot),
      `${name} cleaned trail snapshot must keep its skill artwork identity`);
  });

  const expectedLockedIcons = new Set([
    "神速之翼", "神速飞剑", "重火力支援",
    "鬼牌狂欢", "爱之鞭挞",
  ]);
  expectedLockedIcons.forEach(name => {
    const skill = skills.find(entry => entry.name === name);
    assert(skill?.icon === "⭐" && skill?.type === "passive",
      `${name} must use the automatic locked-skill presentation`);
  });
  const expectedTriggerIcons = new Set(["复仇之刃", "剑盾反攻"]);
  expectedTriggerIcons.forEach(name => {
    const skill = skills.find(entry => entry.name === name);
    assert(skill?.icon === "🔵" && skill?.type === "trigger",
      `${name} must use the player-facing trigger presentation`);
  });
  const cadicis = GameData.characters.find(character => character.id === "cadicis");
  const commander = cadicis.skills.find(skill => skill.name === "战场指挥官");
  const heavyFire = cadicis.skills.find(skill => skill.name === "重火力支援");
  assert(commander.text.includes("同名【杀】或战术牌")
    && commander.card.text.includes("同名【杀】或战术牌"),
  "Battlefield Commander public descriptions must include recorded tactics");
  assert(heavyFire.text.includes("继承此【杀】的伤害属性与物理/魔法类别"),
  "Heavy Fire Support public description must state its inherited damage profile");
};
