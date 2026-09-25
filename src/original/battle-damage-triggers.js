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
    // directDamage 一并提供：电钻火花改为「追加多段伤害」而非增加结算次数，
    // 需要直接发伤害的接口。
    window.EnemySkills?.afterDamage?.(
      state, actor, target, card, hpLoss, damage, cardUser, directDamage);
    window.SakuraRisaSkills?.afterDamage?.(state, target, hpLoss, deps.draw);
    window.MannySkills?.afterDamage?.(state, actor, target, card, hpLoss, damage, directDamage);
    // blockLoss 一并提供：疯狂刺刀改为「造成生命值或护甲值伤害」即触发，
    // 全额被护甲吸收时 hpLoss 为 0，只看 hpLoss 会漏触发。
    window.FloraCarlosSkills?.afterSlashDamage?.(
      state, actor, target, card, hpLoss, { damage, directDamage, blockLoss });
    window.EdisSkills?.afterDamage?.(state, actor, target, card, hpLoss, damage, blockLoss);
    // 电钻火花追加段（_drillExtraHit）不触发反击：连击多段属同一次攻击，
    // 反击只在第一段入队，否则骰子点数会线性放大反击次数。
    if (!card?._drillExtraHit) {
      window.BertisGerlotSkills?.afterDamage?.(state, actor, target, card, hpLoss, { damage });
    }
    // 受击触发类（受伤后摸牌/交牌）按设计逐段结算：半魅魔血每段各摸2张并各弹一次
    // 交牌选择是预期行为，不做合并。
    window.HoshinoSkills?.afterDamage?.(state, actor, target, card, hpLoss, { damage, draw: deps.draw, pushFloat: ctx.pushFloat });
    window.AngelicaLukaSkills?.afterDamage?.(state, actor, target, card, hpLoss, { damage, draw: deps.draw, pushFloat: ctx.pushFloat });
    window.GuestCharacterSkills?.afterDamage?.(state, actor, target, card, hpLoss, { damage, draw: deps.draw, pushFloat: ctx.pushFloat });
    window.WithererSkills?.afterDamage?.(state, actor, target, card, hpLoss, damage, deps.draw, ctx.pushFloat);
    window.BondiSkills?.afterDamage?.(state, actor, target, card, hpLoss);
    window.BakarSkills?.afterDamage?.(state, actor, target, card, hpLoss);
    window.RuinsCardSkills?.applyVulnerable?.(state, actor, target, card);
    window.RuinsCardSkills?.stealAfterHit?.(state, actor, target, card);
    window.RuinsCardSkills?.chainExtraTargets?.(state, actor, target, card, damage);
    window.BertisGerlotSkills?.refreshArrogance?.(state);
    window.BertisGerlotSkills?.afterAnyDeath?.(state);
    // 锁魂镰刀仅由实体单体【杀】触发：技能生成的虚拟【杀】不触发。
    // 转换杀由手牌实体牌转换而来（convertedFrom，非 virtual），仍算实体牌。
    if (!hpLoss || !window.CardUtils?.isEntitySingleKill?.(card)
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
