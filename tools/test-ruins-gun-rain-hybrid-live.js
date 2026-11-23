// 257→258 版：【枪林弹雨】复合伤害修复 + 废墟扫场牌 浏览器实机验证。
// 每个场景独立开 page + 重进测试战斗，避免上一张牌的回合状态污染淫气判定。
// 真实点击手牌、（必要时）目标单位与「使用」按钮，读取敌方掉血、战报、淫气与页面错误，并出截图。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || "/data/workspace/.pw-browsers";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { startRegressionBattle } = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const ROOT = path.resolve(__dirname, "..");
const results = [];
const errors = [];
const T = (name, ok, detail = "") => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? " · " + detail : ""}`);
};

async function playOne(browser, { name, attack, magic, hp, shot }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", e => errors.push(`${name}/pageerror: ` + String(e)));
  page.on("console", m => {
    if (m.type() === "error" && !/favicon/.test(m.text())) errors.push(`${name}/console: ` + m.text());
  });
  await startRegressionBattle(page);
  const setup = await page.evaluate(({ name, attack, magic, hp }) => {
    const b = window.state.battle;
    const a = b.allies[0];
    a.stats = { ...(a.stats || {}), attack, magic, speed: 10 };
    a.intent = 5; a.intentMax = 5; a.charge = 0; a.tempAttack = 0; a.tempMagic = 0;
    const real = (window.GameDataCards.eliteCards || []).find(c => c.name === name);
    if (!real) return { missing: true };
    a.hand = [JSON.parse(JSON.stringify(real))];
    b.enemies.forEach(e => { e.hp = hp; e.maxHp = hp; e.hand = []; e.block = 0; delete e.vulnerable; });
    b.locked = false; b.phase = 4; b.activeUid = a.uid; b.animQueue = []; b.selectedCardIndex = null;
    delete b.pendingTargetUid; delete b.manualDodge; delete b.manualCounter;
    window.state.log = [];
    window.render();
    return { missing: false, card: { name, power: real.power, hybridAttack: real.hybridAttack, type: real.type },
      enemyHp: b.enemies.map(e => e.hp), intent: a.intent, enemyUid: b.enemies[0].uid };
  }, { name, attack, magic, hp });
  if (setup.missing) { await page.close(); throw new Error(`找不到实体牌 ${name}`); }
  await page.locator('[data-card-index="0"]').first().click();
  await page.waitForTimeout(180);
  const useBtn = page.locator("[data-confirm-target]");
  if (await useBtn.count() && !(await useBtn.first().isEnabled())) {
    const targetEl = page.locator(`[data-target="${setup.enemyUid}"]`).first();
    if (await targetEl.count()) await targetEl.click();
  }
  if (await useBtn.count() && await useBtn.first().isEnabled()) await useBtn.first().click();
  await page.waitForTimeout(1200);
  const fin = await page.evaluate(() => {
    const b = window.state.battle;
    return {
      enemyHp: b.enemies.map(e => e.hp),
      intent: b.allies[0].intent,
      hand: b.allies[0].hand.map(c => c.name),
      log: (window.state.log || []).slice(0, 10),
      vulnerable: !!b.enemies[0]?.vulnerable,
    };
  });
  await page.screenshot({ path: shot });
  await page.close();
  return { setup, fin };
}

(async () => {
  const browser = await chromium.launch();
  const common = { attack: 3, magic: 4, hp: 100 };

  // 场景 1：枪林弹雨（删除基础1点）—— 攻3 + 魔4 = 7，两个目标各掉 7
  const rain = await playOne(browser, { ...common, name: "枪林弹雨",
    shot: "/data/workspace/废墟卡牌-枪林弹雨复合伤害-260.png" });
  const rainLoss = rain.setup.enemyHp.map((h, i) => h - rain.fin.enemyHp[i]);
  T("枪林弹雨：两目标各受 7 点（3+4，无基础值）", rainLoss.length === 2 && rainLoss.every(v => v === 7), JSON.stringify(rainLoss));
  T("枪林弹雨：战报写明 7 伤害", rain.fin.log.filter(l => /造成7伤害/.test(l)).length === 2, JSON.stringify(rain.fin.log));
  T("枪林弹雨：战术牌不消耗淫气", rain.fin.intent === 5, `intent=${rain.fin.intent}`);
  T("枪林弹雨：牌已离开手牌", rain.fin.hand.length === 0, JSON.stringify(rain.fin.hand));

  // 场景 2：流星杀 —— 全体魔力魔法伤害 4，杀牌消耗 1 淫气
  const meteor = await playOne(browser, { ...common, name: "流星杀",
    shot: "/data/workspace/废墟卡牌-流星杀全体魔法伤害-260.png" });
  const meteorLoss = meteor.setup.enemyHp.map((h, i) => h - meteor.fin.enemyHp[i]);
  T("流星杀：两目标各受魔力 4 点", meteorLoss.length === 2 && meteorLoss.every(v => v === 4), JSON.stringify(meteorLoss));
  T("流星杀：战报写明消耗 1 点淫气",
    meteor.fin.log.some(l => /淫气消耗1点，剩余/.test(l)),
    `intent ${meteor.setup.intent}→${meteor.fin.intent} | ${JSON.stringify(meteor.fin.log)}`);

  // 场景 3：魅杀 —— 单体魔法伤害 4 且未被复合改动误伤
  const charm = await playOne(browser, { ...common, name: "魅杀",
    shot: "/data/workspace/废墟卡牌-魅杀脆弱标记-260.png" });
  const charmLoss = charm.setup.enemyHp.map((h, i) => h - charm.fin.enemyHp[i]);
  T("魅杀：单体魔法伤害 4，其它目标不受伤", charmLoss[0] === 4 && charmLoss.slice(1).every(v => v === 0), JSON.stringify(charmLoss));
  T("魅杀：命中目标获得脆弱标记", charm.fin.vulnerable === true);

  // 版本戳：文件级核对（战斗页没有大厅徽章，不拿 DOM 文本硬断言）
  const idx = fs.readFileSync(path.join(ROOT, "publish", "index.html"), "utf8");
  const ver = (idx.match(/20260915-(\d+)/) || [])[1] || "";
  const css = fs.readFileSync(path.join(ROOT, "publish", "villa.css"), "utf8");
  const entry = fs.readFileSync(path.join(ROOT, "electron-entry", "package.json"), "utf8");
  T(`版本戳三处一致（${ver}）`, !!ver && css.includes(`20260915-${ver}`) && entry.includes(`26.0915.${ver}`), ver);
  T("全程无 JS 错误", errors.length === 0, errors.slice(0, 3).join(" | ") || "无");

  await browser.close();
  const bad = results.filter(r => !r.ok);
  console.log(`\nTOTAL ${results.length - bad.length}/${results.length}`);
  bad.forEach(r => console.log(`  ❌ ${r.name} ${r.detail}`));
  process.exit(bad.length || errors.length ? 1 : 0);
})().catch(e => { console.error("LIVE_THREW", e && e.stack ? e.stack : e); process.exit(2); });
