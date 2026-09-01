window.FloraSkills = (() => {
  const alive = unit => unit && unit.hp > 0;
  const visible = unit => (unit.hand || []).filter(card => !card._pendingDraw);
  const hasSkill = (unit, name) =>
    (unit?.skills || []).some(skill => skill.name === name);
  const singleKill = card => window.CardUtils.isSingleKill(card);
  const stat = (unit, key) => (unit.stats?.[key] || 0)
    + (key === "attack" ? (unit.tempAttack || 0)
      : key === "magic" ? (unit.tempMagic || 0) : 0);
  function discardOne(state, actor, target) {
    const index = target.hand.findIndex(card => !card._pendingDraw);
    if (index < 0) return;
    const discarded = target.hand.splice(index, 1)[0];
    window.BattleCards?.put(state.battle, target, discarded, "discard",
      { forcedDiscard: true });
    window.BattleLog.add(state,
      `${actor.name} 的刺杀弃置${target.name}一张${discarded.name}。`);
  }
  function dodgeAsFlash(state, target, actor, card, deps, excluded = [],
    canUse = null) {
    if (!target?.skills?.some(skill => skill.name === "神速之翼")) return null;
    const source = visible(target).find(item => !excluded.includes(item)
      && (!canUse || canUse({ ...item, name: "闪", type: "response" })));
    if (!source) return null;
    const visualHandBefore = window.BattleCards.visibleHandCount(target);
    target.hand.splice(target.hand.indexOf(source), 1);
    window.BattleCards?.put(state.battle, target, source, "discard",
      { skipAnim: true });
    window.BattleLines?.skill(state, target, "神速之翼", actor);
    window.FloraSonicSkinFX?.wing?.(state, target, actor);
    window.BattleLog.add(state,
      `${target.name} 发动神速之翼，将${source.name}转化为闪使用。`);
    const response = {
      ...source,
      name: "闪",
      type: "response",
      convertedFrom: source.name,
      _entitySourceCard: source,
      _visualHandBefore: visualHandBefore,
    };
    deps.afterCardResponded?.(state, target, actor, response, deps);
    return response;
  }
  function afterSlashDamage(state, actor, target, card, api) {
    if (!singleKill(card) || card._floraBlade || actor?.side !== "ally"
      || actor.ref === "flora" || target?.side !== "enemy") return;
    const flora = state.battle?.allies.find(unit =>
      unit.ref === "flora" && unit.uid !== actor.uid && alive(unit)
      && hasSkill(unit, "神速飞剑"));
    if (!flora || !alive(target)) return;
    const battle = state.battle;
    const turnNo = battle.turn || 0;
    if (battle.floraBladeTurn !== turnNo) {
      battle.floraBladeTurn = turnNo;
      battle.floraBladeTargets = [];
    }
    battle.floraBladeTargets ||= [];
    if (battle.floraBladeTargets.includes(target.uid)) return;
    battle.floraBladeTargets.push(target.uid);
    card._floraBlade = true;
    window.BattleLines?.skill(state, flora, "神速飞剑", target);
    window.FloraSonicSkinFX?.flyingBlade?.(state, flora, target);
    window.BattleLog.add(state,
      `${flora.name}：有破绽，机会来了，看我神速飞剑。`);
    discardOne(state, flora, target);
    const slash = window.CardUtils.fromEntity(
      "刺杀", { _floraBlade: true });
    if (window.FloraSonicSkinFX?.active?.(flora)) {
      slash._playedFlightDone = true;
      slash._playedTargetUid = target.uid;
    }
    api.damage(state, target, stat(flora, "attack"), "神速飞剑", flora, slash);
  }
  return { dodgeAsFlash, afterSlashDamage };
})();
