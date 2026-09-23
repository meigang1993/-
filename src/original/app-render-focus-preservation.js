window.AppRenderFocusPreservation = (() => {
  const modalFocusStacks = new WeakMap();

  function controlFocusIdentity(control) {
    if (!control?.matches?.(
      "button,a[href],input,select,textarea,[tabindex],[role='button']"
    )) return null;
    const data = Object.entries(control.dataset || {})
      .find(([, value]) => value !== "");
    return {
      tag: control.tagName,
      id: control.id || "",
      name: control.getAttribute("name") || "",
      data,
    };
  }

  function controlFromIdentity(identity) {
    if (!identity) return null;
    let target = identity.id ? document.getElementById(identity.id) : null;
    if (target) return target;
    return [...document.querySelectorAll(identity.tag)].find(candidate => {
      if (identity.name && candidate.getAttribute("name") !== identity.name) {
        return false;
      }
      return identity.data
        ? candidate.dataset?.[identity.data[0]] === identity.data[1]
        : !!identity.name;
    }) || null;
  }

  function focusControl(control) {
    if (!control || control.disabled || control.getAttribute("aria-disabled") === "true"
      || control.closest("[inert]")) return false;
    try {
      control.focus({ preventScroll: true });
    } catch (_) {
      control.focus();
    }
    return document.activeElement === control;
  }

  function preserveControlFocus(root) {
    const identity = root?.contains?.(document.activeElement)
      ? controlFocusIdentity(document.activeElement) : null;
    return () => focusControl(controlFromIdentity(identity));
  }

  function captureFocus() {
    const identity = controlFocusIdentity(document.activeElement);
    return () => focusControl(controlFromIdentity(identity));
  }

  function preserveModalFocus(root) {
    const selector = "[role='dialog'],[role='alertdialog']";
    const before = root?.querySelectorAll?.(selector).length || 0;
    const opener = controlFocusIdentity(document.activeElement);
    const stack = modalFocusStacks.get(root) || [];
    modalFocusStacks.set(root, stack);
    return () => {
      const layers = [...(root?.querySelectorAll?.(selector) || [])];
      const after = layers.length;
      if (after > before) {
        for (let depth = before; depth < after; depth += 1) {
          stack.push(depth === before ? opener : null);
        }
      }
      let restore = null;
      while (stack.length > after) {
        const candidate = stack.pop();
        if (candidate) restore = candidate;
      }
      requestAnimationFrame(() => {
        if (restore) focusControl(controlFromIdentity(restore));
        const top = layers[layers.length - 1];
        if (!top || top.contains(document.activeElement)) return;
        focusControl(top.querySelector(
          "button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[role='button']:not([aria-disabled='true']),[tabindex]:not([tabindex='-1'])"
        ));
      });
    };
  }

  return { captureFocus, preserveControlFocus, preserveModalFocus };
})();
