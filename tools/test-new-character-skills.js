const fs = require("fs");
const vm = require("vm");
const {
  assert, card, unitFromCharacter, installGlobals, loadRuntime,
} = require("./skill-coverage-fixtures");

installGlobals();
loadRuntime();
vm.runInThisContext(fs.readFileSync("./src/original/battle-card-cleanup.js", "utf8"), { filename: "battle-card-cleanup.js" });
vm.runInThisContext(fs.readFileSync("./src/original/battle-card-playability.js", "utf8"), { filename: "battle-card-playability.js" });
vm.runInThisContext(fs.readFileSync("./src/original/battle-combat-targeting.js", "utf8"), { filename: "battle-combat-targeting.js" });
vm.runInThisContext(fs.readFileSync("./src/original/battle-turn-state.js", "utf8"), { filename: "battle-turn-state.js" });
vm.runInThisContext(fs.readFileSync("./src/original/battle-discard-flow.js", "utf8"), { filename: "battle-discard-flow.js" });
vm.runInThisContext(fs.readFileSync("./src/original/battle-end-phase.js", "utf8"), { filename: "battle-end-phase.js" });
const character = id => GameData.characters.find(item => item.id === id);
const gerdaData = character("gerda");
const yiData = character("hoshino_yi");
const kaiichiData = character("hoshino_kaiichi");
const comfortSkill = gerdaData.skills.find(skill => skill.name === "萌虎慰劳");
const milkSkill = kaiichiData.skills.find(skill => skill.name === "半魅魔精华");
const idolSkill = yiData.skills.find(skill => skill.name === "偶像之星");
const truthSkill = yiData.skills.find(skill => skill.name === "梦想真理");

assert(JSON.stringify(gerdaData.stats) === JSON.stringify({ attack: 3, magic: 3, speed: 4, maxHp: 40, bloodlust: 1, handLimit: 4, drawPerTurn: 1, initialDraw: 1 }), "Gerda stats mismatch");
assert(JSON.stringify(yiData.stats) === JSON.stringify({ attack: 3, magic: 3, speed: 3, maxHp: 34, bloodlust: 1, handLimit: 4, drawPerTurn: 3, initialDraw: 2 }), "Hoshino Yi stats mismatch");
assert(JSON.stringify(kaiichiData.stats) === JSON.stringify({ attack: 1, magic: 3, speed: 2, maxHp: 46, bloodlust: 1, handLimit: 4, drawPerTurn: 2, initialDraw: 2 }), "Hoshino Kaiichi stats mismatch");
assert(gerdaData.grandfather === "兽人王邦迪" && yiData.mother === "混沌女神" && kaiichiData.father === "艾伦格", "New character family metadata mismatch");
assert(yiData.role === "XX型凋零者" && yiData.combatRoles[0] === "输出", "Hoshino Yi role positioning mismatch");
assert(yiData.entrance === "晚上好，我是A小町，星野依，天才般偶像，今天演唱新曲。", "Hoshino Yi entrance line mismatch");
assert(idolSkill?.text === "锁定技，当你使用的牌与上一次使用的牌颜色不同时，你摸一张牌。若诺诺卡在队伍中，诺诺卡也摸一张牌。", "Idol Star wording mismatch");
assert(yiData.skills.find(skill => skill.name === "巨蛋演出")?.text === "锁定技，你每使用四种不同花色的牌，你对所有敌方角色造成等同于你攻击力+魔力数值的物理魔法复合伤害。", "Dome Performance wording mismatch");
assert(truthSkill?.text === "使命技。3回合内你使用的牌达到20张成功，3回合后未达到20张失败。触发技能后切换立绘为凋零者形态。", "Dream Truth wording mismatch");
assert(comfortSkill?.type === "trigger" && !comfortSkill.card
  && comfortSkill.text.includes("其他友方角色") && !comfortSkill.text.includes("男性"),
"Gerda Comfort must be an unrestricted end-phase ally trigger");
assert(milkSkill?.card?.kaiichiMilk && milkSkill.text.includes("“绿帽”") && !kaiichiData.skills.some(skill => skill.name === "半魅魔牛奶"), "Kaiichi must use Half-Succubus Essence and the shared Green Hat marker");
assert(!/显示并更新|花色记录/.test(idolSkill?.text || ""), "Idol Star wording must omit suit display/update records");
assert(truthSkill?.text.includes("切换立绘为凋零者形态"), "Dream Truth wording must explain the form switch");

