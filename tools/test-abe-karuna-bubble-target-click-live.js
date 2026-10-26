// 安倍卡露娜【记忆泡泡】目标点击路径 + 上限 2 张 检查：
//   A 段：上限为 2 —— 装满 2 张后第 3 次出牌不再触发「放入」
//   B 段：点击泡泡区的牌 → 点击敌人 → 点「确定」能否使用（点敌人路径）
//   C 段：已选中目标后「再次点击敌人」是否能直接使用（省掉确定键）
//   D 段：泡泡区用掉的牌不再触发「放入」（无无限循环）；描述文案为 2 张
//
// 分批：KARUNA_TC=A|B|C|D，不设则跑全部。
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const {
  openGame, startRegressionBattle, collectErrors, relevantErrors,
} = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const PART = (process.env.KARUNA_TC || "ALL").toUpperCase();
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

// 等动画结束且目标可点，避免点击落在动画层上（真实玩家也会等动画播完再点）
const waitReady = async (page, sel) => {
  for (let i = 0; i < 40; i++) {
    const ok = await evalT(page, `(() => {
      if (window.BattleEffects?.animating) return false;
      const el = document.querySelector('${sel}');
      if (!el) return false;
      const cs = getComputedStyle(el);
      if (cs.pointerEvents === "none" || cs.visibility === "hidden") return false;
      const r = el.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0)) return false;
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!top && (el === top || el.contains(top) || top.contains(el));
    })()`, 8000, "waitReady");
    if (ok) return true;
    await page.waitForTimeout(200);
  }
  return false;
};

