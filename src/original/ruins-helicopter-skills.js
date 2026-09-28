// 武装直升机技能（废墟沙城精英）
// 从 ruins-elite-skills.js 拆出：主文件超 200 行硬约束。
// 注意：alive / visible / isSlash / log 与主文件各持一份，语义必须保持一致，
// 不可单方面修改（否则两处行为会分叉）。
window.RuinsHelicopterSkills = (() => {
  const alive = units => (units || []).filter(unit => unit.hp > 0);
  const visible = unit => (unit?.hand || []).filter(card => !card._pendingDraw);
  const isSlash = card => window.CardUtils?.isKillCard?.(card) || card?.type === "slash";
  const log = (state, text) => window.BattleLog?.add?.(state, text);

  // 战场扫射（⚔️）：将 2 张同花色牌当做【机枪扫杀】使用，不消耗杀意。
  // 产物必须以实体牌【机枪扫杀】为模板（CardUtils.fromEntity），不能手搓：
  // 手搓的牌没有 type:"slash" 也没有 scale，攻击流程的 attacks 判定不成立，
  // 实测打出后伤害恒为 0；同时缺 allTargets / aoeLineShown，不绘制全体目标线，
  // isGroupTargetCard 判 false，群体牌相关判定全失效。
  // 战场扫射无「每回合限一次」约束：只要有 2 张同花色牌就能发动，一回合内可多次发动。
  // 不会无限循环——每次发动 splice 掉 2 张手牌，手牌耗尽后 sweepPair 返回 null 自然退出。
  function helicopterMove(state, actor) {
    if (actor?.ai !== "ruins_helicopter") return null;
    const pair = sweepPair(actor);
    if (!pair) return null;
    const targets = alive(state.battle.allies);
    const target = targets[0];
    if (!target) return null;
    pair.map(item => item.index).sort((a, b) => b - a)
      .forEach(index => actor.hand.splice(index, 1));
    // 代价牌按原身份入弃牌堆（就地改写会污染牌库，见冰心双刺剑的离手还原说明）
    pair.forEach(item => window.BattleCards?.put?.(state.battle, actor, item.card, "discard", { skipAnim: true }));
    const card = window.CardUtils?.fromEntity?.("机枪扫杀", {
      allTargets: targets.map(unit => unit.uid),
      aoeLineShown: true,
      responseKind: "dodge",
      noIntentCost: true,
      ruinsSweep: true,
      generatedBySkill: "战场扫射",
    }) || { name: "机枪扫杀", type: "slash", sweep: true, targetless: true, scale: "attack", noIntentCost: true };
    window.BattleLines?.skill?.(state, actor, "战场扫射", target);
    log(state, `${actor.name} 发动战场扫射，将2张同花色牌当做【机枪扫杀】使用。`);
    return { card, target };
  }

  function sweepPair(actor) {
    const groups = {};
    visible(actor).forEach((card, index) => {
      if (["♥", "♦", "♠", "♣"].includes(card.suit)) {
        (groups[card.suit] ||= []).push({ card, index });
      }
    });
    return Object.values(groups).filter(list => list.length >= 2)
      .map(list => list.slice(0, 2))[0] || null;
  }

  // 继续压制（锁定技）：使用的【杀】被【闪】抵消时摸 1 张牌。
  function afterDodged(state, actor, target, card) {
    if (actor?.ai !== "ruins_helicopter") return;
    if (!isSlash(card)) return;
    actor.ruinsSuppressDraws = (actor.ruinsSuppressDraws || 0) + 1;
    window.BattlePileStats?.reshuffle(actor);
    const drawn = actor.deck?.pop();
    if (drawn) {
      if (state.battle?.animQueue) drawn._pendingDraw = true;
      actor.hand.push(drawn);
      state.battle?.animQueue?.push({ type: "gainCards", uid: actor.uid, side: actor.side, count: 1, cards: [drawn] });
      window.BattleLines?.skill?.(state, actor, "继续压制");
      log(state, `${actor.name} 的继续压制触发，摸1张牌。`);
      // 这里原本只手动 push 手牌，不经过 draw()，因此 afterDraw 不会被调用：
      // 英雄级直升机自带【螺旋桨】时，继续压制摸到的牌不会触发螺旋桨（实测零触发）。
      // 补一次 afterDraw 让「获得/摸到牌」类饰品（螺旋桨、冰心双刺剑）照常结算；
      // 第 4 个参数 draw 传 null：物资货物需要它为队友发牌，此处仅本人摸 1 张，
      // 传 null 时 triggerSupplyCargo 内部会因非函数直接返回，不会误发牌。
      window.RuinsRelicEffects?.afterDraw?.(state, actor, [drawn], null);
    }
  }

  return { helicopterMove, afterDodged, sweepPair };
})();
