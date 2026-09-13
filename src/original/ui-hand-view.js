window.GameUIHandView = (() => {
  function render(context, U) {
    const { battle, actor, modes } = context;
    const controls = renderControls(context, U);
    const skillLine = renderSkills(context, U);
    const handCards = renderCards(context, U);
    const handWrap = `<div class="hand-scroll-wrap no-scroll"><button class="hand-scroll-btn left" data-hand-scroll="-1">‹</button><div class="hand active-hand" data-hand-owner="${U.esc(actor.uid)}">${handCards}</div><button class="hand-scroll-btn right" data-hand-scroll="1">›</button></div>`;
    const intentMax = Math.min(99, Math.max(1, (actor.stats.bloodlust || 1) + (actor.intentMaxBonus || 0)));
    const charge = actor.charge
      ? `<span class="tag">蓄力×${Math.pow(2, actor.charge).toFixed(3).replace(/\.0+$/, "").replace(/0+$/, "")}</span>`
      : "";
    return `<div class="hand-panel ${battle.locked && !modes.transferLocked ? "locked" : ""}"><div class="hand-head"><b>${U.esc(actor.name)} 的手牌</b><span class="tag">${phaseLabel(context)}</span><span class="tag">杀意 ${actor.intent || 0}/${intentMax}</span>${charge}${controls}</div><div class="hand-body ${skillLine ? "has-skills" : ""}">${skillLine}${handWrap}</div></div>`;
  }

  function renderControls(context, U) {
    const { battle, actor, modes, picks, needDiscard, pickedCard, picked, ready, disabled } = context;
    if (modes.borrowChoice) {
      const useSlash = battle.handReveal.mode === "borrowSlashChoice";
      return `<span class="discard-prompt">借刀杀人：从${U.esc(actor.name)}的手牌区选择${useSlash ? "实际使用的单体杀牌" : "要获得的1张手牌"}。</span>`;
    }
    if (modes.dimensionTransfer) {
      return `<span class="discard-prompt">次元转移：选择1张黑色手牌，再点击一名敌方角色转移伤害。</span><button data-dimension-transfer-skip="1">放弃发动</button>`;
    }
    if (modes.kaiichiShare) {
      return `<span class="discard-prompt">半魅魔血：已选${picks.kaiichi.length}/${battle.kaiichiShare.maxCount}张，选择至多2张后点击一名队友一次性交出。</span><button data-kaiichi-share-skip="1">不交</button>`;
    }
    if (modes.cadicisShare) {
      return `<span class="discard-prompt">指挥官责任：点击${U.esc(actor.name)}的一张手牌交给目标，还需交出${battle.cadicisResponsibility.remaining || 1}张。</span>`;
    }
    if (modes.share) {
      return `<span class="discard-prompt">新月之歌：已选${picks.share.length}/${battle.newMoonShare.count}张，选满后点击一名其他我方角色交出，或不交。</span><button data-new-moon-skip="1">不交</button>`;
    }
    if (modes.millerShare) {
      return `<span class="discard-prompt">收获分享：已选${picks.miller.length}/${needDiscard}张，点队友交出，或直接弃置。</span><button data-miller-discard="1" ${picks.miller.length ? "" : "disabled"}>直接弃置</button>`;
    }
    if (modes.hammer) {
      return `<span class="discard-prompt">霹雳之锤：点击一张手牌弃置，令刚被闪抵消的杀强制造成伤害。</span><button class="ghost" data-cancel-hammer="1">放弃发动</button>`;
    }
    if (modes.discard) {
      return `<span class="discard-prompt">${context.discardTip} 已选${picks.discard.length}/${needDiscard}</span><button data-confirm-discard="1" ${picks.discard.length >= needDiscard && needDiscard > 0 ? "" : "disabled"}>确认弃置</button>`;
    }
    if (picked) {
      const label = pickedCard?.targetless || context.handChoice || pickedCard?.comboAttack ? "使用" : "确定";
      return `<button data-confirm-target="1" ${ready && !battle.locked ? "" : "disabled"}>${label}</button><button class="ghost" data-cancel-target="1" ${disabled}>取消</button><span class="muted">${selectionTip(context)}</span>`;
    }
    if (modes.speedStart) {
      const phase = battle.phase === 6 ? "结束阶段" : "准备阶段";
      return `<button data-skip-extract="1">跳过神速之袭</button><span class="muted">${phase}：点击敌方角色可发动神速之袭，或跳过继续结算。</span>`;
    }
    if (modes.extractStart) {
      return `<button data-skip-extract="1">跳过榨取</button><span class="muted">准备阶段：可发动榨取精华，或跳过进入出牌阶段。</span>`;
    }
    if (modes.mimicStart) {
      return `<button data-skip-extract="1">跳过模仿</button><span class="muted">准备阶段：可发动模仿之音，或跳过进入下一阶段。</span>`;
    }
    return `<button data-end-play="1" ${disabled}>结束出牌</button>`;
  }

  function selectionTip({ battle, pickedCard: card, soulNeed, handChoice }) {
    if (card?.demonPoker) return "选择一张非战术牌和一名敌方目标，随机转化为拉芙战术牌使用";
    if (card?.elranaHeal) return "选择一张手牌弃置，再指定我方角色发动回春之手";
    if (card?.idolKiss) return "选择一张♥红桃手牌，再指定我方其他角色发动偶像之吻";
    if (card?.crazyShooting) return "选择一张红色手牌，转化为机枪扫杀使用";
    if (card?.cadicisPlan) return "选择一张杀牌或战术牌作为作战计划，再点击使用";
    if (card?.armyOrder) return `选择2张花色完全相同的手牌当【魔王军入侵】使用；当前已选${(battle.selectedBagIndexes || []).length}张`;
    if (card?.elranaBag) return `选择任意张手牌弃置后摸等量牌；当前已选${(battle.selectedBagIndexes || []).length}张`;
    if (card?.mariaHonorBlessing) return `选择1至4张花色各不相同的手牌弃置；当前已选${(battle.selectedBagIndexes || []).length}张`;
    if (handChoice) return "选择一张手牌作为转化或消耗，再点击使用";
    if (card?.comboAttack) return battle.comboPartnerUid
      ? battle.pendingTargetUid
        ? "已指定配合角色与目标；再次点击使用，双方各视为使用一张虚拟杀（普攻）"
        : "已选择配合角色；请选择一名敌方角色作为共同攻击目标"
      : "先选择一名其他我方角色配合，再指定敌方目标共同出杀";
    if (card?.borrowSlash) return battle.comboPartnerUid
      ? "已选择出杀角色；请选择敌方目标，再次点击目标或确定发动"
      : "先选择我方其他一名角色作为出杀角色";
    if (card?.soulChain) return `选择${soulNeed}名敌方角色施加锁魂；当前已选${(battle.pendingTargetUids || []).length}名`;
    if (card?.mimicVoice) return "选择任意其他角色，再次点击目标或确定发动";
    if (card?.speedAssault) {
      return `${battle.phase === 6 ? "结束阶段" : "准备阶段"}：选择敌方角色发动神速之袭`;
    }
    if (card?.allyTarget) return "选择我方角色；双击或拖出手牌区可快速自疗";
    if (card?.targetless) return "点击使用自动指定自己的牌";
    if (card?.extract) return "选择我方男性角色，再次点击目标或确定发动";
    return "选择敌方目标，再次点击目标或确定使用";
  }

  function renderSkills({ battle, actor }, U) {
    const skills = U.skillsOf(actor).map((skill, index) => {
      if (skill.source !== "relic" && skill.source !== "derived") return "";
      const state = U.skillState(actor, skill, battle);
      return U.skillName(
        skill, index, state.usable, battle.selectedSkillCard?.name === skill.card?.name,
        false, false, state, actor
      );
    }).join("");
    return skills
      ? `<div class="hand-skills skill-list" title="装备或临时武器提供的技能显示在手牌区最左侧，鼠标悬停图标可查看详情。">${skills}</div>`
      : "";
  }

  function renderCards(context, U) {
    const { battle, actor, modes, picks, needDiscard, pickedCard, handChoice, canDiscardInPhase } = context;
    let visibleIndex = -1;
    return actor.hand.map((card, index) => {
      if (card._pendingDraw) return "";
      visibleIndex += 1;
      const canDiscard = canDiscardInPhase(card);
      const interactionIndex = modes.borrowChoice ? visibleIndex : index;
      const borrowLocked = modes.borrowChoice
        && !battle.handReveal.validIndexes?.includes(visibleIndex);
      const dimensionLocked = modes.dimensionTransfer && !["♠", "♣"].includes(card.suit);
      const newMoonFull = modes.share && !picks.shareSet.has(index)
        && picks.share.length >= battle.newMoonShare.count;
      const kaiichiFull = modes.kaiichiShare && !picks.kaiichiSet.has(index)
        && picks.kaiichi.length >= battle.kaiichiShare.maxCount;
      const shareFull = modes.millerShare && !picks.millerSet.has(index)
        && picks.miller.length >= needDiscard;
      const costLocked = handChoice
        && !BattleSystem.canSelectHandCost(actor, pickedCard, card, battle, index);
      const selected = battle.selectedCardIndex === index || battle.selectedCostCardIndex === index
        || modes.dimensionTransfer && battle.dimensionTransfer.costIndex === index
        || picks.discardSet.has(index) || picks.shareSet.has(index)
        || picks.kaiichiSet.has(index) || picks.millerSet.has(index)
        || (battle.selectedSkillCard?.elranaBag || battle.selectedSkillCard?.armyOrder
          || battle.selectedSkillCard?.mariaHonorBlessing)
          && (battle.selectedBagIndexes || []).includes(index);
      const normalLocked = !modes.dimensionTransfer && !modes.share && !modes.kaiichiShare
        && !modes.cadicisShare && !modes.borrowChoice && !modes.discard
        && (!modes.playable || modes.extractStart || modes.mimicStart || modes.speedStart
          || costLocked
          || !handChoice && !BattleSystem.canPlay(actor, card));
      return U.card(card, false, {
        index: interactionIndex, selected,
        discard: modes.discard && canDiscard && !shareFull, actor,
        disabled: battle.locked && !modes.transferLocked || dimensionLocked || newMoonFull
          || kaiichiFull || shareFull || borrowLocked
          || modes.discard && !canDiscard || normalLocked,
      });
    }).join("");
  }

  function phaseLabel({ modes }) {
    if (modes.borrowChoice) return "借刀杀人";
    if (modes.dimensionTransfer) return "次元转移";
    if (modes.kaiichiShare) return "半魅魔血";
    if (modes.cadicisShare) return "指挥官责任";
    if (modes.share) return "新月之歌";
    if (modes.millerShare) return "收获分享";
    if (modes.discard) return "弃牌阶段";
    if (modes.extractStart || modes.mimicStart || modes.speedStart) return "准备阶段";
    return modes.playable ? "出牌阶段" : "自动推进";
  }

  return { render };
})();
