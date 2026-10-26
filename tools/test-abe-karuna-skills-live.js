// 安倍卡露娜三技能实机回归：同频歌姬（同色连唱补牌 + 头像花色）、
// 记忆泡泡（挂起存入 / 放弃 / 出牌阶段取回 / 免杀意 / 回合结束清空）、
// 幸运海螺（存活时队伍经验翻倍）。
//
// 分批执行：KARUNA_PART=A|B|C（默认 ALL 跑全部三段）。
// 背景：单次跑完三段时，B16 使用取回的牌会再次挂起记忆泡泡，
// 使 battle.locked 为真、动画队列不空，whenIdle() 永不 resolve，
// page.evaluate 无限挂起（表现为整轮卡死）。故：
//   1) 支持按段分批，单次运行更短、卡点更易定位；
//   2) 所有 evaluate 均带超时兜底，超时记 FAIL 而非挂死；
//   3) 每次出牌结算后主动跳过泡泡挂起，避免残留锁定污染下一段。
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const {
  openGame, startRegressionBattle, collectErrors, relevantErrors,
} = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const PART = (process.env.KARUNA_PART || "ALL").toUpperCase();
const want = p => PART === "ALL" || PART === p;

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
};

// 超时兜底：任一 evaluate 超过 15s 未返回即判为失败，绝不无限挂起。
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
    { name: "杀（普攻）", type: "slash", scale: "attack", responseKind: "dodge", suit: "♥", text: "" },
    { name: "红牌A", type: "tactic", suit: "♦", text: "" },
    { name: "黑牌B", type: "tactic", suit: "♠", text: "" },
    { name: "红牌C", type: "tactic", suit: "♥", text: "" },
    { name: "黑牌D", type: "tactic", suit: "♣", text: "" },
  ];
  b.activeUid = u.uid;
  b.enemies.forEach(e => {
    e.hp = e.maxHp = 90; e.block = 0; e.statuses = [];
    e.hand = []; e.noResponse = true;
  });
  st.log = []; st.battleLog = [];
  window.render();
  return { foes: b.enemies.length, hand: u.hand.length, deck: u.pileStats?.deck?.length ?? -1 };
})()`;

const snapTpl = `(() => {
  const st = window.state, b = st.battle, u = b.allies[0];
  return {
    hand: u.hand.map(c => c.name),
    handLen: u.hand.length,
    bubble: (u.bubbleCards || []).map(c => c.name),
    bubbleLen: (u.bubbleCards || []).length,
    discard: (u.pileStats?.discard || u.discard || []).map(c => c.name),
    lastSuit: u.karunaLastSuit || "",
    lastColor: u.karunaLastColor || "",
    locked: !!b.locked,
    pending: !!b.karunaBubble,
    pendingName: b.karunaBubble?.card?.name || "",
    selected: b.selectedCardIndex,
    selectedName: u.hand[b.selectedCardIndex]?.name || "",
    freeFlag: !!(u.bubbleCards || []).find(c => c._bubbleFree),
    selSkill: b.selectedSkillCard?.name || "",
    intent: u.intent,
    prompt: document.querySelector(".discard-prompt")?.textContent || "",
    bubbleZone: !!document.querySelector(".karuna-bubble-zone"),
    slots: document.querySelectorAll("[data-bubble-index]").length,
    badge: [...document.querySelectorAll(".idol-suit-badge")]
      .map(el => el.textContent.trim()).find(t => t.startsWith("同频")) || "",
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

// 出牌后统一收尾：等动画 → 跳过可能的泡泡挂起 → 再渲染。
// 不跳过的话 battle.locked 会残留，后续 evaluate/点击全部失联（即此前的整轮卡死）。
const settle = async (page, ms = 700) => {
  await page.waitForTimeout(ms);
  await evalT(page, "window.BattleEffects?.whenIdle?.()", 8000, "whenIdle");
  await page.waitForTimeout(300);
  await evalT(page, "window.BattleSystem.skipKarunaBubble(window.state); window.render();",
    8000, "skipBubble");
  await page.waitForTimeout(200);
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

  // ── A 同频歌姬 ─────────────────────────────────────────────
  if (want("A")) {
    await evalT(page, playTpl("红牌A"), 15000, "play红牌A");
    await settle(page);
    const a1 = await evalT(page, snapTpl, 15000, "snapA1");
    T("A1 首张红牌不补牌（无上一张颜色）",
      a1 && !a1.logs.includes("同频歌姬"), a1 && { logs: a1.logs.slice(-120) });
    T("A2 记录花色 ♦", a1?.lastSuit === "♦", a1);
    T("A3 头像显示同频花色", (a1?.badge || "").includes("同频"), a1);

    await evalT(page, playTpl("红牌C"), 15000, "play红牌C");
    await settle(page);
    const a2 = await evalT(page, snapTpl, 15000, "snapA2");
    T("A4 连续红牌触发同频歌姬", (a2?.logs || "").includes("同频歌姬"),
      a2 && { logs: a2.logs.slice(-160) });

    await evalT(page, playTpl("黑牌B"), 15000, "play黑牌B");
    await settle(page);
    const a3 = await evalT(page, snapTpl, 15000, "snapA3");
    T("A5 换黑色牌时颜色记录更新为 black", a3?.lastColor === "black", a3);
  }

  // ── B 记忆泡泡 ────────────────────────────────────────────
  if (want("B")) {
    await evalT(page, playTpl("黑牌D"), 15000, "play黑牌D");
    await page.waitForTimeout(800);
    await evalT(page, "window.BattleEffects?.whenIdle?.()", 8000, "whenIdleB1");
    await page.waitForTimeout(300);
    const b1 = await evalT(page, snapTpl, 15000, "snapB1");
    T("B1 出牌后泡泡挂起", b1?.pending === true, b1);
    T("B2 挂起的是刚使用的牌", b1?.pendingName === "黑牌D", b1);
    T("B3 提示条提示记忆泡泡", (b1?.prompt || "").includes("记忆泡泡"), b1);
    T("B4 战斗已锁定", b1?.locked === true, b1);

    await page.locator("[data-karuna-bubble-store]").click({ timeout: 5000 });
    await page.waitForTimeout(600);
    await evalT(page, "window.render()", 8000, "renderB2");
    const b2 = await evalT(page, snapTpl, 15000, "snapB2");
    T("B5 放入后泡泡区 1 张", b2?.bubbleLen === 1, b2);
    T("B6 泡泡区牌名正确", b2?.bubble[0] === "黑牌D", b2);
    T("B7 该牌已离开弃牌堆", b2 && !b2.discard.includes("黑牌D"), b2);
    T("B8 锁定已解除", b2?.locked === false, b2);
    T("B9 泡泡区已渲染出 1 个点击位", b2?.slots === 1, b2);

    // 放弃路径
    await evalT(page, playTpl("杀（普攻）"), 15000, "play杀");
    await page.waitForTimeout(800);
    await evalT(page, "window.BattleEffects?.whenIdle?.()", 8000, "whenIdleB3");
    await page.waitForTimeout(300);
    const b3 = await evalT(page, snapTpl, 15000, "snapB3");
    const pending3 = b3?.pending;
    await page.locator("[data-karuna-bubble-skip]").click({ timeout: 5000 });
    await page.waitForTimeout(500);
    const b4 = await evalT(page, snapTpl, 15000, "snapB4");
    T("B10 出杀后同样挂起", pending3 === true, b3);
    T("B11 放弃后泡泡区仍为 1 张", b4?.bubbleLen === 1, b4);
    T("B12 放弃的牌留在弃牌堆", b4 && b4.discard.includes("杀（普攻）"), b4);

    // 出牌阶段取回
    await evalT(page,
      "(() => { const b = window.state.battle; b.phase = 4; b.locked = false; window.render(); return true; })()",
      8000, "unlockB");
    await page.waitForTimeout(300);
    await page.locator("[data-bubble-index='0']").click({ timeout: 5000 });
    await page.waitForTimeout(600);
    const b5 = await evalT(page, snapTpl, 15000, "snapB5");
    // 新语义：就地使用——选中阶段不扣区、不进手牌，打出才扣。
    T("B13 选中后泡泡区仍 1 张（打出才扣）", b5?.bubbleLen === 1, b5);
    T("B14 牌未进入手牌", !(b5?.hand || []).includes("黑牌D"), b5);
    T("B15 泡泡区的牌带免杀意标记", b5?.freeFlag === true, b5);

    const intentBefore = b5?.intent;
    await evalT(page, `(() => {
      const st = window.state, b = st.battle, u = b.allies[0];
      const c = (u.bubbleCards || []).find(x => x._bubbleFree);
      if (!c) return false;
      window.BattleSystem.useCard(st, u, b.enemies[0], c);
      return true;
    })()`, 15000, "playFree");
    // 关键：这张牌打出后同样会挂起记忆泡泡，必须跳过，否则后续 evaluate 全挂。
    await page.waitForTimeout(800);
    await evalT(page, "window.BattleEffects?.whenIdle?.()", 8000, "whenIdleB6");
    await page.waitForTimeout(300);
    await evalT(page, "window.BattleSystem.skipKarunaBubble(window.state); window.render();",
      8000, "skipBubbleB6");
    const b6 = await evalT(page, snapTpl, 15000, "snapB6");
    T("B16 使用泡泡区的战术牌不消耗杀意", b6?.intent === intentBefore,
      { before: intentBefore, after: b6?.intent });
  }

  // ── C 幸运海螺 ────────────────────────────────────────────
  if (want("C")) {
    const c1 = await evalT(page, `(() => {
      const st = window.state, b = st.battle, u = b.allies[0];
      const live = window.AbeKarunaConchSkills?.multiplier?.(st, b);
      const exp = window.AbeKarunaConchSkills?.experience?.(7, st, b);
      u.hp = 0;
      const dead = window.AbeKarunaConchSkills?.multiplier?.(st, b);
      u.hp = u.maxHp;
      const core = { chars: [{ id: "abe_karuna", locked: false }] };
      const double = window.AbeKarunaConchSkills?.partyMultiplier?.(core,
        { participantIds: ["abe_karuna"], aliveParticipantIds: ["abe_karuna"] });
      const deadParty = window.AbeKarunaConchSkills?.partyMultiplier?.(core,
        { participantIds: ["abe_karuna"], aliveParticipantIds: ["other"] });
      const absent = window.AbeKarunaConchSkills?.partyMultiplier?.(core,
        { participantIds: ["other"], aliveParticipantIds: ["other"] });
      return { live, exp, dead, double, deadParty, absent };
    })()`, 15000, "snapC");
    T("C1 存活时倍率为 2", c1?.live === 2, c1);
    T("C2 经验翻倍（7 → 14）", c1?.exp === 14, c1);
    T("C3 阵亡时倍率为 1", c1?.dead === 1, c1);
    T("C4 副本结算：参战且存活 → 2", c1?.double === 2, c1);
    T("C5 副本结算：参战但阵亡 → 1", c1?.deadParty === 1, c1);
    T("C6 副本结算：未参战 → 1", c1?.absent === 1, c1);
  }

  const errs = relevantErrors(errors);
  T("D1 全程无 JS 错误", errs.length === 0, errs.slice(0, 3));

  await browser.close();
  console.log(`\n通过 ${pass}/${total}  [PART=${PART}]`);
  process.exit(pass === total ? 0 : 1);
})().catch(e => { console.error("FATAL", e?.message || e); process.exit(2); });
