window.BattleDamage = (deps, ctx) => {
  const needsResponse = card => deps.isKillCard(card) || card?.responseKind;
  const responseRule = card => card?.responseKind === "slash"
    ? "slash"
    : {
      blackDodgeOnly: card?.blackDodgeOnly,
      singleKill:
        !(card?.sweep || card?.targetless || card?.allTargets || card?.aoeLineShown),
    };
  const canDodge = (card, candidate) =>
    window.CardUtils.canRespondTo(responseRule(card), candidate);
  const utils = window.BattleDamageUtils(deps, ctx);
  const logSource = (actor, source) =>
    actor?.name && !String(source).startsWith(`${actor.name}（`)
      ? `${actor.name}的${source}` : source;
  let triggers;
  let resolution;
  let responses;
  const lifecycle = window.BattleDamageLifecycle({
    deps, ctx, utils,
    getTriggers: () => triggers,
    getResolveDamage: () => resolution.resolveDamage,
  });
  const hit = window.BattleDamageHit({
    deps, ctx, lifecycle, getTriggers: () => triggers, logSource,
  });
  const responseApi = () => {
    responses ||= window.BattleDamageResponses({
      deps, ctx, canDodge,
      damage: lifecycle.damage,
      hitWithoutDodge: hit.hitWithoutDodge,
      finalizeDamage: lifecycle.finalizeDamage,
      triggers,
    });
    return responses;
  };
  resolution = window.BattleDamageResolution({
    deps, ctx, utils, lifecycle, needsResponse, canDodge,
    getResponseApi: responseApi,
    getHitWithoutDodge: () => hit.hitWithoutDodge,
  });
  triggers = window.BattleDamageTriggers({
    deps, ctx, damage: lifecycle.damage, directDamage: lifecycle.directDamage,
  });
  lifecycle.damage.hitWithoutDodge = hit.hitWithoutDodge;
  lifecycle.damage.scheduleAfterDamage = lifecycle.scheduleAfterDamage;
  lifecycle.damage.directDamage = lifecycle.directDamage;
  lifecycle.damage.finalizeDamage = lifecycle.finalizeDamage;
  return {
    damage: lifecycle.damage,
    directDamage: lifecycle.directDamage,
    resolveThunderHammer: (...args) =>
      responseApi().resolveThunderHammer(...args),
    cancelThunderHammer: (...args) =>
      responseApi().cancelThunderHammer(...args),
    resolveManualDodge: (...args) =>
      responseApi().resolveManualDodge(...args),
    confirmDeflectResult: (...args) =>
      responseApi().confirmDeflectResult(...args),
    canDodge,
    hitWithoutDodge: hit.hitWithoutDodge,
    finalizeDamage: lifecycle.finalizeDamage,
    triggerWhiteLolita: resolution.triggerWhiteLolita,
    afterDodged: (...args) => triggers.afterDodged(...args),
  };
};
