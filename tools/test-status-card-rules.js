const assert = require("assert");
const { combat, card, scenario, unit } = require("./pursue-kill-fixtures");

function statusState(hand = []) {
  const holder = unit("status-holder", "ally", hand);
  holder.name = "状态目标";
  holder.deck = [];
  const state = {
    log: [],
    battle: {
      allies: [holder], enemies: [], animQueue: [], played: [],
    },
  };
  return { state, holder };
}

{
  const { state, holder } = statusState();
  const stun = BattleStatusCards.create("stun");
  const seal = BattleStatusCards.create("seal");
  assert(BattleStatusCards.add(state, holder, stun));
  assert(!BattleStatusCards.add(state, holder, BattleStatusCards.create("stun")));
  assert(BattleStatusCards.add(state, holder, seal));
  assert.deepStrictEqual(holder.hand.map(BattleStatusCards.keyOf), ["stun", "seal"]);
}

{
  const obstacle = card("束缚陷阱");
  const status = BattleStatusCards.create("stun");
  const { state, holder } = statusState([obstacle, status]);
  assert.strictEqual(BattleStatusCards.isStatus(obstacle), false,
    "a status-producing obstacle is not itself a status card");
  BattleStatusCards.sync(holder, state.battle);
  assert.deepStrictEqual(holder.hand.map(item => item.name), ["束缚陷阱", "眩晕"],
    "an obstacle and its generated status must coexist in one hand");
  assert.strictEqual(holder.consumed.length, 0);
}

{
  const { state, holder } = statusState([
    BattleStatusCards.create("stun"),
    BattleStatusCards.create("seal"),
  ]);
  holder.deck = [
    card("闪", { suit: "♥" }),
    card("杀（普攻）", { suit: "♠" }),
  ];
  BattleStatusCards.judgement(state, holder);
  assert.strictEqual(holder.skipPlayPhase, true,
    "black stun judgement must skip the play phase");
  assert.strictEqual(holder.skipDrawPhase, true,
    "red seal judgement must skip the draw phase");
  assert.strictEqual(holder.drawLockedThisTurn, true,
    "successful seal must block every draw for the turn");
}

{
  const { state, holder } = statusState();
  holder.stats = { bloodlust: 1 };
  holder.drawLockedThisTurn = true;
  holder.deck = [card("杀（普攻）")];
  WithererRelicSkills.useWarHorn(state, holder, null, () => 1);
  assert.strictEqual(holder.hand.length, 0,
    "Magic Seal must block War Horn's targeted Slash draw");
  assert.strictEqual(holder.deck.length, 1);
}

require("../src/original/battle-session-settlement.js");
require("../src/original/battle-session.js");

function createRealDraw() {
  let animationId = 0;
  return BattleSession({
    setup: { shuffle() {} },
    cleanupBattlePrompts() {},
    clearBattleLog() {},
    record() {},
    wait: async () => {},
    waitEffects: async () => {},
    isCurrentState: () => true,
    initialDrawCount: () => 0,
    revealPending() {},
    nextAnim: () => ++animationId,
    getCombat: () => ({ checkDefeat() {} }),
    getAdvanceToInput: () => async () => {},
  }).draw;
}

{
  const { state, holder } = statusState();
  const draw = createRealDraw();
  holder.stats = { bloodlust: 2 };
  holder.deck = [card("闪"), card("杀（普攻）")];
  holder.drawLockedThisTurn = true;
  const deckBefore = holder.deck.slice();
  assert.deepStrictEqual(draw(holder, 2, state.battle), [],
    "Magic Seal must make the canonical draw return no cards");
  assert.deepStrictEqual(holder.deck, deckBefore,
    "Magic Seal must not consume cards from the deck");
  assert.strictEqual(holder.hand.length, 0,
    "Magic Seal must not add cards to hand");
  assert.strictEqual(state.battle.animQueue.length, 0,
    "Magic Seal must not queue a draw animation");
  BattleTurnState.cleanupTurn(state.battle, holder, true, [holder]);
  const drawn = draw(holder, 1, state.battle);
  assert.strictEqual(drawn.length, 1,
    "completed turn cleanup must restore out-of-turn drawing");
  assert.strictEqual(holder.deck.length, 1);
  assert.strictEqual(holder.hand.length, 1);
  assert.strictEqual(state.battle.animQueue[0]?.type, "drawBatch");
}

