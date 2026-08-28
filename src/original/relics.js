window.RelicSystem = (() => {
  const aliases = {};
  const owns = (record, key) => Object.prototype.hasOwnProperty.call(record, key);
  const canonical = (name) => typeof name === "string"
    ? (owns(aliases, name) ? aliases[name] : name) : null;
  const special = { ...(window.GameDataFutureRelics || {}), ...(window.GameDataRelics || {}) };
  const eliteRelics = Object.keys(special);
  function data(name) {
    name = canonical(name);
    return name && owns(special, name) ? { name, ...special[name] } : null;
  }
  const isKnown = name => !!data(name);
  const isFormalId = name => typeof name === "string" && owns(special, name);
  function normalizeNames(names = []) {
    return Array.isArray(names) ? names.map(name => data(name)?.name).filter(Boolean) : [];
  }
  function normalizeSlots(names = []) {
    if (!Array.isArray(names)) return [];
    const slots = [];
    for (let index = 0; index < Math.min(2, names.length); index += 1) {
      slots[index] = data(names[index])?.name || null;
    }
    while (slots.length && !slots[slots.length - 1]) slots.pop();
    return slots;
  }
  function normalizeMap(map = {}) {
    if (!map || typeof map !== "object" || Array.isArray(map)) return {};
    return Object.fromEntries(Object.entries(map).map(([id, names]) => [id, normalizeSlots(names)]));
  }
  const testMode = (state) => state?.battle?.test || state?.testBattleStarting || state?.hallModal === "testBattle";
  const equipMap = (state) => testMode(state) ? (state.testEquipment ||= {}) : (state.equipment ||= {});
  const relicPool = (state) => testMode(state) ? [...(state.resources?.relics || []), ...(state.testRelics || [])] : (state.resources?.relics || []);
  function statsForNames(names = []) {
    return normalizeNames(names).reduce((sum, r) => {
      const d = data(r); Object.entries(d.stats).forEach(([k, v]) => sum[k] = (sum[k] || 0) + v); return sum;
    }, {});
  }
  function statsOf(state, charId) {
    return statsForNames(equipMap(state)?.[charId] || []);
  }
  function useHint(name) {
    const d = data(name);
    if (!d) return "";
    if (d.activeCard) return "出牌阶段可在手牌区左侧的饰品技能栏发动。";
    if (d.skillType === "trigger") return "满足条件时触发或弹出响应选择。";
    return "装备后生效；英雄级敌人携带时也会生效。";
  }
  function isActive(name) { return !!data(name)?.activeCard; }
  function typeName(name) {
    const d = data(name);
    if (!d) return "";
    return d.activeCard ? "出牌阶段" : d.skillType === "trigger" ? "触发" : "锁定";
  }
  function statText(name) {
    const d = data(name), type = typeName(name);
    if (!d) return "";
    return `${d.name}\n标签：${type}饰品\n效果：${d.effect}\n提示：${useHint(name)}\n背景：${d.lore || "暂无记录。"}\n掉落来源：${d.source || "未知"}`;
  }
  function sameRelic(a, b) {
    const left = data(a)?.name, right = data(b)?.name;
    return !!left && left === right;
  }
  function equippedEntries(state, relic) {
    return Object.entries(equipMap(state) || {}).flatMap(([id, list]) => (Array.isArray(list) ? list : []).map((r, i) => sameRelic(r, relic) ? { id, i } : null).filter(Boolean));
  }
  function equippedBy(state, relic) { return equippedEntries(state, relic)[0]?.id || null; }
  const countOwned = (state, relic) => Math.max(relicPool(state).filter(r => sameRelic(r, relic)).length, equippedEntries(state, relic).length);
  const countEquipped = (state, relic, exceptChar, exceptSlot) => equippedEntries(state, relic).filter(e => !(e.id === exceptChar && e.i === exceptSlot)).length;
  const availableCount = (state, relic) => Math.max(0, countOwned(state, relic) - countEquipped(state, relic));
  function unitRelics(state, unit) {
    if (!unit) return [];
    return normalizeNames([...(equipMap(state)?.[unit.ref] || []), ...(unit.battleRelics || [])]);
  }
  function hasEquipped(state, charId, relic) {
    if (typeof charId === "object") return unitRelics(state, charId).some(r => sameRelic(r, relic));
    return (equipMap(state)?.[charId] || []).some(r => sameRelic(r, relic));
  }
  function skillsForNames(names = []) {
    return normalizeNames(names).map(name => {
      const d = special[name];
      const type = d.skillType || (d.activeCard ? "active" : "passive");
      const icon = d.activeCard ? "⚔️" : type === "trigger" ? "🔵" : "⭐";
      return { name, type, source: "relic", icon, text: d.effect, card: d.activeCard ? { ...d.activeCard, icon, text: d.effect } : null };
    });
  }
  function skills(state, charId) {
    return skillsForNames(equipMap(state)?.[charId] || []);
  }
  function activeSkills(state, charId) {
    return skills(state, charId).filter(s => s.type === "active");
  }
  function all(state) {
    const testNames = testMode(state) ? (state?.testRelics || []) : [];
    const persisted = [...(state?.relicCollection || []), ...(state?.resources?.relics || []), ...testNames, ...Object.values(state?.equipment || {}).flat(), ...Object.values(equipMap(state) || {}).flat()];
    const names = new Set([...eliteRelics, ...normalizeNames(persisted)]);
    return [...names].map(data);
  }
  function ownedNames(state) {
    return new Set(normalizeNames([...(state.relicCollection || []), ...(state.resources?.relics || []), ...Object.values(state.equipment || {}).flat(), ...Object.values(equipMap(state) || {}).flat()]));
  }
  function randomElite(enemyId, exclude = new Set(), owner = window.state) {
    const pool = eliteRelics.filter(r => (!enemyId || special[r].enemy === enemyId) && !exclude.has(r));
    return pool.length ? sample(pool, owner) : null;
  }
  function sample(pool, owner) { return window.GameRandom.sample(pool, owner); }
  function equip(state, charId, relic, slot = 0) {
    relic = data(relic)?.name;
    if (!relic || ![0, 1].includes(slot) || !state.chars.some(c => c.id === charId)) return false;
    const map = equipMap(state); map[charId] = normalizeSlots(map[charId]);
    const old = map[charId][slot];
    if (map[charId].some((r, index) => index !== slot && sameRelic(r, relic))) return false;
    if (countEquipped(state, relic, charId, slot) >= countOwned(state, relic)) return false;
    if (old && sameRelic(old, relic)) return false;
    map[charId] = map[charId].filter((r, index) => index === slot || !sameRelic(r, relic)).slice(0, 2);
    map[charId][slot] = relic;
    if (!testMode(state) && old && !state.resources.relics.includes(old)) state.resources.relics.push(old);
    if (!testMode(state) && !state.resources.relics.includes(relic)) state.resources.relics.push(relic);
    return true;
  }
  function unequip(state, charId, slot) {
    const map = equipMap(state), list = map?.[charId], name = data(list?.[slot])?.name;
    if (!name) return false;
    list[slot] = null;
    map[charId] = normalizeSlots(list);
    if (!testMode(state) && name && !state.resources.relics.includes(name)) state.resources.relics.push(name);
    return true;
  }
  function bind(state, render, persist) {
    const bindings = window.RelicBindings?.({ equip, unequip, equipMap });
    if (!bindings) throw new Error("Relic bindings unavailable");
    return bindings.bind(state, render, persist);
  }
  function enemyRelics(enemyId) {
    return eliteRelics.filter(r => special[r].enemy === enemyId);
  }
  const skillIcon = name => {
    const d = data(name);
    if (!d) return "";
    return d.activeCard ? "⚔️" : d.skillType === "trigger" ? "🔵" : "⭐";
  };
  return { data, all, ownedNames, availableCount, statsOf, statsForNames, typeName, isActive, useHint, skillIcon, statText, equippedBy, hasEquipped, skills, skillsForNames, activeSkills, randomElite, enemyRelics, isKnown, isFormalId, normalizeNames, normalizeSlots, normalizeMap, equip, unequip, bind };
})();
