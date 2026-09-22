window.BattleCombatAttackValues = api => {
  const { deps, damage, statOf, pushFloat, isSingleSlash } = api;
  const cardPower = api.cardPower || (card =>
    deps.isKillCard(card) ? 0 : card.power ?? card.damage ?? 0);

  function attackAmount(state, actor, card, base, clashOk) {
    const magic = statOf(actor, "magic");
    const attack = deps.tempAttack(actor);
    const statKey = window.CardUtils?.damageStatKey?.(actor, card);
    const bonus = statKey === "magic" ? magic
      : statKey === "attack" ? attack
        : card.virtual ? attack
          : card._skill ? 0
            : card.hybridAttack && card.type === "tactic" ? attack + magic
              : card.scale === "magic" ? magic
                : card.type === "slash" ? attack : magic;
    let amount = card.doubleOnClash && clashOk
      ? (base + bonus) * 2 : base + bonus;
    if (card.armoredRam) amount = attack + (actor.block || 0);
    if (card.shockHandCannonDouble) amount *= 2;
    if (!clashOk && deps.isKillCard(card)) amount = Math.floor(amount / 2);
    card.chargeMultiplier = 1;
    if (deps.isKillCard(card)
      && window.RelicSystem?.hasEquipped?.(state, actor, "艾尔拉娜白色丝袜")) {
      const speed = statOf(actor, "speed");
      amount += speed;
      window.BattleLog.add(state,
        `${actor.name} 的艾尔拉娜白色丝袜触发，杀牌额外增加${speed}点伤害。`);
    }
    if (deps.isKillCard(card) && actor.charge) {
      card.chargeMultiplier = Math.pow(2, actor.charge);
      amount *= card.chargeMultiplier;
      actor.charge = 0;
    }
    return amount;
  }

  function applyBerserkGrowth(state, actor, card) {
    if (!card?.berserkKill || card._berserkGrowthApplied) return;
    card._berserkGrowthApplied = true;
    actor.stats.attack = (actor.stats.attack || 0) + 1;
    window.BattleLog.add(state,
      `${actor.name} 使用暴走杀，本场战斗攻击力+1，当前为${actor.stats.attack}。`);
  }

  function modifyAttackAmount(state, actor, target, card, amount) {
    amount = window.NonokaLokiSkills?.modifySlashDamage?.(
      state, actor, target, amount, card) ?? amount;
    amount = window.WendyCadicisSkills?.modifySlashDamage?.(
      state, actor, target, amount, card) ?? amount;
    amount = window.ElranaAceNanaliSkills?.modifySlashDamage?.(
      state, actor, target, amount, card) ?? amount;
    amount = window.GuestCharacterSkills?.modifySlashDamage?.(
      state, actor, target, amount, card) ?? amount;
    amount = window.ArtinaMariaSkills?.modifySlashDamage?.(
      state, actor, target, amount, card) ?? amount;
    amount = window.AngelicaLukaSkills?.modifyDamage?.(
      state, actor, amount, card) ?? amount;
    amount = window.SakuraRisaSkills?.modifyRevengeDamage?.(
      state, actor, amount, card) ?? amount;
    amount = window.RuinsRelicEffects?.tacticDamage?.(
      state, actor, card, amount) ?? amount;
    return card.mannyDouble ? amount * 2 : amount;
  }

  function applyAttackRelics(state, actor, target, card) {
    if (isSingleSlash(card)
      && actor.ref === "manny" && actor.mannyWeapon === "ak47") {
      window.BattleLines?.skill(state, actor, "刺刀AK47");
      window.MannyGunSkinFX?.ak47Burst?.(state, actor, target);
      card.gatlingRepeats = (card.gatlingRepeats || 1) + 1;
    }
    if (!deps.isKillCard(card) || card._skipUseKillTriggers
      || actor.samuraiArmorUsed
      || !window.RelicSystem?.hasEquipped?.(state, actor, "武士铠甲")) return;
    const armor = actor.hand
      .filter(item => !item._pendingDraw && deps.isKillCard(item)).length;
    actor.samuraiArmorUsed = true;
    actor.block += armor;
    pushFloat(state.battle, actor.uid, "armor-gain", armor);
    window.BattleLog.add(state,
      `${actor.name} 的武士铠甲触发，获得${armor}点护甲。`);
  }

  function hitTarget(state, actor, target, card, amount) {
    let hit = false;
    // 结算次数动态读取：电钻火花等「造成伤害后再追加次数」的技能需要让循环感知新增次数；
    // 其余技能在循环内不改 gatlingRepeats，行为与原先取常量完全一致。
    for (let index = 0; index < (card.gatlingRepeats || 1) && target.hp > 0; index += 1) {
      // 电钻火花的追加段：整张杀仍属「一次攻击」，反击只应在第一段触发。
      // 此前每段各触发一次，骰子 6 时贝尔蒂丝一格洛特可打出 14 次反击杀。
      // 仅对龙的杀（_dragonDrillApplied）生效，其余连击技能行为不变。
      card._drillExtraHit = index > 0 && !!card._dragonDrillApplied;
      const result = damage(state, target, amount, card.name, actor, card);
      if (result?.hpLoss > 0) hit = true;
      if (window.BattleReactionQueue?.captureHitContinuation?.(
        state.battle, actor, target, amount, card.name, card,
        (card.gatlingRepeats || 1) - index - 1
      )) break;
    }
    delete card._drillExtraHit;
    return hit;
  }

  function baseCardCanFlame(actor, card) {
    return actor.ref === "manny" && actor.mannyWeapon === "flamer"
      && deps.isKillCard(card) && !card.sweep && !card.targetless
      && !card.allTargets && !card.aoeLineShown;
  }

  function slashTargetAmount(state, actor, target, card, amount, log = true) {
    if (!target || !deps.isKillCard(card)
      || !window.RelicSystem?.hasEquipped?.(state, actor, "名刀鬼切")) {
      return amount;
    }
    if (target.hp / Math.max(1, target.maxHp || target.stats?.maxHp || 1) >= .3) {
      return amount;
    }
    if (log) {
      window.BattleLog.add(state,
        `${actor.name} 的名刀鬼切触发，低生命目标${target.name}受到的杀牌伤害翻倍。`);
    }
    return amount * 2;
  }

  return {
    cardPower, attackAmount, applyBerserkGrowth, modifyAttackAmount, applyAttackRelics,
    hitTarget, baseCardCanFlame, slashTargetAmount,
  };
};
