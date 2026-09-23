window.BakarCoreSkills = (() => {
  const BAKAR_ID = "demon_king_bakaar";
  const isBakar = unit =>
    unit?.id === BAKAR_ID || unit?.ref === BAKAR_ID || unit?.ai === BAKAR_ID;
  const allUnits = battle => (battle?.allies || []).concat(battle?.enemies || []);
  const opponents = (battle, actor) =>
    actor?.side === "enemy" ? battle?.allies || [] : battle?.enemies || [];

  function triggerTalent(state, unit, source) {
    if (!isBakar(unit) || unit.hp <= 0) return false;
    window.BattleLines?.skill(state, unit, "天赋异能");
    const drawn = window.BattleSystem?.draw?.(unit, 1, state.battle);
    window.BattleLog.add(state, `${unit.name} 的天赋异能因${source}触发，${window.BattleDrawFeedback.action(unit, 1, drawn)}。`);
    return true;
  }

  function triggerCommander(state, unit, card) {
    if (!isBakar(unit)) return;
    card._bakarCommanderTriggered ||= [];
    if (card._bakarCommanderTriggered.includes(unit.uid)) return;
    card._bakarCommanderTriggered.push(unit.uid);
    window.BattleLines?.skill(state, unit, "魔王军统领");
    triggerTalent(state, unit, "魔王军统领");
  }

  function invasionTargets(state, actor, card) {
    return opponents(state.battle, actor).filter(unit => {
      if (unit.hp <= 0 || !isBakar(unit)) return unit.hp > 0;
      triggerCommander(state, unit, card);
      window.BattleLog.add(state,
        `${unit.name} 的魔王军统领触发，【魔王军入侵】对其无效。`);
      return false;
    });
  }

  function takeUsedCard(actor, card) {
    if (card.virtual || card._skipHandMove || card.void
      || card.copiedByEdis || card.temporary) return null;
    const entity = card._entitySourceCard || card;
    const zone = actor.pileStats || actor;
    for (const pile of ["discard", "consumed"]) {
      const index = zone?.[pile]?.indexOf(entity) ?? -1;
      if (index >= 0) return zone[pile].splice(index, 1)[0];
    }
    return null;
  }

  function captureInvasion(state, actor, card) {
    allUnits(state.battle)
      .filter(unit => unit?.uid !== actor.uid && unit.hp > 0 && isBakar(unit))
      .forEach(unit => {
        const gained = takeUsedCard(actor, card);
        if (!gained) return;
        triggerCommander(state, unit, card);
        if (state.battle.animQueue) gained._pendingDraw = true;
        unit.hand.push(gained);
        state.battle.animQueue?.push({
          type: "gainCards",
          uid: unit.uid,
          side: unit.side,
          cards: [gained],
          count: 1,
        });
        window.BattleLog.add(state,
          `${unit.name} 的魔王军统领触发，获得${actor.name}使用过的${gained.name}。`);
      });
  }

  function afterCardPlayed(state, actor, card) {
    if (!state?.battle || !actor || !card) return;
    if (isBakar(actor) && card._skill && !card._relicSkill && !card.bakarTalentSkip) {
      triggerTalent(state, actor, card.skillName || card.name);
    }
    if (!card.demonInvasion) return;
    const delayed = state.battle.locked && (state.battle.manualCounter
      || state.battle.manualDodge?.card?.targetUids?.length
      || state.battle.opheliaGuard?.card?.targetUids?.length);
    if (delayed) {
      state.battle.bakarInvasionCapture = {
        actorUid: actor.uid,
        card,
        triggered: [...(card._bakarCommanderTriggered || [])],
      };
      return;
    }
    captureInvasion(state, actor, card);
  }

  function completeInvasion(state) {
    const pending = state?.battle?.bakarInvasionCapture;
    if (!pending || state.battle.locked || state.battle.demonInvasionResume
      || state.battle.manualDodgeResume) return false;
    state.battle.bakarInvasionCapture = null;
    const actor = allUnits(state.battle).find(unit => unit.uid === pending.actorUid);
    if (!actor) return false;
    pending.card._bakarCommanderTriggered = pending.triggered;
    captureInvasion(state, actor, pending.card);
    delete pending.card._bakarCommanderTriggered;
    return true;
  }

  function aiMove(actor, foes, hand) {
    if (!isBakar(actor)) return null;
    const invasion = hand.find(card => card.demonInvasion);
    return invasion ? { card: invasion, target: actor } : null;
  }

  return {
    isBakar,
    triggerTalent,
    invasionTargets,
    afterCardPlayed,
    completeInvasion,
    aiMove,
  };
})();
