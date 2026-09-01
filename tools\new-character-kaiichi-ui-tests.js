/* global GameData, GameUIHand, GameUIInfo, HoshinoSkills, LocalCoreEventOps, NewCharacterUnlockEvents, UICommon */
const fs = require("fs");
const vm = require("vm");
module.exports = ({
  assert, card, character, draw, unitFromCharacter, yiData, kaiichiData,
}) => {
  const kaiichi = unitFromCharacter(kaiichiData, "kaiichi");
  const targetNonoka = unitFromCharacter(character("nonoka"), "target-nonoka");
  const loki = unitFromCharacter(character("loki"), "loki");
  const resonanceState = {
    battle: { allies: [kaiichi, targetNonoka, loki], enemies: [], animQueue: [] },
  };
  let resonanceDamage = null;
  let resonanceDraw = 0;
  HoshinoSkills.handleSpecialCard(resonanceState, kaiichi, targetNonoka, {
    kaiichiMilk: true,
  }, {
    draw(unit, count) { if (unit === targetNonoka) resonanceDraw += count; },
    damage(state, victim, amount, source, sourceUnit, damageCard) {
      resonanceDamage = { victim, amount, source, sourceUnit, damageCard };
      return { hpLoss: amount };
    },
  });
  assert(resonanceDamage?.amount === targetNonoka.stats.magic
    && resonanceDamage.damageCard.attackType === "magic"
    && resonanceDamage.source === "半魅魔精华",
  "Half-Succubus Essence damage must use the target's magic as magical damage");
  assert(resonanceDraw === 2 + kaiichi.stats.drawPerTurn,
    "Half-Succubus Essence must draw Kaiichi's total per-turn draw count");
  const lokiBaseAttack = character("loki").stats.attack;
  assert(loki.greenHat === 1
    && loki.stats.attack === Number((lokiBaseAttack * 1.3).toFixed(4)),
    "Half-Succubus Essence on Nonoka must grant Loki one 30% Green Hat attack bonus");
  const legacyLoki = unitFromCharacter(character("loki"), "legacy-loki");
  legacyLoki.envy = 2;
  legacyLoki.stats.attack += 2;
  legacyLoki.statuses.push("妒火");
  resonanceState.battle.allies = [kaiichi, targetNonoka, legacyLoki];
  kaiichi.usedKaiichiMilk = false;
  HoshinoSkills.handleSpecialCard(resonanceState, kaiichi, targetNonoka, {
    kaiichiMilk: true,
  }, { draw() {}, damage() {} });
  assert(legacyLoki.greenHat === 3
    && legacyLoki.stats.attack === Number((lokiBaseAttack * 1.9).toFixed(4))
    && legacyLoki.envy == null && !legacyLoki.statuses.includes("妒火"),
  "Legacy Envy marks must convert from fixed attack to additive 30% Green Hat bonuses");
  const yiHealer = unitFromCharacter(yiData, "yi-healer");
  kaiichi.hp = 20;
  kaiichi.hand = [card("原有手牌", "tactic")];
  const bloodState = {
    battle: {
      allies: [kaiichi, yiHealer], enemies: [], activeUid: kaiichi.uid,
      phase: 4, animQueue: [], locked: false,
    },
  };
  Object.assign(bloodState, { equipment: {}, testEquipment: {}, resources: { relics: [] } });
  window.state = bloodState;
  HoshinoSkills.afterDamage(bloodState, yiHealer, kaiichi, card("伤害", "tactic"), 3, {
    draw,
    damage() {},
    pushFloat() {},
  });
  assert(kaiichi.hand.length === 3
    && kaiichi.hp === 20 + yiHealer.stats.magic,
    "Half-Succubus Blood must draw two and receive Yi's magic healing");
  assert(bloodState.battle.kaiichiShare?.maxCount === 2 && bloodState.battle.locked,
    "Half-Succubus Blood must synchronously offer up to two cards in one transfer");
  const sharedCards = kaiichi.hand.slice(0, 2);
  assert(HoshinoSkills.toggleShareCard(bloodState, 0)
    && HoshinoSkills.toggleShareCard(bloodState, 1),
  "Half-Succubus Blood must let the player choose up to two cards");
  HoshinoSkills.toggleShareCard(bloodState, 2);
  assert(bloodState.battle.kaiichiShare.indexes.length === 2,
    "Half-Succubus Blood must reject a third selected card");
  const firstShare = HoshinoSkills.resolveShare(bloodState, yiHealer.uid);
  assert(firstShare.ok && firstShare.done
    && sharedCards.every(item => yiHealer.hand.includes(item))
    && !bloodState.battle.locked,
  "Half-Succubus Blood must give both selected cards together to one ally");
  bloodState.battle.activeUid = "enemy-turn";
  bloodState.battle.enemies = [{ uid: "enemy-turn", side: "enemy", hp: 10 }];
  HoshinoSkills.afterDamage(
    bloodState, bloodState.battle.enemies[0], kaiichi,
    card("连续伤害1", "slash"), 1, { draw, damage() {}, pushFloat() {} },
  );
  HoshinoSkills.afterDamage(
    bloodState, bloodState.battle.enemies[0], kaiichi,
    card("连续伤害2", "slash"), 1, { draw, damage() {}, pushFloat() {} },
  );
  assert(bloodState.battle.kaiichiShare
    && bloodState.battle.kaiichiShareQueue.length === 1,
  "Consecutive Half-Succubus Blood triggers must keep one active and one queued transfer prompt");
  const firstQueuedStop = HoshinoSkills.resolveShare(bloodState, null);
  assert(firstQueuedStop.done && !firstQueuedStop.resumeEnemyUid,
    "Enemy turn must stay paused while another Half-Succubus Blood prompt remains");
  assert(HoshinoSkills.activateShare(bloodState),
    "The second queued Half-Succubus Blood prompt must activate");
  const finalQueuedStop = HoshinoSkills.resolveShare(bloodState, null);
  assert(finalQueuedStop.done && finalQueuedStop.resumeEnemyUid === "enemy-turn"
    && !bloodState.battle.locked,
  "Enemy turn may resume only after the final Half-Succubus Blood prompt");
  const pausedKaiichi = unitFromCharacter(kaiichiData, "paused-kaiichi");
  const pausedAlly = unitFromCharacter(yiData, "paused-ally");
  const pausedEnemy = { uid: "paused-enemy", side: "enemy", hp: 10 };
  pausedKaiichi.hand = [];
  const pausedState = {
    battle: {
      allies: [pausedKaiichi, pausedAlly], enemies: [pausedEnemy],
      activeUid: pausedEnemy.uid, phase: 4, animQueue: [], locked: false,
    },
  };
  HoshinoSkills.afterDamage(
    pausedState, pausedEnemy, pausedKaiichi,
    card("敌方出牌伤害", "slash"), 1, { draw, damage() {}, pushFloat() {} },
  );
  assert(pausedState.battle.activeUid === pausedEnemy.uid
    && pausedState.battle.kaiichiShare && pausedState.battle.locked
    && !pausedState.battle.kaiichiShareScheduled,
  "Half-Succubus Blood must synchronously pause the same enemy before its play phase or next hit continues");
  pausedState.battle.activeUid = pausedAlly.uid;
  const staleResume = HoshinoSkills.resolveShare(pausedState, null);
  assert(staleResume.resumeEnemyUid === pausedEnemy.uid,
    "Half-Succubus Blood must retain the interrupted enemy identity instead of deriving it from a later active unit");
  vm.runInThisContext(fs.readFileSync("./src/original/battle-response-ui.js", "utf8"), {
    filename: "battle-response-ui.js",
  });
  vm.runInThisContext(fs.readFileSync("./src/original/ui-hand-state.js", "utf8"), {
    filename: "ui-hand-state.js",
  });
  vm.runInThisContext(fs.readFileSync("./src/original/ui-hand-view.js", "utf8"), {
    filename: "ui-hand-view.js",
  });
  vm.runInThisContext(fs.readFileSync("./src/original/ui-hand.js", "utf8"), {
    filename: "ui-hand.js",
  });
  const shareHtml = GameUIHand.render(bloodState, UICommon);
  assert(shareHtml.includes("星野海一 的手牌"),
    "Kaiichi's hand panel must remain available after Half-Succubus Blood resolves");
  vm.runInThisContext(fs.readFileSync("./src/original/ui-info.js", "utf8"), {
    filename: "ui-info.js",
  });
  const info = GameUIInfo(UICommon);
  const pendingYi = unitFromCharacter(yiData, "pending-yi");
  assert(info.idolSuitMark(pendingYi) === "",
    "Idol Star must not show a suit before a standard-suit card is used");
  pendingYi.hoshinoLastSuit = "♦";
  assert(info.idolSuitMark(pendingYi).includes("偶像 ♦"),
    "Idol Star must show the last standard suit used");
  pendingYi.hoshinoLastSuit = "♣";
  assert(info.idolSuitMark(pendingYi).includes("偶像 ♣"),
    "Idol Star suit display must update when another standard suit is used");
  pendingYi.hoshinoSuitSet = ["♠", "♥"];
  assert(info.domeSuitMark(pendingYi).includes("巨蛋 ♥♠")
    && !info.domeSuitMark(pendingYi).includes("本回合"),
  "Dome Performance must display its current-turn suit set without stale persistence wording");
  const battleUiSource = fs.readFileSync("./src/original/ui-battle-units.js", "utf8");
  assert((battleUiSource.match(/I\.domeSuitMark/g) || []).length === 2,
    "Both the battlefield portrait and active portrait must render Dome Performance suits");
  pendingYi.hoshinoMissionCards = 7;
  assert(info.missionMark(pendingYi).includes("使命 7/20"),
    "Hoshino Yi mission progress must display the used-card count");
  pendingYi.hoshinoMissionResult = "failure";
  assert(info.missionMark(pendingYi) === "",
    "Hoshino Yi mission progress must disappear after success or failure");
  vm.runInThisContext(fs.readFileSync("./src/original/unlock-event-progress.js", "utf8"), {
    filename: "unlock-event-progress.js",
  });
  vm.runInThisContext(fs.readFileSync("./src/original/local-core-utils.js", "utf8"), {
    filename: "local-core-utils.js",
  });
  vm.runInThisContext(fs.readFileSync("./src/original/local-core-events.js", "utf8"), {
    filename: "local-core-events.js",
  });
  vm.runInThisContext(fs.readFileSync("./src/original/new-character-unlock-events.js", "utf8"), {
    filename: "new-character-unlock-events.js",
  });
  const core = {
    chars: GameData.characters.map(item => ({ ...item, stats: { ...item.stats } })),
    flags: { hoshinoFamilyUnlockPending: true },
    unlockEvents: window.UnlockEventProgress.fresh(),
    defeatedElites: ["demon_king_bakaar"],
  };
  LocalCoreEventOps.unlockEvent(core, { id: "gerda_nursery" });
  assert(core.flags.gerdaNurseryUnlocked,
    "Bakaar defeat event must open Gerda's nursery exchange");
  LocalCoreEventOps.unlockEvent(core, { id: "hoshino_family" });
  assert(!core.chars.find(item => item.id === "hoshino_yi").locked
    && !core.chars.find(item => item.id === "hoshino_kaiichi").locked,
  "Hoshino family event must unlock Yi and Kaiichi together");
  const clearState = { flags: {} };
  assert(!NewCharacterUnlockEvents.recordDungeonClear(clearState, {
    missionId: "orc_dungeon", difficultyId: "normal", complete: true,
  }), "Orc normal clear must not queue the Hoshino family event");
  assert(!NewCharacterUnlockEvents.recordDungeonClear(clearState, {
    missionId: "orc_dungeon", difficultyId: "adventure", complete: false,
  }), "Incomplete Orc adventure run must not queue the Hoshino family event");
  assert(NewCharacterUnlockEvents.recordDungeonClear(clearState, {
    missionId: "orc_dungeon", difficultyId: "adventure",
    complete: true, party: ["lokar"],
  }) && clearState.flags.hoshinoFamilyUnlockPending,
  "First Orc adventure clear must queue the Hoshino family event without requiring Aileng");
  assert(!NewCharacterUnlockEvents.recordDungeonClear(clearState, {
    missionId: "orc_dungeon", difficultyId: "adventure", complete: true,
  }), "Pending Hoshino family event must not be queued twice");
};
