window.CharacterSkillAccess = (() => {
  const definitions = [
    { flags: ["bloodPact"], name: "热血契约", target: "self", cost: "card" },
    { flags: ["lokarWindSlash"], name: "狂风绝息斩", target: "self" },
    { flags: ["extract"], name: "榨取精华", target: "friendlyMale", prepare: "awaitingExtractUid" },
    { flags: ["mannyArmory"], name: "次元军火库", target: "self" },
    { flags: ["millerSlot"], name: "贪玩老虎机", target: "self" },
    { flags: ["mimicVoice"], name: "模仿之音", target: "other", prepare: "awaitingMimicUid" },
    { flags: ["idolKiss"], name: "偶像之吻", target: "friendlyOther", cost: "heart" },
    { flags: ["speedAssault"], name: "神速之袭", target: "enemy", prepare: "awaitingSpeedAssaultUid" },
    { flags: ["wendyTutor"], name: "解答迷惑", target: "self" },
    { flags: ["cadicisPlan"], name: "战场指挥官", target: "self", cost: "attack" },
    { flags: ["crazyShooting"], name: "疯狂射击", target: "self", cost: "red" },
    { flags: ["bertisWhip"], name: "苦肉鞭笞", target: "friendlyOther" },
    { flags: ["crazySlaughter"], name: "疯狂屠戮", target: "self" },
    { flags: ["crimsonRampage"], name: "猩红暴走", target: "self" },
    { flags: ["elranaHeal"], name: "回春之手", target: "friendly", cost: "card" },
    { flags: ["aceContribution"], name: "贡献计划", target: "friendlyOther" },
    { flags: ["ailengBet", "elranaBag"], name: "计算下注", target: "self", cost: "cards" },
    { flags: ["bestaEndSlash"], name: "终焉鬼影斩", target: "self" },
    { flags: ["withererPeek"], name: "杀欲窥视", target: "enemy" },
    { flags: ["withererShift"], name: "暴走与极速", target: "self" },
    { flags: ["kaiichiMilk"], name: "半魅魔精华", target: "friendlyFemale" },
    { flags: ["artinaSniper"], name: "狙击目标", target: "enemy" },
    { flags: ["mariaHonorBlessing"], name: "荣誉祝福", target: "self", cost: "cards" },
    { flags: ["mannyBarrett"], name: "巴特雷", target: "self" },
    { flags: ["bertisTakeFood"], name: "取粮", target: "self" },
    { flags: ["ailengCharge"], name: "充能精华", target: "friendlyFemale" },
  ];
  const matchesOf = card => definitions.filter(def =>
    def.flags.some(flag => card?.[flag]));
  const definitionOf = card => {
    const matches = matchesOf(card);
    return matches.length === 1 ? matches[0] : null;
  };
  const allUnits = battle => (battle?.allies || []).concat(battle?.enemies || []);
  const livingMember = (battle, unit) =>
    !!unit && unit.hp > 0 && allUnits(battle).includes(unit);
  function skillsOf(actor) {
    return window.UICommon?.skillsOf?.(actor) || actor?.skills || [];
  }
  function owns(actor, def) {
    return skillsOf(actor).some(skill =>
      skill?.type === "active" && skill.name === def.name
      && def.flags.some(flag => skill.card?.[flag]));
  }
  function canActor(battle, actor, card) {
    const matches = matchesOf(card);
    if (!matches.length || actor?.side !== "ally") return true;
    if (matches.length !== 1) return false;
    const [def] = matches;
    return livingMember(battle, actor) && owns(actor, def);
  }
  function phaseAllowed(battle, actor, def) {
    if (!def.prepare) return battle?.phase === 4;
    const phase = battle?.phase;
    return battle?.[def.prepare] === actor.uid
      && (phase === 1 || def.flags.includes("speedAssault") && phase === 6);
  }
  function targetAllowed(battle, actor, target, mode) {
    if (!livingMember(battle, target)) return false;
    if (mode === "self") return target === actor;
    if (mode === "other") return target !== actor;
    if (mode === "enemy") return target.side !== actor.side;
    if (mode === "friendly") return target.side === actor.side;
    if (mode === "friendlyOther") return target.side === actor.side && target !== actor;
    if (mode === "friendlyMale") return target.side === actor.side && target.gender === "male";
    return mode === "friendlyFemale"
      && target.side === actor.side && target.gender === "female";
  }
  function selectedCard(battle, actor, card) {
    const explicit = [card?._costCard, actor?._activeCostCard]
      .find(item => actor?.hand?.includes(item));
    return explicit || actor?.hand?.[battle?.selectedCardIndex];
  }
  function costAllowed(battle, actor, card, kind) {
    if (!kind) return true;
    if (kind === "cards") {
      const indexes = [...new Set(card?._bagIndexes || battle?.selectedBagIndexes || [])];
      return !!indexes.length && indexes.every(index =>
        actor.hand?.[index] && !actor.hand[index]._pendingDraw);
    }
    const cost = selectedCard(battle, actor, card);
    if (!cost || cost._pendingDraw) return false;
    if (kind === "heart") return cost.suit === "♥";
    if (kind === "red") return cost.suit === "♥" || cost.suit === "♦";
    if (kind === "attack") {
      return window.CardUtils?.isKillCard?.(cost) || cost.type === "tactic";
    }
    return true;
  }
  function canResolve(state, actor, target, card, canPlay) {
    const battle = state?.battle, matches = matchesOf(card);
    if (!matches.length || actor?.side !== "ally") return true;
    if (matches.length !== 1) return false;
    const [def] = matches;
    return canActor(battle, actor, card)
      && battle?.activeUid === actor.uid
      && phaseAllowed(battle, actor, def)
      && targetAllowed(battle, actor, target, def.target)
      && costAllowed(battle, actor, card, def.cost)
      && (!canPlay || canPlay(actor, card, battle));
  }
  return { definitions, definitionOf, canActor, canResolve };
})();
