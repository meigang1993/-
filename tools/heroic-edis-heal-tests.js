const {
  assert, battleState, card, combat, makeEdis, unit,
} = require("./heroic-edis-test-harness");

function testHeal(dodges) {
  const heal = card("愈魔瓶");
  const healer = unit(`healer-${dodges}`, "ally", [
    heal,
    ...(dodges ? [card("闪", { suit: "♥" })] : []),
  ]);
  healer.hp = 10;
  healer.maxHp = 30;
  const edis = makeEdis([]);
  const state = battleState(edis, [healer]);
  combat.useCard(state, healer, healer, heal);
  return { state, healer, edis };
}

function testSingleHealCounter() {
  const blocked = testHeal(false);
  assert.strictEqual(blocked.healer.hp, 10 - blocked.edis.stats.attack,
    "without Flash, Infinite Dark Blade must deal scaled Slash damage and cancel the heal");
  const dodged = testHeal(true);
  assert.strictEqual(dodged.healer.hp, 19,
    "with Flash, Infinite Dark Blade must be cancelled and the nine-point heal must resolve");
  assert.strictEqual(dodged.healer.discard.some(item => item.name === "闪"), true,
    "the successful Infinite Dark Blade response must consume Flash normally");
}

function testGroupHealCounter() {
  const spring = card("生命之泉");
  const guarded = unit("group-heal-1", "ally", [spring, card("闪", { suit: "♥" })]);
  const exposed = unit("group-heal-2", "ally", []);
  [guarded, exposed].forEach(target => {
    target.hp = 10;
    target.maxHp = 30;
  });
  const edis = makeEdis([]);
  const state = battleState(edis, [guarded, exposed]);
  combat.useCard(state, guarded, guarded, spring);
  assert.strictEqual(guarded.hp, 19,
    "a group-heal target that dodges Infinite Dark Blade must still recover");
  assert.strictEqual(exposed.hp, 10 - edis.stats.attack,
    "a group-heal target without Flash must take the sweep and lose its recovery");
  assert.strictEqual(
    state.battle.animQueue.filter(event => event.type === "virtualPlay" && event.card?.name === "机枪扫杀").length,
    1,
    "one group heal must create exactly one Infinite Dark Blade sweep",
  );
  const event = state.battle.animQueue.find(item =>
    item.type === "virtualPlay" && item.card?.name === "机枪扫杀");
  assert.strictEqual(event?.show, true,
    "Infinite Dark Blade must reveal its virtual sweep in the public play area");
  assert.strictEqual(event?.card?.virtual, true,
    "Infinite Dark Blade must keep the sweep classified as a virtual card");
  assert.strictEqual(event?.card?.aoeLineShown, true,
    "Infinite Dark Blade must reserve one full-target line animation");
  assert.deepStrictEqual(event?.targetUids, [guarded.uid, exposed.uid],
    "Infinite Dark Blade must draw target lines to every living opposing unit");
}

module.exports = { testGroupHealCounter, testSingleHealCounter };
