// 机械AI龙 · 机尾机枪（全体结算）
// 从 ruins-dragon-skills.js 拆出：主文件 185 行逼近 189 行硬约束，且 fireTailGun
// 是边界完整的独立函数（只依赖 alive/stat/log 三个无状态 helper）。
// 装配点在主文件显式 throw，本文件必须先于主文件加载（见 check-split-assembly.js）。
window.RuinsDragonTailGun = (() => {
  const alive = units => (units || []).filter(unit => unit.hp > 0);
  const stat = (unit, key) => (unit.stats?.[key] || 0)
    + (key === "attack" ? unit.tempAttack || 0 : 0);
  const log = (state, text) => window.BattleLog?.add?.(state, text);

  function fireTailGun(state, dragon, damage) {
    const targets = alive(state.battle.allies);
    if (!targets.length) return;
    const amount = stat(dragon, "attack");
    // 描述为「视为使用一张虚拟【机枪扫杀】」：必须以实体牌【机枪扫杀】为模板建虚拟牌，
    // 才能继承 type:"slash" / sweep:true / targetless:true / scale:"attack" 等原牌字段。
    // 此前是手搓 { name:"机尾机枪", type:"skill" }，既不是杀牌，也没有 allTargets /
    // aoeLineShown，导致：①不绘制全体目标线；②isGroupTargetCard 判 false，群体牌
    // 相关判定（群体响应口径、群体触发、目标线渲染）全部失效。
    // responseKind:"dodge" 保留：真正的【机枪扫杀】靠它才进响应判定，可被【闪】响应。
    const card = window.CardUtils.fromEntity("机枪扫杀", {
      allTargets: targets.map(unit => unit.uid),
      aoeLineShown: true,
      responseKind: "dodge",
      // 本牌是技能生成的虚拟牌，不走普通出牌的暴击表现。
      // 改成以【机枪扫杀】为模板后 isKillCard 成立、攻击力 13 ≥ 5，
      // 会命中 battle-damage-hit 的 critical 判定，飘字被放大 1.3 倍并加粒子，
      // 与「锁定技造成技能伤害」的定位不符（数值不变，纯视觉副作用）。
      skipCriticalFx: true,
    });
    let dealt = 0;
    window.BattleLines?.skill?.(state, dragon, "机尾机枪");
    // 全体目标线：与无限暗刃（edis-skills）同一范式，推 virtualPlay 动画。
    state.battle.tailGunSeq = (state.battle.tailGunSeq || 0) + 1;
    state.battle.animQueue?.push({
      type: "virtualPlay", id: `tailgun${state.battle.tailGunSeq}`, uid: dragon.uid,
      targetUids: card.allTargets, card, enemyLine: dragon.side === "enemy", show: true,
    });
    // 受击弹窗（半魅魔血交牌 / 手动响应等）会置 battle.locked，而 damage 入口在
    // locked 时直接返回 0：裸 forEach 会把后续目标的伤害整段静默吞掉（实测 4 人
    // 只掉第 1 人）。与狂热机枪 / 鲨影鱼雷 / 自爆倒计时同范式，先把全体目标动作
    // 排进反应队列；挂起解除后由 resumeInterruptedActions 继续 flush，全部结算到。
    const actions = targets.map(target => ({
      kind: "damage", actorUid: dragon.uid, targetUid: target.uid, amount,
      source: "机尾机枪", card: { ...card }, tailGunArmor: true,
    }));
    if (actions.length && window.BattleReactionQueue?.enqueue?.(state, actions)) {
      window.BattleReactionQueue.flush(state, damage);
    } else {
      // 兜底：队列模块缺失时沿用直接调用（保持旧行为）
      targets.forEach(target => {
        const result = damage(state, target, amount, "机尾机枪", dragon, { ...card });
        dealt += Math.max(0, result?.hpLoss || 0);
      });
      if (dealt > 0) {
        dragon.block = (dragon.block || 0) + dealt;
        window.BattleSystem?.pushFloat?.(state.battle, dragon.uid, "armor-gain", dealt);
      }
    }
    log(state, `${dragon.name} 发动机尾机枪，我方全体遭到扫射，按实际造成伤害获得护甲。`);
  }

  return { fireTailGun };
})();
