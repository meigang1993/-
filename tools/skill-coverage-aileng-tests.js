/* global GameData, GreenHat, GuestCharacterSkills, NonokaLokiSkills, UICommon */
module.exports = function runAilengCoverage(state, { assert, card, unitFromCharacter }) {
  const rounded = value => Number(value.toFixed(4));
  const aileng = GameData.characters.find(character => character.id === "aileng");
  const conquest = UICommon.skillsOf(unitFromCharacter(aileng)).find(skill => skill.name === "征服欲望");
  const courage = conquest.derivedSkills.find(skill => skill.name === "战斗之勇");
  assert(courage.text.includes("从摸牌堆摸1张牌") && !courage.text.includes("公共牌库"),
    "Conquest Desire's derived Battle Courage must describe the draw pile");
  assert(UICommon.skillText(conquest).includes("【战斗之勇】") && UICommon.skillText(conquest).includes("【充能精华】"), "Conquest Desire must display both derived skill descriptions");
  assert(UICommon.skillSummary(aileng).includes("【战斗之勇】") && UICommon.skillSummary(aileng).includes("【充能精华】"), "Character skill summaries must include derived skills");
  const canonicalChargeText = conquest.derivedSkills.find(skill => skill.name === "充能精华").text;
  assert(canonicalChargeText.includes("你弃置所有红桃牌，令其摸等量牌"), "Charge Essence must describe Aileng as the normal discard source");
  assert(canonicalChargeText.includes("你弃置所有手牌，令贝丝妲摸等量牌"), "Charge Essence must describe Aileng as Besta's discard source");
  assert(canonicalChargeText.includes("若你仍存活，你翻面并跳过下一个完整回合"), "Charge Essence must describe Besta's complete face-down penalty");
  const bertis = unitFromCharacter(GameData.characters.find(character => character.id === "bertis"), "bertis");
  const foodUser = unitFromCharacter(GameData.characters.find(character => character.id === "lokar"), "food-user");
  window.state = { ...state, battle: { ...state.battle, allies: [bertis, foodUser] } };
  const takeFood = UICommon.skillsOf(foodUser).find(skill => skill.name === "取粮");
  assert(takeFood?.source === "derived" && takeFood.showInSkillInfo === false, "Take Food must remain usable without appearing as an innate skill");

  const chargeActor = unitFromCharacter(aileng, "charge-actor");
  chargeActor.skills = [{ name: "充能精华", type: "active", text: "旧版描述", card: { name: "充能精华", text: "旧版技能牌描述" } }];
  const repairedCharge = UICommon.skillsOf(chargeActor).find(skill => skill.name === "充能精华");
  assert(repairedCharge.text === canonicalChargeText && repairedCharge.card.text === canonicalChargeText && repairedCharge.card.ailengCharge, "Stale Charge Essence skill objects must refresh from canonical data");
  const angelica = unitFromCharacter(GameData.characters.find(character => character.id === "angelica"), "angelica");
  const luka = unitFromCharacter(GameData.characters.find(character => character.id === "luka"), "luka");
  const lukaBase = { ...luka.stats };
  chargeActor.hand = [card("红桃牌", "tactic", { suit: "♥" })];
  const chargeState = { battle: { allies: [chargeActor, angelica, luka], enemies: [], animQueue: [] }, chars: [] };
  GuestCharacterSkills.handleSpecialCard(chargeState, chargeActor, angelica, { ailengCharge: true }, {
    draw() {}, damage() {}, intentMax: unit => unit.stats.bloodlust,
  }, { putMany() {} });
  assert(luka.greenHat === 1
    && luka.stats.handLimit === lukaBase.handLimit + 1
    && luka.stats.bloodlust === lukaBase.bloodlust + 1
    && luka.stats.attack === rounded(lukaBase.attack * (1 + GreenHat.ATTACK_RATE)),
  "Charge Essence must grant one additive 30% Green Hat attack bonus");
  for (let index = 1; index < 5; index += 1) GreenHat.grant(luka);
  assert(luka.greenHat === GreenHat.MAX
    && luka.stats.attack === rounded(lukaBase.attack * (1 + GreenHat.ATTACK_RATE * GreenHat.MAX))
    && !GreenHat.grant(luka),
  "Five Green Hat marks must add 150% of the pre-mark attack and respect the cap");
  const idolNonoka = unitFromCharacter(GameData.characters.find(character => character.id === "nonoka"), "idol-nonoka");
  const idolLoki = unitFromCharacter(GameData.characters.find(character => character.id === "loki"), "idol-loki");
  const lokiBaseAttack = idolLoki.stats.attack;
  const kissedMale = unitFromCharacter(aileng, "kissed-male");
  idolNonoka.hand = [card("偶像之吻红桃", "tactic", { suit: "♥" })];
  const idolState = { battle: { allies: [idolNonoka, idolLoki, kissedMale], enemies: [], selectedCardIndex: 0, animQueue: [] } };
  NonokaLokiSkills.handleSpecialCard(idolState, idolNonoka, kissedMale, { idolKiss: true }, {
    statOf: unit => unit.stats.magic, pushFloat() {}, draw() {},
  });
  assert(idolLoki.greenHat === 1
    && idolLoki.stats.attack === rounded(lokiBaseAttack * (1 + GreenHat.ATTACK_RATE)),
  "Youthful Grassland must use the shared 30% Green Hat attack bonus");
  chargeActor.usedAilengCharge = false;
  const nanali = unitFromCharacter(GameData.characters.find(character => character.id === "nanali"), "nanali");
  const lokar = unitFromCharacter(GameData.characters.find(character => character.id === "lokar"), "lokar");
  chargeActor.hand = [card("红桃牌", "tactic", { suit: "♥" })];
  chargeState.battle.allies = [chargeActor, nanali, lokar];
  GuestCharacterSkills.handleSpecialCard(chargeState, chargeActor, nanali, { ailengCharge: true }, {
    draw() {}, damage() {}, intentMax: unit => unit.stats.bloodlust,
  }, { putMany() {} });
  assert(lokar.greenHat === 1, "Charge Essence on Nanali must grant Lokar one Green Hat mark");
  chargeActor.usedAilengCharge = false;
  const besta = unitFromCharacter(GameData.characters.find(character => character.id === "besta"), "besta");
  const extract = GameData.characters.find(character => character.id === "besta_doll").skills.find(skill => skill.name === "榨取精华");
  assert(extract.icon === "🔵" && extract.text.includes("每张红桃牌令你本回合魔力增加50%") && extract.text.includes("所有物理攻击牌均转换为魔法攻击"), "Extract Essence must describe its additive heart scaling and magical-attack conversion");
  besta.tempMagic = 2;
  besta.hand = [card("贝丝妲手牌1", "tactic", { suit: "♠" }), card("贝丝妲手牌2", "response", { suit: "♥" })];
  const chargePending = card("艾伦格待摸牌", "tactic", { suit: "♥", _pendingDraw: true });
  chargeActor.hand = [card("艾伦格手牌1", "tactic", { suit: "♠" }), card("艾伦格手牌2", "response", { suit: "♥" }), chargePending];
  chargeState.battle.allies = [chargeActor, besta, lokar];
  let chargeDiscarded = [], chargeDiscardHolder = null, chargeDrawTarget = null, chargeDrawCount = 0, chargeDamage = null;
  GuestCharacterSkills.handleSpecialCard(chargeState, chargeActor, besta, { ailengCharge: true }, {
    draw(unit, count) { chargeDrawTarget = unit; chargeDrawCount = count; },
    damage(currentState, victim, amount, source, sourceUnit, damageCard) {
      chargeDamage = { victim, amount, source, sourceUnit, damageCard };
      victim.hp = Math.max(0, victim.hp - amount);
      return { hpLoss: amount };
    },
    intentMax: unit => unit.stats.bloodlust,
  }, { putMany(currentState, holder, cards) { chargeDiscardHolder = holder; chargeDiscarded = cards; } });
  assert(chargeDiscardHolder === chargeActor && chargeDiscarded.length === 2 && chargeActor.hand.length === 1 && chargeActor.hand[0] === chargePending, "Charge Essence on Besta must discard Aileng's full visible hand");
  assert(chargeDrawTarget === besta && chargeDrawCount === 2 && besta.hand.length === 2, "Charge Essence on Besta must leave her hand intact and let her draw for Aileng's discards");
  assert(chargeDamage?.victim === chargeActor
    && chargeDamage.amount === besta.stats.magic + besta.tempMagic
    && chargeDamage.sourceUnit === besta && chargeDamage.damageCard.ignoreResponse,
  "Charge Essence on Besta must damage Aileng for Besta's current magic");
  assert(chargeActor.faceDown && chargeActor.statuses.includes("翻面"), "Charge Essence on Besta must turn Aileng face-down");
  const spinEnemy = { uid: "spin-enemy", side: "enemy", name: "回旋斩目标", hp: 30, maxHp: 30, hand: [], stats: {}, statuses: [] };
  const spinState = { battle: { allies: [besta], enemies: [spinEnemy], animQueue: [] } };
  besta.hand = [card("杀（普攻）", "slash", { suit: "♠" }), card("魔杀", "slash", { suit: "♣", scale: "magic" })];
  const spinHits = [];
  GuestCharacterSkills.afterDodge(spinState, spinEnemy, besta, card("杀（普攻）", "slash"), {
    damage(_state, victim, amount, source, sourceUnit, damageCard) {
      spinHits.push({ victim, amount, source, sourceUnit, damageCard });
    },
  });
  assert(spinHits.length === 2 && spinHits.every(hit => hit.damageCard.name === "魔杀" && hit.damageCard.virtual && hit.damageCard.allTargets.includes(spinEnemy.uid)), "Final Spin Slash must use all-target virtual Magic Kills");
  assert(spinHits.every(hit => hit.amount === besta.stats.magic + besta.tempMagic), "Final Spin Slash must scale with Besta's magic");

  const femaleCharacters = GameData.characters.filter(character => character.gender === "female");
  assert(femaleCharacters.length >= 14, "Expected the full playable female roster");
  for (const character of femaleCharacters) {
    const actor = unitFromCharacter(aileng, `charge-all-${character.id}`);
    actor.skills = [GuestCharacterSkills.chargeSkill()];
    const target = unitFromCharacter(character, `charge-target-${character.id}`);
    const heartA = card("红桃测试A", "tactic", { suit: "♥" });
    const heartB = card("红桃测试B", "response", { suit: "♥" });
    const diamond = card("方片测试", "tactic", { suit: "♦" });
    const spade = card("黑桃测试", "slash", { suit: "♠" });
    const pendingHeart = card("待摸红桃", "tactic", { suit: "♥", _pendingDraw: true });
    actor.hand = [heartA, diamond, spade, heartB, pendingHeart];
    const targetKeep = card("目标保留牌", "tactic", { suit: "♣" });
    target.hand = [targetKeep];
    const targetState = { battle: { allies: [actor, target], enemies: [], animQueue: [] }, chars: [] };
    let discarded = [], discardHolder = null, drawTarget = null, drawn = -1, damageAmount = 0;
    const used = GuestCharacterSkills.handleSpecialCard(targetState, actor, target, { ailengCharge: true }, {
      draw(unit, count) { drawTarget = unit; drawn = count; },
      damage(currentState, victim, amount) {
        damageAmount = amount;
        victim.hp = Math.max(0, victim.hp - amount);
        return { hpLoss: amount };
      },
      intentMax: unit => unit.stats.bloodlust,
    }, { putMany(currentState, holder, cards) { discardHolder = holder; discarded = cards; } });
    const expectedDiscard = character.id === "besta" ? [heartA, diamond, spade, heartB] : [heartA, heartB];
    const expectedActorHand = character.id === "besta" ? [pendingHeart] : [diamond, spade, pendingHeart];
    assert(used && discardHolder === actor && discarded.length === expectedDiscard.length && expectedDiscard.every(item => discarded.includes(item)), `Charge Essence discard mismatch: ${character.id}`);
    assert(actor.hand.length === expectedActorHand.length && expectedActorHand.every(item => actor.hand.includes(item)), `Charge Essence must remove cards from Aileng: ${character.id}`);
    assert(drawTarget === target && drawn === expectedDiscard.length && target.hand.length === 1 && target.hand[0] === targetKeep, `Charge Essence draw target mismatch: ${character.id}`);
    assert(damageAmount === (character.id === "besta" ? target.stats.magic : 0), `Charge Essence special damage mismatch: ${character.id}`);
  }
  return aileng;
};
