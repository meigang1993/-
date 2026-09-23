module.exports = ({ assert, combat, card, scenario, unit }) => {
  {
    const status = window.BattleStatusCards.create("seal");
    const { state, actor, target } = scenario([card("魔弹特攻")], [status]);
    const targetWithCard = unit("enemy-2", "enemy", [
      window.BattleStatusCards.create("stun"),
      card("闪", { suit: "♥" }),
    ]);
    state.battle.enemies.push(targetWithCard);
    window.state = state;
    assert.strictEqual(combat.canPlay(actor, actor.hand[0], state.battle), true);
    assert.strictEqual(combat.selectCard(state, 0), true);
    assert.strictEqual(combat.chooseTarget(state, target.uid), false,
      "Magic Bullet must reject a target whose only visible card is a status card");
    assert.strictEqual(combat.chooseTarget(state, targetWithCard.uid), true);
  }

  {
    const magicBullet = card("魔弹特攻");
    const cost = card("闪", { suit: "♥" });
    const shown = card("杀（普攻）", { suit: "♥" });
    const { state, actor, target } = scenario([magicBullet, cost], [shown]);
    state.battle.handReveal = {
      actorUid: actor.uid,
      targetUid: target.uid,
      cardName: magicBullet.name,
      card: magicBullet,
      mode: "magicBullet",
      shownCard: { ...shown },
      shownSuit: shown.suit,
      validIndexes: [1],
    };
    state.battle.locked = true;
    window.state = state;
    assert.strictEqual(combat.resolveHandReveal(state, 1), true);
    assert.strictEqual(state.battle.played[0]?.name, cost.name);
    assert.strictEqual(state.battle.played[0]?._playedAction, "弃置了",
      "allied Magic Bullet payment must appear in the public turn trail");
  }

  {
    const status = window.BattleStatusCards.create("seal");
    const shown = card("闪", { suit: "♦" });
    const enemyCost = card("杀（普攻）", { suit: "♦" });
    const enemyMagicBullet = card("魔弹特攻");
    const { state, actor, target: witch } = scenario([status, shown], [enemyCost]);
    state.battle.handReveal = {
      actorUid: witch.uid,
      targetUid: actor.uid,
      cardName: enemyMagicBullet.name,
      card: enemyMagicBullet,
      mode: "magicBulletReveal",
    };
    state.battle.locked = true;
    window.state = state;
    assert.strictEqual(combat.resolveHandReveal(state, 0), true);
    assert.strictEqual(actor.hand[0], status,
      "forced Magic Bullet display must leave the status card excluded");
    assert.strictEqual(state.battle.animQueue.find(event =>
      event.type === "revealCards")?.cards?.[0]?.name, shown.name);
    assert.strictEqual(state.battle.played[0]?.name, enemyCost.name);
    assert.strictEqual(state.battle.played[0]?._playedByName, witch.name);
    assert.strictEqual(state.battle.played[0]?._playedAction, "弃置了",
      "witch Magic Bullet payment must appear in the public turn trail");
  }

  {
    const { state, actor, target } = scenario([card("借刀杀人")], []);
    const emptyPartner = unit("ally-empty", "ally", []);
    const readyPartner = unit("ally-ready", "ally", [
      card("闪", { suit: "♦" }),
    ]);
    state.battle.allies.push(emptyPartner, readyPartner);
    window.state = state;
    assert.strictEqual(combat.selectCard(state, 0), true);
    assert.strictEqual(combat.chooseTarget(state, emptyPartner.uid), false,
      "Borrow Slash must reject a partner with no visible hand cards");
    assert.strictEqual(combat.chooseTarget(state, readyPartner.uid), true);
    assert.strictEqual(combat.chooseTarget(state, target.uid), true);
  }

  {
    const { state, actor, target } = scenario([], []);
    const partner = unit("ally-2", "ally", []);
    actor.ref = "wendy";
    state.battle.allies.push(partner);
    state.battle.animQueue = null;
    state.battle.locked = true;
    state.battle.wendyTutorPicker = { uid: actor.uid };
    window.state = state;

    assert(window.WendyCadicisSkills.chooseTutorCard(state, "组合进攻"));
    assert(window.WendyCadicisSkills.chooseTutorCard(state, null, actor.uid));
    const generated = actor.hand[0];
    assert(generated.temporary && generated.void,
      "Wendy tutor cards must be temporary cards that leave play after use");

    assert(combat.selectCard(state, 0));
    assert(combat.chooseTarget(state, partner.uid));
    assert(combat.chooseTarget(state, target.uid));
    assert(actor.hand.includes(generated),
      "choosing the combo partner must wait for the player to confirm use");
    assert(combat.playSelectedCard(state));
    assert(actor.consumed.includes(generated),
      "a used Wendy tutor card must enter the consumed pile");
    assert(!actor.discard.includes(generated),
      "a used Wendy tutor card must not enter the discard pile");
  }

  {
    const expected = window.GameDataCards.cardCodex
      .filter(item => item.type === "tactic")
      .map(item => item.name)
      .sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
    const actual = window.WendyCadicisSkills.tutorPool({ deck: [] })
      .map(item => item.name);
    assert.deepStrictEqual(actual, expected,
      "Wendy tutor must expose every formal tactic card exactly once");
    actual.forEach(name => {
      const { state, actor } = scenario([], []);
      state.battle.animQueue = null;
      state.battle.locked = true;
      state.battle.wendyTutorPicker = { uid: actor.uid };
      window.state = state;
      assert(window.WendyCadicisSkills.chooseTutorCard(state, name));
      assert(window.WendyCadicisSkills.chooseTutorCard(state, null, actor.uid));
      const generated = actor.hand[0];
      assert(generated?.wendyTutorGenerated,
        `${name} must retain Wendy tutor provenance`);
      assert.strictEqual(generated?.generatedBySkill, "解答迷惑",
        `${name} must retain its generated skill source`);
      assert(generated.temporary && generated.void,
        `${name} must remain temporary and consumed`);
    });
  }
};
