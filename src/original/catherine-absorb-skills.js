// 凯瑟琳【知识吸收】：从 catherine-skills.js 拆出，保持对外行为完全一致。
// 零加载期依赖，所需工具函数全部由主文件注入；缺文件时主文件显式抛错。
window.CatherineAbsorbSkills = ({
  allUnits, alive, isCatherine, hasSkill, isTactic, line, syncMagic,
}) => {
  function takeUsedCard(actor, card) {
    if (card.virtual || card._skipHandMove || card.void
      || card.copiedByEdis || card.temporary) return null;
    const entity = card._entitySourceCard || card;
    const zone = actor.pileStats || actor;
    for (const pile of ["discard", "consumed"]) {
      const index = zone?.[pile]?.indexOf(entity) ?? -1;
      if (index >= 0) return zone[pile].splice(index, 1)[0];
    }
    return null;
  }
  function afterCardPlayed(state, actor, card) {
    const battle = state?.battle;
    if (!battle || !actor || !card || !isTactic(card)) return;
    // 排除 actor 本人：否则凯瑟琳自己使用战术牌后，会把该牌从弃牌堆取回自己手上，
    // 等于同一张战术牌可无限重复使用（手牌数不变、魔力恒定），直接破坏牌库循环。
    // 只回收「友方角色」用过的牌：技能描述限定为友方，敌方使用的战术牌不再回收。
    allUnits(battle)
      .filter(unit => isCatherine(unit) && alive(unit) && hasSkill(unit, "知识吸收")
        && unit?.uid !== actor?.uid && unit?.side === actor?.side)
      .forEach(unit => {
        const gained = takeUsedCard(actor, card);
        if (!gained) return;
        // 回收的是队友用过的牌，弃置时须回到该队友牌堆，否则等于把队友的牌转成自己的。
        // 但若该牌本就是队友从敌方夺来的（已有 stolenFromUid 指向敌方），必须保留原归属：
        // 友方只是临时持有，牌仍属敌方阵营，凯瑟琳弃置时要回到敌方牌堆，不能洗成友方的。
        if (!gained.stolenFromUid) gained.stolenFromUid = actor.uid;
        if (battle.animQueue) gained._pendingDraw = true;
        unit.hand.push(gained);
        window.BattleCards?.syncStatusCards?.(unit);
        battle.animQueue?.push({
          type: "gainCards", uid: unit.uid, side: unit.side,
          fromUid: actor.uid, fromSide: actor.side,
          cards: [gained], count: 1,
        });
        line(state, unit, "知识吸收");
        window.BattleLog.add(state,
          `${unit.name} 的知识吸收触发，获得${actor.name}使用过的实体【${gained.name}】。`);
        syncMagic(state, unit);
      });
  }
  return { afterCardPlayed };
};
