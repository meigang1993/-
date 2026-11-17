// 玛利亚【荣誉祝福】与花色衰减：从 artina-maria-skills.js 拆出，保持对外行为完全一致。
// 依赖 line / alive 由主文件注入，加载期零副作用；缺文件时主文件显式抛错。
window.MariaHonorBlessing = ({ line, alive }) => {
  function honorBlessing(state, actor, card) {
    const indexes = [...new Set(card?._bagIndexes || state.battle.selectedBagIndexes || [])]
      .filter(index => actor.hand[index] && !actor.hand[index]._pendingDraw)
      .sort((a, b) => b - a);
    if (!indexes.length || indexes.length > 4
      || new Set(indexes.map(index => actor.hand[index].suit)).size !== indexes.length) return false;
    const discarded = indexes.map(index => actor.hand.splice(index, 1)[0]);
    discarded.forEach(item => window.BattleCards?.put?.(
      state.battle, actor, item, "discard", { showDiscard: true }));
    const suitList = discarded.map(item => item.suit);
    // 加成基于玛利亚的「当前」属性（stats + 神数咒语等临时加成），与属性面板
    // 显示的数字一致；减掉上一次祝福的 bonus 可避免连续施放重复计入、无限膨胀。
    // 速度没有临时加成，仍只取 stats。
    const self = actor.mariaBlessing;
    const curAttack = (actor.stats?.attack || 0) + (actor.tempAttack || 0);
    const curMagic = (actor.stats?.magic || 0) + (actor.tempMagic || 0);
    const bonus = { attack: curAttack - (self?.attack || 0),
      magic: curMagic - (self?.magic || 0),
      speed: (actor.stats?.speed || 0) - (self?.speed || 0) };
    (state.battle.allies || []).filter(alive).forEach(unit => {
      const previous = unit.mariaBlessing;
      if (previous) {
        unit.stats.attack = (unit.stats.attack || 0) - previous.attack;
        unit.stats.magic = (unit.stats.magic || 0) - previous.magic;
        unit.stats.speed = (unit.stats.speed || 0) - previous.speed;
      }
      unit.mariaBlessing = { ...bonus };
      // 全队（含玛利亚）都显示本次弃置的花色：每回合消失一个，
      // 花色全部消失时该角色的属性提升同步失效。
      unit.mariaBlessingSuits = suitList.slice();
      unit.stats.attack = (unit.stats.attack || 0) + bonus.attack;
      unit.stats.magic = (unit.stats.magic || 0) + bonus.magic;
      unit.stats.speed = (unit.stats.speed || 0) + bonus.speed;
    });
    actor.usedMariaHonorBlessing = true;
    line(state, actor, "荣誉祝福");
    return true;
  }
  // 荣誉祝福的持续由「弃置花色」决定：每回合结束全队同步消失一个花色，
  // 花色全部消失时，该角色的属性提升随之失效。
  function decayBlessing(unit) {
    if (!unit?.mariaBlessing) return;
    const suits = Array.isArray(unit.mariaBlessingSuits) ? unit.mariaBlessingSuits : [];
    suits.shift();
    unit.mariaBlessingSuits = suits;
    if (suits.length) return;
    unit.stats.attack = (unit.stats.attack || 0) - unit.mariaBlessing.attack;
    unit.stats.magic = (unit.stats.magic || 0) - unit.mariaBlessing.magic;
    unit.stats.speed = (unit.stats.speed || 0) - unit.mariaBlessing.speed;
    delete unit.mariaBlessing;
    // 保留空数组而非删除：UI 徽章与出牌校验都直接读 length，避免读到 undefined。
  }
  return { honorBlessing, decayBlessing };
};
