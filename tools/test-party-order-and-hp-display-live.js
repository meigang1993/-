// 真实浏览器实战，覆盖用户报的两个现象：
//
// A) 战斗出战顺序必须跟随玩家编队（state.party），不能是角色表的固定定义顺序。
//    旧实现 `state.chars.filter(c => party.includes(c.id))` 按 chars 定义顺序过滤，
//    玩家怎么调队伍，进战斗永远是 罗卡尔/贝丝妲魔偶/洛基/卡洛斯 那一套。
//    本测试把所有角色按 4 人一组全部走一遍，确保没有哪个角色被硬编码顺序。
//
// B) 受伤后血数字显示异常（实际血量正常）。
//    根因：recover() 里 clearVisuals 清掉了动画期临时字段 visualHp，但没有重绘，
//    DOM 停在最后一次渲染时的旧值。只有动画被打断（cancel / restart）时才暴露，
//    所以表现为"有概率"。正常播完的路径末尾有 renderStep，不会出问题。
require("./repository-toolchain");
const path = require("path");
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const { chromium } = require("playwright");
const {
  openGame, startFreshGame, openTestBattle, dismissOpeningStory,
} = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return !!cond;
};

async function settle(page, ms = 30000) {
  try {
    await page.waitForFunction(() =>
      !window.BattleEffects?.animating && !window.BattleEffects?.draining
      && !window.state?.battle?.animQueue?.length, null, { timeout: ms });
  } catch (err) { /* 交给后续断言判定 */ }
}

