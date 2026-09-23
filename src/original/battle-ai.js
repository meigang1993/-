window.BattleAI = (() => {
  const helpers = window.BattleAIHelpers;
  const slashPlan = window.BattleAISlashPlanner;
  const skillPlan = window.BattleAISkillPlanner;

  function choose(battle, actor, canPlay) {
    const {
      alive, hpPct, visible, handLimit, healTarget, lowHandAllies, withHand,
      hasDodge, keyCount, keepValue, stat, targetByPolicy, topBy,
      hasBasicKill, hasMagicKill, singleKill,
    } = helpers;
    const {
      slashScore, slashTarget, bestSlash,
      edisSetupMove, edisSlashMove, monaSlashMove,
    } = slashPlan;
    const {
      magicBulletTarget, borrowPartner, otherAlly,
      comboPartner, costCard, skillMove,
    } = skillPlan;
    const context = {
      alive,
      hpPct,
      visible,
      handLimit,
      healTarget,
      lowHandAllies,
      withHand,
      hasDodge,
      keyCount,
      keepValue,
      stat,
      slashScore,
      slashTarget,
      magicBulletTarget,
      borrowPartner,
      otherAlly,
      comboPartner,
      costCard,
      targetByPolicy,
      topBy,
      hasBasicKill,
      hasMagicKill,
      singleKill,
    };
    const team = battle.enemies;
    const foes = battle.allies;
    const rawHand = actor.hand.filter(card => !card._pendingDraw);
    const playable = rawHand.filter(card => canPlay(actor, card));
    const hand = window.GuardKellySkills?.aiHand?.(
      actor, playable, context) || playable;
    let target = null;
    let slash = null;
    const ensureSlash = (focusOnly = false) => {
      if (focusOnly) {
        const focusedTarget = slashTarget(actor, foes, hand, true);
        return bestSlash(actor, hand, focusedTarget);
      }
      target ||= slashTarget(actor, foes, hand);
      slash ||= bestSlash(actor, hand, target);
      return slash;
    };
    const bakar = window.BakarSkills?.aiMove?.(actor, foes, hand);
    if (bakar) return bakar;
    const relicSkill = skillMove(actor, team, foes, canPlay, true);
    if (relicSkill) return relicSkill;
    const characterMoves = [
      () => window.RuinsEnemySkills?.aiMove?.(
        window.state, actor, team, foes, rawHand, canPlay, context),
      () => window.SakuraRisaSkills?.aiMove?.(
        window.state, actor, team, foes, rawHand, canPlay, context),
      () => window.GuardKellySkills?.aiMove?.(
        window.state, actor, team, foes, rawHand, canPlay, context),
      () => window.BondiSkills?.aiMove?.(
        window.state, actor, team, foes, rawHand, canPlay, context),
      () => window.WithererSkills?.aiMove?.(
        window.state, actor, team, foes, rawHand, canPlay, context),
      () => window.UnderwaterTrainSkills?.flashbangMove?.(window.state, actor),
      () => window.UnderwaterTrainSkills?.controlEyeMove?.(window.state, actor),
      () => window.EnemySkills?.hammerMove?.(window.state, actor),
      () => window.EnemySkills?.grenadeMove?.(window.state, actor),
      () => window.EnemySkills?.radarMove?.(window.state, actor),
      () => window.OrcDungeonSkills?.droneMove?.(window.state, actor),
      () => window.OrcDungeonSkills?.witchMove?.(window.state, actor),
      () => edisSetupMove(
        context, actor, team, foes, hand, ensureSlash),
      () => edisSlashMove(actor, foes, hand),
      () => monaSlashMove(actor, foes, hand),
    ];
    for (const move of characterMoves) {
      const result = move();
      if (result) return result;
    }
    const tactic = window.BattleAITactics.tacticMove(
      context, actor, team, foes, hand, ensureSlash, 70);
    if (tactic) return tactic;
    const dragonSlash = window.AbeMikeSkills?.dragonSlashMove?.(actor);
    if (dragonSlash) return dragonSlash;
    const trainMove = window.UnderwaterTrainSkills?.slimeMove?.(actor);
    if (trainMove) return trainMove;
    const normalSkill = skillMove(actor, team, foes, canPlay);
    if (normalSkill) return normalSkill;
    const fallbackTactic = window.BattleAITactics.tacticMove(
      context, actor, team, foes, hand, ensureSlash, 1);
    if (fallbackTactic) return fallbackTactic;
    if (ensureSlash()) return { card: slash, target };
    return window.WithererSkills?.beforeEndMove?.(actor) || null;
  }

  return {
    choose,
    helpers: {
      magicBulletTarget: skillPlan.magicBulletTarget,
      slashScore: slashPlan.slashScore,
    },
  };
})();
