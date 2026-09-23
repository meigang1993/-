window.bindDungeonActions = function bindDungeonActions() {
  document.querySelectorAll("[data-dungeon-node]").forEach(b => b.onclick = () => AppActionGuard.run("进入副本节点失败", async ({ state: actionState, run: actionRun, isCurrent }) => {
    const nodeId = b.dataset.dungeonNode;
    const ownsRun = () => isCurrent() && actionState.explore === actionRun;
    const ownsNode = () => ownsRun() && actionRun?.pending === nodeId;
    const restoreNode = async (err = null) => {
      if (!ownsNode()) return false;
      if (err) console.error("dungeon node entry failed:", err.message, err.stack);
      const failedBattle = actionState.battle;
      if (failedBattle?.exploration && failedBattle.nodeId === nodeId) {
        clearTimeout(failedBattle.testRecoveryTimer);
        window.BattleLines?.cancel?.(actionState);
        window.BattleEffects?.cancel?.(actionState);
        window.BattleFX?.cancel?.(actionState);
        window.BattleActionGuard?.reset?.();
        actionState.battle = null;
      }
      DungeonSystem.rollbackPending(actionState, nodeId);
      actionRun.keepScroll = true;
      actionState.view = "dungeon";
      actionState.loadingBattleName = null;
      actionState.loadingBattleProgress = null;
      if (err) actionState.log.unshift(`进入副本节点失败：${err.message || "未知错误"}`);
      render();
      await persist({ flush: true });
      return true;
    };
    window.GameBGM?.unlock?.(); window.BattleFX?.unlockAudio?.();
    rememberDungeonScroll(true);
    const r = DungeonSystem.enter(actionState, nodeId);
    if (!r?.battle) { if (ownsNode()) actionRun.keepScroll = true; if (ownsNode()) { render(); await persist({ flush: true }); } return true; }
    actionState.view = "battleLoading"; actionState.loadingBattleName = "副本战斗"; actionState.loadingBattleProgress = null; render();
    let encounterHandled;
    try {
      encounterHandled = await window.tryLittleElranaEncounter?.(actionState, r.context, ownsNode);
    } catch (err) {
      await restoreNode(err);
      return false;
    }
    if (encounterHandled) {
      if (ownsNode()) await restoreNode();
      else if (isCurrent()) { render(); await persist({ flush: true }); }
      return true;
    }
    try {
      if (!ownsNode()) return false;
      const missionId = actionRun.missionId;
      window.GameBGM?.primeBattle?.(window.GameBGM?.battleTrack?.(missionId, r.context.enemies));
      if (window.GameBundles) await window.GameBundles.load("battle", { state: actionState, ...r.context });
      if (!ownsNode()) return false;
      window.BattleFX?.unlockAudio?.();
      await BattleSystem.start(actionState, missionId, render, {
        ...r.context,
        isCurrent: ownsNode,
      });
    } catch (err) {
      await restoreNode(err);
      return false;
    }
    if (ownsNode()) { render(); await persist({ flush: true, battleStart: true }); }
    return true;
  }, { control: b, busyText: "进入中…", allowRunExit: true }));
  document.querySelector("[data-dungeon-retreat]")?.addEventListener("click", () => {
    askGameConfirm({
      title: "确认撤退", text: "本次获得资源将带回据点，全体恢复满血。", confirmText: "撤退", danger: true,
      onConfirm: () => AppActionGuard.run("副本撤退失败", async ({ state: actionState, isCurrent }) => {
        await DungeonSystem.retreat(actionState);
        if (!isCurrent()) return false;
        render();
        await persist({ flush: true });
        return true;
      }, { allowRunExit: true }),
    });
  });
  document.querySelectorAll("[data-dungeon-inventory]").forEach(button => button.addEventListener("click", () => {
    const pressure = window.GameStoreSaveLimits.pendingInventoryPressure(state);
    state.inventoryCleanupTab = pressure.relics.needed && !pressure.cards.needed ? "relics" : "cards";
    state.view = "dungeonInventory";
    render();
  }));
  document.querySelectorAll("[data-inventory-tab]").forEach(button => button.addEventListener("click", () => {
    state.inventoryCleanupTab = button.dataset.inventoryTab === "relics" ? "relics" : "cards";
    render();
  }));
  document.querySelector("[data-return-dungeon]")?.addEventListener("click", () => {
    state.inventoryCleanupTab = null;
    state.view = "dungeon";
    render();
  });
  document.querySelector("[data-node-claim]")?.addEventListener("click", e => {
    if (e.target.dataset.nodeClaim !== "chest") return;
    AppActionGuard.run("宝箱结算失败", async ({ state: actionState, isCurrent }) => {
      rememberDungeonScroll(true);
      await DungeonSystem.chest(actionState);
      if (!isCurrent()) return false;
      render();
      await persist({ flush: true });
      return true;
    }, { control: e.currentTarget });
  });
  document.querySelectorAll("[data-rest-choice]").forEach(b => b.onclick = () => {
    AppActionGuard.run("休整结算失败", async ({ state: actionState, isCurrent }) => {
      rememberDungeonScroll(true);
      await DungeonSystem.rest(actionState, b.dataset.restChoice === "full");
      if (!isCurrent()) return false;
      render();
      await persist({ flush: true });
      return true;
    }, { control: b });
  });
  document.querySelector("[data-reward-confirm]")?.addEventListener("click", e => {
    AppActionGuard.run("奖励确认失败", async ({ state: actionState, isCurrent }) => {
      rememberDungeonScroll(true);
      DungeonSystem.confirmReward(actionState);
      if (!isCurrent()) return false;
      render();
      await persist({ flush: true });
      return true;
    }, { control: e.currentTarget });
  });
  document.querySelector("[data-dungeon-finish]")?.addEventListener("click", e => {
    AppActionGuard.run("通关结算失败", async ({ state: actionState, isCurrent }) => {
      await DungeonSystem.finish(actionState);
      if (!isCurrent()) return false;
      render();
      await persist({ flush: true });
      return true;
    }, { control: e.currentTarget, busyText: "结算中…", allowRunExit: true });
  });
};
