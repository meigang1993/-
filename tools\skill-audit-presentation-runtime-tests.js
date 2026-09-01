/* global BattleCardCleanup, BattleCardTactics, FloraCarlosSkills, GameUIInfo */
/* global GuestCharacterSkills, UnderwaterTrainSkills, WithererSkills */
const fs = require("fs");

module.exports = ({ assert, card, unit }) => {
  const floraSource = card("神速之翼素材", "tactic", { suit: "♠" });
  const flora = unit("flora-presentation", "ally", {
    skills: [{ name: "神速之翼" }], hand: [floraSource],
  });
  const attacker = unit("flora-attacker", "enemy");
  let responded = null;
  const floraState = {
    battle: { allies: [flora], enemies: [attacker], animQueue: [] },
  };
  const flash = FloraCarlosSkills.dodgeAsFlash(
    floraState, flora, attacker, card("攻击", "slash"),
    {
      afterCardResponded: (_state, _target, _actor, response) => {
        responded = response;
      },
    },
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
  const endSlash = bestaState.battle.animQueue.find(
    event => event.type === "virtualPlay");
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
  const jokerJudge = controlState.battle.animQueue.find(
    event => event.type === "judgement");
  assert(raff.jokerMode === "black" && !raff.jokerSuit,
    "Joker Carnival must not show its suit before the judgement animation completes");
  jokerJudge.commit();
  assert(raff.jokerSuit === "♠",
    "Joker Carnival must retain its exact judgement suit after the judgement animation");
  const jokerMark = GameUIInfo({ esc: value => String(value) }).jokerSuitMark(raff);
  assert(jokerMark.includes(">♠<") && jokerMark.includes("小鬼牌模式")
    && jokerMark.includes("black"),
  "Joker Carnival must render its exact suit on Raff's portrait");
  const battleUnitSource = fs.readFileSync(
    "./src/original/ui-battle-units.js", "utf8");
  assert((battleUnitSource.match(/I\.jokerSuitMark/g) || []).length === 2,
    "Both Raff's battlefield portrait and active portrait must render the judgement suit");
  let controlDamage = 0;
  UnderwaterTrainSkills.useControlEye(
    controlState, raff,
    (_state, _target, amount) => { controlDamage = amount; },
    () => {},
  );
  const duel = controlState.battle.animQueue.find(event =>
    event.type === "virtualPlay" && event.card?.name === "与我一战");
  assert(duel?.uid === first.uid && duel.targetUid === second.uid
    && duel.card.virtual && duel.show === true,
  "Control Eye must show its initiating virtual Duel and target line");
  assert(controlDamage === 8,
    "Control Eye Duel must equal the forced user's attack");

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

  const biteSource = card("杀（普攻）", "slash", {
    power: 1, scale: "attack",
  });
  const biteActor = unit("bite-presentation", "ally", {
    battleRelics: ["鲨鱼头套"], hand: [biteSource],
  });
  const biteState = {
    battle: { test: true, allies: [biteActor], enemies: [] },
  };
  const biteView = UnderwaterTrainSkills.displayBiteCard(
    biteState, biteActor, biteSource);
  assert(biteView.name === "咬杀" && biteView.convertedFrom === "杀（普攻）",
    "Shark Mask preview must show Bite Slash as a conversion");
  assert(UnderwaterTrainSkills.prepareBite(biteState, biteActor, biteSource)
    && biteSource.convertedFrom === "杀（普攻）",
  "Shark Mask resolution must retain its conversion marker");
  BattleCardCleanup.clearPlayFlags(biteSource);
  assert(biteSource.name === "杀（普攻）" && biteSource.convertedFrom === undefined,
    "Shark Mask cleanup must restore the original entity card");
};
