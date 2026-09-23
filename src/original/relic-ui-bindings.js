window.RelicUIBindings = (() => {
  let bound = false;
  const equipmentOf = (state, id) => RelicSystem.normalizeSlots(
    (state.hallModal === "testBattle"
      ? state.testEquipment : state.equipment)?.[id]);
  const validSlot = slot => slot === 0 || slot === 1;
  const closeEquipState = state => {
    state.relicEquipChar = null;
    state.pendingRelicSlot = null;
  };
  function update(ctx, done, persist = false) {
    let changed = false;
    ctx.updateModalState(() => {
      changed = done() === true;
    }, { persist: false });
    if (persist && changed) ctx.persist();
  }
  function stop(event, action) {
    event.preventDefault();
    event.stopPropagation();
    action();
  }
  function keepModalAnchor(element, action) {
    const modal = element.closest(".modal-card");
    const beforeTop = modal
      ? element.getBoundingClientRect().top - modal.getBoundingClientRect().top
      : 0;
    const beforeScroll = modal?.scrollTop || 0;
    action();
    const apply = () => {
      const nextModal = document.querySelector(".modal-card");
      const next = [...document.querySelectorAll("[data-open-relic-equip]")]
        .find(item => item.dataset.openRelicEquip
          === element.dataset.openRelicEquip);
      if (!nextModal) return;
      if (next) {
        nextModal.scrollTop += next.getBoundingClientRect().top
          - nextModal.getBoundingClientRect().top - beforeTop;
      } else nextModal.scrollTop = beforeScroll;
    };
    requestAnimationFrame(apply);
    setTimeout(apply, 0);
    setTimeout(apply, 80);
  }
  function openEquip(ctx, id) {
    update(ctx, () => {
      const state = ctx.state();
      const character = state.chars.find(item => item.id === id);
      if (!character) return;
      const equipment = equipmentOf(state, id);
      const requested = Number(ctx.openSlot);
      state.relicEquipChar = id;
      state.relicCodex = false;
      state.infoUnit = null;
      state.infoTab = "stats";
      state.pendingRelicSlot = validSlot(requested)
        ? requested : (equipment[0] && !equipment[1] ? 1 : 0);
    });
  }
  function openSlot(ctx, id, slot) {
    const state = ctx.state();
    if (!validSlot(slot) || !state.chars.some(item => item.id === id)) return;
    if (!equipmentOf(state, id)[slot]) {
      openEquip({ ...ctx, openSlot: slot }, id);
      return;
    }
    update(ctx, () => {
      const changed = RelicSystem.unequip(state, id, slot);
      if (changed && state.relicEquipChar === id) {
        state.pendingRelicSlot = slot;
      }
      return changed;
    }, true);
  }
  function equipRelic(ctx, relic) {
    update(ctx, () => {
      const state = ctx.state();
      const id = state.relicEquipChar;
      const slot = validSlot(state.pendingRelicSlot)
        ? state.pendingRelicSlot : 0;
      if (!state.chars.some(item => item.id === id)) return false;
      const changed = RelicSystem.equip(state, id, relic, slot);
      if (changed) state.pendingRelicSlot = slot === 0 ? 1 : slot;
      return changed;
    }, true);
  }
  function unequipRelic(ctx, slot) {
    update(ctx, () => {
      const state = ctx.state();
      const id = state.relicEquipChar;
      if (!validSlot(slot)
        || !state.chars.some(item => item.id === id)) return false;
      const changed = RelicSystem.unequip(state, id, slot);
      if (changed) state.pendingRelicSlot = equipmentOf(state, id)[0] ? 1 : 0;
      return changed;
    }, true);
  }
  function clickSlot(ctx, slot) {
    const state = ctx.state();
    const id = state.relicEquipChar;
    if (!validSlot(slot) || !state.chars.some(item => item.id === id)) return;
    if (equipmentOf(state, id)[slot]) unequipRelic(ctx, slot);
    else update(ctx, () => { state.pendingRelicSlot = slot; });
  }
  function handleClick(event, ctx) {
    const state = ctx.state();
    const codexRelic = event.target.closest("[data-codex-relic]");
    if (codexRelic) {
      return window.RelicUICodexInteractions.pick(
        event, ctx, update, stop);
    }
    const closeEquip = event.target.closest("[data-close-relic-equip]");
    if (closeEquip) {
      return stop(event, () => update(ctx, () => closeEquipState(state)));
    }
    const popupSlot = event.target.closest("[data-relic-popup-slot]");
    if (popupSlot) {
      return stop(event, () =>
        clickSlot(ctx, Number(popupSlot.dataset.relicPopupSlot)));
    }
    const popupItem = event.target.closest("[data-popup-relic-item]");
    if (popupItem) {
      return stop(event, () =>
        equipRelic(ctx, popupItem.dataset.popupRelicItem));
    }
    const codexButton = event.target.closest("[data-relic-codex]");
    if (codexButton) {
      return stop(event, () => update(ctx, () => {
        closeEquipState(state);
        if (codexButton.dataset.relicCodex === "close") {
          window.RelicUICodexInteractions.close(state);
        } else window.RelicUICodexInteractions.toggle(state);
      }));
    }
    if (event.target.classList.contains("codex-overlay")) {
      return stop(event, () =>
        update(ctx, () => window.RelicUICodexInteractions.close(state)));
    }
    const equip = event.target.closest("[data-open-relic-equip]");
    if (equip) {
      stop(event, () => keepModalAnchor(equip, () => openSlot(
        ctx, equip.dataset.openRelicEquip,
        Number(equip.dataset.openRelicSlot))));
    }
  }
  function bind(ctx) {
    if (bound) return;
    bound = true;
    document.addEventListener("click", event => handleClick(event, ctx));
    window.RelicUICodexInteractions.bind();
  }
  return { bind };
})();
