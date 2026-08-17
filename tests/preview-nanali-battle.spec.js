const { test, expect } = require("@playwright/test");
const {
  startRegressionBattle,
} = require("./helpers/preview-game");

test("Nanali skills resolve through the real battle system", async ({ page }) => {
  await startRegressionBattle(page);
  const result = await page.evaluate(() => {
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
    return {
      apollo,
      returned,
      converted,
      virtual,
      revenge: {
        allyHp: ally.hp,
        sourceHp: source.hp,
        sealed: source.nanaliSealed?.length || 0,
        sourceHand: source.hand.length,
      },
    };
  });
  expect(result).toEqual({
    apollo: { targetHp: 24, sealed: 2, targetHand: 0, drewTactic: true },
    returned: { targetHand: 2, sealed: 0 },
    converted: { targetHp: 24, sealed: 1, targetHand: 0 },
    virtual: { targetHp: 22, sealed: 1, targetHand: 0 },
    revenge: { allyHp: 18, sourceHp: 24, sealed: 1, sourceHand: 0 },
  });
});
