// 实战：兽人地下城剩余 3 张卡（追杀 / 弹反 / 火杀）机制验证
// 确定性：直接调用 BattleSystem.useCard 打出（不依赖 AI 决策）
// 覆盖：
//   火杀  → 火属性伤害 + 随机令目标1张手牌获得「燃烧」
//   追杀  → 单体物理伤害（实体杀未造成伤害时本回合不消耗杀意）
//   弹反  → 响应牌：成为单体【杀】目标时可打出并与来源猜拳
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const findCardSrc = `
  const findCard = n => {
    const src = [window.GameDataCards?.eliteCards, window.GameData?.cardCodex,
                 window.GameData?.cards, window.GameData?.allCards];
    for (const l of src) {
      if (Array.isArray(l)) {
        const c = l.find(x => x?.name === n);
        if (c) return JSON.parse(JSON.stringify(c));
      }
    }
    return null;
  };`;

// ---------- 场景1/2：敌方确定性打出单体杀（火杀 / 追杀） ----------
const injectOffense = cardName => `(() => {
  ${findCardSrc}
  const b = window.state.battle;
  const card = findCard(${JSON.stringify(cardName)});
  if (!card) return { missing: true };
  const e1 = b.enemies[1];
  e1.stats = e1.stats || {};
  e1.stats.attack = 10; e1.stats.magic = 10;
  // 玩家方不给任何响应牌 → 必定命中，才能触发"造成伤害后"的燃烧与伤害结算。
  // 注意：给一张普通杀牌占位即可，绝不能给【闪】——自动模式下闪会被打出并抵消伤害，
  // 导致火杀不掉血、燃烧不生成、追杀也判不出伤害（此前 3 项失败的真正原因）。
  b.allies.forEach(u => {
    u.hp = 150;
    u.stats = u.stats || {};
    u.stats.handLimit = 99;
    u.hand = [{ name: "杀", type: "slash", suit: "♠" },
              { name: "杀", type: "slash", suit: "♥" }];
  });
  b.enemies[0].hand = [];
  window.__card = card;
  window.__target = b.allies[0];
  window.render();
  return { missing: false, target: b.allies[0].name, hp: b.allies.map(u => u.hp) };
})()`;

const fireCard = `(() => {
  const b = window.state.battle;
  const e1 = b.enemies[1];
  const card = window.__card;
  const target = window.__target;
  if (!card || !target) return { err: "no card/target" };
  const fn = window.BattleSystem?.useCard;
  if (typeof fn !== "function") return { err: "BattleSystem.useCard 不可用" };
  try {
    fn(window.state, e1, target, card);
    return { fired: true };
  } catch (e) {
    return { err: String(e).slice(0, 200) };
  }
})()`;

// ---------- 场景3：弹反（玩家侧响应牌） ----------
const injectDeflect = `(() => {
  ${findCardSrc}
  const b = window.state.battle;
  const card = findCard("弹反");
  if (!card) return { missing: true };
  // 手动响应模式：弹反需玩家主动选择打出
  window.state.settings = window.state.settings || {};
  window.state.settings.manualResponse = true;
  const e1 = b.enemies[1];
  e1.stats = e1.stats || {};
  e1.stats.attack = 10;
  b.allies.forEach((u, i) => {
    u.hp = 150;
    u.stats = u.stats || {};
    u.stats.handLimit = 99;
    // allies[0] 持弹反；其余给普通牌
    u.hand = i === 0
      ? [Object.assign({}, card, { suit: "♠" })]
      : [{ name: "杀", type: "slash", suit: "♠" }];
  });
  b.enemies[0].hand = [];
  // 敌方用一张普通单体杀打 allies[0]
  window.__slash = { name: "杀（普攻）", type: "slash", suit: "♠" };
  window.__target = b.allies[0];
  window.render();
  return { missing: false, holder: b.allies[0].name,
           deflectInHand: (b.allies[0].hand || []).some(c => c?.deflect) };
})()`;

const fireSlash = `(() => {
  const b = window.state.battle;
  const e1 = b.enemies[1];
  const target = window.__target;
  const card = window.__slash;
  const fn = window.BattleSystem?.useCard;
  if (typeof fn !== "function") return { err: "BattleSystem.useCard 不可用" };
  try {
    fn(window.state, e1, target, card);
    return { fired: true };
  } catch (e) {
    return { err: String(e).slice(0, 200) };
  }
})()`;

const snapshot = `(() => {
  const b = window.state.battle;
  const log = window.state.log || [];
  return {
    log: log.slice(0, 60).map(l => String(l)),
    hp: b.allies.map(u => u.hp),
    // 燃烧：手牌中带 burning 标记的牌
    burning: b.allies.map(u => (u.hand || []).filter(c => c?.burning || c?.burn).length),
    manualWin: !!b?.manualDodge,
  };
})()`;

async function runOffense(browser, cardName) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  const row = { name: cardName };
  try {
    await openGame(page);
    await startRegressionBattle(page);
    const inj = await page.evaluate(injectOffense(cardName));
    if (inj.missing) { row.err = "卡牌缺失"; await page.close(); return row; }
    row.target = inj.target;
    const f = await page.evaluate(fireCard);
    if (f.err) { row.err = "打出失败: " + f.err; await page.close(); return row; }
    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(600);
      const st = await page.evaluate(snapshot);
      row.log = st.log; row.hp = st.hp; row.burning = st.burning;
      if (st.log.some(l => l.includes(cardName))) break;
    }
    row.errors = errors.slice(0, 2);
  } catch (e) {
    row.err = String(e).slice(0, 160);
  }
  await page.close();
  return row;
}

