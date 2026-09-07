const {
  appendedClasses,
  assert,
  BattleFX,
  feedbackOrder,
  setArtRect,
} = require("./battle-fx-test-harness");

function testDamageFeedback() {
  appendedClasses.length = 0;
  const defenseState = {
    battle: {
      hitFxId: 9,
      floats: [{ id: "defense-float", uid: "a0", kind: "defense", value: 3, seq: 0, hitFxId: 9, damageTypes: ["thunder"] }],
    },
  };
  global.state = defenseState;
  BattleFX.popFloats(defenseState);
  const defenseClass = appendedClasses.find(name => name.includes("float-num"));
  assert(defenseClass && !defenseClass.includes("damage-type-"), "defense floats must keep their defense color instead of inheriting the damage attribute color");

  BattleFX.cancel(defenseState);
  feedbackOrder.length = 0;
  const damageState = {
    battle: {
      floats: [{ id: "damage-feedback", uid: "a0", kind: "damage", value: 6, seq: 1, hitFxId: 10, damageTypes: ["thunder"] }],
    },
  };
  global.state = damageState;
  BattleFX.popFloats(damageState);
  const attributeAt = feedbackOrder.indexOf("attribute");
  const floatAt = feedbackOrder.findIndex(item => item.startsWith("append:float-num damage"));
  const impactAt = feedbackOrder.indexOf("impact:thunder");
  assert(attributeAt >= 0 && attributeAt < floatAt && floatAt < impactAt, "damage visuals must lead the floating number and impact sound");
  assert(!feedbackOrder.includes("sfx:damage"), "attribute damage must emit only one impact sound");

  BattleFX.cancel(damageState);
  feedbackOrder.length = 0;
  appendedClasses.length = 0;
  const magicState = {
    battle: {
      floats: [{ id: "magic-feedback", uid: "a0", kind: "damage", value: 8, seq: 2, hitFxId: 11, damageTypes: ["dark"], attackType: "magic" }],
    },
  };
  global.state = magicState;
  BattleFX.popFloats(magicState);
  assert(appendedClasses.some(name => name.includes("damage-magic")), "magic damage must use the dedicated bright-purple number class");
  assert(feedbackOrder.includes("impact:magic"), "magic damage must use the dedicated resonance impact sound");
  BattleFX.cancel(damageState);
}

function testUtilityFeedbackSounds() {
  feedbackOrder.length = 0;
  setArtRect({ left: 10, top: 10, width: 0, height: 0 });
  const hiddenHealState = { battle: { floats: [{ id: "hidden-heal", uid: "a0", kind: "heal", value: 2, seq: 1 }] } };
  global.state = hiddenHealState;
  BattleFX.popFloats(hiddenHealState);
  assert(!feedbackOrder.some(item => item === "sfx:heal"), "hidden feedback must not play a detached floating-number sound");
  BattleFX.cancel(hiddenHealState);

  feedbackOrder.length = 0;
  setArtRect({ left: 10, top: 10, width: 80, height: 80 });
  const healState = { battle: { floats: [{ id: "visible-heal", uid: "a0", kind: "heal", value: 2, seq: 1 }] } };
  global.state = healState;
  BattleFX.popFloats(healState);
  const healFloatAt = feedbackOrder.findIndex(item => item.startsWith("append:float-num heal"));
  assert(healFloatAt >= 0 && healFloatAt < feedbackOrder.indexOf("sfx:heal"), "healing sound must follow successful floating-number creation");

  BattleFX.cancel(healState);
  feedbackOrder.length = 0;
  const hpLossState = { battle: { floats: [{ id: "visible-hp-loss", uid: "a0", kind: "hp-loss", value: 2, seq: 1 }] } };
  global.state = hpLossState;
  BattleFX.popFloats(hpLossState);
  const hpLossFloatAt = feedbackOrder.findIndex(item => item.startsWith("append:float-num hp-loss"));
  assert(hpLossFloatAt >= 0 && hpLossFloatAt < feedbackOrder.indexOf("sfx:hp-loss"), "HP-loss sound must follow successful floating-number creation");

  BattleFX.cancel(hpLossState);
  feedbackOrder.length = 0;
  const armorState = { battle: { floats: [{ id: "visible-armor", uid: "a0", kind: "armor-gain", value: 2, seq: 1 }] } };
  global.state = armorState;
  BattleFX.popFloats(armorState);
  const armorFloatAt = feedbackOrder.findIndex(item => item.startsWith("append:float-num armor-gain"));
  assert(armorFloatAt >= 0 && armorFloatAt < feedbackOrder.indexOf("sfx:armor-gain"), "armor sound must follow successful floating-number creation");

  BattleFX.cancel(armorState);
  feedbackOrder.length = 0;
  const hybridState = {
    battle: {
      floats: [{ id: "hybrid-feedback", uid: "a0", kind: "damage", value: 9, seq: 1, hitFxId: 12, damageTypes: ["physical"], attackType: "magic", hybridAttack: true }],
    },
  };
  global.state = hybridState;
  BattleFX.popFloats(hybridState);
  assert(feedbackOrder.filter(item => item === "impact:magic").length === 1, "composite invasion damage must emit one synchronized impact sound");
  assert(!feedbackOrder.includes("sfx:damage"), "composite invasion damage must not duplicate the generic hit sound");
}

module.exports = { testDamageFeedback, testUtilityFeedbackSounds };
