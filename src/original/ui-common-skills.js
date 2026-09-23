window.UICommonSkills = deps => {
  const model = window.UICommonSkillModel();
  const view = window.UICommonSkillView(deps, model);
  return { ...model, ...view };
};
