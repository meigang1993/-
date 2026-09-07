window.GameBattleStyles = (() => {
  const core = [
    "./battle-style.css",
    "./battle-units.css",
    "./battle-cards.css",
    "./battle-effects-style.css",
    "./battle-card-motion.css",
    "./battle-damage-fx.css",
    "./battle-victory.css",
    "./battle-overlays.css",
  ];
  const effectStyles = {
    "nonoka-idol": "./nonoka-idol-skin.css",
    "manny-gun": "./manny-gun-skin.css",
    "bertis-queen": "./bertis-queen-skin.css",
    "flora-sonic": "./flora-sonic-skin.css",
    "wendy-teacher": "./wendy-teacher-skin.css",
    "elrana-fallen-physician": "./elrana-fallen-physician-skin.css",
    "angelica-berserker": "./angelica-berserker-skin.css",
    "lokar-motherbound": "./character-skin-fx.css",
    "besta-mecha": "./character-skin-fx.css",
  };

  function skinEffect(state, charId, test) {
    const skinId = test ? state?.testSkins?.[charId] : state?.equippedSkins?.[charId];
    const skin = window.SkinSystem?.byId?.(skinId);
    if (!skin || skin.charId !== charId) return null;
    if (!test && !window.SkinSystem?.owned?.(state, skin)) return null;
    return skin.dynamicEffect || null;
  }

  function optionalFor(context = {}) {
    const state = context.state || window.state;
    const effects = new Set(context.effects || []);
    const battle = state?.battle;
    const test = context.test ?? !!battle?.test;
    (battle?.allies || []).forEach(unit => {
      if (unit?.skinDynamicEffect) effects.add(unit.skinDynamicEffect);
      const resolved = window.SkinSystem?.dynamicEffectOf?.(state, unit);
      if (resolved) effects.add(resolved);
    });
    (context.skinIds || []).forEach(id => {
      const effect = window.SkinSystem?.byId?.(id)?.dynamicEffect;
      if (effect) effects.add(effect);
    });
    const battleIds = battle?.allies?.map(unit => unit.ref || unit.id);
    const allyIds = context.allyIds
      || (battleIds?.length ? battleIds : null)
      || state?.explore?.activeParty
      || state?.party
      || [];
    allyIds.forEach(id => {
      const effect = skinEffect(state, id, test);
      if (effect) effects.add(effect);
    });
    return [...new Set([...effects].map(effect => effectStyles[effect]).filter(Boolean))];
  }

  return { core, optionalFor };
})();
