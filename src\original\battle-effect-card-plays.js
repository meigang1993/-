window.BattleEffectCardPlays = U => {
  const HIT_HOLD_MS = 90;
  const TRAIL_HOLD_MS = 220;
  const {
    targetArt, publicZone, unitEl, unitArt, wait, waitHold = wait,
    nextFrame, targetOfCard,
  } = U;
  const flight = window.BattleEffectPlayedCardFlight(U);
  const { isKillCard, isSingleKill: isSingleSlash } = window.CardUtils;
  const hasDamage = card =>
    isKillCard(card) || (card?.power ?? card?.damage ?? 0) > 0;
  const virtualTargetUids = event => {
    const direct = Array.isArray(event.targetUids) ? event.targetUids : [];
    return direct.length
      ? direct
      : Array.isArray(event.card?.allTargets) ? event.card.allTargets : [];
  };
  const virtualEnemyLine = (state, event) => {
    if (event.enemyLine != null) return !!event.enemyLine;
    const battle = state.battle;
    const units = [...(battle?.allies || []), ...(battle?.enemies || [])];
    return (units.find(unit => unit.uid === event.uid)?.side || event.side) === "enemy";
  };

  function groupTargets(state, event) {
    if (event.extraSlashReplay) return [];
    const battle = state.battle;
    const units = battle?.allies.concat(battle.enemies) || [];
    const actor = units.find(unit => unit.uid === event.uid);
    const card = event.card;
    const foes = actor?.side === "enemy" ? battle?.allies : battle?.enemies;
    const selected = event.targetUids || card?._targetUids;
    if (Array.isArray(selected) && selected.length) {
      const fixed = new Set(selected);
      return (foes || []).filter(unit => unit.hp > 0 && fixed.has(unit.uid))
        .map(unit => targetArt(unit.uid)).filter(Boolean);
    }
    const fixed = Array.isArray(card?.allTargets) ? new Set(card.allTargets) : null;
    const converted = actor?.ai === "demon_beast_unit" && isSingleSlash(card)
      || actor?.ref === "manny" && actor.mannyWeapon === "flamer"
        && isSingleSlash(card) && hasDamage(card);
    if (!fixed && !card?.allTargets && !card?.sweep && !card?.aoeLineShown
      && !card?.demonInvasion && !converted) return [];
    return (foes || [])
      .filter(unit => unit.hp > 0 && (!fixed || fixed.has(unit.uid)))
      .map(unit => targetArt(unit.uid))
      .filter(Boolean);
  }

  async function enemyPlay(state, event, reveal, renderStep, active = () => true) {
    const from = unitArt(event.uid);
    const targets = groupTargets(state, event);
    const target = targetOfCard(state, event);
    const to = target && targetArt(target.uid);
    const zone = publicZone();
    const actor = unitEl(event.uid);
    const targeted = !!(from && to && !event.card?.targetless
      && event.targetUid !== event.uid);
    actor?.classList.add("enemy-acting");
    await waitHold(HIT_HOLD_MS, event);
    actor?.classList.remove("enemy-acting");
    if (!active()) return;
    if (from && targets.length) {
      await flight.flyPlayAoe(event.card, from, targets, zone, true, event, active);
    } else if (from && (targeted ? to : zone)) {
      await flight.flyPlay(event.card, from, targeted ? to : zone,
        zone, targeted, true, null, event, active);
    }
    if (!active()) return;
    reveal(event.card, event);
    renderStep();
    event.commit?.();
    renderStep();
    const trail = document.querySelector(".card-trail:last-child");
    trail?.classList.add("enemy-played");
    await waitHold(TRAIL_HOLD_MS, event);
    if (active() && event.hide === true && window.BattleSystem.hidePlayed) {
      window.BattleSystem.hidePlayed(state.battle, event.card, event);
      renderStep();
    }
  }

  async function virtualPlay(state, event, renderStep, active = () => true) {
    renderStep();
    await nextFrame();
    if (!active()) return;
    const targetUids = virtualTargetUids(event);
    const from = unitArt(event.uid);
    const partner = event.comboPartnerUid && unitArt(event.comboPartnerUid);
    const targets = targetUids.map(uid => targetArt(uid)).filter(Boolean);
    const target = targetOfCard(state, event);
    const to = target && targetArt(target.uid);
    const zone = publicZone();
    const targeted = !!(from && to && event.targetUid !== event.uid);
    const enemyLine = virtualEnemyLine(state, event);
    if (from && targets.length) {
      await flight.flyPlayAoe(
        event.card, from, targets, zone, enemyLine, event, active);
    } else if (from && (targeted ? to : zone)) {
      await flight.flyPlay(event.card, from, targeted ? to : zone,
        zone, targeted, enemyLine, partner, event, active);
    }
    if (!active()) return;
    if (event.show !== false) {
      window.BattleSystem?.revealPlayed?.(state.battle, event.card, event);
    }
    renderStep();
    await waitHold(180, event);
  }

  return { enemyPlay, virtualPlay };
};
