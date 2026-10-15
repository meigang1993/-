// 专项：其他怪物的「回合外 / 被动反伤」把我方当前行动者反死后，
// 不得卡在弃牌阶段等一个死人操作。
//
// 背景：机械牛头王【电磁反制装置】反死玩家后卡在「弃牌阶段」
// （见 test-counter-death-turn-advance-live.js）。根因在通用的回合收尾流程
// （battle-discard-flow.js：阵亡单位没有弃牌阶段），而非某个 BOSS 独有，
// 因此凡能在**我方回合内**对我方造成伤害的敌方机制都走同一条收尾路径。
//
// 本文件覆盖另外三条同类路径，确认它们同样不卡：
//   A 弹反      敌人用【弹反】响应我方单体【杀】，猜拳获胜把伤害打回我方
//               （battle-dodge-deflect.js → WithererSkills.deflect）
//   B 鬼牌狂欢  水下列车 raff_assassin：我方出牌后立刻对我方造成魔力伤害
//               （underwater-train-prepare-skills.js afterCardPlayed）
//   C 机尾机枪  废墟沙城 ruins_dragon：我方用【杀】打龙达到阈值后，龙发射
//               虚拟【机枪扫杀】打我方全体（ruins-dragon-skills.js）
//
// 判定「卡死」：等待 4 秒后仍停在 phase 5、activeUid 仍是死者、turn 不推进。
//
// 反向验证：撤掉 battle-discard-flow.js 的阵亡判断后，A/B/C 三组的
// 「未卡在弃牌阶段 / 行动权推进」应重新变红。
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

// 公共前奏：关闭测试模式复活、清空动画队列、我方残血、手里一张单体杀
const BASE = `
  const st = window.state, b = st.battle;
  b.test = false;
  const ally = b.allies[0], e0 = b.enemies[0];
  b.animQueue = []; b.floats = [];
  ally.maxHp = 62; ally.block = 0; ally.intent = 5;
  ally.hand.unshift({ name: "杀（普攻）", type: "slash", suit: "♠" });
`;

// 出牌 → 立即点结束出牌（不等动画，这是玩家反馈的卡死时序）→ 等 4 秒观察
const ACT = `
  window.render && window.render();
  window.BattleSystem.selectCard(st, 0);
  window.BattleSystem.chooseTarget(st, e0.uid);
  window.BattleSystem.playSelectedCard(st);
  const afterPlay = { hp: ally.hp, hand: ally.hand.length };
  try { await window.BattleSystem.endPlay(window.state); }
  catch (err) { afterPlay.endErr = String(err); }
  await new Promise(r => setTimeout(r, 4000));
  const txt = document.body.innerText || "";
  const settled = {
    phase: b.phase, active: b.activeUid, turn: b.turn, locked: !!b.locked,
    hand: ally.hand.length, hp: ally.hp,
    uiDiscard: /弃牌阶段/.test(txt),
    diag: {
      log: (window.state.log || []).slice(0, 6).join(" | "),
      gunFired: !!e0.ruinsGunFired,
      hits: e0.ruinsHitsThisTurn,
      eHand: e0.hand.length,
    },
  };
`;

const SETUP_A = `
  e0.maxHp = 100; e0.hp = 100;
  e0.stats = Object.assign({}, e0.stats || {}, { attack: 10 });
  e0.hand = [{ name: "弹反", type: "response", deflect: true, suit: "♠" }];
  ally.hp = 3;
  // 猜拳结果固定为「防守方获胜」，否则随机导致用例不稳定
  let roll = 0;
  window.GameRandom.sample = (opts, s) => { roll += 1; return roll === 1 ? "石头" : "剪刀"; };
`;

const SETUP_B = `
  e0.ai = "raff_assassin"; e0.id = "raff_assassin"; e0.name = "拉夫刺客";
  e0.jokerMode = "black";
  e0.maxHp = 100; e0.hp = 100;
  e0.stats = Object.assign({}, e0.stats || {}, { magic: 10 });
  ally.hp = 3;
`;

