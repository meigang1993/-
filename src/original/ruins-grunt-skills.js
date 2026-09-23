// 废墟沙城普通怪技能 · 狙击目标 / 麻痹毒子弹 / 坦克炮弹
// 地雷与猜拳已拆至 ruins-grunt-landmine.js（原文件 350 行，超出 200 行硬约束）。
// window.RuinsGruntSkills 仍导出全部函数（含地雷的转发），调用方无需改动。
window.RuinsGruntSkills = (() => {
  // 惰性解析：加载顺序变化时直接取值会静默拿到 undefined，Proxy 可规避。
  const C = new Proxy({}, { get: (_, key) => window.RuinsGruntCommon?.[key] });
  const LM = new Proxy({}, { get: (_, key) => window.RuinsGruntLandmine?.[key] });
  const RP = new Proxy({}, { get: (_, key) => window.RuinsGruntRPS?.[key] });

  function sniperMove(state, actor) {
    if (actor?.ai !== "ruins_sniper" || actor.usedRuinsSnipe) return null;
    const targets = C.alive(state.battle.allies).filter(unit => C.visible(unit).length);
    if (!targets.length) return null;
    const target = targets.sort((left, right) =>
      C.visible(right).filter(C.isSlash).length - C.visible(left).filter(C.isSlash).length
      || left.hp - right.hp)[0];
    return { card: { name: "狙击目标", _skill: true, ruinsSnipe: true }, target };
  }

  function useSnipe(state, actor, target) {
    // 同 usePlaceLandmine：限一次守卫必须对 useSkillCard 的直接调用路径也生效。
    if (actor?.usedRuinsSnipe) return false;
    actor.usedRuinsSnipe = true;
    const shown = C.visible(target)[0];
    if (!shown) {
      C.log(state, `${actor.name} 发动狙击目标失败：${target.name}没有可展示的手牌。`);
      return true;
    }
    const suit = shown.suit;
    const own = C.visible(actor).filter(card => card.suit === suit).length;
    const foe = C.visible(target).filter(card => card.suit === suit).length;
    actor.ruinsSniperTargetUid = target.uid;
    actor.ruinsSniperSuit = suit;
    actor.ruinsSniperLocked = own > foe;
    state.battle?.animQueue?.push({
      type: "revealCards", id: window.GameRandom?.id?.("rsn") || "rsn",
      title: "狙击目标", cards: [{ ...shown }],
    });
    window.BattleLines?.skill?.(state, actor, "狙击目标", target);
    C.log(state, `${actor.name} 展示${target.name}的${suit}${shown.name}，双方${suit}花色手牌为${own}/${foe}，${actor.ruinsSniperLocked ? "锁定成立" : "未取得优势"}。`);
    return true;
  }

  function beforeKillTargeted(state, actor, target, card) {
    if (actor?.ai !== "ruins_sniper" || !actor.ruinsSniperLocked) return;
    if (!target || target.uid !== actor.ruinsSniperTargetUid) return;
    const isEntitySingle = window.CardUtils?.isEntitySingleKill?.(card)
      || (C.isSlash(card) && !card?.virtual && !card?.sweep);
    if (!isEntitySingle) return;
    if (!card.ignoreResponse) card._tempIgnoreResponse = true;
    card.ignoreResponse = true;
    // 与亚缇娜【狙击目标】一致：锁定是一次性的，命中一张实体单体【杀】后立即失效，
    // 不再覆盖本回合后续的杀（此前为「本回合持续」，与描述「下一张」不符）。
    actor.ruinsSniperLocked = false;
    C.log(state, `${actor.name} 的狙击目标触发，对${target.name}的实体单体杀不可响应。`);
  }

  // 锁定技：攻击型无人机单体【杀】转为毒属性
  function beforeKillUsed(state, actor, card) {
    if (actor?.ai !== "ruins_drone") return;
    if (!C.isSingleSlash(card)) return;
    card.poison = true;
  }

  function afterDamage(state, actor, target, card, hpLoss) {
    if (!hpLoss || !actor) return;
    if (actor.ai === "ruins_drone" && C.isSlash(card) && !card?._soulChain) {
      const paralyze = () => window.BattleStatusCards?.add?.(state, target,
        window.BattleStatusCardRegistry?.create("paralysis"), actor.name);
      const poison = () => {
        if (!card?.poison) return;
        window.EnemySkills?.addPoison?.(state, target, 1, actor);
      };
      if (!window.BattleDamageLifecycle?.delayUntilHitSettled?.(state, () => {
        paralyze();
        poison();
      })) { paralyze(); poison(); }
    }
  }

  // ---------- 梅尔卡坦克 · 坦克炮弹 ----------
  function tankMove(state, actor) {
    if (actor?.ai !== "ruins_tank" || actor.usedRuinsTankShell) return null;
    const singles = C.visible(actor).filter(C.isSingleSlash);
    if (singles.length < 2) return null;
    // target 用 actor 占位：自动出牌循环要求 target 非空，否则该 move 会被直接跳过
    return { card: { name: "坦克炮弹", _skill: true, ruinsTankShell: true, targetless: true }, target: actor };
  }

  function useTankShell(state, actor) {
    if (actor?.usedRuinsTankShell) return false;
    actor.usedRuinsTankShell = true;
    const singles = C.visible(actor).filter(C.isSingleSlash).slice(0, 2);
    singles.forEach(card => {
      const index = actor.hand.indexOf(card);
      if (index >= 0) actor.hand.splice(index, 1);
    });
    if (singles.length) {
      // 不再写 `putMany(...) || 逐张 put(...)` 兜底：putMany 早先返回 undefined，
      // 兜底分支会再跑一遍，弃置的 2 张杀被重复入弃牌堆且出牌区显示 4 张。
      window.BattleCards?.putMany?.(state.battle, actor, singles, "discard", { showDiscard: true });
    }
    actor.ruinsTankShellReady = true;
    window.BattleLines?.skill?.(state, actor, "坦克炮弹");
    C.log(state, `${actor.name} 弃置${singles.map(card => card.name).join("、")}装填坦克炮弹，下回合准备阶段发射。`);
    return true;
  }

  // 准备阶段：消耗标记，对所有敌方角色造成攻击力2倍伤害，每人需2张【闪】抵消
  function tankPrepare(state, unit, damage) {
    if (unit?.ai !== "ruins_tank" || !unit.ruinsTankShellReady) return;
    unit.ruinsTankShellReady = false;
    const amount = C.attackOf(unit) * 2;
    const targets = C.alive(state.battle.allies);
    if (!targets.length) return;
    window.BattleLines?.skill?.(state, unit, "坦克炮弹");
    C.log(state, `${unit.name} 发射坦克炮弹，对所有敌方角色各造成${amount}点伤害，每名角色需打出2张【闪】才能抵消。`);
    const card = {
      name: "坦克炮弹", type: "skill", sweep: true, targetless: true,
      virtual: true, scale: "attack",
      // 与"机枪扫杀/枪林弹雨"同款：AOE 技能牌靠 responseKind 进入闪响应流程，
      // twoDodgesRequired 使其需要 2 张闪（同莫娜·圣剑无双的双闪口径）
      responseKind: "dodge", twoDodgesRequired: true,
    };
    const actions = targets.map(target =>
      window.BattleReactionQueue?.damageAction?.(unit, target, amount, "坦克炮弹", card) || {
        kind: "damage", actorUid: unit.uid, targetUid: target.uid,
        amount, source: "坦克炮弹", card,
      });
    if (actions.length && window.BattleReactionQueue?.enqueue?.(state, actions)) {
      window.BattleReactionQueue.flush(state, damage);
    } else {
      actions.forEach(action => damage(
        state,
        state.battle.allies.find(target => target.uid === action.targetUid),
        action.amount, action.source, unit, action.card,
      ));
    }
  }

  function endTurn(_state, unit) {
    if (unit?.ai === "ruins_drone") unit.ruinsLockedTarget = null;
    if (unit?.ai === "ruins_sniper") {
      unit.ruinsSniperTargetUid = null;
      unit.ruinsSniperSuit = null;
      unit.ruinsSniperLocked = false;
    }
    // 出牌阶段限一次 → 每回合重置
    unit.usedRuinsLandmine = false;
    unit.usedRuinsSnipe = false;
    unit.usedRuinsTankShell = false;
    unit.usedRuinsLandmineRps = false;
  }

  return {
    sniperMove, useSnipe,
    beforeKillTargeted, beforeKillUsed, afterDamage, endTurn,
    tankMove, useTankShell, tankPrepare,
    // 地雷放置转自 ruins-grunt-landmine.js；猜拳小游戏转自 ruins-grunt-rps.js：对外接口保持不变
    landmineMove: (...args) => LM.landmineMove(...args),
    usePlaceLandmine: (...args) => LM.usePlaceLandmine(...args),
    landmineRpsMove: (...args) => RP.landmineRpsMove(...args),
    useLandmineRps: (...args) => RP.useLandmineRps(...args),
    playPhaseStart: (...args) => RP.playPhaseStart(...args),
    openLandmineRps: (...args) => RP.openLandmineRps(...args),
    resolveLandmineRpsChoice: (...args) => RP.resolveLandmineRpsChoice(...args),
    confirmLandmineRps: (...args) => RP.confirmLandmineRps(...args),
    skipLandmineRps: (...args) => RP.skipLandmineRps(...args),
  };
})();
