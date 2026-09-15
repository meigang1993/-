window.UICommonSkillView = ({ esc, classToken }, model) => {
  const {
    skillIcon, skillsOf, skillText, combatRolesOf, skillState,
  } = model;
  function combatRoleBadges(unit) {
    return combatRolesOf(unit).slice(0, 1).map(role => {
      const definition = window.GameCombatRoles?.definitions?.[role];
      const cls = definition?.className || "unknown";
      return `<span class="combat-role role-${cls}">${esc(role)}</span>`;
    }).join("");
  }
  const skillSummary = unit => skillsOf(unit)
    .filter(skill => skill.source !== "relic" && skill.showInSkillInfo !== false)
    .map(skill => `${skillIcon(skill)} ${skill.name}\n${skillText(skill)}`)
    .join("\n\n") || "暂无技能";
  const skillTip = skill => skill.source === "relic" && !skill.showInSkillInfo
    ? RelicSystem.statText(skill.name)
    : `${skillIcon(skill)} ${skill.name}\n${skillText(skill)}`;
  function skillTitle(unit) {
    const skills = skillsOf(unit)
      .filter(skill => skill.showInSkillInfo !== false)
      .map(skillTip).join("\n\n") || "暂无技能";
    return [skills].filter(Boolean).join("\n\n");
  }
  function skillName(skill, index = 0, clickable = false, selected = false,
    named = false, disabled = false, stateInfo = null, unit = null) {
    const battle = window.state?.battle;
    const state = stateInfo || skillState(
      battle ? window.BattleSystem?.active?.(battle) : null, skill, battle);
    const numericIndex = Number(index);
    const tip = [skillTip(skill), `状态：${state.reason}`]
      .filter(Boolean).join("\n");
    const data = clickable && skill?.type === "active" && !disabled
      && Number.isInteger(numericIndex)
      ? `data-skill-index="${numericIndex}"` : "";
    return `<button class="skill ${classToken(skill?.type)} ${selected ? "selected" : ""} ${named ? "with-name" : ""} ${disabled ? "disabled" : ""}" title="${esc(tip)}" ${data} ${disabled ? "aria-disabled=\"true\"" : ""}><span>${esc(skillIcon(skill))}</span>${named ? `<em>${esc(skill?.name || "技能")}</em>` : ""}</button>`;
  }
  return { combatRoleBadges, skillSummary, skillTitle, skillName };
};
