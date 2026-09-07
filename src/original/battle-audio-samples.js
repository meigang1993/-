window.BattleAudioSamples = deps => {
  const { sources, ensureCtx, resumeCtx, current, version } = deps;
  const loading = {};
  const buffers = {};
  const media = {};
  const mediaFallback = new Set();

  function canFetch() {
    const loc = window.location;
    return !!window.fetch && loc?.protocol !== "file:" && loc?.protocol !== "blob:"
      && loc?.origin !== "null" && !!(window.AudioContext || window.webkitAudioContext);
  }

  function warmMedia(key) {
    if (!sources[key]) return null;
    try {
      if (!media[key]) {
        const audio = new Audio();
        audio.preload = "auto";
        audio.src = sources[key];
        audio.load?.();
        media[key] = audio;
      }
      return media[key];
    } catch (_) {
      return null;
    }
  }

  function load(key) {
    try {
      if (buffers[key]) return Promise.resolve(buffers[key]);
      if (!sources[key] || mediaFallback.has(key) || !canFetch()) {
        mediaFallback.add(key);
        warmMedia(key);
        return Promise.reject(new Error("sfx media fallback"));
      }
      if (!loading[key]) {
        loading[key] = fetch(sources[key])
          .then(response => {
            if (!response.ok) throw new Error(`sfx HTTP ${response.status}`);
            return response.arrayBuffer();
          })
          .then(buffer => ensureCtx().decodeAudioData(buffer))
          .then(buffer => buffers[key] = buffer)
          .catch(error => {
            mediaFallback.add(key);
            warmMedia(key);
            throw error;
          });
      }
      return loading[key];
    } catch (error) {
      return Promise.reject(error);
    }
  }

  function scheduleBuffer(ctx, buffer, volume, delay) {
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    const start = ctx.currentTime + delay / 1000;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + .01);
    gain.gain.setValueAtTime(volume, start + Math.max(.02, buffer.duration - .03));
    gain.gain.linearRampToValueAtTime(0, start + buffer.duration);
    source.buffer = buffer;
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start(start);
  }

  function fallback(key, volume, delay, error, state, battle, runtime) {
    setTimeout(() => {
      if (!current(state, battle, runtime)) return;
      try {
        const warmed = warmMedia(key);
        const audio = warmed?.cloneNode?.(true) || new Audio(sources[key]);
        audio.volume = volume;
        audio.play().catch(playError =>
          console.warn("战斗音效播放失败:", playError.message || error.message));
      } catch (playError) {
        console.warn("战斗音效播放失败:", playError.message || error.message);
      }
    }, delay);
  }

  function playLoaded(key, buffer, volume, due, state, battle, runtime) {
    resumeCtx().then(ctx => {
      if (!current(state, battle, runtime)) return;
      const left = due - performance.now();
      if (left < -120) return;
      scheduleBuffer(ctx, buffer, volume, Math.max(0, left));
    }).catch(error => {
      const left = due - performance.now();
      if (left >= -120) fallback(key, volume, Math.max(0, left), error, state, battle, runtime);
    });
  }

  function play(key, volume, delay = 0) {
    const state = window.state;
    const battle = state?.battle;
    const runtime = version();
    const due = performance.now() + delay;
    if (buffers[key]) return playLoaded(key, buffers[key], volume, due, state, battle, runtime);
    load(key).then(buffer => playLoaded(key, buffer, volume, due, state, battle, runtime))
      .catch(error => {
        const left = due - performance.now();
        if (left >= -120) fallback(key, volume, Math.max(0, left), error, state, battle, runtime);
      });
  }

  function warmAll() {
    Object.keys(sources).forEach(key => load(key).catch(() => {}));
  }

  return { play, warmAll };
};
