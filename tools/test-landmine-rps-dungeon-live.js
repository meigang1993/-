// 在真实副本战斗（废墟沙城）中复现：地雷牌是灰的 + 猜拳弹窗按钮无反应/关不掉
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass += 1; console.log(`✅ ${name}`); }
  else { fail += 1; console.log(`❌ ${name}${extra ? "  " + JSON.stringify(extra) : ""}`); }
};

const setupTpl = `(() => {
  const st = window.state, b = st.battle;
  if (!b) return { err: 'no battle' };
  const holder = (b.allies||[]).find(u => u.hp > 0);
  const src = (b.enemies||[]).find(u => u.hp > 0);
  if (!holder || !src) return { err: 'no units' };
  src.stats = src.stats || {}; src.stats.attack = 11;
  const mine = { name: "地雷", type: "status", suit: "♠",
    landmine: true, landmineSourceUid: src.uid, landmineAttack: 11 };
  holder.hand = [mine];
  b.activeUid = holder.uid; b.phase = 4; b.locked = false;
  b.landmineRpsPrompt = null;
  if (window.render) window.render();
  return { holder: holder.name, src: src.name, active: String(b.activeUid) };
})()`;

const promptTpl = `(() => {
  const b = window.state.battle;
  const g = [...document.querySelectorAll('[data-landmine-rps-choice]')];
  return { prompt: !!b?.landmineRpsPrompt, locked: !!b?.locked,
    result: b?.landmineRpsPrompt?.result || null,
    gestureCount: g.length, gestureVals: g.map(x => x.dataset.landmineRpsChoice),
    skipBtn: !!document.querySelector('[data-landmine-rps-skip]'),
    confirmBtn: !!document.querySelector('[data-landmine-rps-result-confirm]'),
    boxTitle: document.querySelector('.manual-dodge-box h2')?.textContent || '',
    phase: b?.phase };
})()`;

const cardTpl = `(() => {
  const el = document.querySelector('.active-hand [data-card-index="0"]');
  if (!el) return { found: false };
  const cs = getComputedStyle(el);
  return { found: true, cls: el.className, filter: cs.filter,
    opacity: cs.opacity, pointerEvents: cs.pointerEvents,
    text: (el.textContent||'').slice(0, 16) };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", m => {
    if (m.type() === "error" && !/favicon/.test(m.text())) errors.push(m.text());
  });

  await page.goto("file://" + path.resolve(ROOT, "publish/index.html"));
  await page.locator("#view").waitFor({ state: "visible" });
  await page.waitForTimeout(2500);
  await page.locator("[data-start-game]").click();
  await page.locator(".villa-hall").waitFor({ state: "visible" });
  await page.evaluate(() => Promise.all([
    window.GameBundles.load("battle"), window.GameBundles.load("dungeon")]));
  await page.waitForTimeout(500);

  await page.evaluate(() => {
    const st = window.state;
    st.flags = st.flags || {};
    st.flags.ruinsSandCityUnlocked = true;
    if (!st.unlockedDifficulties?.includes("normal")) {
      st.unlockedDifficulties = ["normal", ...(st.unlockedDifficulties || [])];
    }
    st.party = (st.chars || []).filter(c => !c.locked).slice(0, 4).map(c => c.id);
    st.sortieStarting = false;
    if (window.render) window.render();
  });
  await page.waitForTimeout(400);

  await page.locator("[data-open-modal='team']").first().click();
  await page.locator(".villa-modal").waitFor({ state: "visible" });
  await page.waitForTimeout(300);
  await page.locator('[data-start="ruins_sand_city"][data-difficulty="normal"]').first().click();
  await page.locator(".dungeon-screen").waitFor({ state: "visible" });
  await page.waitForTimeout(800);

  // 找第一个普通战斗节点（副本节点类型：start/normal/elite/boss/rest/chest）
  const clicked = await page.evaluate(() => {
    const run = window.state?.explore;
    const nodes = run?.layers?.flat?.() || [];
    const n = nodes.find(x => x && x.type === "normal") || nodes.find(x => x && x.type === "elite");
    if (!n) return { ok: false, types: [...new Set(nodes.map(x => x?.type))] };
    const el = document.querySelector(`[data-dungeon-node="${n.id}"]`);
    if (el) { el.click(); return { ok: true, via: "click", id: n.id }; }
    if (window.DungeonSystem?.enter) {
      window.DungeonSystem.enter(window.state, n.id);
      return { ok: true, via: "api", id: n.id };
    }
    return { ok: false, id: n.id };
  });
  console.log("进入战斗节点:", JSON.stringify(clicked));
  await page.waitForTimeout(3000);
  await page.evaluate(() => {
    if (window.BattleEffects) window.BattleEffects.animating = false;
  }).catch(() => {});
  await page.waitForTimeout(1500);

  const inBattle = await page.evaluate(() => !!window.state?.battle);
  console.log("已在战斗中:", inBattle);
  check("成功进入副本战斗", inBattle === true, { inBattle });

  const setup = await page.evaluate(setupTpl);
  console.log("准备:", JSON.stringify(setup));
  // 副本战斗开场有动画/发牌，手牌区可能延迟渲染 → 轮询等待
  let handReady = false;
  for (let i = 0; i < 20; i += 1) {
    await page.waitForTimeout(400);
    handReady = await page.evaluate(
      () => !!document.querySelector('.active-hand [data-card-index="0"]'));
    if (handReady) break;
    await page.evaluate(setupTpl).catch(() => {});
  }
  console.log("手牌区就绪:", handReady);

  const card = await page.evaluate(cardTpl);
  console.log("地雷牌:", JSON.stringify(card));
  check("副本中手牌区渲染出地雷牌", card.found === true, card);

  // 点击地雷牌
  await page.click('.active-hand [data-card-index="0"]');
  await page.waitForTimeout(700);
  let r = await page.evaluate(promptTpl);
  console.log("弹窗:", JSON.stringify(r));
  check("副本中点击地雷牌弹出猜拳窗口", r.prompt === true, r);

  // 点手势
  if (r.gestureCount > 0) {
    await page.click('[data-landmine-rps-choice="石头"]');
    await page.waitForTimeout(900);
  }
  r = await page.evaluate(promptTpl);
  console.log("点手势后:", JSON.stringify(r));
  check("副本中点击手势产生 result", r.result !== null, r);

  // 点确认
  if (r.confirmBtn) {
    await page.click('[data-landmine-rps-result-confirm]');
    await page.waitForTimeout(900);
  }
  r = await page.evaluate(promptTpl);
  console.log("确认后:", JSON.stringify(r));
  check("副本中确认后弹窗关闭且解锁", r.prompt === false && r.locked === false, r);

  // skip
  await page.evaluate(setupTpl);
  await page.waitForTimeout(400);
  await page.click('.active-hand [data-card-index="0"]');
  await page.waitForTimeout(700);
  const before = await page.evaluate(promptTpl);
  check("副本中 skip 按钮存在", before.skipBtn === true, before);
  if (before.skipBtn) {
    await page.click('[data-landmine-rps-skip]');
    await page.waitForTimeout(900);
  }
  r = await page.evaluate(promptTpl);
  console.log("skip 后:", JSON.stringify(r));
  check("副本中点「暂不猜拳」能关闭并解锁",
    r.prompt === false && r.locked === false, r);

  console.log("\n页面错误:", JSON.stringify(errors.slice(0, 5)));
  console.log(`\n汇总：${pass} 通过 / ${fail} 失败`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();
