// 安倍卡露娜登场台词「真实开局」确认。
//
// 背景：此前该台词只在数据层验证（BattleLineData.allyIntroLines 能取到），
// 实机始终 speech 为空。原因是 preview-game.js 的 enterRegressionBattle 里有
//   window.BattleLines.intro = () => 0;
// ——测试脚手架为跳过开场干扰把登场台词入口整体置空了，与产品无关。
// 因此本用例**不走 enterRegressionBattle**，而是真实点击「开始游戏」进大厅、
// 真实点击「开始测试战斗」，让 BattleLineIntro 自己跑，再抓界面上的文本。
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const {
  openGame, collectErrors, relevantErrors, dismissOpeningStory,
} = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
};

const LINE = "能帮助我追逐梦想吗？魅魔小弟弟";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = collectErrors(page);
  try {
    await openGame(page);

    // ① 真实点击「开始游戏」→ 确认覆盖框 → 大厅可见
    await page.locator("[data-start-game]").click();
    const okBtn = page.locator("[data-confirm-overlay] [data-confirm-ok]");
    await okBtn.waitFor({ state: "visible", timeout: 3000 }).catch(() => {});
    if (await okBtn.count()) await okBtn.first().evaluate(el => el.click()).catch(() => {});
    await page.locator(".villa-hall").waitFor({ state: "visible", timeout: 15000 });
    T("真实点击后进入别墅大厅", true);

    // ② 关掉开场剧情（凯瑟琳 × 罗卡尔），否则会盖住后续战斗台词。
    // 用 helper 而非手写循环：此前手写版把战斗台词也当成残留剧情，断言恒红。
    await dismissOpeningStory(page);
    const rest = await page.evaluate(() => window.state?.hallModal || null);
    T("开场剧情已收尾（大厅弹窗非剧情态）", !rest || !/intro|story|dialogue|unlock/i.test(rest), { rest });

    // ③ 数据层仅做「解锁角色 + 选入测试队伍」，战斗仍由游戏自己创建
    const pre = await page.evaluate(() => {
      const st = window.state;
      const list = Array.isArray(st.chars) ? st.chars : (st.core?.chars || []);
      const hit = list.find(c => c.id === "abe_karuna");
      if (hit) hit.locked = false;
      st.testAllies = ["abe_karuna"];
      st.testEnemies = [0];
      st.hallModal = "testBattle";
      st.settings = st.settings || {};
      st.settings.battleSpeed = 2;
      window.render();
      return { found: !!hit, locked: hit ? hit.locked : null, allies: st.testAllies };
    });
    T("卡露娜已解锁并选入测试队伍", pre.found && pre.locked === false, pre);

    // ④ 真实点击「开始测试战斗」（不置空 BattleLines.intro）
    await page.locator("[data-start-test-battle]").waitFor({ state: "visible" });
    T("开场台词入口未被脚手架置空", await page.evaluate(() =>
      !/intro\s*=\s*\(\)\s*=>\s*0/.test(String(window.BattleLines?.intro || ""))));
    await page.locator("[data-start-test-battle]").click();
    await page.locator(".battle-screen").waitFor({ state: "visible", timeout: 30000 });
    T("已真实进入战斗画面", true);

    // ⑤ 登场台词是异步播放的，轮询捕捉（最多 12 秒）
    let seen = null;
    for (let i = 0; i < 48; i++) {
      const shot = await page.evaluate(() => {
        const b = window.state?.battle;
        const nodes = [...document.querySelectorAll(".speech-box, .adv-box, .battle-speech, .unit-speech")]
          .map(n => n.textContent || "");
        return {
          speech: b?.speech ? JSON.stringify(b.speech) : "",
          dom: nodes.join(" | "),
          allies: (b?.allies || []).map(u => u.ref),
        };
      });
      if (shot.speech.includes("魅魔小弟弟") || shot.dom.includes("魅魔小弟弟")) { seen = shot; break; }
      await page.waitForTimeout(250);
    }
    T("界面出现卡露娜登场台词", !!seen, seen ? {} : { hint: "speech 未含台词" });
    if (seen) {
      T("台词文本完整（含「魅魔小弟弟」）", (seen.speech + seen.dom).includes("魅魔小弟弟"), seen);
      T("卡露娜在参战名单中", (seen.allies || []).includes("abe_karuna"), seen.allies);
      await page.screenshot({ path: "/data/workspace/karuna_intro_line.png" });
    }
    T("无相关 JS 错误", relevantErrors(errors).length === 0, relevantErrors(errors).slice(0, 3));
  } catch (e) {
    console.log(`❌ EXCEPTION ${e.message}`);
    total++;
  } finally {
    console.log(`\n${pass}/${total} 通过`);
    await browser.close();
    process.exit(pass === total ? 0 : 1);
  }
})();
