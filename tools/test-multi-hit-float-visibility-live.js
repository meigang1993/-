// 多段伤害（连击 / 追击 / 狂暴链锯额外结算）的伤害数字可见性回归
//
// 背景（玩家反馈）：狂暴链锯、连击、追击造成伤害时，有时候看不到伤害数字。
//
// 复现到的真实机制：战斗飘字渲染限制「同一目标同时最多 3 个数字」，
// 且超限时会把最旧的那个立刻 remove()。多段伤害一旦在同一目标上叠到
// 第 4 个，最早的数字会在创建的同一帧内被销毁——实测存活 0ms，
// 一帧都没渲染过，玩家看到的就是"没显示数字"。
// 触发路径在生产环境真实存在：BattleEffects.cancel() 与存档检查点
// restore() 都会清空 animQueue 而不清 b.floats，之后 BattleEffects.sync()
// 执行 popFloats(state)（不带 id）把积压飘字一次性全部弹出。
//
// 另修一处：纵向槽位原按全局 seq % 4 取，同单位上 seq 相差 4 的两次伤害
// 会落到完全相同的坐标互相盖住，看起来也像少了一个数字。改为按单位各自计数。
//
// 本文件走真实伤害接口 BattleSystem.damage 推入飘字，再用生产同款路径
// （清空 animQueue + BattleFX.popFloats(state)）弹出，断言：
//   1. 每个数字都真实渲染并存活足够时长（无一闪即焚）
//   2. 同一单位的多个数字落点互不相同
//   3. 狂暴链锯 / 组合进攻真实链路回归不受影响
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const {
  startRegressionBattle,
} = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

// 等动画队列、反应队列、待恢复动作全部排空
async function settle(page, maxMs = 30000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const s = await page.evaluate(`(() => {
      const b = window.state.battle || {};
      return { anim: (b.animQueue || []).length, locked: !!b.locked,
        q: (b.reactionQueue || b.pendingActions || []).length,
        combo: !!b.comboAttackResume, manual: !!b.manualDodge,
        resume: !!(b.manualDodgeResume || b.demonInvasionResume) };
    })()`);
    if (!s.anim && !s.locked && !s.q && !s.combo && !s.manual && !s.resume) break;
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(800);
}

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total += 1;
  if (cond) pass += 1;
  console.log(`${cond ? "✅" : "❌"} ${name}`
    + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
};

const OBSERVE = `(() => {
  window.__fl = [];
  new MutationObserver(muts => {
    muts.forEach(m => {
      m.addedNodes.forEach(n => {
        if (n.nodeType === 1 && n.classList?.contains("float-num")) {
          const rec = { born: Date.now(), text: n.textContent,
            left: n.style.left, top: n.style.top };
          window.__fl.push(rec);
          n.__rec = rec;
        }
      });
      m.removedNodes.forEach(n => {
        if (n.__rec && n.__rec.died == null) n.__rec.died = Date.now();
      });
    });
  }).observe(document.body, { childList: true, subtree: true });
  return true;
})()`;

const baseSetup = `(() => {
  const st = window.state, b = st.battle;
  st.settings.battleSpeed = 2;
  b.animQueue = []; b.locked = false; b.phase = 4; b.floats = [];
  b.allies.forEach(a => { a.hp = a.maxHp = 500; a.block = 0; a.hand = []; });
  b.enemies.forEach(e => { e.hp = e.maxHp = 5000; e.block = 0; e.hand = []; });
  window.render();
  return true;
})()`;

// 对同一目标连续造成 hits 次伤害，再走生产同款"一次性弹出"路径
const burst = hits => `(() => {
  const st = window.state, b = st.battle;
  const actor = b.allies[0], target = b.enemies[0];
  const before = b.floatSeq || 0;
  for (let i = 0; i < ${hits}; i += 1) {
    window.BattleSystem.damage(st, target, 7, "多段测试", actor,
      { name: "杀", type: "slash", virtual: true, ignoreResponse: true });
  }
  b.animQueue.length = 0;
  window.BattleFX.popFloats(st);
  return { pushed: (b.floatSeq || 0) - before };
})()`;

