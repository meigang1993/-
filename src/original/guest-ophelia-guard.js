window.GuestOpheliaGuard = (deps) => {
  const { alive, visible, isSlash, line, isSingleKill } = deps;
  // 跳过护驾后要回到 battle-damage-resolution.js 的响应链继续结算（自动出闪 /
  // 命中），回调存模块级 WeakMap，不写进 battle state，避免存档序列化函数。
  const skipResume = new WeakMap();
  const guardVisible = battle =>
    window.BattleLines?.promptVisible?.(battle, "opheliaGuard")
    ?? !!(battle?.opheliaGuard && !battle.animQueue?.length
      && !window.BattleEffects?.animating && !window.BattleEffects?.draining);
  // 转移目标必须是存活友方：避免残留或异常值把连击剩余段指向错误单位（打错人）
  const validRedirect = (b, uid) => (!!uid
    && (b.allies || []).some(u => u.uid === uid && u.hp > 0) ? uid : null);
  function guardOphelia(state, actor, target, amount, source, card, api) {
    // 【非锁定技·参考三国杀曹操护驾】发动时机是「成为单体【杀】的目标」，不再要求
    // 自己手里没有可响应的【闪】：有闪但选择不用时同样可以让队友替出【闪】。
    // 全体类杀牌（sweep / allTargets / 机枪扫杀 / 魔王军入侵）不再进入护驾。
    if (target?.ref !== "ophelia" || actor?.side !== "enemy" || !isSlash(card)) return null;
    // 时停（米尔尤拉【神奇怀表】）：护驾是非锁定技，技能归属方被标记时一律失效。
    // 与通用触发面板、回合开始/结束、增减伤各中枢同口径；不拦截会让被时停者
    // 仍能指定队友替出【闪】，等于绕过了「不可响应 + 技能失效」。
    if (window.MieryulaTimeStop?.isSkillDisabled?.(target)) return null;
    if (!isSingleKill?.(card)) return null;
    // 护驾只在整张杀的第 1 段触发：追加段（连击多段）直接结算给护驾者，不再弹窗。
    // 否则每段都弹一次护驾，与其他受击弹窗交替，剩余段极易丢失。
    if (card?._opheliaGuardDone) return null;
    const allies = state.battle.allies.filter(u => u.uid !== target.uid && alive(u));
    if (!allies.length) return null;
    const guard = target.side === "ally" && !card?.forceAutoResponse
      ? pickManualGuard(state, target, allies, actor, amount, source, card, api)
      : autoGuard(allies, amount, card, api);
    if (!guard) return null;
    line(state, target, "为我护驾", guard); if (guard.ref === "lokar") api.draw(guard, 2, state.battle); if (guard.ref === "aileng") api.draw(guard, 4, state.battle);
    // 邦迪使杀牌失效：本张杀同样算「已处理过护驾」，否则连击剩余段会再弹一次窗。
    if (window.BondiSkills?.cancelKillCard?.(state, guard, card)) {
      card._opheliaGuardDone = true;
      return { dodged: false, hpLoss: 0 };
    }
    // 需两张闪的杀（莫娜·圣剑无双 / 克罗·肉欲之欢 / 坦克炮弹）护驾也要出两张，
    // 否则护驾者只出 1 张闪就把双闪杀完全抵消，绕过了双闪要求。
    const needTwo = !!(card?.krowFemaleTarget || card?.twoDodgesRequired);
    // 护驾者若处于麻痹（noResponse），按「没有闪」处理：不能替奥菲莉亚使用闪，
    // 按技能描述改为替其承受伤害，而不是照常出闪。
    const dodges = guard.noResponse ? [] : visible(guard).filter(c => api.canDodge(card, c));
    const dodge = needTwo ? (dodges.length >= 2 ? dodges.slice(0, 2) : [])
      : dodges.slice(0, 1);
    if (dodge.length === (needTwo ? 2 : 1)) {
      const visualHandBefore = window.BattleCards.visibleHandCount(guard);
      dodge.forEach(item => {
        guard.hand.splice(guard.hand.indexOf(item), 1);
        window.BattleCards?.put(
          state.battle, guard, item, "discard", { skipAnim: true });
      });
      // 出牌区与战报须同口径：按「被响应的威胁牌」判使用/打出
      // （响应单体杀=使用，响应全场扫射=打出），否则两处文案会不一致。
      const guardVerb = window.CardUtils?.isSingleKill?.(card) ? "使用" : "打出";
      window.BattleCards?.queueResponse?.(state.battle, guard, {
        type: "response", id: window.GameRandom.id("og"),
        uid: guard.uid, side: guard.side,
        // 出牌区按实际张数记录（cards 供 recordResponse 展开）
        cards: dodge.length > 1 ? dodge : null,
        card: dodge.length > 1 ? { ...dodge[0], name: "闪×2" } : dodge[0],
        action: `${guardVerb}了`,
      }, visualHandBefore, window.BattleCards.visibleHandCount(guard));
      window.NonokaLokiSkills?.afterCardResponded?.(
        state, guard, actor, dodge[0], api);
      api.afterDodged?.(state, actor, guard, card);
      window.BattleLog.add(
        state, `${guard.name} 为${target.name}护驾，${guardVerb}`
        + `${dodge.length > 1 ? "两张闪" : dodge[0].name}抵消杀。`);
      // 护驾者出闪也算「本张杀已护驾过」：连击剩余段继续打原目标，但不得再弹窗。
      // 此前只有承伤 / 跳过分支打标记，出闪抵消时剩余段会重新触发护驾（实测漏段/重复窗）。
      card._opheliaGuardDone = true;
      return { dodged: true, hpLoss: 0 };
    }
    window.BattleLog.add(state, `${guard.name} 为${target.name}护驾，改为承受本次伤害。`);
    // 护驾把伤害从奥菲莉亚转移到护驾者身上。此后本张牌的连击追加段必须继续打护驾者，
    // 否则剩余段仍以奥菲莉亚为目标，会反复触发护驾弹窗（表现为追加攻击丢失）。
    state.battle.opheliaGuardRedirectUid = guard.uid;
    const guardResult = api.hitWithoutDodge(state, actor, guard, amount, source, card);
    // 护驾者承担第 1 段伤害后，电钻火花等「造成伤害后再追加次数」的技能才摇骰，
    // 此时总段数才最终确定；记下来供 resolveOpheliaGuard 重新计算追加段，
    // 否则剩余段沿用护驾弹窗时的旧值（1 段→剩余 0），追加攻击会全部丢失。
    state.battle.opheliaGuardRepeats = Math.max(1, card?.gatlingRepeats || 1);
    // 本张牌已护驾过，后续追加段不再触发护驾。
    card._opheliaGuardDone = true;
    return guardResult;
  }
  function autoGuard(allies, amount, card, api) {
    // 双闪杀：只有凑得出 2 张闪的友方才算"能护驾"，否则会选一个
    // 只出得起 1 张闪的人白白替奥菲莉亚承受伤害
    const required = card?.krowFemaleTarget || card?.twoDodgesRequired ? 2 : 1;
    return allies.reduce((best, u) => {
      const canDodge = !u.noResponse && visible(u).filter(c => api.canDodge(card, c)).length >= required, favorite = u.ref === "aileng" ? 18 : u.ref === "lokar" ? 12 : 0, survives = u.hp > amount ? 8 : -18;
      const score = (canDodge ? 100 : 0) + favorite + survives + u.hp / 4;
      return !best || score > best.score ? { u, score } : best;
    }, null)?.u;
  }
  function pickManualGuard(state, target, allies, actor, amount, source, card, api) {
    const b = state.battle, current = b.opheliaGuardUid && allies.find(u => u.uid === b.opheliaGuardUid);
    if (current) { b.opheliaGuardUid = null; return current; }
    b.opheliaGuard = { actorUid: actor.uid, targetUid: target.uid, amount, source, card: { ...card } };
    if (typeof api?.resumeResponse === "function") skipResume.set(b, api.resumeResponse);
    b.opheliaGuardUid = null; b.locked = true; b.selectedCardIndex = null; b.selectedCostCardIndex = null; b.selectedSkillCard = null;
    const prompt = allies.map(u => u.name).join("、");
    window.BattleLog.add(state, `${target.name} 可发动为我护驾，请先点击我方角色选择护驾者：${prompt}。`);
    return null;
  }
  function resolveOpheliaGuard(state, uid, api) {
    // uid === null 表示玩家点了「跳过（不发动）」：非锁定技必须能放弃。
    // 此时不自动 fallback 到 valid[0]，伤害按原目标继续结算（与次元转移跳过后口径一致）。
    const b = state.battle, p = b?.opheliaGuard, valid = b?.allies.filter(u => u.ref !== "ophelia" && alive(u)) || [];
    const skipped = uid === null || uid === "__ophelia_guard_skip__";
    const unit = skipped ? null : (valid.find(u => u.uid === uid) || valid[0]);
    if (!p || !guardVisible(b)) return false;
    b.opheliaGuard = null; b.opheliaGuardUid = unit?.uid || null; b.locked = false;
    const units = b.allies.concat(b.enemies), actor = units.find(u => u.uid === p.actorUid), target = units.find(u => u.uid === p.targetUid);
    const rootDamage = !b._damageDepth;
    b._damageDepth = (b._damageDepth || 0) + 1;
    try {
      if (unit && actor && target) guardOphelia(state, actor, target, p.amount, p.source, p.card, api);
      else if (actor && target) {
        window.BattleLog.add(state, skipped
          ? `${target.name} 放弃发动为我护驾，本次【杀】仍由原目标承受。`
          : `${target.name} 的护驾没有有效角色，攻击继续结算。`);
        // 跳过 / 无有效护驾者：本张杀已处理过护驾，连击剩余段不得再弹窗。
        p.card._opheliaGuardDone = true;
        // 曹操【护驾】口径：放弃发动后仍回到正常响应链（自动模式自己有【闪】
        // 就自动出闪，没有才承伤），而不是 hitWithoutDodge 直接绕过响应。
        const resume = skipResume.get(b);
        if (skipped && typeof resume === "function") resume();
        else api.hitWithoutDodge(state, actor, target, p.amount, p.source, p.card);
      }
      else window.BattleLog.add(state, `护驾没有有效角色，攻击结算中断。`);
    } finally {
      b._damageDepth -= 1;
      if (rootDamage) api.finalizeDamage?.(state);
    }
    window.FloraCarlosSkills?.queueSpeedAssaultSettlement?.(state, p.card);
    const groupCard = p.groupCard || p.card;
    const settling = b.pendingVictory || b.pendingDefeat || b.victoryScreen
      || b.defeat || b.testComplete;
    // 护驾把伤害转移到了护驾者身上，连击追加段必须继续打护驾者；
    // 若沿用 p.targetUid（奥菲莉亚），剩余段会重新触发护驾弹窗，表现为追加攻击丢失。
    // 追加段继续打护驾者（本张牌只护驾一次，不再弹窗）。
    // 段数须取护驾承担伤害后的最新总段数：护驾弹窗打断时电钻火花尚未摇骰，
    // p.remainingHits 是旧值（常为 0），直接沿用会让追加攻击全部丢失。
    const repeats = Math.max(b.opheliaGuardRepeats || 0, p.card?.gatlingRepeats || 1);
    const remaining = Math.max(p.remainingHits || 0, repeats - 1);
    if (!settling && remaining > 0) b.manualDodgeResume = {
      ...p,
      targetUid: validRedirect(b, b.opheliaGuardRedirectUid) || p.targetUid,
      remainingHits: remaining,
    };
    if (!settling && groupCard?.targetUids?.length && groupCard.nextTargetIndex != null) b.demonInvasionResume = { ...p, card: groupCard, targetUids: groupCard.targetUids, nextTargetIndex: groupCard.nextTargetIndex };
    delete b.opheliaGuardUid;
    // 一次性消费：转移目标与段数只在本次护驾挂起剩余段时有效，用完即清。
    b.opheliaGuardRedirectUid = null;
    b.opheliaGuardRepeats = 0;
    skipResume.delete(b);
    return true;
  }
  return { guardOphelia, guardVisible, resolveOpheliaGuard };
};
