// 废墟沙城 · 贵族军士兵【放置地雷】与地雷工具（landmineOf / consumeLandmine）
// 拆分自 ruins-grunt-skills.js（原文件 350 行，超出 200 行硬约束）；
// 猜拳小游戏已再拆至 ruins-grunt-rps.js（本文件曾逼近 200 行上限）。
// 对外仍经 window.RuinsGruntSkills 转发，调用方无需改动。
window.RuinsGruntLandmine = (() => {
  // 惰性解析：bundle 内文件顺序与测试脚本的 vm 加载顺序都可能变化，
  // 直接取值会在顺序颠倒时静默拿到 undefined（技能全哑），Proxy 可规避。
  const C = new Proxy({}, { get: (_, key) => window.RuinsGruntCommon?.[key] });

  function landmineMove(state, actor) {
    if (actor?.ai !== "ruins_soldier" || actor.usedRuinsLandmine) return null;
    const targets = C.alive(state.battle.allies).filter(unit => C.visible(unit).length);
    if (!targets.length) return null;
    // 目标选择：响应牌最多者优先；数量相同时血量低者优先。
    // 不设「目标须持有响应牌」的限制：地雷持续存在，等对方之后摸到闪时仍会触发。
    const target = targets.sort((left, right) =>
      C.visible(right).filter(C.isResponse).length
      - C.visible(left).filter(C.isResponse).length || left.hp - right.hp)[0];
    return { card: { name: "放置地雷", _skill: true, ruinsPlaceLandmine: true }, target };
  }

  function usePlaceLandmine(state, actor, target) {
    // 出牌阶段限一次：AI 决策入口（landmineMove）已校验，但技能卡还可通过
    // useSkillCard 直接打出，该路径不经过决策校验。守卫放在这里才对任何调用路径生效。
    if (actor?.usedRuinsLandmine) return false;
    actor.usedRuinsLandmine = true;
    // 实现（对齐 baseline）：弃置自己一张非状态牌，在目标手牌区【新增】一颗地雷（目标手牌数 +1）
    const fodder = C.visible(actor).find(card => !C.isStatus(card));
    if (fodder) {
      const index = actor.hand.indexOf(fodder);
      if (index >= 0) actor.hand.splice(index, 1);
      window.BattleCards?.put?.(state.battle, actor, fodder, "discard", { showDiscard: true });
    }
    const landmine = window.BattleStatusCardRegistry?.create?.("landmine", actor);
    if (landmine) window.BattleStatusCards?.add?.(state, target, landmine, actor.name);
    window.BattleLines?.skill?.(state, actor, "放置地雷", target);
    C.log(state, `${actor.name} 对${target.name}发动放置地雷，在其手牌区埋设一颗地雷。`);
    return true;
  }

  // ---------- 地雷：查询与消耗（猜拳小游戏经 window.RuinsGruntRPS 调用） ----------
  function landmineOf(unit) {
    return (unit?.hand || []).find(card =>
      window.BattleStatusCardRegistry?.keyOf?.(card) === "landmine");
  }

  function consumeLandmine(state, holder) {
    const mine = landmineOf(holder);
    if (!mine) return null;
    const index = holder.hand.indexOf(mine);
    if (index >= 0) holder.hand.splice(index, 1);
    window.BattleCards?.put?.(state.battle, holder, mine, "consumed");
    return mine;
  }

  return {
    landmineMove, usePlaceLandmine, landmineOf, consumeLandmine,
  };
})();
