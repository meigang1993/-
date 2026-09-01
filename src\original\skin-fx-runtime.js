window.SkinFXRuntime = {
  create(defaultEffect = "") {
    let version = 0;
    const timers = new Set();
    const hasDocument = () => typeof document !== "undefined";

    function active(unit, effect = defaultEffect) {
      const selectedEffect = typeof effect === "string" ? effect : defaultEffect;
      const resolved = window.SkinSystem?.dynamicEffectOf?.(window.state, unit);
      return (resolved === undefined ? unit?.skinDynamicEffect : resolved)
        === selectedEffect;
    }

    function current(state, battle, capturedVersion) {
      return capturedVersion === version
        && (!window.state || window.state === state)
        && state?.battle === battle;
    }

    function later(task, delay) {
      const timer = setTimeout(() => {
        timers.delete(timer);
        task();
      }, delay);
      timers.add(timer);
      return timer;
    }

    function mount(state, node, duration = 900, delay = 0) {
      if (!hasDocument()) return () => false;
      const battle = state?.battle;
      const capturedVersion = version;
      document.body.appendChild(node);
      later(() => node.remove(), duration + delay);
      return () => current(state, battle, capturedVersion);
    }

    function cancel() {
      version += 1;
      timers.forEach(clearTimeout);
      timers.clear();
    }

    return { active, cancel, hasDocument, later, mount };
  },
};
