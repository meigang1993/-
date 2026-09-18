window.RuinsEnemySkills = (() => {
  // 惰性解析：避免依赖打包顺序（曾因 enemy 在 grunt 之前加载而永久为空）
  const grunt = new Proxy({}, { get: (_, key) => window.RuinsGruntSkills?.[key] });
  const dragon = window.RuinsDragonSkills;
  const witherer = window.RuinsWithererSkills;
  const elite = window.RuinsEliteSkills;
  const log = (state, text) => window.BattleLog?.add?.(state, text);

  const isRuins = unit => typeof unit?.ai === "string" && unit.ai.startsWith("ruins_");

  function prepare(state, unit, damage) {
    if (!isRuins(unit)) return;
    dragon?.prepare?.(state, unit);
    grunt?.tankPrepare?.(state, unit, damage);
    elite?.prepare?.(state, unit, damage);
  }

  function endTurn(state, unit) {
    if (!isRuins(unit) && unit?.side !== "ally") return;
    grunt?.endTurn?.(state, unit);
    dragon?.endTurn?.(state, unit);
    witherer?.endTurn?.(state, unit);
    elite?.endTurn?.(state, unit);
  }

  function beforeKillUsed(state, actor, card) {
    if (!isRuins(actor)) return;
    grunt?.beforeKillUsed?.(state, actor, card);
    dragon?.beforeKillUsed?.(state, actor, card);
  }

  function beforeKillTargeted(state, actor, target, card) {
    grunt?.beforeKillTargeted?.(state, actor, target, card);
    if (!isRuins(actor) && !isRuins(target)) return;
    elite?.beforeKillTargeted?.(state, actor, target, card);
  }

  function modifyDamage(state, target, amount, card) {
    let result = amount;
    if (isRuins(target)) {
      result = witherer?.modifyDamage?.(state, target, result, card) ?? result;
      result = elite?.modifyDamage?.(state, target, result, card) ?? result;
    }
    return result;
  }

  function afterDamage(state, actor, target, card, hpLoss, damage) {
    grunt?.afterDamage?.(state, actor, target, card, hpLoss);
    if (isRuins(actor) || isRuins(target)) {
      dragon?.afterDamage?.(state, actor, target, card, hpLoss, damage);
      witherer?.afterDamage?.(state, actor, target, card, hpLoss, damage);
    }
  }

  function afterDodged(state, actor, target, card) {
    elite?.afterDodged?.(state, actor, target, card);
  }

  function beforeCardPlayed(state, actor, card) {
    dragon?.beforeCardPlayed?.(state, actor, card);
  }

  function allyTurnStart(state, unit) {
    dragon?.allyTurnStart?.(state, unit);
  }

  function aiMove(state, actor, team, foes, hand, canPlay, context) {
    if (!isRuins(actor)) return null;
    const moves = [
      () => grunt?.landmineMove?.(state, actor),
      () => grunt?.sniperMove?.(state, actor),
      () => grunt?.tankMove?.(state, actor),
      () => grunt?.landmineRpsMove?.(state, actor),
      () => elite?.backstabMove?.(state, actor),
      () => elite?.helicopterMove?.(state, actor),
      () => elite?.carrierRamMove?.(state, actor),
      () => dragon?.aiMove?.(state, actor),
    ];
    for (const move of moves) {
      const result = move();
      if (result) return result;
    }
    return null;
  }

  function useSkillCard(state, actor, target, card, damage) {
    if (card?.ruinsPlaceLandmine) return runUse(() => grunt?.usePlaceLandmine?.(state, actor, target));
    if (card?.ruinsSnipe) return runUse(() => grunt?.useSnipe?.(state, actor, target));
    if (card?.ruinsTankShell) return runUse(() => grunt?.useTankShell?.(state, actor));
    if (card?.ruinsLandmineRps) return runUse(() => grunt?.useLandmineRps?.(state, actor));
    if (card?.ruinsBackstab) return runUse(() => elite?.useBackstab?.(state, actor, target, damage));
    return false;
  }

  function runUse(action) { action(); return true; }

  function battleStart(state) {
    (state.battle?.enemies || []).filter(isRuins).forEach(unit => {
      if (unit.ai === "ruins_dragon") { unit.ruinsHitsThisTurn = 0; unit.ruinsGunFired = false; }
    });
  }

  return {
    prepare, endTurn, beforeKillUsed, beforeKillTargeted, modifyDamage,
    afterDamage, afterDodged, beforeCardPlayed, allyTurnStart,
    aiMove, useSkillCard, battleStart,
    landmineRps: {
      playPhaseStart: (state, unit) => grunt?.playPhaseStart?.(state, unit),
      open: (state, unit) => grunt?.openLandmineRps?.(state, unit),
      resolveChoice: (state, choice) => grunt?.resolveLandmineRpsChoice?.(state, choice),
      confirm: state => grunt?.confirmLandmineRps?.(state),
      skip: state => grunt?.skipLandmineRps?.(state),
    },
  };
})();
