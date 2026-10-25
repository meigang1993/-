// 安倍卡露娜【幸运海螺】（锁定技）：战斗结束后若她在队伍中存活，我方队伍获得的经验值翻倍。
// 经验只在副本探索节点结算（battle.exploration），故副本与结算两条路径都取同一倍率。
window.AbeKarunaConchSkills = (() => {
  const hasSkill = (unit, name) => (unit?.skills || []).some(skill => skill.name === name);
  const isKaruna = unit => unit?.ref === "abe_karuna" || unit?.id === "abe_karuna";

  function aliveInParty(units) {
    return (units || []).some(unit => isKaruna(unit) && unit.hp > 0
      && hasSkill(unit, "幸运海螺"));
  }

  // 战斗结算显示用：以当前战斗的存活友方为准。
  function multiplier(state, battle) {
    if (!state || !battle) return 1;
    return aliveInParty(battle.allies) ? 2 : 1;
  }

  function experience(base, state, battle) {
    return Math.round((Number(base) || 0) * multiplier(state, battle));
  }

  // 副本节点结算（服务端/本地内核路径）：只有参战且存活才翻倍。
  function partyMultiplier(core, args = {}) {
    const participants = [...new Set(args.participantIds || [])];
    if (!participants.includes("abe_karuna")) return 1;
    const aliveIds = [...new Set(args.aliveParticipantIds || [])];
    // 未提供存活名单时不臆造翻倍：没有证据就按 1 倍处理。
    if (aliveIds.length && !aliveIds.includes("abe_karuna")) return 1;
    const character = (core?.chars || []).find(c => c.id === "abe_karuna");
    const template = GameData.characters?.find(item => item.id === "abe_karuna");
    if (!character || character.locked) return 1;
    return template && hasSkill(template, "幸运海螺") ? 2 : 1;
  }

  return { aliveInParty, multiplier, experience, partyMultiplier };
})();
