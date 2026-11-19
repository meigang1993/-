// 【角色强化·面板与战斗实效】浏览器实机：真实点击四项强化 → 属性面板数值变化 →
// 正式战斗单位属性 / 出手顺序 / 真实伤害数值是否提升。输出两张截图。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { expect } = require("@playwright/test");
const { openGame, startFreshGame, dismissOpeningStory } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const SHOT_STATS = "/data/workspace/强化面板-属性变化-237.png";
const SHOT_BATTLE = "/data/workspace/强化面板-战斗属性-237.png";
const KEYS = ["maxHp", "attack", "magic", "speed"];
const BONUS = { maxHp: 3, attack: 1, magic: 1, speed: 1 };
let pass = 0, total = 0;
function check(name, cond, extra) {
  total += 1;
  if (cond) { pass += 1; return; }
  console.log(`❌ ${name}`, JSON.stringify(extra || {}));
}
const readStatsDom = page => page.evaluate(() => {
  const rows = [...document.querySelectorAll(".info-overlay .stats .stat")];
  const out = {};
  rows.forEach(r => {
    const name = r.querySelector("span")?.textContent?.trim();
    const b = r.querySelector("b")?.textContent || "";
    out[name] = Number((b.match(/^(\d+(?:\.\d+)?)/) || [])[1] || NaN);
  });
  return out;
});

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  try {
    await openGame(page);
    await startFreshGame(page);
    await dismissOpeningStory(page);

    // ---------- A. 强化前：属性面板基准值 ----------
    await page.evaluate(() => {
      const s = window.state;
      s.view = "hall"; s.hallModal = null;
      s.infoUnit = "lokar"; s.infoTab = "stats";
      window.render();
    });
    await expect(page.locator('.info-overlay [data-info-tab="stats"]')).toBeVisible();
    const before = await readStatsDom(page);
    check("A1 强化前面板能读到生命/攻击/魔力/速度四项",
      ["生命值", "攻击力", "魔力", "速度"].every(k => Number.isFinite(before[k])), before);

    // ---------- B. 真实点击四项强化（每项 5000 莉莉丝元） ----------
    await page.evaluate(() => {
      window.state.resources.gold = 25000;
      window.state.infoTab = "enhance";
      window.render();
    });
    await expect(page.locator('.info-overlay [data-info-tab="enhance"]')).toBeVisible();
    for (const key of KEYS) {
      const lv = await page.evaluate(k => window.CharacterEnhance.levelOf(
        window.state.chars.find(c => c.id === "lokar"), k), key);
      await page.locator(`[data-enhance-stat="${key}"]`).click();
      await page.waitForFunction(([k, prev]) => window.CharacterEnhance.levelOf(
        window.state.chars.find(c => c.id === "lokar"), k) === prev + 1,
      [key, lv], { timeout: 8000 });
    }
    const afterLevels = await page.evaluate(() => window.CharacterEnhance.levelsOf(
      window.state.chars.find(c => c.id === "lokar")));
    const gold = await page.evaluate(() => window.state.resources.gold);
    check("B1 四项各强化 1 次",
      KEYS.every(k => afterLevels[k] === 1), afterLevels);
    check("B2 恰好扣费 20000（余额 5000）", gold === 5000, gold);

    // ---------- C. 强化后面板数值真的变化 ----------
    await page.evaluate(() => { window.state.infoTab = "stats"; window.render(); });
    await expect(page.locator('.info-overlay [data-info-tab="stats"]')).toBeVisible();
    const after = await readStatsDom(page);
    check("C1 生命值面板 +3", after["生命值"] - before["生命值"] === 3, { before: before["生命值"], after: after["生命值"] });
    check("C2 攻击力面板 +1", after["攻击力"] - before["攻击力"] === 1, { before: before["攻击力"], after: after["攻击力"] });
    check("C3 魔力面板 +1", after["魔力"] - before["魔力"] === 1, { before: before["魔力"], after: after["魔力"] });
    check("C4 速度面板 +1", after["速度"] - before["速度"] === 1, { before: before["速度"], after: after["速度"] });
    check("C5 面板数值全部为整数", Object.values(after).every(Number.isInteger), after);
    const popup = page.locator(".info-popup");
    if (await popup.count()) await popup.screenshot({ path: SHOT_STATS });
    else await page.screenshot({ path: SHOT_STATS });

    // ---------- D. 正式战斗组建（非测试战斗，走 c.stats） ----------
    const battleInfo = await page.evaluate(async () => {
      const s = window.state;
      const c = s.chars.find(x => x.id === "lokar");
      const baseSpeed = window.CharacterProgression.statsAt(
        window.GameData.characters.find(x => x.id === "lokar"), c.level).speed;
      // 敌人速度卡在「未强化」与「强化后」之间，用来证明速度提升真的改变先手。
      const foes = [{ id: "enhance_probe", name: "强化探针", type: "grunt", hp: 9999,
        attack: 1, magic: 0, speed: baseSpeed + 1, handLimit: 5, drawPerTurn: 0, initialDraw: 0, bloodlust: 1 }];
      window.GameAssets.preloadBattle = async () => [];
      const r = await window.BattleSetup().create(s, "enhance_probe", null,
        { isCurrent: () => true, enemies: foes });
      return {
        allyStats: { ...r.allies[0].stats }, allyHp: r.allies[0].hp, allyMaxHp: r.allies[0].maxHp,
        panelStats: { ...c.stats }, baseSpeed, test: !!s.battle.test,
        allyUid: r.allies[0].uid, enemyUid: r.enemies[0].uid,
      };
    });
    check("D1 正式战斗（非测试战斗口径）", battleInfo.test === false, battleInfo);
    check("D2 战斗单位四项属性 = 局外面板值（含强化）",
      KEYS.every(k => battleInfo.allyStats[k] === battleInfo.panelStats[k]),
      { ally: battleInfo.allyStats, panel: battleInfo.panelStats });
    check("D3 战斗单位生命上限 = 面板生命值 +3",
      battleInfo.allyMaxHp === before["生命值"] + 3 && battleInfo.allyHp === battleInfo.allyMaxHp,
      { hp: battleInfo.allyHp, maxHp: battleInfo.allyMaxHp, before: before["生命值"] });

    // ---------- E. 战斗中真实生效：出手顺序 / 攻击伤害 / 魔力伤害 ----------
    const effect = await page.evaluate(() => {
      const s = window.state, b = s.battle, ally = b.allies[0], enemy = b.enemies[0];
      const H = window.BattleRuntimeHelpers();
      const order = H.order(b).map(u => u.uid);
      const tempAttack = H.tempAttack(ally);
      const AV = window.BattleCombatAttackValues({
        deps: { tempAttack: H.tempAttack, isKillCard: c => window.CardUtils.isKillCard(c) },
        statOf: (u, k) => (u.stats?.[k] || 0) + (k === "attack" ? (u.tempAttack || 0) : k === "magic" ? (u.tempMagic || 0) : 0),
        damage: () => {}, pushFloat: () => {}, isSingleSlash: () => true,
      });
      const slash = { type: "slash", name: "杀", power: 0 };
      const magicCard = { type: "tactic", name: "魔弹特攻", power: 0, scale: "magic" };
      const enhanced = AV.attackAmount(s, ally, slash, 0, true);
      const magicEnhanced = AV.attackAmount(s, ally, magicCard, 0, true);
      // 对照：把本场战斗单位的攻击/魔力临时回退到未强化值，再走同一真实伤害函数。
      const orig = { attack: ally.stats.attack, magic: ally.stats.magic, speed: ally.stats.speed };
      ally.stats.attack -= 1; ally.stats.magic -= 1;
      const bare = AV.attackAmount(s, ally, slash, 0, true);
      const magicBare = AV.attackAmount(s, ally, magicCard, 0, true);
      ally.stats.speed -= 1;
      const orderBare = H.order(b).map(u => u.uid);
      ally.stats.attack = orig.attack; ally.stats.magic = orig.magic; ally.stats.speed = orig.speed;
      return { order, orderBare, tempAttack, enhanced, bare, magicEnhanced, magicBare,
        allyUid: ally.uid, enemyUid: enemy.uid, enemySpeed: enemy.stats.speed };
    });
    check("E1 真实 tempAttack 取用强化后攻击力", effect.tempAttack === after["攻击力"], effect);
    check("E2 杀牌伤害按强化后攻击力结算且比未强化恰好 +1",
      effect.enhanced === after["攻击力"] && effect.enhanced - effect.bare === 1, effect);
    check("E3 魔法牌伤害按强化后魔力结算且比未强化恰好 +1",
      effect.magicEnhanced === after["魔力"] && effect.magicEnhanced - effect.magicBare === 1, effect);
    check("E4 速度 +1 真实改变出手顺序（强化后我方先手、回退后敌方先手）",
      effect.order[0] === effect.allyUid && effect.orderBare[0] === effect.enemyUid, effect);
    // 切到战斗视图并把详情面板指向战斗单位：截图显示的是 battle.allies[0].stats，
    // 而不是局外角色对象，用来佐证「战斗中属性确实带加成」。
    await page.evaluate(() => {
      const s = window.state;
      s.view = "battle"; s.infoTab = "stats";
      s.infoUnit = s.battle.allies[0].uid;
      window.render();
    });
    await expect(page.locator(".info-overlay .stats .stat").first()).toBeVisible();
    const battleDom = await readStatsDom(page);
    check("E5 战斗视图中角色详情显示强化后属性（与局外面板一致）",
      battleDom["攻击力"] === after["攻击力"] && battleDom["魔力"] === after["魔力"]
      && battleDom["速度"] === after["速度"] && battleDom["生命值"] === after["生命值"],
      { battleDom, after });
    await page.screenshot({ path: SHOT_BATTLE });

    check("Z 页面无 JS 错误", errors.length === 0, errors.slice(0, 3));
    console.log(`强化面板/战斗实效实机：${pass}/${total} 通过`);
    if (pass !== total) process.exitCode = 1;
  } catch (e) {
    console.error(e);
    console.log(`强化面板/战斗实效实机：${pass}/${total} 通过（异常中断）`);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
