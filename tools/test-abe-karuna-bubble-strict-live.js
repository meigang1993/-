// 安倍卡露娜【记忆泡泡】严格回归（重点：取回的【杀】是否真免杀意）。
//
// 背景：既有 test-abe-karuna-skills-live.js 的 B16 用「战术牌」验证"不消耗杀意"。
// 但 spendIntent() 只在攻击流程里对【杀】类牌扣减，战术牌根本不进该逻辑——
// 那条断言在 _bubbleFree 失效时依然会绿，属恒真断言，无法发现真 BUG。
// 本测试改用【杀】牌，并在 intent=0 的极端状态下验证"仍可打出且打出后仍为 0"，
// 这是玩家真正能感知的免杀意。
//
// 分批：KARUNA_BUB=P（免杀意）、M（上限3）、E（回合结束清空）、S（放弃/基本）。
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const {
  openGame, startRegressionBattle, collectErrors, relevantErrors,
} = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const PART = (process.env.KARUNA_BUB || "ALL").toUpperCase();
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

const setupTpl = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false; b.phase = 4;
  delete b.karunaBubble; delete b.thunderHammer;
  const u = b.allies[0];
  u.name = "安倍卡露娜"; u.ref = "abe_karuna"; u.id = "abe_karuna";
  u.gender = "female";
  u.stats = { attack: 2, magic: 4, speed: 3, maxHp: 50, bloodlust: 1, handLimit: 3 };
  u.hp = u.maxHp = 50; u.block = 0; u.intent = 1;
  u.skills = [{ name: "同频歌姬" }, { name: "记忆泡泡" }, { name: "幸运海螺" }];
  delete u.bubbleCards; delete u.karunaLastColor; delete u.karunaLastSuit;
  u.hand = [
    { name: "泡泡牌1", type: "tactic", suit: "♦", text: "" },
    { name: "泡泡牌2", type: "tactic", suit: "♥", text: "" },
    { name: "泡泡牌3", type: "tactic", suit: "♠", text: "" },
    { name: "泡泡牌4", type: "tactic", suit: "♣", text: "" },
    { name: "泡泡杀", type: "kill", suit: "♦", text: "" },
  ];
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

// 出牌 → 等动画 → 返回挂起状态（不自动跳过，交由各段决定 store / skip）。
const playAndWait = async (page, name) => {
  await evalT(page, playTpl(name), 15000, `play:${name}`);
  await page.waitForTimeout(700);
  await evalT(page, "window.BattleEffects?.whenIdle?.()", 8000, `whenIdle:${name}`);
  await page.waitForTimeout(300);
  return evalT(page, snapTpl, 15000, `snap:${name}`);
};

