window.BattleEnemyTurn = ({ wait, autoEnemy }) => {
  const thinkingTasks = new WeakMap();
  const actingBattles = new WeakSet();
  let thinkingSequence = 0;

  async function runEnemyPlayPhase(
    state, unit, onStep, think = false, actionCurrent = null,
  ) {
    const turnBattle = state.battle;
    const runtimeCurrent = actionCurrent
      || window.AppRuntimeErrors?.guard?.(state) || (() => true);
    const current = () => runtimeCurrent()
      && (!window.state || window.state === state);
    const ownsTurn = () => current() && state.battle === turnBattle
      && state.battle?.activeUid === unit.uid;
    const interrupted = () => window.BattleReactionQueue?.pending?.(state.battle)
      ?? !!(state.battle?.kaiichiShare || state.battle?.kaiichiShareQueue?.length);
    const canAct = () => unit.hp > 0 || window.SakuraRisaSkills?.pendingRevival?.(unit);
    if (!ownsTurn() || interrupted() || actingBattles.has(turnBattle)) return false;
    const task = ++thinkingSequence;
    thinkingTasks.set(turnBattle, task);
    const ownsTask = () => thinkingTasks.get(turnBattle) === task;
    const releaseTask = () => {
      if (!ownsTask()) return false;
      thinkingTasks.delete(turnBattle);
      return true;
    };
    const clearThinking = () => {
      if (!ownsTask() || turnBattle?.thinkingUid !== unit.uid) return false;
      turnBattle.thinkingUid = null;
      if (current() && state.battle === turnBattle && onStep) onStep();
      return true;
    };
    if (think) {
      turnBattle.thinkingUid = unit.uid;
      if (onStep) onStep();
      await wait(2000);
      if (!ownsTask() || !ownsTurn() || state.battle.locked || interrupted() || !canAct()) {
        clearThinking();
        releaseTask();
        return false;
      }
    }
    if (!ownsTask()) return false;
    if (!clearThinking() && onStep) onStep();
    actingBattles.add(turnBattle);
    try {
      await autoEnemy(state, unit, onStep, current);
      // A lethal reaction ends this play phase, but the dead enemy still needs turn cleanup.
      return !!(ownsTurn() && !state.battle.locked && !interrupted());
    } finally {
      actingBattles.delete(turnBattle);
      releaseTask();
    }
  }
  return { runEnemyPlayPhase };
};
