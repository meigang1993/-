// 废墟沙城 10 个饰品此前只定义在 GameDataRuinsContent.relics，从未并入 RelicSystem，
// 后果：图鉴查不到、悬赏讨伐发不出饰品、英雄级「精英与BOSS携带掉落饰品技能」
// 在废墟沙城不生效。本用例在真实页面（真实加载顺序）上验证并入结果。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame } = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const results = [];
const check = (name, cond, info) => {
  results.push({ name, ok: !!cond });
  console.log(`${cond ? "✅" : "❌"} ${name}${info !== undefined ? "  " + JSON.stringify(info) : ""}`);
};
const RUINS = ["mech_ai_dragon", "witherer_1312", "hilde", "attack_helicopter", "armored_carrier"];
const RELICS = ["推进器", "智能大脑", "魅魔钢叉", "粉色魅魔装", "冰心刺", "刺客胶衣", "螺旋桨", "导弹发射器", "物资货物", "武器库"];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await openGame(page);
  await page.evaluate(() => Promise.all([
    window.GameBundles?.load?.("battle"),
    window.GameBundles?.load?.("dungeon"),
  ]));

  const data = await page.evaluate((args) => {
    const R = window.RelicSystem;
    const relics = Object.keys(window.GameDataRuinsContent?.relics || {});
    return {
      total: relics.length,
      visible: relics.filter(n => !!R.data(n)).length,
      byEnemy: Object.fromEntries(args.RUINS.map(id => [id, (R.enemyRelics?.(id) || []).length])),
      hell: Object.fromEntries(args.RUINS.map(id => {
        const g = window.DungeonEnemyGroups?.fromIds?.(
          { missionId: "ruins_sand_city", difficultyId: "hell" },
          id === "mech_ai_dragon" || id === "witherer_1312" ? "boss" : "elite", [id], window.state);
        return [id, ((g || [])[0]?.battleRelics || []).length];
      })),
      orcHell: ((window.DungeonEnemyGroups?.fromIds?.(
        { missionId: "orc_dungeon", difficultyId: "hell" }, "elite", ["guard_kelly"], window.state)
        || [])[0]?.battleRelics || []).length,
      bounty: [1, 2, 3, 4, 5, 6].map(() => R.randomElite?.("hilde", new Set(), window.state))
        .filter(Boolean),
    };
  }, { RUINS });

  check("废墟饰品已定义 10 个", data.total === 10, data.total);
  check("废墟饰品全部对 RelicSystem 可见", data.visible === 10, `${data.visible}/10`);
  RUINS.forEach(id => check(`enemyRelics(${id}) 非空`, data.byEnemy[id] > 0, data.byEnemy[id]));
  RUINS.forEach(id => check(`英雄级 ${id} 携带掉落饰品`, data.hell[id] > 0, data.hell[id]));
  check("对照组：兽人英雄级仍携带饰品（未回归）", data.orcHell > 0, data.orcHell);
  check("悬赏可发出废墟饰品（randomElite）", data.bounty.length > 0, data.bounty.slice(0, 3));
  check("无页面错误", errors.length === 0, errors.slice(0, 2));

  await browser.close();
  const pass = results.filter(r => r.ok).length;
  console.log(`\n通过 ${pass}/${results.length}`);
  process.exit(pass === results.length ? 0 : 1);
})();
