window.SkinSystem = (() => {
  const quality = { special: ["特殊", 0], rare: ["稀有", 8], epic: ["史诗", 20], legendary: ["传说", 50] };
  const skins = [
    { id: "lokar_default", charId: "lokar", name: "默认", quality: "default", price: 0, art: "./assets/images/lokar-portrait.webp", desc: "罗卡尔的初始外观。", initial: true },
    { id: "lokar_motherbound", charId: "lokar", name: "恋母勇者", quality: "rare", art: "./assets/generated/lokar-motherbound-refined-bg.235e8f11.webp", dynamicEffect: "lokar-motherbound", specialEffect: true, desc: "为了母亲，他愿意成为任何怪物。" },
    { id: "besta_doll_default", charId: "besta_doll", name: "默认", quality: "default", price: 0, art: "./assets/images/besta-doll-portrait.webp", desc: "贝丝妲魔偶的初始外观。", initial: true },
    { id: "besta_doll_energy_queen", charId: "besta_doll", name: "机铠魔偶", quality: "normal", price: 10, art: "./assets/generated/besta-doll-fullbody-heels-bg.56c37ce5.webp", damagedArt: "./assets/generated/besta-doll-critical-damage.99e0ac86.webp", dynamicEffect: "besta-mecha", specialEffect: true, desc: "小型机械魔偶全身机体启动，黑红机械高跟鞋在工厂红光中踏出冷冽回响。" },
    { id: "nonoka_default", charId: "nonoka", name: "默认", quality: "default", price: 0, art: "./assets/images/nonoka-portrait.webp", desc: "诺诺卡的初始外观。", initial: true },
    { id: "nonoka_idol_rising_star", charId: "nonoka", name: "偶像明日星", quality: "epic", price: 10, art: "./assets/generated/nonoka-idol-rising-star-star-eyes.97cc2566.webp", dynamicEffect: "nonoka-idol", specialEffect: true, desc: "蓝色星形瞳光点亮舞台，星纹电吉他将旋律化为笼罩全场的魔力声浪。" },
    { id: "nonoka_level_10_special", charId: "nonoka", name: "特殊立绘", quality: "special", price: 0, unlockLevel: 10, specialIllustration: true, art: "./assets/generated/nonoka-level-10-special.ba4c8ff8.webp", desc: "诺诺卡达到10级后自动解锁，可作为正式战斗立绘装备。" },
    { id: "manny_default", charId: "manny", name: "默认", quality: "default", price: 0, art: "./assets/images/manny-portrait.webp", desc: "曼妮的初始外观。", initial: true },
    { id: "manny_gun_succubus", charId: "manny", name: "枪之魅魔", quality: "epic", price: 12, art: "./assets/generated/manny-gun-succubus-weapon-skeleton.3696a917.webp", dynamicEffect: "manny-gun", specialEffect: true, desc: "魅魔右半身化作庞大的枪械骨架，在硝烟与弹链间压向战场。" },
    { id: "manny_level_10_special", charId: "manny", name: "特殊立绘", quality: "special", price: 0, unlockLevel: 10, specialIllustration: true, art: "./assets/generated/manny-level-10-special.a8c2eeed.webp", desc: "曼妮达到10级后自动解锁，可作为正式战斗立绘装备。" },
    { id: "bertis_default", charId: "bertis", name: "默认", quality: "default", price: 0, art: "./assets/images/bertis-portrait.png", desc: "贝尔蒂丝的初始外观。", initial: true },
    { id: "bertis_arrogant_queen", charId: "bertis", name: "傲慢女王", quality: "epic", price: 10, art: "./assets/generated/bertis-arrogant-queen-mist-gothic.cd523966.webp", damagedArt: "./assets/generated/bertis-arrogant-queen-critical-damage.e0a10370.webp", dynamicEffect: "bertis-queen", specialEffect: true, desc: "银白双马尾与黑紫蔷薇长裙簇拥着荆棘皮鞭，她露出小虎牙般的得意笑容，踏着铃铛轻响巡视战场。" },
    { id: "bertis_level_10_special", charId: "bertis", name: "特殊立绘", quality: "special", price: 0, unlockLevel: 10, specialIllustration: true, art: "./assets/generated/bertis-level-10-special.022dd113.webp", desc: "贝尔蒂丝达到10级后自动解锁，可作为正式战斗立绘装备。" },
    { id: "flora_default", charId: "flora", name: "默认", quality: "default", price: 0, art: "./assets/images/flora-portrait.71c5d516.webp", desc: "芙萝娅的初始外观。", initial: true },
    { id: "flora_sonic_assassin", charId: "flora", name: "音速刺客", quality: "epic", price: 10, art: "./assets/generated/flora-sonic-assassin.8543df2c.webp", victoryArt: "./assets/generated/flora-sonic-assassin-victory.7ab2b6cd.webp", dynamicEffect: "flora-sonic", specialEffect: true, desc: "墨绿夜行装吞没脚步声，肩后音波光刃与双匕首只留下翠绿残影。" },
    { id: "flora_level_10_special", charId: "flora", name: "特殊立绘", quality: "special", price: 0, unlockLevel: 10, specialIllustration: true, art: "./assets/generated/flora-level-10-special.075896ea.webp", desc: "芙萝娅达到10级后自动解锁，可作为正式战斗立绘装备。" },
    { id: "wendy_default", charId: "wendy", name: "默认", quality: "default", price: 0, art: "./assets/images/wendy-portrait.f262b034.webp", desc: "温蒂的初始外观。", initial: true },
    { id: "wendy_benevolent_teacher", charId: "wendy", name: "慈爱教师", quality: "epic", price: 10, art: "./assets/generated/wendy-benevolent-teacher-desert-school.bcfc0372.webp", dynamicEffect: "wendy-teacher", specialEffect: true, desc: "绿发金瞳的温蒂在沙漠学校展开教案，以金色战术字符解析整片战场。" },
    { id: "wendy_level_10_special", charId: "wendy", name: "特殊立绘", quality: "special", price: 0, unlockLevel: 10, specialIllustration: true, art: "./assets/generated/wendy-level-10-special.8b3d47ab.webp", desc: "温蒂达到10级后自动解锁，可作为正式战斗立绘装备。" },
    { id: "elrana_default", charId: "elrana", name: "默认", quality: "default", price: 0, art: "./assets/images/elrana-new-portrait.webp", desc: "艾尔拉娜的初始外观。", initial: true },
    { id: "elrana_fallen_physician", charId: "elrana", name: "堕落医师", quality: "epic", price: 10, art: "./assets/generated/elrana-fallen-physician.5fb5e43a.webp", dynamicEffect: "elrana-fallen-physician", specialEffect: true, desc: "培养罐、绿色炼金液与红色再生丝线围绕着堕落医师，她以冷静的医学术式重造生命。" },
    { id: "elrana_level_10_special", charId: "elrana", name: "特殊立绘", quality: "special", price: 0, unlockLevel: 10, specialIllustration: true, art: "./assets/generated/elrana-level-10-special.3a5bcd18.webp", desc: "艾尔拉娜达到10级后自动解锁，可作为正式战斗立绘装备。" }
  ];
  const byId = id => skins.find(s => s.id === id);
  const forChar = id => skins.filter(s => s.charId === id);
  function normalizeEquipment(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([charId, skinId]) => {
      const skin = byId(skinId);
      return skin?.charId === charId;
    }));
  }
  function selectedForUnit(state, unit) {
    const id = unit?.ref || unit?.id;
    if (!state || !id) return null;
    const testSkin = state.battle?.test && byId(state.testSkins?.[id]);
    const trialSkin = testSkin?.specialIllustration ? null : testSkin;
    const skin = trialSkin?.charId === id ? trialSkin : byId(state.equippedSkins?.[id]);
    return skin?.charId === id && (state.battle?.test || skin.initial || owned(state, skin)) ? skin : null;
  }
  function dynamicEffectOf(state, unit) {
    const skin = selectedForUnit(state, unit);
    return skin ? skin.dynamicEffect || null : undefined;
  }
  const bertisArroganceVisible = unit => unit?.visualHp == null
    ? unit?.bertisArrogant !== false : unit.visualHp >= unit.maxHp;
  function damagedArtOf(state, unit) {
    const skin = selectedForUnit(state, unit);
    if (!skin?.damagedArt) return "";
    if (skin.id === "bertis_arrogant_queen") {
      return bertisArroganceVisible(unit) ? "" : skin.damagedArt;
    }
    if (skin.id === "besta_doll_energy_queen") {
      return unit?.extractMagicAttack ? skin.damagedArt : "";
    }
    return "";
  }
  function price(s) { return s.price ?? (quality[s.quality]?.[1] || 0); }
  function qualityName(s) { return s.initial ? "初始" : (quality[s.quality]?.[0] || "普通"); }
  function levelUnlocked(state, skin) {
    const c = state?.chars?.find(character => character.id === skin?.charId);
    return !!skin?.unlockLevel && !!c && !c.locked
      && Number(c.level || 0) >= skin.unlockLevel;
  }
  function ensure(state) {
    state.ownedSkins = state.ownedSkins || {};
    state.equippedSkins = state.equippedSkins || {};
    skins.filter(s => s.initial).forEach(s => {
      const c = state.chars?.find(x => x.id === s.charId);
      if (c && !c.locked) state.ownedSkins[s.id] = true;
      if (c && !c.locked && !state.equippedSkins[s.charId]) state.equippedSkins[s.charId] = s.id;
    });
    skins.filter(s => s.unlockLevel).forEach(s => {
      const character = state.chars?.find(item => item.id === s.charId);
      if (!character) return;
      if (levelUnlocked(state, s)) {
        state.ownedSkins[s.id] = true;
        return;
      }
      delete state.ownedSkins[s.id];
      if (state.equippedSkins[s.charId] === s.id) {
        const fallback = skins.find(item => item.charId === s.charId && item.initial);
        if (fallback) state.equippedSkins[s.charId] = fallback.id;
      }
    });
  }
  function applyToChar(state, c, test = false) {
    if (!c) return c;
    ensure(state);
    const id = c.id || c.ref, testSkin = test && byId(state.testSkins?.[id]);
    const trialSkin = testSkin?.specialIllustration ? null : testSkin;
    const s = trialSkin?.charId === id ? trialSkin : byId(state.equippedSkins?.[id]);
    return s && (test || s.initial || owned(state, s)) ? { ...c, art: s.art, avatar: s.art, skinName: s.name, skinDynamicEffect: s.dynamicEffect || null, skinDamagedArt: s.damagedArt || null, skinVictoryArt: s.victoryArt || null } : c;
  }
  function owned(state, skin) {
    ensure(state);
    return skin?.unlockLevel ? levelUnlocked(state, skin) : !!state.ownedSkins?.[skin.id];
  }
  function buy(state, id) {
    ensure(state);
    const s = byId(id), cost = s && price(s);
    if (!s || s.initial || s.unlockLevel || owned(state, s) || (state.resources?.essence || 0) < cost) return false;
    state.resources.essence -= cost; state.ownedSkins[s.id] = true; state.equippedSkins[s.charId] = s.id; state.skinFlash = s.id;
    return true;
  }
  function equip(state, id) {
    ensure(state);
    const s = byId(id);
    if (!s || !owned(state, s)) return false;
    state.equippedSkins[s.charId] = s.id; state.skinFlash = s.id;
    return true;
  }
  function markAppearance(state) {
    ensure(state);
    state.settings ||= {};
    state.settings.appearanceUpdatedAt = Math.max(
      Date.now(), Number(state.settings.appearanceUpdatedAt || 0) + 1,
    );
    state.settings.equippedSkins = { ...state.equippedSkins };
    return state.settings;
  }
  function applySavedAppearance(state, settings) {
    const savedAt = Number(settings?.appearanceUpdatedAt || 0);
    const currentAt = Number(state?.settings?.appearanceUpdatedAt || 0);
    if (!state || !(savedAt > currentAt)) return false;
    ensure(state);
    const saved = normalizeEquipment(settings.equippedSkins);
    Object.entries(saved).forEach(([charId, skinId]) => {
      const skin = byId(skinId);
      if (skin?.initial || owned(state, skin)) state.equippedSkins[charId] = skinId;
    });
    state.settings ||= {};
    state.settings.appearanceUpdatedAt = savedAt;
    state.settings.equippedSkins = { ...state.equippedSkins };
    return true;
  }
  function testEquip(state, charId, skinId) {
    const s = byId(skinId);
    if (!s || s.charId !== charId || s.specialIllustration) return false;
    state.testSkins = state.testSkins || {};
    state.testSkins[charId] = skinId;
    state.skinFlash = skinId;
    return true;
  }
  return {
    skins, forChar, byId, selectedForUnit, dynamicEffectOf, damagedArtOf,
    bertisArroganceVisible,
    price, qualityName, ensure, applyToChar, owned, buy, equip, testEquip,
    levelUnlocked, normalizeEquipment, markAppearance, applySavedAppearance,
  };
})();
