// 真实浏览器实战：验证力量爆发的「回合结束清空」走的是真实结束阶段链路，
// 而不是测试里手调 endTurn。重点排查增益是否会外溢到别人的回合：
// 安洁莉卡回合结束后的反击 / 技能等非出牌伤害也挂在统一伤害链上，一旦清空失败就会白吃加成。
require("./repository-toolchain");
const path = require("path");
const fs = require("fs");
const os = require("os");
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const { chromium } = require("playwright");
const { openGame, startFreshGame, openTestBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const VIDEO_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "game2971485-might-clear-"));
let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return !!cond;
};

async function settle(page) {
  await page.waitForFunction(() =>
    !window.BattleEffects?.animating
    && !window.BattleEffects?.draining
    && !window.state?.battle?.animQueue?.length, null, { timeout: 60000 });
}

(async () => {
  fs.rmSync(VIDEO_DIR, { recursive: true, force: true });
  fs.mkdirSync(VIDEO_DIR, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e.message || e)));
  try {
    await openGame(page);
    await startFreshGame(page);
    await openTestBattle(page);
    await page.evaluate(() => {
      window.state.testEnemies = [0];
      window.GameAssets.preloadBattle = async () => {};
      window.state.settings.battleSpeed = 2;
      window.BattleFX.playBattleStart = callback => callback?.();
      window.BattleLines.intro = () => 0;
      window.render();
    });
    await page.locator("[data-start-test-battle]").click();
    await page.locator(".battle-screen").waitFor({ state: "visible", timeout: 60000 });
    await settle(page);

    // 场景：allies[0] 为安洁莉卡，攻击力固定 10，敌人无响应牌。
    // allies[1] 保留为另一个角色，用于验证增益不会外溢到别人的回合。
    const setup = await page.evaluate(() => {
      const b = window.state.battle;
      const angel = b.allies[0];
      const foe = b.enemies[0];
      b.animQueue = [];
      b.locked = false;
      b.phase = 4;
      b.activeUid = angel.uid;
      b.turn = 1;
      angel.ref = "angelica";
      angel.name = "安洁莉卡";
      // 手牌上限放宽，避免结束出牌后卡在弃牌阶段（弃牌阶段不会触发结束阶段钩子）。
      angel.stats = { ...(angel.stats || {}), attack: 10, magic: 0, speed: 0, handLimit: 99 };
      angel.angelicaSlashCount = 0;
      angel.angelicaMightBonus = 0;
      angel.angelicaMightTurn = null;
      angel.hp = 999; angel.maxHp = 999;
      foe.hp = 999; foe.maxHp = 999;
      foe.hand = [];
      foe.noResponse = true;
      window.render();
      window.BattleEffects.recover(window.state);
      return {
        attack: angel.stats.attack,
        allies: b.allies.length,
        otherRef: b.allies[1]?.ref || null,
      };
    });
    T("场景已就绪（安洁莉卡出战、攻击力固定 10）", setup.attack === 10, setup);

    // 出 2 张实体杀：伤害应为 10 / 15，结算后 bonus = 1.0（+100%）。
    const rows = [];
    for (let i = 1; i <= 2; i += 1) {
      const row = await page.evaluate(() => {
        const b = window.state.battle;
        const angel = b.allies[0];
        const foe = b.enemies[0];
        const before = foe.hp;
        b.activeUid = angel.uid;
        b.phase = 4;
        b.locked = false;
        window.BattleSystem.useCard(window.state, angel, foe,
          { name: "杀", type: "slash", suit: "", power: 0, scale: "attack" });
        return {
          dealt: before - foe.hp,
          count: angel.angelicaSlashCount,
          bonus: angel.angelicaMightBonus || 0,
        };
      });
      await settle(page);
      rows.push(row);
    }
    console.log("   出牌序列:", JSON.stringify(rows));
    T("两张实体杀伤害为 10 / 15", rows[0].dealt === 10 && rows[1].dealt === 15, rows);
    T("出牌阶段结束时增益为 +100%（count=2, bonus=1）",
      rows[1].count === 2 && rows[1].bonus === 1, rows[1]);

    // 关键：走真实的「结束出牌」按钮，而不是手调 endTurn。
    // 它会依次跑 BattleSystem.endPlay → 结束阶段各钩子 → BattleTurnState.cleanupTurn。
    const endBtn = page.locator("[data-end-play]");
    await endBtn.waitFor({ state: "visible", timeout: 30000 });
    await endBtn.click();
    await settle(page);
    await page.waitForTimeout(500);

    const afterEnd = await page.evaluate(() => {
      const b = window.state.battle;
      const angel = b.allies[0];
      return {
        bonus: angel.angelicaMightBonus || 0,
        count: angel.angelicaSlashCount || 0,
        turnFlag: angel.angelicaMightTurn ?? null,
        activeUid: b.activeUid,
        angelUid: angel.uid,
      };
    });
    console.log("   结束出牌后:", JSON.stringify(afterEnd));
    T("真实结束阶段清空增益（bonus=0）", afterEnd.bonus === 0, afterEnd);
    T("真实结束阶段清空计数（count=0）", afterEnd.count === 0, afterEnd);

    // 外溢验证：换到别的角色行动时，安洁莉卡的非出牌伤害不得再吃加成。
    const spill = await page.evaluate(() => {
      const b = window.state.battle;
      const angel = b.allies[0];
      const other = b.allies.find(u => u.uid !== angel.uid) || null;
      if (other) {
        b.activeUid = other.uid;
        b.phase = 4;
        b.locked = false;
      }
      const raw = window.AngelicaLukaSkills.modifyOutgoingDamage(window.state, angel, 10, undefined);
      const withCard = window.AngelicaLukaSkills.modifyOutgoingDamage(
        window.state, angel, 10, { name: "火攻", type: "tactic" });
      return { raw, withCard, activeIsOther: !!other && b.activeUid === other.uid };
    });
    console.log("   外溢检查:", JSON.stringify(spill));
    T("别人回合时，安洁莉卡非出牌伤害不吃加成（10）", spill.raw === 10, spill);
    T("别人回合时，安洁莉卡的锦囊伤害也不吃加成（10）", spill.withCard === 10, spill);

    // 回到安洁莉卡的新回合：第 1 张杀必须回到基础伤害，证明增益确实重新开始累积。
    const nextTurn = await page.evaluate(() => {
      const b = window.state.battle;
      const angel = b.allies[0];
      const foe = b.enemies[0];
      b.turn = (b.turn || 1) + 1;
      b.activeUid = angel.uid;
      b.phase = 4;
      b.locked = false;
      window.AngelicaLukaSkills.beginTurn(window.state, angel);
      const before = foe.hp;
      window.BattleSystem.useCard(window.state, angel, foe,
        { name: "杀", type: "slash", suit: "", power: 0, scale: "attack" });
      return {
        dealt: before - foe.hp,
        bonus: angel.angelicaMightBonus || 0,
        count: angel.angelicaSlashCount || 0,
      };
    });
    await settle(page);
    console.log("   新回合首张:", JSON.stringify(nextTurn));
    T("新回合第 1 张杀回到基础伤害 10", nextTurn.dealt === 10, nextTurn);
    T("新回合重新从第 1 层累积（count=1, bonus=0.5）",
      nextTurn.count === 1 && nextTurn.bonus === 0.5, nextTurn);

    T("页面无 JS 错误", errors.length === 0, errors.slice(0, 3));
  } catch (err) {
    console.error("运行异常:", err.message);
    total++;
  } finally {
    await context?.close();
    await browser?.close();
  }
  console.log(`\n力量爆发回合结束清空实战：${pass}/${total} 通过`);
  process.exit(pass === total ? 0 : 1);
})();
