// BGM · WebAudio 采样级无缝播放器（拆分文件，避免 bgm.js 超行数硬约束）
// 与 HTMLAudioElement 同构：暴露 src / currentTime / volume / paused / loop /
// play() / pause() / load() / removeAttribute() / addEventListener()，
// 于是 bgm.js 的淡入淡出、切曲、时停挂起、primeBattle 等既有逻辑一行不改即可复用。
//
// 精确循环：按 Ogg 的 LOOPSTART/LOOPLENGTH（源采样数）换算成秒，设到
// AudioBufferSourceNode.loopStart/loopEnd，回绕精确落在循环点、跳过 Vorbis 尾部 padding；
// 无循环标签的旧 BGM 退化为整曲 loop=true，行为与原生 audio.loop 完全一致。
// AudioContext 不可用 / fetch 与 XHR 都失败时自动降级为 HTMLAudioElement。
window.BGMWebAudio = (() => {
  // 只在 fetch/XHR 被允许的协议上启用 WebAudio：file:// 与 blob://（origin=null）
  // 下浏览器会以 CORS 策略直接拒绝请求并在 console 打错误，即使我们 catch 住也
  // 会污染「页面无 JS 错误」护栏。这类环境静默回退 HTMLAudioElement（原生 loop +
  // 文件已做零样本闭合，听感仍连续）。Electron 若注册 app:// 自定义协议即可自动启用。
  function available() {
    const p = window.location?.protocol;
    const webSafe = p === "http:" || p === "https:" || p === "app:"
      || p === "chrome-extension:" || p === "chrome:" || p === "isolated-app:";
    return !!(window.AudioContext || window.webkitAudioContext) && webSafe;
  }

  function xhrArrayBuffer(url) {
    return new Promise((resolve, reject) => {
      if (typeof XMLHttpRequest !== "function") return reject(new Error("no XHR"));
      const x = new XMLHttpRequest();
      x.open("GET", url, true);
      x.responseType = "arraybuffer";
      x.onload = () => (x.status === 200 || x.status === 0) && x.response
        ? resolve(x.response) : reject(new Error("XHR " + x.status));
      x.onerror = () => reject(new Error("XHR failed"));
      x.send();
    });
  }

  function readArrayBuffer(url) {
    if (typeof fetch !== "function") return xhrArrayBuffer(url);
    return fetch(url)
      .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.arrayBuffer(); })
      .catch(() => xhrArrayBuffer(url));
  }

  function create() {
    if (!available()) return null;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    let ctx;
    try { ctx = new Ctor(); } catch (_) { return null; }
    const gain = ctx.createGain();
    gain.connect(ctx.destination);

    let media = null;          // 解码失败后的 HTMLAudioElement 后备
    let src = "", buffer = null, source = null;
    let wantsPlay = false, token = 0, startAt = 0, volume = 0;
    let loopStart = 0, loopEnd = null;
    const self = { loop: true, preload: "auto", addEventListener() {} };

    function degrade() {
      if (media) return;
      try {
        media = new Audio();
        media.loop = true; media.preload = "auto";
        media.volume = volume;
        media.src = src;
        if (wantsPlay) media.play().catch(() => {});
      } catch (_) { media = null; }
    }

    function stopSource() {
      if (!source) return;
      try { source.stop(); } catch (_) {}
      try { source.disconnect(); } catch (_) {}
      source = null;
    }

    function start() {
      if (media) { if (wantsPlay) media.play().catch(() => {}); return; }
      if (!buffer) return;
      stopSource();
      const s = ctx.createBufferSource();
      s.buffer = buffer;
      s.loop = true;
      s.loopStart = loopStart || 0;
      // 有循环标签时精确截到 LOOPLENGTH；否则整曲循环（等价旧版 audio.loop=true）。
      s.loopEnd = loopEnd != null ? Math.min(loopEnd, buffer.duration) : buffer.duration;
      s.connect(gain);
      const offset = Math.min(startAt, Math.max(0, buffer.duration - 0.001));
      try { s.start(0, offset); } catch (_) { return; }
      source = s;
      wantsPlay = true;
      ctx.resume?.().catch?.(() => {});
    }

    function load(value) {
      const my = ++token;
      src = value || "";
      buffer = null; startAt = 0; loopStart = 0; loopEnd = null;
      stopSource();
      if (media) { media.src = src; if (wantsPlay) media.play().catch(() => {}); return; }
      if (!src) return;
      readArrayBuffer(src)
        .then(ab => {
          if (my !== token) return null;
          const meta = window.BGMLoopMetadata?.parse?.(ab);
          return ctx.decodeAudioData(ab).then(buf => ({ buf, meta }));
        })
        .then(result => {
          if (!result || my !== token) return;
          buffer = result.buf;
          const rate = result.meta?.sampleRate || result.buf.sampleRate;
          loopStart = result.meta ? result.meta.loopStart / rate : 0;
          loopEnd = result.meta?.loopEnd != null ? result.meta.loopEnd / rate : null;
          if (wantsPlay) start();
        })
        .catch(() => { if (my === token) degrade(); });
    }

    function play() {
      wantsPlay = true;
      if (media) return media.play();
      if (ctx.state === "suspended") ctx.resume?.().catch?.(() => {});
      if (buffer && !source) start();
      return Promise.resolve();
    }

    function pause() {
      wantsPlay = false;
      if (media) return media.pause();
      // 保留 source 与 context 时间轴，恢复时从同一采样点继续，不重新起播。
      ctx.suspend?.().catch?.(() => {});
    }

    Object.defineProperties(self, {
      src: {
        get: () => media ? media.src : src,
        set: value => { load(value); },
      },
      currentTime: {
        get: () => media ? media.currentTime : startAt,
        set: value => {
          startAt = Number(value) || 0;
          if (media) media.currentTime = startAt;
          else if (source && buffer) start();
        },
      },
      volume: {
        get: () => media ? media.volume : volume,
        set: value => {
          volume = Math.max(0, Math.min(1, Number(value) || 0));
          if (media) media.volume = volume;
          else gain.gain.value = volume;
        },
      },
      paused: {
        get: () => media ? media.paused : (wantsPlay ? ctx.state !== "running" : true),
      },
      play: { value: play },
      pause: { value: pause },
      load: { value: () => { if (media) media.load?.(); } },
      removeAttribute: {
        value: name => { if (name === "src") load(""); else if (media) media.removeAttribute?.(name); },
      },
    });
    return self;
  }

  return { available, create };
})();
