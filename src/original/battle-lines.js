window.BattleLines = (() => {
  const { skillLines, followLines } = window.BattleLineData;
  const duration = 6000;
  const refsOf = unit => [unit?.ref, unit?.id, unit?.ai].filter(Boolean);
  const lineKeyOf = (lines, unit, name) =>
    refsOf(unit).find(ref => lines[ref]?.[name]);
  const pick = (value, target) => typeof value === "function"
    ? value(target)
    : Array.isArray(value) ? window.GameRandom.transientSample(value) : value;
  const readLine = (lines, unit, name, target) => {
    const key = lineKeyOf(lines, unit, name);
    return pick(lines[key]?.[name], target);
  };
  const hasSkill = (unit, name) =>
    (unit.skills || []).some(skill => skill?.name === name)
    || (window.MannySkills?.skills?.(unit) || [])
      .some(skill => skill?.name === name)
    || window.RelicSystem?.isKnown?.(name);
  const speech = window.BattleSpeechController({
    duration, splitLimit: 34,
  });
  const captions = window.BattleCaptionController({
    duration,
    hasSkill,
    speech,
    lineOf(unit, name, target, follow = false) {
      return readLine(follow ? followLines : skillLines, unit, name, target);
    },
  });
  const introFlow = window.BattleLineIntro({
    showMany: speech.showMany,
    showPages: speech.showPages,
    lineOf: readLine,
    lineKeyOf,
    refsOf,
  });
  function cancel(state) {
    speech.cancel(state);
    captions.cancel(state);
    introFlow.cancel();
  }
  return {
    show: speech.show,
    skill: captions.skill,
    skillWhenPromptVisible: captions.skillWhenPromptVisible,
    promptVisible: captions.promptVisible,
    clearSkillCaption: captions.clearSkillCaption,
    intro: state => introFlow.start(state),
    dismiss: state => speech.dismiss(state, () => introFlow.resolve()),
    cancel,
  };
})();