async function runDeflect(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  const row = { name: "弹反" };
  try {
    await openGame(page);
    await startRegressionBattle(page);
    const inj = await page.evaluate(injectDeflect);
    if (inj.missing) { row.err = "卡牌缺失"; await page.close(); return row; }
    row.deflectInHand = inj.deflectInHand;
    const f = await page.evaluate(fireSlash);
    if (f.err) { row.err = "打出失败: " + f.err; await page.close(); return row; }
    // 弹反流程（与闪不同）：手牌面板选中弹反牌 → 出现"选择弹反手势" → 选手势 → 结果确认
    //   选牌按钮 data-manual-dodge-pick
    //   手势按钮 data-deflect-choice
    //   结果确认 data-deflect-result-confirm
    // 注意：选中弹反牌时不会渲染 data-manual-dodge-use（源码 manualDodgeHand 对 deflect 牌不输出该按钮），
    // 所以不能沿用点 use 的老做法，否则选项恒为空。
    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(600);
      const st = await page.evaluate(snapshot);
      row.log = st.log; row.hp = st.hp;
      if (st.manualWin) {
        row.manualWin = true;
        // 1) 列出可选响应牌，找到弹反那张并选中
        const picks = page.locator("[data-manual-dodge-pick]");
        const n = await picks.count();
        row.pickCount = n;
        row.options = (await picks.allTextContents()).map(s => String(s).trim()).slice(0, 6);
        if (n > 0) { await picks.first().click(); row.picked = true; }
        break;
      }
      if (st.log.some(l => l.includes("弹反") || l.includes("猜拳"))) break;
    }
    // 2) 选中弹反后应出现手势窗口
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(500);
      const gestures = page.locator("[data-deflect-choice]");
      if (await gestures.count()) {
        row.gestureCount = await gestures.count();
        row.gestures = (await gestures.allTextContents()).map(s => String(s).trim());
        await gestures.first().click();
        row.gestured = true;
        break;
      }
      const st = await page.evaluate(snapshot);
      row.log = st.log;
      if (st.log.some(l => l.includes("弹反") || l.includes("猜拳"))) break;
    }
    // 3) 猜拳结果确认（平局会要求继续）
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(500);
      const confirm = page.locator("[data-deflect-result-confirm]");
      if (await confirm.count()) { await confirm.first().click(); row.confirmed = true; continue; }
      break;
    }
    await page.waitForTimeout(1200);
    const fin = await page.evaluate(snapshot);
    row.log = fin.log; row.hp = fin.hp;
    row.errors = errors.slice(0, 2);
  } catch (e) {
    row.err = String(e).slice(0, 160);
  }
  await page.close();
  return row;
}

(async () => {
  const browser = await chromium.launch();
  const results = [];
  results.push(await runOffense(browser, "火杀"));
  results.push(await runOffense(browser, "追杀"));
  results.push(await runDeflect(browser));
  await browser.close();

  console.log("\n===== 兽人地下城剩余 3 张卡实战（真实浏览器）=====");
  const checks = [];
  results.forEach(r => {
    console.log(`\n--- ${r.name} ---`);
    if (r.err) {
      console.log(`  ❌ 异常: ${r.err}`);
      checks.push([`${r.name} 无异常`, false]);
      return;
    }
    const logs = (r.log || []).map(l => String(l));
    console.log(`  战报: ${JSON.stringify(logs.slice(0, 6))}`);
    if (r.name === "火杀") {
      const hit = logs.some(l => l.includes("火杀"));
      const fire = logs.some(l => l.includes("火"));
      const burnTotal = (r.burning || []).reduce((a, b) => a + b, 0);
      console.log(`  打出=${hit} 含火属性=${fire} 燃烧牌=${JSON.stringify(r.burning)} 总计=${burnTotal}`);
      checks.push(["火杀 · 打出并记录战报", hit]);
      checks.push(["火杀 · 火属性伤害", fire]);
      checks.push(["火杀 · 目标获得燃烧手牌", burnTotal > 0]);
    } else if (r.name === "追杀") {
      const hit = logs.some(l => l.includes("追杀"));
      const dmg = (r.hp || []).some(hp => hp < 150);
      console.log(`  打出=${hit} 我方HP=${JSON.stringify(r.hp)} (初始150)`);
      checks.push(["追杀 · 打出并记录战报", hit]);
      checks.push(["追杀 · 造成伤害", dmg]);
    } else if (r.name === "弹反") {
      const used = logs.some(l => l.includes("弹反") || l.includes("猜拳"));
      console.log(`  手牌含弹反=${r.deflectInHand} 手动窗=${!!r.manualWin} 选牌=${!!r.picked} 手势=${!!r.gestured} 确认=${!!r.confirmed}`);
      console.log(`  可选响应牌(${r.pickCount || 0}): ${JSON.stringify(r.options || [])}`);
      console.log(`  手势按钮(${r.gestureCount || 0}): ${JSON.stringify(r.gestures || [])}`);
      console.log(`  战报含弹反/猜拳=${used}`);
      checks.push(["弹反 · 手牌可被识别", !!r.deflectInHand]);
      checks.push(["弹反 · 被单体杀指定时响应窗口出现", !!r.manualWin]);
      checks.push(["弹反 · 可选中弹反牌并弹出猜拳手势", !!r.gestured]);
      checks.push(["弹反 · 猜拳后进入结果/战报记录", used || !!r.confirmed]);
    }
    if (r.errors?.length) console.log(`  页面错误: ${JSON.stringify(r.errors)}`);
    checks.push([`${r.name} 页面无JS错误`, (r.errors || []).length === 0]);
  });

  console.log("\n===== 汇总 =====");
  let pass = 0, fail = 0;
  checks.forEach(([n, ok]) => {
    console.log(`  ${ok ? "✅" : "❌"} ${n}`);
    ok ? pass++ : fail++;
  });
  console.log(`\n汇总：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})();
