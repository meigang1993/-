window.RelicBindings = deps => {
  function bind(state, render, persist) {
    const charId = state.infoUnit;
    const panel = document.querySelector(".info-popup");
    if (!charId || state.view === "battle" || !panel) return;
    state.testEquipment = state.testEquipment || {};
    const update = (save = false) => {
      const top = panel.scrollTop || 0;
      render();
      requestAnimationFrame(() => {
        const next = document.querySelector(".info-popup");
        if (next) next.scrollTop = top;
      });
      if (save) persist();
    };
    document.querySelector("[data-close-relic-picker]")?.addEventListener("click", () => {
      state.pendingRelicSlot = null;
      update();
    });
    document.querySelectorAll("[data-relic-pool-item]").forEach(el => {
      el.onclick = () => {
        const relic = el.dataset.relicPoolItem;
        const slot = state.pendingRelicSlot ?? 0;
        const changed = deps.equip(state, charId, relic, slot);
        if (changed) {
          state.selectedRelic = null;
          state.pendingRelicSlot = null;
        }
        update(changed);
      };
      el.ondragstart = e => e.dataTransfer.setData("text/relic", el.dataset.relicPoolItem);
    });
    document.querySelectorAll("[data-relic-slot]").forEach(slot => {
      bindSlot(state, charId, Number(slot.dataset.relicSlot), slot, update);
    });
    const pool = document.querySelector("[data-relic-pool]");
    if (!pool) return;
    pool.ondragover = e => e.preventDefault();
    pool.ondrop = e => {
      e.preventDefault();
      const relic = e.dataTransfer.getData("text/relic");
      const index = (deps.equipMap(state)?.[charId] || []).indexOf(relic);
      if (index >= 0 && deps.unequip(state, charId, index)) update(true);
    };
  }
  function bindSlot(state, charId, index, slot, update) {
    slot.onclick = e => {
      e.stopPropagation();
      if (deps.equipMap(state)?.[charId]?.[index]) {
        if (deps.unequip(state, charId, index)) {
          state.pendingRelicSlot = null;
          update(true);
        }
      } else {
        state.pendingRelicSlot = state.pendingRelicSlot === index ? null : index;
        update();
      }
    };
    slot.oncontextmenu = e => {
      e.preventDefault();
      e.stopPropagation();
      if (deps.unequip(state, charId, index)) {
        state.pendingRelicSlot = null;
        update(true);
      }
    };
    slot.ondragover = e => e.preventDefault();
    slot.ondrop = e => {
      e.preventDefault();
      e.stopPropagation();
      const relic = e.dataTransfer.getData("text/relic");
      if (relic && deps.equip(state, charId, relic, index)) {
        state.pendingRelicSlot = null;
        update(true);
      }
    };
    slot.ondragstart = e => {
      const relic = deps.equipMap(state)?.[charId]?.[index];
      if (relic) e.dataTransfer.setData("text/relic", relic);
    };
  }
  return { bind };
};
