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

  // 时停：不死食尸鬼归属「樱羽丽莎本人」，被标记时免死失效。
  // 它是死亡结算里触发的（battle-damage-hit / battle-damage-lifecycle /
  // battle-card-specials 三处调用点），跳过回合挡不住，必须在技能内部判。
  // 时停模块在本文件之前的同一 bundle（battle-skills 位置 18 < 62），必然已装配。
  const stopped = unit => !!window.MieryulaTimeStop?.isSkillDisabled?.(unit);

  function preventDeath(state, unit) {
    if (!state?.battle || !isRisa(unit) || unit.hp > 0
      || pendingRevival(unit) || !unit.hand?.length) return false;
    if (stopped(unit)) return false;
    unit.risaRevivePending = true;
    unit.statuses ||= [];
    if (!unit.statuses.includes("待复活")) unit.statuses.push("待复活");
    window.BattleLines?.skill(state, unit, "不死食尸鬼");
    window.BattleLog.add(state, `${unit.name} 生命降至0，但仍有手牌，不死食尸鬼使其等待下个回合复活。`);
    return true;
  }

  function beginTurn(state, unit) {
    // pendingRevival 是研究所【快速复生】与不死食尸鬼共用的包装判据：它对
    // 挂着 tenriRevivePending 的食尸鬼同样返回 true。回合开始对**每个单位**都会
    // 调用本函数，缺少 isRisa 守卫时，一旦研究所的 beginTurn 因任何原因尚未清掉
    // 标记（同一回合重复进准备流程 / 手动响应续跑），食尸鬼就会被当成丽莎满血
    // 复活并播「不死食尸鬼」台词。两条复活链必须按归属互斥。
    if (!pendingRevival(unit) || !isRisa(unit)) return false;
    // 与研究所【快速复生】同口径：maxHp 走血量模块的统一取值，旧档 / 测试构造
    // 里 unit.maxHp 缺失时不会把 hp 写成 undefined。
    const maxHp = window.BattleHpValue?.maxHp?.(unit)
      ?? unit.maxHp ?? unit.stats?.maxHp ?? unit.hp;
    unit.risaRevivePending = false;
    unit.hp = maxHp;
    // 死亡伤害浮字会把 visualHp 写回 0，而单位卡按 visualHp ?? hp 渲染。
    // 只改 hp 会出现「已经满血、单位卡仍是灰化死亡态」，且 deathShown /
    // deathAnimationPending 不会被 isDead=false 分支清掉（UI 只在非死亡时清）。
    unit.visualHp = maxHp;
    unit.visualBlock = unit.block || 0;
    unit.visualDefense = unit.defenseSystem || 0;
    unit.statuses = (unit.statuses || []).filter(status => status !== "待复活");
    delete unit.deathDiscarded;
    delete unit.deathShown;
    delete unit.deathAnimationPending;
    delete unit.deferredDeathVisual;
    window.BattleSystem?.pushFloat?.(state.battle, unit.uid, "heal", maxHp);
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
