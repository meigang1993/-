window.AceNanaliSkills = deps => {
  const ace = window.AceSkills(deps);
  const nanali = window.NanaliSkills(deps);

  function beforeKillTargeted(state, actor, target, card, api) {
    ace.beforeKillTargeted(state, actor, target, card, api);
    nanali.beforeKillTargeted(state, actor, target, card, api);
  }

  return {
    aceContribution: ace.contribution,
    beforeBeginTurn: ace.beforeBeginTurn,
    beforeKillTargeted,
    afterResponse: ace.afterResponse,
    modifySlashDamage: nanali.modifySlashDamage,
    afterDamage: nanali.afterDamage,
    resolveRevenge: nanali.resolveRevenge,
    endTurn: nanali.endTurn,
  };
};
