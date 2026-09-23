function updateParty(id, add) {
  const c = state.chars.find(x => x.id === id && !x.locked); if (!c) return;
  const change = () => {
    const current = (state.party || []).filter(pid => state.chars.some(c => c.id === pid && !c.locked)).slice(0, 4);
    if (add && current.length >= 4 && !current.includes(id)) { log("出战队伍已满，请先取消一名角色。"); return false; }
    if (!add && current.length <= 1 && current.includes(id)) { log("至少需要保留1名出战角色。"); return false; }
    state.party = add ? [...new Set([...current, id])].slice(0, 4) : current.filter(x => x !== id);
    if (!state.party.length) state.party = [id];
    return true;
  };
  if (state.hallModal === "teamRoster" && document.querySelector("[data-party-roster]")) {
    const changed = change();
    syncPartyRoster();
    if (changed) persist();
    return;
  }
  if (document.querySelector(".modal-card")) keepModalScroll(change);
  else { change(); render(); persist(); }
}
function syncPartyRoster() {
  const root = document.querySelector("[data-party-roster]");
  if (!root) return;
  const partyIds = new Set(state.party || []), full = partyIds.size >= 4;
  root.querySelectorAll(".team-card[data-toggle-party]").forEach(card => {
    const active = partyIds.has(card.dataset.toggleParty), blocked = full && !active;
    card.classList.toggle("in-party", active);
    card.classList.toggle("party-full", blocked);
    card.querySelector("[data-party-status]")?.replaceChildren(active ? "出战中" : blocked ? "队伍已满" : "点击参战");
    delete card.dataset.locked;
    card.style.removeProperty("pointer-events");
  });
  const count = root.querySelector("[data-party-count]");
  if (count) count.textContent = `当前出战 ${partyIds.size}/4`;
}
function toggleParty(id) {
  const inParty = (state.party || []).includes(id);
  updateParty(id, !inParty);
}
async function startMission(id, difficulty = "normal", actionCurrent = null) {
  const actionState = state;
  const isCurrent = () => window.state === actionState
    && (!actionCurrent || actionCurrent());
  if (actionState.sortieStarting) return;
  const m = GameData.missions.find(x => x.id === id);
  if (!m) return;
  if (!actionState.unlockedDifficulties.includes(difficulty)) return log("该难度尚未解锁。"), render();
  if (m.requiresFlag && !actionState.flags?.[m.requiresFlag]) return log(m.lockedHint || "该副本尚未解锁。"), render();
  if (!(actionState.party || []).length) return log("请先选择至少1名出战角色。"), render();
  if (m.kind === "dungeon" && window.GameBundles && !window.GameBundles.isReady("dungeon")) {
    actionState.sortieStarting = true; actionState.view = "dungeonConfirm"; actionState.loadingBattleName = `${m.name} · ${GameData.difficulties[difficulty]?.name || ""}远征`; render();
    try { await window.GameBundles.load("dungeon"); }
    catch (err) { if (!isCurrent()) return; actionState.view = "hall"; actionState.loadingBattleName = null; log("副本模块加载失败，请检查网络后重试。"); console.error("dungeon bundle load failed:", err.message, err.stack); render(); return; }
    finally { if (isCurrent()) actionState.sortieStarting = false; }
    if (!isCurrent()) return;
  }
  if (m.kind === "dungeon" && window.DungeonRewards?.pendingCount?.(actionState)) {
    actionState.sortieStarting = true;
    const recovered = await window.DungeonRewards.retryPending(actionState);
    if (!isCurrent()) return;
    if (!recovered) {
      actionState.sortieStarting = false;
      log("旧的附加结算尚未完成，请先重试结算再出征。");
      render();
      return;
    }
  }
  actionState.sortieStarting = true; actionState.hallModal = null;
  window.GameBGM?.unlock?.(); window.BattleFX?.unlockAudio?.();
  if (m.kind === "dungeon") {
    try {
      actionState.view = "dungeonConfirm"; actionState.loadingBattleName = `${m.name} · ${GameData.difficulties[difficulty]?.name || ""}远征`; render();
      const bounties = (actionState.bounties || []).filter(t => t.accepted && t.type === "hunt" && t.missionId === id).map(t => ({ targetId: t.targetId }));
      const runId = DungeonSystem.createFocusId?.(id, difficulty, actionState)
        || `${id}-${difficulty}-${window.GameRandom.persistentId("run-", actionState)}`;
      const ok = await window.ServerCore.call("startDungeon", { missionId: id, difficultyId: difficulty, bounties, runId }, actionState);
      if (!isCurrent()) return;
      if (!ok.ok) { actionState.explore = null; actionState.view = "hall"; log(ok.message || "进入副本失败，请稍后重试。"); return; }
      DungeonSystem.start(actionState, id, difficulty, runId);
      if (!actionState.explore) throw new Error("副本地图创建失败");
      actionState.flags.firstExpeditionStarted = true;
      if (!window.ServerCore?.offlineOnly?.() && ok.result?.core?.activeRun?.nodes) {
        DungeonSystem.applyServerPlan(actionState.explore, ok.result.core.activeRun, actionState);
      }
      actionState.view = "dungeon";
    } catch (err) {
      if (!isCurrent()) return;
      console.error("dungeon start failed:", err.message, err.stack);
      actionState.explore = null; actionState.view = "hall"; log(err.message || "进入副本失败，请刷新后重试。");
    } finally {
      if (isCurrent()) {
        actionState.sortieStarting = false; actionState.loadingBattleName = null;
        await persist({ flush: true });
        if (isCurrent()) render();
      }
    }
    return;
  }
  window.GameBGM?.primeBattle?.(window.GameBGM?.battleTrack?.(id, GameData.enemies[id]));
  actionState.view = "battleLoading"; actionState.loadingBattleName = m.name; actionState.loadingBattleProgress = null; render(); persist();
  try {
    if (window.GameBundles) await window.GameBundles.load("battle", { state: actionState, allyIds: actionState.party || [] });
    if (!isCurrent()) return;
    window.BattleFX?.unlockAudio?.();
    await BattleSystem.start(actionState, id, render, { isCurrent });
    if (!isCurrent()) return;
    actionState.sortieStarting = false;
    await persist({ flush: true, battleStart: true });
  } catch (err) {
    if (!isCurrent()) return;
    console.error("battle start failed:", err.message, err.stack);
    window.BattleFX?.leave?.(actionState); actionState.battle = null; actionState.sortieStarting = false;
    actionState.view = "hall"; actionState.loadingBattleName = null; actionState.loadingBattleProgress = null;
    log("进入战斗失败，请重试。请刷新后再试。"); render(); persist();
  } finally {
    if (isCurrent()) actionState.sortieStarting = false;
  }
}
