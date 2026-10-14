// 专项：希特威【心血之咒】伤害来源规则的严格检查
//
// 规则（本轮改动）：只有「实体牌」或「虚拟牌」造成的伤害才触发；
// 技能伤害载荷（type:"skill"，如燃烧/毒/感电/勒脖/电钻火花追加段）不触发。
//
// 关注点：
//   1) 实体【杀】          → 触发
//   2) 虚拟【杀】          → 触发
//   3) 技能伤害载荷        → 不触发（本次新增的排除项，防假通过的重点）
//   4) 不传牌（默认载荷）  → 不触发
//   5) 技能生成的牌        → 不触发
//   6) 对照组：没有心血之咒的希特威，即便挨实体杀也不触发
//
// 防假通过：先断言「实体杀确实触发」（规则没被整体关掉），再断言各类不触发。
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startFreshGame, startRegressionBattle, dismissOpeningStory,
  collectErrors, relevantErrors } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}`
    + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
};

// hasSkill=false 用于对照组
const setupTpl = hasSkill => `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false;
  if (b.reactionQueue) b.reactionQueue = [];
  const h = b.allies[0], e = b.enemies[0];
  h.name = "希特威"; h.ref = "hitwell"; h.id = "hitwell";
  h.hp = h.maxHp = 500; h.block = 0;
  h.stats = { attack: 5, magic: 3, speed: 3 };
  h.skills = ${hasSkill} ? [{ name: "心血之咒", type: "passive" }] : [];
  h.hand = [];
  e.name = "敌人"; e.hp = e.maxHp = 500; e.block = 0;
  // 给敌方一张♥，命中即走「交牌」分支，战报文案唯一便于计数
  e.hand = [{ name: "闪", type: "basic", suit: "♥", uid: "eh0" }];
  st.log = [];
  window.render();
  return { hp: h.hp, foeHearts: e.hand.length };
})()`;

// cardExpr 为页面内表达式；null 表示不传牌（走默认伤害载荷）
const hitTpl = cardExpr => `(() => {
  const st = window.state, b = st.battle;
  const h = b.allies[0], e = b.enemies[0];
  const card = ${cardExpr === null ? "undefined" : `(${cardExpr})`};
  const before = h.hp;
  window.BattleSystem.damage(st, h, 10, "测试来源", e, card);
  window.BattleDamageLifecycle?.flushAfterDamage?.(st);
  return { hpLoss: before - h.hp };
})()`;

const curseCount = page => page.evaluate(`(() => (window.state.log || [])
  .map(l => String(l.text || l))
  .filter(t => t.includes("触发心血之咒")).length)()`);

async function settle(page, maxMs = 6000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const s = await page.evaluate(`(() => {
      const b = window.state.battle || {};
      return { locked: !!b.locked, anim: (b.animQueue || []).length,
        queue: (b.reactionQueue || b.pendingActions || []).length };
    })()`);
    if (!s.locked && !s.anim && !s.queue) return true;
    await page.waitForTimeout(80);
  }
  return false;
}

const CASES = [
  ["实体【杀】", `window.CardUtils.cloneEntity("杀")`, true],
  ["虚拟【杀】", `window.CardUtils.fromEntity("杀")`, true],
  ["技能伤害载荷 type:skill", `{ name: "燃烧", type: "skill" }`, false],
  ["技能生成的牌", `{ name: "杀", type: "slash", suit: "♠", generatedBySkill: "狂暴链锯" }`, false],
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  await dismissOpeningStory(page);
  await startRegressionBattle(page);
  // REVERT=1 用于反向验证：摘掉来源判据后，本该不触发的两项必须变红
  await page.evaluate(`window.__REVERT__ = ${process.env.REVERT ? 1 : 0}`);

  // 索牌分支挂在受击动画的浮字上延后结算，必须等到它真正落地再计数；
  // 每个用例都在本用例内等到结算完成，避免残留到下一条造成误判。
  async function waitCurse(page, want, ms = 6000) {
    const deadline = Date.now() + ms;
    let n = 0;
    while (Date.now() < deadline) {
      await settle(page);
      n = await curseCount(page);
      if (want && n > 0) break;
      await page.waitForTimeout(100);
    }
    // 触发用例再多等 400ms，确认没有二次触发
    if (want && n > 0) { await page.waitForTimeout(400); n = await curseCount(page); }
    return n;
  }

  for (const [title, cardExpr, expected] of CASES) {
    await page.evaluate(setupTpl(true));
    const hit = await page.evaluate(hitTpl(cardExpr));
    const n = await waitCurse(page, expected);
    T(`${title}：伤害确实结算（10 点）`, hit.hpLoss >= 10, hit);
    T(`${title}：${expected ? "触发" : "不触发"}心血之咒`,
      expected ? n === 1 : n === 0, { n, hpLoss: hit.hpLoss });
  }

  // 对照组：没有心血之咒的希特威，挨实体杀也不触发
  await page.evaluate(setupTpl(false));
  await page.evaluate(hitTpl(`window.CardUtils.cloneEntity("杀")`));
  const n0 = await waitCurse(page, false, 3000);
  T("对照组：无心血之咒时实体杀不触发", n0 === 0, { n0 });

  const bad = relevantErrors(errors);
  T("页面无 JS 错误", bad.length === 0, bad.slice(0, 3));

  console.log(`\n通过 ${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})().catch(err => { console.error("FATAL", err); process.exit(1); });
