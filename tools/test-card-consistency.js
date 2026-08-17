const assert = require("assert");
const fs = require("fs");
const { combat, card, scenario, unit } = require("./pursue-kill-fixtures");
require("../src/original/battle-damage-attributes.js");

[
  "battle-damage-response.js",
  "battle-card-counter-interactions.js",
  "battle-combat-responses.js",
  "bondi-skills.js",
  "guest-ophelia-guard.js",
  "sakura-risa-combat-skills.js",
  "battle-prepare-prompts.js",
  "nonoka-loki-skills.js",
].forEach(file => {
  const source = fs.readFileSync(`./src/original/${file}`, "utf8");
  assert(source.includes("queueResponse"),
    `${file} must use the shared response event queue`);
  assert(!/animQueue\??\.push\(\s*\{\s*type:\s*"response"/s.test(source),
    `${file} must not bypass response hand-count snapshots`);
});

function codex(name) {
  const found = window.GameDataCards.cardCodex.find(item => item.name === name);
  assert(found, `missing card: ${name}`);
  return found;
}

assert.strictEqual(window.GameDataCards.cardCodex.length, 42, "official card codex must contain 42 cards");
["药瓶箱", "命运硬币", "强杀", "重振旗鼓", "本能反应"].forEach(name => {
  assert(!window.GameDataCards.cardCodex.some(card => card.name === name),
    `${name} must not remain in the formal card codex`);
  assert(!window.GameDataCards.eliteCards.some(card => card.name === name),
    `${name} must not remain in the elite card pool`);
  assert(!Object.values(window.GameDataCards.eliteUnlocks).flat().includes(name),
    `${name} must not remain in elite unlocks`);
});
assert.deepStrictEqual([...window.CardUtils.cardTypes], ["slash", "response", "tactic", "consume", "obstacle"], "formal card types must include obstacle cards");
window.GameDataCards.cardCodex.forEach(item => {
  assert(window.CardUtils.cardTypes.includes(item.type), `${item.name} must use a formal card type`);
});
assert.deepStrictEqual(
  ["束缚陷阱", "封印术"].map(name => {
    const item = codex(name);
    return [item.name, item.type, item.price, item.suitsText, item.statusKey,
      Object.hasOwn(item, "expireAtEndTurn")];
  }),
  [
    ["束缚陷阱", "obstacle", 1500, "♥×1 ♦×1", "stun", false],
    ["封印术", "obstacle", 1500, "♣×1 ♠×1", "seal", false],
  ],
  "unused obstacle cards must keep their price, suits, and status without expiry metadata",
);
assert.strictEqual(codex("机枪扫杀").type, "slash", "Machine Gun Sweep must remain a kill card");
assert.strictEqual(window.CardUtils.isKillCard(codex("机枪扫杀")), true, "Machine Gun Sweep must pass generic kill checks");
assert.strictEqual(window.CardUtils.targetScope(codex("机枪扫杀")), "group", "Machine Gun Sweep must be classified as group-target");
assert.strictEqual(window.CardUtils.isGroupKillCard(codex("机枪扫杀")), true, "Machine Gun Sweep must be a group kill");
assert.strictEqual(window.CardUtils.isSingleKill(codex("机枪扫杀")), false, "Machine Gun Sweep must not pass single-kill checks");
assert.strictEqual(window.CardUtils.targetScope(codex("杀（普攻）")), "single", "Basic Slash must be classified as single-target");
const virtualSingleKill = { ...codex("杀（普攻）"), virtual: true };
const convertedSingleKill = { ...codex("杀（普攻）"), convertedFrom: "闪" };
assert.strictEqual(window.CardUtils.isSingleKill(virtualSingleKill), true, "virtual single Slashes must pass scope checks");
assert.strictEqual(window.CardUtils.isSingleKill(convertedSingleKill), true, "converted single Slashes must pass scope checks");
assert.strictEqual(window.CardUtils.isEntitySingleKill(virtualSingleKill), false, "virtual Slashes must fail explicit entity checks");
assert.strictEqual(window.CardUtils.isEntitySingleKill(convertedSingleKill), true, "converted entity-source Slashes must pass entity checks");
assert.strictEqual(window.CardUtils.canRespondTo("slash", virtualSingleKill), true, "virtual single Slashes must answer Slash responses");
assert.strictEqual(window.CardUtils.canRespondTo("slash", convertedSingleKill), true, "converted single Slashes must answer Slash responses");
assert.strictEqual(window.CardUtils.canRespondTo("slash", codex("机枪扫杀")), false, "group Slashes must not answer single-Slash responses");
assert.strictEqual(window.CardUtils.canRespondTo("slash", { ...virtualSingleKill, _pendingDraw: true }), false, "pending cards must not be playable responses");

[
  ["杀（普攻）", "等同于你的攻击力的物理伤害"],
  ["魔杀", "发动魔法攻击"],
  ["魔杀", "等同于你的魔力的物理伤害"],
  ["愈魔瓶", "（其最大生命值的30%+你的魔力）点生命值"],
  ["雷杀", "若此牌造成生命值伤害"],
  ["灵魂锁链", "指定2名敌方角色为目标"],
  ["灵魂锁链", "【杀】造成的生命值伤害"],
  ["灵魂锁链", "等量同属性伤害"],
  ["借刀杀人", "一名其他友方角色"],
  ["看破", "虚拟战术牌和转换战术牌"],
  ["魔王军入侵", "等同于你的攻击力与魔力之和的伤害"],
  ["魔王军入侵", "物理与魔法属性"],
  ["放血", "不会因此低于1点生命值"],
  ["勒杀", "每个准备阶段"],
  ["撞杀", "（你的攻击力+你的当前护甲）点物理伤害"],
  ["火杀", "等同于你的攻击力的火属性伤害"],
  ["火杀", "“燃烧”属性持续至战斗结束"],
].forEach(([name, phrase]) => {
  assert(codex(name).text.includes(phrase), `${name} text must include: ${phrase}`);
});
[
  ["束缚陷阱", ["【眩晕】带有虚无属性", "判定阶段", "结果为黑色",
    "跳过本回合出牌阶段", "持有者回合结束后消耗该状态牌"]],
  ["封印术", ["【封魔】带有虚无属性", "判定阶段", "结果为红色",
    "跳过摸牌阶段", "本回合无法摸牌", "持有者回合结束后消耗该状态牌"]],
].forEach(([name, phrases]) => {
  phrases.forEach(phrase => {
    assert(codex(name).text.includes(phrase),
      `${name} text must include status detail: ${phrase}`);
  });
});

["魔杀", "魔法对决", "魔弹特攻", "魔王军入侵"].forEach(name => {
  assert.strictEqual(codex(name).attackType, "magic", `${name} must expose the magic attack category`);
});
assert.strictEqual(codex("魔王军入侵").hybridAttack, true, "Demon Invasion must expose physical and magical composite feedback");

const validAttackTypes = new Set(["physical", "magic"]);
window.GameDataCards.cardCodex.forEach(item => {
  const text = item.text;
  if (item.attackType !== undefined) {
    assert(validAttackTypes.has(item.attackType), `${item.name} has invalid attack type: ${item.attackType}`);
  }
  assert(!/(?:[二两三四五六七八九十]+(?:张|名|点|层|次|轮)|(?<!下)一(?:张|点|层|次|轮))/.test(text), `${item.name} must use Arabic numerals`);
  assert(!/\d+点\+/.test(text), `${item.name} must wrap formulas in full-width parentheses`);
  assert(!/(?:攻击力|魔力)\+护甲值点/.test(text), `${item.name} contains a legacy formula`);
  assert(!/指定(?:敌方|我方)一名/.test(text), `${item.name} contains a legacy target phrase`);
  assert(!/指定两名/.test(text), `${item.name} must use Arabic numerals for multi-target counts`);
  assert(!/造成伤害后/.test(text), `${item.name} must distinguish hp damage triggers`);
  if (["闪", "看破"].includes(item.name)) {
    assert(text.includes("使用此牌"), `${item.name} response text must use 使用此牌`);
  } else if (item.type === "response") {
    assert(text.includes("打出此牌"), `${item.name} response text must use 打出此牌`);
  }
});
assert(window.GameDataCards.cardCodex.every(item => item.power === 0),
  "all formal cards must have zero base damage");
assert(!Object.hasOwn(codex("杀（普攻）"), "attackType"), "ordinary cards must omit empty attack type metadata");

[
  "杀（普攻）", "魔杀", "机枪扫杀", "无谋冲拳", "刺杀", "魔法对决",
  "魔弹特攻", "双重打杀", "暴走杀", "咬杀",
  "怒杀", "勒杀", "追杀", "撞杀", "仇杀",
].forEach(name => {
  assert(codex(name).text.includes("物理伤害"), `${name} must state its physical damage attribute`);
});
assert(codex("暴走杀").text.includes("本场战斗的攻击力+1"),
  "Berserk Slash must describe its battle-long attack growth");

assert.strictEqual(window.CardUtils.isCounterableTactic({ name: "拆解", type: "tactic" }), true, "ordinary tactic cards should be counterable");
assert.strictEqual(window.CardUtils.isCounterableTactic({ name: "技能牌本体", type: "tactic", _skill: true }), false, "skill cards themselves must not be counterable");
assert.strictEqual(window.CardUtils.isCounterableTactic({ name: "军令状入侵", type: "tactic", _skill: true, virtual: true }), true, "virtual tactics generated by skills should be counterable");
assert.strictEqual(window.CardUtils.isCounterableTactic({ name: "转换战术", type: "tactic", _skill: true, convertedFrom: "原始牌" }), true, "converted tactics should be counterable");
assert.strictEqual(window.CardUtils.isCounterableTactic({ name: "不可响应战术", type: "tactic", ignoreResponse: true }), false, "unresponsive tactics must not be counterable");

{
  const { state, actor, target } = scenario([card("灵魂锁链")], []);
  const chained = unit("enemy-2", "enemy", []);
  state.battle.enemies.push(chained);
  window.state = state;
  assert(combat.playActiveCard(
    state, 0, [target.uid, chained.uid]
  ));
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
  const partner = unit("ally-2", "ally", [card("杀（普攻）", { virtual: true })]);
  partner.stats.attack = 1;
  state.battle.allies.push(partner);
  window.state = state;
  assert.strictEqual(combat.playActiveCard(state, 0, target.uid, partner.uid), true);
  assert.strictEqual(state.battle.handReveal.mode, "borrowSlashChoice",
    "Borrow Slash must ask for the exact Slash even when only one is valid");
  assert.strictEqual(combat.resolveHandReveal(state, 0), true);
  assert.strictEqual(target.hp, target.maxHp - 1, "Borrow Slash must use a virtual single Slash");
  assert.strictEqual(partner.hand.length, 0, "Borrow Slash must move the selected virtual Slash out of hand");
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
  window.RelicSystem.hasEquipped = (_state, unit, name) =>
    unit === actor && name === "克罗研究记录";
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
  const readyPartner = unit("ally-ready", "ally", [card("闪", { suit: "♦" })]);
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
  assert(generated.temporary && generated.void, "Wendy tutor cards must be temporary cards that leave play after use");

  assert(combat.selectCard(state, 0));
  assert(combat.chooseTarget(state, partner.uid));
  assert(combat.chooseTarget(state, target.uid));
  assert(actor.hand.includes(generated), "choosing the combo partner must wait for the player to confirm use");
  assert(combat.playSelectedCard(state));
  assert(actor.consumed.includes(generated), "a used Wendy tutor card must enter the consumed pile");
  assert(!actor.discard.includes(generated), "a used Wendy tutor card must not enter the discard pile");
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

{
  const { state, actor, target } = scenario(
    [card("杀（普攻）"), card("追杀")],
    []
  );
  window.state = state;
  target.block = 1;
  assert.strictEqual(combat.playActiveCard(state, 0, target.uid), true);
  assert.strictEqual(target.hp, target.maxHp);
  assert.strictEqual(actor.pursueFreeThisTurn, true);
  assert.strictEqual(combat.playActiveCard(state, 0, target.uid), true);
  assert.strictEqual(actor.intent, 1, "追杀 should be free after full prevention");
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
  assert.strictEqual(combat.canPlay(actor, redSlash, state.battle), true, "berserk red slash should ignore intent");
  assert.strictEqual(redSlash.noIntentCost, undefined, "dynamic intent rules must not persist on the entity card");
  actor.withererMode = "极速";
  assert.strictEqual(combat.canPlay(actor, redSlash, state.battle), false, "red slash should cost intent after switching to speed");
}

console.log("Card description/runtime consistency tests passed");
