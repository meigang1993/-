window.SaveSlots = (() => {
  const View = window.SaveSlotsView;
  let mode = null, slots = null, loadError = "", confirmText = "", confirmAction = null, noticeText = "", noticeAction = null, noticeLabel = "", reloadId = 0, actionBusy = false;
  async function reload(render) {
    const requestId = ++reloadId;
    slots = null; loadError = ""; render();
    try {
      const loaded = await GameStore.getSlots();
      if (requestId !== reloadId || !mode) return;
      slots = loaded;
    }
    catch (err) {
      console.error("slot list failed:", err.code, err.message, err.stack);
      if (requestId !== reloadId || !mode) return;
      loadError = "存档位读取失败，请检查网络后重试。";
    }
    render();
  }
  async function open(nextMode, render) {
    if (window.sessionOnly) {
      close();
      render();
      return false;
    }
    mode = nextMode; slots = null; loadError = ""; confirmText = ""; confirmAction = null; noticeText = ""; noticeAction = null; noticeLabel = "";
    await reload(render);
    return true;
  }
  function close() { reloadId += 1; mode = null; loadError = ""; confirmText = ""; confirmAction = null; noticeText = ""; noticeAction = null; noticeLabel = ""; }
  function isOpen() { return !!mode; }

  function render() {
    return View.render({
      mode, slots, loadError, confirmText, noticeText, noticeAction, noticeLabel,
      actionBusy,
    });
  }

  function ask(text, action, render) { confirmText = text; confirmAction = action; noticeText = ""; render(); }
  function notice(text, render, action = null, label = "") { noticeText = text; noticeAction = action; noticeLabel = label; confirmText = ""; confirmAction = null; render(); }
  async function runAction(action, render) {
    if (!action || actionBusy) return;
    actionBusy = true;
    render();
    try { await action(); } finally { actionBusy = false; render(); }
  }
  const clearNotice = render => { noticeText = ""; noticeAction = null; noticeLabel = ""; render(); };
  const takeNoticeAction = () => { const action = noticeAction; noticeText = ""; noticeAction = null; noticeLabel = ""; return action; };
  const clearConfirm = render => { confirmText = ""; confirmAction = null; render(); };
  const takeConfirmAction = () => { const action = confirmAction; confirmText = ""; confirmAction = null; return action; };
  const actions = window.SaveSlotsActions({ reload, notice, close });
  const bind = window.SaveSlotsBindings({
    mode: () => mode, slots: () => slots, close, reload, ask, notice, runAction,
    ...actions, clearNotice, takeNoticeAction, clearConfirm, takeConfirmAction,
  });

  return { open, close, isOpen, render, bind };
})();
