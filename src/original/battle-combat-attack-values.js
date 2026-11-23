window.BattleCombatAttackValues = api => {
  const { deps, damage, statOf, pushFloat, isSingleSlash } = api;
  const cardPower = api.cardPower || (card =>
    deps.isKillCard(card) ? 0 : card.power ?? card.damage ?? 0);

  function attackAmount(state, actor, card, base, clashOk) {
    const magic = statOf(actor, "magic");
    const attack = deps.tempAttack(actor);
    const statKey = window.CardUtils?.damageStatKey?.(actor, card);
    // hybridAttack 战术牌（【枪林弹雨】）必须优先按「攻击力 + 魔力」结算：
    // damageStatKey 对无 scale 的战术牌恒返回 "magic"，若让 statKey 抢先，复合分支
    // 永远不可达（实测只打出魔力那一份），与卡面「攻击力与魔力之和」不符。
    // 放在最前也保证【克罗研究记录】的 _repeat 复制牌与原牌同口径，不再出现数值漂移。
    const bonus = card.hybridAttack && card.type === "tactic" ? attack + magic
      : statKey === "magic" ? magic
        : statKey === "attack" ? attack
          : card.virtual ? attack
            // 【克罗研究记录】的额外结算复制牌带 _skill（用于跳过"从手牌移出"、
            // 并阻止再次触发额外结算），但它结算的仍是原牌的效果，伤害加成必须照算。
            // 此前一并落进 _skill 分支 → 加成被清零，第二次结算只打出裸伤害。
            : card._skill && !card._repeat ? 0
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
    const H = window.BattleHpValue;
    // 线性叠加：以首次发动时的「当前属性」为固定快照，每次只加同一份额，不链式累乘。
    if (!Number.isFinite(actor.berserkBaseAttack)) {
      actor.berserkBaseAttack = H.currentStat(actor, "attack");
    }
    const gain = H.pctStacks(actor.berserkBaseAttack, 10, 1);
    actor.stats.attack = (actor.stats.attack || 0) + gain;
    window.BattleLog.add(state,
      `${actor.name} 使用暴走杀，本场战斗攻击力按当前属性+10%（+${gain}），当前为${actor.stats.attack}。`);
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
    amount = window.SakuraRisaSkills?.modifyRevengeDamage?.(
      state, actor, amount, card) ?? amount;
    // 智能大脑此前挂在这里，但只有走攻击流程的战术牌（如带 sweep 的枪林弹雨）会经过本函数；
    // 与我一战 / 魔法对决 / 魔弹特攻 / 魔王军入侵等直连 ctx.damage，完全绕过这里 → 饰品无效。
    // 已改到 battle-damage-resolution.js 的统一伤害结算链，覆盖所有战术牌路径。
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
    // 结算次数动态读取：部分技能会在结算过程中增加次数，循环需感知新增次数；
    // 其余技能在循环内不改 gatlingRepeats，行为与原先取常量完全一致。
    for (let index = 0; index < (card.gatlingRepeats || 1) && target.hp > 0; index += 1) {
      const result = damage(state, target, amount, card.name, actor, card);
      if (result?.hpLoss > 0) {
        hit = true;
        // 【圣鹰剑】：伤害真正造成后才记「本回合对该目标造成过单体杀伤害」。
        window.HolyEagleSwordSkills?.recordHit?.(
          state, actor, target, card, result.hpLoss);
      }
      if (window.BattleReactionQueue?.captureHitContinuation?.(
        state.battle, actor, target, amount, card.name, card,
        (card.gatlingRepeats || 1) - index - 1
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
    if (!target || !deps.isKillCard(card)) return amount;
    // 【圣鹰剑】优先于名刀鬼切判定：旧实现里「没装备名刀鬼切就提前 return」，
    // 会把同挂点的其它饰品一起吞掉，故改为先逐项叠加再返回。
    let result = window.HolyEagleSwordSkills?.modifyDamage?.(
      state, actor, target, card, amount) ?? amount;
    if (!window.RelicSystem?.hasEquipped?.(state, actor, "名刀鬼切")) return result;
    if (target.hp / Math.max(1, target.maxHp || target.stats?.maxHp || 1) >= .3) {
      return result;
    }
    if (log) {
      window.BattleLog.add(state,
        `${actor.name} 的名刀鬼切触发，低生命目标${target.name}受到的杀牌伤害翻倍。`);
    }
    return result * 2;
  }

  return {
    cardPower, attackAmount, applyBerserkGrowth, modifyAttackAmount, applyAttackRelics,
    hitTarget, baseCardCanFlame, slashTargetAmount,
  };
};
