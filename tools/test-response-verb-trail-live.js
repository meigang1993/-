// 实战：出牌区「使用/打出」文案 与 战报日志口径 一致性
// 三国杀口径：
//   响应单体【杀】而出的【闪】= 使用
//   响应 AOE（机枪扫杀/万箭类）而出的【闪】= 打出
// 修复前：出牌区按「响应牌本身」判（闪不是 slash → 恒为「使用了」），
//         日志按「被响应的威胁牌」判（AOE → 「打出」），两者不一致。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const CASES = [
  { name: "杀（普攻）", verb: "使用了", logVerb: "使用", aoe: false },
  { name: "机枪扫杀", verb: "打出了", logVerb: "打出", aoe: true },
];

const inject = cardName => `(() => {
  const b = window.state.battle;
  window.state.settings = window.state.settings || {};
  window.state.settings.manualResponse = false;
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
  const card = findCard(${JSON.stringify(cardName)});
  if (!card) return { missing: true };
  const e1 = b.enemies[1];
  e1.hand = [card];
  e1.stats = e1.stats || {}; e1.stats.attack = 11; e1.stats.magic = 11;
  b.allies.forEach(u => {
    u.hand = [{ name: "闪", type: "response", suit: "♥", responseKind: "dodge" }];
    u.hp = 90; u.maxHp = 90;
    u.stats = u.stats || {}; u.stats.handLimit = 99;
  });
  b.enemies[0].hand = [];
  window.render();
  return { missing: false, cardType: card.type, sweep: !!card.sweep };
})()`;

const snapshot = () => `(() => {
  const b = window.state.battle;
  const played = (b.played || []).slice(0, 10).map(c => ({
    name: c.name,
    action: c._playedAction,
    by: c._playedByName,
  }));
  return {
    played,
    log: (window.state.log || []).slice(0, 12),
    debug: {
      eHand: b.enemies.map(u => (u.hand || []).map(c => c.name)),
      aHand: b.allies.map(u => (u.hand || []).map(c => c.name)),
      locked: !!b.locked,
      manualDodge: !!b.manualDodge,
      aHp: b.allies.map(u => u.hp),
    },
  };
})()`;

(async () => {
  const browser = await chromium.launch();
  const results = [];
  for (const c of CASES) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on("pageerror", e => errors.push(String(e)));
    const row = { name: c.name, verb: c.verb, logVerb: c.logVerb, aoe: c.aoe };
    try {
      await openGame(page);
      await startRegressionBattle(page);
      const inj = await page.evaluate(inject(c.name));
      if (inj.missing) {
        row.err = "卡牌缺失";
        results.push(row);
        await page.close();
        continue;
      }
      row.cardType = inj.cardType;
      row.sweep = inj.sweep;
      // 敌方回合靠「结束出牌」推进不可靠（实测停在准备阶段），
      // 直接驱动真实出牌入口 BattleSystem.useCard，与已修复用例同一修法。
      row.driven = await page.evaluate(`(() => {
        const b = window.state.battle;
        const e1 = b.enemies[1];
        const card = e1.hand && e1.hand[0];
        if (!card) return { noCard: true };
        window.BattleSystem.useCard(window.state, e1, b.allies[0], card);
        window.render?.();
        return { name: card.name };
      })()`);
      let snap = null;
      for (let i = 0; i < 24; i++) {
        await page.waitForTimeout(700);
        const st = await page.evaluate(snapshot());
        if (st.played.some(p => (p.name || "").includes("闪"))) { snap = st; break; }
      }
      row.snap = snap || await page.evaluate(snapshot());
      row.errors = errors.slice(0, 2);
    } catch (e) {
      row.err = String(e).slice(0, 200);
    }
    await page.close();
    results.push(row);
  }
  await browser.close();

  console.log("\n===== 出牌区「使用/打出」 vs 战报日志 一致性 =====");
  let pass = 0, fail = 0;
  results.forEach(r => {
    if (r.err) {
      console.log(`  ❌ ${r.name}  ${r.err}`);
      fail++;
      return;
    }
    const flash = (r.snap?.played || []).filter(p => (p.name || "").includes("闪"));
    const actionOk = flash.length > 0 && flash.every(p => p.action === r.verb);
    const logOk = (r.snap?.log || []).some(
      l => l.includes(r.logVerb) && l.includes("闪"));
    // 「抵消一次闪伤害」= 把响应牌名填进伤害来源，语义反了
    const badLabel = (r.snap?.log || []).filter(
      l => l.includes("闪伤害") || l.includes("杀伤害"));
    const ok = actionOk && logOk && badLabel.length === 0;
    ok ? pass++ : fail++;
    console.log(`  ${ok ? "✅" : "❌"} ${r.name}(${r.aoe ? "AOE" : "单体"})` +
      ` 期望出牌区=${r.verb} 期望日志=${r.logVerb}`);
    console.log(`      出牌区闪=${JSON.stringify(flash)}`);
    console.log(`      战报=${JSON.stringify((r.snap?.log || []).filter(
      l => l.includes("闪")).slice(0, 3))}`);
    console.log(`      played全貌=${JSON.stringify((r.snap?.played || []).slice(0, 6))}`);
    console.log(`      debug=${JSON.stringify(r.snap?.debug)}`);
    if (r.errors?.length) console.log(`      错误=${r.errors.join(";")}`);
  });
  console.log(`\n汇总：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})();
