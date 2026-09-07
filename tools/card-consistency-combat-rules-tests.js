module.exports = ({ assert, combat, card, scenario }) => {
  {
    const { state, actor, target } = scenario(
      [card("杀（普攻）"), card("追杀")],
      [],
    );
    window.state = state;
    target.block = 1;
    assert.strictEqual(combat.playActiveCard(state, 0, target.uid), true);
    assert.strictEqual(target.hp, target.maxHp);
    assert.strictEqual(actor.pursueFreeThisTurn, true);
    assert.strictEqual(combat.playActiveCard(state, 0, target.uid), true);
    assert.strictEqual(actor.intent, 1,
      "追杀 should be free after full prevention");
  }

  {
    const { state, actor } = scenario([card("放血")], []);
    window.state = state;
    actor.hp = 4;
    actor.maxHp = 100;
    actor.intent = 0;
    assert.strictEqual(combat.playActiveCard(state, 0, actor.uid), true);
    assert.strictEqual(actor.hp, 1);
    assert(state.log.some(text => text.includes("损失3点生命")));
  }

  {
    const redSlash = card("杀（普攻）", { suit: "♥" });
    const { state, actor } = scenario([redSlash], []);
    actor.id = "xx_witherer_1124";
    actor.intent = 0;
    actor.withererMode = "暴走";
    window.state = state;
    assert.strictEqual(combat.canPlay(actor, redSlash, state.battle), true,
      "berserk red slash should ignore intent");
    assert.strictEqual(redSlash.noIntentCost, undefined,
      "dynamic intent rules must not persist on the entity card");
    actor.withererMode = "极速";
    assert.strictEqual(combat.canPlay(actor, redSlash, state.battle), false,
      "red slash should cost intent after switching to speed");
  }
};
