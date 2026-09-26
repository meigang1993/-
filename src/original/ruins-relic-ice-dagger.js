// 冰心双刺剑（被动）独立模块。
// 从 ruins-relic-effects.js 拆出：该文件加入「离手还原」后超过 200 行硬约束。
// 两条规则：① 获得实体单体【杀】即转换为【刺杀】；② 该牌离开手牌区即还原为原牌。
window.RuinsRelicIceDagger = (() => {
  const log = (state, text) => window.BattleLog?.add?.(state, text);

  // 获得的实体单体【杀】牌转换为【刺杀】，且不消耗杀意。
  // 口径是「获得」而非「摸到」：影舞步判定收牌、其他角色交牌、偷牌都算获得，
  // 只挂 afterDraw 会把这几类漏掉。
  // 只认实体牌：虚拟【杀】由技能生成，若一并转换会把技能产物当成手牌资源。
  function convertIceDaggers(state, unit, cards) {
    if (!window.RelicSystem?.hasEquipped?.(state, unit, "冰心双刺剑")) return 0;
    const hand = unit?.hand;
    if (!Array.isArray(cards) || !cards.length || !Array.isArray(hand)) return 0;
    let count = 0;
    cards.forEach(card => {
      if (!card || card.virtual || card._skill || card._iceDagger) return;
      if (!window.CardUtils?.isSingleKill?.(card)) return;
      const index = hand.indexOf(card);
      if (index < 0) return;
      // 原牌快照必须在就地改写之前保存：改写会清空全部原字段，
      // 只凭 convertedFrom（牌名）无法还原 suit 之外的模板差异与临时标记。
      const snapshot = { ...card };
      const converted = window.CardUtils.convertAs("刺杀", card, {
        noIntentCost: true, convertedFrom: card.name, _iceDagger: true,
        _revertSnapshot: snapshot,
        // 影舞步等技能产物带 temporary/void；convertAs 以【刺杀】模板重建，
        // 不补回会让"本回合临时牌"变成永久手牌。
        ...(card.temporary ? { temporary: true } : {}),
        ...(card.void ? { void: true } : {}),
      });
      // convertAs 走 clean()，会剥掉飞行中的标记；不补回会让牌瞬间出现在
      // 手牌里而不是飞入，与摸牌动画脱节。
      if (card._pendingDraw) converted._pendingDraw = true;
      // 就地改写而非替换对象：转牌动画事件仍持有原牌对象引用，
      // 落到手牌后若换成新对象，syncIncomingHand 的 hand.includes(card)
      // 会判定为 false，手牌数显示就不再增加。
      Object.keys(card).forEach(key => { delete card[key]; });
      Object.assign(card, converted);
      count += 1;
    });
    if (count) {
      window.BattleLines?.skill?.(state, unit, "冰心双刺剑");
      log(state, `${unit.name} 的冰心双刺剑触发，${count}张实体单体【杀】转换为不消耗杀意的【刺杀】。`);
    }
    return count;
  }

  // 卡牌飞行动画落位后的统一入口：三类「获得」路径都走这里，故都能触发冰心双刺剑：
  //   gainCards —— 技能获得（影舞步判定收牌等），获得者是 event.uid
  //   giveCards —— 其他角色交牌（贡献计划/责任/分享等），获得者是 event.toUid
  //   stealCard —— 偷牌（偷窃/吸魔杀/勾爪陷阱等），获得者是 event.toUid
  // 挂在动画落位后而非入队时：落位瞬间 _pendingDraw 才被清除，此时改写牌面
  // 才不会让玩家看到"飞行中是【杀】、落地后仍显示【杀】"的割裂。
  const LANDED_GAIN_TYPES = { gainCards: "uid", giveCards: "toUid", stealCard: "toUid" };
  function afterCardsLanded(event) {
    const state = window.state;
    const battle = state?.battle;
    const type = event?.type;
    const uidKey = LANDED_GAIN_TYPES[type];
    if (!battle || !uidKey) return 0;
    const uid = event[uidKey];
    if (!uid) return 0;
    const unit = (battle.allies || []).concat(battle.enemies || [])
      .find(item => item.uid === uid);
    if (!unit) return 0;
    // 交牌/偷牌的牌来自他人手牌：离开原持有者手牌区即应还原为原牌，
    // 再按获得者的饰品决定是否重新转换。米勒【收获分享】走的正是这条路径——
    // 若不还原，米勒手里的【刺杀】会原样交到队友手上（队友无饰品也仍是刺杀）。
    // gainCards（影舞步等判定收牌）来源是牌堆/判定区，无快照，还原为空操作。
    const cards = event.cards || [];
    if (type !== "gainCards") {
      cards.forEach(card => window.CardUtils?.revertConverted?.(card));
    }
    return convertIceDaggers(state, unit, cards);
  }

  return { convertIceDaggers, afterCardsLanded };
})();
