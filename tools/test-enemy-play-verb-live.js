// 实战：敌方出牌区文案 与 玩家/战报 同源一致性
// 背景（本次修复）：出牌区动画期的临时展示走 BattleSystem.revealPlayed
// （battle-runtime-helpers.js），敌我出牌都会先写 shownPlayed；而战报持久记录
// battle.played 走 BattleCombat.trailSnapshot（battle-combat.js）。
// 修复前 revealPlayed 对非战术牌写死「打出了」，trailSnapshot 写「使用了」，
// 于是敌方出【杀】显示「打出了」、玩家出【杀】显示「使用了」，两侧口径不一致。
// 三国杀口径：主动出牌＝使用（含战术牌）；只有技能＝发动；响应 AOE/决斗才＝打出。
// 修正：此前测试把战术牌写成期望「发动了」，与项目口径相反，本轮已订正。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const findCardSrc = `
  const findCard = n => {
    const src = [window.GameDataRuinsContent?.cards, window.GameData?.cardCodex,
                 window.GameData?.cards, window.GameData?.allCards];
    for (const l of src) {
      if (Array.isArray(l)) {
        const c = l.find(x => x?.name === n);
        if (c) return JSON.parse(JSON.stringify(c));
      }
    }
    return null;
  };
`;

// 用例：普通杀（→使用）、战术牌（→使用，不是发动）、技能牌（→发动）、决斗预设（→打出）
const CASES = [
  { name: "杀（普攻）", want: "使用了" },
  { name: "蓄力", want: "使用了", tactic: true },
];
// 技能牌：只有 _skill / type=skill 才记「发动了」
const SKILL_CASES = [
  { name: "测试技能A", want: "发动了", card: { name: "测试技能A", type: "skill", _skill: true, targetless: true } },
  { name: "测试实体杀-带技能标记", want: "发动了", card: { name: "测试实体杀-带技能标记", type: "attack", _skill: true, targetless: true } },
];

const run = caseName => `(() => {
  ${findCardSrc}
  const b = window.state.battle;
  const card = findCard(${JSON.stringify(caseName)});
  if (!card) return { missing: true };
  const e1 = b.enemies[1] || b.enemies[0];
  b.shownPlayed = [];
  b.played = [];
  // 1) 动画期展示：真实走 revealPlayed（enemyPlay 事件用的就是它）。
  //    玩家肉眼看到的就是这一段——此时 commit 未执行、played 里还没有这张牌。
  window.BattleSystem.revealPlayed(b, card, { uid: e1.uid, id: "verbtest1" });
  const shown = (b.shownPlayed || []).map(c => c._playedAction);
  const shownName = (b.shownPlayed || []).map(c => c._playedByName);
  window.render?.();
  const animText = document.querySelector(".public-cards")?.innerText || "";
  // 2) 战报持久记录：真实走 BattleCombat.useCard
  e1.hand = [card];
  const ok = window.BattleSystem.useCard(window.state, e1, b.allies[0], card);
  const played = (b.played || []).map(c => ({ a: c._playedAction, n: c.name }));
  window.render?.();
  const trailText = document.querySelector(".public-cards")?.innerText || "";
  return { missing: false, shown, shownName, played, useOk: ok, animText, trailText, cardType: card.type };
})()`;

// 技能牌走真实 revealPlayed：验证只有技能记「发动了」
const runSkill = cardObj => `(() => {
  const b = window.state.battle;
  const card = ${JSON.stringify(cardObj)};
  const e1 = b.enemies[1] || b.enemies[0];
  b.shownPlayed = [];
  window.BattleSystem.revealPlayed(b, card, { uid: e1.uid, id: "verbtest3" });
  window.render?.();
  return { shown: (b.shownPlayed || []).map(c => c._playedAction),
           verb: window.CardUtils?.playVerb?.(card) };
})()`;

// 决斗/响应链已显式标注「打出了」的牌，revealPlayed 不得覆盖
const runPreset = `(() => {
  ${findCardSrc}
  const b = window.state.battle;
  const card = findCard("杀（普攻）");
  if (!card) return { missing: true };
  card._playedAction = "打出了";
  b.shownPlayed = [];
  const e1 = b.enemies[1] || b.enemies[0];
  window.BattleSystem.revealPlayed(b, card, { uid: e1.uid, id: "verbtest2" });
  return { shown: (b.shownPlayed || []).map(c => c._playedAction) };
})()`;

(async () => {
  const browser = await chromium.launch();
  const results = [];
  for (const c of CASES) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on("pageerror", e => errors.push(String(e)));
    try {
      await openGame(page);
      await startRegressionBattle(page);
      const r = await page.evaluate(run(c.name));
      results.push({ ...c, ...r, errors: errors.slice(0, 2) });
    } catch (e) {
      results.push({ ...c, err: String(e).slice(0, 200) });
    }
    await page.close();
  }
  // 技能牌：只有技能记「发动了」
  for (const c of SKILL_CASES) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    try {
      await openGame(page);
      await startRegressionBattle(page);
      const r = await page.evaluate(runSkill(c.card));
      results.push({ ...c, shown: r.shown, verb: r.verb, preset: true, cardType: c.card.type });
    } catch (e) {
      results.push({ ...c, err: String(e).slice(0, 200) });
    }
    await page.close();
  }
  // 预设「打出了」不被覆盖
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    try {
      await openGame(page);
      await startRegressionBattle(page);
      const r = await page.evaluate(runPreset);
      results.push({ name: "决斗预设「打出了」", want: "打出了", preset: true, ...r });
    } catch (e) {
      results.push({ name: "决斗预设「打出了」", want: "打出了", preset: true, err: String(e).slice(0, 200) });
    }
    await page.close();
  }
  await browser.close();

  console.log("\n===== 敌方出牌区文案 vs 战报 一致性 =====");
  let pass = 0, fail = 0;
  results.forEach(r => {
    if (r.err || r.missing) {
      console.log(`  ❌ ${r.name}  ${r.err || "卡牌缺失"}`);
      fail++;
      return;
    }
    const shownOk = r.shown?.length === 1 && r.shown[0] === r.want;
    // 战报与出牌区必须同源（预设用例除外：它验证的是不覆盖）
    const playedOk = r.preset
      ? true
      : (r.played?.length > 0 && r.played.every(p => p.a === r.want));
    const byOk = r.preset ? true : (r.shownName?.[0] && r.shownName[0].length > 0);
    const trailOk = r.preset
      ? true
      : (r.trailText.includes(r.want) && !r.trailText.includes("打出了"));
    // 动画期文本＝玩家肉眼所见，必须与战报同口径
    const animOk = r.preset
      ? true
      : (r.animText.includes(r.want) && !r.animText.includes("打出了"));
    const ok = shownOk && playedOk && byOk && trailOk && animOk;
    ok ? pass++ : fail++;
    console.log(`  ${ok ? "✅" : "❌"} ${r.name} 期望=${r.want}`);
    console.log(`      shownPlayed=${JSON.stringify(r.shown)} by=${JSON.stringify(r.shownName || [])} playVerb=${r.verb ?? "-"}`);
    if (!r.preset) {
      console.log(`      played=${JSON.stringify(r.played)} useOk=${r.useOk} type=${r.cardType}`);
      console.log(`      动画期文本=${JSON.stringify((r.animText || "").replace(/\\s+/g, " ").slice(0, 120))}`);
      console.log(`      落定后文本=${JSON.stringify((r.trailText || "").replace(/\\s+/g, " ").slice(0, 120))}`);
    }
    if (r.errors?.length) console.log(`      错误=${r.errors.join(";")}`);
  });
  console.log(`\n汇总：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})();
