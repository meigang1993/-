/* 【盖亚妮丝护符】锁定技：障碍牌与状态牌对持有者无效；
   当其他角色对持有者使用障碍牌时，持有者摸一张牌。
   一技能一文件：本模块只负责「无效化」与「摸牌」，不参与伤害计算。 */
window.GaianisAmuletSkills = (() => {
  const NAME = "盖亚妮丝护符";

  const holds = (state, unit) => !!(unit
    && window.RelicSystem?.hasEquipped?.(state, unit, NAME));

  // 状态牌对持有者无效：不入手牌，直接进消耗区。返回 true 表示已处理，
  // 调用方（BattleStatusCardStorage.add）不得再 push 到 hand。
  function nullifyStatus(state, holder, card, source = "") {
    if (!holds(state, holder) || !card) return false;
    const registry = window.BattleStatusCardRegistry;
    if (registry?.isStatus && !registry.isStatus(card)) return false;
    window.BattleCards?.put?.(state.battle, holder, card, "consumed");
    window.BattleLog?.add?.(state,
      `${holder.name} 的${NAME}令${card.name || "状态牌"}状态牌无效${source ? `（${source}）` : ""}。`);
    return true;
  }

  // 障碍牌对持有者无效：拦在「生成状态牌」之前。
  // 由其他角色使用时，持有者摸一张牌；自己使用（理论上不可选己方）不摸。
  // 「其他角色」按 uid 判定：副本对象（同 uid）仍算自己，避免误摸牌。
  function resolveObstacle(state, actor, target, sourceCard, draw) {
    if (!holds(state, target)) return false;
    const name = sourceCard?.name || "障碍牌";
    let drawText = "";
    const sameUnit = actor === target
      || (actor?.uid != null && target?.uid != null && actor.uid === target.uid);
    if (actor && !sameUnit) {
      const before = (target.hand || []).length;
      let drawn = null;
      if (typeof draw === "function") drawn = draw(target, 1, state.battle);
      // 按「实际到手数」写文案：牌堆耗尽 / 封魔 / 被吸魔邪眼转交时，
      // 抽出的张数不等于到手张数，直接用 action() 会谎报「摸1张牌」。
      const gained = Math.max(0, (target.hand || []).length - before);
      const fb = window.BattleDrawFeedback;
      const sig = fb?.signal?.(drawn, target, 1, gained);
      const shortage = fb?.shortage?.(sig) || "本次摸牌未到手";
      drawText = `，${gained > 0 ? `摸${gained}张牌` : `未能摸牌（${shortage}）`}`;
    }
    window.BattleLog?.add?.(state,
      `${target.name} 的${NAME}令${actor?.name || "对方"}使用的${name}无效${drawText}。`);
    return true;
  }

  // 判定层兜底：异常注入 / 存档残留的状态牌同样不生效，直接消耗。
  function suppressJudgement(state, unit, card) {
    if (!holds(state, unit) || !card) return false;
    // 与 nullifyStatus 同一口径：状态牌只是「无效并进消耗区」，不是被强制弃置。
    // 传 forced=true 会走 showForcedDiscard，往出牌区写一张「被弃置」快照。
    window.BattleStatusCardStorage?.consumeRemoved?.(state, unit, card, false);
    window.BattleLog?.add?.(state,
      `${unit.name} 的${NAME}令${card.name}判定无效。`);
    return true;
  }

  return { NAME, holds, nullifyStatus, resolveObstacle, suppressJudgement };
})();
