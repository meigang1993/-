function battleCardView(actor, card) {
  return window.CardUtils?.battleView?.(window.state, actor, card)
    || window.WithererSkills?.displayCard?.(actor, card) || card;
}
async function selectBattleTarget(targetUid) {
  if (await resolveKaiichiShare(targetUid) || state.battle?.kaiichiShare) return;
  if (await resolveGerdaComfort(targetUid) || state.battle?.gerdaComfort) return;
  if (await resolveNewMoonShare(targetUid) || state.battle?.newMoonShare) return;
  if (await resolveMillerShare(targetUid) || state.battle?.millerShare) return;
  if (await tryDimensionTransfer(targetUid)) return;
  if (state.battle?.opheliaGuard
    && (window.GuestCharacterSkills?.guardVisible?.(state.battle) ?? true)
    && await BattleSystem.resolveOpheliaGuard(state, targetUid, render)) {
    render();
    persist({ battleOperation: true });
    return;
  }
  if (state.battle?.locked) return;
  if (await tryDirectSpeedAssault(targetUid)
    || await tryDirectMimic(targetUid)
    || await tryDirectExtract(targetUid)) return;
  if (state.battle?.selectedCardIndex == null && !state.battle?.selectedSkillCard) {
    state.infoUnit = targetUid;
    state.infoTab = "stats";
    render();
    return;
  }
  const actor = BattleSystem.active(state.battle);
  const pickedCard = battleCardView(
    actor, state.battle?.selectedSkillCard || actor?.hand?.[state.battle?.selectedCardIndex]
  );
  const pickedTargets = state.battle?.pendingTargetUids || [];
  const soulNeed = Math.min(2, state.battle.enemies.filter(unit => unit.hp > 0).length);
  if (pickedCard?.soulChain && pickedTargets.includes(targetUid) && pickedTargets.length >= soulNeed) {
    await confirmBattleCard();
    return;
  }
  const beforePartner = !!state.battle?.comboPartnerUid;
  const beforeTarget = state.battle?.pendingTargetUid;
  BattleEffects.choose(state, targetUid);
  if (pickedCard?.comboAttack && state.battle?.comboPartnerUid) {
    if (!state.battle.pendingTargetUid || beforeTarget !== targetUid) return render();
  }
  if (pickedCard?.borrowSlash && !beforePartner && state.battle?.comboPartnerUid) return render();
  if (!beforePartner && state.battle?.comboPartnerUid && !pickedCard?.borrowSlash) return render();
  if (pickedCard?.soulChain) return render();
  if (state.battle?.pendingTargetUid === targetUid) await confirmBattleCard();
}

async function confirmBattleCard() {
  try {
    const battle = state.battle;
    const preparePhase = battle?.phase === 1
      && (battle.awaitingExtractUid || battle.awaitingMimicUid || battle.awaitingSpeedAssaultUid);
    const endSpeedPhase = battle?.phase === 6 && battle.awaitingSpeedAssaultUid;
    if (battle?.locked || battle?.newMoonShare || battle?.millerShare
      || (battle?.phase !== 4 && !preparePhase && !endSpeedPhase)
      || BattleEffects.animating) return;
    const actor = BattleSystem.active(battle);
    const card = battleCardView(actor, battle?.selectedSkillCard || actor?.hand[battle?.selectedCardIndex]);
    if (needsHandChoice(card) && !battle.pendingTargetUid) {
      battle.pendingTargetUid = actor?.uid;
    }
    if (card?.allyTarget && !battle.pendingTargetUid && battle.allies.filter(unit => unit.hp > 0).length === 1) {
      battle.pendingTargetUid = actor?.uid;
    }
    if (card?.allyTarget && battle.pendingTargetUid === actor?.uid) BattleEffects.choose(state, actor.uid);
    if (card?.soulChain && (battle.pendingTargetUids || []).length
      < Math.min(2, battle.enemies.filter(unit => unit.hp > 0).length)) return;
    if ((!card?.targetless || card?.allyTarget) && !battle?.pendingTargetUid) return;
    const timedSkill = battle.phase === 1
      && (card?.extract || card?.mimicVoice || card?.speedAssault)
      || battle.phase === 6 && card?.speedAssault;
    await playSelectedCard(timedSkill
      ? () => BattleSystem.skipPrepareSkill(state, render) : null);
  } catch (err) {
    battleActionError("确认出牌失败", err);
  }
}

function needsHandChoice(card) {
  return !!(card?.bloodPact || card?.elranaBag
    || card?.armyOrder || card?.elranaHeal || card?.idolKiss || card?.crazyShooting
    || card?.demonPoker || card?.cadicisPlan);
}

async function quickPlayTargetless(index) {
  try {
    const battle = state.battle;
    const actor = BattleSystem.active(battle);
    const source = actor?.hand[index];
    const card = battleCardView(actor, source);
    if (battle?.locked || BattleEffects.animating || battle?.phase !== 4
      || actor?.side !== "ally" || !BattleSystem.canPlay(actor, source)) return;
    if (battle.selectedCardIndex !== index || battle.selectedSkillCard) BattleSystem.selectCard(state, index);
    if (card.allyTarget) BattleEffects.choose(state, actor.uid);
    if (!card.targetless && !card.allyTarget) return render();
    await playSelectedCard();
  } catch (err) {
    battleActionError("快速出牌失败", err);
  }
}

function cancelBattleSelect() {
  if (state.battle?.locked || BattleEffects.animating) return;
  BattleSystem.cancelSelection(state);
  render();
}

async function playSelectedCard(afterOk = null) {
  try {
    const ok = await BattleEffects.play(state, () => {
      const played = BattleSystem.playSelectedCard(state);
      if (played) render();
      return played;
    });
    if (!ok) return false;
    if (afterOk) await afterOk();
    render();
    persist({ battleOperation: true });
    return true;
  } catch (err) {
    battleActionError("战斗出牌处理失败", err);
    return false;
  }
}

function battleActionError(label, err) {
  console.error(`${label}:`, err?.message || err, err?.stack || "");
  const battle = state.battle;
  if (battle) {
    const blocking = window.AppRuntimeErrors?.hasBlockingBattlePrompt
      ? window.AppRuntimeErrors.hasBlockingBattlePrompt(battle)
      : !!battle.locked;
    if (!blocking) {
      battle.locked = false;
      try {
        BattleSystem.cancelSelection(state);
      } catch (cleanupErr) {
        console.warn("battle selection cleanup failed:", cleanupErr.message, cleanupErr.stack);
      }
    }
  }
  try {
    BattleEffects.recover?.(state);
  } catch (cleanupErr) {
    console.warn("battle effect cleanup failed:", cleanupErr.message, cleanupErr.stack);
  }
  const reason = err?.message && !/^Script error/i.test(err.message) ? `：${err.message}` : "";
  const message = `${label}${reason}。已恢复操作状态，请重试。`;
  if (window.BattleLog?.add) window.BattleLog.add(state, message);
  else state.log?.unshift?.(message);
  window.dzmm?.toast?.error?.(message);
  render();
}
