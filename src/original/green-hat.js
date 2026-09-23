window.GreenHat = (() => {
  const MAX = 5;
  const ATTACK_RATE = 0.3;
  const rounded = value => Number(value.toFixed(4));
  const countOf = unit => Math.min(MAX, Math.max(0, (unit?.greenHat || 0) + (unit?.envy || 0)));

  function normalize(unit) {
    if (!unit?.stats) return 0;
    const count = countOf(unit);
    if (!Number.isFinite(unit.greenHatAttackBase)) {
      const base = Math.max(0, (unit.stats.attack || 0) - count);
      unit.greenHatAttackBase = rounded(base);
      unit.greenHatAttackBonus = rounded(base * ATTACK_RATE * count);
      unit.stats.attack = rounded(base + unit.greenHatAttackBonus);
    }
    unit.greenHat = count;
    delete unit.envy;
    unit.statuses = (unit.statuses || []).filter(status => status !== "妒火");
    return count;
  }

  function grant(unit) {
    const count = normalize(unit);
    if (!unit?.stats || count >= MAX) return false;
    const gain = rounded(unit.greenHatAttackBase * ATTACK_RATE);
    unit.greenHat = count + 1;
    unit.greenHatAttackBonus = rounded((unit.greenHatAttackBonus || 0) + gain);
    unit.stats.attack = rounded((unit.stats.attack || 0) + gain);
    unit.stats.handLimit += 1;
    unit.stats.bloodlust += 1;
    unit.intent = Math.min(unit.stats.bloodlust, (unit.intent || 0) + 1);
    return true;
  }

  return { MAX, ATTACK_RATE, countOf, normalize, grant };
})();
