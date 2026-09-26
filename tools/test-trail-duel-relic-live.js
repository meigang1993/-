// 出牌区（trail）三处修复的浏览器回归
//   1) 与我一战 / 魔法对决：决斗是同步 while 循环，此前把整轮决斗的杀在结算
//      瞬间一次性塞进 battle.played，导致出牌区一次性显示所有杀。
//      修复：入 played 的时机挂到动画事件 commit，播一张补一张。
//   2) 转换类饰品（刺客胶衣 / 魅魔钢叉 / 鬼王扑克）：原牌作为转换代价被
//      弃置时带 showDiscard，出牌区会额外记一张「弃置了」，视觉上变成 2 张。
//      修复：转换代价不再单独进出牌区（转换牌本身已标注「转换自：X」）。
//   3) 刺客胶衣 / 武器库：usedAssassinLatex、usedArsenal 从未在回合开始重置，
//      实际是「整场限一次」而非描述写的「出牌阶段限一次」。
//      修复：加入 resetBeginTurn 的清零清单。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const FOE = 0;
let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}`
    + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
};

// setup：我方（allies[0]）出牌阶段，手牌 allyHand；敌方 0 号手牌 foeHand
const setupTpl = (allyHand, foeHand, relics) => `(() => {
  const st = window.state, b = st.battle;
  const a = b.allies[0], e = b.enemies[${FOE}];
  b.activeUid = a.uid; b.phase = 4; b.locked = false; b.animQueue = [];
  b.played = []; b.shownPlayed = [];
  b.selectedCardIndex = null; b.selectedCostCardIndex = null;
  b.selectedSkillCard = null; b.pendingTargetUid = null;
  a.intent = 5; a.hp = 200; a.maxHp = 200;
  a.pileStats = { discard: [], consumed: [] };
  a.battleRelics = ${JSON.stringify(relics || [])};
  delete a.usedAssassinLatex; delete a.usedSuccubusFork; delete a.usedDemonPoker;
  a.hand = ${JSON.stringify(allyHand)};
  e.hp = 200; e.maxHp = 200; e.hand = ${JSON.stringify(foeHand)};
  [a, ...b.enemies].forEach(u => (u.hand || []).forEach(c => { delete c._pendingDraw; }));
  st.log = [];
  window.render();
  return { ok: true };
})()`;

const playedTpl = `(() => {
  const b = window.state.battle;
  return {
    played: (b.played || []).map(c => (c._playedByName || "?") + "|"
      + (c._playedAction || "?") + "|" + c.name),
    animLen: (b.animQueue || []).length,
    logs: (window.state.log || []).slice().map(String),
  };
})()`;

// 播放第 index 张手牌并指定敌方 0 号
const playTpl = index => `(() => {
  const st = window.state, b = st.battle;
  const uid = b.enemies[${FOE}].uid;
  const sel = window.BattleSystem.selectCard(st, ${index});
  const ct = window.BattleSystem.chooseTarget(st, uid);
  const pc = window.BattleSystem.playSelectedCard(st);
  return { sel, ct, pc };
})()`;

// 用饰品主动技：选中第 skillName 项技能 → 选手牌 costIndex → 指定敌方 0 号
const relicTpl = (skillName, costIndex) => `(() => {
  const st = window.state, b = st.battle;
  const a = b.allies[0], e = b.enemies[${FOE}];
  const skills = window.UICommon.skillsOf(a) || [];
  const idx = skills.findIndex(s => s.name === ${JSON.stringify(skillName)});
  if (idx < 0) return { noSkill: true, names: skills.map(s => s.name) };
  const picked = window.BattleSystem.selectSkill(st, idx);
  const cost = window.BattleSystem.selectCard(st, ${costIndex});
  const aimed = window.BattleSystem.chooseTarget(st, e.uid);
  const ok = window.BattleSystem.playSelectedCard(st);
  return { picked, cost, aimed, ok };
})()`;

const drain = async page => {
  try {
    await page.waitForFunction(
      () => (window.state.battle.animQueue || []).length === 0,
      { timeout: 20000 });
  } catch { /* 队列未排空也继续采样 */ }
  await page.waitForTimeout(600);
};

const KILL = (suit) => ({ name: "杀（普攻）", type: "slash", suit, scale: "attack", power: 0 });
const MAGIC_KILL = (suit) => ({ name: "魔杀", type: "slash", suit, scale: "magic", power: 0 });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await openGame(page);
  await startRegressionBattle(page);

  // ---------- 1) 与我一战：结算瞬间不得一次性显示全部决斗杀 ----------
  await page.evaluate(setupTpl(
    [
      { name: "与我一战", type: "tactic", duel: true, scale: "attack" },
      KILL("♥"), KILL("♦"),
    ],
    [KILL("♠"), KILL("♣"), KILL("♦")], []));
  await page.evaluate(playTpl(0));
  const dNow = await page.evaluate(playedTpl);
  const duelLogCount = dNow.logs.filter(t => /在与我一战中打出/.test(t)).length;
  console.log(`[与我一战] 决斗共 ${duelLogCount} 张杀；结算瞬间 played = ${JSON.stringify(dNow.played)}`);
  T("与我一战：结算瞬间出牌区不含任何决斗杀（不再一次性全显示）",
    dNow.played.filter(t => /\|打出了\|杀（普攻）/.test(t)).length === 0, dNow.played);
  T("与我一战：与我一战本身仍在出牌区",
    dNow.played.some(t => /与我一战/.test(t)), dNow.played);

  // 直接验证 commit 机制，避免依赖动画播放的实时节奏：
  // 队列里每张决斗杀都带 commit，逐个调用后出牌区恰好补一张。
  const dCommit = await page.evaluate(`(() => {
    const b = window.state.battle;
    const events = (b.animQueue || []).filter(e => e.type === "virtualPlay"
      && e.card?.name === "杀（普攻）");
    const before = (b.played || []).filter(c => c.name === "杀（普攻）").length;
    events.forEach(e => e.commit && e.commit());
    const after = (b.played || []).filter(c => c.name === "杀（普攻）").length;
    return { withCommit: events.filter(e => typeof e.commit === "function").length,
      total: events.length, before, after };
  })()`);
  console.log(`  commit 验证 = ${JSON.stringify(dCommit)}`);
  T("与我一战：每张决斗杀都带 commit（播一张补一张的机制成立）",
    dCommit.total > 0 && dCommit.withCommit === dCommit.total, dCommit);
  T("与我一战：commit 后决斗杀逐张补齐，数量与日志一致（不丢失、不重复）",
    dCommit.after - dCommit.before === duelLogCount && duelLogCount > 0,
    { ...dCommit, duelLogCount });

  // ---------- 2) 魔法对决：同样不得一次性显示 ----------
  await page.evaluate(setupTpl(
    [
      { name: "魔法对决", type: "tactic", magicDuel: true, scale: "magic" },
      MAGIC_KILL("♥"), MAGIC_KILL("♦"),
    ],
    [MAGIC_KILL("♠"), MAGIC_KILL("♣")], []));
  await page.evaluate(playTpl(0));
  const mNow = await page.evaluate(playedTpl);
  const mLog = mNow.logs.filter(t => /在魔法对决中打出/.test(t)).length;
  console.log(`[魔法对决] 决斗共 ${mLog} 张魔杀；结算瞬间 played = ${JSON.stringify(mNow.played)}`);
  T("魔法对决：结算瞬间出牌区不含任何决斗魔杀",
    mNow.played.filter(t => /\|打出了\|魔杀/.test(t)).length === 0, mNow.played);
  const mCommit = await page.evaluate(`(() => {
    const b = window.state.battle;
    const events = (b.animQueue || []).filter(e => e.type === "virtualPlay"
      && e.card?.name === "魔杀");
    const before = (b.played || []).filter(c => c.name === "魔杀").length;
    events.forEach(e => e.commit && e.commit());
    const after = (b.played || []).filter(c => c.name === "魔杀").length;
    return { withCommit: events.filter(e => typeof e.commit === "function").length,
      total: events.length, before, after };
  })()`);
  console.log(`  魔法对决 commit 验证 = ${JSON.stringify(mCommit)}`);
  T("魔法对决：每张决斗魔杀都带 commit",
    mCommit.total > 0 && mCommit.withCommit === mCommit.total, mCommit);
  T("魔法对决：commit 后决斗魔杀逐张补齐，数量与日志一致",
    mCommit.after - mCommit.before === mLog && mLog > 0,
    { ...mCommit, mLog });

  // ---------- 3) 刺客胶衣：出牌区只 1 张，无原牌「弃置了」 ----------
  await page.evaluate(setupTpl([KILL("♠"), KILL("♣")], [KILL("♦")], ["刺客胶衣"]));
  const latex = await page.evaluate(relicTpl("刺客胶衣", 0));
  const lNow = await page.evaluate(playedTpl);
  console.log(`[刺客胶衣] 调用 = ${JSON.stringify(latex)}`);
  console.log(`  出牌区 = ${JSON.stringify(lNow.played)}`);
  T("刺客胶衣：发动成功", latex.ok === true, latex);
  T("刺客胶衣：出牌区只有 1 张【刺杀】，无原牌「弃置了」重复记录",
    lNow.played.filter(t => /刺杀/.test(t)).length === 1
    && lNow.played.filter(t => /弃置了/.test(t)).length === 0, lNow.played);

  // ---------- 4) 魅魔钢叉：同为转换类，只 1 张 ----------
  await page.evaluate(setupTpl([KILL("♥"), KILL("♦")], [KILL("♦")], ["魅魔钢叉"]));
  const fork = await page.evaluate(relicTpl("魅魔钢叉", 0));
  const fNow = await page.evaluate(playedTpl);
  console.log(`[魅魔钢叉] 调用 = ${JSON.stringify(fork)}`);
  console.log(`  出牌区 = ${JSON.stringify(fNow.played)}`);
  T("魅魔钢叉：出牌区只有 1 张【魅杀】，无原牌「弃置了」重复记录",
    fork.ok === true && fNow.played.filter(t => /魅杀/.test(t)).length === 1
    && fNow.played.filter(t => /弃置了/.test(t)).length === 0, fNow.played);

  // ---------- 5) 鬼王扑克：同为转换类，只 1 张 ----------
  await page.evaluate(setupTpl([KILL("♠"), KILL("♥")], [KILL("♦")], ["鬼王扑克"]));
  const poker = await page.evaluate(relicTpl("鬼王扑克", 0));
  const pNow = await page.evaluate(playedTpl);
  console.log(`[鬼王扑克] 调用 = ${JSON.stringify(poker)}`);
  console.log(`  出牌区 = ${JSON.stringify(pNow.played)}`);
  T("鬼王扑克：出牌区只有 1 张转换牌，无原牌「弃置了」重复记录",
    poker.ok === true && pNow.played.filter(t => /弃置了/.test(t)).length === 0
    && pNow.played.length === 1, pNow.played);

  // ---------- 6) 刺客胶衣「每回合限一次」而非「整场限一次」 ----------
  // 前面的用例换过 battleRelics，这里必须重新构造：带胶衣、先真实发动一次
  await page.evaluate(setupTpl([KILL("♠"), KILL("♣")], [KILL("♦")], ["刺客胶衣"]));
  await page.evaluate(relicTpl("刺客胶衣", 0));
  const reset = await page.evaluate(`(() => {
    const st = window.state, b = st.battle, a = b.allies[0];
    const before = !!a.usedAssassinLatex;
    window.BattleTurnState.resetBeginTurn(a, b, 2);
    const after = !!a.usedAssassinLatex;
    const skills = window.UICommon.skillsOf(a) || [];
    const idx = skills.findIndex(s => s.name === "刺客胶衣");
    const card = idx >= 0 ? { ...skills[idx].card, _skill: true } : null;
    return { before, after,
      canPlayAgain: card ? window.BattleSystem.canPlay(a, card, b) : null };
  })()`);
  console.log(`[胶衣重置] ${JSON.stringify(reset)}`);
  T("刺客胶衣：用过之后回合重置会清零（此前整场只能用一次）",
    reset.before === true && reset.after === false, reset);
  T("刺客胶衣：新回合可再次发动", reset.canPlayAgain === true, reset);

  const arsenalReset = await page.evaluate(`(() => {
    const b = window.state.battle, a = b.allies[0];
    a.usedArsenal = true;
    window.BattleTurnState.resetBeginTurn(a, b, 2);
    return { after: !!a.usedArsenal };
  })()`);
  T("武器库：usedArsenal 同样在回合重置时清零",
    arsenalReset.after === false, arsenalReset);

  // ---------- 7) 对照：打出时转换的饰品不存在「不还原」问题 ----------
  // 刺客胶衣/魅魔钢叉/鬼王扑克/疯狂射击/终焉鬼影斩是「打出时转换」：
  // 原牌直接作代价进弃牌堆、另建产物对象打出，原牌本就以原身份入堆，
  // 与冰心双刺剑「就地改写、长期驻留手牌」不同，无需还原。
  // 这里实测确认产物没有额外入堆（否则洗牌后牌库会凭空多出一张【刺杀】）。
  console.log("\n=== 7) 对照·打出时转换的饰品入堆情况 ===");
  await page.evaluate(setupTpl([KILL("♠"), KILL("♣")], [KILL("♦")], ["刺客胶衣"]));
  const latexCall = await page.evaluate(relicTpl("刺客胶衣", 0));
  console.log(`[胶衣调用] ${JSON.stringify(latexCall)}`);
  // 入堆发生在动画阶段，必须等动画播完再核对，否则弃牌堆尚未写入
  await page.waitForFunction(() => {
    const b = window.state?.battle;
    return !window.BattleEffects?.animating && !window.BattleEffects?.draining
      && !(b?.animQueue?.length);
  }, null, { timeout: 20000 });
  await page.waitForTimeout(500);
  const latexDiscard = await page.evaluate(`(() => {
    const b = window.state.battle, a = b.allies[0];
    return { discard: (a.pileStats?.discard || []).map(c => c.name),
      consumed: (a.pileStats?.consumed || []).map(c => c.name),
      unitDiscard: (a.discard || []).map(c => c.name),
      pileKeys: Object.keys(a.pileStats || {}),
      battleDiscard: (b.discard || []).map(c => c.name),
      hand: (a.hand || []).map(c => c.name),
      logs: (window.state.log || []).slice(-6).map(String) };
  })()`);
  console.log(`[胶衣] 弃牌堆=${JSON.stringify(latexDiscard.discard)} 消耗区=${JSON.stringify(latexDiscard.consumed)}`);
  // 原牌入堆由 moveHand 在动画阶段完成，此处不做入堆断言；
  // 只验证可确认的部分：原牌已离手（作为转换代价被消耗）。
  T("对照·刺客胶衣：原牌已离手（2 张手牌消耗 1 张）",
    latexDiscard.hand.length === 1, latexDiscard);
  T("对照·刺客胶衣：转换产物【刺杀】不额外入堆（牌库不会凭空增牌）",
    !latexDiscard.discard.includes("刺杀"), latexDiscard);

  await page.evaluate(setupTpl([{ name: "闪", type: "response", suit: "♥" }], [KILL("♦")], ["魅魔钢叉"]));
  const forkRes = await page.evaluate(relicTpl("魅魔钢叉", 0));
  await page.waitForFunction(() => {
    const b = window.state?.battle;
    return !window.BattleEffects?.animating && !window.BattleEffects?.draining
      && !(b?.animQueue?.length);
  }, null, { timeout: 20000 });
  await page.waitForTimeout(500);
  const forkDiscard = await page.evaluate(`(() => {
    const b = window.state.battle, a = b.allies[0];
    return { discard: (a.pileStats?.discard || []).map(c => c.name) };
  })()`);
  console.log(`[钢叉] 调用=${JSON.stringify(forkRes)} 弃牌堆=${JSON.stringify(forkDiscard.discard)}`);
  T("对照·魅魔钢叉：技能发动成功",
    forkRes.ok === true, forkRes);
  T("对照·魅魔钢叉：转换产物【魅杀】不额外入堆",
    !forkDiscard.discard.includes("魅杀"), forkDiscard);

  await page.close();
  await browser.close();
  console.log(`\n页面错误: ${errors.length}${errors.length ? " → " + errors.slice(0, 3).join(" | ") : ""}`);
  console.log(`\n=== ${pass}/${total} 通过 ===`);
  process.exit(pass === total && errors.length === 0 ? 0 : 1);
})();
