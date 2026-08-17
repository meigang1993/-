window.BattleEffects = (() => {
  const { center, selectedCard, targetArt, setLine, setLines, setComboLines, flashComboPartner, hideLine } = window.BattleEffectUtils;
  const H = window.BattleEffectHandlers, P = window.BattleEffectPlay;
  const effectiveCard = (actor, card) => window.WithererSkills?.displayCard?.(actor, card) || card;
  const runtime = { animating: false, draining: false, renderFrozen: false, idleResolvers: [], settleBlockedBattle: null, pendingState: null, currentEvent: null, version: 0 };
  const isCurrent = (state, version = runtime.version) => version === runtime.version && (!window.state || window.state === state);
  const pendingIsCurrent = () => !window.state || runtime.pendingState === window.state;
  const isIdle = () => !runtime.animating && !runtime.draining
    && (!pendingIsCurrent() || !runtime.pendingState?.battle?.animQueue?.length);
  const resolveIdle = () => { if (!isIdle()) return; runtime.idleResolvers.splice(0).forEach(resolve => resolve()); };
  const whenIdle = () => isIdle() ? Promise.resolve() : new Promise(resolve => runtime.idleResolvers.push(resolve));
  function canConfirm(state) {
    const b = state.battle, actor = b && window.BattleSystem.active(b), card = effectiveCard(actor, b?.selectedSkillCard || actor?.hand?.[b?.selectedCardIndex]);
    if (card?.comboAttack) return !!(b?.pendingTargetUid && b?.comboPartnerUid);
    if (card?.borrowSlash) return !!(b?.comboPartnerUid && b?.pendingTargetUid);
    if (!card?.soulChain) return !!b?.pendingTargetUid;
    return (b.pendingTargetUids || []).length >= Math.min(2, b.enemies.filter(u => u.hp > 0).length);
  }
  function sync(state) {
    window.BattleEffectAnimation.syncCssTiming(state);
    window.BattleEffectAnimation.stampCssTiming(
      document.querySelector(".battle-screen"), state);
    if (!state.battle?.animQueue?.length) { BattleFX.slashHit(state); BattleFX.popFloats(state); }
    const manual = state.battle?.manualDodge;
    if (manual) { const from = targetArt(manual.actorUid), to = targetArt(manual.targetUid); if (from && to) return setLine(center(from), center(to), true, true); }
    const card = selectedCard(), b = state.battle,
      actor = b && window.BattleSystem.active(b),
      enemyLine = actor?.side === "enemy",
      source = b?.selectedSkillCard || actor?.hand?.[b?.selectedCardIndex],
      selected = effectiveCard(actor, source),
      foes = actor?.side === "enemy" ? b?.allies : b?.enemies,
      groupUids = P.groupTargetUids?.(actor, selected, source, b, foes) || [],
      pendingUids = b?.pendingTargetUids || [],
      uids = pendingUids.length ? pendingUids : groupUids,
      arts = uids.map(targetArt).filter(Boolean);
    const uid = b?.pendingTargetUid, art = uid && targetArt(uid);
    if (card && art && (selected?.comboAttack || selected?.borrowSlash)
      && b?.comboPartnerUid) {
      const partnerArt = targetArt(b.comboPartnerUid);
      if (partnerArt) { setComboLines(center(card), center(partnerArt), center(art), false); flashComboPartner(partnerArt); return; }
    }
    if (card && groupUids.length && arts.length) {
      return setLines(center(card), arts.map(center), false, enemyLine);
    }
    if (card && arts.length > 1) {
      return setLines(center(card), arts.map(center), false, enemyLine);
    }
    if (card && arts.length === 1) {
      return setLine(center(card), center(arts[0]), false, enemyLine);
    }
    if (!uid || !card || !art) return hideLine();
    setLine(center(card), center(art), false, enemyLine);
  }
  function choose(state, uid) {
    if (!window.BattleSystem.chooseTarget(state, uid)) return false;
    const b = state.battle, picked = b?.pendingTargetUids || [b?.pendingTargetUid, b?.comboPartnerUid || uid].filter(Boolean);
    document.querySelectorAll("[data-target]").forEach(u => u.classList.toggle("chosen-target", picked.includes(u.dataset.target)));
    document.querySelector("[data-confirm-target]")?.toggleAttribute("disabled", !canConfirm(state));
    sync(state); return true;
  }
  function clearTarget(state) {
    if (state.battle) { const actor = window.BattleSystem.active(state.battle), card = effectiveCard(actor, state.battle.selectedSkillCard || actor?.hand?.[state.battle.selectedCardIndex]); if ((card?.borrowSlash || card?.comboAttack) && state.battle.comboPartnerUid && !state.battle.pendingTargetUid) return hideLine(); state.battle.pendingTargetUid = null; state.battle.pendingTargetUids = null; state.battle.comboPartnerUid = null; }
    document.querySelectorAll("[data-target]").forEach(u => u.classList.remove("chosen-target"));
    document.querySelector("[data-confirm-target]")?.setAttribute("disabled", "");
    hideLine();
  }
  async function play(state, commit) {
    if (runtime.animating) return false;
    const version = runtime.version;
    const battleAtStart = state.battle;
    const active = () => isCurrent(state, version)
      && state.battle === battleAtStart;
    runtime.pendingState = state;
    if (runtime.settleBlockedBattle === state.battle) runtime.settleBlockedBattle = null;
    try {
      return await P.playCard(
        state,
        () => {
          if (!active()) return false;
          const result = commit();
          if (result) window.GameUI?.syncPlayedTrail?.(state.battle);
          return result;
        },
        value => { if (version === runtime.version) runtime.animating = value; },
        () => { if (version === runtime.version) resolveIdle(); },
        value => { if (version === runtime.version) runtime.renderFrozen = value; },
        active,
      );
    } catch (err) {
      if (!active()) return false;
      throw err;
    }
  }
  function recover(state, releaseIdle = true) {
    runtime.pendingState = state;
    runtime.animating = false; runtime.draining = false; runtime.renderFrozen = false;
    BattleFX.clearBumps?.();
    try { H.clearVisuals?.(state); }
    catch (err) { console.warn("battle visual cleanup failed:", err.message, err.stack); }
    document.querySelectorAll(".flying-card,.drag-ghost,.slash-text").forEach(el => el.remove());
    document.querySelectorAll(".enemy-acting,.clash-shake,.clash-resisted,.hit-bump,.heal-bump,.armor-bump,.bump-reset,.combo-partner-flash").forEach(el => {
      el.classList.remove("enemy-acting", "clash-shake", "clash-resisted", "hit-bump", "heal-bump", "armor-bump", "bump-reset", "combo-partner-flash");
    });
    document.body.classList.remove("card-dragging");
    hideLine();
    if (releaseIdle) resolveIdle();
  }
  const drain = window.BattleEffectDrain({ runtime, isCurrent, resolveIdle, recover });
  function revealEventCards(event) {
    const cards = [
      ...(event?.cards || []),
      ...(event?.batches || []).flatMap(batch => batch.cards || []),
    ];
    cards.forEach(card => { delete card._pendingDraw; });
  }
  const recoverableEvent = event => event?.runtimeRecovery === "restart";
  function hasRecoverableEvent(state) {
    if (runtime.pendingState === state && recoverableEvent(runtime.currentEvent)) {
      return true;
    }
    return !!state?.battle?.animQueue?.some(recoverableEvent);
  }
  function restart(state) {
    const currentEvent = runtime.pendingState === state
      && runtime.draining && runtime.animating
      ? runtime.currentEvent : null;
    runtime.version += 1;
    if (currentEvent && state?.battle?.animQueue
      && !state.battle.animQueue.includes(currentEvent)) {
      state.battle.animQueue.unshift(currentEvent);
    }
    runtime.currentEvent = null;
    if (runtime.settleBlockedBattle === state?.battle) runtime.settleBlockedBattle = null;
    recover(state);
  }
  function cancel(state) {
    runtime.version += 1;
    revealEventCards(runtime.currentEvent);
    state?.battle?.animQueue?.forEach(revealEventCards);
    runtime.currentEvent = null;
    if (state?.battle?.animQueue) state.battle.animQueue.length = 0;
    if (runtime.settleBlockedBattle === state?.battle) runtime.settleBlockedBattle = null;
    runtime.pendingState = null;
    recover(state);
    runtime.pendingState = null;
  }
  const settlementBlocked = state => runtime.settleBlockedBattle === state?.battle;
  return { sync, choose, clearTarget, play, drain, whenIdle, recover, restart, cancel, hasRecoverableEvent, settlementBlocked, get animating() { return runtime.animating; }, get draining() { return runtime.draining; }, get renderFrozen() { return runtime.renderFrozen; } };
})();
