window.BattleFloatFX = {
  popFloats: (...args) => window.BattleFloatNumbers.popFloats(...args),
  slashHit: (...args) => window.BattleHitFXFallback.slashHit(...args),
  queueSlashHit: (...args) =>
    window.BattleHitFXFallback.queueSlashHit(...args),
  hasDamageEffect: (...args) =>
    window.BattleHitFXFallback.hasDamageEffect(...args),
  syncBumps: () => window.BattleBumpFX?.sync?.(),
  clearBumps: () => window.BattleBumpFX?.clear?.(),
  cancel() {
    window.BattleFloatNumbers.cancel();
    window.BattleHitFXFallback.cancel();
    window.BattleBumpFX?.clear?.();
  },
};
