window.SkinSystem = (() => {
  const { quality, skins } = window.GameSkinData;
  const byId = id => skins.find(skin => skin.id === id);
  const forChar = id => skins.filter(skin => skin.charId === id);
  function normalizeEquipment(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([charId, skinId]) =>
      byId(skinId)?.charId === charId));
  }
  function selectedForUnit(state, unit) {
    const id = unit?.ref || unit?.id;
    if (!state || !id) return null;
    const testSkin = state.battle?.test && byId(state.testSkins?.[id]);
    const trialSkin = testSkin;
    const skin = trialSkin?.charId === id ? trialSkin : byId(state.equippedSkins?.[id]);
    return skin?.charId === id
      && (state.battle?.test || skin.initial || owned(state, skin)) ? skin : null;
  }
  function dynamicEffectOf(state, unit) {
    const skin = selectedForUnit(state, unit);
    return skin ? skin.dynamicEffect || null : undefined;
  }
  const bertisArroganceVisible = unit => unit?.visualHp == null
    ? unit?.bertisArrogant !== false : unit.visualHp >= unit.maxHp;
  function damagedArtOf(state, unit) {
    const skin = selectedForUnit(state, unit);
    if (!skin?.damagedArt) return "";
    if (skin.id === "bertis_arrogant_queen") {
      return bertisArroganceVisible(unit) ? "" : skin.damagedArt;
    }
    if (skin.id === "besta_doll_energy_queen") {
      return unit?.extractMagicAttack ? skin.damagedArt : "";
    }
    return "";
  }
  function price(skin) {
    return skin.price ?? (quality[skin.quality]?.[1] || 0);
  }
  function qualityName(skin) {
    return skin.initial ? "初始" : (quality[skin.quality]?.[0] || "普通");
  }
  function levelUnlocked(state, skin) {
    const character = state?.chars?.find(item => item.id === skin?.charId);
    return !!skin?.unlockLevel && !!character && !character.locked
      && Number(character.level || 0) >= skin.unlockLevel;
  }
  function ensure(state) {
    state.ownedSkins ||= {};
    state.equippedSkins ||= {};
    skins.filter(skin => skin.initial).forEach(skin => {
      const character = state.chars?.find(item => item.id === skin.charId);
      if (character && !character.locked) state.ownedSkins[skin.id] = true;
      if (character && !character.locked && !state.equippedSkins[skin.charId]) {
        state.equippedSkins[skin.charId] = skin.id;
      }
    });
    skins.filter(skin => skin.unlockLevel).forEach(skin => {
      const character = state.chars?.find(item => item.id === skin.charId);
      if (!character) return;
      if (levelUnlocked(state, skin)) {
        state.ownedSkins[skin.id] = true;
        return;
      }
      delete state.ownedSkins[skin.id];
      if (state.equippedSkins[skin.charId] === skin.id) {
        const fallback = skins.find(item =>
          item.charId === skin.charId && item.initial);
        if (fallback) state.equippedSkins[skin.charId] = fallback.id;
      }
    });
  }
  function applyToChar(state, character, test = false) {
    if (!character) return character;
    ensure(state);
    const id = character.id || character.ref;
    const testSkin = test && byId(state.testSkins?.[id]);
    const trialSkin = testSkin;
    const skin = trialSkin?.charId === id ? trialSkin : byId(state.equippedSkins?.[id]);
    return skin && (test || skin.initial || owned(state, skin)) ? {
      ...character,
      art: skin.art,
      avatar: skin.art,
      skinName: skin.name,
      skinDynamicEffect: skin.dynamicEffect || null,
      skinDamagedArt: skin.damagedArt || null,
      skinVictoryArt: skin.victoryArt || null,
    } : character;
  }
  function owned(state, skin) {
    ensure(state);
    return skin?.unlockLevel
      ? levelUnlocked(state, skin) : !!state.ownedSkins?.[skin.id];
  }
  function buy(state, id) {
    ensure(state);
    const skin = byId(id);
    const cost = skin && price(skin);
    if (!skin || skin.initial || skin.unlockLevel || owned(state, skin)
      || (state.resources?.essence || 0) < cost) return false;
    state.resources.essence -= cost;
    state.ownedSkins[skin.id] = true;
    state.equippedSkins[skin.charId] = skin.id;
    state.skinFlash = skin.id;
    return true;
  }
  function equip(state, id) {
    ensure(state);
    const skin = byId(id);
    if (!skin || !owned(state, skin)) return false;
    state.equippedSkins[skin.charId] = skin.id;
    state.skinFlash = skin.id;
    return true;
  }
  function markAppearance(state) {
    ensure(state);
    state.settings ||= {};
    state.settings.appearanceUpdatedAt = Math.max(
      Date.now(), Number(state.settings.appearanceUpdatedAt || 0) + 1);
    state.settings.equippedSkins = { ...state.equippedSkins };
    return state.settings;
  }
  function applySavedAppearance(state, settings) {
    const savedAt = Number(settings?.appearanceUpdatedAt || 0);
    const currentAt = Number(state?.settings?.appearanceUpdatedAt || 0);
    if (!state || !(savedAt > currentAt)) return false;
    ensure(state);
    Object.entries(normalizeEquipment(settings.equippedSkins))
      .forEach(([charId, skinId]) => {
        const skin = byId(skinId);
        if (skin?.initial || owned(state, skin)) {
          state.equippedSkins[charId] = skinId;
        }
      });
    state.settings ||= {};
    state.settings.appearanceUpdatedAt = savedAt;
    state.settings.equippedSkins = { ...state.equippedSkins };
    return true;
  }
  function testEquip(state, charId, skinId) {
    const skin = byId(skinId);
    if (!skin || skin.charId !== charId) return false;
    state.testSkins ||= {};
    state.testSkins[charId] = skinId;
    state.skinFlash = skinId;
    return true;
  }
  return {
    skins, forChar, byId, selectedForUnit, dynamicEffectOf, damagedArtOf,
    bertisArroganceVisible, price, qualityName, ensure, applyToChar, owned,
    buy, equip, testEquip, levelUnlocked, normalizeEquipment, markAppearance,
    applySavedAppearance,
  };
})();
