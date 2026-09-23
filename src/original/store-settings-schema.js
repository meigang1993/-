window.GameStoreSettingsSchema = defaults => {
  function volume(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number)
      ? Math.max(0, Math.min(100, number)) : fallback;
  }

  function battleSpeed(value) {
    const number = Number(value);
    return [1, 1.5, 2].includes(number) ? number : defaults.battleSpeed;
  }

  function normalize(value) {
    const source = value?.settings || value || {};
    return {
      sfxVolume: volume(source.sfxVolume, defaults.sfxVolume),
      musicVolume: volume(source.musicVolume, defaults.musicVolume),
      battleSpeed: battleSpeed(source.battleSpeed),
      manualResponse: !!source.manualResponse,
      appearanceUpdatedAt: Math.max(0, Number(source.appearanceUpdatedAt) || 0),
      equippedSkins: window.SkinSystem?.normalizeEquipment?.(source.equippedSkins) || {},
    };
  }

  function validStored(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const source = value.settings ?? value;
    if (!source || typeof source !== "object" || Array.isArray(source)) return false;
    const keys = ["sfxVolume", "musicVolume", "battleSpeed", "manualResponse"];
    if (!keys.some(key => Object.prototype.hasOwnProperty.call(source, key))) return false;
    if (source.sfxVolume != null && !Number.isFinite(Number(source.sfxVolume))) return false;
    if (source.musicVolume != null && !Number.isFinite(Number(source.musicVolume))) return false;
    if (source.battleSpeed != null
      && ![1, 1.5, 2].includes(Number(source.battleSpeed))) return false;
    if (source.manualResponse != null && typeof source.manualResponse !== "boolean") return false;
    if (source.appearanceUpdatedAt != null
      && (!Number.isFinite(Number(source.appearanceUpdatedAt))
        || Number(source.appearanceUpdatedAt) < 0)) return false;
    if (source.equippedSkins != null) {
      if (typeof source.equippedSkins !== "object"
        || Array.isArray(source.equippedSkins)) return false;
      if (Object.values(source.equippedSkins)
        .some(skinId => typeof skinId !== "string")) return false;
    }
    return true;
  }

  return { normalize, validStored };
};
