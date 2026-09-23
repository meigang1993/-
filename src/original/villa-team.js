window.VillaTeamUI = (() => {
  const U = window.UICommon;
  function difficultyCard(state, mission, id, d) {
    const missionOpen = !mission.requiresFlag || state.flags?.[mission.requiresFlag];
    const unlocked = missionOpen && state.unlockedDifficulties.includes(id), ready = unlocked && (state.party || []).length && !state.sortieStarting, lock = unlocked ? "" : "<span class=\"difficulty-lock\">🔒</span>";
    const recommended = !state.flags?.firstExpeditionStarted && mission.id === "machine_factory" && id === "normal";
    const text = state.sortieStarting ? "出征中…" : !missionOpen ? "副本锁定" : unlocked ? ((state.party || []).length ? "确认出征" : "先选择队伍") : "未解锁";
    const hint = !missionOpen ? `<p class="muted">${U.esc(mission.lockedHint || "该副本尚未解锁。")}</p>` : "";
    return `<div class="card difficulty-card ${d.tone || "green"} ${unlocked ? "" : "locked"} ${recommended ? "recommended" : ""}">${lock}${recommended ? '<span class="recommended-badge">推荐首战</span>' : ""}<b>${d.name}</b>${hint}<p>怪物属性 ${d.attrText}</p><p>精英出现率 ${Math.round((d.eliteRate || 0) * 100)}%</p><p>莉莉丝元 ×${d.reward}</p><p>卡牌/饰品 ${Math.round(d.dropRate * 100)}%</p><button data-start="${mission.id}" data-difficulty="${id}" ${ready ? "" : "disabled"}>${text}</button></div>`;
  }
  function portrait(c) {
    const art = c.avatar || c.art;
    const title = U.esc(U.skillSummary(c));
    return art ? `<div class="portrait" title="${title}" data-art-src="${U.esc(art)}" data-art-name="${U.esc(c.name || "")}"><img src="${U.esc(art)}" alt="${U.esc(c.name || "角色")}" loading="lazy" decoding="async"></div>` : `<div class="portrait" title="${title}">${U.esc(c.face)}</div>`;
  }
  function team(state) {
    const unlocked = state.chars.filter(c => !c.locked);
    const party = state.party.map(id => unlocked.find(c => c.id === id)).filter(Boolean).map(c => {
      const shown = SkinSystem.applyToChar(state, c);
      return `<div class="party-avatar" data-toggle-party="${U.esc(c.id)}">${portrait(shown)}<b>${U.esc(c.name)}</b><span>点击取消</span></div>`;
    }).join("");
    const missions = GameData.missions.filter(m => m.kind === "dungeon");
    const blocks = missions.map(mission => `<section class="team-dungeon"><h3>副本：${U.esc(mission.name)}</h3><p class="muted">${U.esc(mission.subtitle || "通关后依次解锁下一难度；已解锁难度可重复挑战。")}</p><div class="difficulty-row">${Object.entries(GameData.difficulties).map(([id, d]) => difficultyCard(state, mission, id, d)).join("")}</div></section>`).join("");
    return `<h2>准备启程</h2><p class="muted">选择副本和难度后即可进入；角色编队从当前挑战栏打开，最多4人，至少保留1人。</p><div class="team-layout"><div class="party-drop"><div><b>当前挑战</b><small>出战角色 ${state.party.length}/4</small><div class="party-avatars">${party || "<span class=\"muted\">打开角色列表选择队伍</span>"}</div></div><div class="party-actions"><button data-open-modal="teamRoster">角色列表</button><button data-open-modal="testBattle" ${state.sortieStarting ? "disabled" : ""}>测试战斗</button></div></div>${blocks}</div>`;
  }
  function teamRoster(state) {
    const unlocked = state.chars.filter(c => !c.locked), partyIds = new Set(state.party || []), full = (state.party || []).length >= 4;
    const cards = unlocked.map(c => {
      const active = partyIds.has(c.id), blocked = full && !active, shown = SkinSystem.applyToChar(state, c), skin = shown.skinName ? `<span class="tag">皮肤：${U.esc(shown.skinName)}</span>` : "";
      return `<div class="card team-card ${active ? "in-party" : ""} ${blocked ? "party-full" : ""}" data-toggle-party="${U.esc(c.id)}">${portrait(shown)}<b>${U.esc(c.name)}</b><p class="role-line">${U.esc(c.role)}</p>${skin}<button class="ghost" data-open-skin-char="${U.esc(c.id)}">皮肤</button><span class="tag" data-party-status>${active ? "出战中" : blocked ? "队伍已满" : "点击参战"}</span></div>`;
    }).join("");
    return `<div data-party-roster><h2>角色列表</h2><p class="muted">点击头像可参战或取消；关闭后返回准备启程。</p><div class="team-drop roster-drop"><div class="team-grid">${cards || "<p>暂无已解锁角色。</p>"}</div></div><div class="actions test-start"><span class="tag" data-party-count>当前出战 ${state.party.length}/4</span><button data-open-modal="team">返回准备启程</button></div></div>`;
  }
  return { team, teamRoster };
})();
