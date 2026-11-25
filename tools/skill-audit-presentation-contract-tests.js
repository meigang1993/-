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

  // 32 → 33 → 34：新增安倍卡露娜（歌姬 / 幸运海螺 / 记忆泡泡）等角色后同步计数。
  // 本断言是「审计覆盖面」护栏：角色数变动时必须显式复核，不能直接放行。
  assert(GameData.characters.length === 34,
    "skill audit must cover all 34 playable characters");
  assert(enemies.length === 36, "skill audit must cover all 36 enemies");
  // 80 → 78：删除洛基「护母心切」与卡迪西斯「战场指挥官」各 1 项。
  // 78 → 81：新增米尔尤拉（渴血杀戮 / 无谋霸姬 / 神奇怀表）。
  // 81 → 83 → 86 → 88：索尼娅、格尔达、星野依、星野海一、安倍卡露娜等角色技能补齐。
  // 88 → 87：安洁莉卡主动技合并（3 技能变 2 技能）；87 → 86：诺亚两技能合并为一。
  // 86 → 87：诺亚新增主动技【终极刀魔】。
  assert(GameData.characters.flatMap(template => template.skills || []).length === 87,
    "skill audit must cover all 87 playable-character skills");
  // 72 → 71：删除魔王军猛兽部队「快速装弹」。
  assert(enemies.flatMap(template => template.skills || []).length === 71,
    "skill audit must cover all 71 enemy skills");
  assert(relics.length === 30, "relic audit must cover all 30 formal relics");
  const combatRoleNames = new Set([
    "输出", "控制", "辅助/续航", "防御/嘲讽", "成长/资源",
  ]);
  templates.forEach(template => {
    assert(template.combatRoles?.length === 1,
      `${template.id} must define exactly one primary combat role`);
    assert(template.combatRoles.every(role => combatRoleNames.has(role)),
      `${template.id} must use only canonical combat roles`);
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
  // 47 → 46：删除卡迪西斯主动技「战场指挥官」（带技能立绘）。
  // 46 → 47：新增普雷希主动技「女王榨取」（带技能立绘）。
  // 47 → 49：新增米尔尤拉主动技「渴血杀戮」「神奇怀表」。
  // 49 → 50：新增诺亚主动技「终极刀魔」（无专属卡图，走技能卡兜底图）。
  assert(namedActiveSkills.size === 50,
    `skill artwork audit must cover all 50 named active skills (实际 ${namedActiveSkills.size})`);
  // 2026-11-25：技能牌图（skill-art-*.webp）全部删除，出牌区不再显示技能牌。
  // 审计口径反转：50 个具名主动技不再解析出任何卡图，CardArt.url/fallbackUrl
  // 对技能牌一律返回空串；卡牌图案（card-art-*.webp）59 张必须全部保留。
  namedActiveSkills.forEach((skill, name) => {
    const runtimeCard = {
      ...(skill.card || { name, type: "tactic" }),
      _skill: true,
      skillName: name,
    };
    assert(CardArt.isSkill(runtimeCard), `${name} must still be identified as a skill card`);
    assert(CardArt.url(runtimeCard) === "",
      `${name} must not resolve any skill artwork (got ${CardArt.url(runtimeCard)})`);
    assert(CardArt.fallbackUrl(runtimeCard) === "",
      `${name} must not fall back to a card artwork either`);
    const snapshot = CardUtils.clean(runtimeCard, { skillName: name });
    assert(CardArt.isSkill(snapshot) && CardArt.url(snapshot) === "",
      `${name} cleaned trail snapshot must stay artwork-free`);
  });
  const cardsDir = path.resolve("publish/assets/generated/cards");
  const allArt = fs.readdirSync(cardsDir);
  assert(allArt.filter(f => f.startsWith("skill-art-")).length === 0,
    "all skill-art-*.webp must be deleted");
  assert(allArt.filter(f => f.startsWith("card-art-")).length === 59,
    "all 59 card-art-*.webp (real card artwork) must be kept");
  const trailSrc = fs.readFileSync(path.resolve("src/original/ui-battle-trail.js"), "utf8");
  assert(/isSkillCard/.test(trailSrc) && /filter\(card => !isSkillCard\(card\)\)/.test(trailSrc),
    "public play-area must filter skill cards out of the visual trail");
  const artSrc = fs.readFileSync(path.resolve("src/original/card-art.js"), "utf8");
  assert(!/skill-art-/.test(artSrc.replace(/^.*2026-11-25.*$/m, "")),
    "card-art.js must not reference any skill-art file");

  const expectedLockedIcons = new Set([
    "神速之翼", "神速飞剑", "重火力支援",
    "鬼牌狂欢", "爱之鞭挞",
  ]);
  expectedLockedIcons.forEach(name => {
    const skill = skills.find(entry => entry.name === name);
    assert(skill?.icon === "⭐" && skill?.type === "passive",
      `${name} must use the automatic locked-skill presentation`);
  });
  const expectedTriggerIcons = new Set([
    "指挥官责任", "复仇反击", "终焉回旋斩", "萌虎慰劳", "半魅魔血", "剑盾反攻",
  ]);
  expectedTriggerIcons.forEach(name => {
    const skill = skills.find(entry => entry.name === name);
    assert(skill?.icon === "🔵" && skill?.type === "trigger",
      `${name} must use the player-facing trigger presentation`);
  });
  const cadicis = GameData.characters.find(character => character.id === "cadicis");
  const heavyFire = cadicis.skills.find(skill => skill.name === "重火力支援");
  assert(heavyFire.text.includes("继承此【杀】的伤害属性与物理/魔法类别"),
  "Heavy Fire Support public description must state its inherited damage profile");
};
