// 安倍卡露娜【记忆泡泡】两项边界严格检查：
//   ① 装满 2 张（上限）后，再出牌是否还会「再次触发」（挂起 + 要求玩家决定）？
//      ——技能描述「最多存放3张牌」，满仓后不应再弹提示，否则每出一张都要点一次，体验极差。
//   ② 回合结束后，泡泡手牌区是否把「所有牌」一次性弃置进弃牌堆？
//      ——含"装满3张"与"只装1张"两种，且取回后又未打出的牌不应被误弃（它已不在区域内）。
//
// 两个判据都用「状态快照 + 日志」双证据，并各做反向验证，避免恒真/恒假。
//
// 分批：KARUNA_CAP=C（上限）、E（回合结束清空）、ALL（默认全跑）。
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const {
  openGame, startRegressionBattle, collectErrors, relevantErrors,
} = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const PART = (process.env.KARUNA_CAP || "ALL").toUpperCase();
const want = p => PART === "ALL" || PART === p;

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
};

const evalT = async (page, expr, ms = 15000, label = "evaluate") => {
  let timer;
  const guard = new Promise((_, rej) => {
    timer = setTimeout(() => rej(new Error(`${label} timeout ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([page.evaluate(expr), guard]);
  } catch (e) {
    console.log(`⚠️  ${label}: ${e.message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
};

// 手牌 6 张：前 2 张用于装满泡泡区，第 3 张起用于验证"满仓后是否再触发"，
// 第 5 张用于验证"取回后未打出"的牌不被误弃。
const setupTpl = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false; b.phase = 4;
  delete b.karunaBubble; delete b.thunderHammer;
  const u = b.allies[0];
  u.name = "安倍卡露娜"; u.ref = "abe_karuna"; u.id = "abe_karuna";
  u.gender = "female";
  u.stats = { attack: 2, magic: 4, speed: 3, maxHp: 50, bloodlust: 1, handLimit: 3 };
  u.hp = u.maxHp = 50; u.block = 0; u.intent = 3;
  u.skills = [{ name: "同频歌姬" }, { name: "记忆泡泡" }, { name: "幸运海螺" }];
  delete u.bubbleCards; delete u.karunaLastColor; delete u.karunaLastSuit;
  u.hand = [
    { name: "泡泡牌1", type: "tactic", suit: "♦", text: "" },
    { name: "泡泡牌2", type: "tactic", suit: "♥", text: "" },
    { name: "泡泡牌3", type: "tactic", suit: "♠", text: "" },
    { name: "满仓后牌", type: "tactic", suit: "♣", text: "" },
    { name: "取回未打出", type: "tactic", suit: "♦", text: "" },
  ];
  u.pileStats = u.pileStats || {};
  u.pileStats.discard = [];
  b.activeUid = u.uid;
  b.enemies.forEach(e => {
    e.hp = e.maxHp = 90; e.block = 0; e.statuses = [];
    e.hand = []; e.noResponse = true;
  });
  st.log = []; st.battleLog = [];
  window.render();
  return { foes: b.enemies.length, hand: u.hand.length, intent: u.intent };
})()`;

const snapTpl = `(() => {
  const st = window.state, b = st.battle, u = b.allies[0];
  return {
    hand: u.hand.map(c => c.name),
    bubble: (u.bubbleCards || []).map(c => c.name),
    bubbleLen: (u.bubbleCards || []).length,
    discard: (u.pileStats?.discard || u.discard || []).map(c => c.name),
    intent: u.intent,
    locked: !!b.locked,
    pending: !!b.karunaBubble,
    pendingName: b.karunaBubble?.card?.name || "",
    storeBtns: document.querySelectorAll("[data-karuna-bubble-store]").length,
    slots: document.querySelectorAll("[data-bubble-index]").length,
    logs: (st.battleLog || []).join(" | "),
  };
})()`;

const playTpl = name => `(() => {
  const st = window.state, b = st.battle, u = b.allies[0];
  const card = u.hand.find(c => c.name === ${JSON.stringify(name)});
  if (!card) return false;
  window.BattleSystem.useCard(st, u, b.enemies[0], card);
  return true;
})()`;

const playAndWait = async (page, name) => {
  await evalT(page, playTpl(name), 15000, `play:${name}`);
  await page.waitForTimeout(700);
  await evalT(page, "window.BattleEffects?.whenIdle?.()", 8000, `whenIdle:${name}`);
  await page.waitForTimeout(300);
  return evalT(page, snapTpl, 15000, `snap:${name}`);
};

const clickStore = async page => {
  await page.locator("[data-karuna-bubble-store]").click({ timeout: 5000 });
  await page.waitForTimeout(500);
  await evalT(page, "window.render()", 8000, "render");
  await page.waitForTimeout(200);
  return evalT(page, snapTpl, 15000, "snap:store");
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = collectErrors(page);
  await openGame(page);
  await startRegressionBattle(page);

  const setup = await evalT(page, setupTpl, 15000, "setup");
  T("前置：敌人 2 名", setup?.foes === 2, setup);
  T("前置：手牌 5 张", setup?.hand === 5, setup);

  // ── C 段：装满 2 张（上限）后是否还会触发 ──────────────────
  if (want("C")) {
    let s = await playAndWait(page, "泡泡牌1");
    T("C1 出第1张后挂起", s?.pending === true, s);
    s = await clickStore(page);
    T("C2 存入后 1 张", s?.bubbleLen === 1, s);

    s = await playAndWait(page, "泡泡牌2");
    T("C3 出第2张后挂起", s?.pending === true, s);
    s = await clickStore(page);
    T("C4 存入后 2 张", s?.bubbleLen === 2, s);

    // 上限由 3 张下调为 2 张：存满 2 张即达上限，不再有第 3 次存入。
    s = await playAndWait(page, "泡泡牌3");
    T("C5 存满 2 张后第 3 张不再挂起", s?.pending === false, s);
    T("C6 泡泡区仍为 2 张（上限 2）", s?.bubbleLen === 2, s);

    // 关键：满仓后再出一张牌。
    // 先清空日志——battleLog 自 setup 起一直累积，前 3 次存入的「可发动」
    // 会残留下来，不清空会让 C12 误判成"满仓后又触发了"。
    await evalT(page, "(() => { window.state.battleLog = []; return true; })()",
      8000, "clearLogC12");
    s = await playAndWait(page, "满仓后牌");
    T("C7 满仓后再出牌：不再挂起", s?.pending === false, s);
    T("C8 满仓后再出牌：战斗未锁定", s?.locked === false, s);
    T("C9 满仓后再出牌：无「放入」按钮", s?.storeBtns === 0, s);
    T("C10 满仓后再出牌：泡泡区仍 2 张（未超限）", s?.bubbleLen === 2, s);
    T("C11 满仓后再出牌：该牌进弃牌堆", (s?.discard || []).includes("满仓后牌"), s);
    T("C12 满仓后再出牌：日志无「可发动」", !/记忆泡泡可发动/.test(s?.logs || ""), s);

    // 反向验证支撑：确认满仓前确实会触发（否则 C7 的"不触发"可能只是场景走不到判定）。
    // 注意：本步会 splice 掉 1 张并留下一个 pending 挂起，必须原样复原，
    // 否则 E 段接在后面跑时 afterCardPlayed 会因 battle.locked 直接 return，装不满 2 张。
    const c13 = await evalT(page, `(() => {
      const st = window.state, b = st.battle, u = b.allies[0];
      const backup = (u.bubbleCards || []).slice();
      (u.bubbleCards || []).splice(0, 1);   // 清空到 1 张
      st.battleLog = [];
      const c = { name: "临时验证牌", type: "tactic", suit: "♥", text: "" };
      window.AbeKarunaBubbleSkills.afterCardPlayed(st, u, c);
      const logs = (st.battleLog || []).join(" | ");
      // 复原：待处理挂起清掉、锁定解除、泡泡区恢复 2 张
      b.karunaBubble = null; b.locked = false;
      u.bubbleCards = backup;
      window.render();
      return logs;
    })()`, 15000, "snapC13") || "";
    T("C13 对照：未满仓时确实会触发", /记忆泡泡可发动/.test(c13), {});
    const c13back = await evalT(page, snapTpl, 15000, "snapC13back");
    T("C14 对照后复原：泡泡区仍 2 张且未挂起",
      c13back?.bubbleLen === 2 && c13back?.pending === false, c13back);
  }

  // ── E 段：回合结束清空全部 ────────────────────────────────
  if (want("E")) {
    // 自带准备：清空泡泡区并重置手牌，再逐个打出放入，确保满 2 张（上限 2）。
    // 此前依赖 C 段残留，单独跑 E 段时装不满，E1 之后全红。
    await evalT(page, `(() => {
      const st = window.state, b = st.battle, u = b.allies[0];
      b.animQueue = []; b.locked = false; b.phase = 4;
      delete b.karunaBubble; b.selectedCardIndex = -1;
      delete b.selectedSkillCard; delete b.pendingTargetUid;
      u.bubbleCards = [];
      u.hand = [
        { name: "泡泡牌1", type: "tactic", suit: "♦", text: "", targetless: true },
        { name: "泡泡牌2", type: "tactic", suit: "♥", text: "", targetless: true },
        { name: "泡泡牌3", type: "tactic", suit: "♠", text: "", targetless: true },
      ];
      u.intent = 1;
      window.render(); return true;
    })()`, 8000, "resetE");
    for (const n of ["泡泡牌1", "泡泡牌2"]) {
      await playAndWait(page, n);
      await clickStore(page);
    }
    let s = await evalT(page, snapTpl, 15000, "snapE0b");
    T("E1 回合结束前泡泡区 2 张（上限 2）", s?.bubbleLen === 2, s);
    const before = (s?.discard || []).length;

    // 选中一张但不打出：牌仍在区内（就地使用，不进手牌），
    // 回合结束应随区弃置——此前「取回」会把手牌化，反而绕开清空。
    await evalT(page, `(() => {
      const b = window.state.battle;
      b.phase = 4; b.locked = false;
      window.AbeKarunaBubbleSkills.select(window.state, 0);
      window.render();
      return true;
    })()`, 15000, "selectE");
    let s2 = await evalT(page, snapTpl, 15000, "snapE2");
    T("E2 选中后泡泡区仍是 2 张（不进手牌）", s2?.bubbleLen === 2, s2);
    T("E3 选中的牌未进入手牌", !(s2?.hand || []).includes("泡泡牌1"), s2);

    // 触发回合结束
    await evalT(page, `(() => {
      const st = window.state, b = st.battle, u = b.allies[0];
      window.AbeKarunaBubbleSkills.endTurn(st, u);
      window.render();
      return true;
    })()`, 15000, "endTurnE");
    await page.waitForTimeout(400);
    let s3 = await evalT(page, snapTpl, 15000, "snapE4");
    T("E4 回合结束后泡泡区清空", s3?.bubbleLen === 0, s3);
    T("E5 2 张全部进弃牌堆",
      ["泡泡牌1", "泡泡牌2"].every(n => (s3?.discard || []).includes(n)), s3);
    T("E6 选中未打出的牌随区弃置（符合描述）",
      !(s3?.hand || []).includes("泡泡牌1")
      && (s3?.discard || []).includes("泡泡牌1"), s3);
    const after = (s3?.discard || []).length;
    T("E7 弃牌堆净增 2 张（上限 2）", after - before === 2, { before, after });
    const marks = await evalT(page, `(() => {
      const u = window.state.battle.allies[0];
      const pile = u.pileStats?.discard || u.discard || [];
      return pile.filter(c => ["泡泡牌1", "泡泡牌2", "泡泡牌3"].includes(c.name))
        .map(c => ({ n: c.name, free: !!c._bubbleFree, cast: !!c._bubbleCast }));
    })()`, 15000, "marksE");
    T("E7b 弃置时清掉泡泡标记（免杀意不残留到弃牌堆）",
      (marks || []).length > 0 && marks.every(m => !m.free && !m.cast), marks);
    T("E8 日志写明进入弃牌堆", /进入弃牌堆/.test(s3?.logs || ""), s3);
    T("E9 界面槽位数归零", s3?.slots === 0, s3);
  }

  // ── 截图：泡泡区有牌时的样子 ──────────────────────────────
  const shot = "/data/workspace/karuna_bubble_zone.png";
  await evalT(page, `(() => {
    const st = window.state, b = st.battle, u = b.allies[0];
    b.animQueue = []; b.locked = false; b.phase = 4;
    u.bubbleCards = [
      { name: "泡泡牌1", type: "tactic", suit: "♦", text: "" },
      { name: "泡泡牌2", type: "tactic", suit: "♥", text: "" },
      { name: "泡泡杀", type: "kill", suit: "♦", text: "" },
    ];
    window.render();
    return true;
  })()`, 15000, "shotSetup");
  await page.waitForTimeout(600);
  const zone = page.locator(".karuna-bubble-zone");
  const box = await zone.boundingBox();
  console.log(`泡泡区 box = ${JSON.stringify(box)}`);
  if (box) {
    await page.screenshot({
      path: shot,
      clip: {
        x: Math.max(0, box.x - 20), y: Math.max(0, box.y - 20),
        width: Math.min(1600 - Math.max(0, box.x - 20), box.width + 40),
        height: Math.min(1000 - Math.max(0, box.y - 20), box.height + 40),
      },
    });
    console.log(`截图已存: ${shot}`);
  }
  // 顺带一张整屏，方便看泡泡区在战斗界面中的位置
  await page.screenshot({ path: "/data/workspace/karuna_bubble_full.png" });
  console.log("整屏截图已存: /data/workspace/karuna_bubble_full.png");

  const real = relevantErrors(errors);
  T("全程无 JS 错误", real.length === 0, real.slice(0, 3));

  await browser.close();
  console.log(`\n通过 ${pass}/${total}`);
  process.exit(pass === total ? 0 : 1);
})();
