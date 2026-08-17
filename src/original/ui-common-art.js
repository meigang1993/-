window.UICommonArt = deps => {
  const { esc, classToken, classList, skillSummary, skillTitle } = deps;

  function resolveArt(unit, art, preferredArt = "") {
    if (unit?.faceDown) return window.GameAssets?.faceDownCardBack || art;
    const failed = url => !!url && (unit?._assetFailedUrls?.includes?.(url)
      || window.GameAssets?.failed?.(url));
    if (preferredArt && !failed(preferredArt)) return preferredArt;
    if (failed(art)) {
      art = [unit?.avatar, unit?.art].find(url => url !== art && !failed(url)) || "";
    }
    const state = window.state;
    const skin = state && (unit?.ref || unit?.id)
      && window.SkinSystem?.applyToChar?.(
        state,
        { id: unit.ref || unit.id, art, avatar: art },
        !!state.battle?.test
      );
    if (skin?.art && skin.art !== art && !failed(skin.art)) return skin.art;
    if (art || !unit?.id) return art;
    for (const list of Object.values(GameData.enemies || {})) {
      const found = list.find(enemy => enemy.id === unit.id);
      if (found?.art && !failed(found.art)) return found.art;
    }
    return art;
  }

  function artBox(value, cls, art, fallback) {
    const unit = value || {};
    const requestedClass = classList(cls);
    const state = window.state;
    const battleArt = state?.view === "battle"
      && (requestedClass.includes("unit-art") || requestedClass.includes("portrait"));
    const damagedArt = battleArt
      ? window.SkinSystem?.damagedArtOf?.(state, unit) || "" : "";
    const src = resolveArt(unit, art, damagedArt);
    const key = classToken(unit.ref || unit.id || unit.uid || "unit");
    const now = Date.now();
    const downUntil = unit.faceDownAnimationUntil || 0;
    const upUntil = unit.faceUpAnimationUntil || 0;
    const faceClass = unit.faceDown && downUntil > now
      ? " face-down-art"
      : !unit.faceDown && upUntil > now ? " face-up-art" : "";
    const faceUntil = faceClass ? (unit.faceDown ? downUntil : upUntil) : 0;
    const faceStyle = faceUntil
      ? ` style="--face-flip-delay:-${Math.min(300, Math.max(0, 350 - (faceUntil - now)))}ms"`
      : "";
    const stateArtClass = damagedArt ? " skin-state-art" : "";
    const baseBoxClass = `${requestedClass}${faceClass}${stateArtClass}`;
    const unitId = unit.ref || unit.id;
    const skinId = unitId && window.state?.equippedSkins?.[unitId];
    const skin = unit.faceDown || damagedArt
      ? null : window.SkinSystem?.byId?.(skinId);
    const resolvedEffect = window.SkinSystem?.dynamicEffectOf?.(state, unit);
    const skinEffect = classToken(resolvedEffect === undefined
      ? unit.skinDynamicEffect || skin?.dynamicEffect
      : resolvedEffect);
    const boxClass = `${baseBoxClass}${skinEffect ? ` skin-effect-${skinEffect}` : ""}`;
    const isBattleUnit = boxClass.includes("unit-art");
    const artLabel = battleArt
      ? ` aria-label="${esc(unit.name || "角色")}立绘" title="${esc(skillSummary(unit))}"`
      : ` title="${esc(skillTitle(unit))}"`;
    const priority = isBattleUnit
      ? ` loading="eager" fetchpriority="high"` : ` loading="lazy"`;
    const fallbackActive = !src && !!unit._assetFailedUrls?.length;
    const media = `<img src="${esc(src)}" alt="${esc(unit.name || "角色")}"${priority} decoding="async" draggable="false">`;
    const fallbackMedia = `<span class="asset-fallback-face">${esc(fallback || unit.face || unit.name?.[0] || "?")}</span>${fallbackActive ? "<small>备用</small>" : ""}`;
    return src
      ? `<div class="${boxClass} art-${key}"${faceStyle}${artLabel} data-art-src="${esc(src)}" data-art-name="${esc(unit.name || "")}">${media}</div>`
      : `<div class="${boxClass} art-${key}${fallbackActive ? " asset-fallback-art" : ""}"${faceStyle}${artLabel}${fallbackActive ? ' data-asset-fallback="1"' : ""}>${fallbackMedia}</div>`;
  }

  function face(value, big = false) {
    const unit = value || {};
    const art = big ? unit.art : (unit.avatar || unit.art);
    return artBox(unit, `portrait ${big ? "large" : ""}`, art, unit.face || unit.name?.[0]);
  }

  return { face, artBox };
};
