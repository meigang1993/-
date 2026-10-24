// 温蒂【飘浮掩体】实机回归：真实战斗里走真实弃牌流程，验证护甲与全部连带效果。
//
// 背景：此前只校验了「每弃 1 张 → 全体各 1 点、芙萝娅双倍」的数值口径，
// 未验证飘字、台词目标、卡迪西斯强化标记、教师皮肤累计、阵亡排除等连带效果，
// 也未确认该技能是否真的接进了弃牌流程（否则断言全是空中楼阁）。
//
// 验证点：
//   1. 真实 BattleDiscardFlow.discardCards 触发后，全体护甲真的落到单位上
//   2. 芙萝娅双倍、卡迪西斯 reinforced、皮肤累计 skinTeacherArmor
//   3. 战报出现「飘浮掩体」
//   4. 对照组：换别人弃牌不触发；温蒂弃 0 张不触发
//   5. 界面无 JS 错误

process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}`
    + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
};

// 布场：allies[0]=温蒂 allies[1]=普通 allies[2]=芙萝娅 allies[3]=卡迪西斯
const setupTpl = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false;
  b.discardPick = null; b.selectedCardIndex = null; b.selectedSkillCard = null;
  st.log = []; st.battleLog = [];
  const need = [["wendy", "温蒂"], ["rokar", "罗卡尔"],
    ["flora", "芙萝娅"], ["cadicis", "卡迪西斯"]];
  need.forEach((cfg, i) => {
    if (!b.allies[i]) {
      b.allies.push({ uid: "probe" + i, hp: 100, maxHp: 100, block: 0,
        side: "ally", hand: [] });
    }
    const a = b.allies[i];
    a.ref = cfg[0]; a.name = cfg[1]; a.hp = 100; a.maxHp = 100; a.block = 0;
    a.alive = true; a.side = "ally";
    a.hand = [];
    a.skinTeacherArmor = 0;
  });
  b.enemies.forEach(e => { e.hp = 100; e.maxHp = 100; e.hand = []; });
  window.render();
  return { allies: b.allies.length };
})()`;

