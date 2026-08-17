window.BattleFX = (() => {
  const floats = () => {
    if (!window.BattleFloatFX) throw new Error("Battle float effects unavailable");
    return window.BattleFloatFX;
  };
  function popFloats(...args) { return floats().popFloats(...args); }
  function slashHit(...args) { return floats().slashHit(...args); }
  function queueSlashHit(...args) { return floats().queueSlashHit(...args); }
  function hasDamageEffect(...args) { return floats().hasDamageEffect(...args); }
  function syncBumps(...args) { return floats().syncBumps(...args); }
  function clearBumps(...args) { return floats().clearBumps(...args); }
  function beep(delay = 0) { window.BattleAudio?.beep(delay); }
  function cardMove(delay = 0) { window.BattleAudio?.cardMove(delay); }
  function cardLand(delay = 0) { window.BattleAudio?.cardLand(delay); }
  function burn() { window.BattleAudio?.burn(); }
  function unlockAudio() { window.BattleAudio?.unlockAudio(); }
  function playBattleStart(done) {
    if (window.BattleAudio) window.BattleAudio.playBattleStart(done);
    else done?.();
  }
  function judgeResult(success) { window.BattleAudio?.judgeResult(success); }
  function floatSfx(kind) { window.BattleAudio?.floatSfx(kind); }
  function cancel() {
    window.BattleFloatFX?.cancel?.();
    window.BattleAudio?.cancel?.();
    window.BattleDamageFX?.cancel?.();
    window.NonokaIdolSkinFX?.cancel?.();
    window.MannyGunSkinFX?.cancel?.();
    window.BertisQueenSkinFX?.cancel?.();
    window.FloraSonicSkinFX?.cancel?.();
    window.WendyTeacherSkinFX?.cancel?.();
    window.ElranaFallenPhysicianSkinFX?.cancel?.();
    window.CharacterSkinFX?.cancel?.();
  }
  function leave(state) {
    window.BattleLines?.cancel?.(state);
    window.BattleEffects?.cancel?.(state);
    cancel();
    window.BattleActionGuard?.discardQueued?.();
    clearTimeout(state?.battle?.testRecoveryTimer);
    if (state) {
      state.infoUnit = null;
      state.infoTab = "stats";
    }
  }
  return {
    popFloats, slashHit, queueSlashHit, hasDamageEffect, syncBumps, clearBumps,
    beep, cardMove, cardLand, burn, unlockAudio, playBattleStart,
    judgeResult, floatSfx, cancel, leave,
  };
})();
