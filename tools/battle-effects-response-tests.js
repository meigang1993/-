/* global BattleEffectCards, BattleEffectHandlers */
const { assert } = require("./battle-effects-test-harness");

async function run() {
  let releaseHandler;
  window.BattleEffectUtils = {
    ...window.BattleEffectUtils,
    publicZone() {},
    pileZone() {},
    unitEl() {},
    unitArt() {},
    handSpot() {},
    projectile() {},
    runAnim: async () => {},
    wait: () => new Promise(resolve => { releaseHandler = resolve; }),
  };
  window.BattleEffectAnimation = { stampCssTiming() {} };
  require("../src/original/battle-effect-card-dom.js");
  require("../src/original/battle-effect-card-motion.js");
  require("../src/original/battle-cards-system.js");
  require("../src/original/battle-effect-card-transfers.js");
  require("../src/original/battle-effect-played-card-flight.js");
  require("../src/original/card-utils.js");
  require("../src/original/battle-effect-card-plays.js");
  require("../src/original/battle-effect-cards.js");
  require("../src/original/battle-effect-handlers.js");
  const publicOrigin = {};
  const unitOrigin = {};
  const origins = BattleEffectCards({
    ...window.BattleEffectUtils,
    publicZone: () => publicOrigin,
    drawOrigin: () => publicOrigin,
    unitArt: () => unitOrigin,
  });
  assert(origins.gainOrigin({ uid: "same", fromUid: "same" }) === publicOrigin,
    "self-generated gains must animate from the public zone");
  assert(origins.gainOrigin({ uid: "target", fromUid: "source" }) === unitOrigin,
    "cross-unit gains must animate from the source unit");
  let handlerCommit = 0;
  let handlerActive = true;
  const handlerState = {
    battle: { allies: [], enemies: [], judgement: null },
  };
  const handlerEvent = {
    id: "stale-judge", success: true,
    commit: () => { handlerCommit += 1; },
  };
  const handlerRun = BattleEffectHandlers.judgement(
    handlerState, handlerEvent, () => {}, () => handlerActive
  );
  handlerActive = false;
  releaseHandler();
  await handlerRun;
  assert(handlerCommit === 0,
    "real judgement handler must not commit after its runtime is cancelled");

  window.CardUtils = { clean: card => ({ ...card }) };
  const responder = { uid: "response-unit", name: "响应角色" };
  const responseState = {
    battle: { allies: [responder], enemies: [], played: [] },
  };
  const flash = { name: "闪", type: "response", suit: "♥" };
  const flashRun = BattleEffectHandlers.response(
    responseState,
    { type: "response", uid: responder.uid, card: flash },
    () => {}, () => true
  );
  releaseHandler();
  await flashRun;
  assert(responseState.battle.played.length === 1,
    "resolved response cards must enter the public turn trail");
  assert(responseState.battle.played[0] !== flash,
    "response trails must store snapshots");
  assert(responseState.battle.played[0]._playedByName === responder.name,
    "response trails must identify the responder");
  assert(responseState.battle.played[0]._playedAction === "使用了",
    "flash responses must use the correct action");

  const drawnCard = {
    name: "响应后摸牌", type: "tactic", suit: "♣", _pendingDraw: true,
  };
  responder.hand = [drawnCard];
  responder.visualHandCount = 1;
  window.state = responseState;
  const countedResponseRun = BattleEffectHandlers.response(
    responseState,
    {
      type: "response", uid: responder.uid, card: flash,
      visualHandBefore: 1, visualHandCount: 0, visualHandDelta: -1,
    },
    () => {}, () => true
  );
  releaseHandler();
  await countedResponseRun;
  assert(responder.visualHandCount === 0,
    "response flights must apply their relative hand-count decrement");
  const followUpDraw = origins.finishDraw({
    type: "drawBatch", uid: responder.uid, side: "ally",
    count: 1, cards: [drawnCard],
  }, () => {}, () => true);
  releaseHandler();
  await followUpDraw;
  assert(responder.visualHandCount === 1 && !drawnCard._pendingDraw,
    "a response follow-up draw must increment the visible hand count on arrival");

  const preResponseDraw = {
    name: "响应前摸牌", type: "tactic", suit: "♦", _pendingDraw: true,
  };
  responder.hand = [preResponseDraw];
  responder.visualHandCount = 1;
  const leadingDraw = origins.finishDraw({
    type: "drawBatch", uid: responder.uid, side: "ally",
    count: 1, cards: [preResponseDraw],
  }, () => {}, () => true);
  releaseHandler();
  await leadingDraw;
  assert(responder.visualHandCount === 2,
    "a draw queued before a response must update the held hand count first");
  const responseAfterDraw = BattleEffectHandlers.response(
    responseState,
    {
      type: "response", uid: responder.uid, card: flash,
      visualHandBefore: 1, visualHandCount: 0, visualHandDelta: -1,
    },
    () => {}, () => true
  );
  releaseHandler();
  await responseAfterDraw;
  assert(responder.visualHandCount === 1,
    "a response after a draw must subtract from the current visible hand count");

  const interceptedCard = {
    name: "被拦截的状态牌", type: "status", suit: "♠", _pendingDraw: true,
  };
  responder.hand = [];
  responder.visualHandCount = 1;
  const interceptedDraw = origins.finishDraw({
    type: "drawBatch", uid: responder.uid, side: "ally",
    count: 1, cards: [interceptedCard],
  }, () => {}, () => true);
  releaseHandler();
  await interceptedDraw;
  assert(responder.visualHandCount === 1,
    "an intercepted incoming card outside the receiver hand must not be counted");

  const playedResponse = {
    name: "佯攻", type: "response", feint: true, suit: "♦",
  };
  const playedResponseRun = BattleEffectHandlers.response(
    responseState,
    { type: "response", uid: responder.uid, card: playedResponse },
    () => {}, () => true
  );
  releaseHandler();
  await playedResponseRun;
  assert(responseState.battle.played[0]._playedAction === "打出了",
    "played response cards must use the correct action");

  for (const playedCard of [
    { name: "弹反", type: "response", deflect: true },
    { name: "后空翻", type: "response", backflip: true },
  ]) {
    const playedRun = BattleEffectHandlers.response(
      responseState,
      { type: "response", uid: responder.uid, card: playedCard },
      () => {}, () => true
    );
    releaseHandler();
    await playedRun;
    assert(responseState.battle.played[0]._playedAction === "打出了",
      `${playedCard.name} responses must be recorded as played`);
  }

  const consumedResponseState = {
    battle: { allies: [responder], enemies: [], played: [], animQueue: [] },
  };
  const consumedResponseRun = BattleEffectHandlers.response(
    consumedResponseState,
    {
      type: "response", id: "cut-response", uid: responder.uid,
      side: "ally", card: flash, pile: "consumed",
    },
    () => {}, () => true
  );
  releaseHandler();
  await consumedResponseRun;
  const consumedExit = consumedResponseState.battle.animQueue[0];
  assert(consumedExit?.type === "burnCard" && consumedExit.fromPublic,
    "consumed responses must burn from the public zone");
  assert(consumedExit?.trailId === "cut-response",
    "consumed response burn events must retain the public trail identity");

  const staleResponseState = {
    battle: { allies: [responder], enemies: [], played: [] },
  };
  let responseActive = true;
  const staleResponseRun = BattleEffectHandlers.response(
    staleResponseState,
    { type: "response", uid: responder.uid, card: flash },
    () => {}, () => responseActive
  );
  responseActive = false;
  releaseHandler();
  await staleResponseRun;
  assert(staleResponseState.battle.played.length === 0,
    "cancelled response animations must not write into stale battles");
}

module.exports = { run };
