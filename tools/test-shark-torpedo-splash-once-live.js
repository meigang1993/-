// 鲨影鱼雷溅射次数：同一张牌无论对多少目标造成伤害，只扩散一次全体伤害
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const {
  openGame, startRegressionBattle, collectErrors, relevantErrors,
} = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const ONLY = (process.env.SHARK_SP || "").toUpperCase();
let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass += 1; console.log(`✅ ${name}`); }
  else { fail += 1; console.log(`❌ ${name}${extra ? "  ← " + JSON.stringify(extra) : ""}`); }
};

const setupTpl = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false; b.phase = 4;
  const base = b.allies[0];
  while (b.allies.length < 4) {
    const clone = Object.assign({}, base);
    clone.uid = "ally_extra_" + b.allies.length;
    clone.hand = []; clone.statusCards = [];
    b.allies.push(clone);
  }
  b.allies.forEach((u, i) => { u.name = "我方" + i; u.hand = []; });
  window.__allyBase = Object.assign({}, base);
  window.__allyBase.hand = []; window.__allyBase.statusCards = [];
  const foe = b.enemies[0];
  foe.name = "狂鲨海盗团潜水艇";
  foe.ai = "shark_pirate_submarine";
  foe.hp = foe.maxHp = 300;
  foe.intent = 9; foe.hand = [];
  b.enemies.slice(1).forEach(e => { e.hp = 0; e.hand = []; });
  window.render();
  return { allies: b.allies.length };
})()`;

const runFn = ({ n, spec }) => {
  const st = window.state, b = st.battle;
  b.allies.length = 0;
  for (let i = 0; i < n; i += 1) {
    const clone = Object.assign({}, window.__allyBase);
    clone.uid = i === 0 ? window.__allyBase.uid : "ally_extra_" + i;
    clone.hand = []; clone.statusCards = [];
    b.allies.push(clone);
  }
  b.allies.forEach((u, i) => { u.name = "我方" + i; });
  b.animQueue = []; b.locked = false; b.phase = 4;
  b.allies.forEach(u => { u.hp = u.maxHp = 500; u.block = 0; u.hand = []; });
  const foe = b.enemies[0];
  foe.intent = 9;
  st.log = []; st.battleLog = [];
  const card = Object.assign(
    { id: "sp_card", name: "杀（普攻）", type: "slash", suit: "♠", scale: "attack", single: true }, spec);
  foe.hand = [card];
  try { window.BattleSystem.useCard(st, foe, b.allies[0], card); } catch (e) { window.__err = String(e && e.message); }
  const main = (st.log || []).map(String);
  return {
    alive: b.allies.length,
    splash: main.filter(l => l.includes("鲨影鱼雷扩散")).length,
    hits: main.filter(l => l.includes("鲨影鱼雷对我方")).length,
    losses: b.allies.map(u => 500 - u.hp),
    err: window.__err || "",
  };
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errList = collectErrors(page);
  await openGame(page);
  await startRegressionBattle(page);
  await page.evaluate(setupTpl);
  await page.waitForTimeout(400);

  const run = spec => async n => {
    const r = await page.evaluate(runFn, { n, spec });
    await page.waitForTimeout(150);
    return r;
  };

  // A 段：真实单体黑色杀（走真实标记链路）
  if (!ONLY || ONLY === "A") {
    console.log("--- A 真实单体黑色杀 ---");
    const mono = run({});
    for (const n of [2, 3, 4]) {
      const r = await mono(n);
      ok(`A${n} 溅射仅1次`, r.splash === 1, r);
      ok(`A${n} 溅射条数=${n - 1}（主目标被排除，不再重复吃）`,
        r.hits === n - 1, r);
      const others = r.losses.slice(1);
      ok(`A${n} 非主目标各受1次溅射`,
        others.length === n - 1 && others.every(v => v === 4), r);
      ok(`A${n} 主目标只吃杀伤(4，不是8)`, r.losses[0] === 4, r);
      ok(`A${n} 全员等量受伤`,
        r.losses.length === n && r.losses.every(v => v === 4), r);
    }
  }

  // B 段：转化为全体目标的黑色杀——本 BUG 的核心场景
  if (!ONLY || ONLY === "B") {
    console.log("--- B 全体目标黑色杀（原为 N 次溅射=N² 伤害）---");
    const sweep = run({ sharkTorpedo: true, sweep: true });
    for (const n of [2, 3, 4]) {
      const r = await sweep(n);
      ok(`B${n} 溅射仅1次（不是${n}次）`, r.splash === 1, r);
      ok(`B${n} 溅射条数=${n - 1}（不是${n * n}）`, r.hits === n - 1, r);
      const rest = r.losses.slice(1);
      ok(`B${n} 触发目标只吃杀伤(4，不是${n * 4})`, r.losses[0] === 4, r);
      ok(`B${n} 其余目标=杀伤+溅射(8)`,
        rest.length === n - 1 && rest.every(v => v === 8), r);
    }
  }

  // C 段：非黑色单体杀不溅射
  if (!ONLY || ONLY === "C") {
    console.log("--- C 红色单体杀不溅射 ---");
    const r = await page.evaluate(runFn, { n: 3, spec: { suit: "♥" } });
    await page.waitForTimeout(150);
    ok("C1 无溅射日志", r.splash === 0, r);
    ok("C2 无溅射伤害", r.hits === 0, r);
    ok("C3 仍正常打出（主目标受伤）", r.losses[0] > 0, r);
  }

  // D 段：溅射自身不再递归
  if (!ONLY || ONLY === "D") {
    console.log("--- D 溅射不递归 ---");
    const r = await page.evaluate(runFn, { n: 3, spec: {} });
    await page.waitForTimeout(150);
    const total = r.losses.reduce((s, v) => s + v, 0);
    ok("D1 总伤害=杀伤4+溅射2×4=12（主目标不再重复吃）",
      total === 12, { total, losses: r.losses });
  }

  const errs = relevantErrors(errList);
  ok("无 JS 错误", errs.length === 0, errs.slice(0, 3));
  console.log(`\n=== 通过 ${pass} / 失败 ${fail} ===`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("FATAL", e && e.message); process.exit(1); });
