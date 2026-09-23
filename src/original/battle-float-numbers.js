window.BattleFloatNumbers = (() => {
  let seen = new Set();
  let runtimeVersion = 0;
  const active = new Map();
  const maxActivePerTarget = 3;
  const later = (callback, ms) => setTimeout(
    callback, window.BattleEffectAnimation?.scaleMs?.(ms) ?? ms);
  const current = (state, battle, version = runtimeVersion) =>
    version === runtimeVersion && (!window.state || window.state === state)
    && state?.battle === battle;
  const unitArt = uid =>
    document.querySelector(`[data-target="${uid}"] .unit-art`);
  const combatBar = uid =>
    document.querySelector(`[data-target="${uid}"] .combat-bar`);
  const isHitKind = kind =>
    /^(damage|armor|armor-break|defense|defense-break)$/.test(kind || "");
  function removeFloat(uid, element) {
    element.remove();
    const floats = active.get(uid);
    if (!floats) return;
    const index = floats.indexOf(element);
    if (index >= 0) floats.splice(index, 1);
    if (!floats.length) active.delete(uid);
  }
  function trackFloat(uid, element) {
    const floats = (active.get(uid) || [])
      .filter(item => item.isConnected !== false);
    while (floats.length >= maxActivePerTarget) floats.shift().remove();
    floats.push(element);
    active.set(uid, floats);
  }
  function shardArmor(rect) {
    if (!rect) return;
    for (let index = 0; index < 5; index += 1) {
      const shard = document.createElement("i");
      shard.className = "armor-shard";
      shard.style.left = `${rect.left + rect.width / 2}px`;
      shard.style.top = `${rect.top + rect.height * .25}px`;
      shard.style.setProperty("--x", `${(index - 2) * 13}px`);
      shard.style.setProperty("--y",
        `${-18 + Math.abs(index - 2) * 6}px`);
      window.BattleEffectAnimation?.stampCssTiming?.(shard);
      document.body.appendChild(shard);
      later(() => shard.remove(), 520);
    }
  }
  function popOne(state, float) {
    const art = unitArt(float.uid);
    if (!art) return false;
    if (isHitKind(float.kind)
      && window.BattleHitFXFallback.hasDamageEffect(float)) {
      window.BattleHitFXFallback.slashHit(state, float);
    }
    const bar = combatBar(float.uid);
    const rect = art.getBoundingClientRect();
    const barRect = bar?.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const element = document.createElement("div");
    const offset = Math.min(44, (float.seq % 4) * 12);
    const damageType = float.damageTypes?.[0] || "physical";
    const magicAttack =
      float.attackType === "magic" || float.magicDamage;
    const damageClass = float.kind === "damage"
      ? magicAttack ? " damage-magic" : ` damage-type-${damageType}` : "";
    element.className =
      `float-num ${float.kind}${damageClass} ${float.critical ? "critical" : ""}`;
    const gain = float.kind === "heal" || float.kind === "armor-gain";
    const armor = float.kind.startsWith("armor");
    const defense = float.kind.startsWith("defense");
    element.textContent = `${float.label ? `${float.label} ` : ""}${gain ? "+" : "-"}${float.value}${defense ? " 防御系统" : armor ? " 护甲" : ""}`;
    element.style.left = `${(armor || defense) && barRect
      ? barRect.left - 8 : rect.left + rect.width / 2}px`;
    element.style.top = `${rect.top + rect.height * .38 - offset}px`;
    window.BattleEffectAnimation?.stampCssTiming?.(element);
    document.body.appendChild(element);
    trackFloat(float.uid, element);
    window.BattleBumpFX?.bumpTarget?.(art, float.kind, float.value);
    if (float.kind === "damage" && window.BattleDamageFX?.impact) {
      window.BattleDamageFX.impact(float);
    } else window.BattleAudio?.floatSfx(float.kind);
    if (float.kind === "armor-break" || float.kind === "defense-break") {
      shardArmor(barRect);
    }
    later(() => removeFloat(float.uid, element), 1200);
    return true;
  }
  function retry(state, battle, float, immediate, tries = 0,
    version = runtimeVersion) {
    if (!current(state, battle, version) || tries >= 3) return;
    later(() => {
      if (!current(state, battle, version) || seen.has(float.id)) return;
      if (popOne(state, float)) seen.add(float.id);
      else retry(state, battle, float, immediate, tries + 1, version);
    }, immediate ? 34 : 80);
  }
  function popFloats(state, id = null, immediate = false) {
    const battle = state.battle;
    const version = runtimeVersion;
    const items = battle?.floats || [];
    items.filter(float => !seen.has(float.id) && (!id || float.id === id))
      .forEach(float => {
        const show = () => {
          if (!current(state, battle, version) || seen.has(float.id)) return;
          if (popOne(state, float)) seen.add(float.id);
          else retry(state, battle, float, immediate, 0, version);
        };
        if (float.delay && !immediate) later(show, float.delay);
        else show();
      });
    if (items.length > 20) {
      state.battle.floats = items.slice(-20);
      const keep = new Set(state.battle.floats.map(float => float.id));
      seen.forEach(floatId => {
        if (!keep.has(floatId)) seen.delete(floatId);
      });
    }
  }
  function cancel() {
    runtimeVersion += 1;
    seen.clear();
    active.clear();
    document.querySelectorAll(".float-num,.armor-shard")
      .forEach(element => element.remove());
  }
  return { popFloats, cancel };
})();
