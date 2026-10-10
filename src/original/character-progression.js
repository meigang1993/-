window.CharacterProgression = (() => {
  const maxLevel = 20;
  const expToNext = Object.freeze([
    100, 160, 240, 340, 470, 620, 800, 1020,
    1280, 1580, 1920, 2300, 2720, 3180, 3680,
    4220, 4800, 5420, 6080, 6780,
  ]);
  const encounterExp = Object.freeze({ normal: 30, elite: 70, boss: 130 });
  const dungeonExpMultiplier = Object.freeze({
    machine_factory: 1, underwater_train: 2, orc_dungeon: 3, ruins_sand_city: 4,
  });
  const growth = Object.freeze({
    lokar: { maxHp: 140.21, attack: 33.71, magic: 12.25, speed: 14.59 },
    besta_doll: { maxHp: 105.16, attack: 18.73, magic: 32.66, speed: 10.95 },
    manny: { maxHp: 140.21, attack: 29.97, magic: 20.41, speed: 18.24 },
    miller: { maxHp: 186.95, attack: 18.73, magic: 20.41, speed: 14.59 },
    nonoka: { maxHp: 151.90, attack: 11.24, magic: 36.73, speed: 14.59 },
    loki: { maxHp: 198.63, attack: 37.45, magic: 8.16, speed: 16.41 },
    flora: { maxHp: 105.16, attack: 33.71, magic: 12.25, speed: 27.36 },
    wendy: { maxHp: 140.21, attack: 7.49, magic: 32.66, speed: 18.24 },
    cadicis: { maxHp: 163.58, attack: 37.45, magic: 8.16, speed: 16.41 },
    carlos: { maxHp: 128.53, attack: 26.22, magic: 8.16, speed: 23.71 },
    bertis: { maxHp: 186.95, attack: 26.22, magic: 28.57, speed: 10.95 },
    gerlot: { maxHp: 151.90, attack: 29.97, magic: 8.16, speed: 20.06 },
    angelica: { maxHp: 204.48, attack: 37.45, magic: 8.16, speed: 10.95 },
    luka: { maxHp: 198.63, attack: 33.71, magic: 8.16, speed: 18.24 },
    elrana: { maxHp: 186.95, attack: 11.24, magic: 40.82, speed: 16.41 },
    little_elrana: { maxHp: 151.90, attack: 18.73, magic: 32.66, speed: 14.59 },
    ace: { maxHp: 163.58, attack: 18.73, magic: 12.25, speed: 20.06 },
    nanali: { maxHp: 128.53, attack: 33.71, magic: 12.25, speed: 16.41 },
    ophelia: { maxHp: 140.21, attack: 7.49, magic: 40.82, speed: 18.24 },
    aileng: { maxHp: 163.58, attack: 26.22, magic: 24.5, speed: 21.89 },
    besta: { maxHp: 116.84, attack: 11.24, magic: 40.82, speed: 7.3 },
    catherine: { maxHp: 116.84, attack: 7.49, magic: 32.66, speed: 7.3 },
    hitwell: { maxHp: 140.21, attack: 18.73, magic: 32.66, speed: 18.24 },
    sonia: { maxHp: 175.27, attack: 26.22, magic: 16.32, speed: 20.06 },
    chiyo: { maxHp: 128.53, attack: 26.22, magic: 8.16, speed: 25.54 },
    gerda: { maxHp: 222.00, attack: 14.98, magic: 28.57, speed: 18.24 },
    hoshino_yi: { maxHp: 151.90, attack: 26.22, magic: 28.57, speed: 16.41 },
    hoshino_kaiichi: { maxHp: 257.06, attack: 11.24, magic: 28.57, speed: 10.95 },
    artina: { maxHp: 116.84, attack: 33.71, magic: 12.25, speed: 21.89 },
    maria: { maxHp: 163.58, attack: 22.48, magic: 24.5, speed: 18.24 },
  });
  const fallbackGrowth = Object.freeze({
    maxHp: 116.84, attack: 18.84, magic: 19.66, speed: 9.87,
  });
  const statKeys = Object.freeze(["maxHp", "attack", "magic", "speed"]);

  function cleanLevel(value) {
    return Math.min(maxLevel, Math.max(0, Math.floor(Number(value) || 0)));
  }

  function need(level) {
    return expToNext[cleanLevel(level)] || 0;
  }

  function cleanExp(value, level) {
    const required = need(level);
    if (!required) return 0;
    return Math.min(required - 1, Math.max(0, Math.floor(Number(value) || 0)));
  }

  function profile(id) {
    return growth[id] || fallbackGrowth;
  }

  function statsAt(template, value) {
    const level = cleanLevel(value);
    const stats = { ...(template?.stats || {}) };
    const totals = profile(template?.id);
    statKeys.forEach(key => {
      const base = Number(template?.stats?.[key]) || 0;
      const raw = base + (Number(totals[key]) || 0) * level / maxLevel;
      stats[key] = key === "maxHp" ? Math.round(raw) : Math.round(raw * 100) / 100;
    });
    return stats;
  }

  function grant(character, amount, template) {
    const beforeLevel = cleanLevel(character?.level);
    let level = beforeLevel;
    let exp = cleanExp(character?.exp, level);
    let remaining = Math.max(0, Math.floor(Number(amount) || 0));
    while (remaining > 0 && level < maxLevel) {
      const required = need(level);
      const used = Math.min(remaining, required - exp);
      exp += used;
      remaining -= used;
      if (exp >= required) {
        level += 1;
        exp = 0;
      }
    }
    character.level = level;
    character.exp = level >= maxLevel ? 0 : exp;
    character.stats = statsAt(template, level);
    return {
      id: character.id,
      beforeLevel,
      level,
      exp: character.exp,
      levelsGained: level - beforeLevel,
    };
  }

  function rewardFor(kind, difficulty, missionId) {
    const base = encounterExp[kind] || 0;
    const scaled = base * (Number(difficulty?.xp) || 1)
      * (dungeonExpMultiplier[missionId] || 1);
    return Math.max(0, Math.round(scaled));
  }

  return {
    maxLevel, expToNext, growth, statKeys, dungeonExpMultiplier,
    cleanLevel, cleanExp, need, profile, statsAt, grant, rewardFor,
  };
})();
