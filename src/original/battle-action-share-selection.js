function shareCurrent(actionState, battle, key, prompt, allowCleared = false) {
  return window.state === actionState && actionState.battle === battle
    && (battle?.[key] === prompt || allowCleared && battle?.[key] == null);
}

async function resolveGerdaComfort(targetUid) {
  const actionState = state;
  const battle = actionState.battle;
  const prompt = battle?.gerdaComfort;
  if (!prompt) return false;
  const valid = targetUid && battle.allies.some(unit =>
    unit.uid === targetUid && unit.uid !== prompt.unitUid && unit.hp > 0);
  if (targetUid && !valid) return false;
  if (!shareCurrent(actionState, battle, "gerdaComfort", prompt)) return false;
  await BattleSystem.resolveGerdaComfort(actionState, targetUid, render);
  if (!shareCurrent(actionState, battle, "gerdaComfort", prompt, true)) return false;
  render();
  persist({ battleOperation: true });
  return true;
}

async function resolveKaiichiShare(targetUid) {
  const actionState = state;
  const battle = actionState.battle;
  const prompt = battle?.kaiichiShare;
  if (!prompt) return false;
  const valid = targetUid && (prompt.indexes || []).length > 0
    && battle.allies.some(unit => unit.uid === targetUid && unit.uid !== prompt.unitUid && unit.hp > 0);
  if (targetUid && !valid) return false;
  if (!shareCurrent(actionState, battle, "kaiichiShare", prompt)) return false;
  await BattleSystem.resolveKaiichiShare(actionState, targetUid, render);
  if (!shareCurrent(actionState, battle, "kaiichiShare", prompt, true)) return false;
  render();
  persist({ battleOperation: true });
  return true;
}

async function resolveNewMoonShare(targetUid) {
  const actionState = state;
  const battle = actionState.battle;
  const prompt = battle?.newMoonShare;
  if (!prompt) return false;
  const valid = targetUid
    && battle.allies.some(unit => unit.uid === targetUid && unit.uid !== prompt.unitUid && unit.hp > 0);
  if (targetUid && !valid) return false;
  if (!shareCurrent(actionState, battle, "newMoonShare", prompt)) return false;
  await BattleSystem.resolveNewMoonShare(actionState, targetUid, render);
  if (!shareCurrent(actionState, battle, "newMoonShare", prompt, true)) return false;
  render();
  persist({ battleOperation: true });
  return true;
}

async function resolveMillerShare(targetUid) {
  const actionState = state;
  const battle = actionState.battle;
  const prompt = battle?.millerShare;
  if (!prompt) return false;
  const valid = targetUid
    && battle.allies.some(unit => unit.uid === targetUid && unit.uid !== prompt.unitUid && unit.hp > 0);
  if (targetUid && !valid) return false;
  if (!shareCurrent(actionState, battle, "millerShare", prompt)) return false;
  await BattleSystem.resolveMillerShare(actionState, targetUid, render);
  if (!shareCurrent(actionState, battle, "millerShare", prompt, true)) return false;
  render();
  persist({ battleOperation: true });
  return true;
}
