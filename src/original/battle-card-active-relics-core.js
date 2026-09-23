window.BattleCardActiveRelicsCore = (deps, ctx) => {
  const log = (state, text) => window.BattleLog.add(state, text);
  const isRepeat = card => !!card?._repeat;
  const alreadyUsed = (actor, flag, card) => actor[flag] && !isRepeat(card);
  const markUsed = (actor, flag, card) => {
    if (!isRepeat(card)) actor[flag] = true;
  };
  const teamOf = (battle, unit) => {
    if (battle?.allies?.includes(unit)) return battle.allies;
    if (battle?.enemies?.includes(unit)) return battle.enemies;
    return null;
  };
  const validRelicActor = (state, actor, relic) => actor?.hp > 0
    && !!teamOf(state?.battle, actor)
    && !!window.RelicSystem?.hasEquipped?.(state, actor, relic);
  const livingOpponent = (battle, actor, target) => {
    const team = teamOf(battle, actor);
    const targetTeam = teamOf(battle, target);
    return target?.hp > 0 && !!team && !!targetTeam && team !== targetTeam;
  };
  const run = (first, second) => {
    const done = first();
    if (typeof second === "function" && done !== false) second();
    return true;
  };
  return {
    log, isRepeat, alreadyUsed, markUsed,
    teamOf, validRelicActor, livingOpponent, run,
  };
};
