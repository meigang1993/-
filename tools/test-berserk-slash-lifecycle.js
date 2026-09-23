const assert = require("assert");
const { combat, card } = require("./pursue-kill-fixtures");

require("../src/original/battle-setup.js");
require("../src/original/battle-session-settlement.js");
require("../src/original/battle-outcomes.js");

const character = (id, attack) => ({
  id,
  name: id,
  gender: "female",
  face: id,
  art: "test.webp",
  hp: 20,
  stats: {
    maxHp: 20,
    attack,
    magic: 0,
    speed: 1,
    bloodlust: 1,
    handLimit: 5,
    drawPerTurn: 0,
  },
  skills: [],
});

const enemy = () => ({
  id: "target",
  name: "target",
  type: "normal",
  ai: "target",
  gender: "female",
  face: "target",
  art: "test.webp",
  hp: 100,
  attack: 1,
  magic: 0,
  speed: 1,
  bloodlust: 1,
  handLimit: 5,
  drawPerTurn: 0,
  initialDraw: 0,
  skills: [],
});

function freshState() {
  return {
    chars: [character("user", 2), character("teammate", 7)],
    party: ["user", "teammate"],
    deck: [],
    resources: { gold: 0 },
    flags: {},
    log: [],
    battleLog: [],
    view: "hall",
    battle: null,
  };
}

window.GameData = {
  enemies: { lifecycle: [enemy()] },
  missions: [{
    id: "lifecycle",
    name: "lifecycle",
    kind: "normal",
    reward: { gold: 37 },
  }],
};
window.GameStoreSaveLimits = {
  addResource: (current, amount) => current + amount,
};
window.BattleFX = { leave() {} };
window.BattleVictory = {
  close(state) { if (state.battle) state.battle.victoryScreen = false; },
  open(state) { if (state.battle) state.battle.victoryScreen = true; },
};
window.ReceiptLedger = { assign: () => "defeat-lifecycle" };
window.ServerCore = { call: async () => ({ ok: true }) };

const setup = BattleSetup();
const finishBattle = BattleSessionSettlement({
  cleanupBattlePrompts() {},
  clearBattleLog(state) { state.battleLog = []; },
  getCombat: () => ({ checkDefeat() {} }),
});
const outcomes = BattleOutcomes({
  clearBattleLog(state) { state.battleLog = []; },
  finishBattle,
  combat: { checkDefeat() {}, checkEnd() {} },
});

async function enterBattle(state) {
  return setup.create(state, "lifecycle", null, {
    deck: [],
    enemies: [enemy()],
  });
}

function useBerserk(state, allies, enemies) {
  const user = allies[0];
  user.intent = 1;
  user.hand.push(card("暴走杀"));
  combat.useCard(state, user, enemies[0], user.hand[0]);
}

async function run() {
  const rewardState = freshState();
  await enterBattle(rewardState);
  const mission = window.GameData.missions[0];
  const originalReward = mission.reward;
  const beforeGold = rewardState.resources.gold;
  rewardState.log = null;
  rewardState.battle.victoryScreen = true;
  rewardState.battle.locked = true;
  rewardState.battle.missionId = "missing_mission";
  assert.strictEqual(await outcomes.continueVictory(rewardState), false);
  assert.strictEqual(rewardState.resources.gold, beforeGold,
    "a missing direct mission must not grant gold");
  assert(rewardState.battle.victoryScreen && rewardState.battle.settlementError,
    "a missing direct mission must keep victory settlement retryable");
  assert.strictEqual(rewardState.log[0], rewardState.battle.settlementError,
    "a direct reward failure must explain the retry");
  rewardState.battle.missionId = mission.id;
  mission.reward = null;
  assert.strictEqual(await outcomes.continueVictory(rewardState), false);
  assert.strictEqual(rewardState.resources.gold, beforeGold,
    "a missing direct reward payload must not grant gold");
  mission.reward = originalReward;
  assert.strictEqual(await outcomes.continueVictory(rewardState), true);
  assert.strictEqual(rewardState.resources.gold, beforeGold + originalReward.gold);
  assert(rewardState.view === "hall" && rewardState.battle === null,
    "a repaired direct reward must settle and return to the hall");
  assert.strictEqual(await outcomes.continueVictory(rewardState), false,
    "a late victory continuation must be a no-op after battle cleanup");

  const state = freshState();
  let units = await enterBattle(state);
  useBerserk(state, units.allies, units.enemies);
  assert.strictEqual(units.allies[0].stats.attack, 3,
    "Berserk Slash must increase only its actual user's battle attack");
  assert.strictEqual(units.allies[1].stats.attack, 7,
    "Berserk Slash must not increase a teammate's attack");
  assert.strictEqual(state.chars[0].stats.attack, 2,
    "Berserk Slash must not mutate the persistent character stats");

  await finishBattle(state, true, true);
  assert.strictEqual(state.battle, null,
    "victory settlement must discard the battle units and their attack growth");
  units = await enterBattle(state);
  assert.strictEqual(units.allies[0].stats.attack, 2,
    "a new battle after victory must start from persistent attack");

  useBerserk(state, units.allies, units.enemies);
  state.battle.defeat = true;
  await outcomes.returnHall(state);
  assert.strictEqual(state.battle, null,
    "party-wipe settlement must discard the battle units and their attack growth");
  units = await enterBattle(state);
  assert.strictEqual(units.allies[0].stats.attack, 2,
    "a new battle after a party wipe must start from persistent attack");

  console.log("Berserk Slash lifecycle contracts passed");
}

run().catch(error => {
  console.error(error.message, error.stack);
  process.exitCode = 1;
});
