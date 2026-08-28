const assert = require("assert");

const logs = [];
const discards = [];
global.window = {
  BattleLog: { add(_state, text) { logs.push(text); } },
  BattleCards: {
    put(_battle, unit, card, zone) {
      discards.push({ unit: unit.uid, card: card.name, zone });
    },
    visibleHandCount(unit) {
      return (unit?.hand || []).filter(card => !card._pendingDraw).length;
    },
    queueResponse(battle, holder, event, before,
      after = this.visibleHandCount(holder)) {
      if (before !== after) {
        if (holder && holder.visualHandCount == null) {
          holder.visualHandCount = before;
        }
        Object.assign(event, {
          visualHandBefore: before,
          visualHandCount: after,
        });
      }
      battle?.animQueue?.push(event);
      return event;
    },
  },
  NonokaLokiSkills: { afterCardResponded() {} },
  CardUtils: {
    isKillCard: card => card?.type === "slash",
    canRespondTo: (_rule, card) => card?.type === "response",
  },
  FloraCarlosSkills: {
    queueSpeedAssaultSettlement(state, card) {
      const settlement = card?._speedAssaultSettlement;
      if (!settlement || settlement.queued
        || state.battle !== settlement.battle) return false;
      settlement.queued = true;
      state.battle.animQueue.push({ type: "battleCommit" });
      return true;
    },
  },
};
require("../src/original/game-random.js");
require("../src/original/witherer-relic-skills.js");
require("../src/original/witherer-skills.js");
require("../src/original/battle-thunder-hammer-response.js");
require("../src/original/battle-dodge-cards.js");
require("../src/original/battle-dodge-resume.js");
require("../src/original/battle-dodge-auto-response.js");
require("../src/original/battle-dodge-response.js");
require("../src/original/battle-damage-response.js");
window.UICommon = { esc: value => String(value), card: card => card.name };
require("../src/original/battle-response-ui.js");

const values = { 石头: 0.1, 剪刀: 0.4, 布: 0.8 };
const wins = new Set(["石头|剪刀", "剪刀|布", "布|石头"]);
function withRandom(sequence, fn) {
  const original = Math.random;
  let i = 0;
  Math.random = () => sequence[Math.min(i++, sequence.length - 1)];
  try { return fn(); } finally { Math.random = original; }
}
function direct(choice, enemyChoice) {
  let damageCount = 0;
  const result = withRandom([values[enemyChoice]], () => window.WithererSkills.deflect(
    {}, { name: "守方" }, { name: "攻方" }, 5, "杀", {}, () => { damageCount += 1; }, choice
  ));
  return { result, damageCount };
}

["石头", "剪刀", "布"].forEach(choice => {
  ["石头", "剪刀", "布"].forEach(enemyChoice => {
    const { result, damageCount } = direct(choice, enemyChoice);
    const key = `${choice}|${enemyChoice}`;
    assert.strictEqual(result, choice === enemyChoice ? null : wins.has(key), `unexpected outcome for ${key}`);
    assert.strictEqual(damageCount, wins.has(key) ? 1 : 0, `unexpected reflected damage for ${key}`);
  });
});

logs.length = 0;
let autoDamage = 0;
const autoResult = withRandom([0.1, 0.1, 0.4, 0.4, 0.8, 0.1], () => window.WithererSkills.deflect(
  {}, { name: "守方" }, { name: "攻方" }, 5, "杀", {}, () => { autoDamage += 1; }
));
assert.strictEqual(autoResult, true);
assert.strictEqual(autoDamage, 1);
assert.strictEqual(logs.filter(text => text.includes("平局，重新猜拳")).length, 2);

