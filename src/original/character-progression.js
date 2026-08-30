window.CharacterProgression = (() => {
  const maxLevel = 20;
  const expToNext = Object.freeze([
    100, 160, 240, 340, 470, 620, 800, 1020,
    1280, 1580, 1920, 2300, 2720, 3180, 3680, 4100, 4550, 5050, 5600, 6200,
  ]);
  const encounterExp = Object.freeze({ normal: 30, elite: 70, boss: 130 });
  const growth = Object.freeze({
    lokar: { maxHp: 72, attack: 13.5, magic: 4.5, speed: 10 },
    besta_doll: { maxHp: 54, attack: 7.5, magic: 12, speed: 7.5 },
    manny: { maxHp: 72, attack: 12, magic: 7.5, speed: 12.5 },
    miller: { maxHp: 96, attack: 7.5, magic: 7.5, speed: 10 },
    nonoka: { maxHp: 78, attack: 4.5, magic: 13.5, speed: 10 },
    loki: { maxHp: 108, attack: 12, magic: 3, speed: 7.5 },
    flora: { maxHp: 54, attack: 13.5, magic: 4.5, speed: 18.75 },
    wendy: { maxHp: 72, attack: 3, magic: 12, speed: 12.5 },
    cadicis: { maxHp: 84, attack: 12, magic: 6, speed: 10 },
    carlos: { maxHp: 66, attack: 10.5, magic: 3, speed: 16.25 },
    bertis: { maxHp: 96, attack: 10.5, magic: 10.5, speed: 7.5 },
    gerlot: { maxHp: 78, attack: 12, magic: 3, speed: 13.75 },
    angelica: { maxHp: 120, attack: 12, magic: 4.5, speed: 7.5 },
    luka: { maxHp: 102, attack: 13.5, magic: 3, speed: 12.5 },
    elrana: { maxHp: 96, attack: 4.5, magic: 15, speed: 11.25 },
    little_elrana: { maxHp: 78, attack: 7.5, magic: 12, speed: 10 },
    ace: { maxHp: 84, attack: 7.5, magic: 4.5, speed: 13.75 },
    nanali: { maxHp: 72, attack: 10.5, magic: 4.5, speed: 10 },
    ophelia: { maxHp: 72, attack: 3, magic: 15, speed: 12.5 },
    aileng: { maxHp: 84, attack: 10.5, magic: 9, speed: 15 },
    besta: { maxHp: 60, attack: 4.5, magic: 15, speed: 5 },
    sonia: { maxHp: 90, attack: 10.5, magic: 6, speed: 13.75 },
    chiyo: { maxHp: 66, attack: 10.5, magic: 3, speed: 17.5 },
    gerda: { maxHp: 114, attack: 6, magic: 10.5, speed: 12.5 },
    hoshino_yi: { maxHp: 78, attack: 10.5, magic: 10.5, speed: 11.25 },
    hoshino_kaiichi: { maxHp: 132, attack: 4.5, magic: 10.5, speed: 7.5 },
    artina: { maxHp: 84, attack: 10.5, magic: 7.5, speed: 12.5 },
    maria: { maxHp: 90, attack: 7.5, magic: 10.5, speed: 10 },
  });
  const fallbackGrowth = Object.freeze({
    maxHp: 60, attack: 9, magic: 9, speed: 7.5,
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

  function rewardFor(kind, difficulty) {
    const base = encounterExp[kind] || 0;
    return Math.max(0, Math.round(base * (Number(difficulty?.xp) || 1)));
  }

  return {
    maxLevel, expToNext, growth, statKeys,
    cleanLevel, cleanExp, need, profile, statsAt, grant, rewardFor,
  };
})();
