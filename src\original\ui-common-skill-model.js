window.UICommonSkillModel = () => {
  const skillIcon = skill =>
    skill?.card?.icon || skill?.icon || (skill?.type === "active" ? "⚔️" : "⭐");
  function parseSkill(skill, fallback = "passive") {
    if (typeof skill === "object") {
      return {
        type: skill.type || fallback,
        name: skill.name || "技能",
        icon: skill.icon || null,
        source: skill.source || null,
        text: skill.text || skill.desc || "",
        card: skill.card || null,
        derivedSkills: skill.derivedSkills || [],
        showInSkillInfo: skill.showInSkillInfo,
      };
    }
    const [name, ...desc] = String(skill || "暂无技能").split("：");
    return {
      type: fallback,
      name: name || "技能",
      text: desc.join("：") || String(skill || "暂无技能"),
    };
  }
  const enemyTemplate = unit => unit?.side === "enemy" && (unit.id || unit.ref)
    ? Object.values(GameData.enemies || {}).flat()
      .find(enemy => enemy.id === (unit.id || unit.ref))
    : null;
  function skillsOf(unit, fallback = "passive") {
    const storedSkills = enemyTemplate(unit)?.skills || unit?.skills;
    const baseSkills = window.GuestCharacterSkills?.normalizeSkills?.(
      unit, storedSkills) || storedSkills;
    if (unit?.side === "enemy" && !Array.isArray(baseSkills)) return [];
    if (Array.isArray(baseSkills)) {
      return [
        ...baseSkills.map(skill => parseSkill(skill, fallback)),
        ...(((unit.id || unit.ref)
          && window.RelicSystem?.skills?.(window.state, unit.id || unit.ref)) || []),
        ...(window.RelicSystem?.skillsForNames?.(unit?.battleRelics || []) || []),
        ...(window.MannySkills?.skills?.(unit) || []),
        ...(window.BertisGerlotSkills?.skills?.(unit) || []),
      ];
    }
    if (unit?.skill) return [parseSkill(unit.skill, fallback)];
    return [];
  }
  const skillText = skill => [
    skill?.text || "",
    ...(skill?.derivedSkills || [])
      .map(item => `【${item.name}】：${item.text}`),
  ].filter(Boolean).join("\n\n");
  function activeSkillName(unit, card) {
    if (!card || card.virtual || card.convertedFrom) return "";
    if (card.skillName) return card.skillName;
    if (!card._skill) return "";
    return skillsOf(unit).some(skill =>
      skill?.type === "active" && skill.name === card.name) ? card.name : "";
  }
  const combatRolesOf = unit => (
    window.GameCombatRoles?.of?.(unit) || unit?.combatRoles?.slice(0, 1) || []
  );
  const combatRoleText = unit => {
    const roles = combatRolesOf(unit);
    return roles.length ? `实战定位：${roles.join(" / ")}` : "";
  };
  const rolePositionText = unit =>
    unit?.evaluation ? `角色定位：${unit.evaluation}` : "";
  const skillCard = skill => skill.card ? { ...skill.card, _skill: true } : null;
  function skillState(actor, skill, battle) {
    const card = skillCard(skill);
    if (skill?.type !== "active") {
      return { usable: false, reason: "此技能会自动生效" };
    }
    if (!actor || actor.side !== "ally") {
      return { usable: false, reason: "只有我方行动角色可主动发动" };
    }
    if (battle?.locked) return { usable: false, reason: "战斗结算中，暂不可发动" };
    if (!card) return { usable: false, reason: "该技能缺少可使用的技能牌" };
    const prepareKey = card.speedAssault ? "awaitingSpeedAssaultUid"
      : card.extract ? "awaitingExtractUid"
        : card.mimicVoice ? "awaitingMimicUid" : null;
    const phaseOk = prepareKey
      ? (battle?.phase === 1 || card.speedAssault && battle?.phase === 6)
        && battle[prepareKey] === actor.uid
      : battle?.phase === 4;
    if (!phaseOk) {
      return {
        usable: false,
        reason: card.speedAssault
          ? "只能在准备阶段或结束阶段窗口发动"
          : card.extract || card.mimicVoice
            ? "只能在对应准备阶段窗口发动" : "只能在出牌阶段发动",
      };
    }
    if (!window.BattleSystem?.canPlay?.(actor, card, battle)) {
      return { usable: false, reason: "次数、手牌、杀意或目标条件不足" };
    }
    return { usable: true, reason: "可发动" };
  }
  return {
    skillIcon, skillsOf, skillText, activeSkillName, combatRolesOf,
    combatRoleText, rolePositionText, skillState,
  };
};