const SETUP_C = `
  e0.ai = "ruins_dragon"; e0.id = "ruins_dragon"; e0.name = "废墟沙城龙";
  e0.maxHp = 200; e0.hp = 200;
  e0.stats = Object.assign({}, e0.stats || {}, { attack: 20 });
  e0.hand = [];
  e0.ruinsHitsThisTurn = 0; e0.ruinsGunFired = false;
  ally.hp = 5;
  // 机尾机枪是虚拟【机枪扫杀】，可被【闪】响应。若我方手里有闪会自动打出抵消，
  // 致死前提就不成立（这正是第一版用例假红的原因）。移除响应牌，但保留其余手牌
  // 使其仍超过上限——「手牌超限」是原卡死路径的必要前提。
  b.allies.forEach(u => {
    u.hand = u.hand.filter(c => c.name !== "闪" && !c.deflect);
    while (u.hand.length < 6) u.hand.push({ name: "蓄力", type: "tactic", suit: "♠" });
  });
`;

async function runScene(browser, label, setup, pageErrors) {
  const page = await browser.newPage();
  page.on("pageerror", e => pageErrors.push(e.message));
  await startRegressionBattle(page);
  const out = await page.evaluate(`(async () => {
    ${BASE}
    ${setup}
    ${ACT}
    return { afterPlay, settled };
  })()`);
  await page.close();
  console.log(`\n${label}`);
  if (process.env.DIAG) {
    console.log("  diag:", JSON.stringify(out.settled.diag));
  }
  check(`${label} · 反伤确实致死`, out.afterPlay.hp <= 0,
    `hp=${out.afterPlay.hp}`);
  check(`${label} · 死亡瞬间手牌尚未清理（时序前提成立）`,
    out.afterPlay.hand > 0, `手牌=${out.afterPlay.hand}`);
  check(`${label} · 未卡在弃牌阶段 phase=5`, out.settled.phase !== 5,
    `phase=${out.settled.phase}`);
  check(`${label} · 行动权推进（不再是死者）`, out.settled.active !== "a0",
    `active=${out.settled.active}`);
  check(`${label} · 回合已推进`, out.settled.turn > 0, `turn=${out.settled.turn}`);
  check(`${label} · UI 不再显示弃牌阶段`, out.settled.uiDiscard === false);
  check(`${label} · 死者手牌最终被清理`, out.settled.hand === 0,
    `手牌=${out.settled.hand}`);
  check(`${label} · 战斗未锁死`, out.settled.locked === false);
  return out;
}

(async () => {
  const browser = await chromium.launch();
  const pageErrors = [];

  await runScene(browser, "A 弹反", SETUP_A, pageErrors);
  await runScene(browser, "B 鬼牌狂欢", SETUP_B, pageErrors);
  await runScene(browser, "C 机尾机枪(AOE)", SETUP_C, pageErrors);

  // 对照：同样时序但玩家未死（弹反猜拳失败），必须仍在出牌阶段、正常可继续
  const page = await browser.newPage();
  page.on("pageerror", e => pageErrors.push(e.message));
  await startRegressionBattle(page);
  const d = await page.evaluate(`(async () => {
    ${BASE}
    e0.maxHp = 100; e0.hp = 100;
    e0.stats = Object.assign({}, e0.stats || {}, { attack: 10 });
    e0.hand = [{ name: "弹反", type: "response", deflect: true, suit: "♠" }];
    ally.hp = 62;
    // 防守方出石头、进攻方出布 → 防守方落败，弹反不生效。
    // 注意：两边出一样会平局，deflect 内部是 while(true) 重猜，mock 成同手势会死循环。
    let roll = 0;
    window.GameRandom.sample = (opts, s) => { roll += 1; return roll === 1 ? "石头" : "布"; };
    window.render && window.render();
    window.BattleSystem.selectCard(st, 0);
    window.BattleSystem.chooseTarget(st, e0.uid);
    window.BattleSystem.playSelectedCard(st);
    await new Promise(r => setTimeout(r, 2500));
    return { hp: ally.hp, phase: b.phase, active: b.activeUid };
  })()`);
  await page.close();
  console.log("\nD 对照组：猜拳失败（玩家存活）");
  check("D1 弹反失败后玩家存活", d.hp > 0, `hp=${d.hp}`);
  check("D2 仍在出牌阶段", d.phase === 4, `phase=${d.phase}`);
  check("D3 行动权未变（仍是 a0）", d.active === "a0", `active=${d.active}`);

  check("无页面 JS 错误", pageErrors.length === 0,
    pageErrors.join(" | ") || "0");
  await browser.close();
  console.log(`\n通过 ${pass}/${pass + fail}`);
  process.exit(fail ? 1 : 0);
})();
