window.AppHallBindings = (() => {
  function bind(ctx) {
    const { getState, lockControl, preserveClickedCardScroll, preserveInteractionScroll, updateModalState } = ctx;
    document.querySelectorAll("[data-start]").forEach(b => b.onclick = () => AppActionGuard.run("出征失败", ({ isCurrent }) => startMission(b.dataset.start, b.dataset.difficulty, isCurrent), { control: b, busyText: "出征中…", captureRun: false }));
    document.querySelectorAll("[data-test-ally]").forEach(b => b.onclick = e => { if (e.target.closest("[data-open-relic-equip], .relic-inline-picker")) return; preserveClickedCardScroll(b, "data-test-ally", b.dataset.testAlly, () => toggleTestPick("testAllies", b.dataset.testAlly)); });
    document.querySelectorAll("[data-test-enemy]").forEach(b => b.onclick = () => preserveClickedCardScroll(b, "data-test-enemy", b.dataset.testEnemy, () => toggleTestPick("testEnemies", Number(b.dataset.testEnemy))));
    document.querySelectorAll("[data-test-difficulty]").forEach(b => b.onclick = () => { if (lockControl(b)) setTestDifficulty(b.dataset.testDifficulty); });
    document.querySelectorAll("[data-test-card]").forEach(b => b.onclick = () => preserveInteractionScroll(() => { if (lockControl(b)) toggleTestLoose("testCards", b.dataset.testCard); }));
    document.querySelectorAll("[data-test-relic]").forEach(b => b.onclick = () => preserveInteractionScroll(() => { if (lockControl(b)) toggleTestLoose("testRelics", b.dataset.testRelic); }));
    document.querySelectorAll("[data-test-cards-all]").forEach(b => b.onclick = () => preserveInteractionScroll(() => { if (lockControl(b)) setAllTestCards(b.dataset.testCardsAll === "add"); }));
    document.querySelectorAll("[data-test-relics-all]").forEach(b => b.onclick = () => preserveInteractionScroll(() => { if (lockControl(b)) setAllTestRelics(b.dataset.testRelicsAll === "add"); }));
    document.querySelector("[data-start-test-battle]")?.addEventListener("click", e => AppActionGuard.run("测试战斗启动失败", ({ isCurrent }) => startTestBattle(isCurrent), { control: e.currentTarget, busyText: "进入中…", captureRun: false }));
    document.querySelectorAll("[data-unlock]").forEach(b => b.onclick = () => AppActionGuard.run("角色孕育失败", ({ state, isCurrent }) => unlockChar(b.dataset.unlock, state, isCurrent), { control: b, captureRun: false, key: `unlock:${b.dataset.unlock}` }));
    bindUnlockCompletes();
    document.querySelectorAll("[data-deck-filter]").forEach(b => b.onclick = () => updateModalState(() => { getState().deckFilter = b.dataset.deckFilter; }, { persist: false }));
    document.querySelectorAll("[data-card-codex]").forEach(b => b.onclick = () => updateModalState(() => { const state = getState(); state.cardCodex = !state.cardCodex; }, { persist: false }));
    document.querySelectorAll("[data-codex-card]").forEach(b => { b.onclick = () => updateModalState(() => { getState().selectedCodexCard = b.dataset.codexCard; }, { persist: false }); });
    document.querySelectorAll("[data-skin-filter]").forEach(b => b.onclick = () => updateModalState(() => { getState().skinFilterChar = b.dataset.skinFilter || null; }, { persist: false }));
    document.querySelectorAll("[data-test-skin]").forEach(b => b.onclick = () => preserveInteractionScroll(() => updateModalState(() => { SkinSystem.testEquip(getState(), b.dataset.testSkinChar, b.dataset.testSkin); })));
    bindShopAndBounty(ctx);
    document.querySelectorAll("[data-equip-relic]").forEach(b => b.onclick = () => { if (lockControl(b)) updateModalState(() => equipRelic(Number(b.dataset.equipRelic), true)); });
    document.querySelectorAll("[data-smelt-relic]").forEach(b => b.onclick = () => AppActionGuard.run("饰品拆解失败", ({ state }) => smeltRelic(Number(b.dataset.smeltRelic), false, state), { control: b, captureRun: false, key: "inventory-operation" }));
    document.querySelectorAll("[data-toggle-party]").forEach(c => c.onclick = e => { if (e.target.closest("[data-open-skin-char]")) return; e.stopPropagation(); if (lockControl(c)) toggleParty(c.dataset.toggleParty); });
    document.querySelectorAll("[data-open-skin-char]").forEach(b => b.onclick = e => { e.stopPropagation(); updateModalState(() => { const state = getState(); state.hallModal = "skins"; state.skinFilterChar = b.dataset.openSkinChar; }, { persist: false }); });
    window.bindBattleActionButtons?.();
  }
  function bindUnlockCompletes() {
    const bind = (selector, action) => document.querySelector(selector)?.addEventListener("click", e => {
      AppActionGuard.run("剧情完成失败", () => action?.(), {
        control: e.currentTarget, busyText: "保存中…",
        captureRun: false, key: "unlock-event-completion",
      });
    });
    bind("[data-first-defeat-complete]", () => window.HallUnlockEvents?.complete("firstDefeat"));
    bind("[data-second-defeat-complete]", () => window.HallUnlockEvents?.complete("secondDefeat"));
    bind("[data-miller-unlock-complete]", () => window.HallUnlockEvents?.complete("millerUnlock"));
    bind("[data-gerlot-unlock-complete]", () => window.HallUnlockEvents?.complete("gerlotUnlock"));
    bind("[data-cadicis-unlock-complete]", () => window.HallUnlockEvents?.complete("cadicisUnlock"));
    bind("[data-luka-unlock-complete]", () => window.HallUnlockEvents?.complete("lukaUnlock"));
    bind("[data-little-elrana-unlock-complete]", window.completeLittleElranaUnlockEvent);
    bind("[data-ace-unlock-complete]", window.completeAceUnlockEvent);
    bind("[data-underwater-train-unlock-complete]", window.completeUnderwaterTrainUnlockEvent);
    bind("[data-ophelia-unlock-complete]", window.completeOpheliaUnlockEvent);
    bind("[data-besta-nursery-unlock-complete]", window.completeBestaNurseryUnlockEvent);
    bind("[data-orc-dungeon-unlock-complete]", window.completeOrcDungeonUnlockEvent);
    bind("[data-sonia-nursery-unlock-complete]", window.completeSoniaNurseryUnlockEvent);
    bind("[data-chiyo-recruit-unlock-complete]", window.completeChiyoRecruitUnlockEvent);
    bind("[data-gerda-nursery-unlock-complete]", window.completeGerdaNurseryUnlockEvent);
    bind("[data-hoshino-family-unlock-complete]", window.completeHoshinoFamilyUnlockEvent);
  }
  function bindShopAndBounty({ getState, render, persist, lockControl, preserveInteractionScroll, updateModalState, askGameConfirm, log }) {
    document.querySelectorAll("[data-shop-refresh]").forEach(b => b.onclick = () => preserveInteractionScroll(() => AppActionGuard.run("商店刷新失败", async ({ state, isCurrent }) => { const ok = await ShopSystem.refresh(state); if (!isCurrent()) return false; log(ok ? "商店库存已刷新。" : "商店刷新失败，请稍后重试。"); render(); if (ok) await persist({ flush: true }); return ok; }, { control: b, busyText: "刷新中…", captureRun: false, key: "shop-operation" })));
    document.querySelectorAll("[data-shop-buy]").forEach(b => b.onclick = () => preserveInteractionScroll(() => AppActionGuard.run("商店购买失败", async ({ state, isCurrent }) => { await ShopSystem.buy(state, Number(b.dataset.shopBuy)); if (!isCurrent()) return false; render(); await persist({ flush: true }); return true; }, { control: b, captureRun: false, key: "shop-operation" })));
    document.querySelectorAll("[data-shop-delete]").forEach(b => b.onclick = () => preserveInteractionScroll(() => AppActionGuard.run("商店删牌失败", async ({ state, isCurrent }) => { await ShopSystem.deleteCard(state, Number(b.dataset.shopDelete), { inventoryRecovery: b.dataset.inventoryRecovery === "1" }); if (!isCurrent()) return false; render(); await persist({ flush: true }); return true; }, { control: b, captureRun: false, key: "inventory-operation" })));
    document.querySelectorAll("[data-buy-skin]").forEach(b => b.onclick = () => { const skin = SkinSystem.byId(b.dataset.buySkin); if (!skin) return; askGameConfirm({ title: `兑换皮肤：${skin.name}`, text: `消耗 ${SkinSystem.price(skin)} 精华宝珠兑换“${skin.name}”？兑换后会立即装备。`, confirmText: "兑换", previewArt: skin.art, previewName: skin.name, onConfirm: () => preserveInteractionScroll(() => AppActionGuard.run("皮肤兑换失败", async ({ state, isCurrent }) => { const ok = await window.ServerCore.call("buySkin", { id: skin.id }, state); if (!isCurrent()) return false; if (ok.changed) { SkinSystem.markAppearance(state); log(`已兑换并装备皮肤：${skin.name}。`); await persistAppearanceNow(state); await persist({ flush: true }); } else log(ok.message || "皮肤兑换未生效。"); render(); return ok.changed; }, { captureRun: false })) }); });
    document.querySelectorAll("[data-equip-skin]").forEach(b => b.onclick = () => preserveInteractionScroll(() => AppActionGuard.run("皮肤装备失败", async ({ state, isCurrent }) => { const skin = SkinSystem.byId(b.dataset.equipSkin); if (!skin) return false; const ok = await window.ServerCore.call("equipSkin", { id: skin.id }, state); if (!isCurrent()) return false; if (ok.changed) { SkinSystem.markAppearance(state); log(`已装备皮肤：${skin.name}。`); await persistAppearanceNow(state); await persist(); } else log(ok.message || "皮肤装备未生效。"); render(); return ok.changed; }, { control: b, captureRun: false })));
    document.querySelectorAll("[data-bounty-accept]").forEach(b => b.onclick = () => preserveInteractionScroll(() => { if (!lockControl(b, "已接取")) return; updateModalState(() => { const task = BountySystem.acceptTask(getState(), b.dataset.bountyAccept); if (task) log(`已接取任务：${BountySystem.title(task)}。`); }); }));
    document.querySelectorAll("[data-bounty-abandon]").forEach(b => b.onclick = () => { const state = getState(), task = state.bounties?.find(x => x.id === b.dataset.bountyAbandon); if (!task) return; askGameConfirm({ title: "放弃任务", text: `放弃任务“${BountySystem.title(task)}”？`, confirmText: "放弃", danger: true, onConfirm: () => preserveInteractionScroll(() => updateModalState(() => { BountySystem.abandonTask(getState(), b.dataset.bountyAbandon); log(`已放弃任务：${BountySystem.title(task)}。`); })) }); });
  }
  return { bind };
})();
