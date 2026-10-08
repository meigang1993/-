// 专项：多角色「摸牌 / 弃牌」必须收敛成**一条**组动画（引擎层自动打包）
//
// 背景：draw() / put() 每完成一次都会自动调一次打包器（battle-session /
// battle-cards-system）。若打包器只认队尾连续的 drawBatch，那么「4 人逐人
// 摸牌」会被两两合并成 [G(a0,a1), G(a2,a3)] 两个组——动画仍要串行播两段，
// 人越多越慢。打包器必须把队尾已有的 group **展开**后卷进新组，才能收敛成
// 一条、只播一段。
//
// 价值前提：技能与饰品**不写任何调用点**，全靠引擎自动收敛（4 人队才看得出
// 差别，2 人队在两种实现下都只有 1 组）。
//
// 判据（可证伪）：
//  · N 名角色逐人 draw 后，队列里恰好 1 条 drawGroup、batches == N、
//    残留 drawBatch == 0（不是 N 条、也不是 ceil(N/2) 个组）
//  · N 名角色逐人弃牌后，恰好 1 条 discardGroup、batches == N
//  · 合并不能吞掉实际效果：手牌确实增加 / 牌确实进弃牌堆
//
// 防假通过：
//  1) 前置断言构造成功（4 名友方在位、牌堆有牌），否则"摸 0 张"也算通过；
//  2) 同时统计组数与残留 batch 条数，确认是"合并了"而不是"没推事件"；
//  3) 反向验证：撤掉打包器的 group 展开分支后，F1/F5 应重新出现 2 个组。
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

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await startRegressionBattle(page);

  // ---------- F 4 名友方逐人 draw(2) ----------
  const F = await page.evaluate(`(async () => {
    const st = window.state, b = st.battle;
    // 补齐到 4 名存活友方（回归局默认可能只有 2 名）
    while ((b.allies || []).length < 4) {
      const src = b.allies[0];
      b.allies.push({
        uid: "a" + b.allies.length, name: "队友" + b.allies.length,
        side: "ally", hp: 30, maxHp: 30, hand: [], skills: [],
        pileStats: { deck: [], discard: [], consumed: [] },
      });
    }
    const allies = b.allies.slice(0, 4);
    allies.forEach((u, i) => {
      u.hp = Math.max(u.hp || 0, 1);
      u.pileStats = u.pileStats || {};
      u.pileStats.deck = [];
      for (let k = 0; k < 12; k++) u.pileStats.deck.push(
        window.CardUtils.fromEntity("杀（普攻）", { virtual: false }));
      // draw() 读的是 unit.deck（battle-session），而 pileStats 用 pileOf()
      // 取 pileStats——两者必须是同一数组，否则会从旧牌库 pop，摸到的不是
      // 我们构造的牌（甚至摸空）。补齐的队友尤其要有这一行。
      u.deck = u.pileStats.deck;
      u.hand = [];
      u.drawLockedThisTurn = false;
    });
    b.animQueue = []; b.locked = false;
    const draw = window.BattleSystem.draw || window.BattleSystem?.drawCards;
    if (typeof draw !== "function") return { skip: "draw 不可用" };
    // 逐人摸牌：这正是技能里最常见的写法（循环给每个队友补牌）
    allies.forEach(u => draw(u, 2, b));
    const q = b.animQueue || [];
    const groups = q.filter(e => e.type === "drawGroup");
    const batches = groups[0]?.batches || [];
    return {
      allies: allies.length,
      groups: groups.length,
      groupBatches: batches.length,
      drawBatch: q.filter(e => e.type === "drawBatch").length,
      hands: allies.map(u => (u.hand || []).length),
      kinds: q.map(e => e.type),
    };
  })()`);

  if (F.skip) {
    check("F0 前置：draw 可用", false, F.skip);
  } else {
    check("F0 前置：4 名友方已构造", F.allies === 4, `allies=${F.allies}`);
    check("F1 4 人逐人摸牌收敛为 1 条 drawGroup", F.groups === 1,
      `groups=${F.groups} kinds=[${F.kinds}]`);
    check("F2 drawGroup 内 4 条子批次", F.groupBatches === 4,
      `batches=${F.groupBatches}`);
    check("F3 队列无残留 drawBatch（未退化成多组/多条）", F.drawBatch === 0,
      `drawBatch=${F.drawBatch}`);
    check("F4 每人都摸到 2 张（合并未吞牌）",
      F.hands.length === 4 && F.hands.every(n => n === 2), `hands=[${F.hands}]`);
  }

  // ---------- G 4 名友方逐人弃牌 ----------
  const G = await page.evaluate(`(async () => {
    const st = window.state, b = st.battle;
    const allies = (b.allies || []).slice(0, 4);
    allies.forEach(u => {
      u.hand = [];
      for (let k = 0; k < 3; k++) u.hand.push(
        window.CardUtils.fromEntity("杀（普攻）", { virtual: false }));
      u.pileStats = u.pileStats || {};
      u.pileStats.discard = [];
    });
    b.animQueue = []; b.locked = false;
    const put = window.BattleCards?.put || window.BattleSystem?.put;
    if (typeof put !== "function") return { skip: "put 不可用" };
    // 逐人弃 1 张（put 的 pile 默认 discard）
    allies.forEach(u => put(b, u, u.hand[0], "discard"));
    const q = b.animQueue || [];
    const groups = q.filter(e => e.type === "discardGroup");
    const batches = groups[0]?.batches || [];
    return {
      groups: groups.length,
      groupBatches: batches.length,
      discardBatch: q.filter(e => e.type === "discardBatch").length,
      discards: allies.map(u => (u.pileStats?.discard || []).length),
      kinds: q.map(e => e.type),
    };
  })()`);

  if (G.skip) {
    check("G0 前置：put 可用", false, G.skip);
  } else {
    check("G1 4 人逐人弃牌收敛为 1 条 discardGroup", G.groups === 1,
      `groups=${G.groups} kinds=[${G.kinds}]`);
    check("G2 discardGroup 内 4 条子批次", G.groupBatches === 4,
      `batches=${G.groupBatches}`);
    check("G3 队列无残留 discardBatch", G.discardBatch === 0,
      `discardBatch=${G.discardBatch}`);
    check("G4 牌确实进弃牌堆（合并未吞牌）",
      G.discards.length === 4 && G.discards.every(n => n >= 1),
      `discards=[${G.discards}]`);
  }

  check("无页面错误", errors.length === 0, errors.slice(0, 2).join(" | "));
  await browser.close();
  console.log(`\n通过 ${pass} / 失败 ${fail}`);
  process.exit(fail ? 1 : 0);
})();
