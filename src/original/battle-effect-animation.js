window.BattleEffectAnimation = (() => {
  const ANIMATION_SETTLE_GRACE_MS = 120;
  const SPEEDS = [1, 1.5, 2];
  const FOLLOW_UP_HOLD_SCALE = .45;
  const CSS_TIMING_MS = [
    200, 240, 300, 320, 340, 420, 450, 480, 500, 520, 550, 580,
    600, 620, 680, 700, 720, 820, 900, 1200, 2000,
  ];
  let cssRoot = null, cssSpeed = null;
  let speedChangeVersion = 0;
  const speed = (state = window.state) => {
    const value = Number(state?.settings?.battleSpeed);
    return SPEEDS.includes(value) ? value : 1;
  };
  const scaleMs = (ms, factor = 1, state = window.state) =>
    Math.max(0, Math.round((Number(ms) || 0) * factor / speed(state)));
  const isFollowUp = event => !!(
    event?.extraSlashReplay || event?.compactFollowUp
    || event?.card?._repeat || event?.card?._soulBladeRepeated
    || event?.card?._extraSlashResolution
    || event?.type === "virtualPlay" && event?.show === false
      && event?.slashText
  );
  const rawWait = ms => new Promise(resolve => setTimeout(resolve, ms));
  function stampCssTiming(element, state = window.state) {
    if (!element?.style?.setProperty) return;
    CSS_TIMING_MS.forEach(ms => {
      element.style.setProperty(`--battle-ms-${ms}`, `${scaleMs(ms, 1, state)}ms`);
    });
  }
  function syncCssTiming(state = window.state) {
    const root = document?.documentElement;
    const currentSpeed = speed(state);
    if (!root?.style?.setProperty) return currentSpeed;
    if (root === cssRoot && currentSpeed === cssSpeed) return currentSpeed;
    stampCssTiming(root, state);
    cssRoot = root;
    cssSpeed = currentSpeed;
    return currentSpeed;
  }
  async function setSpeed(state, value) {
    const nextSpeed = SPEEDS.includes(Number(value)) ? Number(value) : 1;
    const version = ++speedChangeVersion;
    if (window.BattleEffects?.animating || window.BattleEffects?.draining) {
      await window.BattleEffects.whenIdle();
    }
    if (version !== speedChangeVersion
      || window.state && window.state !== state) return false;
    state.settings.battleSpeed = nextSpeed;
    syncCssTiming(state);
    stampCssTiming(document.querySelector?.(".battle-screen"), state);
    return true;
  }
  const wait = ms => {
    syncCssTiming();
    return rawWait(scaleMs(ms));
  };
  const waitHold = (ms, event) => {
    syncCssTiming();
    return rawWait(scaleMs(ms, isFollowUp(event) ? FOLLOW_UP_HOLD_SCALE : 1));
  };
  async function waitCss(element, fallbackMs) {
    syncCssTiming();
    const duration = scaleMs(fallbackMs);
    const animations = typeof element?.getAnimations === "function"
      ? element.getAnimations().filter(animation => animation.effect?.target === element)
      : [];
    if (!animations.length) return rawWait(duration);
    await Promise.race([
      Promise.allSettled(animations.map(animation => animation.finished)),
      rawWait(duration + scaleMs(ANIMATION_SETTLE_GRACE_MS)),
    ]);
  }
  const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));

  function scaleTiming(options) {
    if (typeof options === "number") return scaleMs(options);
    const timing = { ...(options || {}) };
    ["duration", "delay", "endDelay"].forEach(key => {
      if (timing[key] != null) timing[key] = scaleMs(timing[key]);
    });
    return timing;
  }

  function animationMs(options) {
    const timing = typeof options === "number" ? { duration: options } : options || {};
    const duration = Math.max(0, Number(timing.duration) || 0);
    const iterations = Number.isFinite(Number(timing.iterations))
      ? Math.max(0, Number(timing.iterations))
      : 1;
    return Math.max(0, Number(timing.delay) || 0)
      + duration * iterations + Math.max(0, Number(timing.endDelay) || 0);
  }

  function applyFinalFrame(element, frames) {
    const frame = Array.isArray(frames) ? frames[frames.length - 1] : frames;
    if (!element?.style || !frame) return;
    Object.entries(frame).forEach(([key, value]) => {
      if (["offset", "easing", "composite"].includes(key)) return;
      element.style[key] = Array.isArray(value) ? value[value.length - 1] : value;
    });
  }

  async function runAnim(element, frames, options) {
    syncCssTiming();
    const timing = scaleTiming(options);
    const duration = animationMs(timing);
    if (typeof element?.animate !== "function") {
      applyFinalFrame(element, frames);
      if (duration) await rawWait(duration);
      return;
    }
    let animation;
    try {
      animation = element.animate(frames, timing);
    } catch (_) {
      applyFinalFrame(element, frames);
      if (duration) await rawWait(duration);
      return;
    }
    if (animation?.finished && typeof animation.finished.then === "function") {
      const result = await new Promise(resolve => {
        let settled = false;
        let timer = null;
        const finish = value => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(value);
        };
        timer = setTimeout(
          () => finish("timeout"),
          duration + scaleMs(ANIMATION_SETTLE_GRACE_MS),
        );
        Promise.resolve(animation.finished).then(
          () => finish("finished"),
          () => finish("cancelled"),
        );
      });
      if (result === "timeout") {
        try {
          animation.finish?.();
        } catch (_) {}
        applyFinalFrame(element, frames);
      }
      return;
    }
    if (duration) await rawWait(duration);
    applyFinalFrame(element, frames);
  }

  return {
    speed, scaleMs, stampCssTiming, syncCssTiming, setSpeed, isFollowUp,
    wait, waitHold, waitCss, nextFrame, runAnim,
  };
})();
