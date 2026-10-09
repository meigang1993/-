// 专项：疯狂射击选中时，敌方不应被标成"可选目标"
//
// 疯狂射击（卡洛斯主动技）卡牌带 targetless: true —— 语义上不需要选目标，
// 流程是"先发动技能 → 再挑一张红色手牌转化"，目标由群体攻击自动覆盖全体敌方。
//
// 旧行为：ui-battle-targeting.targetAllowed 完全没有处理 targetless，
//   于是疯狂射击卡牌落到最后的兜底分支 `unitData.side === "enemy"`，
//   敌方全员被打上 selectable-target。玩家会误以为要手动点敌人。
// 新行为：targetless 卡牌直接短路，不给任何单位加可选标记。
//
// 判据（可证伪）：
//   A 选中疯狂射击 → 敌方 selectable-target 数为 0
//   B 对照组：选中普通【杀】→ 敌方仍被正常高亮（不能误伤）
//   C 目标线：疯狂射击不指向自己头像（与高亮口径统一）
//
// 防假通过：
//   1) 前置断言敌方存活数 ≥ 2，否则"0 个高亮"没有区分度；
//   2) 必须真的触发一次 render()，否则读到的是上一次渲染的残留 DOM。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass += 1; console.log(`✅ ${name}${extra ? " — " + extra : ""}`); }
  else { fail += 1; console.log(`❌ ${name}${extra ? " — " + extra : ""}`); }
}

// 选中指定卡牌后重新渲染，统计敌方单位的高亮情况
async function probe(page, cardExpr) {
  return page.evaluate(`(() => {
    const state = window.state, b = state.battle;
    b.locked = false; b.animQueue = []; b.reactionQueue = [];
    b.pendingTargetUid = null; b.pendingTargetUids = null;
    const actor = window.BattleSystem.active(b) || b.allies[0];
    const card = ${cardExpr};
    b.selectedSkillCard = card;
    b.selectedCardIndex = null;
    window.render();
    const enemies = b.enemies.filter(e => e.hp > 0);
    const lit = enemies.filter(e => {
      const el = document.querySelector(
        '.unit[data-target="' + e.uid + '"]');
      return el && el.className.includes("selectable-target");
    }).map(e => e.uid);
    return {
      aliveEnemies: enemies.length,
      lit: lit,
      lineUid: b.pendingTargetUid || null,
    };
  })()`);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await startRegressionBattle(page);
  await page.waitForTimeout(600);

  // A：疯狂射击（targetless）
  const a = await probe(page,
    `{ name: "疯狂射击", type: "tactic", crazyShooting: true, targetless: true }`);
  console.log("--- A 疯狂射击 ---");
  console.log(`  存活敌方 ${a.aliveEnemies}，被高亮 ${JSON.stringify(a.lit)}`);

  check("A1 区分度前置：存活敌方 ≥ 2", a.aliveEnemies >= 2,
    `${a.aliveEnemies} 人`);
  check("A2 疯狂射击选中时敌方无人被标可选", a.lit.length === 0,
    `高亮=${JSON.stringify(a.lit)}`);

  // B：对照组，普通杀牌仍需高亮敌方
  const bb = await probe(page,
    `window.CardUtils.fromEntity("杀（普攻）", { virtual: false })`);
  console.log("--- B 对照组：普通杀 ---");
  console.log(`  存活敌方 ${bb.aliveEnemies}，被高亮 ${JSON.stringify(bb.lit)}`);

  check("B1 对照组：普通杀牌仍高亮敌方（证明未误伤）",
    bb.lit.length > 0, `高亮=${bb.lit.length} 人`);

  check("Z 无页面错误", errors.length === 0, errors.slice(0, 2).join(" | "));

  console.log(`\n通过 ${pass} / 失败 ${fail}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
