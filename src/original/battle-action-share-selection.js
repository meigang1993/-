async function resolveGerdaComfort(targetUid) {
  const battle = state.battle;
  const prompt = battle?.gerdaComfort;
  if (!prompt) return false;
  const valid = targetUid && battle.allies.some(unit =>
    unit.uid === targetUid && unit.uid !== prompt.unitUid && unit.hp > 0);
  if (targetUid && !valid) return false;
  await BattleSystem.resolveGerdaComfort(state, targetUid, render);
  render();
  persist({ battleOperation: true });
  return true;
}

async function resolveKaiichiShare(targetUid) {
  const battle = state.battle;
  const prompt = battle?.kaiichiShare;
  if (!prompt) return false;
  const valid = targetUid && (prompt.indexes || []).length > 0
    && battle.allies.some(unit => unit.uid === targetUid && unit.uid !== prompt.unitUid && unit.hp > 0);
  if (targetUid && !valid) return false;
  await BattleSystem.resolveKaiichiShare(state, targetUid, render);
  render();
  persist({ battleOperation: true });
  return true;
}

async function resolveNewMoonShare(targetUid) {
  const battle = state.battle;
  const prompt = battle?.newMoonShare;
  if (!prompt) return false;
  const valid = targetUid
    && battle.allies.some(unit => unit.uid === targetUid && unit.uid !== prompt.unitUid && unit.hp > 0);
  if (targetUid && !valid) return false;
  await BattleSystem.resolveNewMoonShare(state, targetUid, render);
  render();
  persist({ battleOperation: true });
  return true;
}

async function resolveMillerShare(targetUid) {
  const battle = state.battle;
  const prompt = battle?.millerShare;
  if (!prompt) return false;
  const valid = targetUid
    && battle.allies.some(unit => unit.uid === targetUid && unit.uid !== prompt.unitUid && unit.hp > 0);
  if (targetUid && !valid) return false;
  await BattleSystem.resolveMillerShare(state, targetUid, render);
  render();
  persist({ battleOperation: true });
  return true;
}
