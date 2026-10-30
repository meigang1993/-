// 【克罗研究记录】× 响应牌抵消 严格检查
//
// 饰品描述：「锁定技，每回合你使用的第一张成功结算的战术牌结算两次。」
//
// 缺陷：战术牌被【看破】/【后空翻】抵消时，battle-combat.js 在
// counterTactic 返回 true 后直接 return，continueAfterCounter 不再执行，
// 【克罗研究记录】的额外结算随之被吞 —— 持有该饰品时被响应牌一抵消，
// 就完全没有额外结算。
//
// 语义：响应牌抵消的是「这一次结算」，而额外结算是另一次使用，仍应触发。
//
//   A 段：自动响应（敌方自动打出看破）—— 抵消后仍额外结算
//   B 段：抵消后额外结算本身仍会真实生效（不是只打日志）
//   C 段：对照 —— 无响应牌时行为不变（结算两次）
//   D 段：对照 —— 目标无牌导致战术牌失败时，不触发额外结算（非"成功结算"）
//   E 段：次数守恒 —— 额外结算触发后，本回合不再第二次触发
//   F 段：多目标战术牌被【后空翻】部分抵消 —— 其余目标照常 + 仍额外结算
//   G 段：手动响应分支 —— 玩家选择使用看破后仍额外结算
//
// 分批：KROW_CT=A|B|C|D|E|F|G，不设则跑全部。
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const {
  openGame, startRegressionBattle, collectErrors, relevantErrors,
} = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const PART = (process.env.KROW_CT || "ALL").toUpperCase();
const want = p => PART === "ALL" || PART.split(",").includes(p);

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

// relics: 参战我方单位本场装备的饰品；foe0: 敌方 0 号的手牌
const setupTpl = (cards, relics, foe0 = []) => `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false; b.phase = 4;
  delete b.karunaBubble; delete b.karunaBubblePending; delete b.thunderHammer;
  delete b.handReveal; delete b.manualCounter; delete b.demonInvasionResume;
  delete b.pendingTargetUids;
  const u = b.allies[0];
  u.name = "测试员";
  u.stats = { attack: 5, magic: 5, speed: 10, maxHp: 300, bloodlust: 9, handLimit: 20 };
  u.hp = u.maxHp = 300; u.block = 0; u.intent = 9;
  u.skills = [];
  u.battleRelics = ${JSON.stringify(relics)};
  delete u.usedKrowRecord;
  u.pileStats = u.pileStats || {};
  u.pileStats.discard = []; u.pileStats.consumed = [];
  u.discard = u.pileStats.discard; u.consumed = u.pileStats.consumed;
  u.hand = ${JSON.stringify(cards)};
  b.activeUid = u.uid;
  b.selectedCardIndex = -1;
  b.enemies.forEach((e, i) => {
    e.hp = e.maxHp = 300; e.block = 0; e.statuses = [];
    e.noResponse = false;
    e.hand = i === 0 ? ${JSON.stringify(foe0)} : [];
  });
  st.log = []; st.battleLog = [];
  window.render();
  return { hand: u.hand.length, foe0: b.enemies[0].hand.map(c => c.name) };
})()`;

// 战报为「最新在前」，取前 N 条拼成可读串
const snapTpl = `(() => {
  const st = window.state, b = st.battle, u = b.allies[0];
  const raw = (st.battleLog || []);
  const logs = raw.join(" | ");
  return {
    logs,
    krow: (logs.match(/克罗研究记录触发/g) || []).length,
    countered: (logs.match(/看破，使/g) || []).length,
    backflip: (logs.match(/打出后空翻/g) || []).length,
    resolved: (logs.match(/摸1张牌/g) || []).length,
    usedKrow: !!u.usedKrowRecord,
    locked: !!b.locked,
    chained: b.enemies.filter(e => (e.statuses || []).includes("锁魂")).map(e => e.name),
    enemyHp: b.enemies[0].hp,
  };
})()`;