const setupTpl = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false; b.phase = 4;
  delete b.karunaBubble; delete b.thunderHammer;
  const u = b.allies[0];
  u.name = "安倍卡露娜"; u.ref = "abe_karuna"; u.id = "abe_karuna";
  u.gender = "female";
  u.stats = { attack: 4, magic: 4, speed: 3, maxHp: 50, bloodlust: 3, handLimit: 3 };
  u.hp = u.maxHp = 50; u.block = 0; u.intent = 3;
  u.skills = [{ name: "同频歌姬" }, { name: "记忆泡泡" }, { name: "幸运海螺" }];
  delete u.bubbleCards; delete u.karunaLastColor; delete u.karunaLastSuit;
  u.hand = [
    { name: "泡泡牌1", type: "tactic", suit: "♦", text: "", targetless: true },
    { name: "泡泡杀", type: "kill", suit: "♦", text: "" },
    { name: "泡泡牌2", type: "tactic", suit: "♥", text: "", targetless: true },
    { name: "泡泡牌3", type: "tactic", suit: "♠", text: "", targetless: true },
  ];
  b.activeUid = u.uid;
  b.selectedCardIndex = -1; b.selectedSkillCard = null;
  b.pendingTargetUid = null;
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
    phase: b.phase,
    pending: !!b.karunaBubble,
    pendingName: b.karunaBubble?.card?.name || "",
    slots: document.querySelectorAll("[data-bubble-index]").length,
    selected: b.selectedSkillCard?.name || null,
    targetUid: b.pendingTargetUid || null,
    foeHp: b.enemies.map(e => e.hp),
    log: (st.battleLog || []).map(String).join(" | "),
    maxSeen: window.AbeKarunaBubbleSkills?.MAX ?? null,
  };
})()`;

// 打出第 index 张手牌（走真实 useCard），随后若泡泡挂起则点「放入」
const playAndStore = async (page, cardName, store) => {
  await evalT(page, `(() => {
    const b = window.state.battle, u = b.allies[0];
    const i = u.hand.findIndex(c => c.name === "${cardName}");
    window.BattleSystem.useCard(window.state, u,
      window.BattleSystem.active(b) === u ? (b.enemies[0]) : b.enemies[0],
      u.hand[i]);
    return true;
  })()`);
  await page.waitForTimeout(400);
  const has = await evalT(page, `!!window.state.battle.karunaBubble`);
  if (has) {
    const btn = store === false ? "[data-karuna-bubble-skip]" : "[data-karuna-bubble-store]";
    await page.click(btn).catch(() => {});
    await page.waitForTimeout(400);
  }
  return has;
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = collectErrors(page);
  await openGame(page);
  await startRegressionBattle(page);
  const setup = await evalT(page, setupTpl, 20000, "setup");
  console.log("setup", JSON.stringify(setup));

  // ---------- A：上限 2 ----------
  if (want("A")) {
    console.log("\n--- A 上限 2 张 ---");
    const max = await evalT(page, `window.AbeKarunaBubbleSkills.MAX`);
    T("A1 MAX 常量为 2", max === 2, { max });

    await playAndStore(page, "泡泡牌1", true);
    let s = await evalT(page, snapTpl);
    T("A2 存入第 1 张", s.bubbleLen === 1, s);

    await playAndStore(page, "泡泡杀", true);
    s = await evalT(page, snapTpl);
    T("A3 存入第 2 张（含【杀】）", s.bubbleLen === 2 && s.bubble.includes("泡泡杀"), s);

    // 第 3 次出牌：已达上限，不应再触发
    await evalT(page, `(() => { const st = window.state; st.battleLog = []; return true; })()`);
    const triggered = await playAndStore(page, "泡泡牌2", true);
    s = await evalT(page, snapTpl);
    T("A4 满 2 张后不再触发「放入」", triggered === false, { triggered });
    T("A5 泡泡区仍为 2 张", s.bubbleLen === 2, s);
    T("A6 战斗未因泡泡锁定", s.locked === false, s);
    T("A7 标签显示 2/2", await evalT(page,
      `(document.querySelector(".karuna-bubble-label")?.textContent || "").includes("2/2")`) === true,
      await evalT(page, `document.querySelector(".karuna-bubble-label")?.textContent`));
    T("A8 第 3 张牌进了弃牌堆", s.discard.includes("泡泡牌2"), s);
  }

  // ---------- B：点泡泡牌 → 点敌人（一次点击即结算） ----------
  if (want("B")) {
    console.log("\n--- B 点敌人直接使用 ---");
    const idx = await evalT(page, `(() => {
      const u = window.state.battle.allies[0];
      return u.bubbleCards.findIndex(c => c.name === "泡泡杀");
    })()`);
    T("B1 泡泡区找到【杀】", idx >= 0, { idx });

    await page.click(`[data-bubble-index="${idx}"]`);
    await page.waitForTimeout(300);
    let s = await evalT(page, snapTpl);
    T("B2 点击后就地选中（不进手牌）", s.selected === "泡泡杀" && !s.hand.includes("泡泡杀"), s);
    T("B3 手牌中不存在该牌（未塞回手牌）", !s.hand.includes("泡泡杀"), s.hand);
    const hpBefore = s.foeHp[0];
    const intentBefore = s.intent;  // 手牌那次已扣 1 点，此处只要求泡泡区使用不再扣

    const foeUid = await evalT(page, `window.state.battle.enemies[0].uid`);
    const ready = await waitReady(page, `[data-target="${foeUid}"]`);
    T("B3b 敌人可点击（动画结束、未被遮挡）", ready === true, { ready });
    await page.click(`[data-target="${foeUid}"]`);
    await page.waitForTimeout(1200);
    s = await evalT(page, snapTpl);
    T("B4 点一次敌人即结算（无需再点确定）", s.foeHp[0] < hpBefore, { before: hpBefore, after: s.foeHp[0] });
    T("B5 用掉的牌离开泡泡区", !s.bubble.includes("泡泡杀"), s);
    T("B6 牌进入弃牌堆", s.discard.includes("泡泡杀"), s);
    T("B7 免杀意（泡泡区使用前后杀意不变）", s.intent === intentBefore, { before: intentBefore, after: s.intent });
    T("B8 用后不再触发「放入」", s.pending === false && !s.log.includes("放入泡泡手牌区"), s);
    T("B9 泡泡区剩 1 张", s.bubbleLen === 1, s);
    T("B10 结算后解锁", s.locked === false, s);
  }

  // ---------- C：目标已选后再点敌人（二次点击） ----------
  if (want("C")) {
    console.log("\n--- C 二次点击敌人 ---");
    await evalT(page, `(() => {
      const b = window.state.battle, u = b.allies[0];
      u.bubbleCards = [];
      u.hand = [{ name: "再测杀", type: "kill", suit: "♣", text: "" }];
      b.selectedSkillCard = null; b.pendingTargetUid = null;
      b.locked = false; b.phase = 4; u.intent = 3;
      window.state.battleLog = [];
      window.render();
      return true;
    })()`);
    await playAndStore(page, "再测杀", true);
    let s = await evalT(page, snapTpl);
    T("C1 装填【杀】到泡泡区", s.bubbleLen === 1 && s.bubble.includes("再测杀"), s);

    await page.click(`[data-bubble-index="0"]`);
    await waitReady(page, '[data-bubble-index="0"]');
    // previewTarget 在 BattleEffects.animating 时会直接忽略点击（真实玩家也会等动画
    // 播完再点），故点敌人前必须等动画结束，否则本次点击被吞、误判成"需二次点击"。
    for (let i = 0; i < 40; i++) {
      if (await evalT(page, "!window.BattleEffects?.animating", 8000, "idleBeforeEnemy")) break;
      await page.waitForTimeout(200);
    }
    const uid0 = await evalT(page, `window.state.battle.enemies[0].uid`);
    const uid1 = await evalT(page, `window.state.battle.enemies[1].uid`);
    // 第一次点敌人 1（若该实现为「选目标后需确定」，此处只会选中）
    await page.click(`[data-target="${uid1}"]`);
    await page.waitForTimeout(1200);
    s = await evalT(page, snapTpl);
    const used = s.foeHp[1] < 90;
    console.log(`   → 首次点击敌人是否直接结算：${used ? "是" : "否"}`);
    if (used) {
      T("C2 首次点敌人即结算（二次点击无机会）", true);
      T("C3 结算命中被点的敌人 1", s.foeHp[1] === 86, s.foeHp);
      T("C4 免杀意（第二次出杀不扣杀意）", s.intent === 2, { intent: s.intent });
      T("C5 不再触发放入", s.pending === false, s);
    } else {
      await page.click("[data-confirm-target]");
      await page.waitForTimeout(1200);
      const s2 = await evalT(page, snapTpl);
      T("C2 首次点敌人仅选目标", s.foeHp[1] === 90, s.foeHp);
      T("C3 点确定后结算", s2.foeHp[1] < 90, s2.foeHp);
    }
    // 无选中牌时点敌人不应误触发出牌
    const before = await evalT(page, `window.state.battle.enemies[0].hp`);
    for (let i = 0; i < 40; i++) {
      if (await evalT(page, "!window.BattleEffects?.animating", 8000, "idleBeforeEnemy2")) break;
      await page.waitForTimeout(200);
    }
    await page.click(`[data-target="${uid0}"]`);
    await page.waitForTimeout(800);
    const after = await evalT(page, `window.state.battle.enemies[0].hp`);
    T("C6 未选中任何牌时点敌人不会误出牌", before === after, { before, after });
  }

  // ---------- D：描述文案 ----------
  if (want("D")) {
    console.log("\n--- D 描述文案 ---");
    const text = await evalT(page, `(() => {
      const list = window.GameDataNewCharacters || window.GameData?.newCharacters || [];
      const c = list.find(x => (x.name || "").includes("卡露娜"));
      const sk = (c?.skills || []).find(s => s.name === "记忆泡泡");
      return sk?.text || "";
    })()`);
    T("D1 描述写「最多存放2张牌」", text.includes("最多存放2张牌"), { text: text.slice(0, 60) });
    T("D2 描述无残留「3张牌」", !text.includes("3张牌"), { text: text.slice(0, 60) });
    T("D3 描述保留「不进入手牌」", text.includes("不进入手牌"), {});
  }

  const errs = relevantErrors(errors);
  T("E1 无 JS 错误", errs.length === 0, errs.slice(0, 3));

  await browser.close();
  console.log(`\n通过 ${pass}/${total}`);
  process.exit(pass === total ? 0 : 1);
})().catch(e => {
  console.error("FATAL", e);
  process.exit(1);
});
