const {
  createSpeedAssaultCase, installSpeedAssaultStubs,
} = require("./skill-audit-speed-assault-fixtures");

module.exports = ({ assert, unit }) => {
  const saved = {
    BattleDamageRelics: window.BattleDamageRelics,
    BattleStats: window.BattleStats,
    BertisGerlotSkills: window.BertisGerlotSkills,
    EnemySkills: window.EnemySkills,
    FloraSonicSkinFX: window.FloraSonicSkinFX,
    GuardKellySkills: window.GuardKellySkills,
    MannySkills: window.MannySkills,
    NonokaLokiSkills: window.NonokaLokiSkills,
    SakuraRisaSkills: window.SakuraRisaSkills,
  };
  try {
    installSpeedAssaultStubs();
    const runCase = options => createSpeedAssaultCase(unit, options);

    const lethal = runCase();
    const lethalCommit = lethal.battle.animQueue.at(-1);
    assert(lethalCommit?.type === "battleCommit"
      && lethal.battle.animQueue[0].type === "float",
    "Speed Assault settlement must follow its lethal damage animation");
    assert(lethal.drawn() === 0 && !lethal.actor.faceDown,
      "Speed Assault must not reward or turn face-down before animation commit");
    lethalCommit.commit();
    lethalCommit.commit();
    assert(lethal.drawn() === 6 && lethal.actor.faceDown,
      "A final-enemy direct kill must reward and turn face-down exactly once");

    const chained = runCase({ hp: 5, chainKill: true, phase: 1 });
    assert(chained.battle.animQueue.at(-1)?.type === "battleCommit"
      && chained.battle.animQueue.filter(event =>
        event.type === "float" && event.kind === "damage").length >= 2,
    "Speed Assault settlement must remain after synchronous chain damage");
    chained.battle.animQueue.at(-1).commit();
    assert(chained.drawn() === 0,
      "Chain damage after a nonlethal direct hit must not grant a kill reward");

    const reviving = runCase({ pending: true, phase: 1 });
    reviving.battle.animQueue.at(-1).commit();
    assert(reviving.target.risaRevivePending && reviving.drawn() === 0,
      "A pending-revival lethal hit must not grant a kill reward");

    const stale = runCase();
    const staleCommit = stale.battle.animQueue.at(-1);
    stale.state.battle = {
      phase: 4, allies: [], enemies: [], animQueue: [],
    };
    staleCommit.commit();
    assert(stale.drawn() === 0 && !stale.actor.faceDown,
      "A replaced battle must reject stale Speed Assault settlement");

    const retryable = runCase({ failDrawOnce: true });
    const retryCommit = retryable.battle.animQueue.at(-1);
    const queueBefore = retryable.battle.animQueue.slice();
    let firstError = null;
    try {
      retryCommit.commit();
    } catch (error) {
      firstError = error;
    }
    assert(firstError?.message === "draw failed"
      && retryable.actor.hand.length === 0
      && retryable.actor.deck.length === 12
      && !retryable.actor.shuffleCount
      && retryable.state.random.cursor === 3
      && retryable.state.log[0] === "before"
      && retryable.state.battleLog[0] === "before"
      && retryable.battle.animQueue.length === queueBefore.length
      && retryable.battle.animQueue.every((event, index) =>
        event === queueBefore[index])
      && !retryable.actor.faceDown,
    "A failed Speed Assault draw must roll back cards, effects, and face-down state");
    retryCommit.commit();
    retryCommit.commit();
    assert(retryable.drawAttempts() === 2 && retryable.drawn() === 6
      && retryable.actor.hand.length === 6
      && retryable.actor.deck.length === 6
      && retryable.battle.animQueue.filter(event =>
        event.type === "drawBatch").length === 1
      && retryable.actor.faceDown,
    "Retrying Speed Assault settlement must grant and face-down exactly once");
  } finally {
    Object.assign(window, saved);
  }
};
