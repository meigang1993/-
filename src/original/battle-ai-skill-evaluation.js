window.BattleAISkillEvaluation = (() => {
  const {
    HEAL_THRESHOLD, alive, isKill, hpPct, visible, handLimit, hearts,
    targetByPolicy, healTarget, keepValue,
  } = window.BattleAIHelpers;
  const { costCard, otherAlly, ailengChargeTarget } =
    window.BattleAISkillHelpers;

  function skillScore(actor, card, team, foes) {
    const otherTeam = team.filter(unit => unit.uid !== actor.uid);
    const low = healTarget(team);
    const otherLow = healTarget(otherTeam);
    const hasFoe = alive(foes).length > 0;
    const partner = otherAlly(actor, team);
    if (card.demonPoker) return skillCost(actor, card) ? 74 : 0;
    if (card.elranaBag) {
      const count = bagIndexes(actor).length;
      return count ? (visible(actor) > handLimit(actor) ? 90 : 58 + count) : 0;
    }
    if (card.armyOrder) {
      return window.BakarSkills?.armyOrderIndexes?.(actor).length
        && alive(foes).length ? 112 : 0;
    }
    if (card.bertisWhip || card.aceContribution) return partner ? 55 : 0;
    if (card.idolKiss) {
      return actor.hand.some(item => item.suit === "♥" && !item._pendingDraw)
        && (hpPct(actor) < HEAL_THRESHOLD || otherLow) ? 55 : 0;
    }
    if (card.elranaHeal) {
      return actor.hand.some(item => !item._pendingDraw) && low ? 80 : 0;
    }
    if (card.ailengCharge) {
      const target = ailengChargeTarget(actor, team);
      return target
        ? 35 + (target.ref === "besta" ? visible(actor) * 4 : hearts(actor) * 12)
        : 0;
    }
    if (card.cadicisPlan) {
      return actor.hand.some(item =>
        !item._pendingDraw && (isKill(item) || item.type === "tactic")) ? 60 : 0;
    }
    if (card.bloodPact || card.crazyShooting) {
      return skillCost(actor, card) ? 50 : 0;
    }
    if (card.allyTarget) return low ? 80 : 0;
    if (card.block || card.charge || card.drawCards || card.targetless
      || card.mannyArmory || card.mannyBarrett || card.millerSlot
      || card.angelicaRage || card.wendyTutor) return 60;
    if (card.angelicaTaunt) return hpPct(actor) > .45 ? 55 : 12;
    if (card.bertisTakeFood) {
      return team.some(unit =>
        unit.ref === "bertis" && unit.hp > 0 && (unit.food || 0) > 0) ? 55 : 0;
    }
    if (card.mimicVoice) return hasFoe ? 50 : 0;
    return (card.power || card.damage || 0) + (hasFoe ? 20 : 0);
  }

  function skillTarget(actor, card, team, foes) {
    if (card.bertisWhip || card.aceContribution || card.idolKiss) {
      return otherAlly(actor, team);
    }
    if (card.ailengCharge) return ailengChargeTarget(actor, team);
    if (card.allyTarget || card.elranaHeal) {
      return healTarget(team) || actor;
    }
    if (card.elranaBag || card.armyOrder || card.targetless || card.block
      || card.charge || card.drawCards || card.mannyArmory || card.mannyBarrett
      || card.millerSlot || card.angelicaRage || card.angelicaTaunt
      || card.cadicisPlan || card.wendyTutor) return actor;
    return targetByPolicy(foes);
  }

  function bagIndexes(actor) {
    const cards = (actor.hand || []).map((card, index) => ({ card, index }))
      .filter(item => !item.card._pendingDraw);
    const weak = cards.filter(item => keepValue(item.card) <= 10)
      .sort((left, right) => keepValue(left.card) - keepValue(right.card));
    if (visible(actor) > handLimit(actor)) {
      return cards.sort((left, right) =>
        keepValue(left.card) - keepValue(right.card))
        .slice(0, visible(actor) - handLimit(actor))
        .map(item => item.index);
    }
    return weak.slice(0, Math.min(2, weak.length)).map(item => item.index);
  }

  function skillCost(actor, card) {
    const hand = actor.hand.filter(item => !item._pendingDraw);
    if (card.idolKiss) return costCard(hand, card, item => item.suit === "♥");
    if (card.elranaHeal || card.bloodPact) {
      return costCard(hand, card);
    }
    if (card.cadicisPlan) {
      return costCard(hand, card,
        item => isKill(item) || item.type === "tactic");
    }
    if (card.demonPoker) {
      return costCard(hand, card, item => item.type !== "tactic" && !item._skill);
    }
    if (card.crazyShooting) {
      return costCard(
        hand, card, item => item.suit === "♥" || item.suit === "♦");
    }
    return null;
  }

  return { skillScore, skillTarget, bagIndexes, skillCost };
})();
