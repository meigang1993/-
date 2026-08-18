function bindActions() {
  const safeBind = (label, done) => {
    try { done(); }
    catch (err) { console.error(`${label} bind failed:`, err.message, err.stack); }
  };
  safeBind("global info", bindGlobalInfoActions);
  safeBind("scroll guard", bindGlobalScrollGuard);
  safeBind("runtime error", () => window.AppRuntimeErrors?.bind?.());
  document.oncontextmenu = closeContextPanel;
  document.onkeydown = e => {
    if (window.AppRuntimeErrors?.handleKeydown?.(e)) return;
    if (window.RelicUI?.handleKeydown?.(e, state, render)) return;
    if (e.key !== "Escape") return;
    const finish = action => {
      e.preventDefault();
      e.stopPropagation();
      action();
    };
    const click = selector => {
      const control = document.querySelector(selector);
      if (!control) return false;
      finish(() => control.click());
      return true;
    };
    if (click(".game-confirm-overlay [data-confirm-cancel]")) return;
    if (click(".save-confirm [data-confirm-cancel],.save-confirm [data-notice-ok]")) return;
    if (SaveSlots.isOpen()) return finish(() => { SaveSlots.close(); render(); });
    if (state.artZoom) return finish(() => { state.artZoom = null; render(); });
    if (state.infoUnit) return finish(closeInfoUnit);
    if (state.cardCodex) return finish(() => { state.cardCodex = false; render(); });
    if (settingsOpen) return finish(() => { settingsOpen = false; render(); });
    if (creditsOpen) return finish(closeCreditsPanel);
    if (click(".villa-modal .info-close")) return;
    if (battleLogOpen) return finish(() => { battleLogOpen = false; render(); });
    if (state.battle?.selectedCardIndex != null || state.battle?.selectedSkillCard) {
      return finish(cancelBattleSelect);
    }
    if (window.SuccubusCodex?.closeTop?.(state)) finish(render);
  };
  $("settings-toggle").onclick = () => { settingsOpen = !settingsOpen; battleLogOpen = false; render(); };
  const saveCtx = { getState: () => state, setState, render, log,
    closeSettings: () => { settingsOpen = false; },
    openSettings: () => { settingsOpen = true; },
    closeStart: () => { startOpen = false; } };
  safeBind("save slots", () => SaveSlots.bind(saveCtx));
  safeBind("confirm dialog", () => GameConfirm.bind({ state: () => state, render, persist }));
  document.querySelector("[data-close-settings]")?.addEventListener("click", () => { settingsOpen = false; SaveSlots.close(); render(); });
  document.querySelector("[data-settings-overlay]")?.addEventListener("click", e => {
    if (e.target !== e.currentTarget) return;
    settingsOpen = false; SaveSlots.close(); render();
  });
  document.querySelectorAll("[data-dismiss-speech]").forEach(el => el.addEventListener("click", e => { e.stopPropagation(); BattleLines.dismiss(state); render(); }));
  document.querySelector(".battle-screen")?.addEventListener("click", e => {
    const testRetreat = state.battle?.test && e.target.closest("[data-retreat]");
    const interactive = e.target.closest("button,[role='button'],[data-card-index],[data-target],.skill");
    if (!state.battle?.speech?.dismissible || testRetreat
      || interactive
      || e.target.closest("[data-dismiss-speech], .battle-tools, .battle-log-panel")) return;
    e.preventDefault(); e.stopPropagation(); BattleLines.dismiss(state); render();
  }, true);
  document.querySelector("[data-start-game]")?.addEventListener("click", startNewGame);
  document.querySelector("[data-start-retry-load]")?.addEventListener("click", continueGame);
  document.querySelector("[data-start-load]")?.addEventListener("click", async () => { window.GameBGM?.unlock?.(); window.BattleFX?.unlockAudio?.(); await SaveSlots.open("load", render); });
  document.querySelector("[data-start-settings]")?.addEventListener("click", () => { window.GameBGM?.unlock?.(); window.BattleFX?.unlockAudio?.(); settingsOpen = true; render(); });
  document.querySelector("[data-open-settings]")?.addEventListener("click", e => { e.stopPropagation(); window.GameBGM?.unlock?.(); window.BattleFX?.unlockAudio?.(); battleLogOpen = false; settingsOpen = true; render(); });
  document.querySelector("[data-open-battle-log]")?.addEventListener("click", e => { e.stopPropagation(); settingsOpen = false; battleLogOpen = true; battleLogFollowLatest = true; render(); });
  document.querySelector("[data-close-battle-log]")?.addEventListener("click", e => { e.stopPropagation(); battleLogOpen = false; render(); });
  document.querySelector(".battle-log-panel")?.addEventListener("contextmenu", e => { e.preventDefault(); e.stopPropagation(); battleLogOpen = false; render(); });
  document.querySelector("[data-open-credits]")?.addEventListener("click", () => { window.GameBGM?.unlock?.(); window.BattleFX?.unlockAudio?.(); creditsOpen = true; creditsClosing = false; render(); });
  document.querySelector("[data-close-credits]")?.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); closeCreditsPanel(); });
  document.querySelector("[data-credits-overlay]")?.addEventListener("click", e => { if (e.target === e.currentTarget) closeCreditsPanel(); });
  document.querySelector(".credits-panel")?.addEventListener("click", e => e.stopPropagation());
  if (creditsOpen && !document.querySelector(".credits-overlay")?.contains(document.activeElement)) {
    requestAnimationFrame(() => document.querySelector("[data-close-credits]")?.focus({ preventScroll: true }));
  }
  document.querySelectorAll("[data-save-game]").forEach(button => button.addEventListener("click", async () => { await SaveSlots.open("save", render); }));
  document.querySelector("[data-retry-save]")?.addEventListener("click", e => AppActionGuard.run("云存档重试失败", async ({ isCurrent }) => { await GameStore.retryDirty().then(() => { saveWarningShown = false; }).catch(err => { console.warn("retry save failed:", err.message, err.stack); saveWarningShown = true; log("云存档重试失败，请稍后再试。"); }); if (isCurrent()) render(); }, { control: e.currentTarget, busyText: "保存中…", captureRun: false }));
  document.querySelector("[data-retry-slot-save]")?.addEventListener("click", e => AppActionGuard.run("存档同步失败", async ({ state: actionState, isCurrent }) => { await GameStore.retrySlotSave(actionState).then(() => log("存档位与主档副本已全部同步。")).catch(err => { console.warn("slot sync retry failed:", err.code, err.message, err.stack); log("存档副本同步仍未完成，请稍后重试。"); }); if (isCurrent()) render(); }, { control: e.currentTarget, busyText: "同步中…", captureRun: false }));
  document.querySelector("[data-retry-settings]")?.addEventListener("click", e => AppActionGuard.run("设置读取重试失败", async ({ isCurrent }) => {
    try {
      const settings = await GameStore.retrySettings();
      if (!isCurrent()) return false;
      const applySavedAppearance = window.SkinSystem?.applySavedAppearance;
      applySavedAppearance?.(state, settings);
      const appearanceUpdatedAt = state.settings?.appearanceUpdatedAt || 0;
      const equippedSkins = {
        ...(state.settings?.equippedSkins || state.equippedSkins || {}),
      };
      state.settings = {
        ...state.settings,
        ...settings,
        ...(applySavedAppearance ? { appearanceUpdatedAt, equippedSkins } : {}),
      };
      GameBGM.setVolume(settings.musicVolume);
      window.dzmm?.toast?.success?.("设置已恢复同步");
      render();
      return true;
    } catch (err) {
      console.warn("settings reload failed:", err.code, err.message, err.stack);
      if (isCurrent()) render();
      return false;
    }
  }, { control: e.currentTarget, busyText: "读取中…", captureRun: false }));
  document.querySelector("[data-repair-main]")?.addEventListener("click", e => AppActionGuard.run("主存档修复失败", async ({ isCurrent }) => { await GameStore.repairMain().then(() => log("损坏的主存档副本已修复。")).catch(err => { console.warn("main repair failed:", err.code, err.message, err.stack); log(`主存档修复失败：${err.storage === "cloud" ? "云端不可写" : "本地不可写"}。`); }); if (isCurrent()) render(); }, { control: e.currentTarget, busyText: "修复中…", captureRun: false }));
  document.querySelectorAll("[data-retry-settlement]").forEach(button => button.addEventListener("click", e => AppActionGuard.run("附加结算重试失败", async ({ state: actionState, isCurrent }) => { const ok = await DungeonRewards.retryPending(actionState); if (!isCurrent()) return false; log(ok ? "附加结算已全部补齐。" : "附加结算仍未完成，请稍后重试。"); render(); await persist({ flush: true }); return ok; }, { control: e.currentTarget, busyText: "结算中…", captureRun: false, key: "shop-operation" })));
  document.querySelectorAll("[data-load-game]").forEach(button => button.addEventListener("click", async () => { await SaveSlots.open("load", render); }));
  document.querySelector("[data-fullscreen]")?.addEventListener("click", async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else if (document.fullscreenEnabled && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen(); else alert("当前预览沙箱不允许游戏内部全屏，请使用 Preview 面板自带的全屏按钮。"); } catch (err) { console.warn("fullscreen failed:", err.message, err.stack); alert("全屏被浏览器或预览沙箱拦截，请使用 Preview 面板自带的全屏按钮。"); } });
  document.querySelector("[data-settings-retreat]")?.addEventListener("click", () => {
    if (!state.explore || state.view === "battle") return;
    askGameConfirm({
      title: "确认撤退", text: "本次获得资源将带回据点，全体恢复满血。", confirmText: "撤退", danger: true,
      onConfirm: () => AppActionGuard.run("副本撤退失败", async ({ state: actionState, isCurrent }) => {
        await DungeonSystem.retreat(actionState);
        if (!isCurrent()) return false;
        settingsOpen = false;
        render();
        await persist({ flush: true });
        return true;
      }, { allowRunExit: true }),
    });
  });
  document.querySelector("[data-sfx-volume]")?.addEventListener("input", e => { state.settings.sfxVolume = Number(e.target.value); window.BattleFX?.unlockAudio?.(); persistSettingsSoon(); });
  document.querySelector("[data-music-volume]")?.addEventListener("input", e => { state.settings.musicVolume = Number(e.target.value); GameBGM.setVolume(state.settings.musicVolume); persistSettingsSoon(); });
  document.querySelectorAll("[data-sfx-volume], [data-music-volume]").forEach(input => input.addEventListener("change", persistSettingsNow));
  document.querySelectorAll("[data-battle-speed]").forEach(input => input.addEventListener("change", e => {
    const actionState = state;
    window.BattleEffectAnimation.setSpeed(actionState, e.target.value)
      .then(changed => { if (changed) persistSettingsNow(); })
      .catch(err => console.error("战斗倍速切换失败:", err.message, err.stack));
  }));
  document.querySelector("[data-manual-response]")?.addEventListener("change", e => { state.settings.manualResponse = e.target.checked; persistSettingsNow(); });
  document.querySelectorAll("[data-view]").forEach(b => b.onclick = () => setView(b.dataset.view));
  document.querySelectorAll("[data-open-modal]").forEach(b => b.onclick = () => { state.hallModal = b.dataset.openModal; if (state.hallModal !== "skins") state.skinFilterChar = null; render(); });
  document.querySelector("[data-close-modal]")?.addEventListener("click", closeHallModal);
  document.querySelector(".villa-modal")?.addEventListener("click", e => { if (e.button !== 0 || e.target !== e.currentTarget || !["bounty", "updates"].includes(state.hallModal)) return; e.preventDefault(); closeHallModal(); });
  document.querySelectorAll("[data-art-src]").forEach(el => el.onclick = e => { if (!el.closest(".info-art") && !el.closest(".active-portrait-shell") && !el.closest(".skin-preview")) return; e.stopPropagation(); state.artZoom = { src: el.dataset.artSrc, name: el.dataset.artName }; render(); });
  document.querySelector("[data-close-art]")?.addEventListener("click", () => { state.artZoom = null; render(); });
  document.querySelector(".art-zoom-frame")?.addEventListener("click", e => e.stopPropagation());
  safeBind("relic ui", () => window.AppHallBindings
    && RelicUI.bind({ $, state: () => state, updateModalState, persist }));
  safeBind("succubus codex", () => window.SuccubusCodex?.bind?.({ $, state: () => state, update: done => { done(); render(); } }));
  safeBind("hall buttons", () => window.AppHallBindings && bindHallButtons());
  safeBind("dungeon actions", () => window.bindDungeonActions?.());
  safeBind("battle select", () => window.bindBattleSelect?.());
  safeBind("relic system", () => RelicSystem.bind(state, render, persist));
}