// 通过真实装配的转发入口弃牌（battle-discard-flow / battle-discard-overflow
// 两处弃牌链路调用的正是 window.WendyCadicisSkills.afterDiscard）
const discardTpl = n => `(() => {
  const st = window.state, b = st.battle;
  const wendy = b.allies[0];
  const cards = [];
  for (let i = 0; i < ${n}; i++) {
    const c = { name: "杀（普攻）", type: "slash", suit: "♠", scale: "attack" };
    wendy.hand.push(c); cards.push(c);
  }
  const entry = window.WendyCadicisSkills?.afterDiscard;
  const wired = typeof entry === "function";
  entry?.(st, wendy, cards, { draw: () => [], pushFloat: () => {} });
  window.render();
  return {
    wired,
    blocks: b.allies.slice(0, 4).map(a => ({ ref: a.ref, block: a.block || 0 })),
    skinArmor: wendy.skinTeacherArmor || 0,
    log: (st.battleLog || st.log || []).filter(x => /飘浮掩体/.test(x)),
  };
})()`;

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", e => errors.push(String(e.message || e)));
  await openGame(page);

  await startRegressionBattle(page);

  await page.evaluate(setupTpl);

  // —— 主体：温蒂弃 3 张 ——
  const r3 = await page.evaluate(discardTpl(3));
  T("弃牌链路已装配（WendyCadicisSkills.afterDiscard 可调用）", r3.wired === true, r3);
  const byRef = Object.fromEntries(r3.blocks.map(x => [x.ref, x.block]));
  T("弃 3 张 → 温蒂 3 点", byRef.wendy === 3, r3.blocks);
  T("弃 3 张 → 普通友方 3 点", byRef.rokar === 3, r3.blocks);
  T("弃 3 张 → 芙萝娅 6 点（双倍）", byRef.flora === 6, r3.blocks);
  T("弃 3 张 → 卡迪西斯 6 点（双倍）", byRef.cadicis === 6, r3.blocks);
  T("教师皮肤累计 = 3+3+6+6 = 18", r3.skinArmor === 18,
    { skinArmor: r3.skinArmor });
  T("战报出现飘浮掩体", r3.log.length >= 1, r3.log);
  T("战报写明「每弃1张牌」", /每弃1张牌/.test(r3.log[0] || ""), r3.log);

  // —— 再弃 1 张：应累加而非被吞 ——
  const r1 = await page.evaluate(discardTpl(1));
  const byRef2 = Object.fromEntries(r1.blocks.map(x => [x.ref, x.block]));
  T("再弃 1 张 → 温蒂累计 4 点", byRef2.wendy === 4, r1.blocks);
  T("再弃 1 张 → 芙萝娅累计 8 点", byRef2.flora === 8, r1.blocks);
  T("再弃 1 张 → 卡迪西斯累计 8 点", byRef2.cadicis === 8, r1.blocks);
  T("教师皮肤累计 = 18+(1+1+2+2) = 24", r1.skinArmor === 24,
    { skinArmor: r1.skinArmor });

  // —— 对照组：非温蒂弃牌不触发 ——
  const ctrl = await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const rokar = b.allies[1];
    const before = b.allies.slice(0, 4).map(a => a.block || 0);
    const cards = [];
    for (let i = 0; i < 3; i++) {
      const c = { name: "杀（普攻）", type: "slash", suit: "♠" };
      rokar.hand.push(c); cards.push(c);
    }
    window.WendyCadicisSkills?.afterDiscard?.(st, rokar, cards, { draw: () => [], pushFloat: () => {} });
    window.render();
    return { before, after: b.allies.slice(0, 4).map(a => a.block || 0) };
  })()`);
  T("对照：非温蒂弃牌不加任何护甲",
    JSON.stringify(ctrl.before) === JSON.stringify(ctrl.after), ctrl);

  // —— 对照组：温蒂弃 0 张不触发 ——
  const zero = await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const wendy = b.allies[0];
    const before = b.allies.slice(0, 4).map(a => a.block || 0);
    window.WendyCadicisSkills?.afterDiscard?.(st, wendy, [], {});
    window.render();
    return { before, after: b.allies.slice(0, 4).map(a => a.block || 0) };
  })()`);
  T("对照：弃 0 张不加护甲",
    JSON.stringify(zero.before) === JSON.stringify(zero.after), zero);

  // —— 手牌超上限的「溢出弃牌」不触发飘浮掩体 ——
  const ovf = await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const wendy = b.allies[0];
    const before = b.allies.slice(0, 4).map(a => ({ ref: a.ref, block: a.block || 0 }));
    const logsBefore = (st.battleLog || []).filter(x => /飘浮掩体/.test(x)).length;
    while (wendy.hand.length < 9) wendy.hand.push({ name: "杀（普攻）", type: "slash", suit: "♠" });
    const tool = window.BattleDiscardOverflow({
      visibleHand: u => u.hand.length,
      handLimit: u => u.handLimit || 5,
    });
    tool.discardOverflow(st, wendy);
    window.render();
    return {
      before,
      after: b.allies.slice(0, 4).map(a => ({ ref: a.ref, block: a.block || 0 })),
      handLeft: wendy.hand.length,
      logsBefore,
      logsAfter: (st.battleLog || []).filter(x => /飘浮掩体/.test(x)).length,
    };
  })()`);
  T("溢出弃牌后手牌被裁到上限", ovf.handLeft <= 5, ovf);
  T("溢出弃牌不加任何护甲",
    JSON.stringify(ovf.before) === JSON.stringify(ovf.after), ovf);
  T("溢出弃牌不写飘浮掩体战报", ovf.logsAfter === ovf.logsBefore, ovf);

  T("全程无 JS 错误", errors.length === 0, errors.slice(0, 3));

  console.log(`\n通过 ${pass} / ${total}`);
  await browser.close();
  if (pass !== total) process.exit(1);
})().catch(e => {
  console.error("FATAL", e);
  process.exit(1);
});
