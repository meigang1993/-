window.AppRenderPages = (() => {
  function battleLoading() {
    const p = state.loadingBattleProgress || {}, total = p.total || 0, done = Math.min(p.done || 0, total), pct = total ? Math.round(done / total * 100) : 12;
    return `<div class="battle-loading"><section class="battle-start-ui"><div class="gear-panel"><img src="./assets/images/battle-start-ui.webp" alt="机械齿轮启动"><span class="scan-line"></span></div><div class="battle-start-card"><span class="boot-label">COMBAT SYSTEM</span><h2>战斗系统启动</h2><p>${UICommon.esc(state.loadingBattleName || "战斗")} · ${total ? `加载素材 ${done}/${total}` : "正在准备素材…"}</p><div class="load-bar"><i style="width:${pct}%"></i></div><div class="boot-row"><b>${pct}%</b><span>本地战斗模块准备中</span></div><small>首次进入会稍慢，之后会使用缓存快速切换。</small></div></section></div>`;
  }
  function dungeonConfirm() {
    return `<div class="battle-loading dungeon-confirm"><section class="battle-start-ui"><div class="gear-panel"><img src="./assets/images/battle-start-ui.webp" alt="机械齿轮启动"><span class="scan-line"></span></div><div class="battle-start-card"><span class="boot-label">DUNGEON SYSTEM</span><h2>远征路线确认</h2><p>${UICommon.esc(state.loadingBattleName || "副本远征")} · 正在生成本地路线…</p><div class="load-bar indeterminate"><i></i></div><div class="boot-row"><b>LOCAL</b><span>本地远征模块准备中</span></div><small>副本路线与奖励将直接在本地结算。</small></div></section></div>`;
  }
  function nursery() {
    if (state.succubusCodex) return SuccubusCodex.render(state);
    const locked = state.chars.filter(c => c.locked && (c.unlockCost || 0) > 0 && nurseryReady(c));
    return `<div class="villa-page"><header class="villa-page-head nursery-head"><div><h2>孕育殿堂</h2><p class="muted">这里保存着尚未完成契约的同伴。将远征中夺回的精华宝珠注入魂能法阵，即可让她们从沉睡中醒来，带着新的技能加入队伍。</p></div><button class="ghost page-back" data-view="hall">返回首页</button><button class="ghost codex-entry" data-open-succubus-codex="1">魅魔图鉴</button><span class="tag">精华宝珠 ${state.resources.essence}</span></header><div class="villa-page-scroll"><div class="card-grid">${locked.map(nurseryCard).join("") || "<p>魂能契约已全部完成，殿堂中暂时没有新的同伴等待唤醒。</p>"}</div></div></div>`;
  }
  function nurseryReady(c) {
    if (c.unlockFlag) return !!state.flags?.[c.unlockFlag];
    return c.id !== "besta" || !!state.flags?.bestaNurseryUnlocked;
  }
  function nurseryCard(c) {
    const ready = nurseryReady(c), disabled = !ready || state.resources.essence < (c.unlockCost || 0);
    const hint = GameData.unlockHints?.[c.id] || `消耗精华宝珠 ×${c.unlockCost || 0}`;
    const note = ready ? `唤醒需要精华宝珠 ${c.unlockCost || 0} 颗` : "艾伦格在队首次通关水下列车后才会开放兑换";
    return `<div class="card portrait-card">${UICommon.face(c, true)}<b>${UICommon.esc(c.name)}</b><p class="role-line">${UICommon.esc(c.role)}</p><p class="unlock-line locked">未解锁 · ${UICommon.esc(hint)}</p><p class="muted">${UICommon.esc(note)}</p><button data-unlock="${UICommon.esc(c.id)}" ${disabled ? "disabled" : ""}>注入宝珠唤醒</button></div>`;
  }
  function furnace() {
    const cards = smeltCards();
    return `<div class="villa-page"><header class="villa-page-head page-head-actions"><div><h2>魂能熔炉</h2><p class="muted">拆解多余饰品，获得莉莉丝元；饰品效果会直接显示在列表中。</p></div><button class="ghost page-back" data-view="hall">返回首页</button><span class="tag">饰品库存 ${state.resources.relics.length}</span></header><div class="villa-page-scroll"><div class="card-grid">${cards || "<p>暂无可拆解饰品。</p>"}</div></div></div>`;
  }
  function smeltCards() {
    const groups = new Map();
    (state.resources.relics || []).forEach((relic, index) => {
      const name = RelicSystem.data(relic)?.name;
      if (!name) return;
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push({ relic, index });
    });
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "zh-CN"))
      .map(([name, list]) => `<div class="card"><b>${UICommon.relicLabel(name)}</b><span class="tag">持有×${list.length}</span><p class="muted">${UICommon.esc(RelicSystem.data(name).effect || "装备后生效。")}</p><button data-smelt-relic="${list[0].index}">拆解一件：+${GameEconomy.relic.smeltGold}莉莉丝元</button></div>`)
      .join("");
  }
  function dungeonInventory() {
    const pressure = window.GameStoreSaveLimits.pendingInventoryPressure(state);
    const tab = state.inventoryCleanupTab === "relics" ? "relics" : "cards";
    const tabs = `<div class="actions"><button class="${tab === "cards" ? "" : "ghost"}" data-inventory-tab="cards">删除卡牌</button><button class="${tab === "relics" ? "" : "ghost"}" data-inventory-tab="relics">拆解饰品</button></div>`;
    const summary = `<span class="tag">牌库 ${pressure.cards.current}/${pressure.cards.max}${pressure.cards.needed ? ` · 需腾出${pressure.cards.needed}` : ""}</span><span class="tag">饰品 ${pressure.relics.current}/${pressure.relics.max}${pressure.relics.needed ? ` · 需腾出${pressure.relics.needed}` : ""}</span>`;
    const content = tab === "cards"
      ? window.VillaUI.inventoryCards(state)
      : `<h2>选择要拆解的饰品</h2><p class="muted">拆解会腾出饰品库存并获得莉莉丝元，待入库奖励不会丢失。</p><div class="card-grid">${smeltCards() || "<p>暂无可拆解饰品。</p>"}</div>`;
    return `<div class="villa-page"><header class="villa-page-head page-head-actions"><div><h2>远征库存整理</h2><p class="muted">副本与待结算奖励已保留。腾出足够空间后返回远征，再次撤退或完成结算。</p>${tabs}</div><button class="ghost page-back" data-return-dungeon="1">返回远征</button><div class="actions">${summary}</div></header><div class="villa-page-scroll">${content}</div></div>`;
  }
  return { battleLoading, dungeonConfirm, nursery, furnace, dungeonInventory };
})();