const gerda = unitFromCharacter(gerdaData, "gerda");
const attacker = { uid: "enemy", side: "enemy", name: "敌人", hp: 20, hand: [], discard: [], consumed: [] };
const gerdaState = { battle: { allies: [gerda], enemies: [attacker], animQueue: [] } };
const slashA = card("杀（普攻）", "slash");
assert(!GerdaSkills.allowKill(gerdaState, attacker, gerda, slashA), "Gerda must invalidate a kill when its source cannot discard a response");
const response = card("闪", "response");
attacker.hand = [response];
const slashB = card("杀（普攻）", "slash");
assert(GerdaSkills.allowKill(gerdaState, attacker, gerda, slashB), "Gerda must allow a kill after the source pays a response card");
assert(attacker.hand.length === 0, "Gerda response tax must remove exactly one response card");
attacker.hand = [card("看破", "response")];
assert(GerdaSkills.allowKill(gerdaState, attacker, gerda, slashB) && attacker.hand.length === 1, "One kill card must pay Gerda's tax only once per target");
BattleCardCleanup.clearPlayFlags(slashB);
assert(GerdaSkills.allowKill(gerdaState, attacker, gerda, slashB) && attacker.hand.length === 0, "Reusing a resolved kill card must pay Gerda's tax again");
attacker.hand = [card("闪", "response")];
BattleCardCleanup.clearPlayFlags(slashA);
assert(GerdaSkills.allowKill(gerdaState, attacker, gerda, slashA) && attacker.hand.length === 0, "A previously invalid kill must be able to pay Gerda's tax when reused");
const comfortTarget = unitFromCharacter(character("nonoka"), "comfort-target");
assert(comfortTarget.gender === "female",
  "Gerda Comfort regression must exercise a female ally target");
gerdaState.battle.allies.push(comfortTarget);
gerdaState.battle.activeUid = gerda.uid;
gerdaState.battle.phase = 5;
gerdaState.battle.turn = 0;
gerdaState.battle.played = [];
gerdaState.battle.shownPlayed = [];
gerdaState.battle.mimicLinks = [];
gerda.stats.handLimit = gerda.hand.length - 1;
const originalHooks = {
  SakuraRisaSkills, NonokaLokiSkills, GuestCharacterSkills, HoshinoSkills,
  BertisGerlotSkills, CharacterSkinFX: window.CharacterSkinFX,
  EnemySkills, UnderwaterTrainSkills, ElranaAceNanaliSkills,
};
let beforeComfortCalls = 0, afterComfortCalls = 0;
window.SakuraRisaSkills = { endTurn() { beforeComfortCalls += 1; } };
window.NonokaLokiSkills = { endTurn() { beforeComfortCalls += 1; return true; } };
window.GuestCharacterSkills = { endTurn() { beforeComfortCalls += 1; } };
window.HoshinoSkills = { endTurn() { beforeComfortCalls += 1; } };
window.BertisGerlotSkills = { endTurn() { afterComfortCalls += 1; } };
window.CharacterSkinFX = { endTurn() { afterComfortCalls += 1; } };
window.EnemySkills = { endTurn() { afterComfortCalls += 1; } };
window.UnderwaterTrainSkills = { endTurn() { afterComfortCalls += 1; } };
window.ElranaAceNanaliSkills = { endTurn() { afterComfortCalls += 1; } };
const endPhase = BattleEndPhase({
  allUnits: battle => battle.allies.concat(battle.enemies),
  combat: { damage() {}, pushFloat() {} },
  draw,
});
const discardNeed = unit => Math.max(0, unit.hand.length - unit.stats.handLimit);
const discardFlow = BattleDiscardFlow({
  active: battle => battle.allies.find(unit => unit.uid === battle.activeUid),
  visibleHand: unit => unit.hand.length,
  handLimit: unit => unit.stats.handLimit,
  canDiscardCard: () => true,
  canDiscardAny: () => true,
  discardNeed,
  discardOverflow() {},
  enterEndPhase: endPhase.run,
  draw,
  combat: { pushFloat() {} },
  record() {},
  advanceToInput() {},
  manualFlow: {},
});
assert(discardFlow.enterDiscardOrEnd(gerdaState, gerda) === false && !gerdaState.battle.gerdaComfort && beforeComfortCalls === 0, "Gerda Comfort must not trigger before discard finishes");
gerda.hand.pop();
const gerdaHandBefore = gerda.hand.length, comfortHandBefore = comfortTarget.hand.length;
assert(discardFlow.completeDiscardPhase(gerdaState, gerda) === false && gerdaState.battle.phase === 6 && gerdaState.battle.gerdaComfort && gerdaState.battle.locked, "Gerda Comfort must trigger after discard finishes");
assert(beforeComfortCalls === 3 && afterComfortCalls === 0, "End-phase hooks before Gerda must run exactly once before the picker");
assert(GerdaSkills.resolveComfort(gerdaState, comfortTarget.uid, { draw }), "Gerda Comfort must accept another living ally regardless of gender");
assert(endPhase.run(gerdaState, gerda), "Gerda Comfort resolution must resume and finish the same end phase");
assert(beforeComfortCalls === 3 && afterComfortCalls === 5, "Resuming Gerda Comfort must not repeat earlier end-phase hooks");
assert(gerda.hand.length === gerdaHandBefore + 2 && comfortTarget.hand.length === comfortHandBefore + 2, "Gerda Comfort must draw two cards for both units");
assert(gerda.hand.length > gerda.stats.handLimit && gerdaState.battle.turn === 1 && gerdaState.battle.phase === 6, "End-phase draws must not create a second discard phase");
Object.assign(window, originalHooks);

