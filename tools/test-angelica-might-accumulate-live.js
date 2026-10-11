// 真实浏览器实战：验证力量爆发改版后的机制——
//   实体【杀】「结算完成后」才累积 +50% 伤害增益，作用于后续所有伤害，回合结束清空。
// 预期序列（基础伤害固定为 10）：第1张 10 → 第2张 15 → 第3张 20。
// 这与旧实现（第1张×0.5、第2张×1.0、第3张×1.5）完全不同，可明确区分。
require("./repository-toolchain");
const path = require("path");
const fs = require("fs");
const os = require("os");
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const { chromium } = require("playwright");
const { openGame, startFreshGame, openTestBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const VIDEO_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "game2971485-might-accum-"));
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
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e.message || e)));
  try {
    await openGame(page);
    await startFreshGame(page);
    await openTestBattle(page);
    await page.evaluate(() => {
      const list = window.GameData?.testEnemies || [];
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
    await page.evaluate(() => {
      const battle = window.state.battle;
      window.state.settings.battleSpeed = 1;
      battle.animQueue = [];
      battle.locked = false;
      battle.phase = 4;
      battle.activeUid = battle.allies[0].uid;
      battle.allies.concat(battle.enemies)
        .forEach(u => u.hand.forEach(c => { delete c._pendingDraw; }));
      window.render();
      window.BattleEffects.recover(window.state);
    });

    // 场景准备：allies[0] 强制为安洁莉卡，攻防固定，敌人无响应牌
    const setup = await page.evaluate(() => {
      const b = window.state.battle;
      const angel = b.allies[0];
      const foe = b.enemies[0];
      angel.ref = "angelica";
      angel.name = "安洁莉卡";
      angel.stats = { ...(angel.stats || {}), attack: 10, magic: 0, speed: 0 };
      angel.angelicaSlashCount = 0;
      angel.angelicaMightBonus = 0;
      angel.angelicaMightTurn = null;
      angel.hp = 999; angel.maxHp = 999;
      foe.hp = 999; foe.maxHp = 999;
      foe.hand = [];      // 无【闪】，保证伤害稳定
      foe.noResponse = true;
      b.turn = 1;
      window.render();
      return { attack: angel.stats.attack, foeHp: foe.hp };
    });
    T("场景已就绪（安洁莉卡出战、攻击力固定）", setup.attack === 10, setup);

    // 连续出 3 张实体杀，逐次记录敌人掉血
    const rows = [];
    for (let i = 1; i <= 3; i += 1) {
      const row = await page.evaluate(() => {
        const b = window.state.battle;
        const angel = b.allies[0];
        const foe = b.enemies[0];
        const before = foe.hp;
        const bonusBefore = angel.angelicaMightBonus || 0;
        const card = { name: "杀", type: "slash", suit: "", power: 0, scale: "attack" };
        b.activeUid = angel.uid;
        b.phase = 4;
        b.locked = false;
        window.BattleSystem.useCard(window.state, angel, foe, card);
        const dealt = before - foe.hp;
        return {
          bonusBefore,
          dealt,
          count: angel.angelicaSlashCount,
          bonusAfter: angel.angelicaMightBonus || 0,
        };
      });
      await settle(page);
      rows.push(row);
    }
    console.log("   实测序列:", JSON.stringify(rows));

    T("第1张【杀】按基础伤害结算（结算前无增益）",
      rows[0].bonusBefore === 0 && rows[0].dealt === 10, rows[0]);
    T("第1张结算完成后累积 +50%", rows[0].bonusAfter === 0.5, rows[0]);
    T("第2张【杀】享受 +50%（10 → 15）",
      rows[1].bonusBefore === 0.5 && rows[1].dealt === 15, rows[1]);
    T("第2张结算完成后累积 +100%", rows[1].bonusAfter === 1, rows[1]);
    T("第3张【杀】享受 +100%（10 → 20）",
      rows[2].bonusBefore === 1 && rows[2].dealt === 20, rows[2]);
    T("三张杀计数为 1/2/3",
      rows[0].count === 1 && rows[1].count === 2 && rows[2].count === 3, rows);

    // 增益作用于后续的所有伤害：虚拟杀不累积增益（非实体杀），但享受已累积的增益。
    // 第3张杀后 bonus = 1.5，故虚拟杀伤害应为 10 × 2.5 = 25。
    const virt = await page.evaluate(() => {
      const b = window.state.battle;
      const angel = b.allies[0];
      const foe = b.enemies[0];
      const before = foe.hp;
      const bonusBefore = angel.angelicaMightBonus || 0;
      const card = { name: "杀（普攻）", type: "slash", suit: "", power: 0, scale: "attack", virtual: true };
      b.activeUid = angel.uid;
      b.phase = 4;
      b.locked = false;
      window.BattleSystem.useCard(window.state, angel, foe, card);
      return {
        bonusBefore,
        dealt: before - foe.hp,
        bonusAfter: angel.angelicaMightBonus || 0,
      };
    });
    T("增益作用于后续伤害：虚拟杀享受 +150%（10 → 25）",
      virt.bonusBefore === 1.5 && virt.dealt === 25, virt);
    T("虚拟杀不累积增益（非实体杀不触发力量爆发）",
      virt.bonusAfter === 1.5, virt);

    // 回合结束清空（走真实的结束阶段钩子，而不是只靠下一回合的 beginTurn）
    const afterEndTurn = await page.evaluate(() => {
      const b = window.state.battle;
      const angel = b.allies[0];
      const foe = b.enemies[0];
      window.AngelicaLukaSkills.endTurn(window.state, angel);
      const bonus = angel.angelicaMightBonus || 0;
      const count = angel.angelicaSlashCount || 0;
      const before = foe.hp;
      const card = { name: "杀（普攻）", type: "slash", suit: "", power: 0, scale: "attack", virtual: true };
      b.activeUid = angel.uid;
      b.phase = 4;
      b.locked = false;
      window.BattleSystem.useCard(window.state, angel, foe, card);
      return { bonus, count, dealt: before - foe.hp, bonusAfter: angel.angelicaMightBonus || 0 };
    });
    T("结束阶段钩子清空增益（bonus=0, count=0）",
      afterEndTurn.bonus === 0 && afterEndTurn.count === 0, afterEndTurn);
    T("清空后伤害回到基础值（10），不再外溢到回合外",
      afterEndTurn.dealt === 10, afterEndTurn);

    // 回合结束清空
    const nextTurn = await page.evaluate(() => {
      const b = window.state.battle;
      const angel = b.allies[0];
      const foe = b.enemies[0];
      window.AngelicaLukaSkills.beginTurn(window.state, angel);
      const before = foe.hp;
      const card = { name: "杀", type: "slash", suit: "", power: 0, scale: "attack" };
      b.activeUid = angel.uid;
      b.phase = 4;
      b.locked = false;
      window.BattleSystem.useCard(window.state, angel, foe, card);
      return { dealt: before - foe.hp, bonusAfter: angel.angelicaMightBonus || 0 };
    });
    T("回合结束后增益清空，第1张回到基础伤害",
      nextTurn.dealt === 10 && nextTurn.bonusAfter === 0.5, nextTurn);

    T("页面无 JS 错误", errors.length === 0, errors.slice(0, 3));
  } catch (err) {
    console.error("运行异常:", err.message);
    total++;
  } finally {
    await context?.close();
    await browser?.close();
  }
  console.log(`\n力量爆发累积机制实战：${pass}/${total} 通过`);
  process.exit(pass === total ? 0 : 1);
})();
