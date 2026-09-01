window.BattleEffectCardMotion = U => {
  const FLY_MS = 360;
  const FLIP_MS = 140;
  const STAGGER_MS = 100;
  const FLIGHT_EASE = "cubic-bezier(.16,1,.3,1)";
  const { center, wait, waitCss, runAnim } = U;
  const point = value => typeof value?.getBoundingClientRect === "function"
    ? center(value) : value;

  async function reveal(card, visible, active) {
    const inner = card.querySelector(".card-flight-inner");
    if (!inner || !active()) return;
    await runAnim(inner, [
      { transform: "rotateY(180deg)" },
      { transform: "rotateY(90deg)", offset: .5 },
      { transform: visible ? "rotateY(0deg)" : "rotateY(180deg)" },
    ], { duration: FLIP_MS, easing: "ease-out", fill: "forwards" });
    if (visible) {
      card.classList.remove("is-back");
      card.classList.add("is-front");
      card.dataset.cardFace = "front";
    }
  }

  async function flyBackCards(options) {
    const {
      cards = [], count = cards.length, from, to, className = "",
      revealFace = true, enemy = false, active = () => true,
    } = options;
    const start = point(from), end = point(to);
    if (!start || !end || !count) return;
    const total = count;
    const jobs = Array.from({ length: total }, async (_, index) => {
      if (index) await wait(index * STAGGER_MS);
      if (!active()) return;
      const card = window.BattleEffectCardDOM.back(
        cards[index] || {}, enemy, className);
      window.BattleEffectAnimation.stampCssTiming(card);
      card.style.left = `${start.x}px`;
      card.style.top = `${start.y}px`;
      window.BattleFX?.cardMove?.();
      const dx = end.x - start.x + (index - (total - 1) / 2) * 7;
      const dy = end.y - start.y;
      await runAnim(card, [
        { transform: `translate3d(0,0,0) rotate(${8 + index * 2}deg) scale(.78)`, opacity: 1 },
        { transform: `translate3d(${dx * .55}px,${dy * .35 - 34}px,0) rotate(${2 - index}deg) scale(.92)`, opacity: 1, offset: .48 },
        { transform: `translate3d(${dx}px,${dy}px,0) rotate(${-3 + index}deg) scale(.72)`, opacity: 1 },
      ], { duration: FLY_MS, easing: FLIGHT_EASE, fill: "forwards" });
      if (!active()) return card.remove();
      window.BattleFX?.cardLand?.();
      await reveal(card, revealFace, active);
      await wait(60);
      card.remove();
    });
    await Promise.all(jobs);
  }

  async function flyFrontCards(options) {
    const {
      cards = [], count = cards.length, from, to, className = "",
      enemy = false, burn = false, fadeOut = true, active = () => true,
    } = options;
    const start = point(from), end = point(to);
    if (!start || !end || !count) return;
    const total = Math.max(count, cards.length);
    const list = Array.from({ length: total }, (_, index) => cards[index] || {});
    const jobs = list.map(async (data, index) => {
      if (index) await wait(index * STAGGER_MS);
      if (!active()) return;
      const card = window.BattleEffectCardDOM.front(data, enemy, className);
      window.BattleEffectAnimation.stampCssTiming(card);
      card.style.left = `${start.x}px`;
      card.style.top = `${start.y}px`;
      window.BattleFX?.cardMove?.();
      const dx = end.x - start.x + (index - (list.length - 1) / 2) * 6;
      const dy = end.y - start.y;
      await runAnim(card, [
        { transform: "translate3d(0,0,0) rotate(0deg) scale(.84)", opacity: 1 },
        { transform: `translate3d(${dx * .58}px,${dy * .42 - 30}px,0) rotate(${index % 2 ? 4 : -4}deg) scale(.96)`, opacity: 1, offset: .52 },
        { transform: `translate3d(${dx}px,${dy}px,0) rotate(${index % 2 ? 7 : -7}deg) scale(.7)`, opacity: burn || !fadeOut ? 1 : .18 },
      ], { duration: FLY_MS, easing: FLIGHT_EASE, fill: "forwards" });
      if (!active()) return card.remove();
      window.BattleFX?.cardLand?.();
      if (burn) {
        window.BattleFX?.burn?.();
        const face = card.querySelector(".card-flight-front") || card;
        face.classList.add("burning-card", "burning-active");
        await waitCss(face, 820);
      }
      card.remove();
    });
    await Promise.all(jobs);
  }

  async function transfer(
    event, from, to, className, renderStep,
    clearPending = false, active = () => true, options = {},
  ) {
    const moving = !!(from && to && event.count);
    const shared = {
      cards: event.cards || [], count: event.count || 0,
      from, to, className,
      enemy: options.enemy ?? event.side === "enemy", active,
      fadeOut: options.fadeOut !== false,
    };
    if (options.face === "front") await flyFrontCards(shared);
    else {
      await flyBackCards({
        ...shared,
        revealFace: options.revealFace !== false,
      });
    }
    if (!active()) return;
    if (clearPending) {
      (event.cards || []).forEach(card => { delete card._pendingDraw; });
    }
    options.onArrive?.();
    if (moving || clearPending) renderStep();
  }

  return { flyBackCards, flyFrontCards, transfer };
};
