// 专项：【狙击目标】不得指定没有手牌的敌方角色
//
// 背景：玩家反馈「狙击目标可以选择没有牌的敌方角色」。
//
// 根因：技能定义只写了 target:"enemy"，UI 与逻辑层的目标判定都只校验阵营，
// 不校验目标是否有牌。而技能实现 revealSnipe 的第一步就是
// `const shown = visible(target)[0]; if (!shown) return false;`
// —— 目标无牌时直接返回 false，界面却已经允许点了，于是「点了没反应」，
// 且 usedArtinaSniper 也不会被消耗（玩家会以为技能还在）。
//
// 修复：UI 选目标阶段与逻辑层 canResolve 均排除空手牌目标，
// 与【窃取】(stealCard) 同一口径。
//
// 反向验证：撤掉 require 判定后，空手牌目标重新变为可选。
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

const setup = `(() => {
  const b = window.state.battle;
  const me = b.allies[0];
  me.ref = "artina"; me.name = "亚缇娜";
  me.skills = [{
    name: "狙击目标", type: "active", icon: "⚔️",
    text: "出牌阶段限一次，展示敌方一张手牌。",
    card: { name: "狙击目标", type: "tactic", artinaSniper: true, enemyTarget: true,
            artName: "狙击目标", icon: "⚔️", text: "选择一名敌方角色，展示其一张手牌。" },
  }];
  me.intent = 99; me.usedArtinaSniper = false;
  me.artinaSuits = {}; me.artinaChargedTargetUid = null; me.artinaSniperTargetUid = null;
  me.hand = [{ name: "杀（普攻）", type: "slash", suit: "♠" }];
  // 敌人甲：有手牌；敌人乙：空手牌；其余敌人移除，避免干扰
  const foes = b.enemies.slice(0, 2);
  foes.forEach((f, i) => { f.hp = 500; f.maxHp = 500; f.stats.attack = 0; });
  foes[0].name = "有牌敌人"; foes[0].hand = [{ name: "闪", type: "response", suit: "♥" }];
  foes[1].name = "空手敌人"; foes[1].hand = [];
  b.enemies.slice(2).forEach(e => { e.hp = 0; });
  b.phase = 4; b.activeUid = me.uid; b.locked = false; b.animQueue = [];
  b.selectedSkillCard = me.skills[0].card; b.selectedCardIndex = null;
  window.state.log = [];
  window.render();
  return { has: foes[0].name, empty: foes[1].name };
})()`;

const probe = `(() => {
  const b = window.state.battle;
  const me = b.allies[0];
  const card = me.skills[0].card;
  const withHand = b.enemies[0], noHand = b.enemies[1];
  const ui = window.GameUIBattleTargeting?.targetAllowed;
  const access = window.CharacterSkillAccess;
  return {
    uiWith: !!ui && ui(withHand, b, me, card),
    uiEmpty: !!ui && ui(noHand, b, me, card),
    canResolveWith: !!access && access.canResolve(window.state, me, withHand, card),
    canResolveEmpty: !!access && access.canResolve(window.state, me, noHand, card),
    // 对照组：普通单体杀不受影响（阵营判定仍然可用）
    uiSlash: !!ui && ui(noHand, b, me, { name: "杀（普攻）", type: "slash", suit: "♠" }),
    handCounts: [withHand.hand.length, noHand.hand.length],
  };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errs = [];
  page.on("pageerror", e => errs.push(String(e)));
  await startRegressionBattle(page);
  const names = await page.evaluate(setup);

  const r = await page.evaluate(probe);
  check("有手牌目标仍可选（UI）", r.uiWith === true, JSON.stringify(r.handCounts));
  check("空手牌目标不可选（UI）", r.uiEmpty === false, `空手敌人=${names.empty}`);
  check("有手牌目标可通过逻辑层校验", r.canResolveWith === true);
  check("空手牌目标被逻辑层拒绝", r.canResolveEmpty === false);
  check("对照组：普通【杀】仍可指定空手敌人", r.uiSlash === true);
  check("无页面错误", errs.length === 0, errs.join(" | "));

  await browser.close();
  console.log(`\n通过 ${pass}/${pass + fail}`);
  process.exit(fail ? 1 : 0);
})();
