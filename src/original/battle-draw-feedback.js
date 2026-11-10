window.BattleDrawFeedback = (() => {
  function count(requested, cards) {
    if (Array.isArray(cards)) return cards.length;
    return Math.max(0, Number(requested) || 0);
  }

  function action(unit, requested, cards) {
    const actual = count(requested, cards);
    if (actual > 0) return `摸${actual}张牌`;
    if (Math.max(0, Number(requested) || 0) === 0) return "未摸牌";
    return unit?.drawLockedThisTurn ? "因封魔无法摸牌" : "未摸到牌";
  }

  function team(entries, requested, collective) {
    if (entries.length && entries.every(entry =>
      count(requested, entry.cards) === requested)) {
      return `${collective}各摸${requested}张牌`;
    }
    if (!entries.length) return `${collective}无人摸牌`;
    return entries.map(entry =>
      `${entry.unit.name}${action(entry.unit, requested, entry.cards)}`).join("、");
  }

  // 归一化任意 draw() 的返回值。真实 BattleSession.draw 会在数组上挂非枚举
  // drawSignal；自定义 / 旧 draw 没有信号时按「实际到手数」兜底（signaled=false）。
  // 调用方据此判定「牌堆真的空了 / 封魔 / 被转交」，而不是靠固定重试次数猜。
  function signal(result, unit, requested, gained) {
    const raw = Array.isArray(result) ? result.drawSignal : result?.drawSignal;
    const drawn = raw ? Number(raw.drawn) || 0
      : Array.isArray(result) ? result.length : Math.max(0, Number(gained) || 0);
    return {
      signaled: !!raw,
      requested: Math.max(0, Number(requested) || 0),
      drawn,
      gained: Math.max(0, Number(gained) || 0),
      exhausted: raw ? !!raw.exhausted : drawn === 0,
      locked: raw ? !!raw.locked : !!unit?.drawLockedThisTurn,
      redirected: raw ? Number(raw.redirected) || 0 : 0,
    };
  }

  // 未补齐的原因文案。与 action() 的「未摸到牌」分开：那里描述摸牌动作，
  // 这里只解释「为什么没到手」，避免两条战报各写一遍「未摸到牌」。
  function shortage(sig) {
    if (sig?.locked) return "因封魔无法摸牌";
    if (sig?.redirected > 0 && sig.gained === 0) return "摸到的牌被吸魔邪眼转交";
    if (sig?.exhausted) return "牌堆已无可摸的牌";
    return "本次摸牌未到手";
  }

  return { action, count, team, signal, shortage };
})();
