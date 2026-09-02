window.BattleDamageTriggers = (api) => {
  const { deps, ctx, damage, directDamage } = api;
  function afterDodged(state, actor, target, card) {
    const b = state.battle, settling = b?.pendingVictory || b?.pendingDefeat || b?.victoryScreen || b?.defeat || b?.testComplete;
    if (!b || actor?.hp <= 0 || settling) return;
    window.WithererSkills?.afterDodged?.(state, actor, target, card);
    window.ElranaAceNanaliSkills?.afterResponse?.(state, target, actor, { damage });
    window.BertisGerlotSkills?.afterDodge?.(state, actor, target, card, { damage });
    window.GuestCharacterSkills?.afterDodge?.(state, actor, target, card, { damage });
    window.RuinsEnemySkills?.afterDodged?.(state, actor, target, card);
    if (!deps.isKillCard(card)) return;
    if (ctx.hasSkill(actor, "剪切邪斩")) {
      window.BattleLines?.skill(state, actor, "剪切邪斩", target);
      const drawn = deps.draw?.(actor, 1, state.battle);
      window.BattleLog.add(state, `${actor.name} 触发剪切邪斩，抵消本次杀的闪被剪碎并移入消耗牌堆，${actor.name}${window.BattleDrawFeedback.action(actor, 1, drawn)}。`);
    }
    const repeatedCard = soulBladeCard(actor, card);
    if (!repeatedCard || !ctx.hasSkill(actor, "追魂之刃") || typeof damage.useCard !== "function") return;
    repeatedCard._soulBladeRepeated = true;
    const replay = window.CardUtils.clean(repeatedCard, {
      virtual: true, _skipHandMove: true, _soulBladeRepeat: true,
      _soulBladeStatKey: window.CardUtils.damageStatKey(actor, repeatedCard),
      skipMvpCardCount: true,
    });
    window.CharacterSkinFX?.soulBlade?.(state, actor, target);
    window.BattleLog.add(state, `${actor.name} 触发追魂之刃，额外再次使用${repeatedCard.name}。`);
    window.BattleLines?.skill(state, actor, "追魂之刃");
    damage.useCard(state, actor, target, replay);
  }
  function soulBladeCard(actor, card) {
    if (card?._soulBladeRepeat || actor?.hp <= 0) return null;
    const source = card?.virtual ? card._entitySourceCard : card;
    if (!source || source.virtual || source._soulBladeRepeated) return null;
    return source;
  }
  function afterDamage(state, actor, target, card, hpLoss, blockLoss, cardUser = actor) {
    window.EnemySkills?.afterDamage?.(state, actor, target, card, hpLoss, damage, cardUser);
    window.SakuraRisaSkills?.afterDamage?.(state, target, hpLoss, deps.draw);
    window.MannySkills?.afterDamage?.(state, actor, target, card, hpLoss, damage, directDamage);
    window.FloraCarlosSkills?.afterSlashDamage?.(state, actor, target, card, hpLoss, { damage, directDamage });
    window.EdisSkills?.afterDamage?.(state, actor, target, card, hpLoss, damage, blockLoss);
    window.BertisGerlotSkills?.afterDamage?.(state, actor, target, card, hpLoss, { damage });
    window.AngelicaLukaSkills?.afterDamage?.(state, actor, target, card, hpLoss, { damage, draw: deps.draw, pushFloat: ctx.pushFloat });
    window.ElranaAceNanaliSkills?.afterDamage?.(state, actor, target, card, hpLoss, { damage, draw: deps.draw, pushFloat: ctx.pushFloat });
    window.GuestCharacterSkills?.afterDamage?.(state, actor, target, card, hpLoss, { damage, draw: deps.draw, pushFloat: ctx.pushFloat });
    window.HoshinoSkills?.afterDamage?.(state, actor, target, card, hpLoss, { damage, draw: deps.draw, pushFloat: ctx.pushFloat });
    window.WithererSkills?.afterDamage?.(state, actor, target, card, hpLoss, damage, deps.draw, ctx.pushFloat);
    window.BondiSkills?.afterDamage?.(state, actor, target, card, hpLoss);
    window.BakarSkills?.afterDamage?.(state, actor, target, card, hpLoss);
    window.BertisGerlotSkills?.refreshArrogance?.(state);
    window.BertisGerlotSkills?.afterAnyDeath?.(state);
    if (!hpLoss || !window.CardUtils?.isSingleKill?.(card)
      || card.soulScythe || !ctx.hasSkill(actor, "锁魂镰刀")) return;
    triggerSoulScythe(state, actor);
  }
  function triggerSoulScythe(state, actor) {
    const amount = ctx.statOf(actor, "magic");
    if (!amount) return;
    for (let chain = 0; chain < 4; chain++) {
      const before = state.battle.enemies.filter(e => e.hp > 0).map(e => ({ enemy: e, hp: e.hp }));
      if (!before.length) return;
      window.BattleLines?.skill(state, actor, "锁魂镰刀");
      window.CharacterSkinFX?.soulScythe?.(state, actor, before.map(({ enemy }) => enemy), chain);
      ctx.queueSlashPlay(state, actor, before.map(({ enemy }) => enemy.uid), { name: "锁魂镰刀", type: "slash", virtual: true, targetless: true });
      before.forEach(({ enemy }) => { if (enemy.hp > 0) directDamage(state, enemy, amount, "锁魂镰刀", actor, chain * 180, { name: "锁魂镰刀", type: "skill", soulScythe: true, magicDamage: true, ignoreBlock: true, skipDamageModify: true }); });
      if (!before.some(({ enemy, hp }) => hp > 0 && enemy.hp <= 0)) return;
    }
  }
  return { afterDodged, afterDamage };
};
