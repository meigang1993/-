window.GameUIHandView = (() => {
  function render(context, U) {
    const { battle, actor, modes } = context;
    const controls = renderControls(context, U);
    const skillLine = renderSkills(context, U);
    const handCards = renderCards(context, U);
    const handWrap = `<div class="hand-scroll-wrap no-scroll"><button class="hand-scroll-btn left" data-hand-scroll="-1">‹</button><div class="hand active-hand" data-hand-owner="${U.esc(actor.uid)}">${handCards}</div><button class="hand-scroll-btn right" data-hand-scroll="1">›</button></div>`;
    const bubbleZone = actor.ref === "abe_karuna"
      && ((actor.bubbleCards?.length || 0) > 0 || modes.playable)
      ? window.AbeKarunaBubbleSkills?.render?.(actor, U) || "" : "";
    const intentMax = Math.min(99, Math.max(1, (actor.stats.bloodlust || 1) + (actor.intentMaxBonus || 0)));
    const charge = actor.charge
      ? `<span class="tag">蓄力×${Math.pow(2, actor.charge).toFixed(3).replace(/\.0+$/, "").replace(/0+$/, "")}</span>`
      : "";
    const skipTag = actor.skipPlayPhase
      ? `<span class="tag hand-skip-tag">${U.esc(actor.skipPlayReason || "状态牌")}：本回合跳过出牌阶段${actor.noResponse ? "，且无法使用或打出响应牌" : ""}</span>` : "";
    return `<div class="hand-panel ${battle.locked && !modes.transferLocked ? "locked" : ""}${actor.skipPlayPhase ? " play-locked" : ""}"><div class="hand-head"><b>${U.esc(actor.name)} 的手牌</b><span class="tag">${phaseLabel(context)}</span>${skipTag}<span class="tag">淫气 ${actor.intent || 0}/${intentMax}</span>${charge}${controls}</div>${window.Onboarding?.battleHint?.(context) || ""}<div class="hand-body ${skillLine ? "has-skills" : ""}">${skillLine}${handWrap}${bubbleZone}</div></div>`;
  }

  if (!window.GameUIHandControls) throw new Error("[ui-hand-controls] 模块未装配：ui-hand-controls.js 必须先于 ui-hand-view.js 加载");
  const { renderControls } = window.GameUIHandControls({ selectionTip });

  // 选中牌后的提示文案已拆到 ui-selection-tip.js（本文件此前已超 190 行）。
  // 取不到该模块时必须抛错：静默放行会让提示文案凭空消失，玩家无从判断下一步。
  function selectionTip(context) {
    const tipModule = window.UISelectionTip;
    if (!tipModule?.tip) throw new Error("[ui-selection-tip] 提示文案模块未装配："
      + "ui-selection-tip.js 必须先于 ui-hand-view.js 加载");
    return tipModule.tip(context);
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
      // 地雷状态牌虽然不能作为手牌打出，但在出牌阶段可点击发起猜拳 → 不置灰
      const rpsClickable = battle.phase === 4 && !battle.locked
        && window.BattleStatusCards?.keyOf?.(card) === "landmine";
      // 麻痹/眩晕/混乱（skipPlayPhase）：面板显示「本回合跳过出牌阶段」，
      // 但此前 disabled 判定不含此项，导致出牌阶段牌未置灰且可点选出牌。
      // 只作用于「自己的出牌阶段」——
      //   1) 弃牌阶段的弃牌是被动操作，不该被状态牌挡住；
      //   2) 借刀杀人/次元转移/半魅魔血/指挥官责任等模式下，底部手牌区展示的
      //      是「另一名角色」的手牌（handReveal.targetUid 等）。此时若那名角色
      //      被控住，本判定会把他的全部手牌置灰，而这类弹窗是强制选择
      //      （resolveHandReveal 对 mandatory 模式不允许直接关闭），
      //      结果就是无牌可点、弹窗永远关不掉 → 战斗卡死。
      const skipLocked = !!modes.playable && !!actor.skipPlayPhase
        && !modes.transferLocked && !modes.millerShare && !modes.share;
      const normalLocked = !rpsClickable
        && !modes.dimensionTransfer && !modes.share && !modes.kaiichiShare
        && !modes.cadicisShare && !modes.borrowChoice && !modes.discard
        && (!modes.playable || modes.extractStart || modes.mimicStart || modes.speedStart
          || costLocked
          || !handChoice && !BattleSystem.canPlay(actor, card));
      // 霹雳之锤挂起时 battle.locked 为真，而发动锤子的唯一交互就是点击一张
      // 手牌弃置。若沿用「locked 一律置灰」，提示照常显示、手牌却全部灰掉
      // 且点不动——即玩家反馈的「灰屏不能动」。锤子模式下必须保留可点态。
      return U.card(card, false, {
        index: interactionIndex, selected,
        discard: modes.discard && canDiscard && !shareFull, actor,
        disabled: battle.locked && !modes.transferLocked && !modes.hammer
          && !modes.karunaBubble
          || dimensionLocked || newMoonFull
          || kaiichiFull || shareFull || borrowLocked
          || modes.discard && !canDiscard || normalLocked || skipLocked,
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
    if (modes.discard) return modes.charmDiscard ? "淫气改造弃牌" : "弃牌阶段";
    if (modes.extractStart || modes.mimicStart || modes.speedStart) return "准备阶段";
    return modes.playable ? "出牌阶段" : "自动推进";
  }

  return { render };
})();
