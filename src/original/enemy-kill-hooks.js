window.EnemyKillHooks = ({ black, hasSkill, drawJudge }) => {
  const groupKill = card =>
    !!(card?.sweep || card?.allTargets || card?.aoeLineShown);

  function prioritizeGroupJudgement(state, card, result) {
    if (!groupKill(card) || !result?.event) return;
    const queue = state.battle?.animQueue;
    const currentIndex = queue?.indexOf(result.event) ?? -1;
    if (currentIndex < 0) return;
    const targetUids = new Set(card.targetUids || card.allTargets || []);
    const settlementIndex = queue.findIndex((event, index) =>
      index < currentIndex && event.type === "float"
      && (!targetUids.size || targetUids.has(event.uid))
      && /^(damage|hp-loss|armor|armor-break|defense|defense-break)$/
        .test(event.kind || ""));
    if (settlementIndex < 0) return;
    queue.splice(currentIndex, 1);
    queue.splice(settlementIndex, 0, result.event);
  }

  // 时停：被标记角色的技能失效。判据按「归属方」区分——
  // minotaurDefense 是 target（被打者）的锁定技，minotaurRage 与其余是 actor（出杀者）的技能，
  // 各自按自己那一方判定，避免误伤未被标记的另一方。
  const tsStopped = unit => !!window.MieryulaTimeStop?.isSkillDisabled?.(unit);

  function beforeKillUsed(state, actor, card) {
    if (!actor || !card || tsStopped(actor)) return;
    window.BakarSkills?.beforeKillTargeted?.(state, actor, card);
    window.RuinsEnemySkills?.beforeKillUsed?.(state, actor, card);
    // 【圣鹰剑】旧版「手握闪则杀不可响应」已重做为「同目标下一张单体杀伤害翻倍」，
    // 效果改在统一伤害链结算，这里不再写 ignoreResponse。
  }

  function beforeKillTargeted(state, actor, target, card, options = {}) {
    if (!actor || !target || !card) return;
    const actorStopped = tsStopped(actor);
    const targetStopped = tsStopped(target);
    if (!options.targetOnly) beforeKillUsed(state, actor, card);
    if (!actorStopped) {
    window.SakuraRisaSkills?.beforeKillTargeted?.(state, actor, target, card);
    window.UnderwaterTrainSkills?.beforeKillTargeted?.(state, actor, target, card);
    if (actor.ai === "krow_doctor" && target.gender === "female") {
      card.krowFemaleTarget = true;
      window.BattleLines?.skill(state, actor, "肉欲之欢");
    }
    if (hasSkill(actor, "红缨连鬼斩") && hasSkill(actor, "心眼拔刀术")) {
      chiyoSlash(state, actor, target, card);
    }
    if (actor.ai === "pursuer_edis") {
      window.EdisSkills?.beforeSlash?.(state, actor, target, card);
    }
    window.OrcDungeonSkills?.beforeKillTargeted?.(state, actor, target, card);
    window.RuinsEnemySkills?.beforeKillTargeted?.(state, actor, target, card);
    monaSlash(state, actor, target, card);
    }
    if (!targetStopped) minotaurDefense(state, target, card);
    if (!actorStopped) minotaurRage(state, actor, card);
  }

  function monaSlash(state, actor, target, card) {
    if (actor.ai !== "mona_eagle_captain" || target?.side !== "ally"
      || card.sweep || card.targetless || card.allTargets || card.aoeLineShown
      || card.monaPiercingSweep) return;
    card.twoDodgesRequired = true;
    if (!card.holy) card._tempHoly = true;
    card.holy = true;
    window.BattleLines?.skill(state, actor, "圣剑无双", target);
  }

  function minotaurDefense(state, target, card) {
    if (target.ai !== "minotaur") return;
    window.BattleLines?.skill(state, target, "铁甲红怒");
    const result = drawJudge(state.battle, target, "铁甲红怒·铁甲", black);
    prioritizeGroupJudgement(state, card, result);
    window.BattleLog.add(state,
      `${target.name} 铁甲判定：${result.card.suit}${result.card.name}，${result.success ? "防止本次杀造成的伤害" : "未触发"}。`);
    if (!result.success) return;
    const root = card._entitySourceCard || card;
    const prevented = root._minotaurPreventUids ||= [];
    if (!prevented.includes(target.uid)) prevented.push(target.uid);
    card._minotaurPreventUids = prevented;
    if (!card.ignoreResponse) card._tempIgnoreResponse = true;
    card.ignoreResponse = true;
  }

  function minotaurRage(state, actor, card) {
    if (actor.ai !== "minotaur") return;
    window.BattleLines?.skill(state, actor, "铁甲红怒");
    const result = drawJudge(state.battle, actor, "铁甲红怒·红怒", item => !black(item));
    prioritizeGroupJudgement(state, card, result);
    window.BattleLog.add(state,
      `${actor.name} 红怒判定：${result.card.suit}${result.card.name}，${result.success ? "本次杀不可被闪抵消" : "未触发"}。`);
    if (!result.success) return;
    if (!card.ignoreResponse) card._tempIgnoreResponse = true;
    card.ignoreResponse = true;
  }

  function prepareGroupKillTarget(state, actor, target, card) {
    const targetCard = {
      ...card,
      _entitySourceCard: card?._entitySourceCard || card,
      _risaTargetedHit: true,
    };
    beforeKillTargeted(state, actor, target, targetCard, { targetOnly: true });
    return targetCard;
  }

  function chiyoSlash(state, actor, target, card) {
    // 连击产生的虚拟【杀（普攻）】不再重复判定、也不再触发封闪，
    // 否则每张虚拟杀都会再开一轮判定 → 无限连锁。
    if (card._chiyoChainVirtual) return;
    if (target.hand.some(item => item.suit === "♥" && !item._pendingDraw)) {
      if (!card.ignoreResponse) card._tempIgnoreResponse = true;
      card.ignoreResponse = true;
      window.BattleLines?.skill(state, actor, "心眼拔刀术");
      window.BattleLog.add(state, `${actor.name} 触发心眼拔刀术，${target.name}无法响应本次杀。`);
    }
    if (!window.CardUtils?.isSingleKill?.(card)) return;
    let red = 0;
    while (true) {
      const result = drawJudge(state.battle, actor, "红缨连鬼斩", item => !black(item));
      window.BattleLog.add(state,
        `${actor.name} 红缨连鬼斩判定：${result.card.suit}${result.card.name}，${result.success ? "继续" : "停止"}。`);
      if (!result.success) break;
      red += 1;
    }
    if (!red) return;
    // 不再把整张【杀】重复结算 X+1 次（目标一死剩余次数就白费），
    // 改为记录额外虚拟杀张数，由 ChiyoChainSkills 在原牌结算后逐张发动并允许转移目标。
    card._chiyoExtra = red;
    window.BattleLines?.skill(state, actor, "红缨连鬼斩");
    window.BattleLog.add(state, `${actor.name} 本次杀将额外使用${red}张虚拟【杀（普攻）】。`);
  }

  return { beforeKillUsed, beforeKillTargeted, prepareGroupKillTarget };
};
