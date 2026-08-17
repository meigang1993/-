window.AppRuntimeErrorDialog = (() => {
  let restoreFocus = null;
  const escape = value => String(value ?? "").replace(/[&<>"]/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;",
  }[char]));
  const rememberFocus = () => {
    if (!restoreFocus && !document.getElementById("runtime-error-boundary")) {
      restoreFocus = window.AppRenderFocusPreservation?.captureFocus?.() || null;
    }
  };

  function markup(error) {
    if (!error) return "";
    return `<div id="runtime-error-boundary" class="game-confirm-overlay" role="alertdialog" aria-modal="true" aria-labelledby="runtime-error-title"><section class="game-confirm-card"><h2 id="runtime-error-title">操作发生异常</h2><p>本次操作已停止，操作状态已恢复。返回后请重新执行刚才的操作。</p><small class="muted">错误代码：${escape(error.code)}</small><button type="button" data-runtime-retry="1">返回重试</button></section></div>`;
  }

  function syncLayers() {
    const root = $("global-overlay");
    const children = root ? [...root.children] : [];
    const active = children.length > 0;
    root?.classList.toggle("active", active);
    $("app")?.toggleAttribute("inert", active);
    children.forEach((child, index) =>
      child.toggleAttribute("inert", index < children.length - 1));
  }

  function restore() {
    const callback = restoreFocus;
    restoreFocus = null;
    if (callback) requestAnimationFrame(callback);
  }

  function remove(shouldRestoreFocus = true) {
    document.getElementById("runtime-error-boundary")?.remove();
    syncLayers();
    if (shouldRestoreFocus) restore();
  }

  function bind(onRetry) {
    const button = document.querySelector("[data-runtime-retry]");
    if (!button) return;
    button.onclick = onRetry;
    const overlay = button.closest("#runtime-error-boundary");
    if (!button.closest("[inert]") && !overlay?.contains(document.activeElement)) {
      requestAnimationFrame(() => button.focus({ preventScroll: true }));
    }
  }

  function show(error, onRetry) {
    rememberFocus();
    remove(false);
    let root = $("global-overlay");
    if (!root) {
      root = document.createElement("div");
      root.id = "global-overlay";
      document.body.appendChild(root);
    }
    root.insertAdjacentHTML("beforeend", markup(error));
    syncLayers();
    bind(onRetry);
  }

  function emergency(error, onRetry) {
    rememberFocus();
    document.getElementById("runtime-error-boundary")?.remove();
    let root = document.getElementById("global-overlay");
    if (!root) {
      root = document.createElement("div");
      root.id = "global-overlay";
      document.body.appendChild(root);
    }
    const overlay = document.createElement("div");
    overlay.id = "runtime-error-boundary";
    overlay.className = "game-confirm-overlay";
    overlay.setAttribute("role", "alertdialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "操作发生异常");
    const card = document.createElement("section");
    card.className = "game-confirm-card";
    const title = document.createElement("h2");
    title.textContent = "操作发生异常";
    const message = document.createElement("p");
    message.textContent = "本次操作已停止，操作状态已恢复。返回后请重新执行刚才的操作。";
    const code = document.createElement("small");
    code.className = "muted";
    code.textContent = `错误代码：${error.code}`;
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.runtimeRetry = "1";
    button.textContent = "返回重试";
    button.onclick = onRetry;
    card.append(title, message, code, button);
    overlay.appendChild(card);
    root.appendChild(overlay);
    root.classList.add("active");
    document.getElementById("app")?.setAttribute("inert", "");
    [...root.children].forEach((child, index, children) =>
      child.toggleAttribute("inert", index < children.length - 1));
    button.focus({ preventScroll: true });
  }

  function handleKeydown(event) {
    if (!["Tab", "Escape"].includes(event.key)) return false;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Tab") {
      document.querySelector("[data-runtime-retry]")?.focus({ preventScroll: true });
    }
    return true;
  }

  return { bind, emergency, handleKeydown, markup, remove, restore, show };
})();
