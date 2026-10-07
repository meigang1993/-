window.BattleReactionQueueRun = (() => {
  const units = battle => (battle?.allies || []).concat(battle?.enemies || []);

  function activateShare(state) {
    const battle = state?.battle;
    if (!battle || battle.kaiichiShare || !battle.kaiichiShareQueue?.length || battle.locked) return false;
    return !!window.HoshinoSkills?.activateShare?.(state);
  }

  function run(state, action, damage) {
    const battle = state.battle, roster = units(battle);
    if (action.kind === "damage" || action.kind === "directDamage" || action.kind === "resolvedHit") {
      const actor = roster.find(unit => unit.uid === action.actorUid);
      const target = roster.find(unit => unit.uid === action.targetUid && unit.hp > 0);
      if (actor && target) {
        if (action.skillName) window.BattleLines?.skill?.(state, actor, action.skillName, target);
        if (action.logText) window.BattleLog?.add?.(state, action.logText);
        const card = action.prepareGroupKill
          ? (window.EnemySkills?.prepareGroupKillTarget?.(state, actor, target, action.card) || action.card)
          : action.card;
        const hit = action.kind === "resolvedHit" && damage.hitWithoutDodge
          ? damage.hitWithoutDodge
          : action.kind === "directDamage" && damage.directDamage
            ? damage.directDamage
            : damage;
        const result = action.kind === "resolvedHit"
          ? hit(state, actor, target, action.amount, action.source, card)
          : action.kind === "directDamage"
            ? hit(state, target, action.amount, action.source, actor, action.delay || 0, card)
            : hit(state, target, action.amount, action.source, actor, card);
        if (result?.dodged && action.edisGroupHealCard?._edisDarkBlocked) action.edisGroupHealCard._edisDarkBlocked.add(target.uid);
      }
      return;
    }
    if (window.EnemySkills?.resolveReactionAction?.(state, action, damage)) return;
    if (window.AngelicaLukaSkills?.resolveReactionAction?.(state, action, damage)) return;
    if (action.kind === "kaiichiBloodHeal") {
      window.HoshinoSkills?.resolveBloodHeal?.(state, action, {
        damage,
        draw: window.BattleSystem?.draw,
        pushFloat: window.BattleSystem?.pushFloat,
      });
    }
  }
  return { activateShare, run };
})();
