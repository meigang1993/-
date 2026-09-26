window.CardUtils = (() => {
  const cardTypes = Object.freeze(["slash", "response", "tactic", "consume", "obstacle"]);
  let entityIndex = null;
  const runtimeKeys = new Set(["_pendingDraw", "_countAsPlayed", "_playedFromHand", "_playedFlightDone", "_playedTargetUid", "_playedDamageSkipped", "_slashTextShown", "_attackAnimQueued", "_attackAnimDamagePending", "_extraSlashResolution", "_extraSlashTextQueued", "_targetUids", "_costCard", "_tempBiteKillBase", "_tempIgnoreResponse", "_tempIgnoreBlock", "_tempHoly", "_tempFire", "_tempSweep", "_edisSwordExtra", "_whiteLolitaTargetUids", "lastHpLoss", "totalHpLoss", "headshotDone", "headshotQueued", "headshotMultiplier", "chargeMultiplier", "gatlingRepeats", "targetUids", "nextTargetIndex", "mannyDouble", "cadicisPlanApplied", "greenGatlingQueue", "angelicaMight", "lockSuitApplied", "lockSuitResponse", "shockHandCannonDouble", "withererSpeedResponse", "withererBerserkUse", "withererBerserkKill", "beastReloadTrigger", "bakarTalentSkip", "skipMvpCardCount", "_lukaChecked"]);
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
  // 转换牌离开手牌区后还原为原牌。
  // 只有「获得即转换、长期留在手牌」的转化需要它：冰心双刺剑在原牌上就地改写，
  // 原牌字段被清空，若离手时不还原，弃牌堆里留下的就是转换产物（【刺杀】），
  // 洗牌堆重洗后牌库会凭空累积刺杀，原牌永久消失。
  // 打出时才转换的牌（魅魔钢叉/刺客胶衣/鬼王扑克/疯狂射击/终焉鬼影斩）不适用：
  // 它们把原牌直接送进弃牌堆、另建产物对象打出，原牌本就以原身份入堆。
  // 快照存于 _revertSnapshot（下划线字段，clean 会剥除，故不参与牌面显示与结算）。
  function revertConverted(card) {
    const snapshot = card?._revertSnapshot;
    if (!snapshot || !card) return card;
    Object.keys(card).forEach(key => { delete card[key]; });
    Object.assign(card, snapshot);
    return card;
  }
  // 入堆专用：返回还原后的副本，原对象保持转换态。
  // 打出牌在 put 入弃牌堆之后，动画阶段才由 battle-effect-handlers 把 card
  // 引用 unshift 进 b.played 出牌区；若就地还原，玩家会看到"打出【刺杀】、
  // 出牌区却显示【杀】"。入堆用副本即可两头正确：弃牌堆存原牌，出牌区显示刺杀。
  function revertConvertedCopy(card) {
    const snapshot = card?._revertSnapshot;
    if (!snapshot || !card) return card;
    return { ...snapshot };
  }
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
    // 饰品主动技把「实体手牌」转换而成的牌走 convertAs：带 convertedFrom、不带 virtual，
    // 本质是实体牌（应按牌面结算），却仍保留 _skill 标记以兼容既有流程。
    // 若在此落到 _skill → null，攻击力/魔力加成会整段归零：魅魔钢叉的【魅杀】、
    // 刺客胶衣的【刺杀】基础值为 0，最终打出 0 伤害。
    // 不能靠删掉 _skill 实现：_skill 同时被神数计数、冻结杀、恐怖巨锤响应、
    // 出牌日志措辞等多处依赖，删除会连带改变这些行为。
    // 此处按牌面 scale 取键，分支与末尾默认分支同一口径，避免误改鬼王扑克等
    // 无 scale 的战术牌（默认走 magic）。
    if (card?._relicSkill && card?.convertedFrom && !card?.virtual) {
      return card?.scale === "magic" ? "magic"
        : card?.scale === "attack" || slash ? "attack" : "magic";
    }
    if (card?.virtual) return "attack";
    if (card?._skill) return null;
    return card?.scale === "magic" ? "magic" : card?.scale === "attack" || slash ? "attack" : "magic";
  }
  return {
    cardTypes, cloneEntity, fromEntity, convertAs, copyPlayable, clean, revertConverted,
    revertConvertedCopy,
    isKillCard, isEntityKillCard, isGroupTargetCard, isSingleTargetCard,
    targetScope, isGroupKillCard, isSingleKill, isPhysicalSingleKill,
    isEntitySingleKill,
    isSingleKillCard, isCounterableTactic, canRespondTo, generatedSource,
    canMagicBulletDisplay, magicBulletCards, battleView, damageStatKey,
  };
})();
