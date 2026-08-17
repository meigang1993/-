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

  function beforeKillUsed(state, actor, card) {
    if (!actor || !card) return;
    window.BakarSkills?.beforeKillTargeted?.(state, actor, card);
    if (window.RelicSystem?.hasEquipped?.(state, actor, "圣鹰剑")
      && actor.hand.some(item => item.name === "闪" && !item._pendingDraw)) {
      if (!card.ignoreResponse) card._tempIgnoreResponse = true;
      card.ignoreResponse = true;
      window.BattleLog.add(state, `${actor.name} 的圣鹰剑触发，本次杀不可响应。`);
    }
  }

  function beforeKillTargeted(state, actor, target, card, options = {}) {
    if (!actor || !target || !card) return;
    if (!options.targetOnly) beforeKillUsed(state, actor, card);
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
    monaSlash(state, actor, target, card);
    minotaurDefense(state, target, card);
    minotaurRage(state, actor, card);
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
    card.gatlingRepeats = (card.gatlingRepeats || 1) + red;
    window.BattleLines?.skill(state, actor, "红缨连鬼斩");
    window.BattleLog.add(state, `${actor.name} 本次杀额外结算${red}次。`);
  }

  return { beforeKillUsed, beforeKillTargeted, prepareGroupKillTarget };
};
