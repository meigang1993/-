window.BattleEffectPlayedCardFlight = U => {
  const FLY_FAST_MS = 170;
  const FLY_MID_MS = 280;
  const FLY_DIRECT_MS = 300;
  const HIT_HOLD_MS = 90;
  // 飞行牌的牌面图是异步加载的：BattleEffectCardDOM.bindArt 给每张飞行牌建了
  // cardArtReady Promise，但此前没有任何一处 await 它——projectile() 一建出
  // 元素就立刻 runAnim，飞完就 remove()。
  // 后果：战斗中才拿到、美术尚未缓存的牌（偷/摸/转化来的非初始牌）往往在
  // 图还没解码完时就被删掉，玩家看到的是「牌飞过去了但空的」，也就是反馈里
  // 的「动画卡没了」。
  // 这里在起飞前等一下美术，但有硬上限：本地资源通常几毫秒就就绪，等不到就
  // 照旧起飞，绝不因为一张图把整场动画拖住（这才是「卡顿」的另一半）。
  const ART_READY_BUDGET_MS = 320;
  const FLIGHT_EASE = "cubic-bezier(.16,1,.3,1)";
  const SETTLE_EASE = "cubic-bezier(.4,0,.2,1)";
  const {
    center, wait, waitHold = wait, setLine, setLines, setComboLines, flashComboPartner,
    hideLine, projectile, runAnim,
  } = U;

  function showSlashText(reference) {
    if (!reference?.slashText) return;
    window.BattleEffectHandlers?.slashText(reference);
    if (reference.card) reference.card._slashTextShown = true;
  }

  async function flyPlayAoe(
    card, from, targets, zone, enemyLine, event = null, active = () => true,
  ) {
    const start = center(from);
    const points = targets.map(center);
    const end = center(zone || targets[0]);
    if (!event?.skipTargetLine) setLines(start, points, true, !!enemyLine);
    showSlashText(event);
    if (!active()) return;
    const fly = projectile(card, !!enemyLine);
    await window.BattleEffectCardDOM?.ready?.(fly, ART_READY_BUDGET_MS);
    if (!active()) { fly.remove(); return; }
    fly.style.left = `${start.x}px`;
    fly.style.top = `${start.y}px`;
    BattleFX.cardMove();
    await runAnim(fly, [
      { transform: "translate3d(0, 0, 0) scale(.86) rotate(0deg)", opacity: 1 },
      {
        transform: `translate3d(${end.x - start.x}px, ${end.y - start.y}px, 0) scale(.72) rotate(-8deg)`,
        opacity: 1,
      },
    ], {
      duration: FLY_DIRECT_MS,
      easing: FLIGHT_EASE,
      fill: "forwards",
    });
    if (!active()) {
      fly.remove();
      return;
    }
    BattleFX.cardLand();
    fly.remove();
    if (!event?.preserveTargetLine) hideLine();
  }

  async function flyPlay(
    card, from, to, zone, targeted, enemyLine,
    partner = null, event = null, active = () => true,
  ) {
    if (targeted) {
      if (partner) {
        setComboLines(center(from), center(partner), center(to), !!enemyLine);
        flashComboPartner(partner);
      } else setLine(center(from), center(to), true, !!enemyLine);
      showSlashText(event);
      if (!active()) return;
    }
    const fly = projectile(card, !!enemyLine);
    await window.BattleEffectCardDOM?.ready?.(fly, ART_READY_BUDGET_MS);
    if (!active()) { fly.remove(); return; }
    const start = center(from);
    const target = center(to);
    const end = center(zone || to);
    fly.style.left = `${start.x}px`;
    fly.style.top = `${start.y}px`;
    BattleFX.cardMove();
    if (targeted) {
      await runAnim(fly, [
        { transform: "translate3d(0, 0, 0) scale(.86) rotate(0deg)", opacity: 1 },
        {
          transform: `translate3d(${target.x - start.x}px, ${target.y - start.y}px, 0) scale(1.08) rotate(4deg)`,
          opacity: 1,
        },
      ], {
        duration: FLY_MID_MS,
        easing: FLIGHT_EASE,
        fill: "forwards",
      });
      if (!active()) {
        fly.remove();
        return;
      }
      BattleFX.cardLand();
      await waitHold(HIT_HOLD_MS, event);
      if (!active()) {
        fly.remove();
        return;
      }
      await runAnim(fly, [
        {
          transform: `translate3d(${target.x - start.x}px, ${target.y - start.y}px, 0) scale(1.08) rotate(4deg)`,
          opacity: 1,
        },
        {
          transform: `translate3d(${end.x - start.x}px, ${end.y - start.y}px, 0) scale(.72) rotate(-8deg)`,
          opacity: 1,
        },
      ], {
        duration: FLY_FAST_MS,
        easing: SETTLE_EASE,
        fill: "forwards",
      });
    } else {
      await runAnim(fly, [
        { transform: "translate3d(0, 0, 0) scale(.86) rotate(0deg)", opacity: 1 },
        {
          transform: `translate3d(${end.x - start.x}px, ${end.y - start.y}px, 0) scale(.72) rotate(-8deg)`,
          opacity: 1,
        },
      ], {
        duration: FLY_DIRECT_MS,
        easing: FLIGHT_EASE,
        fill: "forwards",
      });
    }
    if (!active()) {
      fly.remove();
      return;
    }
    if (!targeted) BattleFX.cardLand();
    fly.remove();
    if (!event?.preserveTargetLine) hideLine();
  }

  return { flyPlayAoe, flyPlay };
};
