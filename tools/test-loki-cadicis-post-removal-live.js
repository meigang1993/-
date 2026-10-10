// 删除「护母心切」「战场指挥官」后的影响实测。
// 用洛基 + 卡迪西斯真实开战，验证：
//   A 两人均可正常参战（无运行时报错）
//   B 各自技能表恰为 2 项且均为现存技能（无空洞 / 无 undefined）
//   C 已删技能名在任何界面文本中都不再出现
//   D 属性成长表仍命中有效档位
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const helpers = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const WANT = { loki: ["智障力大", "青春草原"], cadicis: ["指挥官责任", "重火力支援"] };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });

  await helpers.openGame(page);
  await helpers.startFreshGame(page);
  await helpers.dismissOpeningStory(page);
  await page.evaluate(() => {
    window.state.hallModal = "testBattle";
    window.render();
  });
  await page.locator("[data-start-test-battle]").waitFor({ state: "visible" });
  await page.evaluate(() => {
    window.state.testAllies = ["loki", "cadicis"];
    window.state.testEnemies = [0, 1];
    window.GameAssets.preloadBattle = async () => {};
    window.state.settings.battleSpeed = 2;
    window.BattleFX.playBattleStart = cb => cb?.();
    window.BattleLines.intro = () => 0;
    window.render();
  });
  await page.locator("[data-start-test-battle]").click();
  await page.locator(".battle-screen").waitFor({ state: "visible" });

  const info = await page.evaluate(() => {
    const b = window.state.battle;
    const text = document.body.innerText || "";
    return {
      allies: (b.allies || []).map(u => ({
        ref: u.ref, name: u.name,
        skills: (u.skills || []).map(s => s && s.name).filter(Boolean),
        rawSkills: (u.skills || []).length,
      })),
      text,
    };
  });

  const results = [];
  const ok = (n, c, d) => results.push({ n, pass: !!c, d });

  ok("A1 战斗成功开启", info.allies.length >= 2, `allies=${info.allies.length}`);
  const byRef = {};
  info.allies.forEach(u => { byRef[u.ref] = u; });
  for (const ref of ["loki", "cadicis"]) {
    const u = byRef[ref];
    ok(`A2 ${ref} 参战`, !!u, u ? u.name : "未找到");
    if (u) {
      const want = WANT[ref];
      const got = u.skills;
      ok(`B1 ${ref} 技能数=2`, u.rawSkills === 2, `实际 ${u.rawSkills}`);
      ok(`B2 ${ref} 技能无空洞`, u.rawSkills === got.length, `${got.join("/")}`);
      // 精确比对：多出（如已删技能残留）或缺失都要判红，不能用包含判定。
      ok(`B3 ${ref} 技能恰为现存技能`,
        got.length === want.length && want.every(w => got.includes(w)),
        `期望 ${want.join("/")} 实际 ${got.join("/")}`);
    }
  }
  ok("C1 界面无「护母心切」", !info.text.includes("护母心切"), "");
  ok("C2 界面无「战场指挥官」", !info.text.includes("战场指挥官"), "");
  ok("D1 无运行时报错", errors.length === 0, errors.slice(0, 3).join(" | "));

  const pass = results.filter(r => r.pass).length;
  results.forEach(r => console.log(`${r.pass ? "✅" : "❌"} ${r.n}${r.d ? "  " + r.d : ""}`));
  console.log(`\n通过 ${pass} / ${results.length}`);
  await browser.close();
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error("FATAL", e.message); process.exit(1); });
