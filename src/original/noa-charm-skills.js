// 怪面诺亚【魅力改造】（锁定技，仅出牌阶段 = battle.phase===4 生效）
//   1. 手牌数始终等于上限：少于摸至上限，多于由玩家弃至上限
//   2. 使用【杀】不消耗杀意  3. 使用杀台词
// 上限由【改造副作用】按存活男性队友数动态给出；非出牌阶段一律不生效。
// 溢出弃牌复用弃牌阶段那套（手牌区点选 + 确认弃置），由 battle-discard-flow.js 结算。
window.NoaCharmSkills = (() => {
  const PLAY_PHASE = 4;
  const alive = unit => !!unit && unit.hp > 0;
  const isNoa = unit => alive(unit) && unit.ref === "noa";
  const hasSkill = (unit, name) => (unit?.skills || []).some(skill => skill?.name === name);
  // 状态牌不计入手牌上限（countsForLimit），按 hand.length 算溢出会误弃普通牌、
  // 甚至挂起选不够的弃牌选择卡死回合；_pendingDraw 已在手里且会落位，须算入。
  const countedHand = unit => (unit?.hand || []).filter(card =>
    window.GuestCharacterSkills?.countsForLimit?.(unit, card) ?? true).length;
  // 与 BattleRuntimeHelpers.canDiscardCard 同口径：排除 _pendingDraw、状态牌、
  // 水下列车限制牌。need 必须夹到可弃牌数，否则挂起无法完成。
  const discardableCards = unit => (unit?.hand || []).filter(card =>
    !card._pendingDraw
    && (window.GuestCharacterSkills?.countsForLimit?.(unit, card) ?? true)
    && (window.UnderwaterTrainSkills?.canDiscard?.(unit, card) ?? true));
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
  // 玩家可任意挑 need 张；不设 locked。已有挂起 / 可见牌不足时走自动弃兜底，避免卡死。
  // 已有其它玩家提示（锤子/米勒/交牌/半魅魔血等）时绝不叠加第二个弃牌选择，否则抢手牌卡死。
  function startCharmDiscard(state, b, owner, need) {
    if (b.locked || b.handReveal || b.noaCharmDiscard
      || window.AppRuntimeRecovery?.hasBlockingBattlePrompt?.(b) || discardableCards(owner).length < need) return false;
    b.noaCharmDiscard = { unitUid: owner.uid, need };
    b.discardPick = null;
    window.BattleLog?.add?.(state,
      `${owner.name}的魅力改造发动，需弃置${need}张手牌至手牌上限${limitOf(owner)}（与弃牌阶段相同）。`);
    return true;
  }

  // 自动弃兜底：优先弃已落位的可弃牌（状态牌一律不动）；不足时补 _pendingDraw
  // 的普通牌（摸牌动画未落位，不涉及玩家点选，不会卡死）。归属是诺亚自己。
  // 结算与 battle-discard-flow.js 的 discardCards 同款：void 分流、弃牌触发、
  // 魔力同步、战报；逐张 put 与 putMany 等价，且兼容既有调用方。
  function autoDiscard(state, b, owner, need) {
    const pool = discardableCards(owner);
    const extra = pool.slice(-need);
    if (extra.length < need) {
      const pending = (owner.hand || []).filter(card => card._pendingDraw
        && (window.GuestCharacterSkills?.countsForLimit?.(owner, card) ?? true));
      extra.push(...pending.slice(0, need - extra.length));
    }
    // 一张都弃不了时静默降级：不写「一次性弃置 。」空战报，也不触发
    // 弃牌/魔力同步钩子。balanceHand 每次出牌后都会重判，空战报会反复刷屏。
    if (!extra.length) return 0;
    extra.forEach(card => {
      const i = owner.hand.indexOf(card);
      if (i >= 0) owner.hand.splice(i, 1);
      window.BattleCards?.put?.(b, owner, card,
        card.void || card.type === "consume" ? "consumed" : "discard");
    });
    window.WendyCadicisSkills?.afterDiscard?.(state, owner, extra,
      { draw: window.BattleSystem?.draw, pushFloat: window.BattleCombat?.pushFloat });
    window.CatherineSkills?.syncMagic?.(state, owner);
    window.BattleLog?.add?.(state,
      `${owner.name} 一次性弃置 ${extra.map(card => card.name).join("、")}。`);
    return -extra.length;
  }

  // 手牌恒等：出牌阶段开始时、出牌结算后各调用一次（均在 phase 4 内）。
  // 手牌数按 countedHand 计（排除状态牌，但保留 _pendingDraw）：draw() 新摸的牌
  // 带 _pendingDraw（仅动画未落位），牌本身已在手里；若按「可见牌」计数，会在动画
  // 期间反复判定不足并重复摸牌，动画结算后手牌远超上限、触发标准弃牌阶段卡住回合。
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
    const diff = limit - countedHand(owner);
    if (diff > 0 && typeof draw === "function") {
      const before = (owner.hand || []).length;
      // 直到补齐或确认牌堆空为止：真实 draw 带 drawSignal（牌堆耗尽 / 封魔 /
      // 吸魔邪眼转交），一轮即可确认；无信号的旧 draw 只宽容重试一次，并有
      // maxRounds 兜底防死循环。到手数一律按 owner.hand 增量算，绝不用「抽出
      // 的张数」冒充（转交时两者不相等）。
      const maxRounds = Math.max(2, Math.min(8, diff + 2));
      let gained = 0, rounds = 0, stopSig = null;
      // 补齐判定必须按 countedHand（状态牌不占上限），不能按 hand.length 增量：
      // 摸到的牌里夹一张状态牌时，总手牌增量已达 diff 但计入上限的牌仍不足，
      // 会误写「摸N张至上限」并提前收工，下一轮又补一次。
      while (countedHand(owner) < limit && rounds < maxRounds) {
        const handBefore = (owner.hand || []).length;
        const remaining = limit - countedHand(owner);
        const result = draw(owner, remaining, b);
        rounds += 1;
        const toHand = Math.max(0, (owner.hand || []).length - handBefore);
        gained += toHand;
        const sig = window.BattleDrawFeedback?.signal?.(result, owner, remaining, toHand)
          || { signaled: false, drawn: toHand, exhausted: toHand === 0,
               locked: !!owner.drawLockedThisTurn, redirected: 0, gained: toHand };
        if (countedHand(owner) >= limit) break;
        // 没有信号且本轮 0 张：无法确认耗尽，只宽容重试一次。
        if (!sig.signaled && toHand === 0) {
          if (rounds >= 2) { stopSig = sig; break; }
          continue;
        }
        if (sig.locked || sig.exhausted || (sig.redirected > 0 && toHand === 0)) {
          stopSig = sig; break;
        }
      }
      // 战报只写实际到手数；一张没到手时不重复写「未摸到牌」，只说明原因与
      // 差额（转交已由 onDrawRedirected 单独记过一条，这里再去掉重复措辞）。
      const recentLog = [
        ...(Array.isArray(state.log) ? state.log.slice(0, 3) : []),
        ...(Array.isArray(state.battleLog) ? state.battleLog.slice(0, 3) : []),
      ].map(String).join("");
      const reasonOf = sig => {
        const base = window.BattleDrawFeedback?.shortage?.(sig) || "本次摸牌未到手";
        return sig?.redirected > 0 && recentLog.includes("吸魔邪眼转交")
          ? "本次摸牌未到手" : base;
      };
      const short = Math.max(0, limit - countedHand(owner));
      if (short === 0) {
        window.BattleLog?.add?.(state,
          `${owner.name}的魅力改造发动，摸${gained}张牌至手牌上限${limit}。`);
      } else if (gained > 0) {
        const reason = stopSig ? reasonOf(stopSig) : "本次摸牌未到手";
        window.BattleLog?.add?.(state,
          `${owner.name}的魅力改造发动，实际摸到${gained}张牌，仍差${short}张未补齐至上限${limit}（${reason}）。`);
      } else {
        const sig = stopSig || { locked: !!owner.drawLockedThisTurn, exhausted: true, redirected: 0, gained: 0 };
        window.BattleLog?.add?.(state,
          `${owner.name}的魅力改造未能补齐：${reasonOf(sig)}，手牌${before}张低于上限${limit}。`);
      }
      return gained;
    }
    if (diff < 0) {
      const overflow = -diff;
      const discardable = discardableCards(owner).length;
      const need = Math.min(overflow, discardable);
      // 只有「所有溢出牌都可弃」时才让玩家挂起（玩家能一次选够）；否则走
      // 自动弃兜底（含 _pendingDraw），避免挂起一个永远选不够的弹窗卡死回合。
      // 别家回合（敌方出牌阶段 / 队友回合）一律自动弃，不弹玩家交互。
      if (need === overflow && need > 0 && owner.side === "ally"
        && b.activeUid === owner.uid
        && startCharmDiscard(state, b, owner, need)) return 0;
      return autoDiscard(state, b, owner, overflow);
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
