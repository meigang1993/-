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

  // stagger：多张牌飞行的错峰间隔。默认逐张错峰（STAGGER_MS）；
  // 传 0 表示整批同时起飞、一次落位——用于「一次性摸等量牌」这类
  // 张数可多至十余张、逐张飞牌会明显拖长等待的技能。
  async function flyBackCards(options) {
    const {
      cards = [], count = cards.length, from, to, className = "",
      revealFace = true, enemy = false, active = () => true,
      stagger = STAGGER_MS,
    } = options;
    const start = point(from), end = point(to);
    if (!start || !end || !count) return;
    const total = count;
    const jobs = Array.from({ length: total }, async (_, index) => {
      if (index) await wait(index * stagger);
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
      stagger = STAGGER_MS,
    } = options;
    const start = point(from), end = point(to);
    if (!start || !end || !count) return;
    const total = Math.max(count, cards.length);
    const list = Array.from({ length: total }, (_, index) => cards[index] || {});
    const jobs = list.map(async (data, index) => {
      if (index) await wait(index * stagger);
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
      stagger: options.stagger ?? event.stagger,
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
      // 落位后再跑"获得牌"类被动（冰心双刺剑）：此时牌已进手且待定标记已清。
      // 必须早于 onArrive——onArrive 里的 syncIncomingHand 用 hand.includes(card)
      // 统计手牌数，改写牌面若在其之后会让计数漏加。
      window.RuinsRelicEffects?.afterCardsLanded?.(event);
    }
    options.onArrive?.();
    if (moving || clearPending) renderStep();
  }

  // 一次性放牌：整批扣置牌作为「一摞」一次飞到角色牌、一次落位。
  // 与 flyFrontCards 的本质区别：只创建 1 个 DOM、1 段动画、1 次落位音效，
  // 不再为每张牌各建一张并行飞（stagger:0 也只是 N 张同时原地飞，观感是
  // 一堆牌散开而非「一次性放到角色牌上」）。
  // 敌方目标 handSpot 退化成 unitArt 时起点终点重合，抬到角色牌上方起落，
  // 保证「放到角色牌上」这个动作看得见位移。
  async function placeStoredCards(options) {
    const {
      cards = [], count = cards.length, from, to,
      enemy = false, active = () => true,
    } = options;
    if (!count || !active()) return;
    const end = point(to);
    if (!end) return;
    let start = point(from);
    if (!start || Math.hypot(end.x - start.x, end.y - start.y) < 24) {
      start = { x: Math.max(16, end.x - 36), y: Math.max(16, end.y - 170) };
    }
    const stack = window.BattleEffectCardDOM.front(cards[0] || {}, enemy,
      "seal-card-fly stored-card-place");
    window.BattleEffectAnimation.stampCssTiming(stack);
    stack.style.left = `${start.x}px`;
    stack.style.top = `${start.y}px`;
    // 叠层：整批牌画成一摞（最多 3 层），角标写明本次一次性放了几张。
    for (let i = 1; i < Math.min(3, count); i++) {
      const layer = document.createElement("span");
      layer.className = "stored-place-layer";
      layer.style.setProperty("--layer", String(i));
      stack.appendChild(layer);
    }
    const badge = document.createElement("i");
    badge.className = "stored-place-count";
    badge.textContent = `×${count}`;
    stack.appendChild(badge);
    window.BattleFX?.cardMove?.();
    const dx = end.x - start.x, dy = end.y - start.y;
    await runAnim(stack, [
      { transform: "translate3d(0,0,0) rotate(-6deg) scale(.9)", opacity: 1 },
      { transform: `translate3d(${dx * .55}px,${dy * .5 - 24}px,0) rotate(3deg) scale(1)`, opacity: 1, offset: .55 },
      { transform: `translate3d(${dx}px,${dy}px,0) rotate(0deg) scale(.62)`, opacity: .28 },
    ], { duration: FLY_MS + 40, easing: FLIGHT_EASE, fill: "forwards" });
    if (!active()) return stack.remove();
    window.BattleFX?.cardLand?.();  // 整批只落位一次
    await wait(90);
    stack.remove();
  }

  return { flyBackCards, flyFrontCards, transfer, placeStoredCards };
};
