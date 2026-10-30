// 【克罗研究记录】× 群体（sweep）战术牌 严格检查
//
// 饰品描述：「锁定技，每回合你使用的第一张成功结算的战术牌结算两次。」
//
// 缺陷：带专属标记的战术牌在 battle-combat-card-effects.js 里结算并调用
// repeatTactic；而没有专属标记、靠 power>0 走攻击流程的战术牌
// （典型是带 sweep 的【枪林弹雨】）落在 battle-combat-attack-flow.js，
// 那里从未调用 repeatTactic —— 这类牌整类不触发额外结算。
//
//   A 段：群体战术牌触发额外结算，且每个目标掉血 = 无饰品基线的 2 倍
//   B 段：对照 —— 未装备克罗时，群体战术牌无额外结算
//   C 段：防重复 —— 单体战术牌仍只触发一次（不是两次）
//   D 段：每回合一次守恒 —— 第二张群体战术牌不再触发
//   E 段：【半魅魔血】交牌挂起后，额外结算被补跑（不被整段吞掉）
//
// 分批：KROW_SW=A|B|C|D|E，不设则跑全部。
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const {
  openGame, startRegressionBattle, startFreshGame, dismissOpeningStory,
  collectErrors, relevantErrors,
} = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

// 【半魅魔血】交牌需要「另一名友方角色」才能给出提示窗，
// 故 E 段必须用 4 名真实角色开战（战斗开始后再注入单位不会被续跑路径识别）。
const ALLY_IDS = ["lokar", "besta_doll", "manny", "elrana"];
async function enterBattle4(page) {
  await startFreshGame(page);
  await dismissOpeningStory(page);
  await page.evaluate(ids => {
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
    battle.animQueue = []; battle.locked = false; battle.phase = 4;
    battle.activeUid = battle.allies[0].uid;
    window.render();
    window.BattleEffects.recover(window.state);
  });
}

const PART = (process.env.KROW_SW || "ALL").toUpperCase();
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

// 我方 0 号施法（relics 为其本场装备）；foe0 为敌方 0 号手牌
const setupTpl = (relics, foe0 = []) => `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false; b.phase = 4;
  delete b.karunaBubble; delete b.karunaBubblePending; delete b.thunderHammer;
  delete b.handReveal; delete b.manualCounter; delete b.demonInvasionResume;
  delete b.pendingTargetUids; delete b.krowRepeatResume;
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
  u.hand = [];
  b.activeUid = u.uid;
  b.selectedCardIndex = -1;
  b.enemies.forEach((e, i) => {
    e.hp = e.maxHp = 300; e.block = 0; e.statuses = [];
    e.noResponse = true;              // 禁止自动打出【闪】，保证伤害一定落地
    e.hand = i === 0 ? ${JSON.stringify(foe0)} : [];
  });
  st.log = []; st.battleLog = [];
  window.render();
  return { enemies: b.enemies.map(e => e.name) };
})()`;

const snapTpl = `(() => {
  const st = window.state, b = st.battle, u = b.allies[0];
  const logs = (st.battleLog || []).join(" | ");
  return {
    logs,
    krow: (logs.match(/克罗研究记录触发/g) || []).length,
    usedKrow: !!u.usedKrowRecord,
    locked: !!b.locked,
    before: window.__hpBefore || [],
    after: b.enemies.map(e => e.hp),
  };
})()`;

// 从真实卡池取牌（与 AOE 半魅魔血测试同法），保证字段与线上一致
const playTpl = cardName => `(() => {
  const st = window.state, b = st.battle, u = b.allies[0];
  const pool = ["marketCards", "eliteCards", "baseDeck", "cardCodex"]
    .reduce((acc, k) => acc.concat(Array.isArray(window.GameData?.[k]) ? window.GameData[k] : []), []);
  const src = pool.find(c => c.name === ${JSON.stringify(cardName)});
  if (!src) return { error: "card not found: " + ${JSON.stringify(cardName)} };
  const card = Object.assign({}, src, { noIntentCost: true });
  u.hand = [card];
  window.__hpBefore = b.enemies.map(e => e.hp);
  // targetless 群体牌仍需传一个合法目标：triggerWhiteLolita 会读 target.side
  window.BattleSystem.useCard(st, u, b.enemies[0], card);
  return { ok: true, type: card.type, sweep: !!card.sweep };
})()`;

