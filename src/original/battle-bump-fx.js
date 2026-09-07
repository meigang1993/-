window.BattleBumpFX = (() => {
  const active = new Map();
  const unitArt = uid => document.querySelector(`[data-target="${uid}"] .unit-art`);

  function detach(record) {
    record.art?.removeEventListener("animationend", record.onEnd);
    if (record.unit?.dataset.bumpId !== record.id) return;
    record.unit.classList.remove("hit-bump", "heal-bump", "armor-bump", "bump-reset");
    record.unit.style.removeProperty("--shake");
    delete record.unit.dataset.bumpId;
  }
  function finish(record) {
    if (active.get(record.uid) !== record) return;
    active.delete(record.uid);
    clearTimeout(record.timer);
    detach(record);
  }
  function resetTimer(record) {
    clearTimeout(record.timer);
    record.timer = setTimeout(
      () => finish(record),
      window.BattleEffectAnimation?.scaleMs?.(700) ?? 700,
    );
  }
  function merge(record, shake) {
    record.shake = shake;
    record.unit.style.setProperty("--shake", `${shake}px`);
    resetTimer(record);
  }
  function attach(record, art) {
    const unit = art?.closest(".unit");
    if (!unit) return;
    detach(record);
    record.art = art;
    record.unit = unit;
    window.BattleEffectAnimation?.stampCssTiming?.(unit);
    unit.dataset.bumpId = record.id;
    unit.style.setProperty("--shake", `${record.shake}px`);
    unit.classList.remove("hit-bump", "heal-bump", "armor-bump");
    unit.classList.add(record.cls);
    art.addEventListener("animationend", record.onEnd);
  }
  function bumpTarget(art, kind, value = 1) {
    const cls = kind === "damage" || kind === "hp-loss"
      ? "hit-bump" : kind === "heal" ? "heal-bump"
        : kind.startsWith("armor") || kind.startsWith("defense") ? "armor-bump" : null;
    const unit = cls && art.closest(".unit");
    if (!unit) return;
    const uid = unit.dataset.target;
    if (!uid) return;
    const shake = kind === "damage" ? Math.min(12, 4 + Number(value || 1) * 1.15) : 5;
    const prior = active.get(uid);
    if (prior?.unit === unit && prior.art === art && prior.cls === cls) {
      merge(prior, shake);
      return;
    }
    if (prior) {
      active.delete(uid);
      clearTimeout(prior.timer);
      detach(prior);
    }
    const id = window.GameRandom.id("bump");
    const animationName = cls === "hit-bump"
      ? "hitBump" : cls === "heal-bump" ? "healBump" : "armorBump";
    const record = {
      uid, id, cls, animationName, shake,
      unit: null, art: null, onEnd: null, timer: null,
    };
    record.onEnd = event => {
      if (event.target === record.art && event.animationName === animationName) finish(record);
    };
    active.set(uid, record);
    attach(record, art);
    resetTimer(record);
  }
  function sync() {
    active.forEach(record => {
      const art = unitArt(record.uid);
      if (art && art !== record.art) attach(record, art);
    });
  }
  function clear() {
    active.forEach(record => {
      clearTimeout(record.timer);
      detach(record);
    });
    active.clear();
    document.querySelectorAll(".hit-bump,.heal-bump,.armor-bump,.bump-reset")
      .forEach(unit => {
        unit.classList.remove("hit-bump", "heal-bump", "armor-bump", "bump-reset");
        unit.style.removeProperty("--shake");
        delete unit.dataset.bumpId;
      });
  }
  return { bumpTarget, sync, clear };
})();
