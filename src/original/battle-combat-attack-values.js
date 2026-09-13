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
    const times = card.gatlingRepeats || 1;
    let hit = false;
    for (let index = 0; index < times && target.hp > 0; index += 1) {
      const result = damage(state, target, amount, card.name, actor, card);
      if (result?.hpLoss > 0) hit = true;
      if (window.BattleReactionQueue?.captureHitContinuation?.(
        state.battle, actor, target, amount, card.name, card,
        times - index - 1
      )) break;
    }
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
