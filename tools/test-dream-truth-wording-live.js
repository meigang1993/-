// 专项：梦想真理（星野依）的技能描述必须与实现一致
//
// 背景：data-new-characters.js 里梦想真理的描述只写了「使命技…切换立绘」，
// 缺了成功 / 失败两种结局各自的效果，玩家从描述看不出技能收益。本轮补齐：
//   成功：当你使用的实体牌与上一次使用的实体牌花色不同时，你本回合内攻击力和魔力各+1。
//   失败：你每使用四种不同花色的牌，弃置所有敌方角色各一张牌。
// 光改文案不够——必须验证「描述写的两件事，实现里真的有」。
//
// 判据（可证伪）：
//   A 描述同时包含成功句与失败句
//   B 成功结局：本回合内花色不同 → 攻击力与魔力各 +1
//   C 相同花色 → 不加（否则就是「每张牌都加」，与描述不符）
//   D 成功结局的加成只在本回合有效：回合流转后清零
//   E 失败结局：集齐四种花色 → 每名存活敌方各弃 1 张牌
//   F 对照组：成功结局集齐四花色时不弃牌（弃牌确实只属于失败结局）
//
// 防假通过：
//   1) 前置断言构造成功（角色在位、敌人在位且有手牌），否则"弃 0 张"也算通过；
//   2) C 段特意打一张相同花色的牌，若实现无条件 +1 则该断言必红；
//   3) F 段用成功结局做对照，若实现不看结局一律弃牌则该断言必红。
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