function draw(unit, count) {
  unit.hand.push(...Array.from({ length: count }, (_, index) => card(`测试摸牌${index}`, "tactic")));
}
const yi = unitFromCharacter(yiData, "yi");
const nonoka = unitFromCharacter(character("nonoka"), "nonoka");
const enemy = { uid: "enemy-a", side: "enemy", name: "木桩", hp: 100, maxHp: 100, hand: [], stats: {}, statuses: [] };
const yiState = { battle: { allies: [yi, nonoka], enemies: [enemy], animQueue: [] } };
const yiHandBefore = yi.hand.length, nonokaHandBefore = nonoka.hand.length;
HoshinoSkills.afterCardPlayed(yiState, yi, enemy, card("红牌", "tactic", { suit: "♥" }), { draw, damage() {} });
assert(yi.hoshinoLastSuit === "♥", "Idol Star must display the first standard suit used");
HoshinoSkills.afterCardPlayed(yiState, yi, enemy, card("黑牌", "tactic", { suit: "♠" }), { draw, damage() {} });
assert(yi.hoshinoLastSuit === "♠", "Idol Star must update its displayed suit after the second standard-suit card");
assert(yi.hand.length === yiHandBefore + 1 && nonoka.hand.length === nonokaHandBefore + 1, "Idol Star must draw for Yi and Nonoka after a color switch");
HoshinoSkills.endTurn(yiState, yi);
assert(yi.hoshinoLastColor == null && yi.hoshinoLastSuit == null, "Idol Star must clear its previous card at Yi's turn end");
assert(yi.hoshinoSuitSet.length === 0, "Dome Performance must clear its suit set at Yi's turn end");
const yiHandAfterIdolEnd = yi.hand.length, nonokaHandAfterIdolEnd = nonoka.hand.length;
HoshinoSkills.afterCardPlayed(yiState, yi, enemy, card("方片", "tactic", { suit: "♦" }), { draw, damage() {} });
assert(yi.hand.length === yiHandAfterIdolEnd && nonoka.hand.length === nonokaHandAfterIdolEnd, "The first standard-suit card of a new turn must not compare with the previous turn");
HoshinoSkills.afterCardPlayed(yiState, yi, enemy, card("梅花", "tactic", { suit: "♣" }), { draw, damage() {} });
assert(yi.hoshinoSuitSet.length === 2 && yi.hand.length === yiHandAfterIdolEnd + 1, "Dome Performance must start a new suit set after Yi's turn cleanup");
HoshinoSkills.afterCardPlayed(yiState, yi, enemy, card("红桃", "tactic", { suit: "♥" }), { draw, damage() {} });
HoshinoSkills.afterCardPlayed(yiState, yi, enemy, card("黑桃", "tactic", { suit: "♠" }), { draw, damage() {} });
assert(yi.hoshinoSuitSet.length === 0 && yi.hand.length === yiHandAfterIdolEnd + 3, "Dome Performance must trigger after four suits in the same turn");
assert(nonoka.hand.length === nonokaHandAfterIdolEnd + 3, "Idol Star must draw for Nonoka on each same-turn color switch");
const missionCardsBeforeRepeat = yi.hoshinoMissionCards;
const suitsBeforeRepeat = [...yi.hoshinoSuitSet];
HoshinoSkills.afterCardPlayed(yiState, yi, enemy, card("克罗研究记录重复牌", "tactic", { suit: "♥", _repeat: true }), { draw, damage() {} });
assert(yi.hoshinoMissionCards === missionCardsBeforeRepeat && JSON.stringify(yi.hoshinoSuitSet) === JSON.stringify(suitsBeforeRepeat), "Repeated cards must not count as another Hoshino Yi card use or suit record");
const repeatDamage = [];
["♣", "♥", "♦", "♠"].forEach(suit => HoshinoSkills.afterCardPlayed(yiState, yi, enemy, card("第二轮花色牌", "tactic", { suit }), {
  draw,
  damage(_state, target, amount, source, actor, damageCard) {
    repeatDamage.push({ target, amount, source, actor, damageCard });
  },
}));
assert(yi.hoshinoSuitSet.length === 0 && repeatDamage.length === 1, "Dome Performance must trigger again on a later four-suit cycle");
const chainedYi = unitFromCharacter(yiData, "chained-yi");
const chainedEnemies = [
  { uid: "chain-enemy-a", side: "enemy", name: "连锁目标甲", hp: 20, maxHp: 20, hand: [], stats: {}, statuses: [] },
  { uid: "chain-enemy-b", side: "enemy", name: "连锁目标乙", hp: 20, maxHp: 20, hand: [], stats: {}, statuses: [] },
];
const chainedState = { battle: { allies: [chainedYi], enemies: chainedEnemies, animQueue: [] } };
const chainedDamage = [];
["♥", "♦", "♠", "♣"].forEach(suit => HoshinoSkills.afterCardPlayed(chainedState, chainedYi, chainedEnemies[0], card("连锁花色牌", "tactic", { suit }), {
  draw,
  damage(_state, target) {
    chainedDamage.push(target.uid);
    if (target === chainedEnemies[0]) chainedEnemies[1].hp = 0;
  },
}));
assert(JSON.stringify(chainedDamage) === JSON.stringify(["chain-enemy-a"]),
  "Dome Performance must skip a later target defeated by an earlier damage reaction");

