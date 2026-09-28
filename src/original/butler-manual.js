window.ButlerManual = (() => {
  const U = window.UICommon;
  const P = window.ButlerManualProgress;
  const PORTRAIT = "./assets/images/butler-portrait.75f7a7f4.webp";
  const TABS = [
    { id: "boss", label: "讨伐目标" },
    { id: "elite", label: "精英目标" },
    { id: "hero", label: "魅魔目标" },
    { id: "explore", label: "探索目标" },
  ];

  function render(state) {
    const tab = TABS.some(t => t.id === state.butlerTab) ? state.butlerTab : "boss";
    const total = P.overall(state);
    const name = U.esc(P.BUTLER_NAME || "管家");
    return `<div class="butler-page"><header class="butler-top"><h2>管家手册</h2><button class="butler-close" data-close-butler="1" title="关闭" aria-label="关闭">×</button></header><main class="butler-body"><aside class="butler-left"><div class="butler-bubble"><span class="butler-speaker">${name}</span>${U.esc(P.line(state))}</div><div class="butler-portrait"><img src="${PORTRAIT}" alt="${name}" loading="lazy" decoding="async"></div><div class="butler-progress"><div class="butler-bar"><i style="width:${total.pct}%"></i></div><span>总完成度：${total.pct}%</span></div></aside><section class="butler-right"><nav class="butler-tabs">${TABS.map(t => `<button class="butler-tab ${t.id === tab ? "on" : ""}" data-butler-tab="${t.id}">${t.label}</button>`).join("")}</section><div class="butler-list" data-butler-list>${body(state, tab)}</div></section></main><footer class="butler-foot"><span class="butler-comment"><b>${name}：</b>${U.esc(P.comment(state))}</span><button class="butler-back" data-close-butler="1">返回别墅</button></footer></div>`;
  }

  function body(state, tab) {
    if (tab === "hero") return heroes(state);
    if (tab === "explore") return explore(state);
    const groups = tab === "boss" ? P.bossGroups(state) : P.eliteGroups(state);
    return groups.map(g => `<div class="butler-group"><h3>${U.esc(g.name)}</h3>${g.list.map(item => enemyRow(item)).join("")}</div>`).join("") || `<p class="muted">暂无记录。</p>`;
  }
  function enemyRow(item) {
    const marks = item.diffs.map(d => `<span class="butler-mark ${d.done ? "done" : ""}" title="${U.esc(d.name)}">${U.esc(d.name.slice(0, 2))}</span>`).join("");
    const done = item.diffs.every(d => d.done), some = item.diffs.some(d => d.done);
    return `<div class="butler-row ${done ? "all-done" : some ? "partial" : ""}"><span class="butler-box">${done ? "✓" : some ? "·" : ""}</span><b>${U.esc(item.name)}</b><span class="butler-marks">${marks}</span></div>`;
  }
  function heroes(state) {
    const list = P.heroList(state), maxed = list.filter(h => h.maxed).length;
    const grid = list.map(h => {
      const art = h.unlocked && h.art ? `<img src="${U.esc(h.art)}" alt="${U.esc(h.name)}" loading="lazy" decoding="async">` : `<span>${U.esc(h.face)}</span>`;
      return `<div class="butler-hero ${h.maxed ? "maxed" : ""} ${h.unlocked ? "" : "locked"}" title="${U.esc(h.name)}：当前等级 ${h.level} / ${P.MAX_LEVEL}">${art}<b>${U.esc(h.name)}</b><small>${h.level}/${P.MAX_LEVEL}</small></div>`;
    }).join("");
    return `<div class="butler-hero-grid">${grid}</div><p class="butler-sum">已满级：${maxed} / ${list.length}</p>`;
  }
  function explore(state) {
    const list = P.exploreList(state);
    return list.map(m => `<div class="butler-group"><h3>${U.esc(m.name)}</h3>${m.diffs.map(d => `<div class="butler-row ${d.done ? "all-done" : ""}"><span class="butler-box">${d.done ? "✓" : ""}</span><b>通关${U.esc(m.name)} - ${U.esc(d.name)}</b></div>`).join("")}</div>`).join("");
  }

  function bind(ctx) {
    const root = ctx.$("view");
    if (!root || root.dataset.butlerManual === "1") return;
    root.dataset.butlerManual = "1";
    root.addEventListener("click", e => click(e, ctx));
  }
  function click(e, ctx) {
    const state = ctx.state();
    const tab = e.target.closest("[data-butler-tab]");
    if (tab) return stop(e, () => ctx.update(() => { state.butlerTab = tab.dataset.butlerTab; }, { persist: false }));
    const close = e.target.closest("[data-close-butler]");
    if (close) return stop(e, () => ctx.update(() => { state.butlerManual = false; }));
    const open = e.target.closest("[data-open-butler]");
    if (open) return stop(e, () => ctx.update(() => { state.butlerManual = true; }));
  }
  function stop(e, fn) { e.preventDefault(); e.stopPropagation(); fn(); }

  return { render, bind };
})();