const READ_UNITS = `(() => {
  const b = window.state.battle;
  return b.allies.concat(b.enemies).map(u => {
    const el = document.querySelector('.unit[data-target="' + u.uid + '"] .combat-bar b');
    return { u: u.uid, hp: u.hp, max: u.maxHp,
      vis: u.visualHp === undefined ? null : u.visualHp,
      dom: el ? el.textContent : "NOEL" };
  });
})()`;

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e.message || e)));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  try {
    await openGame(page);
    await startFreshGame(page);
    await dismissOpeningStory(page);

    // ---------- A) 队伍顺序：所有角色 ----------
    const allIds = await page.evaluate(() => {
      (window.state.chars || []).forEach(c => {
        delete c.locked;
        c.hp = c.stats?.maxHp || c.hp || 1;
      });
      window.render();
      return (window.state.chars || []).map(c => c.id);
    });
    T("已解锁全部角色用于编队", allIds.length > 0, { count: allIds.length });
    console.log(`   角色总数：${allIds.length}`);

    const GROUP = 4;
    const groups = [];
    for (let i = 0; i < allIds.length; i += GROUP) groups.push(allIds.slice(i, i + GROUP));
    let covered = 0;
    for (const [gi, group] of groups.entries()) {
      // 每组都用"倒序"当编队：与角色表定义顺序相反，若实现按 chars 过滤必然不符。
      const order = [...group].reverse();
      await page.evaluate(o => {
        window.state.party = o.slice(0, 4);
        window.state.testAllies = o.slice(0, 4);
        window.state.battle = null;
        window.state.view = "hall";
        window.render();
      }, order);
      await openTestBattle(page);
      await page.evaluate(() => {
        window.state.testEnemies = [0, 1];
        window.GameAssets.preloadBattle = async () => {};
        window.state.settings.battleSpeed = 2;
        window.BattleFX.playBattleStart = cb => cb?.();
        window.BattleLines.intro = () => 0;
        window.render();
      });
      await page.locator("[data-start-test-battle]").click();
      await page.locator(".battle-screen").waitFor({ state: "visible", timeout: 60000 });
      await page.waitForTimeout(700);
      const got = await page.evaluate(() => {
        const b = window.state.battle;
        return {
          party: [...(window.state.party || [])],
          allies: b.allies.map(a => a.ref || a.id),
          dom: Array.from(document.querySelectorAll(".unit.ally-unit"))
            .map(el => el.getAttribute("data-target")),
        };
      });
      const okOrder = JSON.stringify(got.allies) === JSON.stringify(got.party);
      const okDom = JSON.stringify(got.dom)
        === JSON.stringify(got.party.map((_, i) => `a${i}`));
      T(`第${gi + 1}组 出战顺序跟随编队 ${JSON.stringify(got.party)}`,
        okOrder && okDom, got);
      if (okOrder) covered += got.party.length;
      await page.evaluate(() => {
        window.state.battle = null;
        window.state.view = "hall";
        window.render();
      });
      await page.waitForTimeout(200);
    }
    T(`全部 ${allIds.length} 个角色均已验证入队顺序`, covered === allIds.length,
      { covered, total: allIds.length });

    // ---------- B) 受伤后血数字 ----------
    await page.evaluate(() => {
      window.state.party = [window.state.chars[0].id, window.state.chars[1].id];
      window.state.testAllies = [...window.state.party];
      window.state.battle = null;
      window.state.view = "hall";
      window.render();
    });
    await openTestBattle(page);
    await page.evaluate(() => {
      window.state.testEnemies = [0, 1];
      window.GameAssets.preloadBattle = async () => {};
      window.state.settings.battleSpeed = 1;
      window.BattleFX.playBattleStart = cb => cb?.();
      window.BattleLines.intro = () => 0;
      window.render();
    });
    await page.locator("[data-start-test-battle]").click();
    await page.locator(".battle-screen").waitFor({ state: "visible", timeout: 60000 });
    await settle(page);

    const reset = () => page.evaluate(() => {
      const b = window.state.battle;
      b.animQueue = []; b.locked = false; b.phase = 4;
      b.allies.forEach(a => { a.hp = 100; a.maxHp = 100; a.hand = []; });
      b.enemies.forEach(e => { e.hp = 300; e.maxHp = 300; e.hand = []; e.noResponse = true; });
      b.allies[0].stats = { ...(b.allies[0].stats || {}), attack: 7, magic: 0, speed: 0, handLimit: 99 };
      window.BattleEffects.recover(window.state);
      window.render();
    });
    const hit = () => page.evaluate(() => {
      const b = window.state.battle;
      const a = b.allies[0], foe = b.enemies[0];
      b.activeUid = a.uid; b.phase = 4; b.locked = false;
      a.hand = [{ name: "杀", type: "slash", suit: "", power: 0, scale: "attack" }];
      window.BattleSystem.useCard(window.state, a, foe, a.hand[0]);
    });
    await reset(); await settle(page);

    const cases = [
      ["对照：动画正常播完", async () => { await settle(page); }],
      ["打断：cancel（清空动画队列）", async () => {
        await page.waitForTimeout(150);
        await page.evaluate(() => window.BattleEffects.cancel(window.state));
      }],
      ["打断：restart（重启动画）", async () => {
        await page.waitForTimeout(150);
        await page.evaluate(() => window.BattleEffects.restart(window.state));
      }],
    ];
    const rowsByCase = [];
    for (const [name, act] of cases) {
      await reset(); await settle(page);
      await hit();
      await act();
      await page.waitForTimeout(1500);
      const rows = await page.evaluate(READ_UNITS);
      rowsByCase.push({ name, rows });
      const foe = rows.find(r => r.u === "e0");
      T(`${name} → 血数字与实际血量一致`,
        !!foe && foe.dom === String(foe.hp), foe);
      T(`${name} → 血数字是有效数字（非 NaN/undefined）`,
        !!foe && /^\d+$/.test(String(foe.dom)), foe);
    }
    console.log("   明细:", JSON.stringify(rowsByCase.map(c =>
      `${c.name}: ${c.rows.map(r => `${r.u}=${r.dom}/hp${r.hp}`).join(" ")}`)));

    T("全程无页面错误", errors.length === 0, errors.slice(0, 3));
  } catch (err) {
    T(`执行异常：${err.message}`, false, { stack: String(err.stack || "").slice(0, 300) });
  } finally {
    await browser.close();
    console.log(`\n${pass}/${total} 通过`);
    process.exit(pass === total ? 0 : 1);
  }
})();
