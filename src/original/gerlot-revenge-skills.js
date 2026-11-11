// 格洛特【复仇反击】【爆头一击】执行块（从 bertis-gerlot-skills.js 拆出，逐行搬迁）。
// 依赖：主文件把公共小工具在装配时注入，不复制定义，避免两处口径漂移。
window.GerlotRevengeSkills = ({ stat, virtualCard, alive, line, isKill, headshotCard }) => {
  function revengeSlash(state, api, source, target, times) {
    // 优先排入反应队列：受击方若带弹窗类受击技能（星野一【半魅魔血】交牌等），
    // 第一段即置 battle.locked，而 damage 首行在 locked 时直接返回 hpLoss 0
    // （battle-damage-lifecycle / resolution / utils 均有该分支）。
    // 原先的裸循环会把剩余段整段静默吞掉——既不报错也不写日志
    // （实测 times=2 只打出 1 段）。队列在解锁后才 flush，段因此不会丢失。
    const amount = stat(source, "attack");
    const actions = [];
    for (let i = 0; i < times; i += 1) {
      const action = window.BattleReactionQueue?.damageAction?.(
        source, target, amount, "复仇反击",
        virtualCard("杀（普攻）", { revengeCounter: true }));
      if (action) actions.push(action);
    }
    if (actions.length && window.BattleReactionQueue?.enqueue?.(state, actions)) {
      window.BattleReactionQueue.flush(state, api.damage);
      return;
    }
    for (let i = 0; i < times && alive(source) && alive(target); i++) api.damage(state, target, amount, "复仇反击", source, virtualCard("杀（普攻）", { revengeCounter: true }));
  }
  function resolveRevengeTrigger(state, source, target, times, api, skill = "复仇反击") {
    line(state, source, skill, target);
    revengeSlash(state, api, source, target, times);
  }
  function queueHeadshot(state, actor, target, amount, source, card, resume) {
    const b = state.battle, root = headshotCard(card);
    if (actor?.ref !== "gerlot" || !isKill(card)
      || root?.headshotDone || root?.headshotQueued || !b?.animQueue) return false;
    const judge = drawJudge(state, actor), success = !!judge?.suit && sameColor(judge.suit, root.suit);
    root.headshotQueued = true;
    root.headshotDone = true; root.headshotMultiplier = success ? 2 : 1; b.locked = true;
    line(state, actor, success ? "爆头成功" : "爆头失败");
    window.BattleLog.add(state, `${actor.name} 爆头一击判定：${judge?.suit || "?"}${judge?.name || "无牌"}，${success ? "伤害翻倍" : "未触发"}。`);
    b.animQueue.push({ type: "judgement", id: window.GameRandom.id("gh"), skill: "爆头一击", suit: judge.suit, name: judge.name, card: judge, discardTo: actor.discard, success, uid: actor.uid, runtimeRecovery: "restart", commit: () => { if (state.battle) state.battle.locked = false; resume?.(); } });
    return true;
  }
  function modifyIncomingDamage(state, actor, amount, card) {
    if (actor?.ref !== "gerlot" || !isKill(card)) return amount;
    return amount * (headshotCard(card)?.headshotMultiplier || 1);
  }
  function drawJudge(state, unit) {
    window.BattlePileStats?.reshuffle(unit, cards => window.GameRandom.shuffle(cards, state));
    const card = unit.deck.pop() || { suit: "?", name: "无牌" };
    if (card.suit !== "?" && !card._pendingDraw) unit.discard.push(card);
    return card;
  }
  const sameColor = (a, b) => !!a && !!b && (["♥", "♦"].includes(a) === ["♥", "♦"].includes(b));

  return { resolveRevengeTrigger, queueHeadshot, modifyIncomingDamage };
};
