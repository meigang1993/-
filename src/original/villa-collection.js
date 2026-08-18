window.VillaCollectionUI = ({ U, cardTypeLabel }) => {
  const typeName = { all: "全部", slash: "杀牌", response: "响应牌", tactic: "战术牌", consume: "消耗牌", obstacle: "障碍牌" };
  function shop(state) {
    ShopSystem.ensure(state);
    const capacity = window.GameStoreSaveLimits.inventoryStatus(state).cards;
    const confirmed = ShopSystem.confirmed(state);
    const slots = confirmed ? state.shopCards : [];
    const goods = slots.map((slot, i) => goodCard(slot, i, state)).join("");
    const stockSize = ShopSystem.STOCK_SIZE(state);
    const pending = ShopSystem.refreshPending(state), needsRefresh = ShopSystem.needsRefresh(state);
    const retry = pending ? '<button data-retry-settlement="1">重试刷新</button>'
      : '<button data-shop-refresh="1">刷新库存</button>';
    const notice = pending || needsRefresh
      ? `<div class="empty-state"><p>${confirmed ? "商店刷新尚未完成，当前保留上次确认的库存。" : "商店库存不完整或尚未由核心确认，确认前不能购买。"}</p>${retry}</div>`
      : "";
    const empty = !goods && !notice ? '<div class="empty-state">暂无可用商品。</div>' : "";
    const full = capacity.remaining === 0 ? `<p class="muted">牌库已满，请先删除卡牌再购买或领取卡牌奖励。</p>` : "";
    return `<h2>别墅商店</h2><p class="muted">商店展示${stockSize}张卡牌；副本通关、撤退或全军覆没返回别墅时会全部刷新。购买后该位置变为已售。</p><div class="actions"><span class="tag">莉莉丝元 ${state.resources.gold}</span><span class="tag">库存 ${slots.filter(s => !s.sold).length}/${stockSize}</span><span class="tag">牌库 ${capacity.current}/${capacity.max}</span></div>${notice}${full}<div class="card-grid shop-grid">${goods || empty}</div><h3>删除卡牌服务</h3><p class="muted">固定费用${ShopSystem.DELETE_COST}莉莉丝元/次，不占用商品位。</p><div class="actions"><button data-open-modal="deleteDeck" ${state.resources.gold < ShopSystem.DELETE_COST || (state.deck || []).length <= 1 ? "disabled" : ""}>浏览牌库并删除</button></div>`;
  }
  function goodCard(slot, i, state) {
    const c = slot.card, cost = c.price || ShopSystem.BUY_COST;
    const full = window.GameStoreSaveLimits.inventoryStatus(state).cards.remaining === 0;
    return `<div class="card shop-card ${slot.sold ? "sold" : ""}"><b>${U.esc(c.suit)} ${U.esc(c.name)}</b><span class="tag">${cardTypeLabel(c)}</span><p class="muted">${U.esc(c.text)}</p><button data-shop-buy="${i}" ${slot.sold || full || state.resources.gold < cost ? "disabled" : ""}>${slot.sold ? "已售" : full ? "牌库已满" : `购买：${cost}莉莉丝元`}</button></div>`;
  }
  function deleteDeck(state, options = {}) {
    const recovery = !!options.inventoryRecovery, pressure = ShopSystem.recoveryPressure(state);
    const free = recovery && pressure.needed > 0;
    const deleteOptions = { ...options, context: ShopSystem.deletionContext(state, options) };
    const entries = recovery ? groupedDeleteCards(state.deck || []) : (state.deck || [])
      .map((card, index) => ({ card, index, count: 1 }));
    const cards = entries.map(({ card: c, index: i, count }) => {
      const ok = ShopSystem.canDeleteCard(state, i, deleteOptions), hint = deleteBlockHint(state, c, free);
      const label = free ? "免费删除并腾出牌位" : `删除：${ShopSystem.DELETE_COST}莉莉丝元`;
      return `<div class="card"><b>${U.esc(c.suit)} ${U.esc(c.name)}</b><span class="tag">${cardTypeLabel(c)}</span>${count > 1 ? `<span class="tag">持有×${count}</span>` : ""}<p class="muted">${U.esc(c.text)}</p>${ok ? "" : `<p class="muted">${U.esc(hint)}</p>`}<button data-shop-delete="${i}" ${recovery ? 'data-inventory-recovery="1"' : ""} ${ok ? "" : "disabled"}>${label}</button></div>`;
    }).join("");
    const recoveryText = free
      ? `待入库卡牌还需腾出 ${pressure.needed} 个牌位；所需清理次数内不收取莉莉丝元。`
      : "当前待入库卡牌已有足够空间，继续删除将按商店服务收费。";
    const back = recovery ? "" : '<button class="ghost" data-open-modal="shop">返回商店</button>';
    return `<h2>选择要删除的卡牌</h2><p class="muted">删除后不可恢复；初始牌受保护，不能通过服务删除。</p>${recovery ? `<p class="muted">${recoveryText}</p>` : ""}<div class="actions">${back}<span class="tag">莉莉丝元 ${state.resources.gold}</span><span class="tag">牌库 ${(state.deck || []).length}/${window.GameStoreSaveLimits.limits.lists.deck}</span></div><div class="card-grid">${cards}</div>`;
  }
  function groupedDeleteCards(cards) {
    const groups = new Map();
    cards.forEach((card, index) => {
      const key = `${card?.name || ""}|${card?.suit || ""}`;
      const group = groups.get(key);
      if (group) group.count += 1;
      else groups.set(key, { card, index, count: 1 });
    });
    return [...groups.values()];
  }
  function deleteBlockHint(state, card, free = false) {
    if (!free && (state.resources?.gold || 0) < ShopSystem.DELETE_COST) return "莉莉丝元不足。";
    if ((state.deck || []).length <= 1) return "至少需要保留一张牌。";
    const key = c => `${c?.name || ""}|${c?.suit || ""}`, cardKey = key(card);
    return (GameData.protectedBaseDeck || []).some(c => key(c) === cardKey) ? "基础牌受保护，不能删除。" : "当前不能删除。";
  }
  function skins(state) {
    SkinSystem.ensure(state);
    const filter = state.skinFilterChar, list = filter ? SkinSystem.forChar(filter) : SkinSystem.skins;
    const name = filter ? state.chars.find(c => c.id === filter)?.name : "";
    const tabs = `<div class="actions skin-tabs"><button class="ghost ${filter ? "" : "active"}" data-skin-filter="">全部</button>${state.chars.filter(c => !c.locked && SkinSystem.forChar(c.id).length).map(c => `<button class="ghost ${filter === c.id ? "active" : ""}" data-skin-filter="${U.esc(c.id)}">${U.esc(c.name)}</button>`).join("")}</div>`;
    const ownedCount = SkinSystem.skins.filter(s => SkinSystem.owned(state, s)).length;
    return `<h2>皮肤商店${name ? ` · ${U.esc(name)}` : ""}</h2><p class="muted">皮肤为纯外观内容，不附加属性。初始皮肤随角色解锁自动赠送，等级立绘达到条件后自动获得；测试战斗可试用未拥有的普通皮肤，等级特殊立绘需达到等级解锁。</p><div class="actions"><span class="tag">精华宝珠 ${state.resources.essence}</span><span class="tag">已拥有 ${ownedCount}/${SkinSystem.skins.length}</span></div>${tabs}<div class="card-grid skin-grid">${list.map(s => skinCard(state, s)).join("")}</div>`;
  }
  function skinCard(state, s) {
    const c = state.chars.find(x => x.id === s.charId), locked = !c || c.locked, owned = SkinSystem.owned(state, s), equipped = state.equippedSkins?.[s.charId] === s.id, cost = SkinSystem.price(s), enough = (state.resources?.essence || 0) >= cost;
    const action = locked ? `<button disabled>角色未解锁</button>` : owned ? `<button data-equip-skin="${s.id}" ${equipped ? "disabled" : ""}>${equipped ? "已装备" : "装备"}</button>` : s.unlockLevel ? `<button disabled>Lv.${s.unlockLevel} 解锁</button>` : `<button data-buy-skin="${s.id}" ${enough ? "" : "disabled"}>兑换：${cost}精华宝珠</button>`;
    const hidden = !!s.unlockLevel && !owned;
    const preview = hidden ? `<span class="skin-level-lock">Lv.${s.unlockLevel}</span>` : `<img src="${U.esc(s.art)}" alt="${U.esc(s.name)}" loading="lazy" decoding="async">`;
    const previewData = hidden ? "" : ` data-art-src="${U.esc(s.art)}" data-art-name="${U.esc(c?.name || s.charId)} · ${U.esc(s.name)}"`;
    const unlock = s.initial ? "随角色解锁" : s.unlockLevel ? `Lv.${s.unlockLevel} 自动解锁` : `${cost} 精华宝珠`;
    return `<div class="card skin-card ${owned ? "owned" : ""} ${equipped ? "equipped" : ""} ${state.skinFlash === s.id ? "skin-flash" : ""}"><div class="skin-preview"${previewData}>${preview}</div><b>${U.esc(c?.name || s.charId)} · ${U.esc(s.name)}</b><div class="skin-meta"><span class="tag">${SkinSystem.qualityName(s)}</span>${s.specialEffect ? `<span class="tag">专属特效</span>` : ""}<span class="tag">${unlock}</span>${equipped ? `<span class="tag">已装备</span>` : ""}</div><p class="muted">${U.esc(s.desc)}</p>${!s.unlockLevel && !owned && !enough && !locked ? `<p class="muted">宝珠不足。</p>` : ""}${action}</div>`;
  }
  function relics(state) {
    const groups = relicGroups(state), total = RelicSystem.normalizeNames(state.resources?.relics).length, equipped = RelicSystem.normalizeNames(Object.values(state.equipment || {}).flat()).length;
    const max = window.GameStoreSaveLimits.inventoryStatus(state).relics.max;
    const slots = state.chars.filter(c => !c.locked).map(c => relicCharCard(state, c)).join("") || `<div class="empty-state">暂无已解锁角色。</div>`;
    return `<h2>饰品栏</h2><p class="muted">库存只作为数量统计；点击角色空槽后，会在该角色当前位置展开饰品列表，面板会随当前饰品栏滚动。</p><div class="actions relic-summary"><span class="tag">库存 ${total}/${max}</span><span class="tag">已装备 ${equipped}</span><span class="tag">种类 ${groups.length}</span><button data-relic-codex="1">图鉴</button></div><h3>角色装备</h3><div class="card-grid relic-equip-grid">${slots}</div>`;
  }
  function relicCharCard(state, c) {
    const eq = RelicSystem.normalizeSlots(state.equipment[c.id]), count = eq.filter(Boolean).length;
    return `<div class="card relic-char-card"><div class="relic-char-head"><b>${U.esc(c.name)}</b><span class="tag">${count}/2</span></div><div class="relic-lines relic-slot-links">${[0, 1].map(i => `<button class="ghost relic-slot-link" data-open-relic-equip="${U.esc(c.id)}" data-open-relic-slot="${i}">${eq[i] ? U.relicLabel(eq[i], `${i + 1}. `) : `${i + 1}. 空槽`}</button>`).join("")}</div><em>点击空槽装备，点击已装备槽位卸下</em>${window.RelicUI?.picker?.(state, c.id) || ""}</div>`;
  }
  function relicGroups(state) { const groups = new Map(); RelicSystem.normalizeNames(state.resources?.relics).forEach(n => { if (!groups.has(n)) groups.set(n, []); groups.get(n).push(n); }); return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "zh-CN")); }
  function collectionCounts(cards, all = GameData.cardCodex || []) {
    const canonical = new Set(all.map(c => c?.name).filter(Boolean));
    const owned = new Set((cards || []).map(c => c?.name).filter(name => canonical.has(name)));
    return { owned, ownedTypes: owned.size, codexTypes: canonical.size };
  }
  function deck(state) {
    const cards = state.deck || [], filter = state.deckFilter || "all";
    const max = window.GameStoreSaveLimits.inventoryStatus(state).cards.max;
    const groups = deckGroups(cards.filter(c => filter === "all" || c.type === filter));
    const { ownedTypes, codexTypes } = collectionCounts(cards);
    const tabs = Object.entries(typeName).map(([k, n]) => `<button class="ghost ${filter === k ? "active" : ""}" data-deck-filter="${k}">${n}</button>`).join("");
    return `<h2>公共牌库</h2><p class="muted">实体卡总数：${cards.length}/${max} · 已收集种类：${ownedTypes}/${codexTypes}</p><div class="actions">${tabs}<button data-card-codex="1">图鉴</button></div><div class="card-grid">${groups.map(([name, list]) => deckGroupCard(name, list)).join("") || "<p>没有符合筛选的卡牌。</p>"}</div>${state.cardCodex ? cardCodex(state) : ""}`;
  }
  function deckGroups(cards) {
    const groups = new Map();
    cards.forEach(c => { const name = String(c?.name || "未知卡牌"); if (!groups.has(name)) groups.set(name, []); groups.get(name).push(c); });
    return [...groups.entries()].map(([n, list]) => [n, list.sort((a, b) => "♠♥♣♦".indexOf(a.suit) - "♠♥♣♦".indexOf(b.suit))]).sort(([a], [b]) => a.localeCompare(b, "zh-CN"));
  }
  function deckGroupCard(name, list) {
    const c = list[0], suits = list.map(x => `<span class="card-suit ${x.suit === "♥" || x.suit === "♦" ? "red-suit" : "black-suit"}">${U.esc(x.suit)}</span>`).join(" ");
    return `<div class="card"><b>${U.esc(name)}</b><span class="tag">${cardTypeLabel(c)}</span><span class="tag">持有×${list.length}</span><p class="muted">花色：${suits}</p><p class="muted">${U.esc(c.text)}</p></div>`;
  }
  function cardCodex(state) {
    const cards = state.deck || [], all = GameData.cardCodex || [], counts = collectionCounts(cards, all), owned = counts.owned, picked = all.find(c => c.name === state.selectedCodexCard) || all[0];
    const items = all.map(c => `<button class="codex-card ${owned.has(c.name) ? "owned" : "locked"} ${picked?.name === c.name ? "active" : ""}" data-codex-card="${U.esc(c.name)}" title="${cardTip(c)}"><b>${U.esc(c.name)}</b><span>${cardTypeLabel(c)}</span><em>${owned.has(c.name) ? "已获得" : "未获得"}</em></button>`).join("");
    return `<div class="codex-overlay card-codex-overlay"><section class="codex-panel card-codex-pop" role="dialog" aria-modal="true" aria-labelledby="card-codex-title"><button type="button" class="info-close" data-card-codex="close" aria-label="关闭卡牌图鉴">×</button><div class="codex-head"><h2 id="card-codex-title">卡牌图鉴</h2><span class="tag">已收集种类：${counts.ownedTypes}/${counts.codexTypes}</span><span class="tag">实体卡总数：${cards.length}</span></div><div class="card-codex-grid">${items}</div>${picked ? codexDetail(picked, owned.has(picked.name)) : ""}</section></div>`;
  }
  function cardTip(c) { return U.esc(`${c.name}\n类型：${cardTypeLabel(c)}\n花色：${c.suitsText}\n效果：${c.text}\n掉落来源：${c.source}`); }
  function codexDetail(c, owned) { return `<div class="codex-card-detail ${owned ? "" : "locked"}"><b>${U.esc(c.name)}</b><p>类型：${cardTypeLabel(c)}</p><p>花色：${U.esc(c.suitsText)}</p><p>效果：${U.esc(c.text)}</p><p class="drop-source">掉落来源 - ${U.esc(c.source)}</p></div>`; }
  return { shop, deleteDeck, skins, relics, deck };
};
