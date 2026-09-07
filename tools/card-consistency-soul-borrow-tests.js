module.exports = ({ assert, combat, card, scenario, unit }) => {
  {
    const { state, target } = scenario([card("灵魂锁链")], []);
    const chained = unit("enemy-2", "enemy", []);
    state.battle.enemies.push(chained);
    window.state = state;
    assert(combat.playActiveCard(state, 0, [target.uid, chained.uid]));
    assert.strictEqual(state.battle.played.filter(
      item => item.name === "灵魂锁链").length, 1,
    "Soul Chain must create exactly one public card record");
    assert(!state.battle.animQueue.some(event =>
      event.type === "virtualPlay" && event.card?.name === "灵魂锁链"),
    "Soul Chain must not queue a duplicate virtual card flight");
  }

  {
    const { state, actor, target } = scenario([], []);
    const chained = unit("enemy-2", "enemy", []);
    target.soulChain = 1;
    chained.soulChain = 1;
    state.battle.enemies.push(chained);
    const source = card("杀（普攻）", {
      attackType: "magic", fire: true, holy: true,
    });
    let transfer = null;
    const transferDamage =
      (_state, next, amount, label, sourceActor, damageCard) => {
        transfer = { next, amount, label, sourceActor, damageCard };
      };
    window.state = state;
    window.EdisSkills.afterDamage(
      state, actor, target, source, 4, transferDamage,
    );
    assert.strictEqual(state.battle.reactionQueue?.length, 1,
      "Soul Chain hp damage must enter the shared reaction queue");
    window.BattleReactionQueue.flush(state, transferDamage);
    assert(transfer, "Soul Chain must transfer Slash hp damage");
    assert.strictEqual(transfer.next, chained);
    assert.strictEqual(transfer.amount, 4);
    assert.deepStrictEqual(transfer.damageCard.damageTypes, ["fire", "holy"]);
    assert.strictEqual(transfer.damageCard.attackType, "magic");
    assert.strictEqual(transfer.damageCard.magicDamage, true);
    assert(transfer.damageCard._soulChain && transfer.damageCard.fire
      && transfer.damageCard.holy,
    "Soul Chain must preserve elemental and attack-category metadata");
  }

  {
    const { state, actor, target } = scenario([card("借刀杀人")], []);
    const partner = unit("ally-2", "ally", [
      card("杀（普攻）", { virtual: true }),
    ]);
    partner.stats.attack = 1;
    state.battle.allies.push(partner);
    window.state = state;
    assert.strictEqual(combat.playActiveCard(
      state, 0, target.uid, partner.uid), true);
    assert.strictEqual(state.battle.handReveal.mode, "borrowSlashChoice",
      "Borrow Slash must ask for the exact Slash even when only one is valid");
    assert.strictEqual(combat.resolveHandReveal(state, 0), true);
    assert.strictEqual(target.hp, target.maxHp - 1,
      "Borrow Slash must use a virtual single Slash");
    assert.strictEqual(partner.hand.length, 0,
      "Borrow Slash must move the selected virtual Slash out of hand");
  }

  {
    const { state, actor, target } = scenario([card("借刀杀人")], []);
    const partner = unit("ally-2", "ally", [
      card("杀（普攻）", { suit: "♣" }),
      card("雷杀", { suit: "♦" }),
    ]);
    partner.stats.attack = 2;
    state.battle.allies.push(partner);
    window.state = state;
    assert.strictEqual(combat.playActiveCard(
      state, 0, target.uid, partner.uid
    ), true);
    assert.strictEqual(state.battle.handReveal.mode, "borrowSlashChoice");
    assert.strictEqual(combat.resolveHandReveal(state, 1), true);
    assert.strictEqual(target.hp, target.maxHp - 2,
      "Borrowed Blade must use the exact Slash selected by the player");
    assert.deepStrictEqual(partner.hand.map(item => item.name), ["杀（普攻）"]);
  }

  {
    const previousHasEquipped = window.RelicSystem.hasEquipped;
    const { state, actor, target } = scenario([card("借刀杀人")], []);
    const partner = unit("ally-2", "ally", [
      card("杀（普攻）", { suit: "♣" }),
      card("雷杀", { suit: "♦" }),
    ]);
    partner.stats.attack = 1;
    state.battle.allies.push(partner);
    window.state = state;
    window.RelicSystem.hasEquipped = (_state, unitActor, name) =>
      unitActor === actor && name === "克罗研究记录";
    assert(combat.playActiveCard(state, 0, target.uid, partner.uid));
    assert(combat.resolveHandReveal(state, 1));
    assert.strictEqual(state.battle.handReveal.mode, "borrowSlashChoice",
      "A repeated Borrowed Blade must ask for its own exact Slash choice");
    assert(combat.resolveHandReveal(state, 0));
    assert.strictEqual(target.hp, target.maxHp - 2,
      "Borrowed Blade manual choice must preserve its partner for a repeated tactic");
    assert.strictEqual(partner.hand.length, 0);
    window.RelicSystem.hasEquipped = previousHasEquipped;
  }

  {
    const { state, actor, target } = scenario([card("借刀杀人")], []);
    const partner = unit("ally-2", "ally", [
      card("闪", { suit: "♣" }),
      card("愈魔瓶", { suit: "♦" }),
    ]);
    state.battle.allies.push(partner);
    window.state = state;
    assert.strictEqual(combat.playActiveCard(
      state, 0, target.uid, partner.uid
    ), true);
    assert.strictEqual(state.battle.handReveal.mode, "borrowGainChoice");
    assert.strictEqual(combat.resolveHandReveal(state, 1), true);
    assert(actor.hand.some(item => item.name === "愈魔瓶"),
      "Borrowed Blade must gain the exact fallback card selected by the player");
    assert.deepStrictEqual(partner.hand.map(item => item.name), ["闪"]);
  }
};