function manualHarness() {
  const attack = { name: "杀", type: "slash" };
  const normalResponse = { name: "闪", type: "response", suit: "♥" };
  const response = { name: "弹反", type: "response", deflect: true, suit: "♠" };
  const actor = { uid: "enemy", side: "enemy", name: "攻方", hp: 10, hand: [] };
  const target = { uid: "ally", side: "ally", name: "守方", hp: 10, hand: [normalResponse, response] };
  const state = {
    settings: { manualResponse: true },
    battle: {
      enemies: [actor], allies: [target], locked: true, animQueue: [],
      manualDodge: { actorUid: actor.uid, targetUid: target.uid, amount: 5, source: "杀", card: attack, selectedIndex: 1 },
    },
  };
  const events = [];
  const api = window.BattleDamageResponses({
    deps: { isKillCard: card => card?.type === "slash", nextAnim: () => 1 },
    ctx: { allUnits: b => b.enemies.concat(b.allies), hasSkill: () => false, checkEnd() {}, clearSelection() {} },
    canDodge: (_card, candidate) => candidate?.type === "response",
    damage() { events.push({ type: "reflect", responseInHand: target.hand.includes(response) }); },
    hitWithoutDodge() { events.push({ type: "hit", responseInHand: target.hand.includes(response) }); },
    finalizeDamage() { events.push({ type: "finalize" }); },
    triggers: { afterDodged() { events.push({ type: "dodged" }); } },
  });
  return { api, state, actor, target, response, events };
}

const forcedFlow = manualHarness();
forcedFlow.state.settings.manualResponse = false;
assert.strictEqual(forcedFlow.api.shouldManualDodge(forcedFlow.state, forcedFlow.actor, forcedFlow.target, { name: "杀", type: "slash" }, forcedFlow.response), true);
forcedFlow.api.queueManualDodge(forcedFlow.state, forcedFlow.actor, forcedFlow.target, 5, "杀", { name: "杀", type: "slash" }, 1, true);
const forcedPrompt = window.BattleResponseUI.manualDodgePrompt(forcedFlow.state.battle);
const forcedHand = window.BattleResponseUI.responseHand(forcedFlow.state.battle);
assert(forcedPrompt.includes("选择弹反手势"));
assert(!forcedPrompt.includes("data-manual-dodge-cancel"));
assert(forcedHand.includes("data-hand-owner"));
assert(forcedHand.includes("disabled"));
assert(!forcedHand.includes("data-manual-dodge-cancel"));
assert.strictEqual(forcedFlow.api.resolveManualDodge(forcedFlow.state, false, 0), false);
assert.strictEqual(forcedFlow.state.battle.locked, true);

discards.length = 0;
const winFlow = manualHarness();
const tieResolved = withRandom([values.石头], () => winFlow.api.resolveManualDodge(winFlow.state, true, 1, "石头"));
assert.strictEqual(tieResolved, true);
assert.strictEqual(winFlow.target.hand.length, 2);
assert.strictEqual(discards.length, 0);
assert.strictEqual(winFlow.events.length, 0);
assert.strictEqual(winFlow.state.battle.locked, true);
assert(winFlow.state.battle.manualDodge);
assert.strictEqual(winFlow.state.battle.manualDodge.deflectStarted, true);
assert.strictEqual(winFlow.state.battle.manualDodge.deflectResult.outcome, "tie");
const tiePrompt = window.BattleResponseUI.manualDodgePrompt(winFlow.state.battle);
assert(tiePrompt.includes("弹反猜拳结果"));
assert(tiePrompt.includes("守方") && tiePrompt.includes("攻方") && tiePrompt.includes("平局"));
assert(tiePrompt.includes("data-deflect-result-confirm"));
assert(!tiePrompt.includes("data-manual-dodge-cancel"));
assert.strictEqual(winFlow.api.resolveManualDodge(winFlow.state, false, 0), false);
assert.strictEqual(winFlow.target.hand.length, 2);
assert.strictEqual(winFlow.state.battle.locked, true);
assert.strictEqual(winFlow.api.confirmDeflectResult(winFlow.state), true);
assert.strictEqual(winFlow.state.battle.manualDodge.deflectResult, null);
assert(window.BattleResponseUI.manualDodgePrompt(winFlow.state.battle).includes("平局，再次选择手势"));