const clickBubbleBtn = async (page, which) => {
  const sel = which === "store" ? "[data-karuna-bubble-store]" : "[data-karuna-bubble-skip]";
  await page.locator(sel).click({ timeout: 5000 });
  await page.waitForTimeout(500);
  await evalT(page, "window.render()", 8000, "render");
  await page.waitForTimeout(200);
  return evalT(page, snapTpl, 15000, `snap:${which}`);
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
  T("前置：杀意 1", setup?.intent === 1, setup);

  // ── P 取回的【杀】免杀意（核心）────────────────────────────
  if (want("P")) {
    // 先存一张战术牌，再存【杀】；此时出杀已消耗杀意，intent 归 0。
    let s = await playAndWait(page, "泡泡牌1");
    T("P1 出战术牌后挂起", s?.pending === true, s);
    s = await clickBubbleBtn(page, "store");
    T("P2 存入后泡泡区 1 张", s?.bubbleLen === 1, s);

    s = await playAndWait(page, "泡泡杀");
    T("P3 出杀后挂起", s?.pending === true, s);
    T("P4 出杀已消耗杀意至 0", s?.intent === 0, s);
    s = await clickBubbleBtn(page, "store");
    T("P5 泡泡区 2 张（含杀）", s?.bubbleLen === 2, s);
    T("P6 杀已离开弃牌堆", s && !s.discard.includes("泡泡杀"), s);

    // 取回【杀】：泡泡区 index 1 是杀。
    await evalT(page, "(() => { const b = window.state.battle;"
      + " b.phase = 4; b.locked = false; window.render(); return true; })()",
    8000, "unlockP");
    await page.waitForTimeout(300);
    await page.locator("[data-bubble-index='1']").click({ timeout: 5000 });
    await page.waitForTimeout(600);
    s = await evalT(page, snapTpl, 15000, "snapP7");
    T("P7 取回后泡泡区剩 1 张", s?.bubbleLen === 1, s);
    T("P8 杀回到手牌", (s?.hand || []).includes("泡泡杀"), s);
    const freeFlag = await evalT(page, `(() => {
      const u = window.state.battle.allies[0];
      const c = u.hand.find(x => x._bubbleFree);
      return { free: !!c?._bubbleFree, name: c?.name || "" };
    })()`, 15000, "snapFree");
    T("P9 取回的杀带免杀意标记",
      freeFlag?.free === true && freeFlag?.name === "泡泡杀", freeFlag);

    // 关键判据：intent=0 时该杀是否仍可打出（普通杀此时不可打出）。
    const playable = await evalT(page, `(() => {
      const b = window.state.battle, u = b.allies[0];
      const c = u.hand.find(x => x.name === "泡泡杀");
      const idx = u.hand.indexOf(c);
      // canPlay 签名为 (actor, source, battle)，不是 (state, actor, card)。
      const free = window.BattleSystem.canPlay
        ? window.BattleSystem.canPlay(u, c, b) : null;
      const pickable = window.BattleSystem.selectCard
        ? (window.BattleSystem.selectCard(window.state, idx), true) : null;
      return { intent: u.intent, free, pickable,
        selected: b.selectedCardIndex, selectedName: u.hand[b.selectedCardIndex]?.name || "" };
    })()`, 15000, "snapPlayable");
    // 严格：只认 canPlay 返回值。此前用 `|| selectedName` 兜底，
    // 撤销免杀意判据后 selectCard 仍会成功，导致该断言恒真。
    T("P10 杀意 0 时取回的杀仍可打出", playable?.free === true, playable);

    // 真正打出，验证杀意未被扣成负数、且确未消耗。
    const after = await evalT(page, `(() => {
      const st = window.state, b = st.battle, u = b.allies[0];
      const c = u.hand.find(x => x.name === "泡泡杀" && x._bubbleFree);
      if (!c) return { played: false };
      // 杀意抬到 2：intent 为 0 时再扣也仍是 0，无法区分"没扣"与"扣了"。
      u.intent = 2;
      const before = u.intent;
      window.BattleSystem.useCard(st, u, b.enemies[0], c);
      return { played: true, before, after: u.intent };
    })()`, 15000, "playFreeKill");
    T("P11 取回的杀已打出", after?.played === true, after);
    await page.waitForTimeout(700);
    await evalT(page, "window.BattleEffects?.whenIdle?.()", 8000, "whenIdleP");
    await page.waitForTimeout(300);
    const s2 = await evalT(page, snapTpl, 15000, "snapP12");
    T("P12 杀意 2 打出后仍为 2（未消耗）", s2?.intent === 2, s2);
    T("P13 战报标记为不消耗杀意",
      (s2?.logs || "").includes("不消耗杀意"), s2 && { logs: s2.logs.slice(-200) });
    // 打出后又会挂起，必须跳过，避免后续段落卡死。
    await evalT(page, "window.BattleSystem.skipKarunaBubble(window.state); window.render();",
      8000, "skipP");
  }

  // ── M 上限 3 张 ────────────────────────────────────────────
  if (want("M")) {
    await evalT(page, setupTpl, 15000, "setupM");
    await playAndWait(page, "泡泡牌1");
    await clickBubbleBtn(page, "store");
    await playAndWait(page, "泡泡牌2");
    await clickBubbleBtn(page, "store");
    await playAndWait(page, "泡泡牌3");
    const s = await clickBubbleBtn(page, "store");
    T("M1 存入 3 张后泡泡区满", s?.bubbleLen === 3, s);
    T("M2 泡泡区渲染 3 个点击位", s?.slots === 3, s);
    const s4 = await playAndWait(page, "泡泡牌4");
    T("M3 满 3 张后第 4 张不再挂起", s4?.pending === false, s4);
    T("M4 第 4 张正常进入弃牌堆", (s4?.discard || []).includes("泡泡牌4"), s4);
    T("M5 泡泡区仍为 3 张", s4?.bubbleLen === 3, s4);
    await evalT(page, "window.BattleSystem.skipKarunaBubble(window.state); window.render();",
      8000, "skipM");
  }

  // ── E 回合结束清空进弃牌堆 ─────────────────────────────────
  if (want("E")) {
    await evalT(page, setupTpl, 15000, "setupE");
    await playAndWait(page, "泡泡牌1");
    await clickBubbleBtn(page, "store");
    await playAndWait(page, "泡泡牌2");
    const s = await clickBubbleBtn(page, "store");
    T("E1 回合结束前泡泡区 2 张", s?.bubbleLen === 2, s);
    const discardBefore = (s?.discard || []).slice();
    const e = await evalT(page, `(() => {
      const st = window.state, b = st.battle, u = b.allies[0];
      const names = (u.bubbleCards || []).map(c => c.name);
      window.AbeKarunaBubbleSkills.endTurn(st, u);
      window.render();
      return { names, bubbleLen: (u.bubbleCards || []).length,
        discard: (u.pileStats?.discard || u.discard || []).map(c => c.name),
        logs: (st.battleLog || []).join(" | ") };
    })()`, 15000, "endTurn");
    T("E2 回合结束后泡泡区清空", e?.bubbleLen === 0, e);
    T("E3 两张牌都进入弃牌堆",
      (e?.names || []).every(n => (e?.discard || []).filter(x => x === n).length
        > discardBefore.filter(x => x === n).length), e);
    T("E4 战报说明进入弃牌堆",
      (e?.logs || "").includes("进入弃牌堆"), e && { logs: e.logs.slice(-200) });
  }

  // ── S 放弃路径与基本守卫 ───────────────────────────────────
  if (want("S")) {
    await evalT(page, setupTpl, 15000, "setupS");
    let s = await playAndWait(page, "泡泡牌1");
    T("S1 出牌后挂起", s?.pending === true, s);
    s = await clickBubbleBtn(page, "skip");
    T("S2 放弃后泡泡区为空", s?.bubbleLen === 0, s);
    T("S3 放弃的牌留在弃牌堆", (s?.discard || []).includes("泡泡牌1"), s);
    T("S4 放弃后解除锁定", s?.locked === false, s);
    T("S5 战报说明放弃发动", (s?.logs || "").includes("放弃发动记忆泡泡"),
      s && { logs: s.logs.slice(-200) });

    // 非卡露娜不触发
    const other = await evalT(page, `(() => {
      const st = window.state, b = st.battle, u = b.allies[0];
      u.ref = "lokar"; u.id = "lokar";
      delete b.karunaBubble; b.locked = false;
      window.AbeKarunaBubbleSkills.afterCardPlayed(st, u, { name: "X", type: "tactic" });
      const r = !!b.karunaBubble;
      u.ref = "abe_karuna"; u.id = "abe_karuna";
      return r;
    })()`, 15000, "otherRef");
    T("S6 非卡露娜不触发记忆泡泡", other === false, { other });

    // 阵亡不触发
    const dead = await evalT(page, `(() => {
      const st = window.state, b = st.battle, u = b.allies[0];
      delete b.karunaBubble; b.locked = false;
      const hp = u.hp; u.hp = 0;
      window.AbeKarunaBubbleSkills.afterCardPlayed(st, u, { name: "X", type: "tactic" });
      const r = !!b.karunaBubble;
      u.hp = hp;
      return r;
    })()`, 15000, "dead");
    T("S7 阵亡时不触发记忆泡泡", dead === false, { dead });
  }

  const bad = relevantErrors(errors);
  T("全程无 JS 错误", bad.length === 0, bad.slice(0, 3));

  console.log(`\n通过 ${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})();
