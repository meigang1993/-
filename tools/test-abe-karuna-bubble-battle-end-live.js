// 安倍卡露娜【记忆泡泡】× 战斗结束（胜利 / 全军覆没）牌去向严格检查。
//
// 要回答的问题：泡泡区里的牌在战斗结束时会怎样——永久失去、永久复制、
// 还是偷来的敌方牌被永久获得？
//
// 关键机制（先读代码确认，再实测）：
//   1. 胜利 / 全军覆没 / 撤退三条路径最终都执行 state.battle = null。
//   2. bubbleCards 挂在 battle.allies 的临时 unit 上（battle-setup.hero 新建
//      对象，不引用 state.chars），故随 battle 一并回收。
//   3. 但**牌对象是跨战斗共享引用**：battleDeck 仅浅拷贝数组（[...baseDeck]），
//      teamPile 只 shuffle 不改元素。所以泡泡区里的牌 ==
//      state.deck 里的那一张（同一对象）。这正是需要实测的风险点。
//
// 分段（KARUNA_END=A|B|C|D|E，不设跑全部）：
//   A 我方普通牌      B 敌方偷来的牌（是否被永久获得）
//   C 消耗牌（是否被永久失去）  D 全军覆没路径
//   E 下一场战斗洁净度（泡泡区是否残留）
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const {
  openGame, startRegressionBattle, openTestBattle,
  collectErrors, relevantErrors,
} = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const PART = (process.env.KARUNA_END || "ALL").toUpperCase();
const want = p => PART === p || (PART === "ALL" && p !== "R");

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

// 装配：卡露娜 + 从**真实牌堆**取牌（保证牌对象来自 state.deck，才能验身份）
// mode: normal | stolen | consume
const setupTpl = mode => `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false; b.phase = 4;
  delete b.karunaBubble; delete b.karunaBubblePending; delete b.thunderHammer;
  delete b.selectedSkillCard;
  const u = b.allies[0], foe = b.enemies[0];
  u.name = "安倍卡露娜"; u.ref = "abe_karuna"; u.id = "abe_karuna"; u.gender = "female";
  u.stats = { attack: 2, magic: 4, speed: 3, maxHp: 50, bloodlust: 1, handLimit: 3 };
  u.hp = u.maxHp = 50; u.block = 0; u.intent = 1;
  u.skills = [{ name: "同频歌姬" }, { name: "记忆泡泡" }, { name: "幸运海螺" }];
  delete u.bubbleCards; delete u.karunaLastColor; delete u.karunaLastSuit;
  u.pileStats = u.pileStats || {};
  u.pileStats.discard = []; u.pileStats.consumed = [];
  u.discard = u.pileStats.discard; u.consumed = u.pileStats.consumed;
  b.enemies.forEach(e => {
    e.hp = e.maxHp = 90; e.block = 0; e.statuses = []; e.hand = []; e.noResponse = true;
    e.pileStats = e.pileStats || {};
    e.pileStats.discard = []; e.pileStats.consumed = [];
  });
  // 取一张真实牌：普通牌从我方牌堆，偷来的牌从敌方牌堆
  const src = ${mode === "stolen" ? "foe" : "u"};
  const pool = (src.pileStats?.deck || src.deck || []);
  const pick = pool[0];
  if (!pick) return { ok: false, why: "牌堆为空" };
  if (${mode === "consume"}) { pick.type = "consume"; }
  if (${mode === "stolen"}) { pick.stolenFromUid = foe.uid; }
  pick.text = pick.text || "";
  // 探针：记住这张牌的**对象身份**，结束后回查它是否还在 state.deck
  window.__probe = pick;
  window.__deckLenBefore = (st.deck || []).length;
  window.__earnedBefore = (st.explore?.earned?.cards || []).length;
  // 同时记录同名牌在 state.deck 里的数量（用于查"复制"）
  window.__nameCountBefore = (st.deck || []).filter(c => c.name === pick.name).length;
  window.__baseLenBefore = (window.GameData?.baseDeck || []).length;
  u.hand = [pick];
  b.activeUid = u.uid; b.selectedCardIndex = -1;
  st.log = []; st.battleLog = [];
  window.render();
  return { ok: true, name: pick.name, deckLen: window.__deckLenBefore };
})()`;

const snapTpl = `(() => {
  const st = window.state, b = st.battle;
  if (!b) return { battle: null };
  const u = b.allies[0];
  return {
    battle: true,
    bubble: (u.bubbleCards || []).map(c => c.name),
    bubbleLen: (u.bubbleCards || []).length,
    myDiscard: (u.pileStats?.discard || u.discard || []).map(c => c.name),
    myConsumed: (u.pileStats?.consumed || u.consumed || []).map(c => c.name),
    locked: !!b.locked,
    pending: !!b.karunaBubble,
    logs: (st.battleLog || []).join(" | "),
  };
})()`;

