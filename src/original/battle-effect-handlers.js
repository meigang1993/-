window.BattleEffectHandlers = (() => {
  const U = window.BattleEffectUtils;
  const {
    center, hideLine, nextFrame, publicZone, setLine, targetArt,
    unitEl, unitArt, handSpot, wait,
  } = U;
  const cards = window.BattleEffectCards(U);
  const motion = window.BattleEffectCardMotion(U);
  const DEATH_ANIM_MS = 760, CLASH_WAIT_MS = 1700, JUDGEMENT_WAIT_MS = 1100, REVEAL_WAIT_MS = 1000;
  const fatal = unit => (unit?.visualHp ?? unit?.hp ?? 0) <= 0 && !window.SakuraRisaSkills?.pendingRevival?.(unit);
  async function clash(state, evt, renderStep, active = () => true) {
    if (state.battle) state.battle.lastClash = evt;
    renderStep();
    const screen = document.querySelector(".battle-screen"), unit = unitEl(evt.uid);
    if (evt.result === "成功") screen?.classList.add("clash-shake");
    if (evt.result === "抵抗") unit?.classList.add("clash-resisted");
    await wait(CLASH_WAIT_MS); if (!active()) return; screen?.classList.remove("clash-shake"); unit?.classList.remove("clash-resisted");
    if (state.battle?.lastClash?.id === evt.id) state.battle.lastClash = null; renderStep();
  }
  async function judgement(state, evt, renderStep, active = () => true) {
    state.battle.judgement = evt; renderStep(); BattleFX.judgeResult(evt.success); await wait(JUDGEMENT_WAIT_MS);
    if (!active()) return;
    if (evt.discardTo && evt.card && !evt.discardTo.includes(evt.card)) evt.discardTo.push(evt.card);
    evt.commit?.();
    if (state.battle?.judgement?.id === evt.id) state.battle.judgement = null; const fatal = applyDeferredDeath(state, evt.uid); renderStep(); if (fatal) await wait(DEATH_ANIM_MS);
  }
  async function response(state, evt, renderStep, active = () => true) {
    const actor = state.battle?.allies?.concat(state.battle?.enemies || [])
      .find(unit => unit.uid === evt.uid);
    if (actor && evt.visualHandCount != null) {
      const current = actor.visualHandCount ?? evt.visualHandBefore
        ?? evt.visualHandCount - evt.visualHandDelta;
      actor.visualHandCount = evt.visualHandDelta == null
        ? evt.visualHandCount
        : Math.max(0, current + evt.visualHandDelta);
      renderStep();
      if (!active()) return;
    }
    const card = evt.card, origin = handSpot(evt.uid, evt.side) || unitArt(evt.uid), zone = publicZone();
    if (card && origin && zone) await popResponse(card, origin, zone, evt.side === "enemy", active);
    else { renderStep(); BattleFX.beep(120); await wait(320); }
    if (!active()) return;
    const trailCard = recordResponse(state, evt);
    renderStep();
    if (trailCard?._destinationPile === "consumed") {
      state.battle?.animQueue?.unshift({
        type: "burnCard", card: trailCard,
        uid: evt.uid, side: evt.side,
        fromPublic: true, trailId: trailCard._cardAnimationId,
      });
    }
  }
  function recordResponse(state, evt) {
    const b = state.battle;
    if (!b || !evt?.card || evt._trailRecorded) return;
    const actor = (b.allies || []).concat(b.enemies || []).find(unit => unit.uid === evt.uid);
    const card = window.CardUtils?.clean?.(evt.card) || { ...evt.card };
    const skillName = window.UICommon?.activeSkillName?.(actor, evt.card) || "";
    if (skillName) card.skillName = skillName;
    card._playedByName = actor?.name || "";
    card._playedAction = evt.action || responseAction(card);
    card._destinationPile = evt.pile || (card.void || card.copiedByEdis
      ? "consumed" : "discard");
    card._destinationSide = evt.destinationSide || actor?.side || evt.side || "ally";
    card._cardAnimationId = evt.id;
    (b.played ||= []).unshift(card);
    evt._trailRecorded = true;
    return card;
  }
  const responseAction = card => card?.type === "slash"
    || card?.reckless || card?.feint || card?.deflect || card?.backflip
    || ["无谋冲拳", "佯攻", "弹反", "后空翻"].includes(card?.name)
      ? "打出了" : "使用了";
  async function revealCards(state, evt, renderStep, active = () => true) {
    state.battle.revealCards = evt; renderStep(); BattleFX.beep(); await wait(evt.duration || REVEAL_WAIT_MS);
    if (!active()) return;
    if (state.battle?.revealCards?.id === evt.id) state.battle.revealCards = null; renderStep();
  }
  async function slashText(
    evt, state = null, renderStep = null, active = () => true,
  ) {
    let targeted = false;
    if (evt.targetUid && state && renderStep) {
      renderStep();
      await nextFrame();
      if (!active()) return;
      const from = unitArt(evt.uid), to = targetArt(evt.targetUid);
      if (from && to && evt.targetUid !== evt.uid) {
        setLine(center(from), center(to), true,
          evt.enemyLine != null ? !!evt.enemyLine : evt.side === "enemy");
        targeted = true;
      }
    }
    const unit = unitEl(evt.uid), host = unit?.querySelector(".unit-main") || unitArt(evt.uid);
    if (!host) {
      if (targeted) hideLine();
      return;
    }
    const text = document.createElement("span"), seq = (Number(host.dataset.slashTextSeq || 0) + 1) % 5;
    host.dataset.slashTextSeq = String(seq);
    text.className = `slash-text ${evt.side === "enemy" ? "enemy" : "ally"}`;
    text.textContent = "杀";
    text.style.setProperty("--slash-offset", `${(seq - 2) * 12}px`);
    window.BattleEffectAnimation?.stampCssTiming?.(text);
    host.appendChild(text);
    setTimeout(
      () => text.remove(),
      window.BattleEffectAnimation?.scaleMs?.(2000) ?? 2000,
    );
    if (targeted) {
      await wait(180);
      if (active()) hideLine();
    }
  }
  async function popResponse(card, origin, zone, enemy, active) {
    await motion.flyFrontCards({
      cards: [card], from: origin, to: zone,
      className: "response-card-fly", enemy, fadeOut: false, active,
    });
  }
  function applyVisual(state, evt, renderStep) {
    const unit = state.battle?.allies?.concat(state.battle?.enemies || []).find(u => u.uid === evt.uid);
    if (!unit) return false;
    const waitsForJudge = (evt.kind === "damage" || evt.kind === "hp-loss") && (evt.visualHp ?? unit.hp) <= 0 && !window.SakuraRisaSkills?.pendingRevival?.(unit) && state.battle?.animQueue?.some(e => e.type === "judgement" && e.uid === evt.uid);
    if (waitsForJudge) unit.deferredDeathVisual = { hp: evt.visualHp ?? unit.hp, block: evt.visualBlock, defense: evt.visualDefense };
    else if (evt.visualHp != null) unit.visualHp = evt.visualHp;
    else if (evt.kind === "damage" || evt.kind === "hp-loss" || evt.kind === "heal") unit.visualHp = unit.hp;
    if (evt.visualBlock != null) unit.visualBlock = evt.visualBlock;
    else if (/^armor/.test(evt.kind || "")) unit.visualBlock = unit.block || 0;
    if (evt.visualDefense != null) unit.visualDefense = evt.visualDefense;
    else if (/^defense/.test(evt.kind || "")) unit.visualDefense = unit.defenseSystem || 0;
    evt.commit?.();
    renderStep();
    return fatal(unit);
  }
  function applyDeferredDeath(state, uid) {
    const unit = state.battle?.allies?.concat(state.battle?.enemies || []).find(u => u.uid === uid);
    if (!unit?.deferredDeathVisual) return false;
    const v = unit.deferredDeathVisual;
    unit.visualHp = v.hp;
    if (v.block != null) unit.visualBlock = v.block;
    if (v.defense != null) unit.visualDefense = v.defense;
    delete unit.deferredDeathVisual;
    return fatal(unit);
  }
  function clearVisuals(state) {
    state.battle?.allies?.concat(state.battle?.enemies || []).forEach(u => { delete u.visualHp; delete u.visualBlock; delete u.visualDefense; delete u.visualHandCount; });
  }
  return { DEATH_ANIM_MS, ...cards, clash, judgement, revealCards, response, slashText, applyVisual, clearVisuals };
})();
