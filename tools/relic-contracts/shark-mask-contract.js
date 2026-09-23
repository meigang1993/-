/* global BattleAI, UICommon */
const {
  assert, combat, card, scenario, contract, equip,
} = require("../relic-contract-harness");

function magicConversionCase({ ref, extractMagicAttack, label }) {
  const source = card("杀（普攻）");
  const current = scenario([source], []);
  equip(current.actor, "鲨鱼头套");
  Object.assign(current.actor, { ref, extractMagicAttack });
  Object.assign(current.actor.stats, { attack: 2, magic: 7 });
  window.state = current.state;
  const preview = UICommon.card(source, false, { actor: current.actor });
  assert(preview.includes("魔法攻击 · 伤害 7"), `${label} preview must use magic with no base damage`);
  assert.strictEqual(
    BattleAI.helpers.slashScore(current.actor, source, current.target),
    10,
    `${label} AI score must use the converted bite formula once`,
  );
  assert.strictEqual(combat.playActiveCard(current.state, 0, current.target.uid), true);
  assert.strictEqual(
    current.target.maxHp - current.target.hp,
    7,
    `${label} damage must use magic once`,
  );
  assert.strictEqual(source.name, "杀（普攻）");
  assert.strictEqual(source.biteKill, false);
  assert.strictEqual(source._queenTailSpoken, undefined);
}

contract("鲨鱼头套", () => {
  const source = card("杀（普攻）");
  const { state, actor, target } = scenario([source], []);
  equip(actor, "鲨鱼头套");
  actor.stats.attack = 4;
  actor.maxHp = 20;
  actor.hp = actor.maxHp;
  window.state = state;
  const physicalPreview = UICommon.card(source, false, { actor });
  assert(physicalPreview.includes("咬杀"));
  assert(physicalPreview.includes("转换"));
  assert(physicalPreview.includes("物理攻击 · 伤害 4"));
  assert.strictEqual(BattleAI.helpers.slashScore(actor, source, target), 7);
  actor.hp = 5;
  assert.strictEqual(combat.playActiveCard(state, 0, target.uid), true);
  assert.strictEqual(target.maxHp - target.hp, 4);
  assert.strictEqual(actor.hp, 9);
  assert.strictEqual(source.name, "杀（普攻）");
  assert.strictEqual(source.power, 0);
  assert.strictEqual(source.scale, "attack");
  assert.strictEqual(source.biteKill, false);
  assert.strictEqual(source._tempBiteKillBase, undefined);

  const handSlash = card("杀（普攻）", { virtual: true });
  actor.hand.push(handSlash);
  target.hp = target.maxHp;
  assert.strictEqual(combat.playActiveCard(state, 0, target.uid), true);
  assert.strictEqual(target.maxHp - target.hp, 4);
  assert.strictEqual(handSlash._playedFromHand, undefined);

  const directSlash = card("杀（普攻）", { virtual: true, _skill: true });
  target.hp = target.maxHp;
  combat.useCard(state, actor, target, directSlash);
  assert.strictEqual(target.maxHp - target.hp, 4);

  magicConversionCase({
    ref: "ophelia", extractMagicAttack: false, label: "Queen Tail",
  });
  magicConversionCase({
    ref: "besta_doll", extractMagicAttack: true, label: "Extract Essence",
  });
  magicConversionCase({
    ref: "ophelia", extractMagicAttack: true, label: "stacked magic conversions",
  });

  const converted = card("闪", { suit: "♥" });
  const nested = scenario([converted], []);
  equip(nested.actor, "鲨鱼头套");
  Object.assign(nested.actor, {
    id: "xx_witherer_1124", ref: "xx_witherer_1124",
    ai: "demon_beast_unit", withererMode: "暴走",
  });
  Object.assign(nested.actor.stats, { attack: 2, magic: 8 });
  nested.actor.intent = 0;
  const original = {
    name: converted.name, type: converted.type, power: converted.power,
    scale: converted.scale, text: converted.text, biteKill: converted.biteKill,
    sweep: converted.sweep, convertedFrom: converted.convertedFrom,
    withererBerserkKill: converted.withererBerserkKill,
  };
  window.state = nested.state;
  const nestedPreview = UICommon.card(converted, false, { actor: nested.actor });
  assert(nestedPreview.includes("咬杀"));
  assert(nestedPreview.includes("转换自：闪"));
  assert(nestedPreview.includes("物理攻击 · 伤害 2"));
  assert.strictEqual(combat.playActiveCard(nested.state, 0, nested.target.uid), true);
  assert.strictEqual(nested.target.maxHp - nested.target.hp, 2);
  Object.entries(original).forEach(([key, value]) => assert.strictEqual(converted[key], value));
  ["_tempBiteKillBase", "_beastOriginal", "_withererOriginal"].forEach(key => {
    assert.strictEqual(converted[key], undefined);
  });
});
