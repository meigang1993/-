window.HoshinoKaiichiSkills = (() => {
  const alive = unit => unit && unit.hp > 0;
  const hasSkill = (unit, name) => (unit?.skills || []).some(skill => skill.name === name);
  const allUnits = battle => battle.allies.concat(battle.enemies);
  const stat = (unit, key) => (unit.stats?.[key] || 0)
    + (key === "attack" ? (unit.tempAttack || 0) : key === "magic" ? (unit.tempMagic || 0) : 0);
  const share = window.HoshinoKaiichiShare({ alive, allUnits });

  function beginTurn(state, unit) {
    if (unit?.ref === "hoshino_kaiichi") unit.usedKaiichiMilk = false;
  }

  function handleSpecialCard(state, actor, target, card, deps) {
    if (!card.kaiichiMilk) return false;
    if (actor.usedKaiichiMilk || !alive(target)
      || target.side !== actor.side || target.gender !== "female") return true;
    actor.usedKaiichiMilk = true;
    window.BattleLines?.skill(state, actor, "半魅魔精华", target);
    if (target.ref !== "hoshino_yi") {
      const damageCard = {
        name: "半魅魔精华",
        type: "skill",
        magicDamage: true,
        attackType: "magic",
        ignoreResponse: true,
        skipDamageModify: true,
      };
      deps.damage(state, actor, stat(target, "magic"), "半魅魔精华", target, damageCard);
    } else window.BattleLines?.skill(state, target, "半魅魔精华回应", actor);
    const count = Math.max(0, 2 + (actor.stats?.drawPerTurn || 0));
    const drawn = deps.draw(target, count, state.battle);
    applyGreenHat(state, target);
    window.BattleLog.add(state,
      `${actor.name}对${target.name}发动半魅魔精华，${target.name}${window.BattleDrawFeedback.action(target, count, drawn)}。`);
    return true;
  }

  function afterDamage(state, actor, target, card, hpLoss, deps) {
    if (!hpLoss || !alive(target) || target.ref !== "hoshino_kaiichi"
      || !hasSkill(target, "半魅魔血")) return;
    const drawn = deps.draw(target, 2, state.battle);
    const yi = state.battle.allies.find(unit => unit.ref === "hoshino_yi" && alive(unit));
    const shareQueued = share.queueShare(state, target, actor);
    if (!shareQueued) share.scheduleBloodCaption(state, target, actor);
    const healAction = yi && {
      kind: "kaiichiBloodHeal",
      unitUid: target.uid,
      healerUid: yi.uid,
      amount: stat(yi, "magic"),
    };
    const queued = healAction && shareQueued && state.battle?._damageDepth
      && window.BattleReactionQueue?.enqueue?.(state, healAction);
    if (healAction && !queued) heal(state, target, healAction.amount, yi, deps);
    window.BattleLog.add(state,
      `${target.name}受到生命值伤害，半魅魔血令其${window.BattleDrawFeedback.action(target, 2, drawn)}${yi ? `并接受${yi.name}治疗` : ""}。`);
  }

  function resolveBloodHeal(state, action, deps) {
    const target = allUnits(state.battle).find(unit => unit.uid === action?.unitUid);
    const healer = state.battle?.allies.find(unit => unit.uid === action?.healerUid);
    if (!alive(target) || !alive(healer)) return false;
    heal(state, target, action.amount, healer, deps);
    return true;
  }

  function heal(state, target, amount, healer, deps) {
    const allowed = window.EnemySkills?.beforeHeal?.(
      state, target, amount, healer, { name: "半魅魔血" }, deps.damage);
    const healed = Math.min(target.maxHp - target.hp, Math.max(0, allowed ?? amount));
    if (healed > 0) {
      target.hp += healed;
      window.BattleStats?.heal?.(state.battle, healer, healed);
      deps.pushFloat?.(state.battle, target.uid, "heal", healed);
      window.EnemySkills?.clearHolyScar?.(state, target);
      window.EnemySkills?.onHeal?.(state, deps.draw);
      window.ElranaAceNanaliSkills?.afterHeal?.(state, target, deps, healer);
      window.BertisGerlotSkills?.refreshArrogance?.(state);
    }
    window.BattleLines?.skill(state, healer, "半魅魔血治疗", target);
  }

  function applyGreenHat(state, target) {
    const map = {
      angelica: "luka",
      nonoka: "loki",
      elrana: "ace",
      manny: "miller",
      wendy: "cadicis",
      flora: "carlos",
      bertis: "gerlot",
      nanali: "lokar",
      besta: "lokar",
    };
    const unit = state.battle.allies.find(item => item.ref === map[target.ref] && alive(item));
    if (!window.GreenHat.grant(unit)) return;
    window.BattleLog.add(state,
      `${unit.name}因${target.name}获得绿帽标记${unit.greenHat}/5，手牌上限、杀意上限各+1，攻击力+30%。`);
  }

  return {
    beginTurn,
    handleSpecialCard,
    afterDamage,
    resolveBloodHeal,
    toggleShareCard: share.toggleShareCard,
    resolveShare: share.resolveShare,
    activateShare: share.activateShare,
    shareVisible: share.shareVisible,
  };
})();
