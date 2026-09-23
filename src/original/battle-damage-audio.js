window.BattleDamageAudio = (() => {
  let audioCtx = null;
  let unlocked = false;
  let resumePromise = null;
  let lastSound = 0;
  let runtimeVersion = 0;
  const volume = scale =>
    Math.max(0, Math.min(1, ((window.state?.settings?.sfxVolume ?? 80) / 100) * scale));
  const scaleMs = ms => window.BattleEffectAnimation?.scaleMs?.(ms) ?? ms;
  const scaleSeconds = seconds => scaleMs(seconds * 1000) / 1000;

  function resumeAudio() {
    if (!audioCtx) return Promise.reject(new Error("audio context unavailable"));
    if (!audioCtx.state || audioCtx.state === "running") return Promise.resolve(audioCtx);
    if (!resumePromise) {
      resumePromise = Promise.resolve(audioCtx.resume?.()).then(() => {
        if (audioCtx.state && audioCtx.state !== "running") {
          throw new Error(`audio context ${audioCtx.state}`);
        }
        return audioCtx;
      }).finally(() => { resumePromise = null; });
    }
    return resumePromise;
  }

  function unlock() {
    unlocked = true;
    try {
      audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
      resumeAudio().catch(() => {});
    } catch (_) {}
  }

  function tone(freq, duration, type, gainValue, delay = 0, endFreq = freq) {
    if (!unlocked || !audioCtx) return;
    const level = volume(gainValue);
    if (level <= 0) return;
    const version = runtimeVersion;
    resumeAudio().then(ctx => {
      if (version !== runtimeVersion) return;
      const start = ctx.currentTime + scaleSeconds(delay);
      const scaledDuration = scaleSeconds(duration);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, start);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), start + scaledDuration);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(level, start + .012);
      gain.gain.exponentialRampToValueAtTime(.0001, start + scaledDuration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + scaledDuration + .03);
    }).catch(() => {});
  }

  function noise(duration, gainValue, cutoff, delay = 0) {
    if (!unlocked || !audioCtx) return;
    const level = volume(gainValue);
    if (level <= 0) return;
    const version = runtimeVersion;
    resumeAudio().then(ctx => {
      if (version !== runtimeVersion) return;
      const scaledDuration = scaleSeconds(duration);
      const length = Math.ceil(ctx.sampleRate * scaledDuration);
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = window.GameRandom.noise() * 2 - 1;
      const start = ctx.currentTime + scaleSeconds(delay);
      const source = ctx.createBufferSource();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      source.buffer = buffer;
      filter.type = "bandpass";
      filter.frequency.value = cutoff;
      filter.Q.value = .8;
      gain.gain.setValueAtTime(level, start);
      gain.gain.exponentialRampToValueAtTime(.0001, start + scaledDuration);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      source.start(start);
    }).catch(() => {});
  }

  function sound(type) {
    const now = performance.now();
    if (now - lastSound < scaleMs(70)) return;
    lastSound = now;
    try {
      if (type === "physical") { noise(.12, .12, 1700); tone(310, .11, "triangle", .08, 0, 120); }
      else if (type === "poison") { tone(520, .18, "sine", .07, 0, 130); tone(360, .12, "sine", .05, .09, 90); }
      else if (type === "thunder") { noise(.2, .13, 3200); tone(1180, .12, "square", .055, 0, 140); tone(820, .09, "square", .04, .08, 180); }
      else if (type === "fire") { noise(.28, .1, 540); tone(180, .22, "sawtooth", .045, 0, 90); }
      else if (type === "holy") { [0, .055, .11].forEach((delay, i) => tone(760 + i * 310, .42, "sine", .05, delay, 520 + i * 190)); }
      else if (type === "dark") { tone(92, .42, "sine", .11, 0, 54); tone(138, .34, "triangle", .045, .04, 72); }
      else if (type === "ice") { noise(.14, .09, 4200); [0, .045, .09].forEach((delay, i) => tone(1540 - i * 210, .1, "triangle", .045, delay, 620)); }
      else if (type === "magic") { [0, .055, .12].forEach((delay, i) => tone(920 + i * 280, .48, "sine", .055, delay, 610 + i * 120)); tone(1760, .18, "triangle", .035, .08, 980); }
    } catch (_) {}
  }

  function cancel() { runtimeVersion += 1; }
  return { unlock, sound, cancel };
})();
