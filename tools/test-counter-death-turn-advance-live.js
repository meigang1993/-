// 专项：本回合被机械牛头王【电磁反制装置】反死后，回合不得卡在弃牌阶段
//
// 背景（玩家反馈）：被这个 BOSS 反制装置反死时，有概率卡在"弃牌阶段"界面不动。
//
// 根因是一条时序链：
//   1) 反制伤害让玩家在自己回合内阵亡；
//   2) checkDefeat 开头 `if (pendingFatalAnim(b)) return false` —— 死亡浮字还在
//      动画队列里时提前返回，**不执行** discardDeadHands，死者手牌仍在手上；
//   3) 玩家此时点"结束出牌" → finishTurn → enterDiscardOrEnd，按手牌超限
//      算出的 need > 0，于是 return false 停在 phase 5 等一个死人弃牌；
//   4) 动画播完后 discardDeadHands 终于清空手牌，但**没有任何地方再调用**
//      completeDiscardPhase，phase 5 就此永久停住（实测 T+10s 仍 phase=5、
//      activeUid 仍是死者的 a0、turn 不推进）。
//
// 修复：阵亡单位没有弃牌阶段（手牌由「被击倒，弃置所有手牌」统一处理），
// enterDiscardOrEnd / completeDiscardPhase 遇到阵亡单位直接进结束阶段。
//
// "有概率"的来源：电磁反制判定（黑桃/梅花成功）约五成触发，且需要在动画
// 播完前点结束出牌——两条同时满足才卡死。
//
// 反向验证：撤掉阵亡判断后应重新卡在 phase 5、activeUid 停在死者。
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

// 构造：e0 变机械牛头王（歼灭模式、血量 50%），玩家残血出单体杀触发反制
const SETUP = `
  const st = window.state, b = st.battle;
  b.test = false;
  const ally = b.allies[0], e0 = b.enemies[0];
  e0.ai = "mechanical_bull_king"; e0.id = "mechanical_bull_king";
  e0.name = "机械牛头王";
  e0.annihilationMode = true; e0.defenseSystem = false;
  e0.maxHp = 100; e0.hp = 50; e0.hand = [];
  e0.stats = Object.assign({}, e0.stats || {}, { attack: 10 });
  e0.deck = [];
  for (let i = 0; i < 10; i += 1) {
    e0.deck.push({ suit: JUDGE_SUIT, name: "判定牌" + i, type: "basic" });
  }
  ally.maxHp = 62; ally.hp = 5; ally.block = 0; ally.intent = 1;
  ally.hand.unshift({ name: "杀（普攻）", type: "slash", suit: "♠" });
  b.animQueue = []; b.floats = [];
  window.render && window.render();
  window.BattleSystem.selectCard(st, 0);
  window.BattleSystem.chooseTarget(st, e0.uid);
  window.BattleSystem.playSelectedCard(st);
`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", e => pageErrors.push(e.message));
  await startRegressionBattle(page);

  // --- 场景A：反制致死 + 动画未播完就点结束出牌（玩家反馈的卡死路径）---
  const a = await page.evaluate(`(async () => {
    const JUDGE_SUIT = "♠";
    ${SETUP}
    const rightAfterPlay = { hp: ally.hp, hand: ally.hand.length, phase: b.phase };
    // 不等动画，立刻点"结束出牌"
    try { await window.BattleSystem.endPlay(window.state); } catch (err) { rightAfterPlay.err = String(err); }
    const rightAfterEnd = { phase: b.phase, active: b.activeUid, hand: ally.hand.length };
    await new Promise(r => setTimeout(r, 3000));
    const settled = {
      phase: b.phase, active: b.activeUid, turn: b.turn, locked: b.locked,
      hand: ally.hand.length, hp: ally.hp,
      log: (window.state.log || []).slice(0, 8).join(" | "),
    };
    const txt = document.body.innerText || "";
    settled.uiDiscard = /弃牌阶段/.test(txt);
    return { rightAfterPlay, rightAfterEnd, settled };
  })()`);

  console.log("场景A：反制致死 + 立即结束出牌");
  check("A1 反制确实致死", a.rightAfterPlay.hp <= 0, `hp=${a.rightAfterPlay.hp}`);
  check("A2 死亡瞬间手牌尚未清理（时序前提成立）", a.rightAfterPlay.hand > 0,
    `手牌=${a.rightAfterPlay.hand}`);
  check("A3 未卡在弃牌阶段 phase=5", a.settled.phase !== 5,
    `phase=${a.settled.phase}`);
  check("A4 行动权推进到下一位（不再是死者）", a.settled.active !== "a0",
    `active=${a.settled.active}`);
  check("A5 回合数已推进", a.settled.turn > 0, `turn=${a.settled.turn}`);
  check("A6 UI 不再显示弃牌阶段", a.settled.uiDiscard === false);
  check("A7 死者手牌最终被清理", a.settled.hand === 0, `手牌=${a.settled.hand}`);
  check("A8 战斗未锁死", a.settled.locked === false);

  await page.close();

  // --- 场景B：判定失败（红牌）→ 玩家存活，正常流程不受影响 ---
  const page2 = await browser.newPage();
  page2.on("pageerror", e => pageErrors.push(e.message));
  await startRegressionBattle(page2);
  const bs = await page2.evaluate(`(async () => {
    const JUDGE_SUIT = "♥";   // 红牌 → 反制不触发
    ${SETUP}
    const alive = { hp: ally.hp, hand: ally.hand.length };
    if (window.BattleEffects?.whenIdle) await window.BattleEffects.whenIdle();
    await new Promise(r => setTimeout(r, 2500));
    return { alive, hp: ally.hp, phase: b.phase };
  })()`);
  console.log("\n场景B：判定失败（对照组）");
  check("B1 红牌判定不触发反制，玩家存活", bs.hp > 0, `hp=${bs.hp}`);
  check("B2 仍在出牌阶段", bs.phase === 4, `phase=${bs.phase}`);
  await page2.close();

  // --- 场景C：等动画播完再结束出牌（正常时序，修复前也能通过）---
  const page3 = await browser.newPage();
  page3.on("pageerror", e => pageErrors.push(e.message));
  await startRegressionBattle(page3);
  const c = await page3.evaluate(`(async () => {
    const JUDGE_SUIT = "♠";
    ${SETUP}
    if (window.BattleEffects?.whenIdle) await window.BattleEffects.whenIdle();
    await new Promise(r => setTimeout(r, 2500));
    const beforeEnd = { hp: ally.hp, hand: ally.hand.length };
    try { await window.BattleSystem.endPlay(window.state); } catch (err) { beforeEnd.err = String(err); }
    await new Promise(r => setTimeout(r, 3000));
    return { beforeEnd, phase: b.phase, active: b.activeUid, turn: b.turn };
  })()`);
  console.log("\n场景C：等动画播完再结束出牌（对照组）");
  check("C1 反制致死", c.beforeEnd.hp <= 0, `hp=${c.beforeEnd.hp}`);
  check("C2 行动权推进到下一位", c.active !== "a0", `active=${c.active}`);
  check("C3 回合数已推进", c.turn > 0, `turn=${c.turn}`);
  await page3.close();

  check("无页面 JS 错误", pageErrors.length === 0, pageErrors.join(" | ") || "0");
  await browser.close();
  console.log(`\n通过 ${pass}/${pass + fail}`);
  process.exit(fail ? 1 : 0);
})();
