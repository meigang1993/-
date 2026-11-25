// 天日国鹰7研究所 · 4 只普通怪 AI 决策
// 只从 BattleAI.choose 的 characterMoves 最前面接管；返回 null 即交回既有默认 AI。
// 不改其它副本任何 AI 分支，也不改战斗结算链。
window.TenriInstituteAI = (() => {
  const IDS = ["tenri_assault", "tenri_guard", "tenri_railgun", "tenri_ghoul"];
  const isAi = (u, ai) => u?.ai === ai || u?.id === ai;
  const isTenri = u => IDS.some(id => isAi(u, id));
  const H = () => window.BattleAIHelpers;
  const U = () => window.CardUtils;

  // 【闪】及所有响应牌：防爆队要留着响应「守护后方」转移过来的单体杀，
  // 不能让 AI 主动打出或当费用消耗掉。
  const isDodgeCard = c => !!c && (c.name === "闪" || c.type === "response"
    || c.type === "status" || !!c.deflect);
  const chargeCard = hand => hand.find(c => c?.charge && !c.virtual
    && !c._skill && !c._pendingDraw);
  const groupCards = hand => hand.filter(c => {
    const u = U();
    return !!c && u?.isEntityCard?.(c)
      && (u.isGroupTargetCard(c) || !!c.demonInvasion);
  });

  // 防爆队：正常用牌，只在可打手牌里剥掉【闪】，其余交给默认 AI。
  function aiHand(actor, playable) {
    if (!isAi(actor, "tenri_guard")) return null;
    return (playable || []).filter(c => !isDodgeCard(c));
  }

  function aiMove(state, actor, team, foes, rawHand, canPlay, ctx) {
    if (!isTenri(actor) || !ctx || !H() || !U()) return null;
    const h = H(), u = U();
    const hand = (rawHand || []).filter(c => c && !c._pendingDraw
      && canPlay(actor, c));
    const aliveFoes = h.alive(foes || []);
    const charge = chargeCard(hand);

    // 1) 机械警卫突击队：优先蓄力，随后集中用【杀】打手牌数最少的敌人。
    if (isAi(actor, "tenri_assault")) {
      const allKills = hand.filter(c => u.isKillCard(c));
      const single = allKills.filter(c => u.isEntitySingleKill(c));
      const picks = single.length ? single : allKills;
      if (!picks.length) return null;
      // 只叠一层：蓄力可叠加，但全叠上去会挤掉「随后集中使用杀牌」。
      if (!actor.charge && charge) return { card: charge, target: actor };
      const target = h.topBy(aliveFoes, x => -h.visible(x) - x.hp / 1e6);
      const card = h.topBy(picks, c => ctx.slashScore(actor, c, target));
      return card && target ? { card, target } : null;
    }

    // 2) 机械警卫防爆队：不抢决策，正常使用卡牌（aiHand 已保留【闪】）。
    if (isAi(actor, "tenri_guard")) return null;

    // 3) 清理机器人：优先蓄力，随后优先【机枪扫杀】等全体攻击牌。
    if (isAi(actor, "tenri_railgun")) {
      const groups = groupCards(hand);
      if (!groups.length) return null;
      if (!actor.charge && charge) return { card: charge, target: actor };
      const card = h.topBy(groups, c =>
        (u.isKillCard(c) && c.sweep ? 100 : 0)
        + (c.demonInvasion ? 90 : 0)
        + (u.isGroupTargetCard(c) ? 30 : 0)
        + (c.power || 0));
      // targetless 群体牌：autoEnemy 会把 target 原样传给 useCard，
      // 传 actor 自身最安全（结算内部按「敌方全体」自取目标）。
      return card ? { card, target: actor } : null;
    }

    // 4) 无垢食尸鬼：悍不畏死，直接选最高伤害的【杀】输出，
    //    跳过治疗 / 防御 / 抽牌等所有保命战术（characterMoves 排在 tacticMove 之前）。
    if (isAi(actor, "tenri_ghoul")) {
      const slashes = hand.filter(c => u.isKillCard(c) && !c.virtual);
      if (!slashes.length) return null;
      const target = ctx.slashTarget?.(actor, foes, slashes)
        || h.targetByPolicy(foes);
      const card = h.topBy(slashes, c => ctx.slashScore(actor, c, target));
      return card && target ? { card, target } : null;
    }
    return null;
  }

  return { aiHand, aiMove, isTenri };
})();
