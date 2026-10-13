// 专项：单位卡血量显示不得因 visualHp 残留而"越打越大"
//
// 关注点：单位卡渲染取 `unit.visualHp ?? unit.hp`（ui-common-card-combat.js /
// ui-battle-units.js），而 visualHp 是动画期的过渡值，由 holdVisual 在受伤前
// 置为"受伤前血量"，动画播完后由 clearVisuals 删除。
//
// BUG 成因：holdVisual 的赋值带 `== null` 守卫，一旦 visualHp 残留（动画被
// 打断时 drain 会 `if (!active()) return`，不会执行 clearVisuals），后续每次
// 受伤都不再刷新起始值，于是：
//   - 实际 hp 已逐次结算下降，单位卡却一直显示那个陈旧的、更大的数值；
//   - 且残留值不会自我纠正，打得越久显示与实际差得越多。
// 玩家看到的就是"血数字会变多"（显示的血量比真实血量高）。
//
// 修复：holdVisual 在该单位没有待播放浮字动画时，重置陈旧的 visualHp。
//
// 反向验证：撤掉守卫后，第 2/3 次受伤的 visualHp 会停在 62，DOM 也显示 62，
// 而实际 hp 已降到 32 —— 直接复现玩家反馈的现象。
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

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await startRegressionBattle(page);

  const res = await page.evaluate(`(async () => {
    const st = window.state, b = st.battle;
    const ally = b.allies[0], enemy = b.enemies[0];
    const card = { name: "测试杀", type: "slash", ignoreResponse: true, ignoreBlock: true };
    const hit = n => window.BattleSystem.damage(st, ally, n, "测试", enemy, { ...card });
    const domHp = () => {
      const el = document.querySelector('[data-target="' + ally.uid + '"] .combat-bar b');
      return el ? Number(el.textContent.trim()) : null;
    };
    ally.hp = 62; ally.block = 0; delete ally.visualHp;
    hit(10);
    const first = { hp: ally.hp, visualHp: ally.visualHp };
    // 模拟异常路径：动画队列已空（动画播完），但 clearVisuals 未执行 → visualHp 残留
    b.animQueue = [];
    const residue = { hp: ally.hp, visualHp: ally.visualHp };
    hit(10);
    const second = { hp: ally.hp, visualHp: ally.visualHp };
    b.animQueue = [];
    hit(10);
    const third = { hp: ally.hp, visualHp: ally.visualHp };
    const realHpAfter3 = ally.hp;
    b.animQueue = [];
    // 再打一次并让动画正常播完，确认最终收敛到真实血量
    window.BattleSystem.damage(st, ally, 5, "测试", enemy, { ...card });
    if (window.BattleEffects && window.BattleEffects.whenIdle) {
      await window.BattleEffects.whenIdle();
    }
    await new Promise(r => setTimeout(r, 1200));
    window.render && window.render();
    await new Promise(r => setTimeout(r, 300));
    return {
      first, residue, second, third, realHp: realHpAfter3,
      domAfterAnim: domHp(), hpAfterAnim: ally.hp,
    };
  })()`);

  // 1) 首次受伤：visualHp 应为"受伤前"的值（动画过渡所需）
  check("首次受伤 visualHp 取受伤前血量", res.first.visualHp === 62,
    `visualHp=${res.first.visualHp} hp=${res.first.hp}`);

  // 2) 残留态确认：队列已空但 visualHp 仍在（这是修复要处理的输入）
  check("残留态构造成功（队列空但 visualHp 仍在）", res.residue.visualHp === 62,
    `visualHp=${res.residue.visualHp}`);

  // 3) 核心：后续受伤必须纠正起始值，不能沿用陈旧值
  check("第二次受伤 visualHp 纠正为本次受伤前血量", res.second.visualHp === 52,
    `visualHp=${res.second.visualHp} 期望52`);
  check("第三次受伤 visualHp 纠正为本次受伤前血量", res.third.visualHp === 42,
    `visualHp=${res.third.visualHp} 期望42`);

  // 4) 核心收益：偏差不再累积。残留时 visualHp 停在很早的旧值，
  //    与真实血量的差会随受伤次数线性放大；修复后最多只差"上一次"的量。
  const gap = res.third.visualHp - res.realHp;
  check("显示偏差不再随受伤次数累积（≤ 单次伤害量）", gap <= 10,
    `visualHp=${res.third.visualHp} 实际hp=${res.realHp} 偏差=${gap}`);
  check("真实血量已逐次结算", res.realHp === 32, `hp=${res.realHp}`);

  // 5) 动画正常播放时，单位卡最终必须收敛到真实血量
  check("动画播放后单位卡收敛到真实血量", res.domAfterAnim === res.hpAfterAnim,
    `DOM=${res.domAfterAnim} 实际hp=${res.hpAfterAnim}`);

  await browser.close();
  console.log(`\n通过 ${pass}/${pass + fail}`);
  process.exit(fail ? 1 : 0);
})().catch(err => {
  console.error("执行失败:", err.message);
  process.exit(1);
});
