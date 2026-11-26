// 290/291 拆分副作用实机：真实页面加载 11 个 bundle 后，走完整 BattleSystem.damage，
// 验证修正链钩子不重不漏、多种来源数值一致、battle state 无新字段、无 JS 错误。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle, collectErrors, relevantErrors } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const passed = [];
const T = (n, ok, d = "") => {
  passed.push(ok);
  console.log(`${ok ? "✅" : "❌"} ${n}${ok ? "" : "  ← " + JSON.stringify(d)}`);
  return ok;
};

const BASE = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false; b._damageDepth = 0;
  b.manualDodge = null; b.manualDodgeResume = null; b.dimensionTransfer = null;
  b.opheliaGuard = null; b.opheliaGuardUid = null;
  b.allies.forEach(a => { a.hp = 400; a.maxHp = 400; a.block = 0; a.hand = [];
    a.statuses = []; a.battleRelics = []; a.noResponse = false; a.ref = "ally"; });
  b.enemies.forEach(e => { e.hp = 400; e.maxHp = 400; e.hand = []; e.statuses = []; });
  window.BattleEffects.animating = false; window.BattleEffects.draining = false;
  st.settings = Object.assign({}, st.settings || {}, { manualResponse: false, manualDodge: false });
  st.log = [];
  window.render && window.render();
  return true;
})()`;

// 四种来源各走一次完整伤害链；同时给 tacticDamage / beforeResponseCheck 装计数器，
// 专查拆后有没有把钩子重复调用或漏掉。
const TRIGGER = `(card, targetExtra) => {
  const st = window.state, b = st.battle;
  const target = b.allies[0], actor = b.enemies[0];
  Object.assign(target, targetExtra || {});
  const hits = [];
  const patches = [];
  const wrap = (obj, key) => {
    if (!obj || typeof obj[key] !== "function") return;
    const orig = obj[key];
    obj[key] = (...args) => { hits.push(key); return orig.apply(obj, args); };
    patches.push([obj, key, orig]);
  };
  wrap(window.RuinsRelicEffects, "tacticDamage");
  wrap(window.RuinsRelicEffects, "modifyIncomingDamage");
  wrap(window.RuinsRelicEffects, "beforeResponseCheck");
  wrap(window.RuinsCardSkills, "beforeResponseCheck");
  wrap(window.EnemySkills, "modifyDamage");
  const out = window.BattleSystem.damage(st, target, 10, "测试", actor, card);
  patches.forEach(([obj, key, orig]) => { obj[key] = orig; });
  return { out, hp: target.hp, hits,
    leak: Object.keys(b).filter(k => k.startsWith("__modifiers")),
    log: (st.log || []).slice(-4) };
}`;

const PROBE = `(() => {
  const sub = window.BattleDamageResolutionModifiers?.({ deps: {} });
  const main = window.BattleDamageResolution?.({
    deps: { isKillCard: () => false, draw: () => {} },
    utils: { queueAttackAnim: () => {} }, needsResponse: () => false,
    canDodge: () => false,
    getResponseApi: () => ({ shouldManualDodge: () => false, autoDodge: () => false }),
    getHitWithoutDodge: () => () => ({ dodged: false, hpLoss: 0 }),
  });
  return { subKeys: Object.keys(sub || {}).sort(), mainKeys: Object.keys(main || {}).sort() };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = collectErrors(page);
  await openGame(page);
  await startRegressionBattle(page);

  const probe = await page.evaluate(PROBE);
  T("A1 子模块导出 compute、主模块导出不变",
    probe.subKeys.join(",") === "compute"
    && probe.mainKeys.join(",") === "resolveDamage,triggerWhiteLolita", probe);

  const cases = [
    ["实体单体【杀】", { name: "杀", type: "slash", suit: "♠" }, {}],
    ["战术牌（带 power）", { name: "魔法对决", type: "tactic", power: 10 }, {}],
    ["skipDamageModify 载荷", { name: "杀", type: "slash", skipDamageModify: true }, {}],
    ["群体杀（sweep 单体入口）", { name: "机枪扫杀", type: "slash", sweep: true, allTargets: true }, {}],
    ["受术方被时停", { name: "杀", type: "slash" }, { statuses: ["时停"] }],
  ];
  for (const [label, card, extra] of cases) {
    await page.evaluate(BASE);
    const r = await page.evaluate(`(${TRIGGER})(${JSON.stringify(card)}, ${JSON.stringify(extra)})`);
    console.log(`[${label}] ${JSON.stringify(r)}`);
    T(`${label}：伤害数值 10、无状态泄漏、无报错`,
      r.out.hpLoss === 10 && r.hp === 390 && r.leak.length === 0, r);
    // 受术方被时停时 incoming 链按拆分前口径被抑制（0 次），不是漏调用。
    const wantIncoming = label.includes("时停") ? 0 : 1;
    T(`${label}：tacticDamage / incoming(${wantIncoming}) / beforeResponseCheck 次数正确`,
      r.hits.filter(x => x === "tacticDamage").length === 1
      && r.hits.filter(x => x === "modifyIncomingDamage").length === wantIncoming
      && r.hits.filter(x => x === "beforeResponseCheck").length === 2
      && r.hits.filter(x => x === "modifyDamage").length <= 1, r.hits);
  }

  const rel = relevantErrors(errors);
  T("B1 全程无 pageerror / console error", rel.length === 0, rel.slice(0, 3));
  console.log(`\nRESULT ${passed.filter(Boolean).length}/${passed.length}`);
  await browser.close();
  process.exit(passed.every(Boolean) ? 0 : 1);
})();
