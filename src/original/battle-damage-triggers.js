window.BattleDamageTriggers = (api) => {
  const { deps, ctx, damage, directDamage } = api;
  function afterDodged(state, actor, target, card) {
    const b = state.battle, settling = b?.pendingVictory || b?.pendingDefeat || b?.victoryScreen || b?.defeat || b?.testComplete;
    if (!b || actor?.hp <= 0 || settling) return;
    if (!tsStopped(actor) && !tsStopped(target))
    window.WithererSkills?.afterDodged?.(state, actor, target, card);
    if (!tsStopped(target))
    window.ElranaAceNanaliSkills?.afterResponse?.(state, target, actor, { damage });
    window.BertisGerlotSkills?.afterDodge?.(state, actor, target, card, { damage });
    window.GuestCharacterSkills?.afterDodge?.(state, actor, target, card, { damage });
    if (!tsStopped(actor) && !tsStopped(target))
    window.RuinsEnemySkills?.afterDodged?.(state, actor, target, card);
    if (!deps.isKillCard(card)) return;
    if (!tsStopped(actor) && ctx.hasSkill(actor, "剪切邪斩")) {
      window.BattleLines?.skill(state, actor, "剪切邪斩", target);
      const drawn = deps.draw?.(actor, 1, state.battle);
      window.BattleLog.add(state, `${actor.name} 触发剪切邪斩，抵消本次杀的闪被剪碎并移入消耗牌堆，${actor.name}${window.BattleDrawFeedback.action(actor, 1, drawn)}。`);
    }
    const repeatedCard = soulBladeCard(actor, card);
    if (!repeatedCard || tsStopped(actor) || !ctx.hasSkill(actor, "追魂之刃") || typeof damage.useCard !== "function") return;
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
  // 时停：被标记角色的技能失效。此处按「效果归属方」逐条判断——只有归属方被时停才跳过，
  // 避免误伤（我方【锁魂镰刀】打被时停的敌人时仍应正常连锁）。时停只标记敌方，
  // 因此纯我方归属的分支无需加判（归属方永远不会被标记），下方不再逐个包裹。
  const tsStopped = unit => !!window.MieryulaTimeStop?.isSkillDisabled?.(unit);
  // 曼妮的武器效果归属「曼妮本人」，只有她被时停才失效。
  const tsStoppedManny = (a, b) => [a, b].some(u => u && u.ref === "manny" && tsStopped(u));
  function afterDamage(state, actor, target, card, hpLoss, blockLoss, cardUser = actor) {
    // directDamage 一并提供：电钻火花改为「追加多段伤害」而非增加结算次数，
    // 需要直接发伤害的接口。
    if (!tsStopped(actor) && !tsStopped(target))
    window.EnemySkills?.afterDamage?.(
      state, actor, target, card, hpLoss, damage, cardUser, directDamage);
    if (!tsStopped(target))
    window.SakuraRisaSkills?.afterDamage?.(state, target, hpLoss, deps.draw);
    if (!tsStoppedManny(actor, target))
    window.MannySkills?.afterDamage?.(state, actor, target, card, hpLoss, damage, directDamage);
    // blockLoss 一并提供：疯狂刺刀改为「造成生命值或护甲值伤害」即触发，
    // 全额被护甲吸收时 hpLoss 为 0，只看 hpLoss 会漏触发。
    if (!tsStopped(actor))
    window.FloraCarlosSkills?.afterSlashDamage?.(
      state, actor, target, card, hpLoss, { damage, directDamage, blockLoss });
    if (!tsStopped(actor) && !tsStopped(target))
    window.EdisSkills?.afterDamage?.(state, actor, target, card, hpLoss, damage, blockLoss);
    // 逐段结算：多段/连击的每一段各自触发一次（杰洛特【复仇反击】）。
    if (!tsStopped(target))
    window.BertisGerlotSkills?.afterDamage?.(state, actor, target, card, hpLoss, { damage });
    // 半魅魔血（星野一）逐段结算：多段/连击的每一段各自摸 3 张并弹一次交牌窗。
    if (!tsStopped(target))
    window.HoshinoSkills?.afterDamage?.(state, actor, target, card, hpLoss, { damage, draw: deps.draw, pushFloat: ctx.pushFloat });
    // 狂战（安洁莉卡）逐段结算：多段/连击的每一段各自获得 1 枚标记。
    window.AngelicaLukaSkills?.afterDamage?.(state, actor, target, card, hpLoss, { damage, draw: deps.draw, pushFloat: ctx.pushFloat });
    window.GuestCharacterSkills?.afterDamage?.(state, actor, target, card, hpLoss, { damage, draw: deps.draw, pushFloat: ctx.pushFloat });
    // 凋零者是敌方单位，会被时停标记；此处不加判会让鲜血之忆/勒脖/长舌头/
    // 镰刀额外回合在被时停时照常触发。
    if (!tsStopped(actor) && !tsStopped(target))
    window.WithererSkills?.afterDamage?.(state, actor, target, card, hpLoss, damage, deps.draw, ctx.pushFloat);
    if (!tsStopped(target))
    window.BondiSkills?.afterDamage?.(state, actor, target, card, hpLoss);
    if (!tsStopped(target))
    window.HitwellSkills?.afterDamage?.(
      state, actor, target, card, hpLoss, { damage, directDamage });
    if (!tsStopped(actor) && !tsStopped(target))
    window.BakarSkills?.afterDamage?.(state, actor, target, card, hpLoss);
    if (!tsStopped(actor) && !tsStopped(target))
    window.RuinsCardSkills?.applyVulnerable?.(state, actor, target, card);
    if (!tsStopped(actor) && !tsStopped(target))
    window.RuinsCardSkills?.stealAfterHit?.(state, actor, target, card);
    // 魔之连杀的连锁不在这里触发：afterDamage 只在命中后跑，被闪/被守护/被锁定
    // 时整条链不执行，额外目标会全部丢失。现改由 battle-damage.js 的伤害出口统一触发。
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
