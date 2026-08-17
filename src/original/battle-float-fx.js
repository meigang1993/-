window.BattleFloatFX = (() => {
  let slashTimer = null;
  let floatSeen = new Set();
  let runtimeVersion = 0;
  const activeFloats = new Map();
  const MAX_ACTIVE_PER_TARGET = 3;
  const slashFxSeen = new Set();
  const current = (state, battle, version = runtimeVersion) =>
    version === runtimeVersion && (!window.state || window.state === state)
    && state?.battle === battle;
  const later = (callback, ms) => setTimeout(
    callback, window.BattleEffectAnimation?.scaleMs?.(ms) ?? ms);
  const unitArt = uid => document.querySelector(`[data-target="${uid}"] .unit-art`);
  const combatBar = uid => document.querySelector(`[data-target="${uid}"] .combat-bar`);

  function popFloats(state, id = null, immediate = false) {
    const battle = state.battle;
    const version = runtimeVersion;
    const items = battle?.floats || [];
    items.filter(f => !floatSeen.has(f.id) && (!id || f.id === id)).forEach(f => {
      const show = () => {
        if (!current(state, battle, version) || floatSeen.has(f.id)) return;
        if (popOne(state, f)) floatSeen.add(f.id);
        else retryFloat(state, battle, f, immediate, 0, version);
      };
      if (f.delay && !immediate) later(show, f.delay); else show();
    });
    if (items.length > 20) {
      state.battle.floats = items.slice(-20);
      const keep = new Set(state.battle.floats.map(f => f.id));
      floatSeen.forEach(floatId => {
        if (!keep.has(floatId)) floatSeen.delete(floatId);
      });
    }
  }
  function retryFloat(state, battle, float, immediate, tries = 0, version = runtimeVersion) {
    if (!current(state, battle, version) || tries >= 3) return;
    later(() => {
      if (!current(state, battle, version) || floatSeen.has(float.id)) return;
      if (popOne(state, float)) floatSeen.add(float.id);
      else retryFloat(state, battle, float, immediate, tries + 1, version);
    }, immediate ? 34 : 80);
  }
  function removeFloat(uid, element) {
    element.remove();
    const floats = activeFloats.get(uid);
    if (!floats) return;
    const index = floats.indexOf(element);
    if (index >= 0) floats.splice(index, 1);
    if (!floats.length) activeFloats.delete(uid);
  }
  function trackFloat(uid, element) {
    const floats = (activeFloats.get(uid) || [])
      .filter(item => item.isConnected !== false);
    while (floats.length >= MAX_ACTIVE_PER_TARGET) floats.shift().remove();
    floats.push(element);
    activeFloats.set(uid, floats);
  }
  function popOne(state, float) {
    const art = unitArt(float.uid);
    if (!art) return false;
    if (isHitKind(float.kind) && hasDamageEffect(float)) slashHit(state, float);
    const bar = combatBar(float.uid);
    const rect = art.getBoundingClientRect();
    const barRect = bar?.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const el = document.createElement("div");
    const offset = Math.min(44, (float.seq % 4) * 12);
    const damageType = float.damageTypes?.[0] || "physical";
    const magicAttack = float.attackType === "magic" || float.magicDamage;
    const damageClass = float.kind === "damage"
      ? magicAttack ? " damage-magic" : ` damage-type-${damageType}` : "";
    el.className = `float-num ${float.kind}${damageClass} ${float.critical ? "critical" : ""}`;
    const gain = float.kind === "heal" || float.kind === "armor-gain";
    const armor = float.kind.startsWith("armor");
    const defense = float.kind.startsWith("defense");
    el.textContent = `${float.label ? `${float.label} ` : ""}${gain ? "+" : "-"}${float.value}${defense ? " 防御系统" : armor ? " 护甲" : ""}`;
    el.style.left = `${(armor || defense) && barRect ? barRect.left - 8 : rect.left + rect.width / 2}px`;
    el.style.top = `${rect.top + rect.height * .38 - offset}px`;
    window.BattleEffectAnimation?.stampCssTiming?.(el);
    document.body.appendChild(el);
    trackFloat(float.uid, el);
    window.BattleBumpFX?.bumpTarget?.(art, float.kind, float.value);
    if (float.kind === "damage" && window.BattleDamageFX?.impact) {
      window.BattleDamageFX.impact(float);
    } else window.BattleAudio?.floatSfx(float.kind);
    if (float.kind === "armor-break" || float.kind === "defense-break") shardArmor(barRect);
    later(() => removeFloat(float.uid, el), 1200);
    return true;
  }
  function syncBumps() {
    window.BattleBumpFX?.sync?.();
  }
  function isHitKind(kind) {
    return /^(damage|armor|armor-break|defense|defense-break)$/.test(kind || "");
  }
  function hasDamageEffect(event) {
    return event?.kind === "damage" || !!event?.damageTypes?.length;
  }
  function shardArmor(rect) {
    if (!rect) return;
    for (let index = 0; index < 5; index += 1) {
      const shard = document.createElement("i");
      shard.className = "armor-shard";
      shard.style.left = `${rect.left + rect.width / 2}px`;
      shard.style.top = `${rect.top + rect.height * .25}px`;
      shard.style.setProperty("--x", `${(index - 2) * 13}px`);
      shard.style.setProperty("--y", `${-18 + Math.abs(index - 2) * 6}px`);
      window.BattleEffectAnimation?.stampCssTiming?.(shard);
      document.body.appendChild(shard);
      later(() => shard.remove(), 520);
    }
  }
  function slashHit(state, event, tries = 0, version = runtimeVersion, battle = state?.battle) {
    if (!current(state, battle, version)) return;
    const id = event?.hitFxId || battle?.hitFxId;
    const uid = event?.uid || battle?.lastHitUid;
    if (!event) {
      event = [...(battle?.floats || [])].reverse().find(float =>
        float.hitFxId === id && float.uid === uid && hasDamageEffect(float));
    }
    const fxKey = `${id}:${(event?.damageTypes || ["physical"]).join(",")}:${event?.attackType === "magic" || event?.magicDamage ? "magic" : "plain"}:${event?.hybridAttack ? "hybrid" : "single"}`;
    if (!id || slashFxSeen.has(fxKey) || !uid) return;
    const art = unitArt(uid);
    if (!art) {
      if (tries < 3) later(() => slashHit(state, event, tries + 1, version, battle), 34);
      return;
    }
    const rect = art.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      if (tries < 3) later(() => slashHit(state, event, tries + 1, version, battle), 34);
      return;
    }
    slashFxSeen.add(fxKey);
    if (slashFxSeen.size > 40) slashFxSeen.delete(slashFxSeen.values().next().value);
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
      if (current(state, battle, version)) slashHit(state, event, 0, version, battle);
    }, delay);
  }
  function clearBumps() {
    window.BattleBumpFX?.clear?.();
  }
  function cancel() {
    runtimeVersion += 1;
    clearTimeout(slashTimer);
    slashTimer = null;
    slashFxSeen.clear();
    floatSeen.clear();
    activeFloats.clear();
    clearBumps();
    document.querySelectorAll(".float-num,.slash-fx,.armor-shard").forEach(el => el.remove());
  }
  return {
    popFloats, slashHit, queueSlashHit, hasDamageEffect,
    syncBumps, clearBumps, cancel,
  };
})();
