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

// 战斗演练（艾伦格）交牌：与半魅魔血/新月之歌同口径，点击队友直接交出。
// 原先走居中弹窗选人，现统一为「提示条 + 点队友」，弹窗已删除。
async function resolveAilengDrill(targetUid) {
  const actionState = state;
  const battle = actionState.battle;
  const prompt = battle?.ailengDrillPicker;
  if (!prompt) return false;
  const valid = targetUid
    && battle.allies.some(unit => unit.uid === targetUid
      && unit.uid !== prompt.actorUid && unit.hp > 0);
  if (targetUid && !valid) return false;
  if (!shareCurrent(actionState, battle, "ailengDrillPicker", prompt)) return false;
  const ok = window.GuestAilengSkills?.resolveBattleDrill?.(actionState, targetUid);
  if (!ok) return false;
  if (!shareCurrent(actionState, battle, "ailengDrillPicker", prompt, true)) return false;
  render();
  persist({ battleOperation: true });
  return true;
}

// 窃取（凯瑟琳）：指定敌方角色后不再弹居中窗口，改为点击我方其他角色决定接收者，
// 与战斗演练、解答迷惑交牌保持同一口径（放弃按钮走 chooseCatherineReceiver(null)）。
async function resolveCatherineSteal(targetUid) {
  const actionState = state;
  const battle = actionState.battle;
  const prompt = battle?.catherineStealPicker;
  if (!prompt || !targetUid) return false;
  const valid = battle.allies.some(unit => unit.uid === targetUid
    && unit.uid !== prompt.actorUid && unit.hp > 0);
  if (!valid) return false;
  if (!shareCurrent(actionState, battle, "catherineStealPicker", prompt)) return false;
  if (!window.CatherineSkills?.chooseReceiver?.(actionState, targetUid)) return false;
  if (!shareCurrent(actionState, battle, "catherineStealPicker", prompt, true)) return false;
  render();
  persist({ battleOperation: true });
  return true;
}

// 渴血杀戮（米尔尤拉）：选定牌名后不再弹第二层窗口，改为点击敌方角色
// 打出该牌名的虚拟牌（不消耗杀意）。牌名只能从牌库挑，故牌名阶段仍保留弹窗。
async function resolveMieryulaBloodthirst(targetUid) {
  const actionState = state;
  const battle = actionState.battle;
  const prompt = battle?.mieryulaBloodthirstPicker;
  if (!prompt?.cardName || !targetUid) return false;
  const ctx = { useCard: window.BattleSystem?.useCard };
  if (!window.MieryulaSkills?.useBloodthirstVirtual?.(actionState, targetUid, ctx)) {
    return false;
  }
  if (window.state !== actionState || actionState.battle !== battle) return false;
  BattleSystem.checkEnd(actionState);
  render();
  persist({ battleOperation: true });
  return true;
}

async function resolveWendyTutor(targetUid) {
  const actionState = state;
  const battle = actionState.battle;
  const prompt = battle?.wendyTutorPicker;
  if (!prompt?.cardName || !targetUid) return false;
  if (!window.WendyCadicisSkills?.chooseTutorCard?.(actionState, null, targetUid)) {
    return false;
  }
  if (window.state !== actionState || actionState.battle !== battle) return false;
  BattleSystem.checkEnd(actionState);
  render();
  persist({ battleOperation: true });
  return true;
}
