const {
  assert, battleState, card, combat, makeEdis, revealPending, unit,
} = require("./heroic-edis-test-harness");

function testPassiveCopyResponse() {
  const attack = card("杀（普攻）");
  const attacker = unit("copy-source", "ally", [attack]);
  attacker.intent = 1;
  const edis = makeEdis([]);
  const state = battleState(edis, [attacker]);
  combat.useCard(state, attacker, edis, attack);
  assert.strictEqual(edis.hand.length, 2,
    "targeting heroic Edis with an entity Slash must grant one Magic Eye copy and one Gothic draw");
  const copied = edis.hand.find(item => item.copiedByEdis);
  assert(copied?.temporary && copied?.void, "the passive Magic Eye copy must be temporary and consumed whenever it leaves hand");
  assert.strictEqual(copied?.generatedBySkill, "拷贝魔眼",
    "the passive Magic Eye copy must retain its generated skill source");
  revealPending(edis);
  edis.intent = 1;
  attacker.hand.push(card("闪"));
  const hpBefore = attacker.hp;
  combat.useCard(state, edis, attacker, copied);
  assert.strictEqual(attacker.hp, hpBefore, "a copied Slash must still allow a normal Flash response");
  assert(edis.consumed.includes(copied), "a copied card must enter the consumed pile after use");
}

function testCopiedSlashResponseUses() {
  const duelSlash = card("杀（普攻）", { copiedByEdis: true, temporary: true, void: true });
  const duelEdis = makeEdis([duelSlash], []);
  const challenger = unit("duel-source", "ally", [card("与我一战")]);
  const duelState = battleState(duelEdis, [challenger]);
  combat.useCard(duelState, challenger, duelEdis, challenger.hand[0]);
  assert(duelEdis.consumed.includes(duelSlash), "a copied basic Slash played in Duel must enter the consumed pile");

  const invasionSlash = card("杀（普攻）", { copiedByEdis: true, temporary: true, void: true });
  const invasionEdis = makeEdis([invasionSlash], []);
  const invader = unit("invasion-source", "ally", [card("魔王军入侵")]);
  const invasionState = battleState(invasionEdis, [invader]);
  combat.useCard(invasionState, invader, invader, invader.hand[0]);
  assert(invasionEdis.consumed.includes(invasionSlash), "a copied basic Slash played against Demon Invasion must enter the consumed pile");
}

module.exports = { testCopiedSlashResponseUses, testPassiveCopyResponse };