const playTpl = `(() => {
  const st = window.state, b = st.battle, u = b.allies[0];
  const card = u.hand[0];
  if (!card) return false;
  window.BattleSystem.useCard(st, u, card.targetless ? null : b.enemies[0], card);
  return true;
})()`;

const storeTpl = `(() => {
  const st = window.state;
  const ok = window.AbeKarunaBubbleSkills.store(st);
  window.render();
  return ok;
})()`;

// 战斗结束：真实点击界面上的「撤退」按钮。
// 说明：胜利 / 全军覆没 / 撤退三条路径的最终动作一致 —— state.battle = null
// （battle-outcomes.js 的 returnHall / retreat 与 finishBattle 均如此）。
// 测试战斗（test）下 finishBattle 走 testComplete 分支、DungeonSystem.fail 走
// 副本分支，都不会把 battle 置空，故这里用撤退按钮走真实可观测的终局路径。
// 牌的去向只取决于 battle 是否被丢弃，与走哪条路径无关。
const clickRetreat = async (page) => {
  // data-retreat 点击后走 askGameConfirm 二次确认；测试战斗下确认文本是「结束测试」
  await page.click("button[data-retreat]", { force: true });
  await page.waitForTimeout(700);
  const ok = await page.click('button:has-text("结束测试")', { force: true }).then(() => true).catch(() => false);
  if (!ok) await page.click('button:has-text("撤退")', { force: true }).catch(() => {});
  await page.waitForTimeout(1500);
};

// 结束后的牌去向核对。
// 注意判定口径：battle-setup.shuffle 是 cards.map(c => ({...c}))，
// 每场战斗的牌都是**副本**，与 state.deck / GameData.baseDeck 不同对象。
// 所以"是否永久失去"要看持久牌库里同名牌的数量是否守恒，
// 而不是查 probe 对象在不在 deck（副本必然不在）。
const afterTpl = `(() => {
  const st = window.state;
  const probe = window.__probe;
  const deck = st.deck || [];
  const earned = st.explore?.earned?.cards || [];
  const base = window.GameData?.baseDeck || [];
  return {
    battleNull: !st.battle,
    view: st.view,
    // 泡泡区的牌（战斗内副本）是否混进了任何持久牌库 —— 是则"永久获得"
    probeInDeck: deck.includes(probe),
    probeInEarned: earned.includes(probe),
    probeInBase: base.includes(probe),
    deckLen: deck.length,
    deckLenBefore: window.__deckLenBefore,
    nameCount: deck.filter(c => c.name === probe.name).length,
    nameCountBefore: window.__nameCountBefore,
    baseLen: base.length,
    baseLenBefore: window.__baseLenBefore,
    earnedLen: earned.length,
    earnedBefore: window.__earnedBefore,
    // 持久角色对象上是否被污染出 bubbleCards
    charBubble: (st.chars || []).filter(c => c.bubbleCards?.length).length,
  };
})()`;

