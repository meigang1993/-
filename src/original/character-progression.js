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
    lokar: { maxHp: 100.8, attack: 24.57, magic: 8.19, speed: 14 },
    besta_doll: { maxHp: 75.6, attack: 13.65, magic: 21.84, speed: 10.5 },
    manny: { maxHp: 100.8, attack: 21.84, magic: 13.65, speed: 17.5 },
    miller: { maxHp: 134.4, attack: 13.65, magic: 13.65, speed: 14 },
    nonoka: { maxHp: 109.2, attack: 8.19, magic: 24.57, speed: 14 },
    loki: { maxHp: 151.2, attack: 21.84, magic: 5.46, speed: 10.5 },
    flora: { maxHp: 75.6, attack: 24.57, magic: 8.19, speed: 26.25 },
    wendy: { maxHp: 100.8, attack: 5.46, magic: 21.84, speed: 17.5 },
    cadicis: { maxHp: 117.6, attack: 21.84, magic: 10.92, speed: 14 },
    carlos: { maxHp: 92.4, attack: 19.11, magic: 5.46, speed: 22.75 },
    bertis: { maxHp: 134.4, attack: 19.11, magic: 19.11, speed: 10.5 },
    gerlot: { maxHp: 109.2, attack: 21.84, magic: 5.46, speed: 19.25 },
    angelica: { maxHp: 147, attack: 27.3, magic: 5.46, speed: 10.5 },
    luka: { maxHp: 142.8, attack: 24.57, magic: 5.46, speed: 17.5 },
    elrana: { maxHp: 134.4, attack: 8.19, magic: 27.3, speed: 15.75 },
    little_elrana: { maxHp: 109.2, attack: 13.65, magic: 21.84, speed: 14 },
    ace: { maxHp: 117.6, attack: 13.65, magic: 8.19, speed: 19.25 },
    nanali: { maxHp: 100.8, attack: 19.11, magic: 8.19, speed: 14 },
    ophelia: { maxHp: 100.8, attack: 5.46, magic: 27.3, speed: 17.5 },
    aileng: { maxHp: 117.6, attack: 19.11, magic: 16.38, speed: 21 },
    besta: { maxHp: 84, attack: 8.19, magic: 27.3, speed: 7 },
    sonia: { maxHp: 126, attack: 19.11, magic: 10.92, speed: 19.25 },
    chiyo: { maxHp: 92.4, attack: 19.11, magic: 5.46, speed: 24.5 },
    gerda: { maxHp: 159.6, attack: 10.92, magic: 19.11, speed: 17.5 },
    hoshino_yi: { maxHp: 109.2, attack: 19.11, magic: 19.11, speed: 15.75 },
    hoshino_kaiichi: { maxHp: 184.8, attack: 8.19, magic: 19.11, speed: 10.5 },
    artina: { maxHp: 84, attack: 24.57, magic: 8.19, speed: 21 },
    maria: { maxHp: 117.6, attack: 13.65, magic: 16.38, speed: 17.5 },
  });
  const fallbackGrowth = Object.freeze({
    maxHp: 84, attack: 16.38, magic: 16.38, speed: 10.5,
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
