window.CardUtils = (() => {
  const cardTypes = Object.freeze(["slash", "response", "tactic", "consume", "obstacle"]);
  let entityIndex = null;
  const runtimeKeys = new Set(["_pendingDraw", "_countAsPlayed", "_playedFromHand", "_playedFlightDone", "_playedTargetUid", "_playedDamageSkipped", "_slashTextShown", "_attackAnimQueued", "_attackAnimDamagePending", "_extraSlashResolution", "_extraSlashTextQueued", "_targetUids", "_costCard", "_tempBiteKillBase", "_tempIgnoreResponse", "_tempIgnoreBlock", "_tempHoly", "_tempFire", "_tempSweep", "_edisSwordExtra", "_whiteLolitaTargetUids", "lastHpLoss", "totalHpLoss", "headshotDone", "headshotMultiplier", "chargeMultiplier", "gatlingRepeats", "targetUids", "nextTargetIndex", "mannyDouble", "cadicisPlanApplied", "greenGatlingQueue", "angelicaTriple", "angelicaTauntSlash", "lockSuitApplied", "lockSuitResponse", "shockHandCannonDouble", "withererSpeedResponse", "withererBerserkUse", "withererBerserkKill", "beastReloadTrigger", "bakarTalentSkip", "skipMvpCardCount", "_lukaChecked"]);
  function clean(card, extra = {}) {
    const out = {};
    Object.keys(card || {}).forEach(k => { if (!runtimeKeys.has(k) && !k.startsWith("_")) out[k] = card[k]; });
    delete out.suitsText; delete out.source; delete out.suits;
    return { ...out, ...extra };
  }
  function index() {
    if (entityIndex) return entityIndex;
    entityIndex = new Map();
    [window.GameDataCards?.cardCodex, window.GameDataCards?.baseDeck, window.GameDataCards?.eliteCards].forEach(list => (list || []).forEach(c => { if (c?.name && !entityIndex.has(c.name)) entityIndex.set(c.name, clean(c)); }));
    return entityIndex;
  }
  function entity(name) {
    const card = index().get(name);
    if (!card) console.warn(`未找到实体牌模板：${name}`);
    return card || { name };
  }
  function cloneEntity(name, extra = {}) { return clean(entity(name), { name, ...extra }); }
  function fromEntity(name, extra = {}) { return cloneEntity(name, { virtual: true, ...extra }); }
  function convertAs(name, costCard, extra = {}) { return cloneEntity(name, { suit: costCard?.suit, convertedFrom: costCard?.name, ...extra }); }
  const isKillCard = card => card?.type === "slash" || /杀(?:（[^）]*）)?$/.test(card?.name || "");
  const isGroupTargetCard = card => !!(card?.sweep || card?.allTargets || card?.aoeLineShown);
  const isSingleTargetCard = card => !!card && !card.targetless && !isGroupTargetCard(card);
  const targetScope = card => isGroupTargetCard(card) ? "group" : isSingleTargetCard(card) ? "single" : "none";
  const isGroupKillCard = card => isKillCard(card) && isGroupTargetCard(card);
  const isSingleKill = card => isKillCard(card) && isSingleTargetCard(card);
  const isPhysicalSingleKill = (actor, card) => isSingleKill(card)
    && card?.attackType !== "magic" && !card?.magicDamage
    && card?.scale !== "magic" && !card?.magicBullet
    && !card?.magicDuel && !card?.demonInvasion
    && !actor?.extractMagicAttack;
  const isEntityKillCard = card => isKillCard(card) && !card.virtual;
  const isEntitySingleKill = card => isEntityKillCard(card) && isSingleTargetCard(card);
  const isSingleKillCard = card => isSingleKill(card) && !card._pendingDraw;
  const isCounterableTactic = card => !!(card?.type === "tactic" && !card.ignoreResponse && (!card._skill || card.virtual || card.convertedFrom));
  const canRespondTo = (required, card) => required === "slash" ? isSingleKillCard(card) : !card?._pendingDraw && ((card?.type === "response" && card.name === "闪" || (required?.singleKill !== false && card?.deflect) || card?.withererSpeedResponse) && (!required?.blackDodgeOnly || card.suit === "♠" || card.suit === "♣"));
  const standardSuits = new Set(["♥", "♦", "♠", "♣"]);
  const canMagicBulletDisplay = card => !!card && !card._pendingDraw
    && standardSuits.has(card.suit)
    && !window.BattleStatusCards?.isStatus?.(card);
  const magicBulletCards = unit => (unit?.hand || []).filter(canMagicBulletDisplay);
  function copyPlayable(card, extra = {}) { return card?.name && index().has(card.name) ? cloneEntity(card.name, { suit: card.suit, ...extra }) : clean(card, extra); }
  function generatedSource(card) {
    if (!card) return "";
    if (typeof card.generatedBySkill === "string") return card.generatedBySkill;
    if (card.wendyTutorGenerated) return "解答迷惑";
    if (card.withererPeekSlash) return "杀欲窥视";
    if (card.copiedByEdis) return "拷贝魔眼";
    return "";
  }
  function battleView(state, actor, card) {
    const shifted = window.WithererSkills?.displayCard?.(actor, card) || card;
    return window.UnderwaterTrainSkills?.displayBiteCard?.(state, actor, shifted) || shifted;
  }
  function damageStatKey(actor, card) {
    const slash = isKillCard(card);
    if (card?._soulBladeStatKey) return card._soulBladeStatKey;
    const convertedMagic = actor?.extractMagicAttack && (slash || card?.reckless || card?.duel)
      || actor?.ref === "ophelia" && !card?._skipUseKillTriggers
        && (card?._queenTailConverted || isPhysicalSingleKill(actor, card))
      || actor?.ref === "besta" && slash && ["♠", "♣"].includes(card?.suit);
    if (convertedMagic) return "magic";
    if (card?.virtual) return "attack";
    if (card?._skill) return null;
    return card?.scale === "magic" ? "magic" : card?.scale === "attack" || slash ? "attack" : "magic";
  }
  return {
    cardTypes, cloneEntity, fromEntity, convertAs, copyPlayable, clean,
    isKillCard, isEntityKillCard, isGroupTargetCard, isSingleTargetCard,
    targetScope, isGroupKillCard, isSingleKill, isPhysicalSingleKill,
    isEntitySingleKill,
    isSingleKillCard, isCounterableTactic, canRespondTo, generatedSource,
    canMagicBulletDisplay, magicBulletCards, battleView, damageStatKey,
  };
})();
