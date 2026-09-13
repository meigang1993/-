window.BattleCardPlayability = deps => {
  const sameSideUnits = (battle, actor) => actor?.side === "enemy" ? battle.enemies : battle.allies;
  const opposingUnits = (battle, actor) => actor?.side === "enemy" ? battle.allies : battle.enemies;
  const effectiveCard = (actor, card) =>
    window.CardUtils?.battleView?.(window.state, actor, card)
    || window.WithererSkills?.displayCard?.(actor, card) || card;
  const hasVisibleHand = unit => unit.hand.some(card => !card._pendingDraw);
  const needsSingleHand = card => !!(card?.bloodPact || card?.idolKiss
    || card?.crazyShooting || card?.demonPoker
    || card?.succubusFork || card?.assassinLatex
    || card?.cadicisPlan || card?.elranaHeal);
  const needsHandChoice = card => needsSingleHand(card) || !!card?.elranaBag || card?.armyOrder || card?.ailengBet || !!card?.mariaHonorBlessing;
  const standardSuits = new Set(["♥", "♦", "♠", "♣"]);
  function canSelectHandCost(actor, skillCard, candidate, battle, cardIndex) {
    if (!candidate || candidate._pendingDraw) return false;
    if (skillCard?.idolKiss) return candidate.suit === "♥";
    if (skillCard?.crazyShooting) return ["♥", "♦"].includes(candidate.suit);
    if (skillCard?.succubusFork) return candidate.suit === "♥";
    if (skillCard?.assassinLatex) return candidate.suit === "♠" || candidate.suit === "♣";
    if (skillCard?.cadicisPlan) {
      return deps.isKillCard(candidate) || candidate.type === "tactic";
    }
    if (skillCard?.demonPoker) return candidate.type !== "tactic";
    if (skillCard?.mariaHonorBlessing) {
      const picked = battle?.selectedBagIndexes || [];
      if (picked.includes(cardIndex)) return true;
      if (!standardSuits.has(candidate.suit) || picked.length >= 4) return false;
      return !picked.some(index => actor?.hand?.[index]?.suit === candidate.suit);
    }
    if (!skillCard?.armyOrder) return true;
    const picked = battle?.selectedBagIndexes || [];
    if (picked.includes(cardIndex)) return true;
    if (!standardSuits.has(candidate.suit) || picked.length >= 2) return false;
    const first = actor?.hand?.[picked[0]];
    return !first || standardSuits.has(first.suit) && first.suit === candidate.suit;
  }
  const hasNoIntentCost = (actor, card) => !!(card?.noIntentCost
    || card?.rageKill && actor?.hp < actor?.maxHp
    || window.OrcDungeonSkills?.noIntentCost?.(actor, card)
    || window.WithererSkills?.noIntentCost?.(actor, card));
  const canComboAttack = (battle, actor, card) => !card?.comboAttack || !!(battle
    && sameSideUnits(battle, actor).some(unit => unit.uid !== actor?.uid && unit.hp > 0)
    && opposingUnits(battle, actor).some(unit => unit.hp > 0));
  const canBorrowSlash = (battle, actor, card) => !card?.borrowSlash || !!(battle
    && sameSideUnits(battle, actor).some(unit =>
      unit.uid !== actor?.uid && unit.hp > 0 && hasVisibleHand(unit))
    && opposingUnits(battle, actor).some(unit => unit.hp > 0));
  const canMagicBullet = (battle, actor, card) => !card?.magicBullet || !!(battle
    && opposingUnits(battle, actor).some(unit =>
      unit.hp > 0 && window.CardUtils.magicBulletCards(unit).length));
  const activeRelicOf = card => card?.demonPoker ? "鬼王扑克"
    : card?.succubusFork ? "魅魔钢叉"
    : card?.assassinLatex ? "刺客胶衣"
    : card?.arsenal ? "武器库"
    : card?.withererTongueActive ? "1124号长舌头"
      : card?.armyOrder ? "军令状" : null;
  function activeRelicUnavailable(actor, card, battle) {
    const relic = activeRelicOf(card);
    if (!relic) return false;
    const units = (battle?.allies || []).concat(battle?.enemies || []);
    const state = window.state?.battle === battle ? window.state : { battle };
    return actor?.hp <= 0 || !units.includes(actor)
      || !window.RelicSystem?.hasEquipped?.(state, actor, relic);
  }

  function blockedByUsage(actor, card, battle) {
    return card.extract && actor.usedExtract
      || card.bloodPact && actor.usedBloodPact
      || card.crazyShooting && actor.usedCrazyShooting
      || card.speedAssault && (battle?.phase === 6
        ? actor.usedSpeedAssaultEnd : actor.usedSpeedAssaultPrepare)
      || card.ailengBet && actor.usedAilengBet
      || card.elranaHeal && actor.usedElranaHeal
      || card.bestaEndSlash && actor.usedBestaEndSlash
      || card.mannyArmory && actor.usedMannyArmory
      || card.mannyBarrett && actor.usedBarrett
      || card.millerSlot && actor.usedMillerSlot
      || card.crimsonRampage && !window.AngelicaLukaSkills?.canUseCrimsonRampage?.(actor)
      || card.mimicVoice && actor.usedMimic
      || card.idolKiss && actor.usedIdolKiss
      || card.bertisWhip && actor.usedBertisWhip
      || card.bertisTakeFood && actor.usedTakeFood
      || card.crazySlaughter && actor.usedCrazySlaughter
      || card.wendyTutor && actor.usedWendyTutor
      || card.cadicisPlan && actor.usedCadicisPlan
      || card.demonPoker && actor.usedDemonPoker
      || card.succubusFork && actor.usedSuccubusFork
      || card.assassinLatex && actor.usedAssassinLatex
      || card.arsenal && actor.usedArsenal
      || card.withererTongueActive && actor.usedWithererTongue
      || card.withererPeek && actor.usedWithererPeek
      || card.aceContribution && actor.usedAceContribution
      || card.ailengCharge && actor.usedAilengCharge
      || card.kaiichiMilk && actor.usedKaiichiMilk
      || card.artinaSniper && actor.usedArtinaSniper
      || card.mariaHonorBlessing && actor.usedMariaHonorBlessing;
  }

  function blockedByHand(actor, card, hasHand) {
    if ((card.bloodPact || card.elranaBag || card.ailengBet || card.elranaHeal)
      && !hasHand) return true;
    if (card.aceContribution && !hasHand) return true;
    if (card.demonPoker && !actor.hand.some(item => item.type !== "tactic" && !item._pendingDraw)) return true;
    if (card.succubusFork && !actor.hand.some(item => item.suit === "♥" && !item._pendingDraw)) return true;
    if (card.assassinLatex && !actor.hand.some(item => (item.suit === "♠" || item.suit === "♣") && !item._pendingDraw)) return true;
    if (card.crazyShooting && !actor.hand.some(item => ["♥", "♦"].includes(item.suit) && !item._pendingDraw)) return true;
    if (card.armyOrder && !window.BakarSkills?.armyOrderIndexes?.(actor).length) return true;
    if (card.bestaEndSlash && !actor.hand.some(item => !item._pendingDraw && ["♠", "♣"].includes(item.suit))) return true;
    if (card.idolKiss && !actor.hand.some(item => item.suit === "♥" && !item._pendingDraw)) return true;
    if (card.cadicisPlan && !actor.hand.some(item => !item._pendingDraw
      && (deps.isKillCard(item) || item.type === "tactic"))) return true;
    return false;
  }

  function blockedByBattle(actor, card, battle) {
    if (!battle) return false;
    const livingPartner = () => sameSideUnits(battle, actor).some(unit => unit.uid !== actor?.uid && unit.hp > 0);
    const livingFemale = () => sameSideUnits(battle, actor).some(unit => unit.gender === "female" && unit.hp > 0);
    const livingMale = () => sameSideUnits(battle, actor).some(unit => unit.gender === "male" && unit.hp > 0);
    const livingEnemy = () => opposingUnits(battle, actor).some(unit => unit.hp > 0);
    const handTarget = () => sameSideUnits(battle, actor).concat(opposingUnits(battle, actor))
      .some(unit => unit.uid !== actor?.uid && unit.hp > 0 && hasVisibleHand(unit));
    if (card.aceContribution && !livingPartner()) return true;
    if ((card.ailengCharge || card.kaiichiMilk) && !livingFemale()) return true;
    if (card.idolKiss && !livingPartner()) return true;
    if (card.bertisWhip && !livingPartner()) return true;
    if (card.extract && !livingMale()) return true;
    if ((card.speedAssault || card.withererPeek || card.crazySlaughter
      || card.crimsonRampage || card.bestaEndSlash) && !livingEnemy()) return true;
    if (card.arsenal && !sameSideUnits(battle, actor).some(unit => unit.uid !== actor.uid && unit.hp > 0)) return true;
    if (card.bertisTakeFood && !(battle.allies || []).some(unit => unit.ref === "bertis" && unit.hp > 0 && (unit.food || 0) > 0)) return true;
    if (card.comboAttack && !canComboAttack(battle, actor, card)) return true;
    if (card.borrowSlash && !canBorrowSlash(battle, actor, card)) return true;
    if ((card.discardTarget || card.stealCard) && !handTarget()) return true;
    if (card.statusKey && !opposingUnits(battle, actor)
      .some(unit => unit.hp > 0
        && !window.BattleStatusCards?.has?.(unit, card.statusKey))) return true;
    return card.magicBullet && !canMagicBullet(battle, actor, card);
  }

  function canPlay(actor, source, battle = window.state?.battle) {
    if (!actor || !source) return false;
    const card = effectiveCard(actor, source);
    if (card.type === "response" || card.type === "status") return false;
    if (actor.ref === "loki" && card.type === "tactic" && !card._skill) return false;
    if (window.CharacterSkillAccess?.canActor
      && !window.CharacterSkillAccess.canActor(battle, actor, card)) return false;
    if (activeRelicUnavailable(actor, card, battle)) return false;
    const hasHand = hasVisibleHand(actor);
    if (blockedByUsage(actor, card, battle) || blockedByHand(actor, card, hasHand)) return false;
    if (blockedByBattle(actor, card, battle)) return false;
    if (card.lokarWindSlash && !window.LokarSkills?.canWindSlash?.({ battle }, actor)) return false;
    if (card.withererShift && !window.WithererSkills?.canShift?.(actor)) return false;
    if (card.withererTongueActive && (actor.intent || 0) > 0) return false;
    if (card.slime && (actor.intent || 0) <= 0) return false;
    if (actor.frozenSlash && deps.isKillCard(card) && !card?._skill) return false;
    const intentFree = hasNoIntentCost(actor, card)
      || window.AngelicaLukaSkills?.canPayIntentWithRage?.(actor, card);
    return !(deps.isKillCard(card) && !card.virtual && !intentFree && (actor.intent || 0) <= 0);
  }

  return {
    sameSideUnits, opposingUnits, effectiveCard, needsSingleHand, needsHandChoice,
    canSelectHandCost, hasNoIntentCost, canComboAttack, canBorrowSlash,
    canMagicBullet, canPlay,
  };
};
