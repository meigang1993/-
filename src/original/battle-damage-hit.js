window.BattleDamageHit = ({
  deps, ctx, lifecycle, getTriggers, logSource,
}) => {
  function hitWithoutDodge(state, actor, target, amount, source, card) {
    const effectiveActor =
      window.NonokaLokiSkills?.sourceActor?.(state.battle, actor) || actor;
    if (card?._extraSlashResolution && !card._extraSlashTextQueued) {
      ctx.queueSlashText(state, actor, target, card);
      card._extraSlashTextQueued = true;
    }
    if (window.MannySkills?.transferSlash?.(
      state, actor, target, amount, source, card)) {
      return { dodged: false, hpLoss: 0 };
    }
    if (!card?.skipDamageModify
      && window.BertisGerlotSkills?.queueHeadshot?.(
        state, actor, target, amount, source, card, () => {
          hitWithoutDodge(state, actor, target, amount, source, card);
          lifecycle.finalizeDamage(state);
          ctx.checkEnd(state);
        })) return { dodged: false, hpLoss: 0 };
    amount = card?.skipDamageModify
      ? amount
      : window.BertisGerlotSkills?.modifyIncomingDamage?.(
        state, actor, amount, card) ?? amount;
    if (ctx.checkDefeat(state) || state.battle?.locked) {
      return { dodged: false, hpLoss: 0 };
    }
    ctx.holdVisual(target);
    const beforeBlock = target.block;
    const blocked = card.ignoreBlock ? 0 : Math.min(target.block, amount);
    const remain = amount - blocked;
    const critical = deps.isKillCard(card) && amount >= 5;
    const damageTypes =
      window.BattleDamageAttributes?.resolve(card, source, effectiveActor)
      || ["physical"];
    const attackType =
      window.BattleDamageAttributes?.attackType?.(card, source, actor)
      || "physical";
    const effectMeta = {
      damageTypes,
      effectCritical: critical,
      attackType,
      magicDamage: attackType === "magic",
      hybridAttack: !!card.hybridAttack,
    };
    state.battle.lastHitUid = target.uid;
    state.battle.hitFxId += 1;
    const defense = window.EnemySkills?.absorbDefense?.(
      state, target, remain, effectMeta) || { absorbed: 0, rest: remain };
    const hpLoss = defense.rest;
    const hpBefore = target.hp;
    target.block -= blocked;
    target.hp = Math.max(0, target.hp - hpLoss);
    window.SakuraRisaSkills?.preventDeath?.(state, target);
    window.BattleStats?.damage?.(
      state.battle, effectiveActor, target, Math.min(hpBefore, hpLoss), hpBefore);
    const armorBreak = beforeBlock > 0 && target.block === 0;
    const finalVisual = ctx.visualOf(target);
    const armorEffectMeta = blocked && !remain ? effectMeta : null;
    const damageEffectMeta = hpLoss ? effectMeta : null;
    ctx.pushFloat(
      state.battle, target.uid, armorBreak ? "armor-break" : "armor",
      blocked, false, 0, { visualBlock: finalVisual.visualBlock },
      null, armorEffectMeta);
    ctx.pushFloat(
      state.battle, target.uid, "damage", hpLoss, critical,
      blocked || defense.absorbed ? 150 : 0, finalVisual,
      card?.comboPartnerUid ? "组合进攻" : null, damageEffectMeta);
    card.lastHpLoss = hpLoss;
    card.totalHpLoss = (card.totalHpLoss || 0) + hpLoss;
    const resultText = defense.absorbed && !hpLoss
      ? `防御系统抵消${defense.absorbed}，未伤及本体`
      : `造成${hpLoss}伤害（护甲抵消${blocked}${defense.absorbed ? `，防御系统抵消${defense.absorbed}` : ""}）`;
    if (armorBreak) state.battle.lastArmorBreakUid = target.uid;
    window.BattleLog.add(
      state, `${logSource(effectiveActor, source)}对${target.name}${resultText}。`);
    window.GuardKellySkills?.afterHit?.(
      state, actor, target, card);
    if (!card?.noAfterDamageTriggers) {
      getTriggers().afterDamage(
        state, effectiveActor, target, card, hpLoss, blocked, actor);
    } else if (hpLoss) {
      window.BondiSkills?.afterDamage?.(
        state, effectiveActor, target, card, hpLoss);
    }
    lifecycle.markDefeated(state, target);
    ctx.checkDefeat(state);
    const extra = window.BattleDamageRelics.resolveEdisSwordHit(
      state, actor, target, amount, card, hitWithoutDodge);
    return {
      dodged: false,
      hpLoss: hpLoss + (extra?.hpLoss || 0),
      blockLoss: blocked + (extra?.blockLoss || 0),
    };
  }

  return { hitWithoutDodge };
};
