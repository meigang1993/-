const fs = require("fs");
const vm = require("vm");

global.window = global;
vm.runInThisContext(fs.readFileSync("src/original/game-random.js", "utf8"));
global.BattleEffects = { animating: false, draining: false };
const promptVisible = (battle, key) => !!(battle?.[key]
  && !battle.animQueue?.length && !BattleEffects.animating && !BattleEffects.draining);
global.MannySkills = {
  weapons: [{ id: "cannon", name: "重炮", text: "造成重击" }],
  dimensionTransferVisible: battle => promptVisible(battle, "dimensionTransfer"),
};
global.GuestCharacterSkills = {
  guardVisible: battle => promptVisible(battle, "opheliaGuard"),
};
global.GameEconomy = { shop: { defaultCardPrice: 500 } };

vm.runInThisContext(fs.readFileSync("src/original/data-cards.js", "utf8"));
global.GameData = { cardCodex: GameDataCards.cardCodex };
vm.runInThisContext(fs.readFileSync("src/original/card-utils.js", "utf8"));
vm.runInThisContext(fs.readFileSync("src/original/battle-card-playability.js", "utf8"));
vm.runInThisContext(fs.readFileSync("src/original/wendy-skills.js", "utf8"));
vm.runInThisContext(fs.readFileSync("src/original/cadicis-skills.js", "utf8"));
vm.runInThisContext(fs.readFileSync("src/original/wendy-cadicis-skills.js", "utf8"));
vm.runInThisContext(fs.readFileSync("src/original/ui-battle-pickers.js", "utf8"));
vm.runInThisContext(fs.readFileSync("src/original/battle-damage-attributes.js", "utf8"));
vm.runInThisContext(fs.readFileSync("src/original/card-art.js", "utf8"));
vm.runInThisContext(fs.readFileSync("src/original/ui-common-skill-model.js", "utf8"));
vm.runInThisContext(fs.readFileSync("src/original/ui-common-skill-view.js", "utf8"));
vm.runInThisContext(fs.readFileSync("src/original/ui-common-skills.js", "utf8"));
vm.runInThisContext(fs.readFileSync("src/original/ui-common-art.js", "utf8"));
vm.runInThisContext(fs.readFileSync("src/original/ui-common-card-art.js", "utf8"));
vm.runInThisContext(fs.readFileSync("src/original/ui-common-card-combat.js", "utf8"));
vm.runInThisContext(fs.readFileSync("src/original/ui-common-cards.js", "utf8"));
vm.runInThisContext(fs.readFileSync("src/original/ui-common-relics.js", "utf8"));
vm.runInThisContext(fs.readFileSync("src/original/ui-common.js", "utf8"));
vm.runInThisContext(fs.readFileSync("src/original/battle-response-ui.js", "utf8"));
vm.runInThisContext(fs.readFileSync("src/original/ui-hand-state.js", "utf8"));
vm.runInThisContext(fs.readFileSync("src/original/ui-hand-view.js", "utf8"));
vm.runInThisContext(fs.readFileSync("src/original/ui-hand.js", "utf8"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const dismantledTrail = UICommon.trailCard({ name: "被弃置牌", type: "tactic", suit: "♠", dismantled: true, _playedByName: "目标", _playedAction: "被弃置" });
assert(dismantledTrail.includes('trail-kind dismantled">被拆</span>'), "forced discard trail must render the two-character dismantled marker");
assert(dismantledTrail.includes("目标 被弃置"), "forced discard trail must identify whose hand lost the card");
const comboTrail = UICommon.trailCard({ name: "杀（普攻）", type: "slash", virtual: true, comboAttackVirtual: true, sourceName: "组合进攻" });
assert(comboTrail.includes('trail-kind combo">协攻</span>'), "combo attack slashes should identify their source instead of showing a generic virtual marker");
assert(comboTrail.includes("由组合进攻生成"), "combo attack slash tooltip should explain why the Slash is virtual");

const extractActor = { stats: { attack: 3, magic: 4 }, tempMagic: 4, extractMagicAttack: true };
const physicalSlash = { name: "杀（普攻）", type: "slash", suit: "♠", power: 0, scale: "attack" };
const extractedSlashHtml = UICommon.card(physicalSlash, false, { actor: extractActor });
assert(extractedSlashHtml.includes("魔法攻击 · 伤害 8"), "Extract Essence preview must use current magic for converted physical attacks");
assert(extractedSlashHtml.includes(CardArt.url(physicalSlash)), "hand cards must render their named artwork");
const invasionHtml = UICommon.card({ name: "魔王军入侵", type: "tactic", suit: "♥", demonInvasion: true, hybridAttack: true }, false, { actor: extractActor });
assert(invasionHtml.includes("物理+魔法攻击 · 伤害 11"), "Extract Essence preview must preserve Demon Invasion's hybrid formula");
const staleDuelActor = { stats: { attack: 3, magic: 4 } };
const staleDuelHtml = UICommon.card({ name: "与我一战", type: "tactic", suit: "♠", duel: true, power: 999, scale: "attack" }, false, { actor: staleDuelActor });
assert(staleDuelHtml.includes("物理攻击 · 伤害 3"), "Duel preview must ignore stale base damage");
assert(!staleDuelHtml.includes("伤害 1002"), "stale Duel power must not leak into preview");

const U = { esc: value => String(value ?? "") };
const pickers = window.GameUIBattlePickers(U);
const baseStats = { bloodlust: 1, handLimit: 4 };
const ally = { uid: "a1", side: "ally", name: "我方", hp: 10, hand: [{ name: "交牌", suit: "♥", text: "交给队友" }], skills: [], stats: baseStats };
const teammate = { uid: "a2", side: "ally", name: "队友", hp: 10, hand: [], skills: [], stats: baseStats };
const enemy = { uid: "e1", side: "enemy", name: "敌方", hp: 10, hand: [], skills: [], stats: baseStats };
const battle = { allies: [ally, teammate], enemies: [enemy] };
global.state = { battle, deck: [], explore: { earned: { cards: [] } } };

battle.mannyArmoryPicker = { uid: ally.uid };
assert(pickers.armoryPicker(battle).includes("data-manny-weapon=\"cannon\""), "armory picker should render weapons");
delete battle.mannyArmoryPicker;

battle.wendyTutorPicker = { uid: ally.uid };
const tacticNames = GameData.cardCodex.filter(card => card.type === "tactic").map(card => card.name);
GameData.cardCodex.push(
  { name: "技能战术", text: "不应出现", type: "tactic", _skill: true },
  { name: "虚拟战术", text: "不应出现", type: "tactic", virtual: true },
  { name: "临时战术", text: "不应出现", type: "tactic", temporary: true },
);
const tutorPool = WendyCadicisSkills.tutorPool(state);
const tutorHtml = pickers.wendyTutorPicker(battle);
assert(tacticNames.length > 0, "formal tactic card fixture should not be empty");
assert(tutorPool.length === tacticNames.length, "Wendy tutor pool should contain every formal tactic card exactly once");
tacticNames.forEach(name => {
  assert(tutorPool.some(card => card.name === name), `Wendy tutor pool should include ${name}`);
  assert(tutorHtml.includes(`data-wendy-tutor-card="${name}"`), `Wendy picker should render ${name}`);
});
assert(tutorHtml.includes(`全部${tacticNames.length}张正式战术牌`), "Wendy picker should show the complete tactic count");
assert(tutorHtml.includes('data-battle-picker-scroll="wendy:a1:cards"'), "Wendy picker should expose a stable scroll key");
assert(!tutorHtml.includes("data-wendy-tutor-card=\"看破\""), "Wendy picker should exclude response cards");
assert(!tutorHtml.includes("data-wendy-tutor-card=\"技能战术\""), "Wendy picker should exclude skill cards");
assert(!tutorHtml.includes("data-wendy-tutor-card=\"虚拟战术\""), "Wendy picker should exclude virtual cards");
assert(!tutorHtml.includes("data-wendy-tutor-card=\"临时战术\""), "Wendy picker should exclude temporary cards");
battle.wendyTutorPicker.cardName = tacticNames[0];
assert(pickers.wendyTutorPicker(battle).includes(`data-wendy-tutor-target="${teammate.uid}"`), "Wendy picker should render recipients");
delete battle.wendyTutorPicker;

const overlayCss = fs.readFileSync("publish/battle-overlays.css", "utf8");
assert(/\.armory-card\s*\{[^}]*max-height:[^;}]+;[^}]*overflow:\s*hidden;/s.test(overlayCss), "armory picker should stay inside the battle viewport");
assert(/\.armory-options\s*\{[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/s.test(overlayCss), "armory options should scroll vertically");
assert(/\.judge-card-wrap\s*\{[^}]*width:\s*104px;/s.test(overlayCss), "judgement cards must match the baseline reveal-card width");
assert(/\.judgement-popup \.play-card\s*\{[^}]*width:\s*100%;/s.test(overlayCss), "judgement card content must not stretch its fixed reveal footprint");

const handCostRules = window.BattleCardPlayability({
  isKillCard: window.CardUtils.isKillCard,
});
global.BattleSystem = {
  active: current => current.allies.concat(current.enemies || []).find(unit => unit.uid === current.activeUid) || current.allies[0],
  canSelectHandCost: handCostRules.canSelectHandCost,
  canPlay: () => true,
};
const comboCard = GameData.cardCodex.find(card => card.name === "组合进攻");
const comboActor = { uid: "combo-a", side: "ally", name: "发起者", hp: 10, hand: [comboCard], skills: [], intent: 1, stats: { bloodlust: 1, handLimit: 4 } };
const comboPartner = { uid: "combo-p", side: "ally", name: "配合者", hp: 10, hand: [], skills: [], stats: { bloodlust: 1, handLimit: 4 } };
const comboEnemy = { uid: "combo-e", side: "enemy", name: "目标", hp: 10, hand: [], skills: [], stats: { bloodlust: 1, handLimit: 4 } };
const comboBattle = { allies: [comboActor, comboPartner], enemies: [comboEnemy], activeUid: comboActor.uid, phase: 4, locked: false, selectedCardIndex: 0, pendingTargetUid: comboEnemy.uid, comboPartnerUid: comboPartner.uid };
const handU = {
  card: (item, _hidden, opts) => `<div class="play-card ${opts.disabled ? "disabled" : ""}" data-card-index="${opts.index}" data-card-name="${item.name}"></div>`,
  esc: value => String(value ?? ""), handCount: unit => unit.hand.length,
  handLimit: unit => unit.stats.handLimit, skillName: () => "", skillsOf: () => [], skillState: () => ({}),
};
const comboHtml = window.GameUIHand.render({ battle: comboBattle }, handU);
assert(/data-confirm-target="1"[^>]*>使用<\/button>/.test(comboHtml), "ready combo attack should use a Use confirmation button");
assert(comboHtml.includes("再次点击使用"), "ready combo attack should tell the player to click Use again");
comboBattle.pendingTargetUid = null;
const comboPartnerFirstHtml = window.GameUIHand.render({ battle: comboBattle }, handU);
assert(comboPartnerFirstHtml.includes("已选择配合角色")
  && comboPartnerFirstHtml.includes("请选择一名敌方角色"),
"combo attack should guide the player from ally selection to enemy selection");

const borrowPartner = {
  ...comboPartner,
  hand: [
    { name: "闪", type: "response", suit: "♥" },
    { name: "雷杀", type: "slash", suit: "♦" },
  ],
};
const borrowBattle = {
  allies: [comboActor, borrowPartner], enemies: [comboEnemy],
  activeUid: comboActor.uid, phase: 4, locked: true,
  handReveal: {
    actorUid: comboActor.uid, targetUid: borrowPartner.uid,
    attackTargetUid: comboEnemy.uid, cardName: "借刀杀人",
    card: { name: "借刀杀人", type: "tactic", borrowSlash: true },
    mode: "borrowSlashChoice", validIndexes: [1],
  },
};
const borrowHtml = window.GameUIHand.render({ battle: borrowBattle }, handU);
assert(borrowHtml.includes(`data-hand-owner="${borrowPartner.uid}"`),
  "Borrowed Blade must render the chosen teammate's hand in the hand area");
assert(borrowHtml.includes("借刀杀人") && borrowHtml.includes("单体杀牌"),
  "Borrowed Blade hand area must explain the mandatory card choice");
assert(borrowHtml.includes('class="play-card disabled" data-card-index="0"')
  && borrowHtml.includes('class="play-card " data-card-index="1"'),
"Borrowed Blade must disable invalid hand-area cards and keep valid cards selectable");
assert(!BattleResponseUI.handReveal(borrowBattle),
  "Borrowed Blade must not duplicate the choice in a hand-reveal overlay");
borrowBattle.handReveal.mode = "borrowGainChoice";
borrowBattle.handReveal.validIndexes = [0, 1];
const borrowGainHtml = window.GameUIHand.render({ battle: borrowBattle }, handU);
assert(borrowGainHtml.includes("要获得的1张手牌")
  && borrowGainHtml.includes(`data-hand-owner="${borrowPartner.uid}"`),
"Borrowed Blade fallback gain must use the same teammate hand area");

const costActor = {
  uid: "cost-a", side: "ally", name: "费用测试", hp: 10, intent: 1,
  skills: [], stats: { bloodlust: 1, handLimit: 8 },
  hand: [
    { name: "红桃响应", type: "response", suit: "♥" },
    { name: "方片战术", type: "tactic", suit: "♦" },
    { name: "黑桃杀", type: "slash", suit: "♠" },
    { name: "梅花响应", type: "response", suit: "♣" },
    { name: "无花色消耗", type: "consume" },
    { name: "红桃战术", type: "tactic", suit: "♥" },
  ],
};
const costEnemy = { ...comboEnemy, uid: "cost-e" };
const costBattle = {
  allies: [costActor], enemies: [costEnemy], activeUid: costActor.uid,
  phase: 4, locked: false, selectedCardIndex: null, selectedBagIndexes: [],
};
function costHandHtml(skill, picks = []) {
  costBattle.selectedSkillCard = skill;
  costBattle.selectedCardIndex = null;
  costBattle.selectedBagIndexes = picks;
  return window.GameUIHand.render({ battle: costBattle }, handU);
}
const disabledCost = (html, index) =>
  html.includes(`class="play-card disabled" data-card-index="${index}"`);
const enabledCost = (html, index) =>
  html.includes(`class="play-card " data-card-index="${index}"`);
let costHtml = costHandHtml({ name: "偶像之吻", idolKiss: true, allyTarget: true });
assert(enabledCost(costHtml, 0) && disabledCost(costHtml, 1),
  "Idol Kiss must enable only heart hand cards");
costHtml = costHandHtml({ name: "疯狂射击", crazyShooting: true, targetless: true });
assert(enabledCost(costHtml, 1) && disabledCost(costHtml, 2),
  "Crazy Shooting must enable only red hand cards");
costHtml = costHandHtml({ name: "战场指挥官", cadicisPlan: true, targetless: true });
assert(enabledCost(costHtml, 1) && enabledCost(costHtml, 2)
  && disabledCost(costHtml, 3) && disabledCost(costHtml, 4),
"Battlefield Commander must enable only Kill or tactic cards");
costHtml = costHandHtml({ name: "鬼王扑克", demonPoker: true }, []);
assert(disabledCost(costHtml, 1) && enabledCost(costHtml, 3),
  "Demon Poker must disable tactic cards and allow non-tactics");
costHtml = costHandHtml({ name: "军令状", armyOrder: true, targetless: true }, [0]);
assert(enabledCost(costHtml, 0) && enabledCost(costHtml, 5)
  && disabledCost(costHtml, 1) && disabledCost(costHtml, 4),
"Army Order must keep the picked card enabled and allow only the same standard suit");

battle.ailengDrillPicker = { actorUid: ally.uid, card: { name: "演练牌" } };
assert(pickers.ailengDrillPicker(battle).includes(`data-aileng-drill-target="${teammate.uid}"`), "Aileng picker should render teammates");
delete battle.ailengDrillPicker;

battle.animQueue = [{ type: "pending-animation" }];
battle.cadicisResponsibility = { cadicisUid: ally.uid, targetUid: teammate.uid, count: 2, remaining: 1 };
assert(!pickers.cadicisResponsibilityPicker(battle),
  "Cadicis responsibility prompt must stay hidden while effects are pending");
const cadicisHandBefore = ally.hand.length;
assert(!CadicisSkills.resolveResponsibility(state, 0)
  && ally.hand.length === cadicisHandBefore,
"Cadicis responsibility must reject hand input while its prompt is hidden");
battle.animQueue = [];
const cadicisPrompt = pickers.cadicisResponsibilityPicker(battle);
assert(cadicisPrompt.includes("从手牌区选择") && !cadicisPrompt.includes("data-cadicis-give-index"), "Cadicis picker should direct selection to the character hand area");
delete battle.cadicisResponsibility;

battle.animQueue = [{ type: "pending-animation" }];
battle.dimensionTransfer = {};
assert(!pickers.dimensionPicker(battle),
  "dimension transfer prompt must stay hidden while effects are pending");
battle.animQueue = [];
assert(pickers.dimensionPicker(battle).includes("次元转移"), "dimension transfer prompt should render");
delete battle.dimensionTransfer;

battle.animQueue = [{ type: "pending-animation" }];
battle.opheliaGuard = {};
assert(!pickers.opheliaGuardPicker(battle),
  "Ophelia guard prompt must stay hidden while effects are pending");
battle.animQueue = [];
assert(pickers.opheliaGuardPicker(battle).includes("为我护驾"), "Ophelia guard prompt should render");
BattleEffects.animating = true;
assert(!pickers.opheliaGuardPicker(battle),
  "Ophelia guard prompt must stay hidden during an active animation");
BattleEffects.animating = false;
BattleEffects.draining = true;
assert(!pickers.opheliaGuardPicker(battle),
  "Ophelia guard prompt must stay hidden while the effect queue is draining");
BattleEffects.draining = false;
delete battle.opheliaGuard;

battle.newMoonShare = { unitUid: ally.uid, count: 2 };
assert(pickers.newMoonPicker(battle).includes("新月之歌"), "new moon prompt should render");
delete battle.newMoonShare;

battle.gerdaComfort = { unitUid: ally.uid };
const gerdaPrompt = pickers.gerdaComfortPicker(battle);
assert(gerdaPrompt.includes("data-gerda-comfort-skip=\"1\"")
  && gerdaPrompt.includes("其他队友") && !gerdaPrompt.includes("男性"),
"Gerda Comfort prompt should allow every other teammate and retain decline");
delete battle.gerdaComfort;

battle.kaiichiShare = { unitUid: ally.uid, maxCount: 2, indexes: [0] };
const kaiichiShareHtml = pickers.kaiichiSharePicker(battle);
assert(kaiichiShareHtml.includes("至多2张") && kaiichiShareHtml.includes("一次性交出") && kaiichiShareHtml.includes("当前已选1张"), "Kaiichi share prompt must describe one batch of up to two cards for one ally");
delete battle.kaiichiShare;

const dualBackflip = { name: "后空翻", type: "response", suit: "♠", backflip: true, text: "测试双重响应身份。" };
ally.hand = [dualBackflip];
battle.manualCounter = { actorUid: enemy.uid, targetUid: ally.uid, card: { name: "测试战术", type: "tactic" }, selectedIndex: 0 };
global.SakuraRisaSkills = { backflipCandidates: () => [{ unit: ally, card: dualBackflip }] };
global.GuardKellySkills = { canCounterTacticCard: () => true };
const dualResponseHtml = BattleResponseUI.manualCounterHand(battle);
assert((dualResponseHtml.match(/data-manual-counter-pick=/g) || []).length === 2, "a black Backflip with a conversion skill should expose both legal response modes");
assert(dualResponseHtml.includes("我方 · 后空翻") && dualResponseHtml.includes("我方 · 视为看破"), "dual response modes must be visibly distinguishable");
delete battle.manualCounter;
ally.hand = [{ name: "交牌", suit: "♥", text: "交给队友" }];

battle.handReveal = { mode: "view", actorUid: ally.uid, targetUid: enemy.uid };
enemy.hand = [{ name: "闪", type: "response", suit: "♦", text: "展示牌" }];
assert(BattleResponseUI.handReveal(battle).includes("card-art-dodge"), "displayed hands must use named card artwork");
battle.handReveal = { mode: "steal", actorUid: ally.uid, targetUid: teammate.uid };
teammate.hand = [{ name: "闪", type: "response", suit: "♦", text: "友方正面牌" }];
const friendlyStealHtml = BattleResponseUI.handReveal(battle);
assert(friendlyStealHtml.includes("友方正面牌")
  && !friendlyStealHtml.includes("未知手牌"),
"friendly steal targets must reveal their hand face-up");
battle.handReveal = { mode: "discard", actorUid: ally.uid, targetUid: enemy.uid };
const opposingDiscardHtml = BattleResponseUI.handReveal(battle);
assert(opposingDiscardHtml.includes("未知手牌")
  && !opposingDiscardHtml.includes("展示牌"),
"opposing dismantle targets must keep their hand hidden");
battle.handReveal = {
  mode: "borrowSlashChoice", actorUid: ally.uid, targetUid: teammate.uid,
  validIndexes: [0],
};
teammate.hand = [{ name: "杀（普攻）", type: "slash", suit: "♠", text: "借刀杀牌" }];
const borrowChoiceHtml = BattleResponseUI.handReveal(battle);
assert(borrowChoiceHtml === "",
  "Borrowed Blade must not render a duplicate central hand-reveal choice");
battle.handReveal = {
  mode: "droneExtract", actorUid: enemy.uid, targetUid: ally.uid,
  shownSuit: "♠", shownCard: { name: "雷杀", type: "slash", suit: "♠", text: "亮出牌" },
};
assert(BattleResponseUI.handReveal(battle).includes("card-art-thunder-slash"), "face-up revealed cards must use named card artwork");
delete battle.handReveal;
enemy.hand = [];

battle.millerSlot = { uid: ally.uid, rolls: ["杀", "闪", "杀"], count: 2 };
assert(pickers.millerSlot(battle).includes("贪玩老虎机"), "Miller slot popup should render");

function assertTransferHand(prompt, expectedText) {
  const transferBattle = {
    allies: [ally, teammate], enemies: [enemy], activeUid: enemy.uid,
    phase: 4, locked: prompt === "cadicisResponsibility", [prompt]: prompt === "cadicisResponsibility"
      ? { cadicisUid: ally.uid, targetUid: teammate.uid, count: 1, remaining: 1 }
      : { unitUid: ally.uid, count: 1, maxCount: 1, indexes: [] },
  };
  if (prompt === "millerShare") transferBattle.phase = 5;
  const html = window.GameUIHand.render({ battle: transferBattle }, handU);
  assert(html.includes(`data-hand-owner="${ally.uid}"`), `${expectedText} must show the skill owner's hand outside their active turn`);
  assert(html.includes(expectedText), `${expectedText} must identify its transfer mode in the hand area`);
  assert(html.includes('data-card-index="0"'), `${expectedText} must render selectable cards in the hand area`);
}
global.HoshinoSkills = { shareVisible: current => !!current.kaiichiShare };
assertTransferHand("newMoonShare", "新月之歌");
assertTransferHand("kaiichiShare", "半魅魔血");
assertTransferHand("millerShare", "收获分享");
assertTransferHand("cadicisResponsibility", "指挥官责任");

window.GameUIInfo = () => ({ infoPanelForState: () => "" });
window.GameUILivingRoom = () => ({ render: () => "" });
window.GameUIBattlePickers = () => ({
  armoryPicker: () => "", wendyTutorPicker: () => "", ailengDrillPicker: () => "",
  cadicisResponsibilityPicker: () => "", dimensionPicker: () => "",
  opheliaGuardPicker: () => "", newMoonPicker: () => "", gerdaComfortPicker: () => "",
  kaiichiSharePicker: () => "", millerSlot: () => "",
});
window.GameUIBattleUnits = () => ({ unit: () => "", activeInfo: () => "" });
window.GameUIHand = { render: () => "" };
window.BattlePileStats = { render: () => "" };
window.BattleResponseUI = {
  handReveal: () => "", manualDodgePrompt: () => "", manualCounterPrompt: () => "",
  recklessPrompt: () => "", evilEyePrompt: () => "",
};
window.DungeonSystem = { rewardPopup: () => "" };
GameData.missions = [];
vm.runInThisContext(fs.readFileSync("src/original/ui-battle-trail.js", "utf8"));
vm.runInThisContext(fs.readFileSync("src/original/ui-battle-overlays.js", "utf8"));
vm.runInThisContext(fs.readFileSync("src/original/ui-battle-scene.js", "utf8"));
vm.runInThisContext(fs.readFileSync("src/original/ui.js", "utf8"));
const overlayBattle = {
  allies: [], enemies: [], played: [], shownPlayed: [], roundNo: 1, locked: false,
  judgement: {
    skill: "测试判定", success: true, suit: "♠", name: "雷杀",
    card: { name: "雷杀", suit: "♠", type: "slash", text: "雷属性判定牌" },
  },
  lastClash: {
    result: "成功", a: "♥", t: "♣",
    actorCard: { name: "火杀", suit: "♥", type: "slash", text: "使用方拼花牌" },
    targetCard: { name: "闪", suit: "♣", type: "response", text: "目标方拼花牌" },
  },
  revealCards: {
    title: "亮出测试",
    cards: [{ name: "愈魔瓶", suit: "♦", type: "consume", text: "亮出的卡牌" }],
  },
};
const overlayHtml = GameUI.battle({ battle: overlayBattle, battleLog: [] });
assert(overlayHtml.includes("card-art-thunder-slash"), "judgement must keep the revealed card artwork");
overlayBattle.locked = true;
overlayBattle.opheliaGuard = {};
overlayBattle.animQueue = [{ type: "pending-animation" }];
const pendingGuardHtml = GameUI.battle({ battle: overlayBattle, battleLog: [] });
assert(pendingGuardHtml.includes("reaction-prompt-pending")
  && !pendingGuardHtml.includes("ophelia-guarding"),
"hidden guard prompts must block input without exposing guard targeting");
overlayBattle.animQueue = [];
const visibleGuardHtml = GameUI.battle({ battle: overlayBattle, battleLog: [] });
assert(visibleGuardHtml.includes("ophelia-guarding")
  && !visibleGuardHtml.includes("reaction-prompt-pending"),
"guard targeting must become visible only after battle effects are idle");
assert(overlayHtml.includes("play-card slash") && overlayHtml.includes("雷属性判定牌"), "judgement must keep the revealed card type and effect");
assert(overlayHtml.includes("使用方") && overlayHtml.includes("目标方"), "clash must label both revealed sides");
assert(overlayHtml.includes("card-art-fire-slash") && overlayHtml.includes("card-art-dodge"), "clash must show both real revealed card artworks");
assert(overlayHtml.includes("card-art-healing-mana-bottle"), "show and reveal overlays must use named card artwork");
assert(overlayHtml.includes("reveal-card-wrap"), "show overlays must flip from a card-back wrapper instead of a blank backface");
const compactCss = fs.readFileSync("publish/animations.css", "utf8");
assert(compactCss.includes(".play-card { min-height: 132px; }"), "short desktop layout must shrink illustrated cards");
assert(compactCss.includes(".judge-card-wrap { width: 88px; }"), "short judgement cards must match short reveal cards");
assert(compactCss.includes(".judge-card-wrap { width: 76px; }"), "very short judgement cards must match very short reveal cards");
assert(compactCss.includes(".public-cards .card-art { flex-basis: 17px; }"), "very short public cards must shrink their artwork");
assert(compactCss.includes("@keyframes revealPopIn"), "reveal entry animation must preserve horizontal centering");
assert(overlayCss.includes("overflow: hidden auto"), "hand reveal panel must scroll vertically when illustrated cards exceed its height");

console.log("Battle UI picker module tests passed");
