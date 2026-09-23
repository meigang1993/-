// 专项实战：废墟沙城 难度属性倍率 与 金币（莉莉丝元）倍率 在真实环境下是否生效
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

function check(name, cond, extra) {
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
}

// 用真实副本入口生成敌人：走 DungeonEnemies.enemiesFor(run, type)
const spawnTpl = (missionId, difficultyId, type) => `(() => {
  const run = { missionId: ${JSON.stringify(missionId)}, difficultyId: ${JSON.stringify(difficultyId)} };
  const list = window.DungeonEnemyGroups.enemiesFor(run, ${JSON.stringify(type)}, window.state);
  return (list || []).map(e => ({
    id: e.id, name: e.name, type: e.type,
    hp: e.hp, attack: e.attack, magic: e.magic, speed: e.speed,
  }));
})()`;

// 直接用结算公式算金币（与 DungeonRewardCore.rollGold 同一路径）
const goldTpl = (missionId, difficultyId, type, n) => `(() => {
  const run = { missionId: ${JSON.stringify(missionId)}, difficultyId: ${JSON.stringify(difficultyId)} };
  const out = [];
  for (let i = 0; i < ${n}; i++) out.push(window.DungeonRewardCore.rollGold(run, ${JSON.stringify(type)}, window.state));
  return out;
})()`;

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", e => errors.push(String(e)));
  await openGame(page);

  let pass = 0, total = 0;
  const T = (n, c, x) => { total++; pass += check(n, c, x); };

  console.log("=== 废墟沙城 BOSS 在各难度下的实战属性 ===");
  const byDiff = {};
  for (const d of ["normal", "adventure", "warrior", "king", "hell"]) {
    const list = await page.evaluate(spawnTpl("ruins_sand_city", d, "boss"));
    const dragon = list.find(e => e.id === "mech_ai_dragon") || list[0];
    byDiff[d] = dragon;
    console.log(`  ${d.padEnd(10)} ${dragon ? `${dragon.name} hp=${dragon.hp} atk=${dragon.attack} mag=${dragon.magic} spd=${dragon.speed}` : "（本次抽到另一组 BOSS）"}`);
  }

  console.log("\n=== 断言：难度属性倍率生效 ===");
  // BOSS 组是随机二选一，逐难度重抽直到抽到机械AI龙
  const dragonStats = {};
  for (const d of ["normal", "warrior", "hell"]) {
    let found = null;
    for (let i = 0; i < 12 && !found; i++) {
      const list = await page.evaluate(spawnTpl("ruins_sand_city", d, "boss"));
      found = list.find(e => e.id === "mech_ai_dragon");
    }
    if (found) dragonStats[d] = found;
  }
  if (dragonStats.normal && dragonStats.warrior && dragonStats.hell) {
    console.log(`  机械AI龙 普通 hp=${dragonStats.normal.hp} atk=${dragonStats.normal.attack}`);
    console.log(`  机械AI龙 勇士 hp=${dragonStats.warrior.hp} atk=${dragonStats.warrior.attack}`);
    console.log(`  机械AI龙 英雄 hp=${dragonStats.hell.hp} atk=${dragonStats.hell.attack}`);
    T("难度倍率生效：勇士级 HP = ceil(342×1.75) = 599",
      dragonStats.warrior.hp === 599, { hp: dragonStats.warrior.hp });
    T("难度倍率生效：英雄级 HP = ceil(342×3.2) = 1095",
      dragonStats.hell.hp === 1095, { hp: dragonStats.hell.hp });
    T("难度倍率生效：英雄级 攻击 = round(13×1.52) = 20",
      dragonStats.hell.attack === 20, { atk: dragonStats.hell.attack });
    T("普通级为基值 342", dragonStats.normal.hp === 342, { hp: dragonStats.normal.hp });
  } else {
    T("抽到机械AI龙用于难度对比", false, { got: Object.keys(dragonStats) });
  }

  console.log("\n=== 金币（莉莉丝元）倍率：废墟沙城 vs 兽人 ===");
  const sample = async (mission, diff, type) => {
    const arr = await page.evaluate(goldTpl(mission, diff, type, 40));
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  };
  const rows = [];
  for (const m of ["machine_factory", "underwater_train", "orc_dungeon", "ruins_sand_city"]) {
    const boss = await sample(m, "normal", "boss");
    const elite = await sample(m, "normal", "elite");
    rows.push({ m, boss, elite });
    console.log(`  ${m.padEnd(18)} boss均值=${boss.toFixed(1)}  elite均值=${elite.toFixed(1)}`);
  }
  const mf = rows.find(r => r.m === "machine_factory").boss;
  const ut = rows.find(r => r.m === "underwater_train").boss;
  const orc = rows.find(r => r.m === "orc_dungeon").boss;
  const ruins = rows.find(r => r.m === "ruins_sand_city").boss;

  T("金币倍率生效：水下列车 > 机械工厂", ut > mf, { mf, ut });
  T("金币倍率生效：兽人 > 水下列车", orc > ut, { ut, orc });
  T("金币倍率生效：废墟沙城 > 机械工厂（非 fallback 1）", ruins > mf * 1.2, { mf, ruins });
  T("金币倍率递增：机械工厂 < 水下列车 < 兽人", mf < ut && ut < orc, { mf, ut, orc });

  const same = Math.abs(ruins - orc) < 1;
  console.log(`\n⚠️  废墟沙城 boss 均值 ${ruins.toFixed(1)} vs 兽人 ${orc.toFixed(1)}`
    + ` → ${same ? "完全相同（复制兽人配置）" : "不同"}`);
  // 待定项：废墟沙城作为更后期副本，金币是否应高于兽人。当前与兽人相同（复制遗留），
  // 等待确认后再改成硬断言；此处仅提示，不判失败。
  if (ruins > orc * 1.05) console.log("ℹ️  废墟沙城金币已高于兽人");
  else console.log("ℹ️  待定：废墟沙城金币与兽人相同（复制遗留），等待确认后调整");

  console.log(`\n页面错误: ${errors.length}`);
  if (errors.length) errors.slice(0, 5).forEach(e => console.log("  " + e));
  await browser.close();
  console.log(`\n=== ${pass}/${total} 通过 ===`);
  process.exit(pass === total ? 0 : 1);
})();