const playAndStore = async (page, label) => {
  await evalT(page, playTpl, 15000, `play:${label}`);
  await page.waitForTimeout(700);
  const ok = await evalT(page, storeTpl, 15000, `store:${label}`);
  await page.waitForTimeout(400);
  return ok;
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = collectErrors(page);
  await startRegressionBattle(page);

  // 通用：一段 = 装配 → 打出 → 放入 → 结束 → 核对
  async function runSegment(segName, mode, kind) {
    console.log(`\n── ${segName} ──`);
    await startRegressionBattle(page);
    const s = await evalT(page, setupTpl(mode), 15000, `setup:${segName}`);
    if (!s?.ok) { T(`${segName} 装配成功`, false, s); return; }
    const stored = await playAndStore(page, segName);
    const mid = await evalT(page, snapTpl, 15000, `snap:${segName}`);
    T(`${segName} 牌已存入泡泡区`, !!mid?.bubbleLen, mid);
    if (!mid?.bubbleLen) return;

    // 按场景打上结局标记后再真实点击「撤退」
    await evalT(page, `(() => {
      const b = window.state.battle;
      if (!b) return false;
      if (${JSON.stringify(kind)} === "defeat") { b.pendingDefeat = true; b.defeat = true; }
      else { b.pendingVictory = true; }
      return true;
    })()`, 15000, `flag:${segName}`);
    await clickRetreat(page);
    const after = await evalT(page, afterTpl, 15000, `after:${segName}`);
    if (!after) { T(`${segName} 结束后可核对`, false, {}); return; }
    T(`${segName} 战斗已结束（battle 清空）`, after.battleNull, after);
    T(`${segName} 泡泡牌未混入永久牌库（未永久获得）`,
      !after.probeInDeck && !after.probeInEarned && !after.probeInBase, after);
    T(`${segName} 探险所得牌数量未增加`, after.earnedLen === after.earnedBefore, after);
    T(`${segName} 同名牌未被复制（持久牌库数量守恒）`,
      after.nameCount === after.nameCountBefore, after);
    T(`${segName} deck 总数未变（无凭空增减）`,
      after.deckLen === after.deckLenBefore, after);
    T(`${segName} 基础牌库总数未变`, after.baseLen === after.baseLenBefore, after);
    T(`${segName} 持久角色对象未被污染 bubbleCards`, after.charBubble === 0, after);
  }

  if (want("A")) await runSegment("A 我方普通牌（胜利）", "normal", "victory");
  if (want("B")) await runSegment("B 敌方偷来的牌（胜利）", "stolen", "victory");
  if (want("C")) await runSegment("C 消耗牌（胜利）", "consume", "victory");
  if (want("D")) await runSegment("D 我方普通牌（全军覆没）", "normal", "defeat");

  if (want("E")) {
    console.log("\n── E 战斗结束后泡泡区随旧战斗整体丢弃 ──");
    await startRegressionBattle(page);
    const s = await evalT(page, setupTpl("normal"), 15000, "setup:E");
    if (s?.ok) {
      await playAndStore(page, "E");
      const mid = await evalT(page, snapTpl, 15000, "snap:E");
      T("E 第一场已存入泡泡区", !!mid?.bubbleLen, mid);
      // 记住旧战斗与其 unit 的对象身份
      await evalT(page, `(() => {
        const b = window.state.battle;
        window.__oldBattle = b; window.__oldUnit = b?.allies?.[0];
        return true;
      })()`, 15000, "mark:E");
      await clickRetreat(page);
      const after = await evalT(page, `(() => {
        const st = window.state;
        const oldU = window.__oldUnit, oldB = window.__oldBattle;
        const reach = [];
        if ((st.chars || []).includes(oldU)) reach.push("chars");
        if (st.battle === oldB) reach.push("battle");
        if (st.battle && (st.battle.allies || []).includes(oldU)) reach.push("battle.allies");
        return {
          battleNull: !st.battle,
          view: st.view,
          // 旧 unit 是否仍挂在某条可达路径上 —— 空即随旧战斗一并丢弃
          reach,
          // 旧 unit 自身仍持着泡泡牌（对象还在，只是已不可达）
          oldUnitBubble: (oldU?.bubbleCards || []).length,
          charBubble: (st.chars || []).filter(c => c.bubbleCards?.length).length,
        };
      })()`, 15000, "after:E");
      if (after) {
        T("E 战斗已结束（旧 battle 已丢弃）", after.battleNull, after);
        T("E 泡泡区随旧战斗整体丢弃（未挂任何持久路径）",
          after.reach.length === 0, after);
        T("E 旧 unit 仍持有泡泡牌（说明是整体丢弃而非单独清理）",
          after.oldUnitBubble > 0, after);
        T("E 持久角色对象未被污染 bubbleCards", after.charBubble === 0, after);
        T("E 已回到大厅", after.view === "hall", after);
      }
    }
  }

  if (want("R")) {
    console.log("\n── R 反向验证（注入故障，预期红）──");
    await startRegressionBattle(page);
    const s = await evalT(page, setupTpl("stolen"), 15000, "setup:R");
    if (s?.ok) {
      await playAndStore(page, "R");
      // 注入故障：把泡泡区的牌塞进持久牌库，模拟「敌方牌被永久获得」+「凭空复制」
      const inj = await evalT(page, `(() => {
        const st = window.state, b = st.battle, u = b.allies[0];
        const card = (u.bubbleCards || [])[0];
        if (!card) return false;
        st.explore = st.explore || {};
        st.explore.earned = st.explore.earned || { cards: [] };
        st.explore.earned.cards.push(card);
        st.deck.push(card);
        return true;
      })()`, 15000, "inject:R");
      T("R 注入成功", inj === true, { inj });
      await clickRetreat(page);
      const after = await evalT(page, afterTpl, 15000, "after:R");
      // 以下四项**预期失败**：断言若恒真就抓不到这类 BUG
      T("R 反向：应检出被永久获得（预期红）", !after?.probeInEarned, after);
      T("R 反向：应检出 earned 增加（预期红）",
        after?.earnedLen === after?.earnedBefore, after);
      T("R 反向：应检出同名牌被复制（预期红）",
        after?.nameCount === after?.nameCountBefore, after);
      T("R 反向：应检出 deck 增加（预期红）",
        after?.deckLen === after?.deckLenBefore, after);
    }
  }

  const bad = relevantErrors(errors);
  T("无 JS 错误", bad.length === 0, bad.slice(0, 3));
  console.log(`\n结果：${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})();