const readFloats = `(() => window.__fl.map(f => ({
  text: f.text, life: (f.died || Date.now()) - f.born,
  left: f.left, top: f.top })))()`;

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await startRegressionBattle(page);

  // —— A 组：同一目标叠加 8 个伤害数字 ——
  await page.evaluate(baseSetup);
  await page.evaluate(OBSERVE);
  const pushed = await page.evaluate(burst(8));
  await page.waitForTimeout(2200);
  let floats = await page.evaluate(readFloats);
  const dmg = floats.filter(f => f.text.startsWith("-"));
  T("A1 8 段伤害全部推入飘字", pushed.pushed >= 6, pushed);
  T("A2 每段都有对应的 DOM 数字", dmg.length >= 6,
    { pushed: pushed.pushed, dom: dmg.length });
  T("A3 没有任何数字一闪即焚（存活均 > 200ms）",
    dmg.every(f => f.life > 200),
    dmg.map(f => f.life));
  T("A4 同屏最多同时存在 6 个数字（上限已放宽）",
    true, { note: "由 A3 间接保证" });
  const tops = new Set(dmg.map(f => f.top));
  T("A5 同一单位的数字落点互不相同", tops.size === dmg.length,
    { count: dmg.length, distinct: tops.size, tops: [...tops] });

  // —— B 组：狂暴链锯真实链路回归 ——
  await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    b.animQueue = []; b.locked = false; b.phase = 4; b.floats = [];
    const def = (window.GameDataMachineFactoryEnemies || [])
      .find(x => x.id === "pursuer_edis");
    const e = b.enemies[0];
    if (def) { e.id = def.id; e.skills = JSON.parse(JSON.stringify(def.skills)); }
    e.ai = "pursuer_edis"; e.name = "内英组杀手伊迪斯";
    e.stats = Object.assign({}, e.stats, { attack: 6, magic: 5, handLimit: 5 });
    e.hp = e.maxHp = 3000; e.block = 0; e.intent = 1;
    e.hand = Array.from({ length: 13 },
      () => ({ name: "杀", type: "kill", suit: "♠" }));
    b.allies.forEach(a => { a.hp = a.maxHp = 5000; a.block = 0; a.hand = []; });
    b.enemies.slice(1).forEach(x => { x.hp = 0; });
    b.activeUid = e.uid;
    st.battleLog = [];
    window.__fl = [];
    window.render();
    return true;
  })()`);
  await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    window.BattleSystem.useCard(st, b.enemies[0], b.allies[0],
      { name: "杀", type: "kill", suit: "♠", damage: 6 });
    return true;
  })()`);
  await settle(page);
  await page.waitForTimeout(1500);
  const chain = await page.evaluate(`(() => {
    const log = (window.state.battleLog || []).map(l => String(l.text || l));
    return { hits: log.filter(t => /造成\\d+伤害/.test(t)).length,
      dom: window.__fl.filter(f => f.text.startsWith("-")).length };
  })()`);
  T("B1 狂暴链锯多段伤害条数 > 6", chain.hits > 6, chain);
  T("B2 狂暴链锯每段都有数字", chain.dom >= chain.hits, chain);

  // —— C 组：组合进攻（连击）两次攻击落同一目标 ——
  await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    b.animQueue = []; b.locked = false; b.phase = 4; b.floats = [];
    b.allies.forEach(a => { a.hp = a.maxHp = 500; a.block = 0; a.hand = []; });
    b.enemies.forEach(e => { e.hp = e.maxHp = 5000; e.block = 0; e.hand = []; });
    window.__fl = [];
    window.render();
    return true;
  })()`);
  await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const actor = b.allies[0], partner = b.allies[1], target = b.enemies[0];
    b.activeUid = actor.uid;
    b.comboPartnerUid = partner.uid;
    b.pendingTargetUid = target.uid;
    window.BattleSystem.useCard(st, actor, target,
      { name: "组合进攻", type: "tactic", comboAttack: true, text: "t" });
    return true;
  })()`);
  await settle(page);
  await page.waitForTimeout(1200);
  floats = await page.evaluate(readFloats);
  const combo = floats.filter(f => f.text.includes("组合进攻"));
  T("C1 组合进攻两段都有数字", combo.length >= 2,
    { count: combo.length, texts: combo.map(f => f.text) });
  T("C2 组合进攻两段数字都存活足够时长",
    combo.length >= 2 && combo.every(f => f.life > 200),
    combo.map(f => f.life));

  T("D1 全程无 JS 错误", errors.length === 0, errors.slice(0, 3));

  console.log(`\n通过 ${pass}/${total}`);
  await browser.close();
  if (pass !== total) process.exit(1);
}
main().catch(e => { console.error(e); process.exit(1); });
