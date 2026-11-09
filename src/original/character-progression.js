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
    lokar: { maxHp: 280.42, attack: 67.42, magic: 24.50, speed: 29.18 },
    besta_doll: { maxHp: 210.32, attack: 37.46, magic: 65.32, speed: 21.90 },
    manny: { maxHp: 280.42, attack: 59.94, magic: 40.82, speed: 36.48 },
    miller: { maxHp: 373.90, attack: 37.46, magic: 40.82, speed: 29.18 },
    nonoka: { maxHp: 303.80, attack: 22.48, magic: 73.46, speed: 29.18 },
    loki: { maxHp: 397.26, attack: 74.90, magic: 16.32, speed: 32.82 },
    flora: { maxHp: 210.32, attack: 67.42, magic: 24.50, speed: 54.72 },
    wendy: { maxHp: 280.42, attack: 14.98, magic: 65.32, speed: 36.48 },
    cadicis: { maxHp: 327.16, attack: 74.90, magic: 16.32, speed: 32.82 },
    carlos: { maxHp: 257.06, attack: 52.44, magic: 16.32, speed: 47.42 },
    bertis: { maxHp: 373.90, attack: 52.44, magic: 57.14, speed: 21.90 },
    gerlot: { maxHp: 303.80, attack: 59.94, magic: 16.32, speed: 40.12 },
    angelica: { maxHp: 408.96, attack: 74.90, magic: 16.32, speed: 21.90 },
    luka: { maxHp: 397.26, attack: 67.42, magic: 16.32, speed: 36.48 },
    elrana: { maxHp: 373.90, attack: 22.48, magic: 81.64, speed: 32.82 },
    little_elrana: { maxHp: 303.80, attack: 37.46, magic: 65.32, speed: 29.18 },
    abe_karuna: { maxHp: 233.68, attack: 14.98, magic: 73.46, speed: 43.78 },
    ace: { maxHp: 327.16, attack: 37.46, magic: 24.50, speed: 40.12 },
    nanali: { maxHp: 257.06, attack: 67.42, magic: 24.50, speed: 32.82 },
    ophelia: { maxHp: 280.42, attack: 14.98, magic: 81.64, speed: 36.48 },
    aileng: { maxHp: 327.16, attack: 52.44, magic: 49.0, speed: 43.78 },
    besta: { maxHp: 233.68, attack: 22.48, magic: 81.64, speed: 14.6 },
    catherine: { maxHp: 233.68, attack: 14.98, magic: 65.32, speed: 14.6 },
    hitwell: { maxHp: 280.42, attack: 37.46, magic: 65.32, speed: 36.48 },
    preshi: { maxHp: 257.06, attack: 37.46, magic: 65.32, speed: 29.18 },
    // 高阶成长表（20 级总量），取值贴近 每级 生命+10 / 攻击+2 / 魔力+1 / 速度+2，
    // 并落在统一档位网格上（档位单位 生命 11.684 / 攻击 7.491 / 魔力 8.163 / 速度 3.648）。
    mieryula: { maxHp: 397.26, attack: 82.4, magic: 40.82, speed: 80.26 },
    sonia: { maxHp: 350.54, attack: 52.44, magic: 32.64, speed: 40.12 },
    chiyo: { maxHp: 257.06, attack: 52.44, magic: 16.32, speed: 51.08 },
    gerda: { maxHp: 444.00, attack: 29.96, magic: 57.14, speed: 36.48 },
    hoshino_yi: { maxHp: 303.80, attack: 52.44, magic: 57.14, speed: 32.82 },
    hoshino_kaiichi: { maxHp: 514.12, attack: 22.48, magic: 57.14, speed: 21.90 },
    artina: { maxHp: 233.68, attack: 67.42, magic: 24.50, speed: 43.78 },
    maria: { maxHp: 327.16, attack: 44.96, magic: 49.0, speed: 36.48 },
    // 怪面诺亚（第 34 名）：输出倾向。攻击取 11 档（82.4，与米尔尤拉并列全表最高攻击成长），
    // 结束阶段伤害按攻击力结算，与【魅力改造】杀牌免杀意的输出定位一致；
    // 魔力压到 3 档，生命 28 档、速度 12 档居中。全部落在统一档位网格上。
    noa: { maxHp: 327.16, attack: 82.4, magic: 24.50, speed: 43.78 },
  });
  const fallbackGrowth = Object.freeze({
    maxHp: 233.68, attack: 37.68, magic: 39.32, speed: 19.74,
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
