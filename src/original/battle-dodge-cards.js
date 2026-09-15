window.BattleDodgeCards = ({ deps, ctx, canDodge }) => {
  function count(target, card, limit = Infinity) {
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
  function play(state, target, actor, cards, reverseUid = null) {
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
      card: played.length > 1
        ? { ...(converted || played[0]), name: "闪×2" } : played[0],
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
    window.BattleStatusCards?.triggerLandmine?.(state, target);
  }
  function label(unit, cards) {
    const shown = cards.map(card => view(unit, card, "闪"));
    return shown.length > 1
      ? "两张闪" : `${shown[0].suit || ""}${shown[0].name}`;
  }
  const responseLabel = card =>
    card?.responseKind === "slash" ? "杀" : "闪";
  const responseAction = card =>
    card?.responseKind === "slash" ? "打出" : "使用";
  return {
    count, pick, view, play, label, responseLabel, responseAction,
  };
};