yi.hoshinoMissionCards = 18;
HoshinoSkills.afterCardPlayed(yiState, yi, enemy, card("使命牌", "tactic", { suit: "♥" }), { draw, damage() {} });
assert(!yi.hoshinoMissionResult && yi.hoshinoMissionCards === 19, "Hoshino Yi mission must remain pending at 19 cards");
HoshinoSkills.afterCardPlayed(yiState, yi, enemy, card("第二十张牌", "tactic", { suit: "♦" }), { draw, damage() {} });
assert(yi.hoshinoMissionResult === "success" && yi.art.endsWith("hoshino-yi-witherer.webp") && yi.avatar.endsWith("hoshino-yi-witherer.webp"), "Hoshino Yi mission must succeed at 20 cards and switch portrait and avatar");
HoshinoSkills.afterCardPlayed(yiState, yi, enemy, card("成功后花色变化", "tactic", { suit: "♠" }), { draw, damage() {} });
assert(yi.tempAttack === 1 && yi.tempMagic === 1, "Dream Truth success must grant Yi temporary attack and magic on a suit change");
BattleTurnState.cleanupTurn(yiState.battle, yi, false, [yi]);
assert(yi.tempAttack === 0 && yi.tempMagic === 0, "Dream Truth temporary stats must clear through normal turn cleanup");
HoshinoSkills.endTurn(yiState, yi);
assert(yi.hoshinoLastColor == null && yi.hoshinoLastSuit == null && yi.hoshinoSuitSet.length === 0,
  "Dream Truth success must clear all Hoshino Yi skill state at turn end");