{
  const draw = createRealDraw();
  const sealed = unit("sealed-owner", "ally", []);
  const teammate = unit("next-actor", "ally", []);
  sealed.name = "已结束回合角色";
  teammate.name = "下一行动角色";
  sealed.deck = [card("闪")];
  teammate.deck = [card("杀（普攻）")];
  sealed.drawLockedThisTurn = true;
  const state = {
    log: [],
    battle: {
      allies: [sealed, teammate], enemies: [], animQueue: [], played: [],
    },
  };
  assert.deepStrictEqual(draw(sealed, 1, state.battle), [],
    "Magic Seal must still block end-phase draws before cleanup");
  BattleTurnState.cleanupTurn(state.battle, sealed, true, [sealed, teammate]);
  const specials = BattleCardSpecials(
    { draw },
    { sameSideUnits: () => state.battle.allies },
  );
  specials.drawTeam(state, teammate, { name: "物资补给", drawTeam: 1 });
  assert.strictEqual(sealed.hand.length, 1,
    "a completed sealed turn must not block draws during later units' turns");
  assert(state.log.some(message => message.includes("己方全体各摸1张牌")),
    "later team draws must report the formerly sealed unit as restored");
}

{
  const { state, holder } = statusState();
  const draw = createRealDraw();
  holder.drawLockedThisTurn = true;
  holder.deck = [card("闪"), card("杀（普攻）")];
  const effects = BattleCombatCardEffects({
    deps: { draw, intentMax: () => 3 },
    specials: { repeatTactic() {} },
    pushFloat() {},
  });
  effects.resolve(state, holder, holder, card("魔力提炼"));
  assert(state.log.some(message => message.includes("使用魔力提炼，因封魔无法摸牌")),
    "formal draw cards must report the Magic Seal block");
  assert(!state.log.some(message => message.includes("使用魔力提炼，摸2张牌")),
    "formal draw cards must not report a false successful draw");
}

{
  const draw = createRealDraw();
  const open = unit("open-draw", "ally", []);
  const sealed = unit("sealed-draw", "ally", []);
  open.name = "正常角色";
  sealed.name = "封魔角色";
  open.deck = [card("闪")];
  sealed.deck = [card("杀（普攻）")];
  sealed.drawLockedThisTurn = true;
  const state = {
    log: [],
    battle: {
      allies: [open, sealed], enemies: [], animQueue: [], played: [],
    },
  };
  const specials = BattleCardSpecials(
    { draw },
    { sameSideUnits: () => state.battle.allies },
  );
  specials.drawTeam(state, open, { name: "物资补给", drawTeam: 1 });
  assert(state.log.some(message =>
    message.includes("正常角色摸1张牌、封魔角色因封魔无法摸牌")),
  "team draw logs must distinguish normal and Magic-Sealed recipients");
}

{
  const source = card("束缚陷阱");
  const status = BattleStatusCards.create("stun");
  const { state, holder } = statusState([source, status, card("闪")]);
  BattleStatusCards.endTurn(state, holder);
  assert.deepStrictEqual(holder.hand.map(item => item.name),
    ["束缚陷阱", "闪"]);
  assert.deepStrictEqual(holder.consumed.map(item => item.name), ["眩晕"],
    "unused obstacles must remain while held void statuses expire");
}

{
  const { state, holder } = statusState([
    BattleStatusCards.create("stun"),
    BattleStatusCards.create("seal"),
    card("杀（普攻）"),
    card("闪"),
  ]);
  holder.side = "enemy";
  holder.type = "elite";
  assert(BattleStatusCards.resolveResistance(state, holder));
  assert.strictEqual(holder.hand.length, 1);
  assert.deepStrictEqual(holder.discard.map(item => item.name), ["杀（普攻）", "闪"],
    "elite resistance must discard two other hand cards as its cost");
  assert.strictEqual(holder.consumed.length, 1,
    "elite resistance must consume exactly one held status card");
  assert.strictEqual(BattleStatusCards.keyOf(holder.hand[0]), "seal",
    "elite resistance must leave other status cards for judgement");
}

