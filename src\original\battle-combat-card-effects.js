window.BattleCombatCardEffects = api => {
  const {
    deps, specials, useCard, damage, statOf, pushFloat,
    checkDefeat, checkEnd, repeatIfDone,
  } = api;

  function resolve(state, actor, target, card) {
    if (card.slime) {
      actor.intent = Math.max(0, (actor.intent || 0) - 1);
      window.BattleLog.add(state, `${actor.name} 消耗1点杀意使用粘液，将其移入消耗牌堆。`);
      return true;
    }
    if (card.statusKey) {
      window.BattleStatusCards?.apply?.(state, actor, target, card);
      return true;
    }
    if (card.ruinsPlaceLandmine || card.ruinsSnipe || card.ruinsBackstab) {
      return run(() => window.RuinsEnemySkills?.useSkillCard?.(state, actor, target, card, damage),
        () => specials.repeatTactic?.(state, actor, target, card));
    }
    if (card.charge) {
      actor.charge = (actor.charge || 0) + card.charge;
      const multiplier = Math.pow(1.5, actor.charge).toFixed(3).replace(/\.0+$/, "").replace(/0+$/, "");
      window.BattleLog.add(state, `${actor.name} 蓄力${actor.charge}层，下一张杀牌伤害×${multiplier}。`);
      specials.repeatTactic(state, actor, target, card);
      return true;
    }
    if (card.radar) return run(() => window.EnemySkills?.useRadar(state, actor, target), () => specials.repeatTactic(state, actor, target, card));
    if (card.poisonGrenade) return run(() => window.EnemySkills?.useGrenade(state, actor), () => specials.repeatTactic(state, actor, target, card));
    if (card.flashbang) return run(() => window.UnderwaterTrainSkills?.useFlashbang(state, actor));
    if (card.bullHammer) return run(() => window.EnemySkills?.useHammer(state, actor, damage), () => specials.repeatTactic(state, actor, target, card));
    if (card.controlEye) return run(() => window.UnderwaterTrainSkills?.useControlEye(state, actor, damage, deps.draw));
    if (card.droneExtract) return run(() => window.OrcDungeonSkills?.useDroneExtract(state, actor, target));
    if (card.magicMissile) return run(() => window.OrcDungeonSkills?.useMagicMissile(state, actor, target, useCard));
    if (card.withererPeek) return run(() => window.WithererSkills?.usePeek(state, actor, target));
    if (card.withererShift) return run(() => window.WithererSkills?.useShift(state, actor));
    if (card.warHorn) return run(() => window.WithererSkills?.useWarHorn(state, actor, deps.draw, deps.intentMax), () => specials.repeatTactic(state, actor, target, card));
    if (card.withererTongueActive) {
      card.skipAfterCardPlayed = true;
      card.skipMvpCardCount = true;
      repeatIfDone(state, actor, target, card,
        window.WithererSkills?.useTongueActive(
          state, actor, target, card, useCard));
      return true;
    }
    if (card.armyOrder) return run(() => window.BakarSkills?.useArmyOrder?.(state, actor, card, useCard));
    if (card.dragonSlash) return run(() => window.AbeMikeSkills?.useDragonSlash(state, actor));
    if (card.mannyArmory) return run(() => window.MannySkills?.chooseArmory(state, actor));
    if (card.mannyBarrett) return run(() => window.MannySkills?.barrett(state, actor));
    if (card.elranaBag) return run(() => repeatIfDone(state, actor, target, card, specials.exchangeSelectedCards(state, actor, card)));
    if (card.extract) {
      specials.extractEssence(state, actor, target);
      checkDefeat(state);
      checkEnd(state);
      return true;
    }
    if (card.bloodPact) return run(() => specials.bloodPact(state, actor));
    if (card.bloodletting) {
      const intended = Math.max(1, Math.floor(actor.maxHp * .1));
      const before = actor.hp;
      actor.hp = Math.max(1, actor.hp - intended);
      const loss = before - actor.hp;
      pushFloat(state.battle, actor.uid, "hp-loss", loss);
      const drawn = deps.draw(actor, 1, state.battle);
      actor.intent = Math.min(deps.intentMax(actor), (actor.intent || 0) + 1);
      const drawText = window.BattleDrawFeedback.action(actor, 1, drawn);
      window.BattleLog.add(state, `${actor.name} 使用放血，损失${loss}点生命，${drawText}并恢复1点杀意。`);
      specials.repeatTactic(state, actor, target, card);
      return true;
    }
    if (card.armSelf) {
      const armor = statOf(actor, "attack");
      actor.block += armor;
      pushFloat(state.battle, actor.uid, "armor-gain", armor);
      window.BattleLog.add(state, `${actor.name} 使用武装，获得${armor}点护甲。`);
      specials.repeatTactic(state, actor, target, card);
      return true;
    }
    if (card.drawCards) {
      let drawn;
      return run(() => { drawn = deps.draw(actor, card.drawCards, state.battle); }, () => {
        const drawText = window.BattleDrawFeedback.action(actor, card.drawCards, drawn);
        window.BattleLog.add(state, `${actor.name} 使用${card.name}，${drawText}。`);
        specials.repeatTactic(state, actor, target, card);
      });
    }
    if (card.drawTeam) return run(() => specials.drawTeam(state, actor, card), () => specials.repeatTactic(state, actor, target, card));
    if (card.demonInvasion) return run(() => specials.demonInvasion(state, actor, card), () => {
      if (!state.battle?.locked) specials.repeatTactic(state, actor, target, card);
    });
    if (card.teamHealPct) return run(() => specials.healTeam(state, actor, card, target));
    if (card.discardTarget) return repeatAfterUnlocked(state, actor, target, card, specials.discardTarget(state, actor, target, card));
    if (card.stealCard) return repeatAfterUnlocked(state, actor, target, card, specials.stealCard(state, actor, target, card));
    if (card.borrowSlash) {
      specials.borrowSlash(state, actor, target, card);
      if (!state.battle?.locked) specials.repeatTactic(state, actor, target, card);
      state.battle.comboPartnerUid = null;
      return true;
    }
    if (card.soulChain) return run(() => specials.soulChain(state, actor, target, card), () => specials.repeatTactic(state, actor, target, card));
    if (card.magicDuel) return run(() => specials.magicDuel(state, actor, target, card), () => specials.repeatTactic(state, actor, target, card));
    if (card.magicBullet) return repeatAfterUnlocked(state, actor, target, card, specials.magicBullet(state, actor, target, card));
    if (card.duel) return run(() => {
      specials.queueBattleCourage(state, actor, actor, card);
      specials.duel(state, actor, target, card);
    }, () => specials.repeatTactic(state, actor, target, card));
    if (card.comboAttack) return repeatAfterUnlocked(state, actor, target, card, specials.comboAttack(state, actor, target, card), true);
    if (card.heal || card.healPct) {
      if (target) {
        specials.healUnit(state, actor, target, card);
        specials.repeatTactic(state, actor, target, card);
      }
      return true;
    }
    return false;
  }

  function repeatAfterUnlocked(state, actor, target, card, completed, always = false) {
    if ((always || completed) && !state.battle?.locked) specials.repeatTactic(state, actor, target, card);
    return true;
  }

  function run(action, after) {
    action();
    after?.();
    return true;
  }

  return { resolve };
};
