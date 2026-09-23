window.UICommonRelics = deps => {
  const { esc } = deps;

  function relicLabel(name, prefix = "") {
    const relic = RelicSystem.data(name);
    if (!relic) return "";
    const tip = esc(RelicSystem.statText(name));
    return `<span class="relic-name" data-tooltip="${tip}"><i class="relic-skill-icon" aria-hidden="true">${esc(RelicSystem.skillIcon(name))}</i>${esc(prefix)}${esc(relic.name)}</span>`;
  }

  function relicDetail(relic) {
    return `<div class="codex-detail"><b>${esc(relic.name)}</b><p>标签：${esc(RelicSystem.typeName(relic.name))}饰品</p><p>效果：${esc(relic.effect)}</p><p>提示：${esc(RelicSystem.useHint(relic.name))}</p><p class="muted">${esc(relic.lore)}</p><p class="drop-source">掉落来源 - ${esc(relic.source)}</p></div>`;
  }

  function relicCodex(state) {
    const owned = RelicSystem.ownedNames(state);
    const selected = state.selectedCodexRelic;
    const items = RelicSystem.all(state).map(relic =>
      `<button type="button" class="codex-relic ${owned.has(relic.name) ? "owned" : "locked"} ${selected === relic.name ? "active" : ""}" data-codex-relic="${esc(relic.name)}">${relicLabel(relic.name)}</button>`
    ).join("");
    const picked = selected && RelicSystem.data(selected);
    return `<div class="codex-overlay"><section class="codex-panel relic-codex-pop" role="dialog" aria-modal="true" aria-labelledby="relic-codex-title"><button type="button" class="info-close" data-relic-codex="close" aria-label="关闭饰品图鉴">×</button><h3 id="relic-codex-title">饰品图鉴</h3><p class="muted">悬停饰品查看中央浮字，点击可固定详情；未获得饰品会灰色显示。</p><div class="codex-grid">${items}</div>${picked ? relicDetail(picked) : `<p class="muted">选择一个饰品查看完整说明。</p>`}</section></div>`;
  }

  return { relicLabel, relicCodex };
};
