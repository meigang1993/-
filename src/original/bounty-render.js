window.BountyRender = (() => {
  const icons = { hunt: "⚔", bond: "♡" };
  const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[m]));
  function title(task) { return task.type === "hunt" ? `讨伐 ${task.targetName}` : `羁绊 ${task.charName}`; }
  function missionName(id) { return (GameData.missions || []).find(m => m.id === id)?.name || id || "未知副本"; }
  function desc(task) { return task.type === "hunt" ? `击败${task.targetType === "boss" ? "BOSS" : "精英"}：${task.targetName}` : `${task.charName}全程存活并通关${missionName(task.missionId)}`; }
  function hint(task) { return task.type === "hunt" ? `接取后目标会出现在下一次${missionName(task.missionId)}地图中` : `出征队伍需包含${task.charName}，且不能被击倒`; }
  function status(task) { return task.failed ? "需重新接取" : task.accepted ? "进行中" : "可接取"; }
  function rewardText(r = {}) { return r.type === "card" ? `卡牌：${r.card?.name || "卡牌"}` : r.type === "relic" ? `饰品：${r.relic || "饰品"}` : `精华宝珠 +${r.essence || 0}`; }
  function bonusText(t) { return t.bonusGold ? `<span class="tag">追加莉莉丝元：+${esc(t.bonusGold)}</span>` : ""; }
  function taskCard(t, count, max, ensureReward, state) {
    const disabled = !t.accepted && count >= max;
    ensureReward(t, state);
    const id = esc(t.id);
    return `<div class="bounty-card ${t.accepted ? "accepted" : ""} ${t.failed ? "failed" : ""}"><b><span>${icons[t.type]}</span>${esc(title(t))}</b><p>${esc(desc(t))}</p><div class="bounty-meta"><span class="tag">${esc(status(t))}</span><span class="tag">奖励：${esc(rewardText(t.reward))}</span>${bonusText(t)}</div><small>${esc(hint(t))}</small><div class="actions">${t.accepted ? `<button class="ghost" data-bounty-abandon="${id}">放弃</button>` : `<button data-bounty-accept="${id}" ${disabled ? "disabled" : ""}>${disabled ? "已达上限" : "接取"}</button>`}</div></div>`;
  }
  function refreshCost() { return Number(window.GameEconomy?.bounty?.refreshCost) || 500; }
  // 任务界面与商店共用同一个刷新按钮，保证文案、价格、禁用条件完全一致。
  function refreshButton(state, { count, max } = {}) {
    const cost = refreshCost();
    const gold = Number(state?.resources?.gold) || 0;
    const taken = Number.isFinite(count) ? count : (state.bounties || []).filter(t => t?.accepted).length;
    const limit = Number.isFinite(max) ? max : (window.BountyTasks?.maxCount?.(state) || 4);
    const full = taken >= limit;
    const disabled = full || gold < cost;
    const label = full ? "已接满，无法刷新"
      : gold < cost ? `刷新任务：莉莉丝元不足（需${cost}）`
      : `刷新任务：${cost}莉莉丝元`;
    return `<button data-bounty-refresh="1" ${disabled ? "disabled" : ""}>${esc(label)}</button>`;
  }
  function render(state, api) {
    api.ensure(state);
    const taken = api.accepted(state, true), count = taken.length, max = api.maxCount?.(state) || 4;
    const items = state.bounties.map(t => taskCard(t, count, max, api.ensureReward, state)).join("");
    const details = taken.map(t => `<li><b>${esc(title(t))}</b><span>${esc(desc(t))}</span><em>${esc(status(t))}</em></li>`).join("") || `<li><span class="muted">暂无已接任务。</span></li>`;
    return `<h2>任务列表</h2><p class="muted">接取后再出征对应副本；讨伐目标会被强制安排到地图节点，羁绊任务要求指定角色全程存活并通关。</p><div class="bounty-head"><span class="tag">已接 ${count}/${max}</span><span class="tag">达成后自动结算</span><span class="tag">莉莉丝元 ${Number(state.resources?.gold) || 0}</span>${refreshButton(state, { count, max })}</div><p class="muted">刷新只会重摇未接取的任务，已接取的任务会保留。</p><div class="bounty-layout"><div class="bounty-list">${items}</div><aside class="bounty-detail"><h3>已接任务</h3><ul>${details}</ul></aside></div>`;
  }
  return { render, title, rewardText, refreshButton, refreshCost };
})();
