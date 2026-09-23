window.BattleCardResume = api => {
  const stateApi = window.BattleCardResumeState(api);
  const hooksApi = window.BattleCardResumeHooks(api, stateApi);
  const flow = window.BattleCardResumeFlow(api, stateApi, hooksApi);
  return {
    ensureId: stateApi.ensureId,
    deferDamageTail: stateApi.deferDamageTail,
    recordHit: stateApi.recordHit,
    finalizeUse: flow.finalizeUse,
    resume: flow.resume,
  };
};
