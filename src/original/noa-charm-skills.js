// 怪面诺亚【魅力改造】（锁定技，仅出牌阶段生效）
//   1. 出牌阶段内，手牌数始终等于手牌上限：少于摸至上限，多于由玩家弃至上限
//   2. 出牌阶段内，使用【杀】牌不消耗杀意
//   3. 出牌阶段内，使用杀台词
// 手牌上限本身由【改造副作用】按存活男性队友数动态给出，本文件只消费它的结果。
// 【出牌阶段】= battle.phase === 4（见 battle-turn-input.js）。
// 非出牌阶段（准备/判定/摸牌/弃牌/结束）一律不生效：不补牌、不弃牌、不免杀意、不播台词。
// 溢出弃牌不弹专用选牌窗：直接复用弃牌阶段那套「手牌区点选任意张 + 确认弃置」，
// 由 battle-discard-flow.js 的 discardCards 统一结算（战报 / 弃牌技能 / 魔力同步同款）。
window.NoaCharmSkills = (() => {
  const PLAY_PHASE = 4;
  const alive = unit => !!unit && unit.hp > 0;
  const isNoa = unit => alive(unit) && unit.ref === "noa";
  const hasSkill = (unit, name) => (unit?.skills || []).some(skill => skill?.name === name);
  const visible = unit => (unit?.hand || []).filter(card => !card._pendingDraw);
  const isKill = card => !!window.CardUtils?.isKillCard?.(card)
    || card?.type === "slash" || /杀(?:（[^）]*）)?$/.test(card?.name || "");
  const limitOf = unit => Math.max(0,
    window.NoaSideEffectSkills?.handLimit?.(unit) ?? unit?.stats?.handLimit ?? 0);
  const inPlayPhase = state => state?.battle?.phase === PLAY_PHASE;

  // 供 battle-card-playability.js 的 hasNoIntentCost 消费；只认角色本人打出的杀牌，
  // 且只在出牌阶段生效（其它阶段打出的杀正常消耗杀意）。
  function noIntentCost(actor, card) {
    if (!inPlayPhase(window.state)) return false;
    return isNoa(actor) && hasSkill(actor, "魅力改造") && isKill(card);
  }

  // 使用杀台词：由 battle-combat.js 在「使用X」日志之后立即调用。
  function playKillLine(state, actor, card) {
    if (!inPlayPhase(state)) return;
    if (!isNoa(actor) || !hasSkill(actor, "魅力改造") || !isKill(card)) return;
    window.BattleLines?.skill?.(state, actor, "使用杀");
  }

  // 手牌多于上限：不弹专用选牌窗，改为与弃牌阶段一样的弃牌。
  // 只挂一个 noaCharmDiscard 标记；UI 打开标准弃牌选择（b.discardPick + 手牌区点选 +
  // 确认弃置），确认时走 battle-discard-flow.js 的 discardCards 一次性结算。
  // 玩家仍可任意挑 need 张，顺序与位置不受限制；不设 locked、不占 handReveal。
  // 敌方单位 / 已有挂起 / 可见牌不足时走下方自动弃兜底，避免回合被挂死。
  function startCharmDiscard(state, b, owner, need) {
    if (b.locked || b.handReveal || b.noaCharmDiscard || visible(owner).length < need) return false;
    b.noaCharmDiscard = { unitUid: owner.uid, need };
    b.discardPick = null;
    window.BattleLog?.add?.(state,
      `${owner.name}的魅力改造发动，需弃置${need}张手牌至手牌上限${limitOf(owner)}（与弃牌阶段相同）。`);
    return true;
  }

  // 自动弃兜底：优先弃已落位的牌，避免动到还在摸牌动画队列里的对象；
  // 归属一律是诺亚自己，不能用出牌者 unit（他人出牌也会走到这里）。
  function autoDiscard(state, b, owner, need) {
    const extra = visible(owner).slice(-need);
    if (extra.length < need) {
      extra.push(...(owner.hand || []).filter(c => c._pendingDraw)
        .slice(0, need - extra.length));
    }
    extra.forEach(card => {
      const i = owner.hand.indexOf(card);
      if (i >= 0) owner.hand.splice(i, 1);
      window.BattleCards?.put?.(b, owner, card,
        card.void || card.type === "consume" ? "consumed" : "discard");
    });
    window.BattleLog?.add?.(state,
      `${owner.name}的魅力改造发动，弃${extra.length}张牌至手牌上限${limitOf(owner)}。`);
    return -extra.length;
  }

  // 手牌恒等：出牌阶段开始时、出牌结算后各调用一次（均在 phase 4 内）。
  // 手牌数按 owner.hand 总数计：draw() 新摸的牌带 _pendingDraw（仅动画未落位），
  // 牌本身已在手里；若按「可见牌」计数，会在动画期间反复判定不足并重复摸牌，
  // 动画结算后手牌远超上限、触发标准弃牌阶段卡住回合。
  function balanceHand(state, unit, draw, opts) {
    const b = state?.battle;
    if (!b || b.phase !== PLAY_PHASE) return 0;
    // 溢出弃牌期间不再重复挂起/补牌，交给玩家确认后重判。
    if (b.noaCharmDiscard) return 0;
    // 任意出牌都可能改变诺亚的手牌（偷牌、交牌、群体效果），故不局限于出牌者本人；
    // 但「出牌阶段开始时」只属于当前回合单位，别家回合不能替诺亚开弃牌选择（onlySelf）。
    const owner = isNoa(unit) && hasSkill(unit, "魅力改造")
      ? unit : (opts?.onlySelf ? null : (b.allies || []).find(u => isNoa(u) && hasSkill(u, "魅力改造")));
    if (!owner) return 0;
    const limit = limitOf(owner);
    const diff = limit - (owner.hand || []).length;
    if (diff > 0 && typeof draw === "function") {
      draw(owner, diff, b);
      window.BattleLog?.add?.(state,
        `${owner.name}的魅力改造发动，摸${diff}张牌至手牌上限${limit}。`);
      return diff;
    }
    if (diff < 0) {
      const need = -diff;
      // 别家回合（敌方出牌阶段 / 队友回合）不替诺亚开玩家弃牌选择：
      // 出牌后钩子不带 opts 也会走到这里，若挂起 noaCharmDiscard，会在敌方回合
      // 弹出玩家交互，且 enterPlayPhase 的挂起检查会阻断回合推进（卡死）。
      // 此时自动弃至上限，归属仍是诺亚自己。
      if (owner.side === "ally" && b.activeUid === owner.uid
        && startCharmDiscard(state, b, owner, need)) return 0;
      return autoDiscard(state, b, owner, need);
    }
    return 0;
  }

  // 所有「进入出牌阶段」的路径统一走这里：设 phase=4 + 手牌平衡 + 溢出挂起检查。
  // 狂暴（改造副作用）已设 skipPlayPhase 时，任何旁路都不得把 phase 改回 4，
  // 否则「跳过本回合出牌阶段」会被绕过，且魅力改造会在本不该生效的回合补牌。
  // 返回 true 才允许各路径继续执行 playPhaseStart / record / 出牌推进。
  function enterPlayPhase(state, unit, draw, onStep) {
    const b = state?.battle;
    if (!b) return false;
    if (unit?.skipPlayPhase) return false;
    b.phase = PLAY_PHASE;
    balanceHand(state, unit, draw || window.BattleSystem?.draw, { onlySelf: true });
    if (b.locked || b.noaCharmDiscard) { onStep?.(); return false; }
    return true;
  }

  return { noIntentCost, playKillLine, balanceHand, enterPlayPhase, PLAY_PHASE };
})();
