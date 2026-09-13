const { test, expect } = require("@playwright/test");
const {
  collectErrors, relevantErrors, openGame, startFreshGame, openTestBattle,
} = require("./helpers/preview-game");

async function enterBattleWithArtinaMaria(page) {
  await openGame(page);
  await startFreshGame(page);
  await page.evaluate(() => {
    (window.state.chars || []).forEach(char => {
      if (char.ref === "artina" || char.ref === "maria"
        || char.id === "artina" || char.id === "maria") char.locked = false;
    });
    if (!(window.state.chars || []).some(c => (c.ref || c.id) === "artina")) {
      window.state.chars.push({ id: "artina", ref: "artina", name: "亚缇娜", locked: false,
        level: 10, exp: 0, stats: { maxHp: 80, attack: 12, magic: 6, speed: 14 } });
    }
    if (!(window.state.chars || []).some(c => (c.ref || c.id) === "maria")) {
      window.state.chars.push({ id: "maria", ref: "maria", name: "玛利亚", locked: false,
        level: 10, exp: 0, stats: { maxHp: 90, attack: 8, magic: 10, speed: 12 } });
    }
    window.state.testAllies = ["artina", "maria"];
    window.render();
  });
  await openTestBattle(page);
  await page.evaluate(() => {
    window.GameAssets.preloadBattle = async () => {};
    window.BattleEffects.whenIdle = async () => {};
    window.BattleFX.playBattleStart = callback => callback?.();
  });
  await page.locator("[data-start-test-battle]").click();
  await expect(page.locator(".battle-screen")).toBeVisible();
  await page.evaluate(() => {
    const battle = window.state.battle;
    battle.animQueue = [];
    battle.locked = false;
    battle.phase = 4;
    window.BattleEffects.recover(window.state);
    window.render();
  });
}

// 让玛利亚成为当前行动者，并布置手牌：♥ ♦ ♥ ♠（0/2 同花色）
async function setupMariaWithHand(page) {
  return page.evaluate(() => {
    const b = window.state.battle;
    const maria = b.allies.find(u => u.ref === "maria" || u.id === "maria");
    b.activeUid = maria.uid;
    maria.hand = [
      { name: "牌A", type: "slash", suit: "♥" },
      { name: "牌B", type: "slash", suit: "♦" },
      { name: "牌C", type: "slash", suit: "♥" },
      { name: "牌D", type: "slash", suit: "♠" },
    ];
    maria.selectedSkillCard = null;
    b.selectedSkillCard = { name: "荣誉祝福", type: "tactic", mariaHonorBlessing: true };
    b.selectedBagIndexes = [0];
    window.render();
    return { uid: maria.uid };
  });
}

test("荣誉祝福：提示文案同步、已选牌上移、同花色置灰", async ({ page }) => {
  const errors = collectErrors(page);
  await enterBattleWithArtinaMaria(page);
  await setupMariaWithHand(page);

  const html = await page.locator(".hand-panel").innerHTML();

  // Bug1：不再回落到默认的「选择敌方目标」
  expect(/选择1至4张花色各不相同的手牌弃置/.test(html)).toBe(true);
  expect(/当前已选1张/.test(html)).toBe(true);
  expect(/选择敌方目标，再次点击目标或确定使用/.test(html)).toBe(false);

  // Bug2a：已选的第 0 张应带 selected 类（上移）
  const firstSelected = await page.evaluate(() => {
    const cards = [...document.querySelectorAll(".active-hand .play-card")];
    return cards.length > 0 && /selected/.test(cards[0].className);
  });
  expect(firstSelected).toBe(true);

  // Bug2b：与已选牌同花色的第 2 张（♥）必须被置灰禁用；异花色不应被禁用
  const lockState = await page.evaluate(() => {
    const cards = [...document.querySelectorAll(".active-hand .play-card")];
    return cards.map(el => ({
      name: el.textContent.replace(/\s+/g, "").slice(0, 4),
      disabled: /disabled|locked|dim/.test(el.className),
    }));
  });
  const sameSuit = lockState[2];   // 牌C ♥ 与已选的牌A 同花色
  const otherSuit = lockState[1];  // 牌B ♦ 异花色
  expect(sameSuit.disabled).toBe(true);
  expect(otherSuit.disabled).toBe(false);

  expect(relevantErrors(errors)).toEqual([]);
});

