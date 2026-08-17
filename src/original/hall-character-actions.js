async function unlockChar(id, actionState = state, actionCurrent = null) {
  const c = actionState.chars.find(x => x.id === id);
  const ok = await window.ServerCore.call("unlockChar", { id }, actionState);
  if (ok.stale || actionCurrent && !actionCurrent()) return false;
  if (window.state !== actionState) return false;
  if (!ok.changed) { log(ok.message || "孕育未生效。"); render(); return; }
  actionState.codexFlashId = id; log(`孕育完成：${c?.name || "角色"} 加入队伍。`);
  if (id === "manny") window.HallUnlockEvents?.trigger("millerUnlock");
  if (id === "bertis") window.HallUnlockEvents?.trigger("gerlotUnlock");
  if (id === "wendy") window.HallUnlockEvents?.trigger("cadicisUnlock");
  if (id === "angelica") window.HallUnlockEvents?.trigger("lukaUnlock");
  if (id === "elrana") window.triggerAceUnlockEvent?.();
  if (id === "nanali") window.triggerUnderwaterTrainUnlockEvent?.();
  const saved = await persist({ flush: true });
  render();
  return saved;
}
