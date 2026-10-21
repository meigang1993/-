// 手牌区选中牌后的提示文案（selectionTip）。
//
// 从 ui-hand-view.js 拆出：原文件已超过 190 行，而本函数是纯文案映射——
// 只读取传入的 context，不访问任何模块级状态，因此可以独立成文件。
//
// 拆分的两条硬约束（与其他被拆模块同口径）：
//   1) 必须排在 ui-hand-view.js 之前加载（顺序即装配依赖）；
//   2) 消费方取不到本模块时要抛错，不能静默放行——静默会让提示文案凭空消失。
window.UISelectionTip = (() => {
  function tip({ battle, pickedCard: card, soulNeed, handChoice }) {
    if (card?.demonPoker) return "选择一张非战术牌和一名敌方目标，随机转化为拉芙战术牌使用";
    if (card?.elranaHeal) return "选择一张手牌弃置，再指定我方角色发动回春之手";
    if (card?.idolKiss) return "选择一张♥红桃手牌，再指定我方其他角色发动偶像之吻";
    if (card?.crazyShooting) return "选择一张红色手牌，转化为机枪扫杀使用";
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
    // 渴血杀戮虽然带 allyTarget，但只认我方男性且不能选自己，
    // 若沿用通用 allyTarget 文案会误导玩家（还会出现与自疗无关的提示）。
    if (card?.mieryulaBloodthirst) return "选择我方一名男性角色，对其造成等同于你攻击力的伤害；之后选择一项“杀”牌牌名";
    if (card?.allyTarget) return "选择我方角色；双击或拖出手牌区可快速自疗";
    if (card?.targetless) return "点击使用自动指定自己的牌";
    if (card?.extract) return "选择我方男性角色，再次点击目标或确定发动";
    return "选择敌方目标，再次点击目标或确定使用";
  }

  return { tip };
})();
