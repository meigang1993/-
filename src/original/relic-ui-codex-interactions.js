window.RelicUICodexInteractions = (() => {
  let suppressHover = false;
  function removeHover() {
    document.getElementById("relic-codex-hover")?.remove();
  }
  function showHover(event) {
    const button = event.target.closest?.("[data-codex-relic]");
    if (!button || button.contains(event.relatedTarget)) return;
    if (suppressHover) {
      removeHover();
      return;
    }
    removeHover();
    const tip = document.createElement("div");
    tip.id = "relic-codex-hover";
    tip.className = "codex-relic-hover";
    tip.setAttribute("role", "tooltip");
    tip.textContent = RelicSystem.statText(button.dataset.codexRelic);
    document.body.appendChild(tip);
  }
  function hideHover(event) {
    const button = event.target.closest?.("[data-codex-relic]");
    if (button && !button.contains(event.relatedTarget)) removeHover();
  }
  function bind() {
    document.addEventListener("pointerover", showHover);
    document.addEventListener("pointerout", hideHover);
    document.addEventListener("pointermove", () => {
      suppressHover = false;
    }, { passive: true });
    document.addEventListener("focusin", showHover);
    document.addEventListener("focusout", hideHover);
  }
  function pick(event, ctx, update, stop) {
    const button = event.target.closest?.("[data-codex-relic]");
    if (!button) return;
    stop(event, () => {
      suppressHover = true;
      removeHover();
      const grid = document.querySelector(".relic-codex-pop .codex-grid");
      const top = grid?.scrollTop || 0;
      update(ctx, () => {
        ctx.state().selectedCodexRelic = button.dataset.codexRelic;
      });
      requestAnimationFrame(() => {
        const next = document.querySelector(".relic-codex-pop .codex-grid");
        if (next) next.scrollTop = top;
      });
    });
  }
  function toggle(state, close = false) {
    state.relicCodex = close ? false : !state.relicCodex;
    if (state.relicCodex && !RelicSystem.data(state.selectedCodexRelic)) {
      state.selectedCodexRelic = RelicSystem.all(state)[0]?.name || null;
    }
  }
  function close(state) {
    state.relicCodex = false;
    suppressHover = false;
    removeHover();
    return true;
  }
  function handleKeydown(event, state, render) {
    if (!state?.relicCodex) return false;
    const pop = document.querySelector(".relic-codex-pop");
    if (!pop) return false;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(state);
      render();
      return true;
    }
    if (event.key !== "Tab") return false;
    const controls = [...pop.querySelectorAll(
      "button:not(:disabled),[href],[tabindex]:not([tabindex='-1'])")]
      .filter(control => control.getClientRects().length);
    if (!controls.length) return false;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey
      && (!pop.contains(document.activeElement)
        || document.activeElement === first)) {
      event.preventDefault();
      last.focus();
      return true;
    }
    if (!event.shiftKey
      && (!pop.contains(document.activeElement)
        || document.activeElement === last)) {
      event.preventDefault();
      first.focus();
      return true;
    }
    return false;
  }
  return { bind, pick, toggle, close, handleKeydown };
})();
