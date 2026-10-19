// 出牌阶段可用性判定工厂。
// 「出牌阶段限一次」登记表已拆到同目录 skill-once-per-turn.js（零依赖，先于本文件装配）；
// 本文件只做消费：blockedByUsage 调用 window.SkillOncePerTurn.blocked。
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
    || card?.elranaHeal);
  const needsHandChoice = card => needsSingleHand(card) || !!card?.elranaBag || card?.armyOrder || card?.ailengBet || !!card?.mariaHonorBlessing;
  const standardSuits = new Set(["♥", "♦", "♠", "♣"]);
  function canSelectHandCost(actor, skillCard, candidate, battle, cardIndex) {
    if (!candidate || candidate._pendingDraw) return false;
    if (skillCard?.idolKiss) return candidate.suit === "♥";
    if (skillCard?.crazyShooting) return ["♥", "♦"].includes(candidate.suit);
    if (skillCard?.succubusFork) return candidate.suit === "♥";
    if (skillCard?.assassinLatex) return candidate.suit === "♠" || candidate.suit === "♣";
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
  // 免杀意只认 noIntentCost 标记与专属技能判据：普通实体全体【杀】
  // （手牌打出的【机枪扫杀】）与单体杀一样消耗1点杀意，符合设定；
  // 由技能/饰品转化而来的全体杀由转化方自行打上 noIntentCost（疯狂射击、
  // 机尾机枪、火力压制等），不会误免、也不会误扣。
  const hasNoIntentCost = (actor, card) => !!(card?.noIntentCost
    || card?.rageKill && actor?.hp < actor?.maxHp
    // 兽人「火力压制」：单体杀转全体杀后免杀意（技能文本），由转化方预判。
    || window.OrcDungeonSkills?.suppressionFreeIntent?.(actor, card)
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
  // 【窃取】需要「有牌可偷的敌人」+「另一个存活的同阵营接收者」两个条件同时成立。
  // 缺任一条件时 handleSpecialCard 会直接 return false（点了没反应），
  // 故在置灰阶段就判掉，避免玩家点了毫无反馈。
  // 与 skill-once-per-turn.js 的 usedCatherineSteal 置灰互不冲突：那是「已用过」。
  const canCatherineSteal = (battle, actor, card) => !card?.catherineSteal || !!(battle
    && opposingUnits(battle, actor).some(unit => unit.hp > 0 && hasVisibleHand(unit))
    && sameSideUnits(battle, actor).some(unit => unit.uid !== actor?.uid && unit.hp > 0));
  // 【狙击目标】需要「有手牌可展示的存活敌人」。目标空手牌时 revealSnipe
  // 会在取不到牌时直接 return false（点了没反应），故同样在置灰阶段判掉。
  const canArtinaSniper = (battle, actor, card) => !card?.artinaSniper || !!(battle
    && opposingUnits(battle, actor).some(unit => unit.hp > 0 && hasVisibleHand(unit)));
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

  // 缺登记表时直接抛错，而不是静默放行：静默会让「出牌阶段限一次」的技能
  // 用过后仍可点、仍可再次结算，且无任何报错，排查成本极高。
  // 装配顺序由 build 清单保证（本模块排在 skill-once-per-turn.js 之后）。
  const oncePerTurnRegistry = () => {
    const registry = window.SkillOncePerTurn;
    if (!registry?.blocked) {
      throw new Error("[skill-once-per-turn] 登记表未装配："
        + "skill-once-per-turn.js 必须先于 battle-card-playability.js 加载");
    }
    return registry;
  };

  const blockedByUsage = (actor, card, battle) =>
    oncePerTurnRegistry().blocked(actor, card, battle);

  // 时停标记表同样不允许静默放行：缺了它，被时停的角色仍能用技能、仍能响应。
  const timeStopTable = () => {
    const table = window.MieryulaTimeStop;
    if (!table?.isSkillDisabled) {
      throw new Error("[mieryula-time-stop] 时停模块未装配："
        + "mieryula-time-stop.js 必须先于 battle-card-playability.js 加载");
    }
    return table;
  };

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
    return false;
  }

  function blockedByBattle(actor, card, battle) {
    if (!battle) return false;
    // 时停：技能失效。无谋霸姬：无法使用战术牌（技能牌除外）。
    if (timeStopTable().isSkillDisabled(actor)) return true;
    if (window.MieryulaSkills?.blocksTactic?.(actor, card)) return true;
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
    if (card.preshiDrain && !livingMale()) return true;
    if (card.mieryulaBloodthirst && !livingMale()) return true;
    if ((card.speedAssault || card.withererPeek || card.crazySlaughter
      || card.crimsonRampage || card.bestaEndSlash) && !livingEnemy()) return true;
    if (card.arsenal && !sameSideUnits(battle, actor).some(unit => unit.uid !== actor.uid && unit.hp > 0)) return true;
    if (card.bertisTakeFood && !(battle.allies || []).some(unit => unit.ref === "bertis" && unit.hp > 0 && (unit.food || 0) > 0)) return true;
    if (card.comboAttack && !canComboAttack(battle, actor, card)) return true;
    if (card.borrowSlash && !canBorrowSlash(battle, actor, card)) return true;
    if ((card.discardTarget || card.stealCard) && !handTarget()) return true;
    if (card.catherineSteal && !canCatherineSteal(battle, actor, card)) return true;
    if (card.artinaSniper && !canArtinaSniper(battle, actor, card)) return true;
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