assert(!yiState.log?.some(line => line.includes("切换为凋零者形态")), "Dream Truth resolution log must omit the form-switch explanation");
assert(yi.hoshinoMissionCards == null, "Hoshino Yi mission card count must clear after resolution");
HoshinoSkills.afterCardPlayed(yiState, yi, enemy, card("使命后出牌", "tactic", { suit: "♦" }), { draw, damage() {} });
assert(yi.hoshinoMissionCards == null, "Hoshino Yi mission card count must stay cleared after later card uses");

const failedYi = unitFromCharacter(yiData, "failed-yi");
const failureEnemies = [
  { uid: "failure-enemy-a", side: "enemy", name: "敌人甲", hp: 100, maxHp: 100, hand: [card("待摸牌", "tactic", { _pendingDraw: true }), card("敌牌甲", "tactic", { suit: "♥" })], stats: {}, statuses: [] },
  { uid: "failure-enemy-b", side: "enemy", name: "敌人乙", hp: 100, maxHp: 100, hand: [card("敌牌乙", "tactic", { suit: "♠" })], stats: {}, statuses: [] },
  { uid: "failure-enemy-dead", side: "enemy", name: "已阵亡", hp: 0, maxHp: 100, hand: [card("不应弃置", "tactic", { suit: "♣" })], stats: {}, statuses: [] },
];
const failureState = { battle: { allies: [failedYi], enemies: failureEnemies, animQueue: [] } };
failedYi.hoshinoMissionCards = 19;
HoshinoSkills.endTurn(failureState, failedYi);
assert(!failedYi.hoshinoMissionResult, "Hoshino Yi mission must remain pending after the first turn");
failedYi.hoshinoLastColor = "red";
failedYi.hoshinoLastSuit = "♥";
failedYi.hoshinoSuitSet = ["♥", "♠"];
HoshinoSkills.endTurn(failureState, failedYi);
assert(!failedYi.hoshinoMissionResult, "Hoshino Yi mission must remain pending after the second turn");
failedYi.hoshinoLastColor = "black";
failedYi.hoshinoLastSuit = "♠";
failedYi.hoshinoSuitSet = ["♦", "♣"];
HoshinoSkills.endTurn(failureState, failedYi);
assert(failedYi.hoshinoMissionResult === "failure", "Hoshino Yi mission must fail after her third turn below 20 cards");
assert(failedYi.hoshinoLastColor == null && failedYi.hoshinoLastSuit == null && failedYi.hoshinoSuitSet.length === 0,
  "Dream Truth failure must clear all Hoshino Yi skill state at turn end");
const originalBattleCards = window.BattleCards;
const discarded = [];
window.BattleCards = {
  ...originalBattleCards,
  put(_battle, holder, discardedCard, pile) {
    discarded.push({ holder, card: discardedCard, pile });
    (holder[pile] ||= []).push(discardedCard);
  },
};
const failureDamage = [];
["♥", "♦", "♠", "♣"].forEach(suit => HoshinoSkills.afterCardPlayed(failureState, failedYi, failureEnemies[0], card("花色牌", "tactic", { suit }), {
  draw,
  damage(_state, target, amount, source, actor, damageCard) { failureDamage.push({ target, amount, source, actor, damageCard }); },
}));
window.BattleCards = originalBattleCards;
assert(failureDamage.length === 2 && failureDamage.every(hit => hit.amount === failedYi.stats.attack + failedYi.stats.magic
  && hit.source === "巨蛋演出" && hit.damageCard.attackType === "magic"
  && hit.damageCard.magicDamage && hit.damageCard.hybridAttack),
"Dome Performance must deal attack-plus-magic composite damage to every living enemy");
assert(discarded.length === 2 && discarded.every(entry => entry.pile === "discard")
  && discarded[0].holder.hand.length === 1 && discarded[0].holder.hand[0]._pendingDraw
  && discarded[1].holder.hand.length === 0,
"Dream Truth failure must discard one non-pending card from every living enemy");

require("./new-character-kaiichi-ui-tests")({
  assert, card, character, draw, unitFromCharacter, yiData, kaiichiData,
});


// ---------- Artina & Maria ----------
vm.runInThisContext(fs.readFileSync("./src/original/artina-maria-skills.js", "utf8"), { filename: "artina-maria-skills.js" });
vm.runInThisContext(fs.readFileSync("./src/original/battle-line-data.js", "utf8"), { filename: "battle-line-data.js" });

