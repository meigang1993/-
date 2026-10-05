window.BattleReactionQueue = (() => {
  const LIMIT = 160;
  const current = state => !window.state || window.state === state;
  const units = battle => (battle?.allies || []).concat(battle?.enemies || []);

  function enqueue(state, actions) {
    const battle = state?.battle, list = (Array.isArray(actions) ? actions : [actions]).filter(Boolean);
    if (!battle || !list.length) return false;
    if (battle._reactionNested) battle._reactionNested.push(...list);
    else (battle.reactionQueue ||= []).push(...list);
    return true;
  }

  function prepend(state, actions) {
    const battle = state?.battle, list = (Array.isArray(actions) ? actions : [actions]).filter(Boolean);
    if (!battle || !list.length) return false;
    if (battle._reactionNested) battle._reactionNested.unshift(...list);
    else (battle.reactionQueue ||= []).unshift(...list);
    return true;
  }

  function damageAction(actor, target, amount, source, card) {
    return { kind: "damage", actorUid: actor?.uid, targetUid: target?.uid, amount, source, card };
  }
  function directDamageAction(actor, target, amount, source, card, delay = 0) {
    return { kind: "directDamage", actorUid: actor?.uid, targetUid: target?.uid, amount, source, card, delay };
  }
  function resolvedHitAction(actor, target, amount, source, card) {
    return { kind: "resolvedHit", actorUid: actor?.uid, targetUid: target?.uid, amount, source, card };
  }

  function captureHitContinuation(battle, actor, target, amount, source, card, remainingHits, group = null) {
    if (!battle || !actor || !target) return false;
    const groupCard = group?.card ? {
      ...group.card,
      targetUids: [...(group.targetUids || group.card.targetUids || [])],
      nextTargetIndex: group.nextTargetIndex,
    } : null;
    const prompt = battle.manualDodge || battle.opheliaGuard;
    if (prompt) {
      prompt.remainingHits = Math.max(0, remainingHits || 0);
      if (groupCard) prompt.groupCard = groupCard;
      return true;
    }
    if (!battle.locked) return false;
    const settling = battle.pendingVictory || battle.pendingDefeat || battle.victoryScreen
      || battle.defeat || battle.testComplete;
    if (settling) return true;
    const base = {
      actorUid: actor.uid,
      // 护驾已把本次伤害转移到护驾者身上，连击追加段须继续打护驾者，
      // 否则会重新以奥菲莉亚为目标再次触发护驾，导致追加段丢失。
      // 转移目标须为存活友方，避免残留/异常值让剩余段打错人
      targetUid: (battle.opheliaGuardRedirectUid
        && (battle.allies || []).some(u => u.uid === battle.opheliaGuardRedirectUid && u.hp > 0))
        ? battle.opheliaGuardRedirectUid : target.uid,
      amount,
      source,
      card: { ...card },
      remainingHits: Math.max(0, remainingHits || 0),
    };
    if (groupCard) base.groupCard = groupCard;
    // 交牌（半魅魔血）等弹窗同样会置 locked，但交牌不产生 manualDodge 提示，
    // 剩余段若走 manualDodgeResume，伊迪斯狂暴链锯的追加段实测会少结算 1 段
    // （额外结算 4 但只触发 3）。故凡锁定源自交牌，统一改入反应队列，由 flush
    // 在解锁后结算，与疯狂刺刀/幻影剑舞/魔之连杀同一机制。
    // 注：双重打杀两段在两种路径下都齐全；此前「间歇只结算 1 段」是受击方
    // 自动打出【闪】合法抵消了第二段，非段丢失，勿再据此改动。
    const shareLocked = battle.kaiichiShare || battle.kaiichiShareQueue?.length;
    if (shareLocked) {
      const left = Math.max(0, remainingHits || 0);
      if (left > 0) {
        const actions = [];
        for (let i = 0; i < left; i += 1) {
          actions.push(damageAction(actor, target, amount, source, { ...card }));
        }
        enqueue({ battle }, actions);
      }
      return true;
    }
    if (base.remainingHits > 0) battle.manualDodgeResume = base;
    else if (group?.targetUids?.length && group.nextTargetIndex < group.targetUids.length) {
      battle.demonInvasionResume = {
        ...base,
        card: { ...group.card },
        targetUids: [...group.targetUids],
        nextTargetIndex: group.nextTargetIndex,
      };
    }
    return true;
  }

  function activateShare(state) {
    const battle = state?.battle;
    if (!battle || battle.kaiichiShare || !battle.kaiichiShareQueue?.length || battle.locked) return false;
    return !!window.HoshinoSkills?.activateShare?.(state);
  }

  function run(state, action, damage) {
    const battle = state.battle, roster = units(battle);
    if (action.kind === "damage" || action.kind === "directDamage" || action.kind === "resolvedHit") {
      const actor = roster.find(unit => unit.uid === action.actorUid);
      const target = roster.find(unit => unit.uid === action.targetUid && unit.hp > 0);
      if (actor && target) {
        if (action.skillName) window.BattleLines?.skill?.(state, actor, action.skillName, target);
        if (action.logText) window.BattleLog?.add?.(state, action.logText);
        const card = action.prepareGroupKill
          ? (window.EnemySkills?.prepareGroupKillTarget?.(state, actor, target, action.card) || action.card)
          : action.card;
        const hit = action.kind === "resolvedHit" && damage.hitWithoutDodge
          ? damage.hitWithoutDodge
          : action.kind === "directDamage" && damage.directDamage
            ? damage.directDamage
            : damage;
        const result = action.kind === "resolvedHit"
          ? hit(state, actor, target, action.amount, action.source, card)
          : action.kind === "directDamage"
            ? hit(state, target, action.amount, action.source, actor, action.delay || 0, card)
            : hit(state, target, action.amount, action.source, actor, card);
        if (result?.dodged && action.edisGroupHealCard?._edisDarkBlocked) action.edisGroupHealCard._edisDarkBlocked.add(target.uid);
      }
      return;
    }
    if (window.EnemySkills?.resolveReactionAction?.(state, action, damage)) return;
    if (window.AngelicaLukaSkills?.resolveReactionAction?.(state, action, damage)) return;
    if (action.kind === "kaiichiBloodHeal") {
      window.HoshinoSkills?.resolveBloodHeal?.(state, action, {
        damage,
        draw: window.BattleSystem?.draw,
        pushFloat: window.BattleSystem?.pushFloat,
      });
    }
  }

  // 异步回调（受击浮字 onSettled 等）里新入队的动作，若没人再触发一次 flush
  // 就会滞留到回合流转被 cleanupPrompts 清空，表现为伤害永不落地。
  // requestFlush 允许这类回调在自身结束后重新驱动一轮结算。
  // 只在「当前没有 flush 在跑」时才发起：回调通常发生在动画播完后、此时
  // flush 早已结束，新起一轮即可消费干净。
  // 切勿改回「在 flush 内打标记让外层 do-while 再转一圈」——实测该重入会
  // 打乱交牌弹窗（半魅魔血）的逐段时序：伊迪斯狂暴链锯额外结算 4 段时，
  // 半魅魔血触发从 4 次掉到 3 次、追击从 4 掉到 3（用例 8/9）。
  // 重入只会让已经在循环里的队列被多转一圈，对「回调里才新入队」的场景
  // 并无帮助，收益为零、风险为实。
  function requestFlush(state, damage) {
    const battle = state?.battle;
    if (!battle || !current(state)) return false;
    if (battle._reactionFlushing) return false;
    return flush(state, damage);
  }

  function flush(state, damage) {
    const battle = state?.battle;
    if (!battle || !current(state) || battle._reactionFlushing) return !pending(battle);
    if (activateShare(state) || battle.locked) return false;
    battle._reactionFlushing = true;
    let count = 0;
    try {
      while (current(state) && state.battle === battle && battle.reactionQueue?.length && !battle.locked) {
        if (activateShare(state)) return false;
        if (++count > LIMIT) {
          battle.reactionQueue = [];
          window.BattleLog?.add?.(state, "连续反应达到安全上限，已停止后续反应。");
          break;
        }
        const action = battle.reactionQueue.shift(), nested = [];
        battle._reactionNested = nested;
        try { run(state, action, damage); }
        finally { delete battle._reactionNested; }
        if (nested.length) battle.reactionQueue.unshift(...nested);
        if (activateShare(state)) return false;
      }
    } finally {
      delete battle._reactionNested;
      delete battle._reactionFlushing;
      delete battle._reactionFlushAgain;
      if (!battle.reactionQueue?.length) battle.reactionQueue = null;
    }
    return !pending(battle) && !battle.locked;
  }

  function pending(battle) {
    return !!(battle?.reactionQueue?.length || battle?.kaiichiShare || battle?.kaiichiShareQueue?.length);
  }

  return { enqueue, prepend, damageAction, directDamageAction, resolvedHitAction, captureHitContinuation, flush, requestFlush, pending };
})();
