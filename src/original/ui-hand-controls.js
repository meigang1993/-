// 手牌区控件（各模式提示与按钮）：从 ui-hand-view.js 拆出，保持对外行为完全一致。
// selectionTip 由主文件注入，加载期零副作用；缺文件时主文件显式抛错。
window.GameUIHandControls = ({ selectionTip }) => {
  function renderControls(context, U) {
    const { battle, actor, modes, picks, needDiscard, pickedCard, picked, ready, disabled } = context;
    if (modes.borrowChoice) {
      const useSlash = battle.handReveal.mode === "borrowSlashChoice";
      return `<span class="discard-prompt">借刀杀人：从${U.esc(actor.name)}的手牌区选择${useSlash ? "实际使用的单体杀牌" : "要获得的1张手牌"}。</span>`;
    }
    if (modes.ailengDrill) {
      return `<span class="discard-prompt">战斗演练：${U.esc(actor.name)}使用了${U.esc(battle.ailengDrillPicker?.card?.name || "卡牌")}，点击一名队友将这张牌交给TA。</span><button data-aileng-drill-skip="1">不交</button>`;
    }
    if (modes.catherineSteal) {
      const victim = battle.allies.concat(battle.enemies)
        .find(unit => unit.uid === battle.catherineStealPicker?.targetUid);
      return `<span class="discard-prompt">窃取：已指定${U.esc(victim?.name || "敌方角色")}，请点击一名我方角色接收其手牌。</span><button data-catherine-receiver-skip="1">放弃</button>`;
    }
    if (modes.mieryulaBloodthirst) {
      return `<span class="discard-prompt">渴血杀戮：已选择${U.esc(battle.mieryulaBloodthirstPicker?.cardName || "杀牌")}，请点击一名敌方角色，视为使用一张该牌名的虚拟牌（不消耗淫气）。</span><button data-mieryula-skip="1">不发动</button>`;
    }
    if (modes.wendyTutor) {
      return `<span class="discard-prompt">解答迷惑：已选择${U.esc(battle.wendyTutorPicker?.cardName || "战术牌")}，点击一名队友交给TA，或点击${U.esc(actor.name)}自己加入其手牌。</span>`;
    }
    if (modes.dimensionTransfer) {
      const pickedCost = battle.dimensionTransfer?.costIndex != null;
      // 非锁定技：玩家必须能明确选择「不发动」。按钮与提示文案都写明后果，
      // 避免原来只写「放弃发动」时被当成选牌流程中的取消操作。
      return `<span class="discard-prompt">次元转移：${pickedCost ? "已选择黑色牌，请点击一名敌方角色承受本次伤害" : "请先从手牌中选择1张黑色牌"}；也可跳过（不发动），本次伤害仍由原目标承受。</span><button data-dimension-transfer-skip="1" title="不发动次元转移，本次伤害仍由原目标承受">跳过（不发动）</button>`;
    }
    if (modes.kaiichiShare) {
      return `<span class="discard-prompt">半魅魔血：已选${picks.kaiichi.length}/${battle.kaiichiShare.maxCount}张，选择至多3张后点击一名队友一次性交出。</span><button data-kaiichi-share-skip="1">不交</button>`;
    }
    if (modes.cadicisShare) {
      return `<span class="discard-prompt">指挥官责任：点击${U.esc(actor.name)}的一张手牌交给目标，还需交出${battle.cadicisResponsibility.remaining || 1}张。</span><button data-cadicis-responsibility-skip="1">不交</button>`;
    }
    if (modes.share) {
      return `<span class="discard-prompt">新月之歌：已选${picks.share.length}/${battle.newMoonShare.count}张，选满后点击一名其他我方角色交出，或不交。</span><button data-new-moon-skip="1">不交</button>`;
    }
    if (modes.millerShare) {
      return `<span class="discard-prompt">收获分享：已选${picks.miller.length}/${needDiscard}张，点队友交出，或直接弃置。</span><button data-miller-discard="1" ${picks.miller.length ? "" : "disabled"}>直接弃置</button>`;
    }
    if (modes.gerdaComfort) {
      return `<span class="discard-prompt">萌虎慰劳：点击一名其他队友，双方各摸2张牌；也可以放弃。</span><button data-gerda-comfort-skip="1">放弃</button>`;
    }
    if (modes.karunaBubble) {
      const name = U.esc(battle.karunaBubble?.card?.name || "牌");
      return `<span class="discard-prompt">记忆泡泡：将刚使用的${name}放入泡泡手牌区？</span><button data-karuna-bubble-store="1">放入</button><button class="ghost" data-karuna-bubble-skip="1">放弃</button>`;
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
  return { renderControls };
};
