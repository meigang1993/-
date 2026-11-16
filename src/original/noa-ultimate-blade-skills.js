// 怪面诺亚【终极刀魔】（主动技，出牌阶段限一次）：
//   发动后给「下一张实体单体【杀】」挂预约；该杀结算后按本回合已使用的
//   实体单体【杀】牌数 X（含当前这张）额外结算 X 次。群体实体杀不触发本技能，
//   也不计入 X。逐张独立结算，原目标阵亡时把剩余次数转给另一名存活敌方。
//   转移攻击直接复用【红缨连鬼斩】导出的通用虚拟杀链执行器
//   （ChiyoChainSkills.run / resume），同一判定源、同一探针、同一候选池口径。
window.NoaUltimateBladeSkills = (() => {
  const PLAY_PHASE = 4;
  const SKILL = "终极刀魔";
  const CHAIN_KEY = "noaUltimateChain";
  const alive = unit => !!unit && unit.hp > 0;
  const isNoa = unit => alive(unit) && unit.ref === "noa";
  const log = (state, text) => window.BattleLog?.add?.(state, text);

  function canUse(actor) {
    return isNoa(actor) && !actor.usedUltimateBlade
      && !actor.noaUltimateBladePending;
  }

  // 主动发动：只挂预约，不立即结算。执行块兜底守卫与狂战意志同口径
  // （正常链路 useCard → CharacterSkillAccess.canResolve 已判 phase + 本人行动）；
  // 守卫失败返回 true 而非 false，避免 resolveCard 继续走普通牌兜底把技能卡移出手牌。
  function handleSpecialCard(state, actor, target, card) {
    if (!card?.ultimateBlade) return false;
    const b = state?.battle;
    if (b && ((b.phase != null && b.phase !== PLAY_PHASE)
      || (b.activeUid != null && actor?.uid != null
        && b.activeUid !== actor.uid))) return true;
    if (!canUse(actor)) return true;
    actor.usedUltimateBlade = true;
    actor.noaUltimateBladePending = true;
    actor.noaUltimateBladeTurn = b?.turn ?? null;
    window.BattleLines?.skill?.(state, actor, SKILL);
    log(state, `${actor.name} 发动${SKILL}，令下一张实体单体【杀】额外结算本回合已用实体单体【杀】牌数次。`);
    return true;
  }

  // 本回合已使用的实体单体【杀】牌数：以出牌后钩子为准，与预约触发条件同源
  // （isEntitySingleKill）。链产生的虚拟杀带 skipAfterCardPlayed，不进钩子、不计入，
  // 避免自激放大 X。
  function afterCardPlayed(state, actor, target, card) {
    const b = state?.battle;
    if (!b || !isNoa(actor) || card?._noaUltimateVirtual) return;
    // X 只统计「本回合已使用的实体单体【杀】牌」：群体实体杀不触发本技能，
    // 也不给 X 灌水；技能生成的虚拟杀（淫气改造咬杀、螺旋桨、混乱、外神之眼、
    // 连鬼斩等）不带 skipAfterCardPlayed，会走
    // useVirtualKill → useCard → finalizeUse → runHooks 进到本钩子；它们是
    // 技能效果而非玩家使用的杀牌，计入会把额外结算次数凭空放大。
    // isCountedKill 同时是 X 计数与预约消耗的唯一判据。与 CardUtils.isEntityCard
    // 同口径：饰品主动技把实体手牌 convertAs 成的【魅杀】等牌带 _entityConversion，
    // 仍是玩家使用的实体单体杀牌，计入 X 也消耗预约；其余技能生成的牌一律排除。
    const isCountedKill = !!card && !!window.CardUtils?.isEntitySingleKill?.(card)
      && !card.generatedBySkill
      && (!card._skill || !!card._entityConversion);
    if (isCountedKill) {
      if (actor.noaSlashTurn !== b.turn) {
        actor.noaSlashTurn = b.turn;
        actor.noaSlashCount = 0;
      }
      actor.noaSlashCount = (actor.noaSlashCount || 0) + 1;
    }
    if (!actor.noaUltimateBladePending) return;
    // 预约与 X 同源：战术牌 / 群体杀 / 虚拟杀 / 技能生成的非转换实体杀都不消耗预约，
    // 预约继续等下一张真正计入 X 的实体单体【杀】（含饰品转换杀）。
    if (!isCountedKill) return;
    if (actor.noaUltimateBladeTurn !== b.turn) {
      delete actor.noaUltimateBladePending;
      delete actor.noaUltimateBladeTurn;
      return;
    }
    delete actor.noaUltimateBladePending;
    delete actor.noaUltimateBladeTurn;
    const times = actor.noaSlashCount || 0;
    if (times <= 0) return;
    log(state, `${actor.name} 的${SKILL}生效：本回合已使用${times}张实体单体【杀】，此【杀】额外结算${times}次。`);
    const chain = {
      actorUid: actor.uid, side: actor.side,
      targetUid: alive(target) ? target.uid : null,
      remaining: times, turn: b.turn,
      skillName: SKILL, word: "结算", chainKey: CHAIN_KEY,
      marker: "_noaUltimateVirtual",
    };
    // 钩子跑到本模块时战斗可能已被前一个钩子挂起：先存链，解锁后由 resume 补跑，
    // 否则这一串额外结算整段丢失。
    if (b.locked) { b[CHAIN_KEY] = chain; return; }
    window.ChiyoChainSkills?.run?.(state, chain);
  }

  // 中断恢复（玩家响应 / 交牌 / 泡泡 / 霹雳之锤）后补跑剩余链。
  // 通用执行器自带「跨回合 / 战斗结束 / 出牌者阵亡作废」守卫，重复调用幂等。
  function resume(state) {
    const chain = state?.battle?.[CHAIN_KEY];
    if (!chain || chain.remaining <= 0) return;
    window.ChiyoChainSkills?.resume?.(state, CHAIN_KEY);
  }

  return { canUse, handleSpecialCard, afterCardPlayed, resume, PLAY_PHASE };
})();
