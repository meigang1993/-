window.SakuraRisaSkills = (() => {
  const visible = unit => (unit?.hand || []).filter(card => !card._pendingDraw);
  const isRisa = unit =>
    unit?.id === "assassin_sakura_risa" || unit?.ai === "assassin_sakura_risa";
  const hasRelic = (state, unit, name) =>
    window.RelicSystem?.hasEquipped?.(state, unit, name);
  const sameSide = (battle, unit) =>
    unit?.side === "enemy" ? battle.enemies : battle.allies;
  const foesOf = (battle, unit) =>
    unit?.side === "enemy" ? battle.allies : battle.enemies;
  const responseCount = unit =>
    visible(unit).filter(card => card.type === "response").length;
  // 研究所【快速复生】按新稿只在「下个回合开始时」判队友存活，死亡瞬间不再判。
  // 但如果队友已经全灭，待复活标记不能继续挡住「敌人全灭 → 胜利」结算，
  // 否则最后一只怪倒下后战斗会被挂起一个回合（胜负链 / 回合流转都读本函数）。
  // 这里只做胜负口径兜底，不改写单位状态，也不改变复活条件本身。
  const pendingRevival = unit => !!unit?.risaRevivePending
    || (!!window.TenriInstituteSkills?.pendingRevival?.(unit)
      && window.TenriInstituteSkills?.shouldHoldRevival?.(unit) !== false);
  const aliveForBattle = unit => !!unit && (unit.hp > 0 || pendingRevival(unit));
  const battleSettling = battle => !!(battle?.pendingVictory || battle?.pendingDefeat
    || battle?.victoryScreen || battle?.defeat || battle?.testComplete);
  const shared = {
    isRisa, responseCount, pendingRevival, aliveForBattle, hasRelic,
    sameSide, foesOf, battleSettling,
  };

  const api = {
    isRisa, responseCount, pendingRevival, aliveForBattle,
    ...window.SakuraRisaCombatSkills(shared),
    ...window.SakuraRisaLifecycleSkills(shared),
  };
  // 免死统一入口：研究所【快速复生】与不死食尸鬼共用全项目 preventDeath 挂点。
  const basePreventDeath = api.preventDeath;
  api.preventDeath = (state, unit) =>
    !!window.TenriInstituteSkills?.preventDeath?.(state, unit)
    || !!basePreventDeath?.(state, unit);
  return api;
})();
