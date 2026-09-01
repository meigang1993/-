window.BattleAISkillMoves = (() => {
  const { targetByPolicy, topBy } = window.BattleAIHelpers;
  const evaluation = window.BattleAISkillEvaluation;

  function skillMove(actor, team, foes, canPlay, relicOnly = false) {
    const skills = (window.UICommon?.skillsOf?.(actor) || actor.skills || [])
      .filter(skill => skill.type === "active" && skill.card
        && (!relicOnly || skill.source === "relic"));
    const scored = skills
      .map(skill => ({
        card: {
          ...skill.card,
          _skill: true,
          _relicSkill: skill.source === "relic",
          skillName: skill.name,
        },
      }))
      .filter(item => canPlay(actor, item.card))
      .map(item => ({
        ...item,
        score: evaluation.skillScore(actor, item.card, team, foes),
      }))
      .filter(item => item.score > 0);
    const skill = topBy(scored, item => item.score)?.card;
    if (skill?.elranaBag) {
      const indexes = evaluation.bagIndexes(actor);
      if (indexes.length) {
        skill._bagIndexes = indexes;
        return { card: skill, target: actor };
      }
      return null;
    }
    if (skill?.armyOrder) {
      const indexes = window.BakarSkills?.armyOrderIndexes?.(actor) || [];
      if (indexes.length) {
        skill._bagIndexes = indexes;
        return { card: skill, target: actor };
      }
      return null;
    }
    if (!skill) return null;
    const target = skill.demonPoker
      ? targetByPolicy(foes)
      : evaluation.skillTarget(actor, skill, team, foes);
    const cost = evaluation.skillCost(actor, skill);
    const needsCost = skill.idolKiss || skill.elranaHeal || skill.cadicisPlan
      || skill.bloodPact || skill.demonPoker || skill.crazyShooting;
    return target && (!needsCost || cost)
      ? { card: skill, target, costCard: cost }
      : null;
  }

  return { skillMove };
})();
