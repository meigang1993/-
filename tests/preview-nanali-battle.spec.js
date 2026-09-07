const { test, expect } = require("@playwright/test");
const {
  startRegressionBattle,
} = require("./helpers/preview-game");

test("Nanali skills resolve through the real battle system", async ({ page }) => {
  await startRegressionBattle(page);
  const result = await page.evaluate(async () => {
    const battle = window.state.battle;
    const nanali = battle.allies[0];
    const ally = battle.allies[1] || { ...nanali, uid: "nanali-test-ally" };
    const source = battle.enemies[0];
    battle.allies = [nanali, ally];
    battle.enemies = [source];
    battle.test = false;
    battle.locked = false;
    battle.animQueue = [];
    window.state.settings.manualResponse = false;
    Object.assign(nanali, {
      ref: "nanali", name: "娜娜莉", hp: 20, maxHp: 20, block: 0, defenseSystem: 0,
      stats: { ...nanali.stats, attack: 3, magic: 3 }, skills: [], discard: [], consumed: [],
    });
    Object.assign(ally, {
      ref: "test_ally", name: "测试队友", side: "ally", hp: 20, maxHp: 20,
      block: 0, defenseSystem: 0, hand: [], skills: [],
    });
    Object.assign(source, {
      ref: "test_enemy", name: "测试敌人", side: "enemy", ai: null, hp: 30, maxHp: 30,
      block: 0, defenseSystem: 0, skills: [], discard: [], consumed: [],
    });
    const slash = window.CardUtils.cloneEntity("杀（普攻）", { suit: "♠" });
    nanali.hand = [slash, { name: "保留牌", suit: "♦", type: "tactic" }];
    nanali.deck = [{ name: "阿波罗摸牌", suit: "♣", type: "tactic" }];
    nanali.intent = 3;
    source.hand = [
      { name: "敌方战术", suit: "♣", type: "tactic" },
      { name: "敌方杀", suit: "♥", type: "slash", power: 1 },
    ];
    window.BattleSystem.useCard(window.state, nanali, source, slash);
    const apollo = {
      targetHp: source.hp,
      sealed: source.nanaliSealed?.length || 0,
      targetHand: source.hand.length,
      drewTactic: nanali.hand.some(card => card.name === "阿波罗摸牌"),
    };
    window.ElranaAceNanaliSkills.endTurn(window.state, ally, window.BattleSystem);
    const returned = { targetHand: source.hand.length, sealed: source.nanaliSealed?.length || 0 };

    battle.animQueue = [];
    const convertedCost = { name: "转换费用", suit: "♦", type: "tactic" };
    nanali.hand = [];
    nanali.discard.push(convertedCost);
    source.hand = [{ name: "转换扣置牌", suit: "♣", type: "tactic" }];
    source.nanaliSealed = [];
    source.hp = 30;
    window.BattleSystem.useCard(window.state, nanali, source,
      window.CardUtils.convertAs("杀（普攻）", convertedCost, {
        type: "slash", power: 0, scale: "attack", convertedFrom: "测试转换",
        _entitySourceCard: convertedCost, _skipHandMove: true,
      }));
    const converted = {
      targetHp: source.hp,
      sealed: source.nanaliSealed?.length || 0,
      targetHand: source.hand.length,
    };

    battle.animQueue = [];
    nanali.hand = [{ name: "虚拟杀计数牌", suit: "♦", type: "tactic" }];
    source.hand = [{ name: "虚拟杀扣置牌", suit: "♣", type: "tactic" }];
    source.nanaliSealed = [];
    source.hp = 30;
    window.BattleSystem.damage(
      window.state,
      source,
      4,
      "测试虚拟杀",
      nanali,
      window.CardUtils.fromEntity("杀（普攻）", { ignoreResponse: true }),
    );
    const virtual = {
      targetHp: source.hp,
      sealed: source.nanaliSealed?.length || 0,
      targetHand: source.hand.length,
    };

    battle.animQueue = [];
    nanali.hand = [{ name: "复仇费用计数", suit: "♦", type: "tactic" }];
    source.hand = [{ name: "复仇扣置牌", suit: "♣", type: "tactic" }];
    source.nanaliSealed = [];
    source.hp = 30;
    ally.hp = 20;
    window.BattleSystem.damage(
      window.state,
      ally,
      2,
      "测试敌方攻击",
      source,
      window.CardUtils.fromEntity("杀（普攻）", { ignoreResponse: true }),
    );
    window.render();
    await window.BattleEffects.whenIdle();
    const revengePrompt = battle.counterTrigger?.skill || null;
    window.BattleCounterTriggers.resolve(window.state, true, {
      damage: window.BattleSystem.damage,
      directDamage: window.BattleSystem.directDamage,
      useCard: window.BattleSystem.useCard,
      draw: () => [],
      checkDefeat: window.BattleSystem.checkDefeat,
      checkEnd: window.BattleSystem.checkEnd,
    });
    await window.BattleEffects.drain(window.state, window.render);
    const debugResult = {
      apollo,
      returned,
      converted,
      virtual,
      revenge: {
        prompt: revengePrompt,
        allyHp: ally.hp,
        sourceHp: source.hp,
        sealed: source.nanaliSealed?.length || 0,
        sourceHand: source.hand.length,
      },
    };
    return debugResult;
  });
  expect(result).toEqual({
    apollo: { targetHp: 24, sealed: 2, targetHand: 0, drewTactic: true },
    returned: { targetHand: 2, sealed: 0 },
    converted: { targetHp: 24, sealed: 1, targetHand: 0 },
    virtual: { targetHp: 22, sealed: 1, targetHand: 0 },
    revenge: {
      prompt: "复仇之刃", allyHp: 18, sourceHp: 24,
      sealed: 1, sourceHand: 0,
    },
  });
});

