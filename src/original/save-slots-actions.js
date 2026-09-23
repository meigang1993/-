window.SaveSlotsActions = deps => {
  const View = window.SaveSlotsView;

  async function retrySave(state, render, log) {
    try {
      await GameStore.retrySlotSave(state);
      log("存档副本已全部同步。");
      await deps.reload(render);
      deps.notice("存档修复完成", render);
    } catch (err) {
      const result = View.savedCopies(err.results);
      console.error("slot retry failed:", err.code, err.message, JSON.stringify(result), err.stack);
      deps.notice(
        `仍有副本未同步：${result.failed.join("、") || "未知副本"}`,
        render, () => retrySave(state, render, log), "再次重试"
      );
    }
  }
  async function saveTo(slotId, state, render, log, covered) {
    try {
      await GameStore.saveSlot(slotId, state);
      log(covered ? `存档 ${slotId} 已覆盖。` : `已保存到存档 ${slotId}。`);
      await deps.reload(render);
      deps.notice(covered ? "存档已覆盖" : "存档成功", render);
    } catch (err) {
      const result = View.savedCopies(err.results);
      console.error("slot save failed:", err.code, err.message, JSON.stringify(result), err.stack);
      if (err.code === "SAVE_PARTIAL") {
        const message = `存档已部分保存。已写入：${result.ok.join("、")}；待修复：${result.failed.join("、")}。`;
        log(message);
        await deps.reload(render);
        deps.notice(message, render, () => retrySave(state, render, log), "修复同步");
      } else {
        log(`存档失败：${result.failed.join("、") || "所有副本"}均未完成写入。`);
        deps.notice("存档未写入，请检查存储权限或网络后重试", render);
      }
    }
  }
  async function loadFrom(slotId, ctx, source = null) {
    const initialState = ctx.getState();
    let isCurrent = window.AppRuntimeErrors?.guard?.(initialState)
      || (() => ctx.getState() === initialState);
    try {
      const liveSettings = ctx.getState()?.settings;
      const automatic = slotId === "auto";
      const loaded = automatic
        ? await GameStore.loadAuto(source) : await GameStore.loadSlot(slotId, source);
      if (!isCurrent()) return false;
      if (!loaded) {
        deps.notice("此存档位为空", ctx.render);
        return;
      }
      const settingsChanged = reconcileLoadedSettings(loaded, liveSettings, !automatic);
      await window.GameBundles?.ensureState?.(loaded);
      if (!isCurrent()) return false;
      let syncPending = false;
      let syncDetails = null;
      if (!automatic || source) {
        try {
          await GameStore.promoteLoaded(loaded);
        } catch (syncError) {
          syncDetails = View.mainCopies(syncError.results);
          if (!syncDetails.ok.length) throw syncError;
          syncPending = true;
          console.warn("loaded main sync pending:", syncError.code, syncError.message, syncError.stack);
        }
        if (!isCurrent()) return false;
        if (loaded._needsSaveAfterMigration) delete loaded._needsSaveAfterMigration;
      } else if (loaded._needsSaveAfterMigration) {
        try {
          await GameStore.persistMigration(loaded);
        } catch (syncError) {
          syncDetails = View.mainCopies(syncError.results);
          syncPending = true;
          console.warn("loaded migration sync pending:",
            syncError.code, syncError.message, syncError.stack);
        }
        if (!isCurrent()) return false;
      }
      ctx.setState(loaded);
      isCurrent = window.AppRuntimeErrors?.guard?.(loaded)
        || (() => ctx.getState() === loaded);
      let settingsPending = false;
      if (settingsChanged) {
        try {
          await GameStore.saveSettings(loaded.settings);
        } catch (settingsError) {
          settingsPending = settingsError.code !== "SETTINGS_SAVE_SUPERSEDED";
          console.warn("loaded settings sync failed:",
            settingsError.code, settingsError.message, settingsError.stack);
        }
      }
      if (!isCurrent()) return false;
      deps.close();
      if (settingsPending) ctx.openSettings?.();
      else ctx.closeSettings();
      ctx.closeStart?.();
      const syncText = automatic && !source
        ? syncPending ? "，读档修复待同步" : ""
        : syncPending
          ? `，主存档部分同步（已写入${syncDetails.ok.join("、")}；${syncDetails.failed.join("、")}待重试）`
          : "，并已同步为主存档";
      const settingsText = settingsPending ? "，设置待同步" : "";
      const slotName = automatic ? "自动存档" : `存档 ${slotId}`;
      ctx.log(`已读取${slotName}${source ? `（${source === "local" ? "本地" : "云端"}副本）` : ""}${syncText}${settingsText}。`);
      ctx.render();
      return true;
    } catch (err) {
      if (!isCurrent()) return false;
      console.error("slot load failed:", err.message, err.stack);
      const message = err.code === "CLOUD_LOAD_FAILED" || err.code === "STORAGE_UNAVAILABLE"
        ? "存档位读取失败，请检查网络后重试"
        : String(err.code || "").startsWith("SAVE_")
          ? "存档已读取，但主存档写入失败，请检查存储权限或网络后重试"
          : /(?:存档|自动存档)副本(?:损坏|不存在)/.test(err.message || "")
            ? err.message : "存档位无效或数据不可用";
      ctx.log(`读档失败：${message}。`);
      deps.notice(message, ctx.render);
      return false;
    }
  }
  async function deleteSlot(slotId, ctx) {
    try {
      await GameStore.deleteSlot(slotId);
    } catch (err) {
      console.error("slot delete failed:", err.message, err.stack);
      const message = String(err.code || "").startsWith("CLOUD_DELETE")
        ? "云端删除失败，存档未删除，请检查网络后重试"
        : "删除失败，存档副本仍保留，请稍后重试";
      ctx.log(`删除失败：${message}。`);
      deps.notice(message, ctx.render);
      return;
    }
    if (ctx.getState().currentSaveSlot === slotId) ctx.getState().currentSaveSlot = null;
    ctx.log(`存档 ${slotId} 已删除。`);
    await deps.reload(ctx.render);
  }
  return { saveTo, loadFrom, deleteSlot };
};
