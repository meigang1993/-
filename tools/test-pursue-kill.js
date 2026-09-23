const assert = require("assert");
const { combat, card, unit, scenario } = require("./pursue-kill-fixtures");

{
  const normalSlash = card("杀（普攻）");
  const pursue = card("追杀");
  const flash = card("闪", { suit: "♥" });
  const { state, actor, target } = scenario([normalSlash, pursue], [flash]);
  actor.stats.attack = 1;

  assert.strictEqual(combat.playActiveCard(state, 0, target.uid), true);
  assert.strictEqual(actor.intent, 1, "the triggering entity slash should spend one intent");
  assert.strictEqual(target.hp, target.maxHp, "the entity slash should be fully dodged");
  assert.strictEqual(actor.pursueFreeThisTurn, true, "a dodged entity slash should enable 追杀");
  assert.strictEqual(target.hand.length, 0, "the dodge card should be consumed by the real response flow");

  assert.strictEqual(combat.playActiveCard(state, 0, target.uid), true);
  assert.strictEqual(actor.intent, 1, "enabled 追杀 should not spend intent");
  assert.strictEqual(target.hp, target.maxHp - 1, "追杀 should still resolve normal damage");
  assert(state.log.includes("追杀不消耗杀意。"), "battle log should report the free 追杀");
  assert(state.log.some(text => text.includes(`对${target.name}造成1伤害`)), "damage log should identify the damaged target");
  assert.strictEqual(actor.pursueFreeThisTurn, true, "the free state should remain for the current turn");

  window.BattleTurnState.resetBeginTurn(actor, state.battle, 2);
  assert.strictEqual(actor.pursueFreeThisTurn, false, "the free state should reset next turn");
}

[
  { label: "virtual slash", attack: card("杀（普攻）", { virtual: true }) },
  { label: "skill slash", attack: card("杀（普攻）", { _skill: true }) },
].forEach(({ label, attack }) => {
  const { state, actor, target } = scenario([], [card("闪", { suit: "♥" })]);
  combat.damage(state, target, 1, attack.name, actor, attack);
  assert.strictEqual(target.hp, target.maxHp, `${label} should be dodged`);
  assert(!actor.pursueFreeThisTurn, `${label} must not enable 追杀`);
});

{
  const { state, actor, target } = scenario([card("追杀")], [card("闪", { suit: "♥" })]);
  actor.intent = 1;
  assert.strictEqual(combat.playActiveCard(state, 0, target.uid), true);
  assert.strictEqual(actor.intent, 0, "an unenabled 追杀 should spend intent");
  assert.strictEqual(target.hp, target.maxHp, "追杀 can be dodged normally");
  assert(!actor.pursueFreeThisTurn, "a dodged 追杀 must not enable itself");
  assert(!state.log.includes("追杀不消耗杀意。"), "self-dodged 追杀 must not log a free use");
}

{
  const actor = unit("enemy-ai", "enemy", [card("杀（普攻）", { suit: "♥" }), card("追杀")]);
  const target = unit("ally-target", "ally", [card("闪", { suit: "♥" })]);
  Object.assign(actor, {
    id: "xx_witherer_1124", name: "XX型凋零者1124号",
    skills: [{ name: "杀欲窥视" }], usedWithererPeek: true, withererMode: "极速", intent: 1,
  });
  actor.stats.attack = 1;
  const state = scenario([], []).state;
  state.battle.allies = [target];
  state.battle.enemies = [actor];
  window.state = state;

  combat.useCard(state, actor, target, actor.hand[0]);
  assert.strictEqual(actor.intent, 0, "AI setup slash should spend its final intent");
  assert.strictEqual(actor.pursueFreeThisTurn, true, "AI should receive the free pursue state");
  const move = window.BattleAI.choose(state.battle, actor, combat.canPlay);
  assert.strictEqual(move?.card?.name, "追杀", "AI should choose free 追杀 at zero intent");
  assert.strictEqual(move?.target, target, "AI should choose a living opposing target");
  combat.useCard(state, actor, move.target, move.card);
  assert.strictEqual(actor.intent, 0, "AI free 追杀 should not spend intent");
  assert.strictEqual(target.hp, target.maxHp - 1, "AI 追杀 should resolve damage");
  assert(state.log.includes("追杀不消耗杀意。"), "AI use should log free 追杀");
}

{
  const actor = unit("enemy-ai", "enemy", [card("追杀")]);
  const target = unit("ally-target", "ally", []);
  Object.assign(actor, {
    id: "xx_witherer_1124", skills: [{ name: "杀欲窥视" }],
    usedWithererPeek: true, withererMode: "极速", intent: 0,
  });
  const state = scenario([], []).state;
  state.battle.allies = [target];
  state.battle.enemies = [actor];
  window.state = state;
  assert.strictEqual(window.BattleAI.choose(state.battle, actor, combat.canPlay), null, "AI must not play inactive 追杀 at zero intent");
}

{
  const { state, actor, target } = scenario([], []);
  const chainedA = unit("enemy-2", "enemy", []);
  const chainedB = unit("enemy-3", "enemy", []);
  const untouched = unit("enemy-4", "enemy", []);
  target.soulChain = 2;
  chainedA.soulChain = 2;
  chainedB.soulChain = 2;
  state.battle.enemies.push(chainedA, chainedB, untouched);
  window.state = state;
  combat.damage(state, target, 2, "杀（普攻）", actor, card("杀（普攻）"));
  assert.strictEqual(target.hp, 28, "the original soul-chain target should take slash damage");
  assert.strictEqual(chainedA.hp, 28, "the first other soul-chain target should take transmitted damage");
  assert.strictEqual(chainedB.hp, 28, "every other soul-chain target should take transmitted damage");
  assert.strictEqual(untouched.hp, 30, "an enemy without soul-chain must not take transmitted damage");
}

{
  const { state, actor, target } = scenario([], []);
  const chained = unit("enemy-2", "enemy", []);
  const ally = unit("ally-2", "ally", []);
  actor.side = "enemy";
  actor.name = "同阵营伤害来源";
  target.soulChain = 2;
  chained.soulChain = 2;
  state.battle.allies = [ally];
  state.battle.enemies = [actor, target, chained];
  window.state = state;
  combat.damage(state, target, 2, "杀（普攻）", actor, card("杀（普攻）"));
  assert.strictEqual(chained.hp, 28, "soul-chain transmission should follow the damaged target's side, not the source actor's side");
}

{
  const { state, actor, target } = scenario([], []);
  const mimic = unit("ally-2", "ally", []);
  actor.name = "模仿者";
  actor.mimicUid = mimic.uid;
  mimic.name = "模仿对象";
  state.battle.allies.push(mimic);
  combat.damage(state, target, 2, "杀（普攻）", actor, card("杀（普攻）"));
  assert(state.log.some(text => text.startsWith("模仿对象（杀（普攻））对测试目标造成2伤害")), "mimicked damage log should use the effective source once");
  assert(!state.log.some(text => text.includes("模仿者的模仿对象")), "mimicked damage log must not prepend the original card user");
  combat.directDamage(state, target, 1, "测试直伤", actor);
  assert(state.log.some(text => text.startsWith("模仿对象（测试直伤）对测试目标造成1点无视护甲伤害")), "mimicked direct damage log should use the effective source once");
}

console.log("Pursue kill integration and AI tests passed");
