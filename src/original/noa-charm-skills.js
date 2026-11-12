// 怪面诺亚【淫气改造】（锁定技，仅「诺亚自己的」出牌阶段生效：
//   battle.phase===4 且 battle.activeUid===诺亚 uid）
//   1. 手牌数始终等于上限：少于摸至上限，多于由玩家弃至上限
//   2. 使用【杀】不消耗杀意  3. 使用杀台词
// 上限由【改造副作用】按存活男性队友数动态给出；非出牌阶段、别家回合一律不生效。
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
  const isKill = card => !!window.CardUtils?.isKillCard?.(card)
    || card?.type === "slash" || /杀(?:（[^）]*）)?$/.test(card?.name || "");
  const limitOf = unit => Math.max(0,
    window.NoaSideEffectSkills?.handLimit?.(unit) ?? unit?.stats?.handLimit ?? 0);
  const inPlayPhase = state => state?.battle?.phase === PLAY_PHASE;
  // phase 4 是全局阶段，别家出牌时同为 4；免杀意/台词/手牌平衡都必须再确认
  // 当前回合单位就是诺亚本人，否则会在别人回合生效（回合外免杀意、回合外补弃牌）。
  const inOwnPlayPhase = (state, actor) => inPlayPhase(state)
    && !!actor && state?.battle?.activeUid === actor.uid;
  if (!window.NoaCharmDiscard) throw new Error("[noa-charm-discard] 模块未装配：noa-charm-discard.js 必须先于 noa-charm-skills.js 加载");
  const { discardableCards, startCharmDiscard, autoDiscard } = window.NoaCharmDiscard({ limitOf });

  // 供 battle-card-playability.js 的 hasNoIntentCost 消费；只认角色本人打出的杀牌，
  // 且只在出牌阶段生效（其它阶段打出的杀正常消耗杀意）。
  function noIntentCost(actor, card) {
    if (!inOwnPlayPhase(window.state, actor)) return false;
    return isNoa(actor) && hasSkill(actor, "淫气改造") && isKill(card);
  }

  // 使用杀台词：由 battle-combat.js 在「使用X」日志之后立即调用。
  function playKillLine(state, actor, card) {
    if (!inOwnPlayPhase(state, actor)) return;
    if (!isNoa(actor) || !hasSkill(actor, "淫气改造") || !isKill(card)) return;
    window.BattleLines?.skill?.(state, actor, "使用杀");
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
    const owner = isNoa(unit) && hasSkill(unit, "淫气改造")
      ? unit : (opts?.onlySelf ? null : (b.allies || []).find(u => isNoa(u) && hasSkill(u, "淫气改造")));
    if (!owner) return 0;
    // battle.phase===4 是全局阶段，敌方/队友出牌时同为 4；出牌后钩子每次出牌
    // 都会重判，若不看当前回合单位，就会在别人回合替诺亚摸牌/弃牌（回合外生效）。
    // 只在诺亚自己的出牌阶段生效：battle-turn-start.js 每回合开始已设 activeUid，
    // enterPlayPhase（出牌阶段开始）与五条旁路全部走这条路径。
    if (b.activeUid !== owner.uid) return 0;
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
          `${owner.name}的淫气改造发动，摸${gained}张牌至手牌上限${limit}。`);
      } else if (gained > 0) {
        const reason = stopSig ? reasonOf(stopSig) : "本次摸牌未到手";
        window.BattleLog?.add?.(state,
          `${owner.name}的淫气改造发动，实际摸到${gained}张牌，仍差${short}张未补齐至上限${limit}（${reason}）。`);
      } else {
        const sig = stopSig || { locked: !!owner.drawLockedThisTurn, exhausted: true, redirected: 0, gained: 0 };
        window.BattleLog?.add?.(state,
          `${owner.name}的淫气改造未能补齐：${reasonOf(sig)}，手牌${before}张低于上限${limit}。`);
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
  // 否则「跳过本回合出牌阶段」会被绕过，且淫气改造会在本不该生效的回合补牌。
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

  // 从其它角色获得手牌（偷窃/窃取/交牌/借刀…）时重判手牌恒等：这些路径经过
  // handReveal 挂起，runHooks 会被 paused 整段暂停，弹窗结算只补跑 repeatTactic，
  // 出牌后钩子里的 balanceHand 从未执行。守卫全在 balanceHand 内，别家回合/
  // 非出牌阶段一律不生效，重复调用幂等。
  function onHandGained(state, unit) {
    return balanceHand(state, unit, window.BattleSystem?.draw);
  }

  return { noIntentCost, playKillLine, balanceHand, enterPlayPhase, onHandGained, PLAY_PHASE };
})();
