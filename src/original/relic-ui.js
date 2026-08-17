window.RelicUI = (() => {
  const U = window.UICommon;
  let bound = false;
  let suppressCodexHover = false;
  function picker(state, requestedId = null) {
    const id = requestedId || state.relicEquipChar;
    if (!id) return "";
    if (requestedId && state.relicEquipChar !== requestedId) return "";
    const c = state.chars.find(x => x.id === id);
    if (!c) return "";
    const eq = equipmentOf(state, id);
    const slotIndex = validSlot(state.pendingRelicSlot) ? state.pendingRelicSlot : 0;
    const rawPool = state.hallModal === "testBattle" ? [...(state.resources?.relics || []), ...(state.testRelics || [])] : (state.resources?.relics || []);
    const pool = [...new Set(RelicSystem.normalizeNames(rawPool))];
    const items = pool.map(name => poolItem(state, name)).join("") || `<span class="muted">暂无可用饰品</span>`;
    const slot = i => `<button type="button" class="relic-slot ${eq[i] ? "equipped" : "empty"} ${slotIndex === i ? "selected" : ""}" data-relic-popup-slot="${i}">${eq[i] ? `${U.relicLabel(eq[i])}<em>点击卸下</em>` : `<b>＋</b><span>${i + 1}号空槽</span>`}</button>`;
    return `<div class="relic-inline-picker"><div class="relic-inline-picker-card"><button type="button" class="info-close" data-close-relic-equip="1">×</button><h3>${U.esc(c.name)} · 饰品换装</h3><p class="muted">选择槽位后，从下方饰品列表装备；点击已装备槽位可直接卸下。</p><div class="relic-slots">${slot(0)}${slot(1)}</div><h4>饰品列表</h4><div class="relic-picker-grid">${items}</div></div></div>`;
  }
  function poolItem(state, name) {
    const ownerId = RelicSystem.equippedBy(state, name);
    const owner = ownerId ? state.chars.find(c => c.id === ownerId)?.name : "";
    const count = RelicSystem.availableCount(state, name);
    return `<button type="button" class="relic-item ${owner ? "used" : ""}" data-popup-relic-item="${U.esc(name)}">${U.relicLabel(name)}<em>${owner ? `使用中：${U.esc(owner)}${count ? ` / 库存×${count}` : ""}` : `库存×${count}`}</em></button>`;
  }
  function bind(ctx) {
    if (bound) return;
    bound = true;
    document.addEventListener("click", e => handleClick(e, ctx));
    document.addEventListener("pointerover", showCodexHover);
    document.addEventListener("pointerout", hideCodexHover);
    document.addEventListener("pointermove", () => { suppressCodexHover = false; },
      { passive: true });
    document.addEventListener("focusin", showCodexHover);
    document.addEventListener("focusout", hideCodexHover);
  }
  function update(ctx, done, persist = false) {
    let changed = false;
    ctx.updateModalState(() => { changed = done() === true; }, { persist: false });
    if (persist && changed) ctx.persist();
  }
  function handleClick(e, ctx) {
    const state = ctx.state();
    const codexRelic = e.target.closest("[data-codex-relic]");
    if (codexRelic) return pickCodexRelic(e, ctx, codexRelic);
    const closeEquip = e.target.closest("[data-close-relic-equip]");
    if (closeEquip) return stop(e, () => update(ctx, () => closeEquipState(state)));
    const popupSlot = e.target.closest("[data-relic-popup-slot]");
    if (popupSlot) return stop(e, () => clickSlot(ctx, Number(popupSlot.dataset.relicPopupSlot)));
    const popupItem = e.target.closest("[data-popup-relic-item]");
    if (popupItem) return stop(e, () => equipRelic(ctx, popupItem.dataset.popupRelicItem));
    const codexBtn = e.target.closest("[data-relic-codex]");
    if (codexBtn) return stop(e, () => update(ctx, () => {
      closeEquipState(state);
      if (codexBtn.dataset.relicCodex === "close") closeCodex(state);
      else toggleCodex(state);
    }));
    if (e.target.classList.contains("codex-overlay")) {
      return stop(e, () => update(ctx, () => closeCodex(state)));
    }
    const equip = e.target.closest("[data-open-relic-equip]");
    if (equip) stop(e, () => keepModalAnchor(equip, () => openSlot(ctx, equip.dataset.openRelicEquip, Number(equip.dataset.openRelicSlot))));
  }
  function stop(e, fn) { e.preventDefault(); e.stopPropagation(); fn(); }
  function keepModalAnchor(el, fn) {
    const modal = el.closest(".modal-card"), beforeTop = modal ? el.getBoundingClientRect().top - modal.getBoundingClientRect().top : 0, beforeScroll = modal?.scrollTop || 0;
    fn();
    const apply = () => {
      const nextModal = document.querySelector(".modal-card"), next = [...document.querySelectorAll("[data-open-relic-equip]")].find(x => x.dataset.openRelicEquip === el.dataset.openRelicEquip);
      if (!nextModal) return;
      if (next) nextModal.scrollTop += next.getBoundingClientRect().top - nextModal.getBoundingClientRect().top - beforeTop;
      else nextModal.scrollTop = beforeScroll;
    };
    requestAnimationFrame(apply); setTimeout(apply, 0); setTimeout(apply, 80);
  }
  function pickCodexRelic(e, ctx, btn) {
    stop(e, () => {
      suppressCodexHover = true;
      removeCodexHover();
      const grid = document.querySelector(".relic-codex-pop .codex-grid");
      const top = grid?.scrollTop || 0;
      update(ctx, () => { ctx.state().selectedCodexRelic = btn.dataset.codexRelic; });
      requestAnimationFrame(() => {
        const next = document.querySelector(".relic-codex-pop .codex-grid");
        if (next) next.scrollTop = top;
      });
    });
  }
  function toggleCodex(state, close = false) {
    state.relicCodex = close ? false : !state.relicCodex;
    if (state.relicCodex && !RelicSystem.data(state.selectedCodexRelic)) {
      state.selectedCodexRelic = RelicSystem.all(state)[0]?.name || null;
    }
  }
  function closeCodex(state) {
    state.relicCodex = false;
    suppressCodexHover = false;
    removeCodexHover();
    return true;
  }
  function handleKeydown(e, state, render) {
    if (!state?.relicCodex) return false;
    const pop = document.querySelector(".relic-codex-pop");
    if (!pop) return false;
    if (e.key === "Escape") {
      e.preventDefault(); e.stopPropagation();
      closeCodex(state); render();
      return true;
    }
    if (e.key !== "Tab") return false;
    const controls = [...pop.querySelectorAll("button:not(:disabled),[href],[tabindex]:not([tabindex='-1'])")]
      .filter(control => control.getClientRects().length);
    if (!controls.length) return false;
    const first = controls[0], last = controls[controls.length - 1];
    if (e.shiftKey && (!pop.contains(document.activeElement) || document.activeElement === first)) {
      e.preventDefault(); last.focus(); return true;
    }
    if (!e.shiftKey && (!pop.contains(document.activeElement) || document.activeElement === last)) {
      e.preventDefault(); first.focus(); return true;
    }
    return false;
  }
  function openSlot(ctx, id, slot) {
    const state = ctx.state();
    if (!validSlot(slot) || !state.chars.some(c => c.id === id)) return;
    if (!equipmentOf(state, id)[slot]) return openEquip({ ...ctx, openSlot: slot }, id);
    update(ctx, () => {
      const changed = RelicSystem.unequip(state, id, slot);
      if (changed && state.relicEquipChar === id) state.pendingRelicSlot = slot;
      return changed;
    }, true);
  }
  function openEquip(ctx, id) {
    update(ctx, () => {
      const state = ctx.state(), c = state.chars.find(x => x.id === id);
      if (!c) return;
      const eq = equipmentOf(state, id), requested = Number(ctx.openSlot);
      state.relicEquipChar = id; state.relicCodex = false; state.infoUnit = null; state.infoTab = "stats";
      state.pendingRelicSlot = validSlot(requested) ? requested : (eq[0] && !eq[1] ? 1 : 0);
    });
  }
  function equipRelic(ctx, relic) {
    update(ctx, () => {
      const state = ctx.state(), id = state.relicEquipChar, slot = validSlot(state.pendingRelicSlot) ? state.pendingRelicSlot : 0;
      if (!state.chars.some(c => c.id === id)) return false;
      const changed = RelicSystem.equip(state, id, relic, slot);
      if (changed) state.pendingRelicSlot = slot === 0 ? 1 : slot;
      return changed;
    }, true);
  }
  function clickSlot(ctx, slot) {
    const state = ctx.state(), id = state.relicEquipChar;
    if (!validSlot(slot) || !state.chars.some(c => c.id === id)) return;
    if (equipmentOf(state, id)[slot]) unequipRelic(ctx, slot);
    else update(ctx, () => { state.pendingRelicSlot = slot; });
  }
  function unequipRelic(ctx, slot) {
    update(ctx, () => {
      const state = ctx.state(), id = state.relicEquipChar;
      if (!validSlot(slot) || !state.chars.some(c => c.id === id)) return false;
      const changed = RelicSystem.unequip(state, id, slot);
      if (changed) {
        const eq = equipmentOf(state, id);
        state.pendingRelicSlot = eq[0] ? 1 : 0;
      }
      return changed;
    }, true);
  }
  function equipmentOf(state, id) { return RelicSystem.normalizeSlots((state.hallModal === "testBattle" ? state.testEquipment : state.equipment)?.[id]); }
  function validSlot(slot) { return slot === 0 || slot === 1; }
  function closeEquipState(state) { state.relicEquipChar = null; state.pendingRelicSlot = null; }
  function showCodexHover(e) {
    const button = e.target.closest?.("[data-codex-relic]");
    if (!button || button.contains(e.relatedTarget)) return;
    if (suppressCodexHover) {
      removeCodexHover();
      return;
    }
    removeCodexHover();
    const tip = document.createElement("div");
    tip.id = "relic-codex-hover";
    tip.className = "codex-relic-hover";
    tip.setAttribute("role", "tooltip");
    tip.textContent = RelicSystem.statText(button.dataset.codexRelic);
    document.body.appendChild(tip);
  }
  function hideCodexHover(e) {
    const button = e.target.closest?.("[data-codex-relic]");
    if (button && !button.contains(e.relatedTarget)) removeCodexHover();
  }
  function removeCodexHover() { document.getElementById("relic-codex-hover")?.remove(); }
  return { picker, bind, closeCodex, handleKeydown };
})();
