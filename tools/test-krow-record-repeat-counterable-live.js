// 【克罗研究记录】两处边界严格检查
//
// 饰品描述：「锁定技，每回合你使用的第一张成功结算的战术牌结算两次。」
//
// 缺陷一：【半魅魔血】交牌弹窗（battle.locked）挂起时，额外结算被整段吞掉。
//   交牌窗出现 → battle-card-effects 的「locked 就跳过」守卫直接不调 repeatTactic
//   → 交牌解决后也没有人补跑 → 这张战术牌的第二次结算彻底消失
//   （实测：krow 触发数 0、次数 also 未消耗）。
//   修法：去掉守卫，改由 repeatTactic 在挂起时暂存到 battle.krowRepeatResume，
//   弹窗解决后由 BattleManualContinuationResume 补跑（与格林机枪等续跑同口径）。
//   注意必须存快照：出牌收尾的 battle-card-cleanup 会 delete card._playedFromHand，
//   存原牌的话补跑时会被守卫挡掉（实测额外结算仍为 0）。
//
// 缺陷二：额外结算带 _skill 标记，而 isCounterableTactic 对「_skill 且非虚拟/转换」
//   一律判为不可响应 —— 于是被【看破】抵消第一次后，额外结算必定生效，
//   持有该饰品时对响应牌近乎免疫。现把 _repeat 加入可响应例外。
//
//   A 段：半魅魔血交牌挂起后，仍会补跑额外结算（真实点击「不交」）
//   B 段：对照 —— 无半魅魔血时行为不变
//   C 段：isCounterableTactic 判据（_repeat 可响应；普通技能牌仍不可）
//   D 段：敌方持 2 张看破 —— 两次结算各被抵消一次，战术牌完全失效
//   E 段：敌方持 1 张看破 —— 只抵消一次，另一次照常生效
//
// 分批：KROW_RR=A|B|C|D|E，不设则跑全部。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const {
  openGame, startRegressionBattle, startFreshGame, dismissOpeningStory,
  collectErrors, relevantErrors,
} = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const PART = (process.env.KROW_RR || "ALL").toUpperCase();
const want = p => PART === "ALL" || PART.split(",").includes(p);

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}`
    + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

// —— A/B 段：必须用 4 名【真实】角色开局（allUnits 用 WeakMap 缓存首份快照）——
const ALLY_IDS = ["lokar", "besta_doll", "manny", "elrana"];
async function enterBattle4(page) {
  await startFreshGame(page);
  await dismissOpeningStory(page);
  await page.evaluate((ids) => {
    window.state.hallModal = "testBattle";
    window.state.testAllies = ids;
    window.render();
  }, ALLY_IDS);
  await page.locator("[data-start-test-battle]").waitFor({ state: "visible" });
  await page.evaluate(() => {
    window.state.testEnemies = [0, 1];
    window.GameAssets.preloadBattle = async () => {};
    window.state.settings.battleSpeed = 2;
    window.BattleFX.playBattleStart = callback => callback?.();
    window.BattleLines.intro = () => 0;
    window.render();
  });
  await page.locator("[data-start-test-battle]").click();
  await page.locator(".battle-screen").waitFor({ state: "visible" });
  await page.evaluate(() => {
    const battle = window.state.battle;
    window.state.settings.battleSpeed = 1;
    battle.animQueue = [];
    battle.locked = false;
    battle.phase = 4;
    battle.activeUid = battle.allies[0].uid;
    window.render();
    window.BattleEffects.recover(window.state);
  });
}

const setupBlood = (withBlood) => `(() => {
  const st = window.state, b = st.battle;
  const kaiichi = b.allies[0];
  kaiichi.name = "星野海一";
  kaiichi.ref = "hoshino_kaiichi";
  kaiichi.skills = ${withBlood ? JSON.stringify([{ name: "半魅魔血", type: "trigger", icon: "🔵", text: "受伤后摸3张并可交牌。" }]) : "[]"};
  b.allies.forEach(u => { u.hand = []; u.hp = 400; u.maxHp = 400;
    u.stats = Object.assign({}, u.stats, { handLimit: 99 }); });
  const caster = b.enemies[0];
  caster.name = "克罗施法者";
  caster.hp = 999; caster.maxHp = 999;
  caster.stats = Object.assign({}, caster.stats, { attack: 6, magic: 6 });
  caster.battleRelics = ["克罗研究记录"];
  delete caster.usedKrowRecord;
  const pool = ["marketCards","eliteCards","baseDeck","cardCodex"]
    .reduce((a,k)=>a.concat(Array.isArray(window.GameData?.[k])?window.GameData[k]:[]),[]);
  const src = pool.find(c => c.name === "魔王军入侵");
  if (!src) return { error: "no card" };
  caster.hand = [Object.assign({}, src, { noIntentCost: true, _playedFromHand: true })];
  b.activeUid = caster.uid;
  b.locked = false; b.kaiichiShare = null; b.kaiichiShareQueue = null;
  b.kaiichiShareScheduled = false; b.kaiichiShareScheduled = false;
  b.reactionQueue = null; b.animQueue = []; b.krowRepeatResume = null;
  b.cardResumeQueue = null;
  if (window.BattleLog && window.BattleLog.clear) window.BattleLog.clear(st);
  window.render();
  return { allies: b.allies.map(u => u.name) };
})()`;

const playBlood = `(() => {
  const st = window.state, b = st.battle, caster = b.enemies[0];
  window.__hpBefore = b.allies.map(u => u.hp);
  window.BattleSystem.useCard(st, caster, b.allies[0], caster.hand[0]);
  return true;
})()`;

const snapBlood = `(() => {
  const st = window.state, b = st && st.battle;
  if (!b) return null;
  const logs = (st.battleLog || []).join(" | ");
  return {
    locked: !!b.locked,
    share: !!(b.kaiichiShare || (b.kaiichiShareQueue || []).length),
    pend: !!b.krowRepeatResume,
    tail: (b.cardResumeQueue || []).length,
    krow: (logs.match(/克罗研究记录触发/g) || []).length,
    blood: (logs.match(/半魅魔血/g) || []).length,
    sweep: (logs.match(/魔王军入侵对/g) || []).length,
    usedKrow: !!b.enemies[0].usedKrowRecord,
    hp: b.allies.map(u => u.hp),
    logs,
  };
})()`;

async function waitIdle(page, ms = 12000) {
  await page.waitForFunction(() => {
    const b = window.state && window.state.battle;
    if (!b) return true;
    return !window.BattleEffects?.animating && !(b.animQueue || []).length;
  }, null, { timeout: ms }).catch(() => {});
}

async function runBlood(page, withBlood) {
  const s0 = await page.evaluate(setupBlood(withBlood));
  if (s0.error) { T("找到魔王军入侵", false, s0); return null; }
  await page.evaluate(playBlood);
  let sawShare = false;
  for (let i = 0; i < 40; i++) {
    const s = await page.evaluate(snapBlood);
    if (s && s.share) { sawShare = true; break; }
    await sleep(120);
  }
  await waitIdle(page, 8000);
  const mid = await page.evaluate(snapBlood);
  if (withBlood) {
    T("A1 半魅魔血触发（交牌窗挂起）", sawShare && mid.locked,
      { share: mid.share, locked: mid.locked });
    T("A2 挂起期间已暂存额外结算", mid.pend === true,
      { pend: mid.pend, tail: mid.tail });
  }
  // 真实点击「不交」
  if (mid.share) {
    const skip = page.locator("[data-kaiichi-share-skip]").first();
    if (await skip.count() && await skip.isVisible().catch(() => false)) await skip.click();
  }
  for (let i = 0; i < 60; i++) {
    const s = await page.evaluate(snapBlood);
    if (s && !s.share && !s.locked) break;
    await sleep(150);
  }
  await sleep(600);
  await waitIdle(page, 8000);
  return page.evaluate(snapBlood);
}

// —— C/D/E 段：单页回归战斗 ——
const TACTIC = {
  name: "测试战术牌", type: "tactic", suit: "♥", text: "",
  targetless: false, drawCards: 1,
};
const KANPO = { name: "看破", type: "response", suit: "♠", text: "", counterTactic: true };
const KANPO2 = { ...KANPO, suit: "♣" };

const setupTpl = (relics, foe0) => `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false; b.phase = 4;
  delete b.karunaBubble; delete b.karunaBubblePending; delete b.thunderHammer;
  delete b.handReveal; delete b.manualCounter; delete b.krowRepeatResume;
  delete b.demonInvasionResume; delete b.pendingTargetUids;
  const u = b.allies[0];
  u.name = "测试员";
  u.stats = { attack: 5, magic: 5, speed: 10, maxHp: 300, bloodlust: 9, handLimit: 20 };
  u.hp = u.maxHp = 300; u.block = 0; u.intent = 9; u.skills = [];
  u.battleRelics = ${JSON.stringify(relics)};
  delete u.usedKrowRecord;
  u.pileStats = u.pileStats || {}; u.pileStats.discard = [];
  u.discard = u.pileStats.discard;
  u.hand = [${JSON.stringify(TACTIC)}];
  b.activeUid = u.uid;
  b.selectedCardIndex = -1;
  b.enemies.forEach((e, i) => {
    e.hp = e.maxHp = 300; e.block = 0; e.statuses = []; e.noResponse = false;
    e.hand = i === 0 ? ${JSON.stringify(foe0)} : [];
  });
  st.log = []; st.battleLog = [];
  window.render();
  return { foe0: b.enemies[0].hand.map(c => c.name) };
})()`;

const snapTpl = `(() => {
  const st = window.state, b = st.battle, u = b.allies[0];
  const logs = (st.battleLog || []).join(" | ");
  return {
    logs,
    krow: (logs.match(/克罗研究记录触发/g) || []).length,
    countered: (logs.match(/看破，使/g) || []).length,
    resolved: (logs.match(/摸1张牌/g) || []).length,
    usedKrow: !!u.usedKrowRecord,
    locked: !!b.locked,
    pend: !!b.krowRepeatResume,
  };
})()`;

async function playAndWait(page, name) {
  await page.evaluate(`(() => {
    const st = window.state, b = st.battle, u = b.allies[0];
    const card = u.hand.find(c => c.name === ${JSON.stringify(name)});
    if (!card) return false;
    window.BattleSystem.useCard(st, u, card.targetless ? null : b.enemies[0], card);
    return true;
  })()`);
  await page.waitForTimeout(1200);
  return page.evaluate(snapTpl);
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];

  // ============ A/B 段 ============
  if (want("A") || want("B")) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    page.on("pageerror", e => errors.push(String(e.message || e)));
    await openGame(page);
    await enterBattle4(page);

    if (want("A")) {
      console.log("\n--- A 段：半魅魔血交牌挂起后仍补跑额外结算 ---");
      const fin = await runBlood(page, true);
      const before = await page.evaluate("window.__hpBefore || []");
      const took = (fin.hp || []).map((hp, i) => (before[i] || 0) - hp);
      T("A3 交牌后补跑了额外结算", fin.krow === 1,
        { krow: fin.krow, pend: fin.pend, logs: fin.logs });
      T("A4 每回合一次已被消耗", fin.usedKrow === true, { usedKrow: fin.usedKrow });
      T("A5 第二次结算真实生效（掉血次数为第一次的两倍量级）",
        fin.sweep >= 6, { sweep: fin.sweep, took });
      T("A6 无残留锁定/暂存", !fin.locked && !fin.pend && !fin.share,
        { locked: fin.locked, pend: fin.pend, share: fin.share });
    }
    if (want("B")) {
      console.log("\n--- B 段：对照 —— 无半魅魔血时行为不变 ---");
      const fin = await runBlood(page, false);
      T("B1 未触发半魅魔血", fin.blood === 0, { blood: fin.blood });
      T("B2 正常触发一次额外结算", fin.krow === 1, { krow: fin.krow });
      T("B3 无残留锁定", !fin.locked && !fin.pend, { locked: fin.locked, pend: fin.pend });
    }
    await page.close();
  }

  // ============ C/D/E 段 ============
  if (want("C") || want("D") || want("E")) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    page.on("pageerror", e => errors.push(String(e.message || e)));
    await openGame(page);
    await startRegressionBattle(page);

    if (want("C")) {
      console.log("\n--- C 段：isCounterableTactic 判据 ---");
      const r = await page.evaluate(`(() => {
        const f = window.CardUtils.isCounterableTactic;
        return {
          plain: !!f({ name: "拆解", type: "tactic" }),
          skill: !!f({ name: "技能牌", type: "tactic", _skill: true }),
          repeat: !!f({ name: "额外结算", type: "tactic", _skill: true, _repeat: true }),
          virtual: !!f({ name: "虚拟", type: "tactic", _skill: true, virtual: true }),
          conv: !!f({ name: "转换", type: "tactic", _skill: true, convertedFrom: "x" }),
          ignore: !!f({ name: "不可响应", type: "tactic", ignoreResponse: true }),
        };
      })()`);
      T("C1 普通战术牌可响应", r.plain === true, r);
      T("C2 技能牌本体仍不可响应", r.skill === false, r);
      T("C3 克罗额外结算（_repeat）可响应", r.repeat === true, r);
      T("C4 虚拟/转换战术牌仍可响应", r.virtual && r.conv, r);
      T("C5 ignoreResponse 仍不可响应", r.ignore === false, r);
    }

    if (want("D")) {
      console.log("\n--- D 段：敌方持 2 张看破 —— 两次结算各被抵消一次 ---");
      await page.evaluate(setupTpl(["克罗研究记录"], [KANPO, KANPO2]));
      const s = await playAndWait(page, "测试战术牌");
      T("D1 看破抵消了两次", s.countered === 2, { countered: s.countered, logs: s.logs });
      T("D2 额外结算仍触发（第二次使用，不是被吞）", s.krow === 1,
        { krow: s.krow, logs: s.logs });
      T("D3 战术牌完全失效（无摸牌战报）", s.resolved === 0,
        { resolved: s.resolved, logs: s.logs });
      T("D4 未残留锁定", s.locked === false, { locked: s.locked });
    }

    if (want("E")) {
      console.log("\n--- E 段：敌方持 1 张看破 —— 只抵消一次，另一次生效 ---");
      await page.evaluate(setupTpl(["克罗研究记录"], [KANPO]));
      const s = await playAndWait(page, "测试战术牌");
      T("E1 只抵消一次", s.countered === 1, { countered: s.countered, logs: s.logs });
      T("E2 额外结算触发", s.krow === 1, { krow: s.krow });
      T("E3 未被抵消的那一次真实生效", s.resolved === 1,
        { resolved: s.resolved, logs: s.logs });
      await page.evaluate(setupTpl([], [KANPO]));
      const s2 = await playAndWait(page, "测试战术牌");
      T("E4 未装备时不触发额外结算（对照）", s2.krow === 0, { krow: s2.krow });
    }
    await page.close();
  }

  T("无页面 JS 错误", relevantErrors(errors).length === 0,
    relevantErrors(errors).slice(0, 3));
  console.log(`\n通过 ${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})();