const SUCCESS_TEXT = "成功：当你使用的实体牌与上一次使用的实体牌花色不同时，你本回合内攻击力和魔力各+1。";
const FAILURE_TEXT = "失败：你每使用四种不同花色的实体牌，弃置所有敌方角色各一张牌。";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await startRegressionBattle(page);

  // ---------- A 描述文案 ----------
  const A = await page.evaluate(`(() => {
    const yi = (window.GameData?.characters || []).find(c => c.id === "hoshino_yi");
    const skill = (yi?.skills || []).find(s => s.name === "梦想真理");
    return { text: skill?.text || "" };
  })()`);
  check("A0 前置：取到梦想真理描述", A.text.length > 0, `len=${A.text.length}`);
  check("A1 描述包含成功句", A.text.includes(SUCCESS_TEXT), A.text.slice(0, 40));
  check("A2 描述包含失败句", A.text.includes(FAILURE_TEXT), A.text.slice(0, 40));
  check("A3 描述仍保留使命与切换立绘", A.text.includes("使命技") && A.text.includes("切换立绘为凋零者形态"), "");

  // ---------- B/C/D 成功结局：花色不同则双属性 +1 ----------
  const B = await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const a = b.allies[0];
    if (!a || !window.HoshinoYiSkills) return { skip: "no actor / module" };
    a.ref = "hoshino_yi"; a.hp = Math.max(a.hp, 1);
    a.tempAttack = 0; a.tempMagic = 0;
    a.hoshinoMissionResult = "success";
    a.hoshinoLastSuit = "♠"; a.hoshinoSuitSet = [];
    a.skills = [];               // 不挂偶像之星，隔离出牌补牌分支
    b.locked = false; b.animQueue = [];
    const play = suit => window.HoshinoYiSkills.afterCardPlayed(
      st, a, b.enemies[0], { suit, type: "slash" },
      { draw: () => [], damage: () => ({ hpLoss: 0 }) });
    play("♥");                                   // 与上一张 ♠ 不同 → 应 +1
    const diff = { ta: a.tempAttack, tm: a.tempMagic };
    play("♥");                                   // 与上一张 ♥ 相同 → 不应加
    const same = { ta: a.tempAttack, tm: a.tempMagic };
    play("♠");                                   // 与 ♥ 不同 → 再 +1
    const diff2 = { ta: a.tempAttack, tm: a.tempMagic };
    window.BattleTurnState.resetBeginTurn(a, b, 0);
    const nextTurn = { ta: a.tempAttack, tm: a.tempMagic };
    return { diff, same, diff2, nextTurn };
  })()`);
  if (B.skip) { check("B 构造：角色与模块在位", false, B.skip); }
  else {
    check("B0 前置：加成从 0 起算", B.diff.ta === 1 && B.diff.tm === 1, `ta=${B.diff.ta} tm=${B.diff.tm}`);
    check("B1 花色不同时攻击力与魔力各+1", B.diff.ta === 1 && B.diff.tm === 1, `ta=${B.diff.ta} tm=${B.diff.tm}`);
    check("C1 花色相同时不再加成（描述只认「不同」）", B.same.ta === 1 && B.same.tm === 1, `ta=${B.same.ta} tm=${B.same.tm}`);
    check("C2 再次不同时累加到 2", B.diff2.ta === 2 && B.diff2.tm === 2, `ta=${B.diff2.ta} tm=${B.diff2.tm}`);
    check("D1 回合流转后清零（「本回合内」成立）", B.nextTurn.ta === 0 && B.nextTurn.tm === 0, `ta=${B.nextTurn.ta} tm=${B.nextTurn.tm}`);
  }

  // ---------- E 失败结局：集齐四花色 → 敌方全体各弃 1 ----------
  const E = await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const a = b.allies[0];
    if (!a || !b.enemies || b.enemies.length < 2) return { skip: "enemies<2" };
    a.ref = "hoshino_yi"; a.hp = Math.max(a.hp, 1); a.skills = [];
    a.hoshinoMissionResult = "failure";
    a.hoshinoSuitSet = ["♠", "♥", "♣"];
    b.enemies.forEach(e => {
      e.hp = Math.max(e.hp, 1);
      e.hand = [window.CardUtils.fromEntity("杀（普攻）", { virtual: false })];
      e.pileStats = e.pileStats || {};
      e.pileStats.discard = [];
    });
    const enemyCount = b.enemies.length;
    const handBefore = b.enemies.reduce((n, e) => n + e.hand.length, 0);
    b.locked = false; b.animQueue = [];
    window.HoshinoYiSkills.afterCardPlayed(
      st, a, b.enemies[0], { suit: "♦", type: "slash" },
      { draw: () => [], damage: () => ({ hpLoss: 0 }) });
    const handAfter = b.enemies.reduce((n, e) => n + e.hand.length, 0);
    const discards = b.enemies.reduce((n, e) => n + ((e.pileStats?.discard || []).length), 0);
    return { enemyCount, handBefore, handAfter, discards };
  })()`);
  if (E.skip) { check("E 构造：2 名敌人", false, E.skip); }
  else {
    check("E0 前置：敌方各有 1 张手牌", E.handBefore >= 2, `before=${E.handBefore} enemies=${E.enemyCount}`);
    check("E1 每名存活敌方各弃 1 张", E.handBefore - E.handAfter >= 2, `lost=${E.handBefore - E.handAfter} enemies=${E.enemyCount}`);
    check("E2 弃掉的牌确实进弃牌堆", E.discards >= 2, `discard=${E.discards}`);
  }

  // ---------- F 对照组：成功结局集齐四花色不弃牌 ----------
  const F = await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const a = b.allies[0];
    if (!a || !b.enemies || b.enemies.length < 2) return { skip: "enemies<2" };
    a.ref = "hoshino_yi"; a.hp = Math.max(a.hp, 1); a.skills = [];
    a.hoshinoMissionResult = "success";
    a.hoshinoSuitSet = ["♠", "♥", "♣"];
    b.enemies.forEach(e => {
      e.hp = Math.max(e.hp, 1);
      e.hand = [window.CardUtils.fromEntity("杀（普攻）", { virtual: false })];
      e.pileStats = e.pileStats || {};
      e.pileStats.discard = [];
    });
    const handBefore = b.enemies.reduce((n, e) => n + e.hand.length, 0);
    b.locked = false; b.animQueue = [];
    window.HoshinoYiSkills.afterCardPlayed(
      st, a, b.enemies[0], { suit: "♦", type: "slash" },
      { draw: () => [], damage: () => ({ hpLoss: 0 }) });
    const handAfter = b.enemies.reduce((n, e) => n + e.hand.length, 0);
    const discards = b.enemies.reduce((n, e) => n + ((e.pileStats?.discard || []).length), 0);
    return { handBefore, handAfter, discards };
  })()`);
  if (F.skip) { check("F 构造：2 名敌人", false, F.skip); }
  else {
    check("F0 前置：敌方各有 1 张手牌", F.handBefore >= 2, `before=${F.handBefore}`);
    check("F1 成功结局不弃敌方手牌（弃牌只属于失败结局）", F.handAfter === F.handBefore, `before=${F.handBefore} after=${F.handAfter}`);
    check("F2 成功结局无牌进弃牌堆", F.discards === 0, `discard=${F.discards}`);
  }

  check("无页面错误", errors.length === 0, errors.slice(0, 2).join(" | "));
  console.log(`\n通过 ${pass} / 失败 ${fail}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("FATAL", e); process.exit(1); });
