/* global BattleCardCleanup, BattleCardTactics, BertisGerlotSkills, CardArt, CardUtils */
/* global FloraCarlosSkills, GameData, RelicSystem */
/* global GameDataFutureRelics, GameDataRelics, GameUIInfo, GuestCharacterSkills, MachineFactorySkills */
/* global MannySkills, UnderwaterTrainSkills, WithererSkills */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

module.exports = ({ assert, card, unit }) => {
  const enemies = Object.values(GameData.enemies).flat();
  const templates = [...GameData.characters, ...enemies];
  const skills = templates.flatMap(template => template.skills || []);
  const relics = Object.keys({ ...GameDataRelics, ...GameDataFutureRelics });

  assert(GameData.characters.length === 26, "skill audit must cover all 26 playable characters");
  assert(enemies.length === 27, "skill audit must cover all 27 enemies");
  assert(GameData.characters.flatMap(template => template.skills || []).length === 71,
    "skill audit must cover all 71 playable-character skills");
  assert(enemies.flatMap(template => template.skills || []).length === 54,
    "skill audit must cover all 54 enemy skills");
  assert(relics.length === 30, "relic audit must cover all 30 formal relics");
  const combatRoleNames = new Set(["输出", "控制", "辅助/续航", "防御/嘲讽", "成长/资源"]);
  templates.forEach(template => {
    assert(template.combatRoles?.length === 1,
      `${template.id} must define exactly one primary combat role`);
    assert(template.combatRoles.every(role => combatRoleNames.has(role)),
      `${template.id} must use only canonical combat roles`);
    assert(window.UICommon.combatRoleText(template).includes(template.combatRoles[0]),
      `${template.id} combat roles must appear in public hover wording`);
  });
  assert(JSON.stringify(window.GameCombatRoles.byId.little_elrana) === JSON.stringify(["输出"]),
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
  assert(namedActiveSkills.size === 36,
    "skill artwork audit must cover all 36 named active skills");
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
    assert(!artOwners.has(art), `${name} shares artwork path with ${artOwners.get(art)}`);
    artOwners.set(art, name);
    const hash = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
    assert(!hashOwners.has(hash), `${name} duplicates artwork bytes from ${hashOwners.get(hash)}`);
    hashOwners.set(hash, name);
    const snapshot = CardUtils.clean(runtimeCard, { skillName: name });
    assert(CardArt.url(snapshot) === art && CardArt.isSkill(snapshot),
      `${name} cleaned trail snapshot must keep its skill artwork identity`);
  });

  const expectedLockedIcons = new Set([
    "神速之翼", "神速飞剑", "重火力支援", "复仇之刃",
    "鬼牌狂欢", "剑盾反攻", "爱之鞭挞",
  ]);
  expectedLockedIcons.forEach(name => {
    const skill = skills.find(entry => entry.name === name);
    assert(skill?.icon === "⭐" && skill?.type === "passive",
      `${name} must use the automatic locked-skill presentation`);
  });
  const cadicis = GameData.characters.find(character => character.id === "cadicis");
  const commander = cadicis.skills.find(skill => skill.name === "战场指挥官");
  const heavyFire = cadicis.skills.find(skill => skill.name === "重火力支援");
  assert(commander.text.includes("同名【杀】或战术牌")
    && commander.card.text.includes("同名【杀】或战术牌"),
  "Battlefield Commander public descriptions must include recorded tactics");
  assert(heavyFire.text.includes("继承此【杀】的伤害属性与物理/魔法类别"),
  "Heavy Fire Support public description must state its inherited damage profile");

  const floraSource = card("神速之翼素材", "tactic", { suit: "♠" });
  const flora = unit("flora-presentation", "ally", {
    skills: [{ name: "神速之翼" }], hand: [floraSource],
  });
  const attacker = unit("flora-attacker", "enemy");
  let responded = null;
  const floraState = { battle: { allies: [flora], enemies: [attacker], animQueue: [] } };
  const flash = FloraCarlosSkills.dodgeAsFlash(
    floraState, flora, attacker, card("攻击", "slash"),
    { afterCardResponded: (_state, _target, _actor, response) => { responded = response; } },
  );
  assert(flash?.name === "闪" && flash.convertedFrom === floraSource.name
    && flash._entitySourceCard === floraSource && flash._visualHandBefore === 1
    && responded === flash,
  "Speed Wing must expose the converted Flash while retaining its entity source");

  const shootingCost = card("疯狂射击素材", "tactic", { suit: "♥" });
  const carlos = unit("carlos-presentation", "ally", {
    ref: "carlos", hand: [shootingCost],
  });
  const shootingState = {
    battle: { allies: [carlos], enemies: [], animQueue: [], selectedCardIndex: 0 },
  };
  let shooting = null;
  FloraCarlosSkills.handleSpecialCard(
    shootingState, carlos, carlos, { crazyShooting: true }, {},
    {
      selectedCostCard: () => 0,
      useCard: (_state, _actor, _target, usedCard) => { shooting = usedCard; },
    },
  );
  assert(shooting?.name === "机枪扫杀"
    && shooting.convertedFrom === shootingCost.name
    && shooting._entitySourceCard === shootingCost && !shooting.virtual,
  "Crazy Shooting must expose one entity conversion instead of a virtual card");

  const speedSource = card("极速素材", "tactic", { suit: "♣" });
  const witherer = unit("witherer-presentation", "ally", {
    withererMode: "极速", hand: [speedSource],
  });
  ["闪", "看破"].forEach(name => {
    const response = WithererSkills.responseCard(witherer, speedSource, name);
    assert(response.name === name && response.type === "response"
      && response.convertedFrom === speedSource.name
      && response._entitySourceCard === speedSource,
    `Speed mode must expose ${name} as a converted response`);
  });

  const bestaSource = card("终焉素材", "tactic", { suit: "♠" });
  const besta = unit("besta-presentation", "ally", {
    ref: "besta", hand: [bestaSource], stats: { attack: 3, magic: 6 },
  });
  const bestaTarget = unit("besta-target", "enemy");
  const bestaState = {
    battle: { allies: [besta], enemies: [bestaTarget], animQueue: [] },
  };
  GuestCharacterSkills.handleSpecialCard(
    bestaState, besta, besta, { bestaEndSlash: true },
    { damage() {} },
  );
  const endSlash = bestaState.battle.animQueue.find(event => event.type === "virtualPlay");
  assert(endSlash?.card?.name === "魔杀"
    && endSlash.card.convertedFrom === bestaSource.name
    && !endSlash.card.virtual && endSlash.targetUid === bestaTarget.uid,
  "Final Phantom Slash must show a converted Magic Slash and its target line");

  const raff = unit("raff-presentation", "enemy", {
    ai: "raff_assassin", hand: [card("红桃代价", "tactic", { suit: "♥" })],
  });
  const first = unit("control-first", "ally", {
    stats: { attack: 8, magic: 0 }, hand: [],
  });
  const second = unit("control-second", "ally", {
    stats: { attack: 4, magic: 0 }, hand: [],
  });
  const controlState = {
    battle: { allies: [first, second], enemies: [raff], animQueue: [] },
  };
  raff.deck = [card("黑桃判定", "tactic", { suit: "♠" })];
  raff.discard = [];
  UnderwaterTrainSkills.prepare(controlState, raff, () => {});
  const jokerJudge = controlState.battle.animQueue.find(event => event.type === "judgement");
  assert(raff.jokerMode === "black" && !raff.jokerSuit,
    "Joker Carnival must not show its suit before the judgement animation completes");
  jokerJudge.commit();
  assert(raff.jokerSuit === "♠",
    "Joker Carnival must retain its exact judgement suit after the judgement animation");
  const jokerMark = GameUIInfo({ esc: value => String(value) }).jokerSuitMark(raff);
  assert(jokerMark.includes(">♠<") && jokerMark.includes("小鬼牌模式") && jokerMark.includes("black"),
    "Joker Carnival must render its exact suit on Raff's portrait");
  const battleUnitSource = fs.readFileSync("./src/original/ui-battle-units.js", "utf8");
  assert((battleUnitSource.match(/I\.jokerSuitMark/g) || []).length === 2,
    "Both Raff's battlefield portrait and active portrait must render the judgement suit");
  let controlDamage = 0;
  UnderwaterTrainSkills.useControlEye(controlState, raff, (_state, _target, amount) => { controlDamage = amount; }, () => {});
  const duel = controlState.battle.animQueue.find(event =>
    event.type === "virtualPlay" && event.card?.name === "与我一战");
  assert(duel?.uid === first.uid && duel.targetUid === second.uid
    && duel.card.virtual && duel.show === true,
  "Control Eye must show its initiating virtual Duel and target line");
  assert(controlDamage === 8, "Control Eye Duel must equal the forced user's attack");

  const chainActor = unit("chain-actor", "ally");
  const chainTargets = [
    unit("chain-target-1", "enemy"),
    unit("chain-target-2", "enemy"),
  ];
  const chainState = {
    battle: { allies: [chainActor], enemies: chainTargets, animQueue: [] },
  };
  const tactics = BattleCardTactics({
    log() {},
    ctx: {},
    deps: { nextAnim: () => 1 },
    reveal() {},
    openHandReveal() {},
  });
  tactics.soulChain(chainState, chainActor, chainTargets[0], {
    name: "灵魂锁链", type: "tactic",
    _targetUids: chainTargets.map(target => target.uid),
  });
  assert(!chainState.battle.animQueue.some(event =>
    event.type === "virtualPlay" && event.card?.name === "灵魂锁链"),
  "Soul Chain must rely on its real card flight instead of showing a second card");
  assert(chainTargets.every(target =>
    target.soulChain === 2 && target.statuses.includes("锁魂")),
  "Soul Chain must mark both selected targets");

  const biteSource = card("杀（普攻）", "slash", { power: 1, scale: "attack" });
  const biteActor = unit("bite-presentation", "ally", {
    battleRelics: ["鲨鱼头套"], hand: [biteSource],
  });
  const biteState = { battle: { test: true, allies: [biteActor], enemies: [] } };
  const biteView = UnderwaterTrainSkills.displayBiteCard(biteState, biteActor, biteSource);
  assert(biteView.name === "咬杀" && biteView.convertedFrom === "杀（普攻）",
    "Shark Mask preview must show Bite Slash as a conversion");
  assert(UnderwaterTrainSkills.prepareBite(biteState, biteActor, biteSource)
    && biteSource.convertedFrom === "杀（普攻）",
  "Shark Mask resolution must retain its conversion marker");
  BattleCardCleanup.clearPlayFlags(biteSource);
  assert(biteSource.name === "杀（普攻）" && biteSource.convertedFrom === undefined,
    "Shark Mask cleanup must restore the original entity card");
};