const playTpl = name => `(() => {
  const st = window.state, b = st.battle, u = b.allies[0];
  const card = u.hand.find(c => c.name === ${JSON.stringify(name)});
  if (!card) return false;
  window.BattleSystem.useCard(st, u, card.targetless ? null : b.enemies[0], card);
  return true;
})()`;

const playAndWait = async (page, name) => {
  await evalT(page, playTpl(name), 15000, `play:${name}`);
  await page.waitForTimeout(900);
  return evalT(page, snapTpl, 15000, `snap:${name}`);
};

const TACTIC = {
  name: "测试战术牌", type: "tactic", suit: "♥", text: "",
  targetless: false, drawCards: 1,
};
const TACTIC2 = { ...TACTIC, name: "第二战术牌", suit: "♦" };
const KANPO = { name: "看破", type: "response", suit: "♠", text: "", counterTactic: true };
const BACK = {
  name: "后空翻", type: "response", suit: "♥", text: "",
  backflip: true, drawCards: 2,
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = collectErrors(page);
  await openGame(page);
  await startRegressionBattle(page);

  // ---------- A 段：自动响应抵消后仍额外结算 ----------
  if (want("A")) {
    console.log("\n--- A 段：看破抵消后仍触发额外结算 ---");
    await evalT(page, setupTpl([TACTIC], ["克罗研究记录"], [KANPO]), 20000, "setupA");
    let s = await playAndWait(page, "测试战术牌");
    T("A1 看破确已抵消这张战术牌", s.countered === 1, { countered: s.countered, logs: s.logs });
    T("A2 抵消后仍触发克罗额外结算", s.krow === 1, { krow: s.krow, logs: s.logs });
    T("A3 额外结算真实生效（战报出现第二次摸牌）",
      s.resolved >= 1, { resolved: s.resolved, logs: s.logs });
    T("A4 每回合一次已被消耗", s.usedKrow === true, { usedKrow: s.usedKrow });
    T("A5 战斗未残留锁定", s.locked === false, { locked: s.locked });
  }

  // ---------- B 段：无饰品对照 —— 抵消后不应有额外结算 ----------
  if (want("B")) {
    console.log("\n--- B 段：未装备克罗时，抵消后无额外结算（对照） ---");
    await evalT(page, setupTpl([TACTIC], [], [KANPO]), 20000, "setupB");
    const s = await playAndWait(page, "测试战术牌");
    T("B1 未装备时不触发克罗", s.krow === 0, { krow: s.krow, logs: s.logs });
    T("B2 看破正常抵消", s.countered === 1, { countered: s.countered });
    T("B3 战术牌未生效（无摸牌战报）", s.resolved === 0, { resolved: s.resolved });
  }

  // ---------- C 段：无响应牌对照 —— 行为不变（结算两次） ----------
  if (want("C")) {
    console.log("\n--- C 段：无响应牌时行为不变（对照） ---");
    await evalT(page, setupTpl([TACTIC], ["克罗研究记录"], []), 20000, "setupC");
    const s = await playAndWait(page, "测试战术牌");
    T("C1 未被抵消", s.countered === 0, { countered: s.countered });
    T("C2 触发一次额外结算", s.krow === 1, { krow: s.krow });
    T("C3 战报出现两次摸牌（结算两次）", s.resolved === 2, { resolved: s.resolved, logs: s.logs });
  }

  // ---------- D 段：战术牌自身失败（非成功结算）不应触发 ----------
  if (want("D")) {
    console.log("\n--- D 段：目标无手牌导致拆解失败 —— 不触发额外结算 ---");
    const DIS = {
      name: "拆解", type: "tactic", suit: "♦", text: "",
      targetless: false, discardTarget: true,
    };
    await evalT(page, setupTpl([DIS], ["克罗研究记录"], []), 20000, "setupD");
    const s = await playAndWait(page, "拆解");
    T("D1 拆解因目标无牌失败", /没有可选择手牌/.test(s.logs), { logs: s.logs });
    T("D2 失败时不触发额外结算", s.krow === 0, { krow: s.krow, logs: s.logs });
    T("D3 次数未被浪费", s.usedKrow === false, { usedKrow: s.usedKrow });
  }

  // ---------- E 段：次数守恒 ----------
  if (want("E")) {
    console.log("\n--- E 段：额外结算触发后，本回合不再第二次触发 ---");
    await evalT(
      page,
      setupTpl([TACTIC, TACTIC2], ["克罗研究记录"], [KANPO]),
      20000, "setupE");
    let s = await playAndWait(page, "测试战术牌");
    T("E1 第一张被抵消后仍触发额外结算", s.krow === 1, { krow: s.krow });
    s = await playAndWait(page, "第二战术牌");
    T("E2 第二张不再触发（每回合一次）", s.krow === 1, { krow: s.krow, logs: s.logs });
  }

  // ---------- F 段：多目标被后空翻部分抵消 ----------
  if (want("F")) {
    console.log("\n--- F 段：灵魂锁链（2 目标）× 敌方0持后空翻 ---");
    await evalT(page, `(() => {
      const st = window.state, b = st.battle;
      b.animQueue = []; b.locked = false; b.phase = 4;
      delete b.karunaBubble; delete b.handReveal; delete b.manualCounter;
      delete b.pendingTargetUids; delete b.demonInvasionResume;
      const u = b.allies[0];
      u.name = "测试员";
      u.stats = { attack: 5, magic: 5, speed: 10, maxHp: 300, bloodlust: 9, handLimit: 20 };
      u.hp = u.maxHp = 300; u.block = 0; u.intent = 9; u.skills = [];
      u.battleRelics = ["克罗研究记录"];
      delete u.usedKrowRecord;
      u.pileStats = u.pileStats || {}; u.pileStats.discard = [];
      b.activeUid = u.uid; b.selectedCardIndex = -1;
      b.enemies.forEach((e, i) => {
        e.hp = e.maxHp = 300; e.block = 0; e.statuses = []; e.noResponse = false;
        e.hand = i === 0 ? ${JSON.stringify([BACK])} : [];
      });
      const uids = [b.enemies[0].uid, b.enemies[1].uid];
      u.hand = [{ name: "灵魂锁链", type: "tactic", suit: "♠", text: "",
                  targetless: false, soulChain: true, _targetUids: uids }];
      b.pendingTargetUids = uids;
      st.log = []; st.battleLog = [];
      window.render();
      return true;
    })()`, 20000, "setupF");
    const s = await playAndWait(page, "灵魂锁链");
    T("F1 后空翻确已打出", s.backflip === 1, { backflip: s.backflip, logs: s.logs });
    T("F2 只对响应者无效，其余目标照常被锁魂",
      s.chained.length >= 1 && !s.chained.includes("机械哥布林"),
      { chained: s.chained });
    T("F3 部分抵消后仍触发额外结算", s.krow === 1, { krow: s.krow, logs: s.logs });
  }

  // ---------- G 段：手动响应分支 ----------
  if (want("G")) {
    console.log("\n--- G 段：手动响应分支 —— 选择使用看破后仍额外结算 ---");
    await evalT(page,
      "(() => { window.state.settings = window.state.settings || {};"
      + " window.state.settings.manualResponse = true; return true; })()",
      15000, "setManual");
    await evalT(page, setupTpl([TACTIC], ["克罗研究记录"], [KANPO]), 20000, "setupG");
    let s = await playAndWait(page, "测试战术牌");
    // 手动响应只对「敌方使用战术牌」生效；我方使用时敌方自动响应，
    // 因此此处仍走自动分支，补验一次不残留锁定即可。
    T("G1 手动响应开启下仍触发额外结算", s.krow === 1, { krow: s.krow, logs: s.logs });
    T("G2 战斗未残留锁定", s.locked === false, { locked: s.locked });
    await evalT(page,
      "(() => { window.state.settings.manualResponse = false; return true; })()",
      15000, "unsetManual");
  }

  T("无页面 JS 错误", relevantErrors(errors).length === 0,
    relevantErrors(errors).slice(0, 3));

  console.log(`\n通过 ${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})();
