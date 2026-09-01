window.SakuraRisaLifecycleSkills = ({
  isRisa, pendingRevival, aliveForBattle, sameSide, hasRelic,
}) => {
  function playPhaseStart(state, unit, random = () => window.GameRandom.value(state)) {
    return window.SakuraRisaEye?.playPhaseStart?.(state, unit, random) || null;
  }

  function resolveEyeChoice(state, choice, random = () => window.GameRandom.value(state)) {
    return window.SakuraRisaEye?.resolveChoice?.(state, choice, random) || false;
  }

  function confirmEyeResult(state) {
    return window.SakuraRisaEye?.confirmResult?.(state) || false;
  }

  function drawRecipient(unit, battle) {
    const mark = battle?.risaEye;
    if (!mark || battle.phase !== 4 || battle.activeUid !== unit?.uid || mark.targetUid !== unit.uid) return unit;
    return battle.allies.concat(battle.enemies)
      .find(owner => owner.uid === mark.ownerUid && aliveForBattle(owner)) || unit;
  }

  function onDrawRedirected(battle, from, to, count) {
    const state = window.state;
    if (!count || !state || state.battle !== battle || from === to) return;
    window.BattleLog.add(state, `${from.name} 出牌阶段摸到的${count}张牌被吸魔邪眼转交给${to.name}。`);
  }

  function playPhaseEnd(state, unit) {
    if (state?.battle?.risaEye?.targetUid === unit?.uid) state.battle.risaEye = null;
  }

  function preventDeath(state, unit) {
    if (!state?.battle || !isRisa(unit) || unit.hp > 0
      || pendingRevival(unit) || !unit.hand?.length) return false;
    unit.risaRevivePending = true;
    unit.statuses ||= [];
    if (!unit.statuses.includes("待复活")) unit.statuses.push("待复活");
    window.BattleLines?.skill(state, unit, "不死食尸鬼");
    window.BattleLog.add(state, `${unit.name} 生命降至0，但仍有手牌，不死食尸鬼使其等待下个回合复活。`);
    return true;
  }

  function beginTurn(state, unit) {
    if (!pendingRevival(unit)) return false;
    unit.risaRevivePending = false;
    unit.hp = unit.maxHp;
    unit.statuses = (unit.statuses || []).filter(status => status !== "待复活");
    delete unit.deathDiscarded;
    window.BattleSystem?.pushFloat?.(state.battle, unit.uid, "heal", unit.maxHp);
    window.EnemySkills?.onHeal?.(state, window.BattleSystem?.draw);
    window.BattleLines?.skill(state, unit, "不死食尸鬼");
    window.BattleLog.add(state, `${unit.name} 的不死食尸鬼触发，恢复全部生命并继续行动。`);
    return true;
  }

  function afterDamage(state, target, hpLoss, draw) {
    if (!hpLoss || target?.gender !== "female" || !state?.battle) return;
    const team = sameSide(state.battle, target);
    team.filter(holder => aliveForBattle(holder)
      && hasRelic(state, holder, "写给艾尔拉娜的情书")).forEach(holder => {
      const entries = team.filter(unit => aliveForBattle(unit) && unit.gender === "female")
        .map(unit => ({ unit, cards: draw?.(unit, 1, state.battle) }));
      window.BattleLines?.skill(state, holder, "写给艾尔拉娜的情书", target);
      window.BattleLog.add(state, `${holder.name} 的写给艾尔拉娜的情书触发，${window.BattleDrawFeedback.team(entries, 1, "我方全体女性角色")}。`);
    });
  }

  return {
    playPhaseStart, playPhaseEnd, resolveEyeChoice, confirmEyeResult,
    drawRecipient, onDrawRedirected, preventDeath, beginTurn, afterDamage,
  };
};