{
  const status = BattleStatusCards.create("stun");
  const { state, holder } = statusState([status, card("闪")]);
  holder.side = "enemy";
  holder.type = "boss";
  holder.deck = [card("杀（普攻）", { suit: "♠" })];
  assert.strictEqual(BattleStatusCards.resolveResistance(state, holder), false,
    "resistance must not consume a status without two other hand cards");
  assert.strictEqual(holder.hand.length, 2);
  assert.strictEqual(holder.discard.length, 0);
  assert.strictEqual(holder.consumed.length, 0);
  BattleStatusCards.judgement(state, holder);
  assert.strictEqual(holder.skipPlayPhase, true,
    "an unpaid resistance status must continue into judgement");
}

{
  const { state, actor, target } = scenario(
    [card("束缚陷阱")],
    [BattleStatusCards.create("stun")],
  );
  window.state = state;
  assert.strictEqual(combat.canPlay(actor, actor.hand[0], state.battle), false,
    "an obstacle must be unavailable when every enemy already has that status");
  target.hand.push(BattleStatusCards.create("seal"));
  BattleStatusCards.sync(target, state.battle);
  assert.strictEqual(target.hand.filter(item =>
    BattleStatusCards.keyOf(item) === "stun").length, 1,
  "status normalization must preserve only one card of each type");
}

{
  const { state, actor } = scenario([card("偷窃")], []);
  const teammate = unit("ally-status", "ally", [
    BattleStatusCards.create("seal"),
  ]);
  state.battle.allies.push(teammate);
  window.state = state;
  assert(combat.playActiveCard(state, 0, teammate.uid));
  assert.strictEqual(state.battle.handReveal.mode, "steal");
  assert(combat.resolveHandReveal(state, 0));
  assert.strictEqual(teammate.consumed[0].name, "封魔");
  assert(!actor.hand.some(item => item.name === "封魔"),
    "a stolen friendly status card must be consumed instead of transferred");
}

{
  const actor = unit("enemy-actor", "enemy", [
    card("拆解"),
    card("束缚陷阱"),
  ]);
  const teammate = unit("enemy-status", "enemy", [
    BattleStatusCards.create("seal"),
  ]);
  const foe = unit("ally-target", "ally", [card("闪")]);
  const battle = { enemies: [actor, teammate], allies: [foe] };
  window.state = { battle };
  const move = BattleAI.choose(battle, actor, () => true);
  assert.strictEqual(move.card.name, "拆解");
  assert.strictEqual(move.target.uid, teammate.uid,
    "enemy AI must prioritize removing a friendly status card");
  teammate.hand = [];
  actor.hand = [card("封印术")];
  const obstacleMove = BattleAI.choose(battle, actor, () => true);
  assert.strictEqual(obstacleMove.card.name, "封印术");
  assert.strictEqual(obstacleMove.target.uid, foe.uid,
    "enemy AI must play obstacle cards on enemies missing that status");
}

require("../src/original/battle-setup.js");

async function testResistanceInjection() {
  const previousGameData = window.GameData;
  const previousState = window.state;
  window.GameData = {
    enemies: {
      test: [
        { id: "future-elite", type: "elite", skills: [] },
        { id: "future-boss", type: "boss", skills: [] },
      ],
    },
    missions: [{ id: "status-test", name: "状态测试" }],
  };
  const enemyData = (id, extra = {}) => ({
    id, name: id, ai: id, gender: "female", face: "测", art: "test.webp",
    hp: 10, attack: 1, magic: 1, speed: 1, bloodlust: 1, handLimit: 4,
    drawPerTurn: 0, initialDraw: 0, skills: [], ...extra,
  });
  const state = { chars: [], party: [], deck: [] };
  window.state = state;
  const setup = BattleSetup();
  const { enemies } = await setup.create(state, "status-test", null, {
    test: true,
    allyIds: [],
    deck: [],
    enemies: [
      enemyData("future-elite"),
      enemyData("future-boss"),
      enemyData("ordinary", { type: "normal" }),
    ],
  });
  assert(enemies[0].skills.some(skill => skill.name === "霸王色抗性"));
  assert(enemies[1].skills.some(skill => skill.name === "霸王色抗性"));
  assert(!enemies[2].skills.some(skill => skill.name === "霸王色抗性"),
    "normal enemies must not receive elite/BOSS resistance");
  window.GameData = previousGameData;
  window.state = previousState;
}

testResistanceInjection()
  .then(() => console.log("Status card rules passed"))
  .catch(error => {
    console.error(error.message, error.stack);
    process.exitCode = 1;
  });