test("荣誉祝福/狙击目标：使用后按键锁定（限一次）", async ({ page }) => {
  const errors = collectErrors(page);
  await enterBattleWithArtinaMaria(page);

  const result = await page.evaluate(() => {
    const b = window.state.battle;
    const maria = b.allies.find(u => u.ref === "maria" || u.id === "maria");
    const artina = b.allies.find(u => u.ref === "artina" || u.id === "artina");
    const blessCard = { name: "荣誉祝福", type: "tactic", mariaHonorBlessing: true };
    const snipeCard = { name: "狙击目标", type: "tactic", artinaSniper: true, enemyTarget: true };
    const out = {};
    maria.usedMariaHonorBlessing = false;
    out.blessBefore = window.BattleSystem.canPlay(maria, blessCard, b);
    maria.usedMariaHonorBlessing = true;
    out.blessAfter = window.BattleSystem.canPlay(maria, blessCard, b);
    artina.usedArtinaSniper = false;
    out.snipeBefore = window.BattleSystem.canPlay(artina, snipeCard, b);
    artina.usedArtinaSniper = true;
    out.snipeAfter = window.BattleSystem.canPlay(artina, snipeCard, b);
    return out;
  });

  expect(result.blessBefore).toBe(true);
  expect(result.blessAfter).toBe(false);
  expect(result.snipeBefore).toBe(true);
  expect(result.snipeAfter).toBe(false);

  expect(relevantErrors(errors)).toEqual([]);
});

test("狙击目标：展示牌时推送 revealCards 弹窗", async ({ page }) => {
  const errors = collectErrors(page);
  await enterBattleWithArtinaMaria(page);

  const result = await page.evaluate(() => {
    const b = window.state.battle;
    const artina = b.allies.find(u => u.ref === "artina" || u.id === "artina");
    const foe = b.enemies[0];
    foe.hand = [{ name: "杀（普攻）", type: "slash", suit: "♠" }];
    b.animQueue = [];
    artina.usedArtinaSniper = false;
    const ok = window.ArtinaMariaSkills.handleSpecialCard(
      window.state, artina, foe,
      { name: "狙击目标", type: "tactic", artinaSniper: true, enemyTarget: true }, {});
    const reveal = (b.animQueue || []).filter(item => item.type === "revealCards");
    return { ok, count: reveal.length, title: reveal[0]?.title, cards: reveal[0]?.cards?.length };
  });

  expect(result.ok).toBe(true);
  expect(result.count).toBe(1);
  expect(result.title).toBe("狙击目标");
  expect(result.cards).toBe(1);

  expect(relevantErrors(errors)).toEqual([]);
});

test("主动技能不记录花色，也不推进神数计数", async ({ page }) => {
  const errors = collectErrors(page);
  await enterBattleWithArtinaMaria(page);

  const result = await page.evaluate(() => {
    const b = window.state.battle;
    const artina = b.allies.find(u => u.ref === "artina" || u.id === "artina");
    const maria = b.allies.find(u => u.ref === "maria" || u.id === "maria");
    const out = {};
    // 亚缇娜：技能牌（_skill）不得记录花色
    artina.artinaSuits = {};
    window.ArtinaMariaSkills.beforeCardPlayed(window.state, artina,
      { name: "狙击目标", type: "tactic", _skill: true, suit: "♥" }, {});
    out.artinaSkillSuits = Object.keys(artina.artinaSuits).length;
    // 实体牌仍然正常记录
    window.ArtinaMariaSkills.beforeCardPlayed(window.state, artina,
      { name: "杀（普攻）", type: "slash", suit: "♠" }, {});
    out.artinaRealSuits = Object.keys(artina.artinaSuits).length;
    // 玛利亚：技能牌不得推进神数计数
    maria.mariaMarks = 0; maria.mariaUseCount = 0; maria.mariaPhaseMarked = false;
    window.ArtinaMariaSkills.beforeCardPlayed(window.state, maria,
      { name: "荣誉祝福", type: "tactic", _skill: true }, {});
    out.mariaMarksAfterSkill = maria.mariaMarks;
    // 实体牌第一张：只给 1 枚起始标记（显示×1）
    window.ArtinaMariaSkills.beforeCardPlayed(window.state, maria,
      { name: "杀（普攻）", type: "slash", suit: "♥" }, {});
    out.mariaMarksAfterFirstCard = maria.mariaMarks;
    return out;
  });

  expect(result.artinaSkillSuits).toBe(0);
  expect(result.artinaRealSuits).toBe(1);
  expect(result.mariaMarksAfterSkill).toBe(0);
  expect(result.mariaMarksAfterFirstCard).toBe(1);

  expect(relevantErrors(errors)).toEqual([]);
});
