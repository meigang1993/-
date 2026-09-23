window.BattleAudio = (() => {
  let audioCtx = null, audioUnlocked = false, resumePromise = null, runtimeVersion = 0;
  const sfxSrc = {
    armor: "./assets/sounds/armor-hit.mp3",
    heal: "./assets/sounds/hp-heal.mp3",
    hpHit: "./assets/sounds/hp-hit.mp3",
    hpLoss: "./assets/sounds/hp-loss.mp3",
    magicHit: "./assets/sounds/magic-hit.mp3",
  };
  const lastSfx = {};
  const cooldown = { hpHit: 55, hpLoss: 75, armor: 70, heal: 90, magicHit: 70, beep: 45, burn: 120 };
  const current = (state, battle, version) =>
    version === runtimeVersion && (!window.state || window.state === state) && state?.battle === battle;

  function ensureCtx() {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }

  function resumeCtx() {
    try {
      const ctx = ensureCtx();
      if (!ctx.state || ctx.state === "running") return Promise.resolve(ctx);
      if (!resumePromise) {
        resumePromise = Promise.resolve(ctx.resume?.()).then(() => {
          if (ctx.state && ctx.state !== "running") throw new Error(`audio context ${ctx.state}`);
          return ctx;
        }).finally(() => { resumePromise = null; });
      }
      return resumePromise;
    } catch (err) {
      return Promise.reject(err);
    }
  }
  const samples = window.BattleAudioSamples({
    sources: sfxSrc, ensureCtx, resumeCtx, current,
    version: () => runtimeVersion,
  });

  function sfxVolume(scale = 1) {
    return Math.max(0, Math.min(1, ((window.state?.settings?.sfxVolume ?? 80) / 100) * .85 * scale));
  }
  const scaleMs = ms => window.BattleEffectAnimation?.scaleMs?.(ms) ?? ms;
  const scaleSeconds = seconds => scaleMs(seconds * 1000) / 1000;

  function canPlay(key, delay = 0) {
    const scaledDelay = scaleMs(delay);
    const due = performance.now() + scaledDelay, last = lastSfx[key] || 0;
    if (due - last < scaleMs(cooldown[key] || 50)) return false;
    lastSfx[key] = due;
    return true;
  }

  function tone(freq = 820, duration = .08, type = "triangle", delay = 0, scale = .06) {
    const key = type === "sawtooth" ? "burn" : "beep";
    const volume = sfxVolume(scale), version = runtimeVersion;
    if (volume <= 0 || !audioUnlocked || !canPlay(key, delay)) return;
    resumeCtx().then(ctx => {
      if (version !== runtimeVersion) return;
      const start = ctx.currentTime + scaleMs(delay) / 1000;
      const scaledDuration = scaleSeconds(duration);
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(volume, start + .012);
      gain.gain.exponentialRampToValueAtTime(.0001, start + scaledDuration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + scaledDuration + .02);
    }).catch(() => {});
  }

  function beep(delay = 0) { tone(820, .075, "triangle", delay, .055); }
  function cardMove(delay = 0) { tone(620, .055, "triangle", delay, .04); }
  function cardLand(delay = 0) { tone(360, .055, "square", delay, .032); }
  function burn() {
    tone(180, .08, "sawtooth", 0, .08);
    tone(120, .12, "triangle", 70, .07);
  }

  function playSfx(key, delay = 0, scale = 1) {
    const volume = sfxVolume(scale);
    if (!sfxSrc[key] || volume <= 0 || !audioUnlocked || !canPlay(key, delay)) return;
    samples.play(key, volume, scaleMs(delay));
  }

  function floatSfx(kind) {
    if (kind === "heal") playSfx("heal", 0, .9);
    else if (kind === "hp-loss") playSfx("hpLoss");
    else if (kind === "damage") playSfx("hpHit");
    else if (/^(armor|armor-break|armor-gain|defense|defense-break)$/.test(kind || "")) playSfx("armor", 0, .88);
  }
  function magicHit() { playSfx("magicHit", 0, .92); }

  function unlockAudio() {
    audioUnlocked = true;
    window.BattleDamageFX?.unlockAudio?.();
    resumeCtx().catch(err => console.warn("战斗音效预解锁失败:", err.message));
    samples.warmAll();
  }

  document.addEventListener("pointerdown", unlockAudio, { once: true });
  document.addEventListener("click", unlockAudio, { once: true });

  function playBattleStart(done) { done?.(); }
  function judgeResult(success) { tone(success ? 1180 : 260, .12, success ? "triangle" : "sawtooth"); }
  function cancel() { runtimeVersion += 1; }

  return { beep, cardMove, cardLand, burn, tone, unlockAudio, playBattleStart, judgeResult, floatSfx, magicHit, cancel };
})();
