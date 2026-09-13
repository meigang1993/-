window.RuinsGruntSkills = (() => {
  const alive = units => (units || []).filter(unit => unit.hp > 0);
  const visible = unit => (unit?.hand || []).filter(card => !card._pendingDraw);
  const isResponse = card => card?.type === "response" || card?.name === "闪";
  const isStatus = card => window.BattleStatusCards?.isStatus?.(card);
  const isSlash = card => window.CardUtils?.isKillCard?.(card) || card?.type === "slash";
  const log = (state, text) => window.BattleLog?.add?.(state, text);

  function landmineMove(state, actor) {
    if (actor?.ai !== "ruins_soldier" || actor.usedRuinsLandmine) return null;
    const targets = alive(state.battle.allies).filter(unit => visible(unit).length);
    if (!targets.length) return null;
    const target = targets.sort((left, right) =>
      visible(right).filter(isResponse).length
      - visible(left).filter(isResponse).length || left.hp - right.hp)[0];
    if (!visible(target).filter(isResponse).length) return null;
    return { card: { name: "放置地雷", _skill: true, ruinsPlaceLandmine: true }, target };
  }

  function usePlaceLandmine(state, actor, target) {
    actor.usedRuinsLandmine = true;
    const fodder = visible(actor).find(card => !isStatus(card));
    if (fodder) {
      const index = actor.hand.indexOf(fodder);
      if (index >= 0) actor.hand.splice(index, 1);
      window.BattleCards?.put?.(state.battle, actor, fodder, "discard", { showDiscard: true });
    }
    const landmine = window.BattleStatusCardRegistry?.create?.("landmine", actor);
    if (landmine) window.BattleStatusCards?.add?.(state, target, landmine, actor.name);
    window.BattleLines?.skill?.(state, actor, "放置地雷", target);
    log(state, `${actor.name} 对${target.name}发动放置地雷，在其手牌区埋设一颗地雷。`);
    return true;
  }

  function sniperMove(state, actor) {
    if (actor?.ai !== "ruins_sniper" || actor.usedRuinsSnipe) return null;
    const targets = alive(state.battle.allies).filter(unit => visible(unit).length);
    if (!targets.length) return null;
    const target = targets.sort((left, right) =>
      visible(right).filter(isSlash).length - visible(left).filter(isSlash).length
      || left.hp - right.hp)[0];
    return { card: { name: "狙击目标", _skill: true, ruinsSnipe: true }, target };
  }

  function useSnipe(state, actor, target) {
    actor.usedRuinsSnipe = true;
    const shown = visible(target)[0];
    if (!shown) {
      log(state, `${actor.name} 发动狙击目标失败：${target.name}没有可展示的手牌。`);
      return true;
    }
    const suit = shown.suit;
    const own = visible(actor).filter(card => card.suit === suit).length;
    const foe = visible(target).filter(card => card.suit === suit).length;
    actor.ruinsSniperTargetUid = target.uid;
    actor.ruinsSniperSuit = suit;
    actor.ruinsSniperLocked = own > foe;
    state.battle?.animQueue?.push({
      type: "revealCards", id: window.GameRandom?.id?.("rsn") || "rsn",
      title: "狙击目标", cards: [{ ...shown }],
    });
    window.BattleLines?.skill?.(state, actor, "狙击目标", target);
    log(state, `${actor.name} 展示${target.name}的${suit}${shown.name}，双方${suit}花色手牌为${own}/${foe}，${actor.ruinsSniperLocked ? "后续单体杀不可响应" : "未取得优势"}。`);
    return true;
  }

  function beforeKillTargeted(state, actor, target, card) {
    if (actor?.ai !== "ruins_sniper" || !actor.ruinsSniperLocked) return;
    if (!target || target.uid !== actor.ruinsSniperTargetUid) return;
    if (!window.CardUtils?.isSingleKill?.(card) && !(isSlash(card) && !card?.sweep)) return;
    if (!card.ignoreResponse) card._tempIgnoreResponse = true;
    card.ignoreResponse = true;
    log(state, `${actor.name} 的狙击目标触发，对${target.name}的单体杀不可响应。`);
  }

  function afterDamage(state, actor, target, card, hpLoss) {
    if (!hpLoss || !actor) return;
    if (actor.ai === "ruins_drone" && isSlash(card) && !card?._soulChain) {
      const paralyze = () => window.BattleStatusCards?.add?.(state, target,
        window.BattleStatusCardRegistry?.create("paralysis"), actor.name);
      if (!window.BattleDamageLifecycle?.delayUntilHitSettled?.(state, paralyze)) paralyze();
    }
  }

  function endTurn(_state, unit) {
    if (unit?.ai === "ruins_drone") unit.ruinsLockedTarget = null;
    if (unit?.ai === "ruins_sniper") {
      unit.ruinsSniperTargetUid = null;
      unit.ruinsSniperSuit = null;
      unit.ruinsSniperLocked = false;
    }
  }

  return {
    landmineMove, usePlaceLandmine, sniperMove, useSnipe,
    beforeKillTargeted, afterDamage, endTurn,
  };
})();
