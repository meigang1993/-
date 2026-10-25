// 安倍卡露娜【幸运海螺】显示层 + 【同频歌姬】实际效果 严格回归。
//
// 背景：既有 test-abe-karuna-skills-live.js 的 C 段只是直接调
// AbeKarunaConchSkills.experience() 取数值，从未验证「战斗结算界面真正
// 渲染出来的经验文本」。玩家看到的是 battle-victory.js 里
// `<span data-victory-experience="1">队伍经验 +N</span>`，内部数值翻倍
// 但显示未翻倍的情况无法被那段断言发现。本测试补足显示层。
//
// 分批：KARUNA_CHK=D（同频歌姬实际摸牌）、E（海螺结算显示），默认 ALL。
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const {
  openGame, startRegressionBattle, collectErrors, relevantErrors,
} = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const PART = (process.env.KARUNA_CHK || "ALL").toUpperCase();
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

// 卡露娜就位：手牌按「红/红/黑/黑」排列，便于验同色连续。
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
    { name: "红牌A", type: "tactic", suit: "♦", text: "" },
    { name: "红牌C", type: "tactic", suit: "♥", text: "" },
    { name: "黑牌B", type: "tactic", suit: "♠", text: "" },
    { name: "黑牌D", type: "tactic", suit: "♣", text: "" },
    { name: "红牌E", type: "tactic", suit: "♥", text: "" },
  ];
  b.activeUid = u.uid;
  b.enemies.forEach(e => {
    e.hp = e.maxHp = 90; e.block = 0; e.statuses = [];
    e.hand = []; e.noResponse = true;
  });
  st.log = []; st.battleLog = [];
  window.render();
  return { foes: b.enemies.length, hand: u.hand.length };
})()`;

const playTpl = name => `(() => {
  const st = window.state, b = st.battle, u = b.allies[0];
  const card = u.hand.find(c => c.name === ${JSON.stringify(name)});
  if (!card) return false;
  window.BattleSystem.useCard(st, u, b.enemies[0], card);
  return true;
})()`;

const settle = async (page, ms = 700) => {
  await page.waitForTimeout(ms);
  await evalT(page, "window.BattleEffects?.whenIdle?.()", 8000, "whenIdle");
  await page.waitForTimeout(300);
  await evalT(page, "window.BattleSystem.skipKarunaBubble(window.state); window.render();",
    8000, "skipBubble");
  await page.waitForTimeout(200);
};

const snapTpl = `(() => {
  const st = window.state, b = st.battle, u = b.allies[0];
  return {
    handLen: u.hand.length,
    lastColor: u.karunaLastColor || "",
    lastSuit: u.karunaLastSuit || "",
    logs: (st.battleLog || []).join(" | "),
    badge: [...document.querySelectorAll(".idol-suit-badge")]
      .map(el => el.textContent.trim()).find(t => t.startsWith("同频")) || "",
  };
})()`;

// 构造探索战斗并真正渲染结算界面，抓显示文本。
// 关键：experienceReward 要求 battle.exploration 为真、nodeType 属
// normal/elite/boss、且 battle.test 为假，任一不满足则 base=0（无显示）。
const victoryTpl = mode => `(() => {
  const st = window.state, b = st.battle;
  b.test = false;
  b.exploration = true;
  b.nodeType = "normal";
  st.explore = st.explore || {};
  const ids = Object.keys((window.GameData && window.GameData.difficulties) || {});
  st.explore.difficultyId = st.explore.difficultyId || ids[0] || "";
  st.explore.missionId = st.explore.missionId || (b.missionId || "");
  const allies = b.allies;
  const karuna = allies.find(a => a.ref === "abe_karuna");
  if ("${mode}" === "dead" && karuna) karuna.hp = 0;
  if ("${mode}" === "alive" && karuna) karuna.hp = karuna.maxHp;
  if ("${mode}" === "absent") {
    b.allies = allies.filter(a => a.ref !== "abe_karuna");
  }
  const base = window.CharacterProgression?.rewardFor?.(
    b.nodeType, window.GameData.difficulties[st.explore.difficultyId],
    b.missionId || st.explore.missionId) || 0;
  const html = window.BattleVictory.render(st) || "";
  const host = document.createElement("div");
  host.id = "victory-probe";
  host.style.cssText = "position:fixed;left:-9999px;top:0";
  host.innerHTML = html;
  document.body.appendChild(host);
  const el = host.querySelector("[data-victory-experience]");
  const text = el ? el.textContent.trim() : "";
  const shown = (text.match(/\\+(\\d+)/) || [])[1];
  const out = {
    base,
    text,
    shown: shown ? Number(shown) : 0,
    multiplier: window.AbeKarunaConchSkills?.multiplier?.(st, b) ?? -1,
    karunaInParty: (b.allies || []).some(a => a.ref === "abe_karuna"),
    karunaAlive: (b.allies || []).some(a => a.ref === "abe_karuna" && a.hp > 0),
  };
  host.remove();
  return out;
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = collectErrors(page);
  await openGame(page);
  await startRegressionBattle(page);

  const setup = await evalT(page, setupTpl, 15000, "setup");
  T("前置：敌人 2 名", setup?.foes === 2, setup);
  T("前置：手牌 5 张", setup?.hand === 5, setup);

  // ── D 同频歌姬：实际摸牌净变化 ────────────────────────────
  // 出 1 张牌手牌 -1；若触发同频补 1 张则净变化 0。用净变化区分"摸了没摸"。
  if (want("D")) {
    const s0 = await evalT(page, snapTpl, 15000, "snapD0");
    T("D1 初始无花色记录", s0?.lastColor === "" && s0?.lastSuit === "", s0);

    await evalT(page, playTpl("红牌A"), 15000, "playA");
    await settle(page);
    const s1 = await evalT(page, snapTpl, 15000, "snapD1");
    // 首张牌仅建立颜色基准，不应补牌：5 → 4
    T("D2 首张红牌建立基准，不补牌（5→4）", s1?.handLen === 4, { s0: s0?.handLen, s1: s1?.handLen });
    T("D3 记录为红色", s1?.lastColor === "red", s1);
    T("D4 头像花色标记显示 ♦", s1?.badge === "同频 ♦", s1);

    await evalT(page, playTpl("红牌C"), 15000, "playC");
    await settle(page);
    const s2 = await evalT(page, snapTpl, 15000, "snapD2");
    // 同色 → 出 1 补 1，净变化 0：4 → 4
    T("D5 连续红牌触发补牌（4→4，净 0）", s2?.handLen === 4, { s1: s1?.handLen, s2: s2?.handLen });
    T("D6 战报出现同频歌姬", (s2?.logs || "").includes("同频歌姬"), s2?.logs);
    T("D7 头像花色标记更新为 ♥", s2?.badge === "同频 ♥", s2);

    await evalT(page, playTpl("黑牌B"), 15000, "playB");
    await settle(page);
    const s3 = await evalT(page, snapTpl, 15000, "snapD3");
    // 换色 → 不补牌：4 → 3
    T("D8 换黑色不补牌（4→3）", s3?.handLen === 3, { s2: s2?.handLen, s3: s3?.handLen });
    T("D9 记录切换为黑色", s3?.lastColor === "black", s3);

    await evalT(page, playTpl("黑牌D"), 15000, "playD");
    await settle(page);
    const s4 = await evalT(page, snapTpl, 15000, "snapD4");
    // 同色 → 补 1：3 → 3
    T("D10 连续黑牌触发补牌（3→3，净 0）", s4?.handLen === 3, { s3: s3?.handLen, s4: s4?.handLen });
    T("D11 战报再次出现同频歌姬", (s4?.logs || "").includes("同频歌姬"), s4?.logs);
  }

  // ── E 幸运海螺：结算界面显示文本 ──────────────────────────
  if (want("E")) {
    const alive = await evalT(page, victoryTpl("alive"), 15000, "victoryAlive");
    T("E1 结算界面有经验条目", !!alive?.text, alive);
    T("E2 卡露娜存活：倍率为 2", alive?.multiplier === 2, alive);
    T("E3 显示经验 = 基础×2", alive?.base > 0 && alive?.shown === alive.base * 2,
      { base: alive?.base, shown: alive?.shown, expect: (alive?.base || 0) * 2 });
    T("E4 显示文本形如「队伍经验 +N」",
      /^队伍经验 \+\d+$/.test(alive?.text || ""), alive?.text);

    const dead = await evalT(page, victoryTpl("dead"), 15000, "victoryDead");
    T("E5 卡露娜阵亡：倍率为 1", dead?.multiplier === 1, dead);
    T("E6 阵亡时显示不翻倍", dead?.base > 0 && dead?.shown === dead.base,
      { base: dead?.base, shown: dead?.shown, expect: dead?.base });
    T("E7 阵亡与存活的显示值确实不同", dead?.shown !== alive?.shown,
      { alive: alive?.shown, dead: dead?.shown });

    const absent = await evalT(page, victoryTpl("absent"), 15000, "victoryAbsent");
    T("E8 卡露娜不在队：倍率为 1", absent?.multiplier === 1, absent);
    T("E9 不在队时显示不翻倍", absent?.base > 0 && absent?.shown === absent.base,
      { base: absent?.base, shown: absent?.shown, expect: absent?.base });

    // 非探索战斗：base=0，不应渲染经验条目。
    const plain = await evalT(page, `(() => {
      const st = window.state, b = st.battle;
      b.exploration = false; b.nodeType = "";
      const html = window.BattleVictory.render(st) || "";
      return { has: html.includes("data-victory-experience"), len: html.length };
    })()`, 15000, "victoryPlain");
    T("E10 非探索战斗不显示经验条目", plain?.has === false, plain);

    // 副本实际发放路径：与显示层取同一倍率口径。
    const grant = await evalT(page, `(() => {
      const core = { chars: [{ id: "abe_karuna", locked: false }] };
      const both = window.AbeKarunaConchSkills?.partyMultiplier?.(core,
        { participantIds: ["abe_karuna"], aliveParticipantIds: ["abe_karuna"] });
      const deadP = window.AbeKarunaConchSkills?.partyMultiplier?.(core,
        { participantIds: ["abe_karuna"], aliveParticipantIds: ["other"] });
      return { both, deadP };
    })()`, 15000, "grant");
    T("E11 副本发放：参战且存活 → 2", grant?.both === 2, grant);
    T("E12 副本发放：参战但阵亡 → 1", grant?.deadP === 1, grant);
  }

  const errs = relevantErrors(errors);
  T("F1 全程无 JS 错误", errs.length === 0, errs.slice(0, 3));

  await browser.close();
  console.log(`\n通过 ${pass}/${total}  [CHK=${PART}]`);
  process.exit(pass === total ? 0 : 1);
})().catch(e => { console.error("FATAL", e?.message || e); process.exit(2); });
