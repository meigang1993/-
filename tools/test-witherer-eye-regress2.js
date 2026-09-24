// 外神之眼 复现专项（39 版报的两个场景）
//   1) 芙萝娅【神速之袭】的虚拟【刺杀】——由 CardUtils.fromEntity 生成，
//      带 virtual:true 且额外挂 _entitySourceCard，曾因「_entitySourceCard 例外」
//      被误判成实体牌而触发外神之眼。
//   2) 贝丝妲魔偶【锁魂镰刀】连锁 —— 实体单体杀命中凋零者时，外神之眼与
//      锁魂镰刀同时触发，需确认不会互相激发出无限循环。
// 检测：挂钩 BattleLines.skill 同步计数（不依赖动画播完，避免假通过）；
// 每例校验掉血，掉血为 0 判无效。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  const ok = !!cond;
  if (ok) pass++;
  console.log(`${ok ? "✅" : "❌"} ${name}` + (ok ? "" : `  ← ${JSON.stringify(extra || {})}`));
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await openGame(page);
  await startRegressionBattle(page);

  await page.evaluate(`(() => {
    const b = window.state.battle, w = b.enemies[0];
    w.ai = "ruins_witherer"; w.name = "XX型凋零者1312号"; w.gender = "female";
    b.enemies.length = 1;
    window.__eyeCount = 0; window.__logs = [];
    if (!window.__origLogAdd) {
      window.__origLogAdd = window.BattleLog.add;
      window.BattleLog.add = function (...args) {
        try { window.__logs.push(String(args[1] ?? args[0])); } catch (e) {}
        return window.__origLogAdd.apply(this, args);
      };
    }
    if (!window.__origLines) {
      window.__origLines = window.BattleLines.skill;
      window.BattleLines.skill = function (state, unit, name, ...rest) {
        try { if (name === "外神之眼") window.__eyeCount++; } catch (e) {}
        return window.__origLines.call(this, state, unit, name, ...rest);
      };
    }
    return true;
  })()`);

  const reset = `(() => {
    const st = window.state, b = st.battle, w = b.enemies[0];
    w.hp = 900; w.hand = [];
    b.allies.forEach(a => { a.hp = 900; a.hand = []; a.intent = 9; });
    b.allies.slice(2).forEach(a => { a.hp = 0; });
    b.locked = false; b.activeUid = b.allies[0].uid; b.phase = 4;
    b.animQueue = [];
    window.__eyeCount = 0; window.__logs = []; st.log = [];
    window.__hpBefore = w.hp;
    return true;
  })()`;

  console.log("=== 场景1：芙萝娅【神速之袭】虚拟【刺杀】 ===");
  // 完全按 flora-speed-assault.js 的写法造牌：fromEntity("刺杀", { _entitySourceCard })
  await page.evaluate(reset);
  const speedAssault = await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const a0 = b.allies[0], w = b.enemies[0];
    const sourceCard = { name: "杀（普攻）", type: "slash", suit: "♠" };
    const assaultCard = window.CardUtils.fromEntity("刺杀", {
      _entitySourceCard: sourceCard, _speedAssaultSettlement: {} });
    window.__cardProbe = {
      virtual: !!assaultCard.virtual,
      hasEntitySource: !!assaultCard._entitySourceCard,
      type: assaultCard.type, name: assaultCard.name };
    window.BattleSystem.damage(st, w, 5, "神速之袭", a0, assaultCard);
    return true;
  })()`);
  await page.waitForTimeout(1500);
  let r = await page.evaluate(`(() => ({
    probe: window.__cardProbe, eye: window.__eyeCount,
    before: window.__hpBefore, now: window.state.battle.enemies[0].hp,
    logs: window.__logs.slice() }))()`);
  let loss = r.before - r.now;
  T(`虚拟【刺杀】卡片标记正确（virtual=${r.probe.virtual},带_entitySource=${r.probe.hasEntitySource}）`,
    r.probe.virtual === true && r.probe.hasEntitySource === true, r.probe);
  T(`神速之袭虚拟【刺杀】不触发外神之眼（掉血${loss}）`,
    loss > 0 && r.eye === 0, { fired: r.eye, loss, logs: r.logs.slice(0, 4) });

  console.log("\n=== 场景2：贝丝妲魔偶【锁魂镰刀】连锁 ===");
  await page.evaluate(reset);
  await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const a0 = b.allies[0], w = b.enemies[0];
    a0.ref = "besta_doll"; a0.name = "贝丝妲魔偶";
    a0.skills = [{ name: "锁魂镰刀", type: "passive" }];
    a0.stats = Object.assign({}, a0.stats, { magic: 3, attack: 5 });
    a0.mana = 3;
    const slash = { name: "杀（普攻）", type: "slash", suit: "♠", power: 0, scale: "attack" };
    window.BattleSystem.damage(st, w, 5, "杀（普攻）", a0, slash);
    return true;
  })()`);
  await page.waitForTimeout(2500);
  r = await page.evaluate(`(() => ({
    eye: window.__eyeCount, before: window.__hpBefore,
    now: window.state.battle.enemies[0].hp,
    allies: window.state.battle.allies.filter(a => a.hp > 0).map(a => a.hp),
    logs: window.__logs.slice() }))()`);
  loss = r.before - r.now;
  T(`实体单体杀命中凋零者仍触发外神之眼（掉血${loss}）`,
    loss > 0 && r.eye >= 1, { fired: r.eye, loss, logs: r.logs.slice(0, 5) });
  T(`锁魂镰刀连锁不导致外神之眼无限触发（次数=${r.eye}，应<=2）`,
    r.eye <= 2, { fired: r.eye, logs: r.logs.slice(0, 8) });

  console.log("\n=== 对照：锁魂镰刀确实由实体杀触发 ===");
  await page.evaluate(reset);
  await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const a0 = b.allies[0], w = b.enemies[0];
    a0.skills = [{ name: "锁魂镰刀", type: "passive" }];
    a0.stats = Object.assign({}, a0.stats, { magic: 3, attack: 5 });
    const slash = { name: "杀（普攻）", type: "slash", suit: "♠", power: 0, scale: "attack" };
    window.BattleSystem.damage(st, w, 5, "杀（普攻）", a0, slash);
    return true;
  })()`);
  await page.waitForTimeout(2000);
  r = await page.evaluate(`(() => ({ logs: window.__logs.slice(),
    eye: window.__eyeCount }))()`);
  T(`锁魂镰刀已触发（日志含锁魂镰刀）`,
    r.logs.some(t => t.includes("锁魂镰刀")), { logs: r.logs.slice(0, 6) });

  T("页面无 JS 错误", errors.length === 0, errors.slice(0, 3));

  console.log(`\n结果 ${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})().catch(e => { console.error("脚本异常", e); process.exit(1); });
