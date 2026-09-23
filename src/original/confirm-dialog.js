window.GameConfirm = (() => {
  const pending = new Map();
  const scrollTargets = [".modal-card", ".info-popup", ".villa-page-scroll", ".codex-scroll", ".content-panel", ".tower-map"];
  let bound = false;
  function rememberScroll() {
    return scrollTargets.map(sel => {
      const el = document.querySelector(sel);
      return el ? [sel, el.scrollTop, el.scrollLeft] : null;
    }).filter(Boolean);
  }
  function restoreScroll(points) {
    const apply = () => points.forEach(([sel, top, left]) => {
      const el = document.querySelector(sel);
      if (el) window.restoreScrollInstant ? window.restoreScrollInstant(el, top, left) : (el.scrollTop = top, el.scrollLeft = left);
    });
    apply(); requestAnimationFrame(apply); setTimeout(apply, 0); setTimeout(apply, 80);
  }
  function show(state, render, config) {
    const scroll = rememberScroll();
    const id = window.GameRandom.id("confirm-");
    pending.set(id, { onConfirm: config.onConfirm, scroll, persistAfter: config.persistAfter === true });
    state.confirmDialog = {
      id,
      title: config.title || "确认操作",
      text: config.text || "是否继续？",
      confirmText: config.confirmText || "确认",
      cancelText: config.cancelText || "取消",
      danger: !!config.danger,
      previewArt: config.previewArt || null,
      previewName: config.previewName || config.title || "预览",
    };
    render(); restoreScroll(scroll);
  }
  function render(state) {
    const d = state.confirmDialog;
    if (!d) return "";
    const preview = d.previewArt ? `<div class="confirm-preview"><img src="${UICommon.esc(d.previewArt)}" alt="${UICommon.esc(d.previewName)}"></div>` : "";
    return `<div class="game-confirm-overlay" data-confirm-overlay="1" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title"><section class="game-confirm-card"><h2 id="confirm-title">${UICommon.esc(d.title)}</h2>${preview}<p>${UICommon.esc(d.text)}</p><div class="game-confirm-actions"><button class="ghost" data-confirm-cancel="1">${UICommon.esc(d.cancelText)}</button><button class="${d.danger ? "danger" : ""}" data-confirm-ok="${UICommon.esc(d.id)}">${UICommon.esc(d.confirmText)}</button></div></section></div>`;
  }
  function bind(ctx) {
    if (bound) return;
    bound = true;
    document.addEventListener("click", async e => {
      const ok = e.target.closest("[data-confirm-ok]"), cancel = e.target.closest("[data-confirm-cancel]"), overlay = e.target.matches("[data-confirm-overlay]");
      if (!ok && !cancel && !overlay) return;
      const state = ctx.state();
      if (!state.confirmDialog) return;
      e.preventDefault(); e.stopPropagation();
      const id = state.confirmDialog.id, item = pending.get(id);
      const scroll = item?.scroll || rememberScroll(), action = ok ? item?.onConfirm : null;
      pending.delete(id); state.confirmDialog = null;
      restoreScroll(scroll);
      ctx.render(); restoreScroll(scroll);
      if (action) {
        try { await action(); }
        catch (err) { console.error("confirm action failed:", err.message, err.stack); }
      }
      ctx.render(); restoreScroll(scroll);
      if (action && item?.persistAfter) ctx.persist();
    }, true);
  }
  return { show, render, bind };
})();
