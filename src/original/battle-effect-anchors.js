window.BattleEffectAnchors = (() => {
  const hasDocument = () => typeof document !== "undefined";
  const uidOf = unit => String(typeof unit === "object" ? unit?.uid || "" : unit || "");
  const findDataNode = (selector, key, value) => {
    if (!hasDocument() || !value) return null;
    return Array.from(document.querySelectorAll(selector)).find(node => node.dataset?.[key] === value) || null;
  };
  const battlefield = unit => {
    const root = findDataNode("[data-target]", "target", uidOf(unit));
    return root?.querySelector?.(".unit-art") || null;
  };
  const action = unit => {
    const root = findDataNode("[data-active-info]", "activeInfo", uidOf(unit));
    return root?.querySelector?.(".portrait") || null;
  };
  function resolve(unit, mode = "battlefield") {
    if (mode === "action") return action(unit);
    if (mode === "action-first") return action(unit) || battlefield(unit);
    if (mode === "battlefield-first") return battlefield(unit) || action(unit);
    return battlefield(unit);
  }
  function measure(unit, mode = "battlefield") {
    const element = resolve(unit, mode), rect = element?.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    return {
      element,
      rect,
      center: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
    };
  }
  function place(node, unit, mode = "battlefield") {
    const anchor = node && measure(unit, mode);
    if (!anchor) return null;
    const { rect } = anchor;
    node.style.left = `${rect.left}px`;
    node.style.top = `${rect.top}px`;
    node.style.width = `${rect.width}px`;
    node.style.height = `${rect.height}px`;
    return anchor;
  }
  function mirror(node, unit, mode = "battlefield") {
    if (!node?.cloneNode) return null;
    const copy = node.cloneNode(true), anchor = place(copy, unit, mode);
    return anchor ? { node: copy, anchor } : null;
  }
  return { battlefield, action, resolve, measure, place, mirror };
})();