const artinaData = character("artina");
const mariaData = character("maria");
assert(JSON.stringify(artinaData.stats) === JSON.stringify({ attack: 3, magic: 3, speed: 4, maxHp: 36, bloodlust: 1, handLimit: 4, drawPerTurn: 2, initialDraw: 2 }), "Artina stats mismatch");
assert(JSON.stringify(mariaData.stats) === JSON.stringify({ attack: 2, magic: 3, speed: 4, maxHp: 38, bloodlust: 2, handLimit: 3, drawPerTurn: 3, initialDraw: 1 }), "Maria stats mismatch");
assert(artinaData.unlockFlag === "ruinsSandCityUnlocked" && mariaData.unlockFlag === "ruinsSandCityUnlocked", "Artina/Maria must unlock with Ruins Sand City");
assert(artinaData.role === "魅影突击队狙击手" && mariaData.role === "魅影突击队支援兵", "Artina/Maria role mismatch");

const artinaLines = window.BattleLineData.skillLines.artina;
const mariaLines = window.BattleLineData.skillLines.maria;
assert(artinaLines["狙击目标"] === "让我看看敌人在哪。", "Artina Sniper Target line missing");
assert(artinaLines["蓄力子弹"] === "耶，打中了要害。", "Artina Charged Bullet line missing");
assert(mariaLines["神数咒语"] === "盖亚妮丝女神请你祝福我。", "Maria Number Spell line missing");
assert(mariaLines["荣誉祝福"] === "神圣的祝福增强我们斗志。", "Maria Honor Blessing line missing");

const foe = { uid: "e9", side: "enemy", name: "靶机", hp: 60, maxHp: 60, block: 0, hand: [card("闪", "response", { suit: "♦" })], discard: [], consumed: [], stats: { attack: 5, magic: 5, speed: 5, maxHp: 60 } };
const artina = unitFromCharacter(artinaData, "artina9");
const artinaState = { battle: { allies: [artina], enemies: [foe], animQueue: [] } };

// Charged Bullet is independent of Sniper Target
artina.artinaSuits = {};
ArtinaMariaSkills.beforeCardPlayed(artinaState, artina, card("杀（普攻）", "slash", { suit: "♥" }), {});
assert(artina.artinaSuits["♥"] === true, "Artina must record the first suit used each turn");
const chargedCard = card("杀（普攻）", "slash", { suit: "♠" });
const chargedDamage = ArtinaMariaSkills.modifySlashDamage(artinaState, artina, foe, 10, chargedCard);
assert(chargedDamage === 30, `Charged Bullet must triple damage with one suit recorded, got ${chargedDamage}`);
assert(!chargedCard.ignoreResponse, "Charged Bullet alone must not block responses");
assert(Object.keys(artina.artinaSuits).length === 0, "Charged Bullet must clear recorded suits");

// Sniper Target blocks responses when Artina holds more of the shown suit
artina.hand = [card("闪", "response", { suit: "♦" }), card("看破", "response", { suit: "♦" })];
const snipeCard = { name: "狙击目标", type: "tactic", artinaSniper: true, enemyTarget: true };
assert(ArtinaMariaSkills.handleSpecialCard(artinaState, artina, foe, snipeCard, {}) === true, "Sniper Target must resolve");
assert(artina.artinaChargedTargetUid === foe.uid, "Sniper Target must mark the target when Artina holds more of the suit");
assert(artina.usedArtinaSniper === true, "Sniper Target must be once per turn");
const snipedSlash = card("杀（普攻）", "slash", { suit: "♣" });
ArtinaMariaSkills.modifySlashDamage(artinaState, artina, foe, 10, snipedSlash);
assert(snipedSlash.ignoreResponse === true, "A sniped target must not respond to the kill");
assert(ArtinaMariaSkills.handleSpecialCard(artinaState, artina, foe, { ...snipeCard }, {}) === false, "Sniper Target must be limited to once per turn");
ArtinaMariaSkills.endTurn(artinaState, artina);
assert(artina.artinaChargedTargetUid === null && Object.keys(artina.artinaSuits).length === 0, "Artina must clear marks at turn end");

