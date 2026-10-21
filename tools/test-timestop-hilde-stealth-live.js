// 时停 × 希尔德【暗幕隐身】专项回归
//
// 背景：暗幕隐身是锁定技（有黑色牌时不可被单体【杀】指定），但它此前完全没有
// 时停守卫 —— 被【神奇怀表】标记的希尔德照样不可指定，时停对这条技能无效。
//
// 该技能有三个互不重合的入口：目标选择逻辑（battle-combat-targeting）、
// 饰品自动斩（battle-relic-turns）、UI 敌方可选高亮（ui-battle-targeting）。
// 守卫写在 ruins-elite-skills.js 的 stealthOn 内部，一处覆盖全部三入口。
//
// 本测试锁四条不变量：
//   A 基线：未被时停 + 有黑色牌 → 不可指定（证明下面的断言不是恒真）
//   B 时停中：隐身失效，可以指定
//   C 时停中：UI 高亮同步放开（不出现"点了没反应"）
//   D 标记消失后：隐身恢复生效
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const FOE = 0;
let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
};

// statuses：null=不改动，数组=覆写（["时停"] 施加标记，[] 清除标记）
const setupTpl = (statuses) => `(() => {
  const st = window.state, b = st.battle;
  const a = b.allies[0], e = b.enemies[${FOE}];
  b.activeUid = a.uid; b.phase = 4; b.locked = false; b.animQueue = [];
  b.selectedCardIndex = null; b.selectedSkillCard = null; b.pendingTargetUid = null;
  a.intent = 5; a.hp = 200; a.maxHp = 200;
  a.hand = [{ name: "杀", type: "slash", suit: "♠", scale: "attack" }];
  a.hand.forEach(c => { delete c._pendingDraw; });
  e.ai = "ruins_hilde"; e.name = "内英组杀手希尔德";
  e.hp = 200; e.maxHp = 230; e.stats = { attack: 11, magic: 10, speed: 16 };
  e.ruinsBackstabTurn = -1;
  // 始终持有黑色牌 —— 隐身的触发条件必须全程成立，否则"可以指定"
  // 会是因为没隐身而不是因为被时停，断言就假绿了。
  e.hand = [{ name: "杀", type: "slash", suit: "♠", scale: "attack" }];
  e.hand.forEach(c => { delete c._pendingDraw; });
  ${statuses ? `e.statuses = ${JSON.stringify(statuses)};` : ""}
  st.log = [];
  window.render();
  return { ok: true };
})()`;

const aimTpl = `(() => {
  const st = window.state, b = st.battle;
  const e = b.enemies[${FOE}];
  const uid = e.uid;
  const sel = window.BattleSystem.selectCard(st, 0);
  const picked = b.allies[0].hand[0];
  const uiAllowed = window.GameUIBattleTargeting?.targetAllowed?.(
    e, b, b.allies[0], picked) === true;
  const ok = window.BattleSystem.chooseTarget(st, uid);
  return {
    sel, ok, uiAllowed, picked: picked?.name,
    foeBlack: (e.hand || []).filter(c => !c._pendingDraw && (c.suit === "♠" || c.suit === "♣")).length,
    statuses: (e.statuses || []).slice(),
    stealthOn: !!window.RuinsEliteSkills?.stealthOn?.(e),
  };
})()`;

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", e => errors.push(String(e)));
  await openGame(page);
  await startRegressionBattle(page);

  // ===== A 基线：未被时停，有黑色牌 → 不可指定 =====
  await page.evaluate(setupTpl(null));
  const base = await page.evaluate(aimTpl);
  T("A1 基线：未被时停且有黑色牌时，单体【杀】不可指定她",
    base.ok === false && base.foeBlack > 0, base);
  T("A2 基线：stealthOn 为真（隐身确实生效）", base.stealthOn === true, base);
  T("A3 基线：UI 层同步置灰", base.uiAllowed === false, base);

  // ===== B 时停中：隐身失效 =====
  await page.evaluate(setupTpl(["时停"]));
  const stopped = await page.evaluate(aimTpl);
  T("B1 时停中：stealthOn 为假（隐身被禁用）", stopped.stealthOn === false, stopped);
  T("B2 时停中：单体【杀】可以指定她（隐身失效）", stopped.ok === true, stopped);
  T("B3 时停中：UI 高亮同步放开（不出现点了没反应）",
    stopped.uiAllowed === true, stopped);
  T("B4 时停中：仍持有黑色牌（排除「没隐身所以能选」的假绿）",
    stopped.foeBlack > 0, stopped);
  // chooseTarget 只是置 pendingTargetUid，再点同一目标才真正确认出牌
  // （battle-action-selection.js:51），所以要打两次才结算伤害。
  const confirm = await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const ok = window.BattleSystem.chooseTarget(st, b.enemies[${FOE}].uid);
    return { ok, pending: b.pendingTargetUid };
  })()`);
  await page.waitForTimeout(1200);
  const afterHit = await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    return {
      foeHp: b.enemies[${FOE}].hp,
      logs: (st.log || []).slice(0, 30).map(String),
      confirm: ${JSON.stringify(confirm)},
    };
  })()`);
  // confirmBattleCard 是模块私有函数（未挂 window），真实结算要走 UI 点击；
  // 这里退一步断言「已置为待确认目标」——即指定链确实放行了她。
  T("B5 时停中：指定后进入待确认状态（pendingTargetUid 指向她）",
    afterHit.confirm.ok === true && afterHit.confirm.pending === "e0", afterHit);

  // ===== C 标记消失后：隐身恢复 =====
  await page.evaluate(setupTpl([]));
  const restored = await page.evaluate(aimTpl);
  T("C1 标记消失后：stealthOn 恢复为真", restored.stealthOn === true, restored);
  T("C2 标记消失后：单体【杀】重新不可指定", restored.ok === false, restored);
  T("C3 标记消失后：UI 重新置灰", restored.uiAllowed === false, restored);

  T("页面无 JS 报错", errors.length === 0, { errors: errors.slice(0, 3) });
  await browser.close();
  console.log(`\n通过 ${pass}/${total}`);
  process.exit(pass === total ? 0 : 1);
})().catch(err => { console.error(err); process.exit(1); });
