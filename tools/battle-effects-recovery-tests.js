/* global BattleEffectHandlers, BattleEffects, BattleFX */
const {
  assert, releasePlay, setPlayFailure, setSettlementError, stateAfterTick,
} = require("./battle-effects-test-harness");

async function run() {
  const state = { view: "battle", battle: { animQueue: [] } };
  const action = BattleEffects.play(state, () => {
    state.battle.animQueue.push({ type: "later" });
    throw new Error("commit failed");
  });
  const idle = BattleEffects.whenIdle();
  releasePlay();
  await action.catch(() => {});
  assert(await stateAfterTick(idle) === "waiting",
    "whenIdle should wait while recovered animation events remain queued");
  await BattleEffects.drain(state, () => {});
  assert(await stateAfterTick(idle) === "resolved",
    "whenIdle should resolve after the recovered queue drains");

  const blockedState = { view: "battle", battle: { animQueue: [] } };
  setSettlementError(new Error("settlement failed"));
  await BattleEffects.drain(blockedState, () => {});
  assert(BattleEffects.settlementBlocked(blockedState),
    "settlement failures should expose a blocked state");
  setSettlementError(null);

  let staleCommits = 0;
  const staleState = { view: "battle", battle: { animQueue: [] } };
  window.state = staleState;
  const staleAction = BattleEffects.play(staleState, () => {
    staleCommits += 1;
    return true;
  });
  const staleIdle = BattleEffects.whenIdle();
  BattleEffects.cancel(staleState);
  window.state = { view: "hall", battle: null };
  setPlayFailure(new Error("stale animation failed"));
  releasePlay();
  const staleResult = await staleAction;
  assert(staleResult === false,
    "cancelled battle animation should report no committed action");
  assert(staleCommits === 0,
    "cancelled battle animation must not commit into the replaced state");
  assert(await stateAfterTick(staleIdle) === "resolved",
    "cancelling a battle should release idle waiters");

  const orphanedState = {
    view: "battle", battle: { animQueue: [{ type: "later" }] },
  };
  window.state = orphanedState;
  BattleEffects.recover(orphanedState);
  window.state = { view: "hall", battle: null };
  assert(await stateAfterTick(BattleEffects.whenIdle()) === "resolved",
    "a queued effect from a replaced state must not block new battle actions");

  let releaseJudgement;
  let staleJudgementCommits = 0;
  BattleEffectHandlers.judgement = async (oldState, event, renderStep, active) => {
    await new Promise(resolve => { releaseJudgement = resolve; });
    if (active()) event.commit();
  };
  const judgementState = {
    view: "battle",
    battle: {
      animQueue: [{
        type: "judgement",
        commit: () => { staleJudgementCommits += 1; },
      }],
    },
  };
  window.state = judgementState;
  const judgementDrain = BattleEffects.drain(judgementState, () => {});
  BattleEffects.cancel(judgementState);
  window.state = { view: "hall", battle: null };
  releaseJudgement();
  await judgementDrain;
  assert(staleJudgementCommits === 0,
    "cancelled delayed handlers must receive an inactive runtime token");

  let releaseReplacedDrain;
  let replacedDrainCommits = 0;
  BattleEffectHandlers.judgement = async (oldState, event, renderStep, active) => {
    await new Promise(resolve => { releaseReplacedDrain = resolve; });
    if (active()) event.commit();
  };
  const replacedDrainState = {
    view: "battle",
    battle: {
      animQueue: [{
        type: "judgement",
        commit: () => { replacedDrainCommits += 1; },
      }],
    },
  };
  window.state = replacedDrainState;
  const replacedDrain = BattleEffects.drain(replacedDrainState, () => {});
  const replacedDrainIdle = BattleEffects.whenIdle();
  await Promise.resolve();
  window.state = { view: "hall", battle: null };
  releaseReplacedDrain();
  await replacedDrain;
  assert(replacedDrainCommits === 0,
    "state replacement must invalidate an in-flight effect handler");
  assert(await stateAfterTick(replacedDrainIdle) === "resolved",
    "state replacement during effect draining must release existing idle waiters");

  let sealedEvents = 0;
  BattleEffectHandlers.sealCards = async () => { sealedEvents += 1; };
  const sealState = {
    view: "battle", battle: { animQueue: [{ type: "sealCards" }] },
  };
  window.state = sealState;
  await BattleEffects.drain(sealState, () => {});
  assert(sealedEvents === 1,
    "seal-card events must use the shared card movement animation path");

  const hitOrder = [];
  BattleEffectHandlers.applyVisual = () => {
    hitOrder.push("render");
    return false;
  };
  BattleFX.slashHit = () => { hitOrder.push("slash"); };
  BattleFX.popFloats = () => { hitOrder.push("bump"); };
  const hitState = {
    view: "battle",
    battle: {
      animQueue: [{
        type: "float", id: "hit-order", uid: "target",
        kind: "damage", damageTypes: ["physical"],
      }],
    },
  };
  window.state = hitState;
  await BattleEffects.drain(hitState, () => {});
  assert(hitOrder.indexOf("render") < hitOrder.indexOf("bump"),
    "damage shake must start on the post-damage render instead of a replaced node");

  hitOrder.length = 0;
  const doomed = { uid: "doomed", hp: 0 };
  const fatalState = {
    view: "battle",
    battle: {
      allies: [], enemies: [doomed],
      animQueue: [{
        type: "float", id: "fatal-hit-order", uid: doomed.uid,
        kind: "damage", visualHp: 0, damageTypes: ["physical"],
      }],
    },
  };
  window.state = fatalState;
  await BattleEffects.drain(fatalState, () => {});
  assert(hitOrder.indexOf("bump") < hitOrder.indexOf("render"),
    "fatal damage must show its hit reaction before death rendering");

  let clearedBumps = 0;
  BattleFX.clearBumps = () => { clearedBumps += 1; };
  BattleEffects.recover(fatalState);
  assert(clearedBumps === 1,
    "battle recovery must clear tracked hit reactions");
}

module.exports = { run };
