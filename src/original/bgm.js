window.GameBGM = (() => {
  const tracks = {
    op: "./assets/sounds/op.ogg",
    villa: "./assets/sounds/villa.ogg",
    dungeon: "./assets/sounds/dungeon-map.ogg",
    battle: "./assets/sounds/machine-factory-battle.ogg",
  };
  const audio = new Audio();
  audio.loop = true; audio.volume = 0.42; audio.preload = "auto";
  let current = "", pending = "", enabled = false, fadeId = 0;
  function loadSrc(src) {
    audio.loop = true;
    audio.src = src;
  }
  function battleTrack(missionId, enemies = []) {
    const mission = window.GameData?.missions?.find(m => m.id === missionId);
    return enemies.find(e => e.type === "boss" && e.bgm)?.bgm
      || enemies.find(e => e.type === "elite" && e.bgm)?.bgm
      || enemies.find(e => e.bgm)?.bgm
      || mission?.bgm
      || "battle";
  }
  function keyFor(state) {
    if (window.startOpen) return "op";
    if (state?.view === "battle") {
      if (state.battle?.victoryScreen || state.battle?.testComplete) return "";
      return state.battle?.bgmOverride || state.battle?.battleBgm || fallbackBattleBgm(state) || "battle";
    }
    if (state?.view === "dungeon" || state?.view === "dungeonInventory") return "dungeon";
    return "villa";
  }
  function fallbackBattleBgm(state) {
    const enemies = state?.battle?.enemies || [];
    return battleTrack(state?.battle?.missionId, enemies);
  }
  function playCurrent() {
    if (!enabled || !current) return;
    const token = fadeId, src = audio.src;
    audio.play().catch(err => {
      if (token !== fadeId || audio.src !== src) return;
      console.warn("BGM播放失败:", err.message);
    });
  }
  function clampVolume(value) {
    return Math.max(0, Math.min(1, Number(value) || 0));
  }
  function unlock() {
    enabled = true;
    document.removeEventListener("pointerdown", unlock);
    document.removeEventListener("click", unlock);
    playCurrent();
  }
  function setVolume(value) {
    const targetVolume = clampVolume((Number(value) || 0) / 100 * .9);
    const next = pending;
    ++fadeId;
    if (next) {
      current = next; pending = "";
      loadSrc(tracks[next] || next);
      audio.currentTime = 0;
    }
    if (!current) {
      audio.volume = 0;
      if (!audio.paused) audio.pause();
      if (audio.src) { audio.removeAttribute("src"); audio.load(); }
      return;
    }
    audio.volume = targetVolume;
    playCurrent();
  }
  function primeBattle(track = "battle") {
    enabled = true;
    const key = track || "battle", src = tracks[key] || key;
    if (!src) return;
    current = key; pending = ""; ++fadeId;
    if (audio.src && audio.src.endsWith(src.replace(/^\.\//, ""))) { audio.volume = 0; playCurrent(); return; }
    loadSrc(src); audio.currentTime = 0; audio.volume = 0; playCurrent();
  }
  function update(state) {
    const targetVolume = clampVolume((Number(state?.settings?.musicVolume ?? 80) || 0) / 100 * .9);
    const key = keyFor(state), src = tracks[key] || key;
    if (!src) return stopCurrent();
    if (state?.battle?.introSfxPending) {
      if (key !== current) { current = key; pending = ""; loadSrc(src); audio.currentTime = 0; }
      audio.volume = 0; playCurrent(); return;
    }
    if (key === current) { pending = ""; audio.volume = targetVolume; if (audio.paused) playCurrent(); return; }
    if (key === pending) return;
    pending = key; const token = ++fadeId;
    const switchNow = () => { if (token !== fadeId) return; current = key; pending = ""; loadSrc(src); audio.currentTime = 0; playCurrent(); fadeTo(targetVolume, 250, token); };
    if (!current || audio.paused) return switchNow();
    fadeTo(0, 250, token, switchNow);
  }
  function stopCurrent() {
    pending = ""; current = ""; const token = ++fadeId;
    if (audio.paused) return;
    fadeTo(0, 250, token, () => { if (token !== fadeId) return; audio.pause(); audio.removeAttribute("src"); audio.load(); });
  }
  function fadeTo(target, ms, token, done) {
    const start = audio.volume, t0 = performance.now();
    function step(now) { if (token !== fadeId) return; const p = Math.max(0, Math.min(1, (now - t0) / ms)); audio.volume = clampVolume(start + (target - start) * p); if (p < 1) requestAnimationFrame(step); else done?.(); }
    requestAnimationFrame(step);
  }
  document.addEventListener("pointerdown", unlock, { once: true });
  document.addEventListener("click", unlock, { once: true });
  return { update, setVolume, unlock, playCurrent, primeBattle, battleTrack };
})();
