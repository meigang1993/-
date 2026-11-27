// 角色牌存储区（三国杀「置于武将牌上 / 旁」= 移出游戏的存储牌）通用机制。
//
// 规则参考（2026-11-27 查询）：界徐盛【破军】——当你使用【杀】指定一个目标后，
// 你可以将其至多 X 张牌扣置于该角色的武将牌旁（X 为其体力值）；若如此做，
// 当前回合结束后，该角色获得这些牌。术语口径：(扣)置于武将牌上 / 旁的牌
// 都是移出游戏的牌，不为任何角色所拥有，不计入手牌上限，不能使用 / 打出 / 弃置；
// FAQ：被击倒时这些牌直接置入弃牌堆，装备牌返还时进手牌而非装备区。
// 本项目沿用魔刀阿波罗既有的「任意角色回合结束时返还」时机（与界徐盛
// 「当前回合结束时获得」近似），只把存储位置与语义统一到本模块；
// 以后新增「把牌放到角色牌上」的技能一律走这里，不再各自挂私有字段。
//
// 数据：unit.storedCards = [{ card, source, ownerUid, release, storedTurn }]
//   release: "anyTurnEnd" 任意角色回合结束返还 / "currentTurnEnd" 仅发动者回合结束
//            / "manual" 由技能显式调用 release 才返还。
window.BattleCharacterCardStorage = (() => {
  const ZONE = "characterCard";
  const alive = unit => !!unit && unit.hp > 0;
  const pendingRevival = unit =>
    !!window.SakuraRisaSkills?.pendingRevival?.(unit);

  function ensure(unit) {
    if (!unit) return [];
    if (!Array.isArray(unit.storedCards)) {
      // 旧档兼容：293 前【魔刀阿波罗】把扣置牌直接挂在 unit.nanaliSealed。
      // 读到旧字段时迁移成存储区条目，避免读档后牌永久消失。
      const legacy = Array.isArray(unit.nanaliSealed) ? unit.nanaliSealed : [];
      unit.storedCards = legacy.map(card => ({
        card, source: "魔刀阿波罗", ownerUid: unit.uid,
        release: "anyTurnEnd", storedTurn: null,
      }));
      if (legacy.length) unit.nanaliSealed = [];
    }
    return unit.storedCards;
  }
  const cardsOf = unit => ensure(unit).map(entry => entry.card);
  const count = unit => ensure(unit).length;
  const namesOf = cards => cards
    .map(card => `${card?.suit || ""}${card?.name || "牌"}`).join("、");

  // 把牌移出游戏、放到该角色的角色牌上。调用方负责先从手牌 / 装备区取出牌。
  function store(state, unit, cards, options = {}) {
    if (!unit || !Array.isArray(cards) || !cards.length) return [];
    const {
      source = "", ownerUid = null, release = "anyTurnEnd",
    } = options;
    const entries = ensure(unit);
    cards.forEach(card => entries.push({
      card, source, ownerUid, release,
      storedTurn: state?.battle?.turn ?? null,
    }));
    return cards;
  }

  function take(unit, predicate = () => true) {
    const entries = ensure(unit);
    const matched = entries.filter(predicate);
    if (!matched.length) return [];
    unit.storedCards = entries.filter(entry => !matched.includes(entry));
    return matched;
  }

  // 返还：按三国杀「获得这些牌」口径进入手牌（装备牌也不回装备区）。
  function release(state, unit, predicate = () => true, note = "回合结束") {
    if (!alive(unit) && !pendingRevival(unit)) return [];
    const matched = take(unit, predicate);
    if (!matched.length) return [];
    const cards = matched.map(entry => entry.card);
    const names = namesOf(cards);
    if (state?.battle?.animQueue) {
      cards.forEach(card => { card._pendingDraw = true; });
    }
    unit.hand ||= [];
    unit.hand.push(...cards);
    window.BattleCards?.syncStatusCards?.(unit);
    state?.battle?.animQueue?.push({
      type: "gainCards", uid: unit.uid, side: unit.side,
      fromZone: ZONE, count: cards.length, cards, stagger: 0,
    });
    window.BattleLog?.add?.(state,
      `${unit.name} 角色牌上的${cards.length}张存储牌（${names}）因${note}回到手中。`);
    return cards;
  }

  // 任意角色回合结束：返还所有 release=anyTurnEnd 的存储牌。
  // 被击倒者不返还（其存储牌在阵亡结算里直接置入弃牌堆）。
  function endTurn(state) {
    const b = state?.battle;
    if (!b) return 0;
    const units = (b.allies || []).concat(b.enemies || []);
    let total = 0;
    units.forEach(unit => {
      total += release(state, unit,
        entry => entry.release === "anyTurnEnd",
        "任意角色回合结束").length;
    });
    return total;
  }

  // 阵亡：按破军 FAQ，扣置于武将牌旁的牌直接置入弃牌堆，不回到手牌。
  function discardForDead(state, unit) {
    const matched = take(unit);
    if (!matched.length) return [];
    const cards = matched.map(entry => entry.card);
    const names = namesOf(cards);
    const b = state?.battle;
    if (window.BattleCards?.putMany) {
      window.BattleCards.putMany(b, unit, cards, "discard",
        { skipAfterHandLost: true });
    } else {
      cards.forEach(card => window.BattleCards?.put?.(b, unit, card,
        "discard", { skipAfterHandLost: true }));
    }
    window.BattleLog?.add?.(state,
      `${unit.name} 被击倒，其角色牌上的${cards.length}张存储牌（${names}）直接置入弃牌堆。`);
    return cards;
  }

  // 战斗收尾：清空所有存储区引用（牌已在阵亡分支入弃牌堆，或随战斗销毁）。
  function clear(state) {
    const b = state?.battle;
    if (!b) return 0;
    const units = (b.allies || []).concat(b.enemies || []);
    let total = 0;
    units.forEach(unit => {
      total += count(unit);
      unit.storedCards = [];
    });
    return total;
  }

  return {
    ZONE, ensure, cardsOf, count, namesOf,
    store, release, endTurn, discardForDead, clear,
  };
})();