test("Nanali revenge after Abe Mike's Starlight Drawslash settles after its target line", async ({ page }) => {
  await startRegressionBattle(page);
  const result = await page.evaluate(async () => {
    const battle = window.state.battle;
    const nanali = battle.allies[0];
    const abe = battle.enemies[0];
    const staleUnits = battle.allies.concat(battle.enemies)
      .filter(unit => unit !== nanali && unit !== abe);
    staleUnits.forEach(unit => { unit.hp = 0; unit.maxHp = 0; });
    battle.allies = [nanali];
    battle.enemies = [abe];
    [
      "manualDodge", "opheliaGuard", "thunderHammer", "dimensionTransfer",
      "recklessPrompt", "risaEyePrompt", "gerdaComfort", "kaiichiShare",
      "millerShare", "newMoonShare", "handReveal", "manualCounter",
      "mannyArmoryPicker", "wendyTutorPicker", "ailengDrillPicker",
      "cadicisResponsibility",
    ].forEach(key => { delete battle[key]; });
    battle.counterTrigger = null;
    battle.counterTriggerQueue = null;
    battle.reactionQueue = null;
    battle.test = false;
    battle.locked = false;
    battle.animQueue = [];
    battle.phase = 1;
    battle.activeUid = abe.uid;
    battle.prepareUnitUid = abe.uid;
    battle.prepareStep = 2;
    window.state.settings.manualResponse = false;
    Object.assign(nanali, {
      ref: "nanali", name: "娜娜莉", side: "ally", hp: 20, maxHp: 20,
      block: 0, defenseSystem: 0, stats: { ...nanali.stats, attack: 3 },
      hand: [
        { name: "复仇费用", suit: "♦", type: "tactic" },
        { name: "保留手牌", suit: "♣", type: "tactic" },
      ],
      discard: [], consumed: [], nanaliSealed: [],
    });
    Object.assign(abe, {
      ref: "abe_mike", ai: "abe_mike", name: "鱼人武士安倍麦克",
      side: "enemy", hp: 30, maxHp: 30, block: 0, defenseSystem: 0,
      stats: { ...abe.stats, attack: 3 }, hand: [
        { name: "星光展示牌", suit: "♠", type: "tactic" },
      ], discard: [], consumed: [], entitySlashThisTurn: 0,
      usedDragonSlash: false,
    });
    window.render();
    window.BattlePrepareSequence({
      combat: { damage: window.BattleSystem.damage },
      draw: window.BattleSystem.draw,
      intentMax: unit => unit.stats.bloodlust,
      nextAnim: () => 1,
      record: (state, text) => window.BattleLog.add(state, text),
      relicPrepare: () => {},
    }).resolve(window.state, abe);
    await window.BattleEffects.drain(window.state, window.render);
    abe.ai = null;
    const sequence = [];
    const observer = new MutationObserver(records => {
      records.forEach(record => {
        if (record.type === "attributes"
          && record.target.matches(".target-line.show")) {
          sequence.push("target-line");
        }
        [...record.addedNodes].forEach(node => {
          if (node.nodeType !== Node.ELEMENT_NODE) return;
          if (node.matches(".seal-card-fly") || node.querySelector(".seal-card-fly")) {
            sequence.push("seal");
          }
        });
      });
    });
    observer.observe(document.body, {
      attributes: true, attributeFilter: ["class"], childList: true, subtree: true,
    });
    const prompt = battle.counterTrigger?.skill || null;
    await window.BattleSystem.resolveCounterTrigger(window.state, true, window.render);
    await window.BattleEffects.whenIdle();
    observer.disconnect();
    return {
      prompt,
      sequence,
      nanaliHp: nanali.hp,
      abeHp: abe.hp,
      sealed: abe.nanaliSealed?.length || 0,
      abeHand: abe.hand.length,
      locked: battle.locked,
      pendingAnimations: battle.animQueue?.length || 0,
      pendingReactions: battle.reactionQueue?.length || 0,
      returnedSealed: abe.nanaliSealed?.length || 0,
      returnedPending: abe.hand.some(card => card._pendingDraw),
      abeUid: abe.uid,
      activeUid: battle.activeUid,
      phase: battle.phase,
    };
  });
  expect(result.prompt).toBe("复仇之刃");
  expect(result.sequence.indexOf("target-line")).toBeGreaterThanOrEqual(0);
  expect(result.sequence.indexOf("seal")).toBeGreaterThan(result.sequence.indexOf("target-line"));
  expect(result.nanaliHp).toBeLessThanOrEqual(17);
  expect(result.abeHp).toBe(24);
  expect(result.pendingAnimations).toBe(0);
  expect(result.pendingReactions).toBe(0);
  expect(result.returnedSealed).toBe(0);
  expect(result.returnedPending).toBe(false);
  expect(result.activeUid).not.toBe(result.abeUid);
  expect(result.phase).toBe(4);
});
