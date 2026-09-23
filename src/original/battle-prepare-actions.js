async function tryDirectExtract(targetUid) {
  try {
    const b = state.battle, actor = BattleSystem.active(b), target = b?.allies.find(u => u.uid === targetUid);
    if (!b || b.phase !== 1 || b.awaitingExtractUid !== actor?.uid || b.selectedCardIndex != null || b.selectedSkillCard || target?.side !== "ally" || target.gender !== "male") return false;
    if (!BattleSystem.selectExtract(state) || !BattleSystem.chooseTarget(state, targetUid)) return false;
    await playSelectedCard(() => BattleSystem.skipExtract(state, render)); return true;
  } catch (err) { battleActionError("榨取精华处理失败", err); return false; }
}
async function tryDirectSpeedAssault(targetUid) {
  try {
    const b = state.battle, actor = BattleSystem.active(b), target = b?.enemies.find(u => u.uid === targetUid && u.hp > 0);
    if (!b || ![1, 6].includes(b.phase) || b.awaitingSpeedAssaultUid !== actor?.uid || b.selectedCardIndex != null || b.selectedSkillCard || !target) return false;
    if (!BattleSystem.selectPrepareSkill(state, "神速之袭") || !BattleSystem.chooseTarget(state, targetUid)) return false;
    await playSelectedCard(() => BattleSystem.skipPrepareSkill(state, render)); return true;
  } catch (err) { battleActionError("神速之袭处理失败", err); return false; }
}
async function tryDirectMimic(targetUid) {
  try {
    const b = state.battle, actor = BattleSystem.active(b), target = b?.allies.concat(b.enemies).find(u => u.uid === targetUid && u.hp > 0);
    if (!b || b.phase !== 1 || b.awaitingMimicUid !== actor?.uid || b.selectedCardIndex != null || b.selectedSkillCard || !target || target.uid === actor.uid) return false;
    if (!BattleSystem.selectMimic(state) || !BattleSystem.chooseTarget(state, targetUid)) return false;
    await playSelectedCard(() => BattleSystem.skipPrepareSkill(state, render)); return true;
  } catch (err) { battleActionError("模仿之音处理失败", err); return false; }
}
async function tryDimensionTransfer(targetUid) {
  try {
    const actionState = state, b = actionState.battle;
    if (!b?.dimensionTransfer
      || window.MannySkills?.dimensionTransferVisible?.(b) === false) return false;
    const target = targetUid == null ? null : b.enemies.find(u => u.uid === targetUid && u.hp > 0);
    if (targetUid != null && !target) return false;
    if (!await BattleSystem.resolveDimensionTransfer(actionState, targetUid, render)) return false;
    if (window.state !== actionState) return true;
    if (BattleEffects.settlementBlocked?.(actionState)) {
      render(); persist({ battleOperation: true }); return true;
    }
    render(); persist({ battleOperation: true }); return true;
  } catch (err) { battleActionError("次元转移处理失败", err); return true; }
}
async function confirmMannyArmory() {
  try {
    const b = state.battle, actor = BattleSystem.active(b), card = b?.selectedSkillCard;
    if (!b || !actor || !card || BattleEffects.animating) return;
    if (b.pendingTargetUid == null) b.pendingTargetUid = actor.uid;
    await playSelectedCard();
  } catch (err) { battleActionError("次元军火库确认失败", err); }
}
function chooseMannyWeapon(weaponId) {
  const b = state.battle, actor = b && BattleSystem.active(b);
  if (!b?.mannyArmoryPicker || !actor || actor.uid !== b.mannyArmoryPicker.uid || actor.usedMannyArmory) return;
  MannySkills.activateArmory(state, actor, weaponId); BattleSystem.checkEnd(state);
  render(); setTimeout(() => persist({ battleOperation: true }), 0);
}
function chooseWendyTutorCard(name) {
  if (!state.battle?.wendyTutorPicker || state.battle.wendyTutorPicker.cardName) return;
  if (WendyCadicisSkills.chooseTutorCard(state, name)) render();
}
function chooseWendyTutorTarget(uid) {
  if (!state.battle?.wendyTutorPicker?.cardName) return;
  if (!WendyCadicisSkills.chooseTutorCard(state, null, uid)) return;
  BattleSystem.checkEnd(state); render(); setTimeout(() => persist({ battleOperation: true }), 0);
}
function chooseAilengDrillTarget(uid) {
  if (!state.battle?.ailengDrillPicker) return;
  if (!GuestCharacterSkills.resolveBattleDrill(state, uid)) return;
  BattleSystem.checkEnd(state); render(); setTimeout(() => persist({ battleOperation: true }), 0);
}
async function chooseCadicisGive(index) {
  const actionState = state;
  if (!actionState.battle?.cadicisResponsibility
    || window.WendyCadicisSkills?.responsibilityVisible?.(
      actionState.battle) === false) return;
  if (!WendyCadicisSkills.resolveResponsibility(actionState, index)) return;
  render(); await BattleEffects.whenIdle?.();
  if (window.state !== actionState) return;
  if (actionState.battle?.cadicisResponsibility) {
    render(); setTimeout(() => persist({ battleOperation: true }), 0); return;
  }
  await BattleSystem.continueAfterCadicisResponsibility(actionState, render);
  if (window.state !== actionState) return;
  BattleSystem.checkEnd(actionState); render();
  setTimeout(() => persist({ battleOperation: true }), 0);
}