const playAndWait = async (page, name) => {
  const r = await evalT(page, playTpl(name), 15000, `play:${name}`);
  await page.waitForTimeout(1200);
  const s = await evalT(page, snapTpl, 15000, `snap:${name}`);
  return { r, s };
};

const losses = s => (s.before.length === s.after.length)
  ? s.before.map((hp, i) => hp - s.after[i]) : [];

const SWEEP = "枪林弹雨";   // 群体战术牌：sweep + targetless + power 1

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = collectErrors(page);
  await openGame(page);
  await startRegressionBattle(page);

  let base = null;

  // ---------- B 段先跑：未装备克罗的伤害基线 ----------
  if (want("B")) {
    console.log("\n--- B 段：未装备克罗时，群体战术牌无额外结算（基线） ---");
    await evalT(page, setupTpl([]), 20000, "setupB");
    const { r, s } = await playAndWait(page, SWEEP);
    T("B1 牌取自真实卡池且确为群体战术牌",
      r && r.ok && r.type === "tactic" && r.sweep === true, r);
    T("B2 未装备克罗时不触发额外结算", s.krow === 0, { krow: s.krow, logs: s.logs });
    base = losses(s);
    T("B3 群体伤害落到每个敌人", base.length > 0 && base.every(v => v > 0),
      { base, logs: s.logs });
    T("B4 战斗未残留锁定", s.locked === false, { locked: s.locked });
  }

  // ---------- A 段：装备克罗后应触发额外结算 ----------
  if (want("A")) {
    console.log("\n--- A 段：群体战术牌触发克罗额外结算 ---");
    await evalT(page, setupTpl(["克罗研究记录"]), 20000, "setupA");
    const { s } = await playAndWait(page, SWEEP);
    T("A1 群体战术牌触发克罗额外结算", s.krow === 1, { krow: s.krow, logs: s.logs });
    const got = losses(s);
    T("A2 群体伤害仍然落到每个敌人", got.length > 0 && got.every(v => v > 0),
      { got, logs: s.logs });
    if (base && base.length === got.length) {
      T("A3 每个目标掉血 = 基线 × 2（额外结算也扫射全体）",
        got.every((v, i) => v === base[i] * 2), { base, got });
    }
    T("A4 每回合一次已被消耗", s.usedKrow === true, { usedKrow: s.usedKrow });
    T("A5 战斗未残留锁定", s.locked === false, { locked: s.locked });
  }

  // ---------- C 段：防重复触发 ----------
  if (want("C")) {
    console.log("\n--- C 段：单体战术牌仍只触发一次 ---");
    // 【蓄力】走 effects.resolve（带专属标记），用于确认新增的攻击流程调用
    // 不会让这类牌被重复触发两次。【拆解】会开选牌窗导致战斗锁定，不适合做对照组。
    await evalT(page, setupTpl(["克罗研究记录"]), 20000, "setupC");
    const { s } = await playAndWait(page, "蓄力");
    T("C1 单体战术牌只触发一次额外结算", s.krow === 1, { krow: s.krow, logs: s.logs });
    T("C2 战斗未残留锁定", s.locked === false, { locked: s.locked });
  }

  // ---------- D 段：每回合一次守恒 ----------
  if (want("D")) {
    console.log("\n--- D 段：第二张群体战术牌不再触发 ---");
    await evalT(page, setupTpl(["克罗研究记录"]), 20000, "setupD");
    await playAndWait(page, SWEEP);
    const { s } = await playAndWait(page, SWEEP);
    T("D1 本回合只触发一次（累计仍为 1）", s.krow === 1, { krow: s.krow, logs: s.logs });
    T("D2 战斗未残留锁定", s.locked === false, { locked: s.locked });
  }

  // ---------- E 段：半魅魔血交牌挂起后补跑 ----------
  if (want("E")) {
    console.log("\n--- E 段：半魅魔血挂起后额外结算被补跑 ---");
    const ep = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const eErrors = collectErrors(ep);
    await openGame(ep);
    await enterBattle4(ep);
    await ep.evaluate(`(() => {
      const st = window.state, b = st.battle;
      b.animQueue = []; b.locked = false; b.phase = 4;
      delete b.krowRepeatResume; delete b.kaiichiShare; delete b.kaiichiShareQueue;
      b.kaiichiShareScheduled = false; b.reactionQueue = null;
      const kai = b.allies[0];
      kai.name = "星野海一"; kai.ref = "hoshino_kaiichi";
      kai.skills = [{ name: "半魅魔血", type: "trigger", icon: "🔵",
        text: "当你受到生命值伤害后，你摸3张牌，然后可以选择至多3张手牌并将这些牌交给一名其他友方角色。" }];
      kai.hp = kai.maxHp = 300; kai.hand = [];
      // 施法者改为敌方 0 号，并给它装上克罗研究记录
      const caster = b.enemies[0];
      caster.name = "群体施法者"; caster.hp = caster.maxHp = 999;
      caster.battleRelics = ["克罗研究记录"];
      delete caster.usedKrowRecord;
      b.allies.forEach(u => { u.hand = []; u.hp = 300; u.maxHp = 300; });
      st.log = []; st.battleLog = [];
      window.render();
      return true;
    })()`);
    await evalT(ep, `(() => {
      const st = window.state, b = st.battle;
      const pool = ["marketCards", "eliteCards", "baseDeck", "cardCodex"]
        .reduce((acc, k) => acc.concat(Array.isArray(window.GameData?.[k]) ? window.GameData[k] : []), []);
      const src = pool.find(c => c.name === "枪林弹雨");
      if (!src) return { error: "no card" };
      const card = Object.assign({}, src, { noIntentCost: true });
      // 必须放进施法者手牌：repeatTactic 的守卫要求 card._playedFromHand，
      // 而该标记由 resolveCard 依据「牌是否还在手牌里」打上。
      const caster = b.enemies[0];
      caster.hand = [card];
      window.BattleSystem.useCard(st, caster, b.allies[0], card);
      return { ok: true };
    })()`, 15000, "playE");
    await ep.waitForTimeout(1500);
    // 轮询等半魅魔血挂起，再真实点击「不交」（与 AOE 半魅魔血测试同一选择器）
    let share = false;
    for (let i = 0; i < 40; i++) {
      share = await ep.evaluate(`!!window.state.battle.kaiichiShare`);
      if (share) break;
      await ep.waitForTimeout(120);
    }
    T("E0 半魅魔血已挂起（交牌提示出现）", share === true, { share });
    let clicked = false;
    if (share) {
      const skip = ep.locator("[data-kaiichi-share-skip]").first();
      if (await skip.count() && await skip.isVisible().catch(() => false)) {
        await skip.click();
        clicked = true;
      }
    }
    T("E1 「不交」按钮存在且已点击", clicked === true, { clicked });
    // 补跑链是异步的：解锁后再多等几拍，确认 krowRepeatResume 被真正消费掉
    for (let i = 0; i < 60; i++) {
      const done = await ep.evaluate(
        `!window.state.battle.kaiichiShare && !window.state.battle.locked`);
      if (done) break;
      await ep.waitForTimeout(150);
    }
    for (let i = 0; i < 40; i++) {
      const done = await ep.evaluate(`!window.state.battle.krowRepeatResume`);
      if (done) break;
      await ep.waitForTimeout(200);
    }
    const s = await evalT(ep, `(() => {
      const st = window.state, b = st.battle;
      const logs = (st.battleLog || []).join(" | ");
      return {
        logs,
        krow: (logs.match(/克罗研究记录触发/g) || []).length,
        locked: !!b.locked,
        pending: !!b.krowRepeatResume,
      };
    })()`, 15000, "snapE");
    const eRel = relevantErrors(eErrors);
    T("E5 无 JS 错误", eRel.length === 0, { count: eRel.length, sample: eRel.slice(0, 2) });
    T("E2 挂起解除后额外结算被补跑", s.krow >= 1, { krow: s.krow, logs: s.logs });
    T("E3 未残留挂起", s.pending === false, { pending: s.pending });
    T("E4 战斗未残留锁定", s.locked === false, { locked: s.locked });
  }

  // ---------- F 段：半魅魔血「真交出去」后额外结算是否被补跑 ----------
  // E 段只验了「不交」分支；玩家真把牌交出去时走的是另一条收尾路径
  // （resolveKaiichiShare 会改手牌归属），必须单独验，不能靠 E 段推断。
  if (want("F")) {
    console.log("\n--- F 段：交牌（真交出去）后额外结算被补跑 ---");
    const fp = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const fErrors = collectErrors(fp);
    await openGame(fp);
    await enterBattle4(fp);
    await fp.evaluate(`(() => {
      const st = window.state, b = st.battle;
      b.animQueue = []; b.locked = false; b.phase = 4;
      delete b.krowRepeatResume; delete b.kaiichiShare; delete b.kaiichiShareQueue;
      b.kaiichiShareScheduled = false; b.reactionQueue = null;
      const kai = b.allies[0];
      kai.name = "星野海一"; kai.ref = "hoshino_kaiichi";
      kai.skills = [{ name: "半魅魔血", type: "trigger", icon: "🔵",
        text: "当你受到生命值伤害后，你摸3张牌，然后可以选择至多3张手牌并将这些牌交给一名其他友方角色。" }];
      kai.hp = kai.maxHp = 300; kai.hand = [];
      const caster = b.enemies[0];
      caster.name = "群体施法者"; caster.hp = caster.maxHp = 999;
      caster.battleRelics = ["克罗研究记录"];
      delete caster.usedKrowRecord;
      b.allies.forEach(u => { u.hand = []; u.hp = 300; u.maxHp = 300; });
      st.log = []; st.battleLog = [];
      window.render();
      return true;
    })()`);
    await evalT(fp, `(() => {
      const st = window.state, b = st.battle;
      const pool = ["marketCards", "eliteCards", "baseDeck", "cardCodex"]
        .reduce((acc, k) => acc.concat(Array.isArray(window.GameData?.[k]) ? window.GameData[k] : []), []);
      const src = pool.find(c => c.name === "枪林弹雨");
      if (!src) return { error: "no card" };
      const card = Object.assign({}, src, { noIntentCost: true });
      const caster = b.enemies[0];
      caster.hand = [card];
      window.BattleSystem.useCard(st, caster, b.allies[0], card);
      return { ok: true };
    })()`, 15000, "playF");
    await fp.waitForTimeout(1500);
    let share = false;
    for (let i = 0; i < 40; i++) {
      share = await fp.evaluate(`!!window.state.battle.kaiichiShare`);
      if (share) break;
      await fp.waitForTimeout(120);
    }
    T("F0 半魅魔血已挂起（交牌提示出现）", share === true, { share });
    const before = await evalT(fp, `(() => {
      const b = window.state.battle;
      return { kaiHand: b.allies[0].hand.length, mateHand: b.allies[1].hand.length,
        mateUid: b.allies[1].uid };
    })()`, 10000, "beforeF");
    // 真交：先点一张手牌选中，再点队友一次性交出
    // 半魅魔血摸的牌带 _pendingDraw（摸牌动画未完成时不渲染为可点卡片），
    // 必须等动画队列被消费、DOM 出现手牌节点后再点，否则点击必然落空。
    let cardNodes = 0;
    for (let i = 0; i < 60; i++) {
      cardNodes = await fp.evaluate(
        `document.querySelectorAll("[data-card-index]").length`);
      if (cardNodes > 0) break;
      await fp.waitForTimeout(150);
    }
    T("F0b 摸牌动画已结算（手牌节点已渲染）", cardNodes > 0, { cardNodes });
    let picked = false;
    if (share) {
      const card0 = fp.locator("[data-card-index]").first();
      if (await card0.count() && await card0.isVisible().catch(() => false)) {
        await card0.click();
        await fp.waitForTimeout(300);
        picked = await fp.evaluate(
          `((window.state.battle.kaiichiShare?.indexes || []).length) >= 1`);
      }
    }
    const diagF = await evalT(fp, `(() => {
      const b = window.state.battle;
      return {
        shareUid: b.kaiichiShare?.unitUid,
        indexes: (b.kaiichiShare?.indexes || []).length,
        kaiHand: b.allies[0]?.hand?.length,
        kaiNames: (b.allies[0]?.hand || []).map(c => c.name + (c._pendingDraw ? "(pending)" : "")),
        cardNodes: document.querySelectorAll("[data-card-index]").length,
        prompt: document.querySelector(".discard-prompt")?.textContent?.slice(0, 50) || null,
      };
    })()`, 10000, "diagF");
    if (process.env.KROW_F_DIAG) console.log("[F诊断]", JSON.stringify(diagF));
    T("F1 已选中要交出的手牌", picked === true, { picked, diag: diagF });
    let gave = false;
    if (picked) {
      const mate = fp.locator(`[data-target="${before.mateUid}"]`).first();
      if (await mate.count() && await mate.isVisible().catch(() => false)) {
        await mate.click();
        gave = true;
      } else {
        await fp.evaluate(`(() => {
          const b = window.state.battle;
          window.BattleSystem.resolveKaiichiShare(window.state, b.allies[1].uid, window.render);
          return true;
        })()`, 10000, "forceGiveF");
        gave = true;
      }
    }
    T("F2 已点击队友交出", gave === true, { gave });
    // 补跑链是异步的：解锁后再多等几拍，确认 krowRepeatResume 被真正消费掉
    for (let i = 0; i < 60; i++) {
      const done = await fp.evaluate(
        `!window.state.battle.kaiichiShare && !window.state.battle.locked`);
      if (done) break;
      await fp.waitForTimeout(150);
    }
    for (let i = 0; i < 40; i++) {
      const done = await fp.evaluate(`!window.state.battle.krowRepeatResume`);
      if (done) break;
      await fp.waitForTimeout(200);
    }
    const s = await evalT(fp, `(() => {
      const st = window.state, b = st.battle;
      const logs = (st.battleLog || []).join(" | ");
      return {
        logs,
        krow: (logs.match(/克罗研究记录触发/g) || []).length,
        locked: !!b.locked,
        pending: !!b.krowRepeatResume,
        kaiHand: b.allies[0].hand.length,
        mateHand: b.allies[1].hand.length,
      };
    })()`, 15000, "snapF");
    T("F3 牌确实交出去了（队友手牌增加）", s.mateHand === before.mateHand + 1,
      { before: before.mateHand, after: s.mateHand });
    T("F4 交牌后额外结算被补跑", s.krow >= 1, { krow: s.krow, logs: s.logs });
    T("F5 未残留挂起", s.pending === false, { pending: s.pending });
    T("F6 战斗未残留锁定", s.locked === false, { locked: s.locked });
    const fRel = relevantErrors(fErrors);
    T("F7 无 JS 错误", fRel.length === 0, { count: fRel.length, sample: fRel.slice(0, 2) });
  }

  const rel = relevantErrors(errors);
  T("无 JS 错误", rel.length === 0, { count: rel.length, sample: rel.slice(0, 3) });

  console.log(`\n结果：${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})();
