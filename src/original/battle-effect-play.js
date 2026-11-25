window.BattleEffectPlay = (() => {
  const { center, selectedCard, targetArt, publicZone, unitArt, wait, setLine, setLines, hideLine, projectile, runAnim } = window.BattleEffectUtils;
  const FLY_TARGET_MS = 280, HIT_HOLD_MS = 90, FLY_ZONE_MS = 170, FLY_DIRECT_MS = 300;
  const FLIGHT_EASE = "cubic-bezier(.16,1,.3,1)", SETTLE_EASE = "cubic-bezier(.4,0,.2,1)";
  const { isKillCard, isSingleKill: isSingleSlash } = window.CardUtils;
  const hasDamage = card => isKillCard(card) || (card?.power ?? card?.damage ?? 0) > 0;
  function convertedGroupAttack(actor, card, source, battle) {
    if (card?.crazyShooting) {
      const cost = actor?.hand?.[battle?.selectedCardIndex];
      return !!cost && !cost._pendingDraw && ["♥", "♦"].includes(cost.suit);
    }
    // 与 baseCardCanFlame 同口径：虚拟杀不再被当成"已转成群体"来播群体动画。
    if (actor?.ref === "manny" && actor.mannyWeapon === "flamer") {
      return isSingleSlash(card) && hasDamage(card)
        && !!window.CardUtils?.isEntityCard?.(card);
    }
    return !!window.OrcDungeonSkills?.beastSuppressionConverts?.(actor, source || card);
  }
  function groupTargetUids(actor, card, source, battle, foes) {
    const living = (foes || []).filter(unit => unit.hp > 0);
    if (Array.isArray(card?.allTargets)) {
      const allowed = new Set(living.map(unit => unit.uid));
      return card.allTargets.filter(uid => allowed.has(uid));
    }
    if (card?.allTargets || card?.sweep || card?.demonInvasion
      || card?.aoeLineShown || convertedGroupAttack(actor, card, source, battle)) {
      return living.map(unit => unit.uid);
    }
    return [];
  }
  async function playCard(state, commit, setAnimating, resolveIdle, setRenderFrozen, active = () => true) {
    if (!active()) return false;
    const card = selectedCard(), zone = publicZone(), b = state.battle, actor = window.BattleSystem?.active?.(b);
    const playedSource = b.selectedSkillCard || actor?.hand?.[b.selectedCardIndex], played = window.WithererSkills?.displayCard?.(actor, playedSource) || playedSource;
    // 技能牌是「发动技能」的结算载体，不是打出的牌：不播飞牌动画。
    // 数据层（played / shownPlayed / 战报 / 存档）完整保留，只跳过视觉飞行。
    // 与出牌区过滤（ui-battle-trail.js）同源判据 CardArt.isSkill。
    const isSkillCard = card => !!window.CardArt?.isSkill?.(card);
    const pendingTargets = (b?.pendingTargetUids || []).filter(uid => uid !== actor?.uid);
    const foes = actor?.side === "enemy" ? b?.allies : b?.enemies;
    const groupTargets = groupTargetUids(actor, played, playedSource, b, foes);
    const rawTargetUid = b?.pendingTargetUid && b.pendingTargetUid !== actor?.uid ? b.pendingTargetUid : null;
    // 【守护后方】：useCard 在 commit 里才把目标转移给防爆队，而飞行线在这里、
    // commit 之前就按 pendingTargetUid 画好了。不预测就会「线画向原目标、
    // 结算打在防爆队」，还会因 _playedTargetUid 对不上而补第二条虚拟飞行。
    // plannedTarget 是纯判定（不写日志/不播台词），与 useCard 里的 redirectTarget 同源。
    const rawTarget = rawTargetUid
      ? (b.allies || []).concat(b.enemies || []).find(u => u.uid === rawTargetUid)
      : null;
    const guardUid = rawTarget
      ? window.TenriInstituteSkills?.plannedTarget?.(
        state, actor, rawTarget, playedSource || played)?.uid : null;
    const targetUids = pendingTargets.length ? pendingTargets : groupTargets;
    const targetUid = guardUid || rawTargetUid;
    const art = targetUid ? targetArt(targetUid) : zone;
    const from = actor?.side === "ally" ? card || unitArt(actor?.uid) : unitArt(actor?.uid) || card;
    if (isSkillCard(playedSource) || isSkillCard(played)) return commit();
    if (!card || !zone || !art || !from || !played) return commit();
    let ok, committed = false, fly = null, failure = null;
    const commitOnce = () => {
      if (committed) return ok;
      const queuedBefore = b.animQueue?.length || 0;
      ok = commit();
      if (targetUids.length > 1) {
        (b.animQueue || []).slice(queuedBefore).forEach(event => {
          if (event.type === "virtualPlay" && event.uid === actor?.uid
            && event.targetUids?.join() === targetUids.join()) {
            event.skipTargetLine = true;
          }
        });
      }
      committed = true;
      return ok;
    };
    setAnimating(true);
    setRenderFrozen(true);
    try {
      if (targetUid || targetUids.length) {
        const arts = targetUids.map(targetArt).filter(Boolean);
        if (arts.length > 1) setLines(center(from), arts.map(center), true, actor?.side === "enemy");
        else setLine(center(from), center(arts[0] || art), true, actor?.side === "enemy");
        if (isKillCard(played)) { window.BattleEffectHandlers?.slashText({ uid: actor.uid, side: actor.side }); playedSource._slashTextShown = true; }
      }
      if (!active()) return false;
      fly = projectile(played, actor?.side === "enemy");
      // 与敌方出牌同一口径：起飞前等牌面图就绪（有上限，等不到就照旧飞），
      // 避免未缓存美术的牌飞过去是空白的。
      await window.BattleEffectCardDOM?.ready?.(fly, 320);
      if (!active()) return false;
      if (playedSource) {
        playedSource._playedFlightDone = true;
        playedSource._playedTargetUid = targetUid;
        if (targetUids.length > 1) {
          b._manualGroupFlightShown = true;
          played._playedFlightDone = true;
        }
      }
      const a = center(from), t = center(art), z = center(zone);
      fly.style.left = `${a.x}px`; fly.style.top = `${a.y}px`;
      BattleFX.cardMove();
      if (targetUid) await flyTargetThenZone(fly, a, t, z, active, commitOnce); else await flyDirectZone(fly, a, z, active, commitOnce);
      if (!active()) return false;
      hideLine(); fly.remove(); fly = null;
      if (!active()) return false;
      return commitOnce();
    } catch (err) {
      failure = err;
      console.error("出牌动画失败:", err.message, err.stack);
      throw err;
    } finally {
      if (b?._manualGroupFlightShown) delete b._manualGroupFlightShown;
      setRenderFrozen(false); if (active()) hideLine(); fly?.remove(); setAnimating(false); if (!failure && active()) window.render?.(); resolveIdle();
    }
  }
  async function flyTargetThenZone(fly, a, t, z, active, commit) {
    await runAnim(fly, [
      { transform: "translate3d(0, 0, 0) scale(.86) rotate(0deg)", opacity: 1 },
      { transform: `translate3d(${t.x - a.x}px, ${t.y - a.y}px, 0) scale(1.08) rotate(4deg)`, opacity: 1 }
    ], { duration: FLY_TARGET_MS, easing: FLIGHT_EASE, fill: "forwards" });
    if (!active()) return;
    BattleFX.cardLand();
    commit();
    await wait(HIT_HOLD_MS);
    if (!active()) return;
    await runAnim(fly, [
      { transform: `translate3d(${t.x - a.x}px, ${t.y - a.y}px, 0) scale(1.08) rotate(4deg)`, opacity: 1 },
      { transform: `translate3d(${z.x - a.x}px, ${z.y - a.y}px, 0) scale(.72) rotate(-8deg)`, opacity: 1 }
    ], { duration: FLY_ZONE_MS, easing: SETTLE_EASE, fill: "forwards" });
  }
  async function flyDirectZone(fly, a, z, active, commit) {
    await runAnim(fly, [
      { transform: "translate3d(0, 0, 0) scale(.86) rotate(0deg)", opacity: 1 },
      { transform: `translate3d(${z.x - a.x}px, ${z.y - a.y}px, 0) scale(.72) rotate(-8deg)`, opacity: 1 }
    ], { duration: FLY_DIRECT_MS, easing: FLIGHT_EASE, fill: "forwards" });
    if (active()) { BattleFX.cardLand(); commit(); }
  }
  return { playCard, groupTargetUids };
})();
