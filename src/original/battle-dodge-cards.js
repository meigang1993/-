window.BattleDodgeCards = ({ deps, ctx, canDodge }) => {
  function count(target, card, limit = Infinity) {
    if (target?.noResponse) return 0;
    let total = 0;
    for (const candidate of target?.hand || []) {
      if (canDodge(card, candidate) && ++total >= limit) return total;
    }
    return total;
  }
  function pick(target, card, index) {
    const dodges = (target.hand || []).filter(item => canDodge(card, item));
    const first = dodges[Math.max(
      0, Math.min(index || 0, dodges.length - 1))];
    if (!first) return [];
    if (!(card?.krowFemaleTarget || card?.twoDodgesRequired)) return [first];
    const second = dodges.find(item => item !== first);
    return second ? [first, second] : [];
  }
  function view(unit, card, name) {
    const witherer =
      window.WithererSkills?.responseCard?.(unit, card, name) || card;
    return window.GuardKellySkills?.responseCard?.(
      unit, witherer, name) || witherer;
  }
  function play(state, target, actor, cards, reverseUid = null, threat = null) {
    const cut = !cards.some(card => card?.type === "slash")
      && ctx.hasSkill(actor, "剪切邪斩");
    const sources = cards.filter(Boolean);
    const played = sources.map(card => view(target, card, "闪"));
    const converted = played.find(card => card?.convertedFrom);
    const pile = cut || sources.some(card => card?.void || card?.copiedByEdis)
      ? "consumed" : "discard";
    const visibleNow = window.BattleCards.visibleHandCount(target);
    const visualHandBefore = Math.max(visibleNow,
      ...sources.map(card => Number(card?._visualHandBefore) || 0));
    const removable = sources.filter(source =>
      target.hand.includes(source) && !source._pendingDraw
      && (window.GuestCharacterSkills?.countsForLimit?.(target, source)
        ?? true)).length;
    window.BattleCards?.queueResponse?.(state.battle, target, {
      type: "response",
      id: `rs${deps.nextAnim()}`,
      uid: target.uid,
      side: target.side,
      // cards 为实际打出的每一张响应牌（双闪时是 2 张）：
      // 出牌区据此逐张记录，避免"打出 2 张闪却只显示 1 张"。
      // card 仍保留合并展示卡「闪×2」供飞行动画使用。
      cards: played.length > 1 ? played : null,
      card: played.length > 1
        ? { ...(converted || played[0]), name: "闪×2" } : played[0],
      // 出牌区文案必须与日志同口径：统一按「被响应的威胁牌」判使用/打出，
      // 而不是按响应牌本身。否则响应 AOE（机枪扫杀/万箭类）的【闪】
      // 会被误判为「使用了」——按三国杀它是「打出」，日志也是「打出」。
      // 弹反与【闪】同为响应单体【杀】的响应牌，威胁牌是单体杀时记「使用了」。
      action: threat ? `${responseAction(threat)}了` : null,
      pile,
      reverseUid,
    }, visualHandBefore, Math.max(0, visibleNow - removable));
    sources.forEach((source, cardIndex) => {
      if (!target.hand.includes(source)) return;
      target.hand.splice(target.hand.indexOf(source), 1);
      window.BattleCards?.put(
        state.battle, target, source, cut ? "consumed" : "discard",
        { skipAnim: true });
      window.NonokaLokiSkills?.afterCardResponded?.(
        state, target, actor, played[cardIndex], deps);
    });
    // 地雷描述限定「使用或打出响应牌」：响应 AOE 打出的是【杀】，
    // 属打出但非响应牌，不触发地雷（与决斗同等口径）。
    if (sources.some(card => card?.type === "response")) {
      window.BattleStatusCards?.triggerLandmine?.(state, target);
    }
  }
  function label(unit, cards) {
    const shown = cards.map(card => view(unit, card, "闪"));
    return shown.length > 1
      ? "两张闪" : `${shown[0].suit || ""}${shown[0].name}`;
  }
  const responseLabel = card =>
    card?.responseKind === "slash" ? "杀" : "闪";
  const responseAction = card =>
    // 三国杀口径：响应【杀】而出的【闪】属于「使用」（执行牌面效果）；
  // 响应万箭齐发类 AOE 的【闪】、响应南蛮入侵类 AOE 的【杀】都只是「打出」
  // （只用到牌面信息，不执行效果）。AOE 判定与 shouldManualDodge 同口径。
  card?.responseKind === "slash"
    || card?.sweep || card?.targetless || card?.allTargets || card?.aoeLineShown
    ? "打出" : "使用";
  return {
    count, pick, view, play, label, responseLabel, responseAction,
  };
};
