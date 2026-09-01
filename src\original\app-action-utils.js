function lockControl(el, text = "处理中…") {
  if (!el || el.dataset.locked === "1" || el.disabled) return false;
  el.dataset.locked = "1";
  el.style.pointerEvents = "none";
  if (el.tagName === "BUTTON") {
    el.disabled = true;
    el.dataset.busyText = text;
  }
  return true;
}
function askGameConfirm(config) {
  GameConfirm.show(state, render, config);
}