withRandom([values.剪刀], () => winFlow.api.resolveManualDodge(winFlow.state, true, 0, "石头"));
assert.strictEqual(winFlow.state.battle.manualDodge.deflectResult.outcome, "defender");
assert.strictEqual(winFlow.target.hand.length, 2);
assert.strictEqual(discards.length, 0);
assert.strictEqual(winFlow.events.length, 0);
const winPrompt = window.BattleResponseUI.manualDodgePrompt(winFlow.state.battle);
assert(winPrompt.includes("守方弹反成功") && winPrompt.includes("石头") && winPrompt.includes("剪刀"));
assert.strictEqual(winFlow.api.confirmDeflectResult(winFlow.state), true);
assert.strictEqual(winFlow.target.hand.length, 1);
assert.strictEqual(winFlow.target.hand[0].name, "闪");
assert.strictEqual(discards.length, 1);
assert.deepStrictEqual(
  winFlow.state.battle.animQueue.map(event =>
    [event.type, event.visualHandBefore, event.visualHandCount]),
  [["response", 2, 1]],
);
assert.deepStrictEqual(winFlow.events.map(event => event.type), ["reflect", "dodged"]);
assert.strictEqual(winFlow.events[0].responseInHand, false);
assert.strictEqual(winFlow.state.battle.locked, false);
assert.strictEqual(winFlow.state.battle.manualDodge, null);
assert.strictEqual(winFlow.api.resolveManualDodge(winFlow.state, true, 0, "石头"), false);
assert.strictEqual(discards.length, 1);

discards.length = 0;
const loseFlow = manualHarness();
withRandom([values.布], () => loseFlow.api.resolveManualDodge(loseFlow.state, true, 1, "石头"));
assert.strictEqual(loseFlow.state.battle.manualDodge.deflectResult.outcome, "actor");
assert.strictEqual(loseFlow.target.hand.length, 2);
assert.strictEqual(discards.length, 0);
assert.strictEqual(loseFlow.events.length, 0);
assert(window.BattleResponseUI.manualDodgePrompt(loseFlow.state.battle).includes("攻方获胜，弹反失败"));
assert.strictEqual(loseFlow.api.confirmDeflectResult(loseFlow.state), true);
assert.strictEqual(loseFlow.target.hand.length, 1);
assert.strictEqual(loseFlow.target.hand[0].name, "闪");
assert.strictEqual(discards.length, 1);
assert.deepStrictEqual(loseFlow.events.map(event => event.type), ["hit", "finalize"]);
assert.strictEqual(loseFlow.events[0].responseInHand, false);
assert.strictEqual(loseFlow.state.battle.locked, false);
assert.strictEqual(loseFlow.state.battle.manualDodge, null);

discards.length = 0;
const autoFlow = manualHarness();
autoFlow.state.battle.manualDodge = null;
autoFlow.state.battle.locked = false;
const autoDodgeResult = withRandom([0.1, 0.1, 0.8, 0.1], () => autoFlow.api.autoDodge(
  autoFlow.state, autoFlow.actor, autoFlow.target, 5, "杀", { name: "杀", type: "slash" }, autoFlow.response
));
assert.strictEqual(autoDodgeResult, true);
assert.strictEqual(autoFlow.target.hand.includes(autoFlow.response), false);
assert.strictEqual(discards.length, 1);
assert.deepStrictEqual(autoFlow.events.map(event => event.type), ["reflect", "dodged"]);
assert.strictEqual(autoFlow.events[0].responseInHand, false);

discards.length = 0;
const assaultFlow = manualHarness();
assaultFlow.state.battle.manualDodge.card._speedAssaultSettlement = {
  battle: assaultFlow.state.battle, queued: false,
};
assert.strictEqual(
  assaultFlow.api.resolveManualDodge(assaultFlow.state, true, 0), true);
assert.deepStrictEqual(
  assaultFlow.state.battle.animQueue.map(event => event.type),
  ["response", "battleCommit"],
);

console.log("Deflect flow tests passed: 9 outcomes, repeated ties, manual/auto response, forced continuation, single consumption, damage ordering, delayed assault settlement");
