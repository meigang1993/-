window.BattleCardCleanup = (() => {
  function restoreWithererCard(card) {
    if (!card?._withererOriginal) return;
    Object.entries(card._withererOriginal).forEach(([key, value]) => {
      if (value === undefined) delete card[key];
      else card[key] = value;
    });
  }
  function restoreFields(card, snapshot) {
    if (Array.isArray(snapshot)) {
      snapshot.forEach(({ key, present, value }) => {
        if (present) card[key] = value;
        else delete card[key];
      });
      return;
    }
    Object.entries(snapshot || {}).forEach(([key, value]) => {
      if (value === undefined) delete card[key];
      else card[key] = value;
    });
  }
  function clearPlayFlags(card) {
    if (!card) return;
    delete card._countAsPlayed; delete card._playedFromHand; delete card._playedFlightDone; delete card._playedTargetUid; delete card._playedDamageSkipped; delete card._slashTextShown; delete card._attackAnimQueued; delete card._attackAnimDamagePending; delete card._extraSlashResolution; delete card._extraSlashTextQueued; delete card._targetUids; delete card._costCard; delete card.headshotDone; delete card.headshotMultiplier;
    if (!card.lukaWolfFang) delete card.noIntentCost;
    if (card._beastOriginal) { card.name = card._beastOriginal.name; card.power = card._beastOriginal.power; card.text = card._beastOriginal.text; }
    if (card._tempBiteKillBase) restoreFields(card, card._tempBiteKillBase);
    if (card._tempQueenTailBase) restoreFields(card, card._tempQueenTailBase);
    if (card._tempIgnoreResponse) delete card.ignoreResponse;
    if (card._tempIgnoreBlock) delete card.ignoreBlock;
    if (card._tempHoly) delete card.holy;
    if (card._tempFire) delete card.fire;
    if (card._tempSweep) delete card.sweep;
    restoreWithererCard(card);
    ["_tempBiteKillBase", "_tempQueenTailBase", "_queenTailConverted", "_beastOriginal", "_withererOriginal", "withererBerserkUse", "withererBerserkKill", "_berserkGrowthApplied", "_beastSuppressionApplied", "beastReloadTrigger", "_cerberusTripleApplied", "_tempIgnoreResponse", "_tempIgnoreBlock", "_tempHoly", "_tempFire", "_tempSweep", "_mannyFlamerFxShown", "twoDodgesRequired", "monaPiercingSweep", "krowFemaleTarget", "sharkTorpedo", "lockSuitApplied", "lockSuitResponse", "_minotaurPreventUids", "shockHandCannonDouble", "chargeMultiplier", "mannyDouble", "cadicisPlanApplied", "gatlingRepeats", "magicMissileVirtual", "angelicaMight", "_lukaChecked", "_armoredRamFlipped", "_skipUseKillTriggers", "skipAfterCardPlayed", "skipMvpCardCount", "_soulBladeRepeated", "_soulBladeRepeat", "_soulBladeStatKey", "_whiteLolitaTargetUids", "_nanaliApolloTargetUids", "_nanaliDamagePrepared", "_bondiRoarApplied", "_feintTriggered", "_bondiClaimed", "bondiRevenge", "_bondiDoubleLogged", "_shadowAxeLogged", "_obsidianLogged", "_revengeKillLogged", "_bakarCommanderTriggered", "_bakarFireFistTriggered", "bakarTalentSkip", "forceAutoResponse", "edisChain", "_edisPrePlayHand", "_edisHit", "_edisResolving", "_edisRepeating", "_gerdaRunPaid", "_queenTailSpoken"].forEach(key => delete card[key]);
  }
  return { clearPlayFlags };
})();
