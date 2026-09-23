window.BattleStats = (() => {
  const blank = () => ({ damage: 0, healing: 0, kills: 0, cards: 0, responses: 0 });
  const allUnits = battle => (battle?.allies || []).concat(battle?.enemies || []);

  function ensure(battle, unit) {
    if (!battle || !unit?.uid) return null;
    battle.performance ||= {};
    battle.performance[unit.uid] ||= blank();
    return battle.performance[unit.uid];
  }

  function cardPlayed(battle, actor) {
    const stats = ensure(battle, actor);
    if (stats) stats.cards += 1;
  }

  function responded(battle, actor) {
    const stats = ensure(battle, actor);
    if (stats) stats.responses += 1;
  }

  function damage(battle, actor, target, amount, hpBefore) {
    if (!battle || !actor || !target || actor.side === target.side || amount <= 0) return;
    const stats = ensure(battle, actor);
    if (!stats) return;
    stats.damage += Math.min(amount, Math.max(0, hpBefore ?? amount));
    const revived = window.SakuraRisaSkills?.pendingRevival?.(target);
    if (hpBefore > 0 && target.hp <= 0 && !revived) stats.kills += 1;
  }

  function heal(battle, actor, amount) {
    const stats = ensure(battle, actor);
    if (stats && amount > 0) stats.healing += amount;
  }

  function score(stats) {
    return Math.round(
      stats.damage
      + stats.healing * 0.85
      + stats.kills * 10
      + stats.responses * 2
      + stats.cards * 0.5,
    );
  }

  function title(stats) {
    if (stats.kills > 0 && stats.kills * 10 >= stats.damage * 0.4) return "终结者";
    if (stats.healing > stats.damage) return "治疗核心";
    if (stats.responses >= 2 && stats.responses * 2 >= stats.cards) return "防守支柱";
    if (stats.damage > 0) return "输出核心";
    return "战场支援";
  }

  function ranking(battle) {
    return (battle?.allies || []).map(unit => {
      const stats = ensure(battle, unit) || blank();
      return { unit, stats: { ...stats }, score: score(stats), title: title(stats) };
    }).sort((a, b) =>
      b.score - a.score
      || b.stats.damage - a.stats.damage
      || b.stats.healing - a.stats.healing
      || b.stats.kills - a.stats.kills
      || a.unit.uid.localeCompare(b.unit.uid),
    ).map((entry, index) => ({ ...entry, rank: index + 1, isMvp: index === 0 }));
  }

  function initialize(battle) {
    allUnits(battle).forEach(unit => ensure(battle, unit));
  }

  return { initialize, cardPlayed, responded, damage, heal, ranking };
})();
