// 鲨影鱼雷（狂鲨海盗团潜水艇）触发口径严格检查
// 背景：原判据为 black(card) && isSlash(card)，群体黑色【杀】也会触发全体溅射，
// 与「单体黑色【杀】」的技能描述不符。本测试逐个验证：
//   A 单体黑色杀 → 触发（不可响应 + 全体溅射）
//   B 群体黑色杀 → 不触发
//   C 单体红色杀 → 不触发
//   D 虚拟/非杀实体牌 → 不触发
//   E AI 选牌优先单体黑色杀
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const {
  openGame, startRegressionBattle, collectErrors, relevantErrors,
} = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const setupTpl = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false; b.phase = 4;
  // 我方 3 名存活角色，用于观察溅射
  b.allies.forEach((u, i) => {
    u.name = "我方" + i; u.hp = u.maxHp = 200; u.block = 0; u.noResponse = true;
    u.hand = [];
  });
  b.allies.slice(1).forEach(u => { u.hp = u.maxHp = 200; });
  const foe = b.enemies[0];
  foe.name = "狂鲨海盗团潜水艇";
  foe.ai = "shark_pirate_submarine";
  foe.hp = foe.maxHp = 300;
  foe.stats = Object.assign({}, foe.stats, { attack: 7, magic: 6, speed: 9, maxHp: 300 });
  foe.intent = 9; foe.hand = [];
  b.enemies.slice(1).forEach(e => { e.hp = 0; e.hand = []; });
  b.activeUid = foe.uid;
  st.log = []; st.battleLog = [];
  window.render();
  return { foeUid: foe.uid, allies: b.allies.length };
})()`;

// 打出一张牌，返回日志与溅射是否发生
const playFn = (cardSpec) => {
  const st = window.state, b = st.battle;
  const foe = b.enemies[0], ally = b.allies[0];
  b.animQueue = [];
  st.log = []; st.battleLog = [];
  const card = Object.assign({ id: "test_" + cardSpec.name, type: "slash", scale: "attack" }, cardSpec);
  foe.hand = [card];
  foe.intent = 9;
  try { window.BattleSystem.useCard(st, foe, ally, card); } catch (e) { window.__err = String(e && e.message); }
  const log = (st.log || []).join("\\n") + "\\n" + (st.battleLog || []).join("\\n");
  return {
    splash: log.includes("鲨影鱼雷扩散"),
    // 守卫：确认牌确实打出去了，否则「不触发」可能只是牌没打出造成的空转
    used: log.includes("使用"),
    torpedoFlag: !!card.sharkTorpedo,
    ignoreResponse: !!card.ignoreResponse,
    log: (st.log || []).concat(st.battleLog || []).slice(-6),
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

  const cases = [
    ["A 单体黑色杀 ♠", { name: "杀", suit: "♠" }, true],
    ["A 单体黑色杀 ♣", { name: "杀", suit: "♣" }, true],
    ["B 群体黑色杀(sweep)", { name: "杀", suit: "♠", sweep: true }, false],
    ["B 群体黑色杀(allTargets)", { name: "杀", suit: "♣", allTargets: ["a0", "a1"] }, false],
    ["C 单体红色杀 ♥", { name: "杀", suit: "♥" }, false],
    ["C 单体红色杀 ♦", { name: "杀", suit: "♦" }, false],
    // 虚拟杀牌：CardUtils.isKillCard 认 type==="slash"（不看 virtual），
    // 改动前（black && isSlash）与改动后（black && singleSlash）都会触发，属既有行为。
    // 溅射自身产生的牌带 _torpedoSplash，不会递归。
    ["D 虚拟黑色杀", { name: "杀", suit: "♠", virtual: true }, true],
    ["D 黑色战术牌", { name: "拆解", suit: "♠", type: "tactic" }, false],
  ];

  let pass = 0, fail = 0;
  for (const [label, spec, expect] of cases) {
    const r = await page.evaluate(playFn, spec);
    await page.waitForTimeout(150);
    const ok = r.splash === expect && r.used;
    if (ok) pass += 1; else fail += 1;
    console.log(`${ok ? "✅" : "❌"} ${label.padEnd(22)} 期望触发=${expect} 实测溅射=${r.splash} 已打出=${r.used} 标记=${r.torpedoFlag}${r.err ? " ERR:" + r.err : ""}`);
    if (!ok) console.log("     日志:", JSON.stringify(r.log));
  }

  // E AI 选牌优先单体黑色杀
  const ai = await page.evaluate(`(() => {
    const b = window.state.battle, foe = b.enemies[0];
    foe.ai = "shark_pirate_submarine";
    const hand = [
      { name: "杀", suit: "♥", type: "slash", scale: "attack" },
      { name: "杀", suit: "♠", type: "slash", scale: "attack", sweep: true },
      { name: "杀", suit: "♠", type: "slash", scale: "attack" },
    ];
    const picked = window.BattleAISlashPlanner?.bestSlash?.(foe, hand, b.allies[0]);
    return { picked: picked ? picked.name + picked.suit + (picked.sweep ? "(群体)" : "(单体)") : null };
  })()`);
  const aiOk = ai.picked && ai.picked.includes("♠") && ai.picked.includes("单体");
  if (aiOk) pass += 1; else fail += 1;
  console.log(`${aiOk ? "✅" : "❌"} E AI 优先单体黑色杀   实测=${ai.picked}`);

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  console.log("errors:", relevantErrors(errList).length);
  await browser.close();
  if (fail) process.exit(1);
})().catch(e => { console.error("FATAL", e && e.message); process.exit(1); });
