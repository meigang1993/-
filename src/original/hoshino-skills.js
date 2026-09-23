window.HoshinoSkills = {
  beginTurn(...args) { return window.HoshinoKaiichiSkills.beginTurn(...args); },
  afterCardPlayed(...args) { return window.HoshinoYiSkills.afterCardPlayed(...args); },
  endTurn(...args) { return window.HoshinoYiSkills.endTurn(...args); },
  handleSpecialCard(...args) { return window.HoshinoKaiichiSkills.handleSpecialCard(...args); },
  afterDamage(...args) { return window.HoshinoKaiichiSkills.afterDamage(...args); },
  resolveBloodHeal(...args) { return window.HoshinoKaiichiSkills.resolveBloodHeal(...args); },
  toggleShareCard(...args) { return window.HoshinoKaiichiSkills.toggleShareCard(...args); },
  resolveShare(...args) { return window.HoshinoKaiichiSkills.resolveShare(...args); },
  activateShare(...args) { return window.HoshinoKaiichiSkills.activateShare(...args); },
  shareVisible(...args) { return window.HoshinoKaiichiSkills.shareVisible(...args); },
};
