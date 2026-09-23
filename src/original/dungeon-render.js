window.DungeonRender = (() => {
  const rewardText = (run) => window.DungeonRewards?.rewardText(run) || `莉莉丝元${run.earned.gold} / 精华宝珠${run.earned.essence}`;
  const esc = s => String(s ?? "").replace(/[&<>"]/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));
  function panel(state, run) {
    const n = window.DungeonMap.nodes(run).find(x => x.id === run.pending);
    if (run.complete && !run.rewardPopup) return `<div class="reward-popup"><div class="reward-card"><h2>副本通关</h2><p>总奖励：${rewardText(run)}</p><div class="actions"><button data-dungeon-finish="1">返回据点</button><button class="ghost" data-dungeon-inventory="1">整理库存</button></div></div></div>`;
    if (n?.type === "rest") return `<div class="node-panel rest-center"><h2>休整</h2><p>全体恢复50%生命值</p><button data-rest-choice="team">确认</button></div>`;
    if (n?.type === "chest") return `<div class="reward-popup"><div class="reward-card"><h2>宝箱</h2><p>开启后仅获得莉莉丝元。</p><button data-node-claim="chest">开启宝箱</button></div></div>`;
    return "";
  }
  function rewardPopup(run) {
    if (!run.rewardPopup) return "";
    const r = run.rewardPopup, title = r.type === "boss" ? "BOSS战奖励" : r.type === "chest" ? "宝箱奖励" : "战斗胜利", items = [`<li><span>莉莉丝元</span><b>+${r.gold || 0}</b></li>`];
    if (r.essence) items.push(`<li><span>精华宝珠</span><b>+${r.essence}</b></li>`);
    if (r.experience) items.push(`<li><span>队伍经验</span><b>+${r.experience}</b></li>`);
    (r.progression || []).filter(item => item.levelsGained > 0).forEach(item => {
      const character = window.state?.chars?.find(candidate => candidate.id === item.id);
      items.push(`<li><span>${esc(character?.name || item.id)}</span><b>升至 Lv.${item.level}</b></li>`);
    });
    (r.cards || []).forEach(c => items.push(`<li><span>卡牌</span><b class="reward-name" title="${esc(c.text || "")}">${esc(c.name)} ${esc(c.suit)}</b></li>`));
    (r.relics || []).forEach(name => items.push(`<li><span>饰品</span><b class="reward-name">${window.UICommon?.relicLabel?.(name) || esc(name)}</b></li>`));
    return `<div class="reward-popup pink-settle"><div class="reward-card"><h2>${title}</h2><ul>${items.join("")}</ul><button data-reward-confirm="1">确认</button></div></div>`;
  }
  function render(state) {
    const run = state.explore, diff = GameData.difficulties[run.difficultyId], mission = GameData.missions.find(m => m.id === run.missionId);
    const layers = run.layers.slice().reverse();
    const map = layers.map((layer, index) => {
      const lower = layers[index + 1];
      const nodes = `<div class="map-layer" style="--node-count:${layer.length}" data-layer="${layer[0]?.layer || 0}">${layer.map(n => nodeHtml(run, n)).join("")}</div>`;
      return `${nodes}${lower ? linkHtml(run, lower, layer) : ""}`;
    }).join("");
    return `<div class="dungeon-screen ${run.keepScroll ? "no-enter-anim" : ""}"><button class="dungeon-retreat" data-dungeon-retreat="1">撤退</button><div class="dungeon-head"><div><h2>${mission?.name || "魔国机械工厂"}</h2><p class="muted">${diff.name}难度 · ${esc(mission?.subtitle || "自动化魔械生产线")}</p></div><span class="tag">层数 ${run.layers.length}</span><span class="tag">资源 ×${diff.reward}</span><span class="tag">本次探索待结算 ${run.earned.gold}</span><span class="tag">精华宝珠 ${run.earned.essence}</span><button class="ghost" data-dungeon-inventory="1">整理库存</button></div><div class="map-scroll-shell"><div class="tower-map">${map}</div></div>${panel(state, run)}${rewardPopup(run)}</div>`;
  }
  function linkHtml(run, lower, upper) {
    const lines = lower.flatMap(from => (from.next || []).map(id => {
      const to = upper.find(node => node.id === id);
      if (!to) return "";
      const passed = from.done && (to.done || run.current === to.id);
      const reachable = run.current === from.id && window.DungeonMap.canChoose(run, to.id);
      const state = passed ? "passed" : reachable ? "reachable" : "dormant";
      return `<line class="map-link ${state}" data-from="${esc(from.id)}" data-to="${esc(to.id)}" x1="${nodeX(from, lower)}" y1="100" x2="${nodeX(to, upper)}" y2="0"></line>`;
    })).join("");
    return `<svg class="map-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>`;
  }
  function nodeX(node, layer) {
    const index = Math.max(0, layer.indexOf(node));
    return (((index + .5) / Math.max(1, layer.length)) * 100).toFixed(2);
  }
  function nodeHtml(run, n) {
    const [icon, fallback] = window.DungeonMap.meta[n.type], cur = run.current === n.id, open = window.DungeonMap.canChoose(run, n.id), done = n.done;
    const baseLabel = done ? "已完成" : nodeLabel(n, fallback), label = `第${n.layer}层 · ${baseLabel}`;
    const blocked = !cur && !open && !done;
    const accent = n.type === "boss" ? window.DungeonIcons.render("crown", "node-accent boss-crown") : '<span class="node-accent"></span>';
    return `<button class="map-node ${n.type} ${n.bounty ? "bounty-target" : ""} ${cur ? "current" : ""} ${open ? "open" : ""} ${done ? "done" : ""} ${blocked ? "blocked" : ""}" data-dungeon-node="${n.id}" title="${esc(n.bounty?.title || label)}" aria-label="${esc(label)}" ${cur ? 'aria-current="step"' : ""} ${open ? "" : "disabled"}>${n.bounty ? `<i>任务</i>` : ""}<span class="node-icon" aria-hidden="true">${window.DungeonIcons.render(icon)}${accent}</span><span class="node-label">${esc(label)}</span></button>`;
  }
  function nodeLabel(n, fallback) {
    if (n.type === "normal") return "战斗";
    if (n.type === "elite") return (n.enemies || []).filter(e => e.type === "elite").map(e => e.name).join("、") || fallback;
    if (n.type === "boss") return (n.enemies || []).find(e => e.type === "boss")?.name || fallback;
    return fallback;
  }
  return { render, rewardPopup };
})();
