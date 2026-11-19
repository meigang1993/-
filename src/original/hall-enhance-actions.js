// 角色强化动作：与孕育/商店购买同口径，一律走 ServerCore 结算后再落盘。
// 单次只提升玩家指定的一项属性，属性键由面板按钮携带，缺键时 ServerCore 会拒绝。
async function enhanceCharacter(id, stat, actionState = state, actionCurrent = null) {
  const enhance = window.CharacterEnhance;
  // 面板按钮在副本/战斗中已置灰；这里再兜一道，防止绕过按钮直接触发时
  // 扣掉莉莉丝元却只改局外属性、副本与战斗快照不动（口径不一致）。
  // 判定统一走 CharacterEnhance.blockedReason；后半段是 bundle 漏装旧模块时的兜底。
  if (enhance?.blockedReason?.(actionState)
    || actionState.explore || String(actionState.view || "").startsWith("dungeon")
    || actionState.view === "battle") return false;
  const c = actionState.chars.find(x => x.id === id);
  const ok = await window.ServerCore.call("enhanceChar", { id, stat }, actionState);
  if (ok.stale || actionCurrent && !actionCurrent()) return false;
  if (window.state !== actionState) return false;
  if (!ok.changed) { log(ok.message || "强化未生效。"); render(); return false; }
  const after = enhance?.levelOf?.(actionState.chars.find(x => x.id === id), stat) || 0;
  const key = enhance?.NAMES?.[stat] || "属性";
  const bonus = enhance?.BONUS?.[stat] ?? 0;
  log(`角色强化完成：${c?.name || "角色"} 的${key}第 ${after} 次强化（${key}+${bonus}），消耗 ${enhance?.COST ?? 5000} 莉莉丝元。`);
  await persist({ flush: true });
  render();
  return true;
}
