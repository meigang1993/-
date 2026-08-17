/* global BattleEffectEventRunner, BattleSession */
const { assert } = require("./battle-effects-test-harness");

async function run() {
  const drawStarts = [];
  const drawReleases = {};
  const groupRunner = BattleEffectEventRunner({
    finishDraw: async event => {
      drawStarts.push(event.uid);
      await new Promise(resolve => { drawReleases[event.uid] = resolve; });
    },
  });
  const groupedDraw = groupRunner.runEvent({}, {
    type: "initialDrawGroup",
    batches: [{ uid: "ally" }, { uid: "enemy" }],
  }, () => {}, () => {}, () => true);
  await Promise.resolve();
  assert(drawStarts.join(",") === "ally,enemy",
    "battle-opening draw batches must start concurrently");
  drawReleases.ally();
  drawReleases.enemy();
  await groupedDraw;

  let commitCount = 0;
  let commitRenders = 0;
  await groupRunner.runEvent({}, {
    type: "battleCommit", commit: () => { commitCount += 1; },
  }, () => { commitRenders += 1; }, () => {}, () => true);
  assert(commitCount === 1 && commitRenders === 1,
    "battle commit events must apply once and rerender after prior effects");

  const initialBattle = {
    allies: [
      {
        uid: "a1", side: "ally", deck: [{ name: "A1" }, { name: "A2" }],
        discard: [], hand: [],
      },
      {
        uid: "a2", side: "ally", deck: [{ name: "B1" }, { name: "B2" }],
        discard: [], hand: [],
      },
    ],
    enemies: [
      {
        uid: "e1", side: "enemy", deck: [{ name: "E1" }, { name: "E2" }],
        discard: [], hand: [],
      },
    ],
    animQueue: [],
  };
  const initialState = { view: "hall", battle: initialBattle, log: [] };
  window.GameData = { missions: [{ id: "opening-draw", name: "开战摸牌测试" }] };
  window.BattlePileStats = { reshuffle() {} };
  window.SakuraRisaSkills = {
    drawRecipient: unit => unit,
    onDrawRedirected() {},
  };
  window.BattleLines = { intro: () => 0, skill() {} };
  window.GameBGM = { unlock() {}, update() {}, playCurrent() {} };
  window.BattleFX.playBattleStart = callback => callback();
  const session = BattleSession({
    setup: {
      create: async () => ({
        allies: initialBattle.allies,
        enemies: initialBattle.enemies,
      }),
    },
    cleanupBattlePrompts() {},
    clearBattleLog() {},
    record() {},
    wait: async () => {},
    waitEffects: async () => {},
    isCurrentState: state => state === initialState,
    initialDrawCount: () => 2,
    revealPending() {},
    nextAnim: (() => { let id = 0; return () => ++id; })(),
    getCombat: () => ({ checkDefeat() {} }),
    getAdvanceToInput: () => async () => {},
  });
  await session.start(initialState, "opening-draw");
  assert(initialBattle.animQueue.length === 1,
    "battle start must queue one grouped initial-draw event");
  assert(initialBattle.animQueue[0].type === "initialDrawGroup",
    "battle start must use the concurrent initial-draw event");
  assert(initialBattle.animQueue[0].batches.length === 3,
    "the initial-draw group must retain one batch for every character");
  assert(initialBattle.animQueue[0].cards.length === 6,
    "the initial-draw group must retain all pending cards for recovery");
}

module.exports = { run };
