window.BattleFloatNumbers = (() => {
  let seen = new Set();
  let runtimeVersion = 0;
  const active = new Map();
  // 同一目标上允许同时存在的飘字上限。
  //
  // 原值为 3，且超限时会把最旧的那个立刻 remove() —— 多段伤害
  // （连击 / 追击 / 狂暴链锯额外结算）一旦在同一目标上叠加到第 4 个，
  // 最早的几个会在同一帧内被销毁，实测存活 0ms，玩家根本看不到数字。
  // 多段攻击一段最多 6 段，故上限提到 6；且超限只"停止跟踪"、不再强制
  // remove()，让数字按自己的 1200ms 动画自然飘完再消失。
  const maxActivePerTarget = 6;
  // 纵向槽位按【每个单位各自计数】，不能用全局 seq。
  // seq 是全局递增的，同单位上 seq 相差 4 的两次伤害会落到完全相同的坐标
  // 相互盖住，看起来就像少了一个数字。
  // 槽位给到 8：一次性弹出积压飘字时（cancel / 存档回档后）8 段仍各有落点。
  const SLOT_COUNT = 8;
  const SLOT_STEP = 8;
  const slots = new Map();
  function nextSlot(uid) {
    const next = ((slots.get(uid) ?? -1) + 1) % SLOT_COUNT;
    slots.set(uid, next);
    return next;
  }
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
    while (floats.length >= maxActivePerTarget) floats.shift();
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
    const offset = Math.min(56, nextSlot(float.uid) * SLOT_STEP);
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
    slots.clear();
    document.querySelectorAll(".float-num,.armor-shard")
      .forEach(element => element.remove());
  }
  return { popFloats, cancel };
})();