// Maria Number Spell
const maria = unitFromCharacter(mariaData, "maria9");
const mariaState = { battle: { allies: [maria], enemies: [foe], animQueue: [] } };
let drawnCount = 0;
const mariaDeps = { draw: (unit, count) => { drawnCount += count; return new Array(count).fill(0).map(() => card("临时牌", "tactic")); } };
ArtinaMariaSkills.beforeCardPlayed(mariaState, maria, card("杀（普攻）", "slash"), mariaDeps);
assert(drawnCount === 1, "Maria must draw one card when her first play reaches the mark count");
assert(maria.mariaMarks === 2 && maria.mariaUseCount === 0, `Maria mark state mismatch: ${maria.mariaMarks}/${maria.mariaUseCount}`);
assert(maria.tempAttack === 2 && maria.tempMagic === 2, "Each Number mark must grant +1 attack and +1 magic");
ArtinaMariaSkills.beforeCardPlayed(mariaState, maria, card("闪", "response"), mariaDeps);
assert(drawnCount === 1 && maria.mariaUseCount === 1, "Maria must not draw before reaching the new mark count");

// Maria Honor Blessing
const blessed = unitFromCharacter(character("lokar"), "blessed9");
maria.hand = [card("甲", "tactic", { suit: "♥" }), card("乙", "tactic", { suit: "♦" })];
const blessState = { battle: { allies: [maria, blessed], enemies: [foe], animQueue: [] } };
const blessCard = { name: "荣誉祝福", type: "tactic", mariaHonorBlessing: true, _bagIndexes: [0, 1] };
const blessBefore = { attack: blessed.stats.attack, magic: blessed.stats.magic, speed: blessed.stats.speed };
const mariaBefore = { attack: maria.stats.attack, magic: maria.stats.magic, speed: maria.stats.speed };
assert(ArtinaMariaSkills.handleSpecialCard(blessState, maria, maria, blessCard, {}) === true, "Honor Blessing must resolve");
assert(blessed.stats.attack === blessBefore.attack + mariaBefore.attack
  && blessed.stats.magic === blessBefore.magic + mariaBefore.magic
  && blessed.stats.speed === blessBefore.speed + mariaBefore.speed,
"Honor Blessing must grant Maria's attack/magic/speed to every ally");
assert(blessed.mariaBlessing.turns === 2, `Blessing must last as many turns as cards discarded, got ${blessed.mariaBlessing.turns}`);
assert(maria.hand.length === 0, "Honor Blessing must discard the chosen cards");
assert(ArtinaMariaSkills.handleSpecialCard(blessState, maria, maria, { ...blessCard, _bagIndexes: [] }, {}) === false, "Honor Blessing must be limited to once per turn");
ArtinaMariaSkills.endTurn(blessState, blessed);
assert(blessed.mariaBlessing.turns === 1, "Blessing must count down each turn");
ArtinaMariaSkills.endTurn(blessState, blessed);
assert(!blessed.mariaBlessing, "Blessing must expire");
assert(blessed.stats.attack === blessBefore.attack && blessed.stats.magic === blessBefore.magic
  && blessed.stats.speed === blessBefore.speed, "Expired blessing must remove its bonus");

// Suit restriction while choosing Honor Blessing costs
maria.hand = [card("甲", "tactic", { suit: "♥" }), card("丙", "tactic", { suit: "♥" })];
const playability = window.BattleCardPlayability({
  isKillCard: testCard => window.CardUtils.isKillCard(testCard),
});
assert(playability.needsHandChoice({ mariaHonorBlessing: true }) === true, "Honor Blessing must require a hand choice");
assert(playability.canSelectHandCost(maria, { mariaHonorBlessing: true }, maria.hand[0], { selectedBagIndexes: [] }, 0) === true, "First suit must be selectable");
assert(playability.canSelectHandCost(maria, { mariaHonorBlessing: true }, maria.hand[1], { selectedBagIndexes: [0] }, 1) === false, "A second card of the same suit must be locked");
assert(playability.canSelectHandCost(maria, { mariaHonorBlessing: true }, maria.hand[1], { selectedBagIndexes: [0, 1] }, 1) === true, "A picked card must stay deselectable");

ArtinaMariaSkills.endTurn(mariaState, maria);
assert(maria.mariaMarks === 0 && maria.mariaUseCount === 0, "Maria must clear marks at turn end");
BattleTurnState.resetBeginTurn(maria, mariaState.battle, 2);
assert(maria.usedMariaHonorBlessing === false, "Honor Blessing must be rearmed next turn");

console.log("New character skill and unlock tests passed");
