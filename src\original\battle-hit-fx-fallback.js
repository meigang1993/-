window.BattleHitFXFallback = (() => {
  let slashTimer = null;
  let runtimeVersion = 0;
  const seen = new Set();
  const later = (callback, ms) => setTimeout(
    callback, window.BattleEffectAnimation?.scaleMs?.(ms) ?? ms);
  const current = (state, battle, version = runtimeVersion) =>
    version === runtimeVersion && (!window.state || window.state === state)
    && state?.battle === battle;
  const unitArt = uid =>
    document.querySelector(`[data-target="${uid}"] .unit-art`);
  function hasDamageEffect(event) {
    return event?.kind === "damage" || !!event?.damageTypes?.length;
  }
  function slashHit(state, event, tries = 0, version = runtimeVersion,
    battle = state?.battle) {
    if (!current(state, battle, version)) return;
    const id = event?.hitFxId || battle?.hitFxId;
    const uid = event?.uid || battle?.lastHitUid;
    if (!event) {
      event = [...(battle?.floats || [])].reverse().find(float =>
        float.hitFxId === id && float.uid === uid && hasDamageEffect(float));
    }
    const fxKey = `${id}:${(event?.damageTypes || ["physical"]).join(",")}:${event?.attackType === "magic" || event?.magicDamage ? "magic" : "plain"}:${event?.hybridAttack ? "hybrid" : "single"}`;
    if (!id || seen.has(fxKey) || !uid) return;
    const art = unitArt(uid);
    if (!art) {
      if (tries < 3) {
        later(() => slashHit(
          state, event, tries + 1, version, battle), 34);
      }
      return;
    }
    const rect = art.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      if (tries < 3) {
        later(() => slashHit(
          state, event, tries + 1, version, battle), 34);
      }
      return;
    }
    seen.add(fxKey);
    if (seen.size > 40) seen.delete(seen.values().next().value);
    if (window.BattleDamageFX) {
      window.BattleDamageFX.play(event || { uid });
      return;
    }
    clearTimeout(slashTimer);
    document.querySelector(".slash-fx")?.remove();
    const effect = document.createElement("div");
    effect.className = "slash-fx";
    effect.style.left = `${rect.left + rect.width / 2}px`;
    effect.style.top = `${rect.top + rect.height / 2}px`;
    effect.style.width = `${Math.max(70, rect.width + 28)}px`;
    window.BattleEffectAnimation?.stampCssTiming?.(effect);
    document.body.appendChild(effect);
    if (event?.kind) window.BattleAudio?.floatSfx(event.kind);
    slashTimer = later(() => effect.remove(), 600);
  }
  function queueSlashHit(state, event, delay) {
    const version = runtimeVersion;
    const battle = state?.battle;
    later(() => {
      if (current(state, battle, version)) {
        slashHit(state, event, 0, version, battle);
      }
    }, delay);
  }
  function cancel() {
    runtimeVersion += 1;
    clearTimeout(slashTimer);
    slashTimer = null;
    seen.clear();
    document.querySelectorAll(".slash-fx").forEach(element => element.remove());
  }
  return { slashHit, queueSlashHit, hasDamageEffect, cancel };
})();
