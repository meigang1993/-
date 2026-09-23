window.BattleDamageFX = (() => {
  const STEP_MS = 150;
  const LIFE_MS = 520;
  const RETRY_MS = 34;
  const MAX_SHOW_RETRIES = 8;
  const MAX_ACTIVE_PER_TARGET = 2;
  const tintClasses = ["damage-tint-poison", "damage-tint-dark"];
  let sequence = 0, runtimeVersion = 0;
  const pendingTimers = new Set();
  const activeRoots = new Map();
  const unitArt = uid => document.querySelector(`[data-target="${uid}"] .unit-art`);
  function unlockAudio() { window.BattleDamageAudio?.unlock?.(); }
  function particles(root, className, count) {
    for (let i = 0; i < count; i++) {
      const part = document.createElement("i");
      const spread = i - (count - 1) / 2;
      part.className = className;
      part.style.setProperty("--angle", `${i * 360 / count}deg`);
      part.style.setProperty("--arc-angle", `${-17 + i * 31}deg`);
      part.style.setProperty("--x", `${8 + i * 84 / Math.max(1, count - 1)}%`);
      part.style.setProperty("--y", `${38 + i % 3 * 8}%`);
      part.style.setProperty("--size", `${7 + i % 3 * 3}px`);
      part.style.setProperty("--height", `${48 + i % 3 * 9}%`);
      part.style.setProperty("--spread-x", `${spread * 9}px`);
      part.style.setProperty("--spread-y", `${(i % 3 - 1) * 18}px`);
      root.appendChild(part);
    }
  }
  function schedule(callback, delay) {
    const version = runtimeVersion;
    const timer = setTimeout(() => {
      pendingTimers.delete(timer);
      if (version === runtimeVersion) callback();
    }, window.BattleEffectAnimation?.scaleMs?.(delay) ?? delay);
    pendingTimers.add(timer);
    return timer;
  }
  function decorate(root, type, critical = false) {
    if (type === "physical") particles(root, "damage-slash-arc", 2);
    else if (type === "poison") particles(root, "damage-poison-drop", 9);
    else if (type === "thunder") { particles(root, "damage-lightning-bolt", 1); particles(root, "damage-electric-spark", 7); }
    else if (type === "fire") particles(root, "damage-flame", 4);
    else if (type === "holy") { particles(root, "damage-holy-pillar", 1); particles(root, "damage-feather", 7); }
    else if (type === "dark") particles(root, "damage-dark-mist", 8);
    else if (type === "ice") { particles(root, "damage-ice-core", 1); particles(root, "damage-ice-shard", 8); }
    else if (type === "magic") {
      particles(root, "damage-magic-circle", 1);
      particles(root, "damage-magic-beam", critical ? 6 : 3);
      particles(root, "damage-magic-star", critical ? 12 : 8);
    }
  }
  function tint(art, type, token) {
    art.classList.remove(...tintClasses);
    if (type !== "poison" && type !== "dark") return;
    art.dataset.damageTintId = token; art.classList.add(`damage-tint-${type}`);
    schedule(() => {
      if (art.dataset.damageTintId !== token) return;
      art.classList.remove(`damage-tint-${type}`); delete art.dataset.damageTintId;
    }, 320);
  }
  function fitCenter(value, size, limit) {
    const pad = 6, half = size / 2;
    if (limit <= size + pad * 2) return limit / 2;
    return Math.max(half + pad, Math.min(limit - half - pad, value));
  }
  function removeRoot(uid, root) {
    root.remove();
    const roots = activeRoots.get(uid);
    if (!roots) return;
    const index = roots.indexOf(root);
    if (index >= 0) roots.splice(index, 1);
    if (!roots.length) activeRoots.delete(uid);
  }
  function trackRoot(uid, root) {
    const roots = (activeRoots.get(uid) || []).filter(item => item.isConnected);
    while (roots.length >= MAX_ACTIVE_PER_TARGET) roots.shift().remove();
    roots.push(root);
    activeRoots.set(uid, roots);
  }
  function show(uid, type, critical = false) {
    const art = unitArt(uid); if (!art) return false;
    const rect = art.getBoundingClientRect(); if (rect.width <= 0 || rect.height <= 0) return false;
    const token = `dfx${++sequence}`, root = document.createElement("div");
    const magic = type === "magic", width = Math.max(magic ? 104 : 88, rect.width + (magic ? 42 : 24)), height = Math.max(magic ? 118 : 104, rect.height + 30), scale = critical ? 1.3 : 1;
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth, viewportHeight = document.documentElement.clientHeight || window.innerHeight;
    root.className = `${magic ? "damage-attribute-fx damage-magic-fx" : `damage-attribute-fx damage-attribute-${type}`}${critical ? " critical" : ""}`;
    root.style.left = `${fitCenter(rect.left + rect.width / 2, width * scale, viewportWidth)}px`;
    root.style.top = `${fitCenter(magic ? rect.bottom - 8 : rect.top + rect.height / 2, height * scale, viewportHeight)}px`;
    root.style.width = `${width}px`; root.style.height = `${height}px`;
    window.BattleEffectAnimation?.stampCssTiming?.(root);
    decorate(root, type, critical); trackRoot(uid, root);
    document.body.appendChild(root); tint(art, type, token);
    schedule(() => removeRoot(uid, root), LIFE_MS); return true;
  }
  function showWithRetry(uid, type, critical, tries = 0) {
    if (show(uid, type, critical) || tries >= MAX_SHOW_RETRIES) return;
    schedule(() => showWithRetry(uid, type, critical, tries + 1), RETRY_MS);
  }
  function typesOf(evt) {
    const order = window.BattleDamageAttributes?.order || ["physical", "poison", "thunder", "fire", "holy", "dark", "ice"];
    const requested = new Set(evt?.damageTypes || []);
    const types = order.filter(type => requested.has(type));
    return types.length ? types : ["physical"];
  }
  const isMagicAttack = evt => evt?.attackType === "magic" || evt?.magicDamage;
  function effectTypes(evt) {
    const types = typesOf(evt);
    if (!isMagicAttack(evt)) return types;
    return evt?.hybridAttack ? [...types, "magic"] : [...types.filter(type => type !== "physical"), "magic"];
  }
  function play(evt) {
    const types = effectTypes(evt);
    const critical = !!(evt.effectCritical || evt.critical);
    let index = 0;
    const showNext = () => {
      showWithRetry(evt.uid, types[index], critical);
      index += 1;
      if (index < types.length) schedule(showNext, STEP_MS);
    };
    schedule(showNext, 0);
  }
  function impact(evt) {
    const type = isMagicAttack(evt) ? "magic" : typesOf(evt)[0];
    if (type === "physical") window.BattleAudio?.floatSfx?.("damage");
    else if (type === "magic" && window.BattleAudio?.magicHit) window.BattleAudio.magicHit();
    else window.BattleDamageAudio?.sound?.(type);
  }
  const leadTime = evt => 70 + Math.max(0, effectTypes(evt).length - 1) * STEP_MS;
  const sequenceDuration = evt => effectTypes(evt).length * STEP_MS;
  function cancel() {
    runtimeVersion += 1;
    window.BattleDamageAudio?.cancel?.();
    pendingTimers.forEach(timer => clearTimeout(timer)); pendingTimers.clear();
    document.querySelectorAll(".damage-attribute-fx").forEach(element => element.remove());
    activeRoots.clear();
    document.querySelectorAll(".damage-tint-poison,.damage-tint-dark").forEach(element => {
      element.classList.remove(...tintClasses); delete element.dataset.damageTintId;
    });
  }
  document.addEventListener("pointerdown", unlockAudio, { once: true });
  document.addEventListener("click", unlockAudio, { once: true });
  return { play, impact, leadTime, sequenceDuration, unlockAudio, cancel };
})();
