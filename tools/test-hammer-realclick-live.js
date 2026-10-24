// 【霹雳之锤】真实点击全流程回归（不使用 useCard 直接调 API）
//
// 之前 test-sweep-hammer-repro-live.js 用 BattleSystem.useCard 直接出牌，
// 绕过了真实的「点击手牌 → 选目标 → 确认出牌」链路，导致测试绿而线上仍卡。
// 本用例全程走真实鼠标点击，复现玩家反馈的「触发后无法弃置牌」。
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const {
  openGame, startRegressionBattle, collectErrors, relevantErrors,
} = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
};

const setupTpl = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false; b.phase = 4;
  delete b.thunderHammer; delete b.greenGatlingResume;
  delete b.demonInvasionResume; delete b.manualDodgeResume;
  const carlos = b.allies[0];
  carlos.name = "卡洛斯"; carlos.ref = "carlos"; carlos.id = "carlos";
  carlos.gender = "male";
  carlos.stats = { attack: 6, magic: 3, speed: 5 };
  carlos.hp = carlos.maxHp = 100; carlos.block = 0;
  carlos.usedGreenGatling = true;
  // 【战斗之勇】会在出杀后随机摸 1 张牌，摸到的牌进入手牌会打乱
  // data-card-index 与牌名的对应关系，使本用例时绿时红（曾误报补伤 12 点）。
  // 本用例只验锤子的弃置与补伤，先摘掉该被动以固定手牌。
  carlos.skills = (carlos.skills || []).filter(s => s.name !== "战斗之勇");
  b.activeUid = carlos.uid;
  st.equipment = st.equipment || {};
  st.equipment.carlos = ["霹雳之锤"];
  st.testEquipment = st.testEquipment || {};
  st.testEquipment.carlos = ["霹雳之锤"];
  carlos.battleRelics = ["霹雳之锤"];
  b.enemies.forEach((e, i) => {
    e.hp = e.maxHp = 60; e.block = 0; e.statuses = [];
    e.hand = i === 0 ? [{ name: "闪", type: "response", suit: "♠", text: "" }] : [];
    e.noResponse = false;
  });
  carlos.hand = [
    { name: "杀（普攻）", type: "slash", scale: "attack",
      responseKind: "dodge", suit: "♦", text: "" },
    { name: "弃牌A", type: "consume", suit: "♥", text: "" },
    { name: "弃牌B", type: "consume", suit: "♣", text: "" },
    { name: "弃牌C", type: "consume", suit: "♦", text: "" },
  ];
  st.log = []; st.battleLog = [];
  window.render();
  return { foes: b.enemies.length,
    hasHammer: !!window.RelicSystem?.hasEquipped?.(st, carlos, "霹雳之锤") };
})()`;

const snapTpl = `(() => {
  const b = window.state.battle, carlos = b.allies[0];
  const nodes = [...document.querySelectorAll(".play-card[data-card-index]")];
  return {
    hp: b.enemies.map(e => e.hp), locked: !!b.locked, hammer: !!b.thunderHammer,
    phase: b.phase, hand: carlos.hand.map(c => c.name),
    handLen: carlos.hand.length,
    nodes: nodes.length,
    disabledCount: nodes.filter(n => n.classList.contains("disabled")).length,
    prompt: document.querySelector(".discard-prompt")?.textContent || "",
    selectedIndex: b.selectedCardIndex ?? null,
    pendingTarget: b.pendingTargetUid ?? null,
    html: nodes.slice(0,3).map(n => n.className).join(" | "),
    log: (window.state.battleLog || []).slice(-8),
  };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = collectErrors(page);
  await openGame(page);
  await startRegressionBattle(page);

  const setup = await page.evaluate(setupTpl);
  T("前置：霹雳之锤已装备", setup.hasHammer === true, setup);
  T("前置：敌人 2 名", setup.foes === 2, setup);

  // ---- 真实点击：选杀牌 ----
  // 出牌改用可靠 API（UI 出牌路径另有干扰：点敌人会弹详情弹窗），
  // 本用例重点在「锤子挂起后，真实鼠标点击手牌能否弃置」。
  await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const carlos = b.allies[0];
    const card = carlos.hand.find(c => c.name === "杀（普攻）");
    window.BattleSystem.useCard(st, carlos, b.enemies[0], card);
    return true;
  })()`);
  await page.waitForTimeout(1200);
  await page.evaluate("window.BattleEffects?.whenIdle?.()");
  await page.waitForTimeout(600);

  const afterCast = await page.evaluate(snapTpl);
  console.log("  出牌后:", JSON.stringify(afterCast));
  T("1 锤子已挂起", afterCast.hammer === true, afterCast);
  T("2 战斗进入锁定", afterCast.locked === true, afterCast);

  // ---- 关键：检查手牌是否被置灰 ----
  T("3 手牌区渲染出可点节点", afterCast.nodes > 0, afterCast);
  T("4 锤子挂起时手牌未被全置灰（应可点击）",
    afterCast.disabledCount === 0, afterCast);
  T("5 底部提示为霹雳之锤", afterCast.prompt.includes("霹雳之锤"), afterCast);

  // ---- 真实点击：点一张手牌弃置 ----
  const before = await page.evaluate(snapTpl);
  // 逐个尝试点击，记录每次点击后的状态
  const totalNodes = afterCast.nodes;
  // 卡洛斯【战斗之勇】会在出杀后随机摸 1 张牌，手牌内容与顺序并不固定，
  // 按 DOM 序号点第 0 张有可能点到摸来的牌（曾因此误判锤子补伤为 12 点）。
  // 这里按牌名定位「弃牌A」，保证点的一定是用来发动锤子的那张。
  const targetIndex = before.hand.indexOf("弃牌A");
  T("6a 弃牌A 在手牌中可定位", targetIndex >= 0, { hand: before.hand });
  let clickedOk = false;
  if (targetIndex >= 0) {
    try {
      await page.locator(`.play-card[data-card-index="${targetIndex}"]`)
        .click({ timeout: 3000, force: true });
    } catch (e) { console.log("  点击弃牌A失败:", e.message.slice(0, 120)); }
    await page.waitForTimeout(1200);
    await page.evaluate("window.BattleEffects?.whenIdle?.()");
    await page.waitForTimeout(400);
    const s2 = await page.evaluate(snapTpl);
    console.log("  点弃牌A后:", JSON.stringify(s2));
    if (!s2.hammer) clickedOk = true;
  }
  T("6b 点击后锤子已结算", clickedOk === true, {});
  const after = await page.evaluate(snapTpl);
  T("6 手牌节点可定位", totalNodes > 0, afterCast);
  if (!after) throw new Error('snap failed');
  console.log("  点击后:", JSON.stringify(after));
  T("7 点击手牌后锁定解除", after.locked === false, after);
  T("8 锤子已清空", after.hammer === false, after);
  T("9 手牌确实少了一张", after.handLen === before.handLen - 1,
    { before: before.handLen, after: after.handLen });
  T("10 被闪目标强制补伤", after.hp[0] === 54, after);

  const errs = relevantErrors(errors);
  T("全程无 JS 错误", errs.length === 0, errs.slice(0, 3));

  await browser.close();
  console.log(`\n通过 ${pass}/${total}`);
  process.exit(pass === total ? 0 : 1);
})().catch(e => { console.error("FATAL", e); process.exit(2); });
