window.CharacterProgression = (() => {
  // 天日国鹰7研究所：等级上限提高至 25 级，属性成长同步提高 30%。
  // 新增 21~25 级经验延续既有「每级所需经验按 +40 等差递增」的末段规律
  // （…6080→6780 为 +700，其后 +740 / +780 / +820 / +860 / +900）。
  const maxLevel = 25;
  const growthScale = 1.3;
  const expToNext = Object.freeze([
    100, 160, 240, 340, 470, 620, 800, 1020,
    1280, 1580, 1920, 2300, 2720, 3180, 3680,
    4220, 4800, 5420, 6080, 6780,
    7520, 8300, 9120, 9980, 10880,
  ]);
  const encounterExp = Object.freeze({ normal: 30, elite: 70, boss: 130 });
  const dungeonExpMultiplier = Object.freeze({
    machine_factory: 1, underwater_train: 2, orc_dungeon: 3, ruins_sand_city: 4,
    tenri_institute: 5,
  });
  const growth = Object.freeze({
    lokar: { maxHp: 280, attack: 67, magic: 25, speed: 29 },
    besta_doll: { maxHp: 210, attack: 37, magic: 65, speed: 22 },
    manny: { maxHp: 280, attack: 60, magic: 41, speed: 36 },
    miller: { maxHp: 374, attack: 37, magic: 41, speed: 29 },
    nonoka: { maxHp: 304, attack: 22, magic: 73, speed: 29 },
    loki: { maxHp: 397, attack: 75, magic: 16, speed: 33 },
    flora: { maxHp: 210, attack: 67, magic: 25, speed: 55 },
    wendy: { maxHp: 280, attack: 15, magic: 65, speed: 36 },
    cadicis: { maxHp: 327, attack: 75, magic: 16, speed: 33 },
    carlos: { maxHp: 257, attack: 52, magic: 16, speed: 47 },
    bertis: { maxHp: 374, attack: 52, magic: 57, speed: 22 },
    gerlot: { maxHp: 304, attack: 60, magic: 16, speed: 40 },
    angelica: { maxHp: 409, attack: 75, magic: 16, speed: 22 },
    luka: { maxHp: 397, attack: 67, magic: 16, speed: 36 },
    elrana: { maxHp: 374, attack: 22, magic: 82, speed: 33 },
    little_elrana: { maxHp: 304, attack: 37, magic: 65, speed: 29 },
    abe_karuna: { maxHp: 234, attack: 15, magic: 73, speed: 44 },
    ace: { maxHp: 327, attack: 37, magic: 25, speed: 40 },
    nanali: { maxHp: 257, attack: 67, magic: 25, speed: 33 },
    ophelia: { maxHp: 280, attack: 15, magic: 82, speed: 36 },
    aileng: { maxHp: 327, attack: 52, magic: 49, speed: 44 },
    besta: { maxHp: 234, attack: 22, magic: 82, speed: 15 },
    catherine: { maxHp: 234, attack: 15, magic: 65, speed: 15 },
    hitwell: { maxHp: 280, attack: 37, magic: 65, speed: 36 },
    preshi: { maxHp: 257, attack: 37, magic: 65, speed: 29 },
    // 高阶成长表（20 级总量），取值贴近 每级 生命+10 / 攻击+2 / 魔力+1 / 速度+2，
    // 原档位网格（生命 11.684 / 攻击 7.491 / 魔力 8.163 / 速度 3.648）现已统一四舍五入为整数。
    mieryula: { maxHp: 397, attack: 82, magic: 41, speed: 80 },
    sonia: { maxHp: 351, attack: 52, magic: 33, speed: 40 },
    chiyo: { maxHp: 257, attack: 52, magic: 16, speed: 51 },
    gerda: { maxHp: 444, attack: 30, magic: 57, speed: 36 },
    hoshino_yi: { maxHp: 304, attack: 52, magic: 57, speed: 33 },
    hoshino_kaiichi: { maxHp: 514, attack: 22, magic: 57, speed: 22 },
    artina: { maxHp: 234, attack: 67, magic: 25, speed: 44 },
    maria: { maxHp: 327, attack: 45, magic: 49, speed: 36 },
    // 怪面诺亚（第 34 名）：输出倾向。攻击取 11 档（82.4，与米尔尤拉并列全表最高攻击成长），
    // 结束阶段伤害按攻击力结算，与【淫气改造】杀牌免淫气的输出定位一致；
    // 魔力压到 3 档，生命 28 档、速度 12 档居中。全部落在统一档位网格上。
    noa: { maxHp: 327, attack: 82, magic: 25, speed: 44 },
  });
  const fallbackGrowth = Object.freeze({
    maxHp: 234, attack: 38, magic: 39, speed: 20,
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
      const raw = base + (Number(totals[key]) || 0) * growthScale * level / maxLevel;
      // 全部属性统一四舍五入为整数：角色基值、成长表与强化加成均为整数；
      // Math.round 同时收敛浮点长尾，避免 40.82000000000001 之类的展示噪声。
      stats[key] = Math.round(raw);
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
    character.stats = window.CharacterEnhance?.withBonus?.(statsAt(template, level), character)
      || statsAt(template, level);
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
    const scaled = base * ((Number(difficulty?.xp) || 100) / 100)
      * (dungeonExpMultiplier[missionId] || 1);
    return Math.max(0, Math.round(scaled));
  }

  return {
    maxLevel, growthScale, expToNext, growth, statKeys, dungeonExpMultiplier,
    cleanLevel, cleanExp, need, profile, statsAt, grant, rewardFor,
  };
})();
