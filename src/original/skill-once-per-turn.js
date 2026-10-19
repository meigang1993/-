// 「出牌阶段限一次」统一登记表——全项目唯一来源。
// 置灰（canPlay / blockedByUsage）、二次使用守卫（battle-combat.js 出牌前调用）、
// 以及回归测试三处共用这一份登记；新增技能只需在这里补一行，或沿用
// card.xxx → actor.usedXxx 命名约定走自动推导，无需改第二处。
// 不区分我方 / 敌方：敌方技能平时由 AI 自动出牌不走 canPlay，但技能卡一旦
// 落到我方角色手上（复制技能类角色）必须同样置灰。
//
// 独立成文件的原因：原挂在 battle-card-playability.js 顶部，随该文件逼近
// 200 行硬约束。此模块零依赖，先于 battle-card-playability.js 装配即可。
window.SkillOncePerTurn = (() => {
  const FLAGS = [
    ["extract", "usedExtract"], ["preshiDrain", "usedPreshiDrain"], ["bloodPact", "usedBloodPact"],
    ["crazyShooting", "usedCrazyShooting"], ["ailengBet", "usedAilengBet"], ["elranaHeal", "usedElranaHeal"],
    ["bestaEndSlash", "usedBestaEndSlash"], ["mannyArmory", "usedMannyArmory"], ["mannyBarrett", "usedBarrett"],
    ["millerSlot", "usedMillerSlot"], ["mimicVoice", "usedMimic"], ["idolKiss", "usedIdolKiss"],
    ["bertisWhip", "usedBertisWhip"], ["bertisTakeFood", "usedTakeFood"], ["crazySlaughter", "usedCrazySlaughter"],
    ["wendyTutor", "usedWendyTutor"], ["demonPoker", "usedDemonPoker"], ["succubusFork", "usedSuccubusFork"],
    ["assassinLatex", "usedAssassinLatex"], ["arsenal", "usedArsenal"], ["withererTongueActive", "usedWithererTongue"],
    ["withererPeek", "usedWithererPeek"], ["catherineSteal", "usedCatherineSteal"], ["aceContribution", "usedAceContribution"],
    ["ailengCharge", "usedAilengCharge"], ["kaiichiMilk", "usedKaiichiMilk"], ["artinaSniper", "usedArtinaSniper"],
    ["dragonSlash", "usedDragonSlash"], ["flashbang", "usedFlashbang"], ["controlEye", "usedControlEye"],
    ["magicMissile", "usedMagicMissile"], ["droneExtract", "usedDroneExtract"], ["ruinsSnipe", "usedRuinsSnipe"],
    ["ruinsTankShell", "usedRuinsTankShell"], ["ruinsPlaceLandmine", "usedRuinsLandmine"],
    ["ruinsLandmineRps", "usedRuinsLandmineRps"],
    ["radar", "radarUsed"], ["poisonGrenade", "grenadeUsed"], ["bullHammer", "hammerUsed"],
  ];
  const SPECIAL = [
    ["speedAssault", (actor, battle) => (battle?.phase === 6
      ? actor.usedSpeedAssaultEnd : actor.usedSpeedAssaultPrepare)],
    ["crimsonRampage", actor => !window.AngelicaLukaSkills?.canUseCrimsonRampage?.(actor)],
    ["mariaHonorBlessing", actor => actor.usedMariaHonorBlessing
      || actor.mariaBlessingSuits?.length > 0],
  ];
  const DERIVE_SKIP = new Set([
    ...FLAGS.map(entry => entry[0]), ...SPECIAL.map(entry => entry[0]),
    "lokarWindSlash", "withererShift", "slime",
  ]);
  const deriveField = flag => `used${flag[0].toUpperCase()}${flag.slice(1)}`;
  const autoFlags = card => card?._skill
    ? Object.keys(card).filter(flag => !DERIVE_SKIP.has(flag) && card[flag] === true) : [];
  function fieldFor(card) {
    for (const [flag, field] of FLAGS) if (card?.[flag]) return field;
    for (const [flag] of SPECIAL) if (card?.[flag]) return flag;
    const [flag] = autoFlags(card);
    return flag ? deriveField(flag) : null;
  }
  function blocked(actor, card, battle) {
    if (!actor || !card) return false;
    for (const [flag, field] of FLAGS) if (card[flag] && actor[field]) return true;
    for (const [flag, test] of SPECIAL) if (card[flag] && test(actor, battle)) return true;
    return autoFlags(card).some(flag => actor[deriveField(flag)] === true);
  }
  return { FLAGS, SPECIAL, DERIVE_SKIP, fieldFor, blocked };
})();
