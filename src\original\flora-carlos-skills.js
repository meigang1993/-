window.FloraCarlosSkills = {
  handleSpecialCard(state, actor, target, card, deps, ctx) {
    if (card.speedAssault) {
      return window.FloraSpeedAssault.use(
        state, actor, target, card, deps, ctx);
    }
    if (card.crazyShooting) {
      return window.CarlosSkills.crazyShooting(state, actor, deps, ctx);
    }
    return false;
  },
  dodgeAsFlash: (...args) => window.FloraSkills.dodgeAsFlash(...args),
  afterSlashDamage(state, actor, target, card, hpLoss, api) {
    if (!window.CardUtils.isKillCard(card) || target.hp <= 0) return;
    window.CarlosSkills.afterSlashDamage(
      state, actor, target, card, hpLoss, api);
    window.FloraSkills.afterSlashDamage(state, actor, target, card, api);
  },
  recordSpeedAssaultHit: (...args) =>
    window.FloraSpeedAssault.recordHit(...args),
  queueSpeedAssaultSettlement: (...args) =>
    window.FloraSpeedAssault.queueSettlement(...args),
};
