// 机械AI龙【机尾机枪】(全体攻击) × 星野海一【半魅魔血】(受击挂起类技能) 是否断续
// 真实浏览器 + 真实 damage 出口 + 真实点击「不交」；不改产品源码。
// 运行：node /data/workspace/check-tailgun-continuation-live.js
const path = require("path");
const { chromium } = require("playwright");
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || "/data/workspace/.pw-browsers";
const { openGame, startFreshGame, dismissOpeningStory } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const results = [];
const check = (n, ok, d = "") => { results.push({ n, ok: !!ok, d }); console.log(`${ok ? "OK  " : "FAIL"} ${n}${d ? " — " + JSON.stringify(d) : ""}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const SETUP = `(() => {
  const st = window.state, b = st.battle;
  const kaiichi = b.allies[0];
  kaiichi.name = "星野海一";
  kaiichi.ref = "hoshino_kaiichi";
  kaiichi.skills = [{ name: "半魅魔血", type: "trigger", icon: "🔵",
    text: "当你受到生命值伤害后，你摸3张牌，然后可以选择至多3张手牌并将这些牌交给一名其他友方角色。" }];
  b.allies.forEach(u => { u.hand = []; u.hp = 300; u.maxHp = 300;
    u.stats = Object.assign({}, u.stats, { handLimit: 99 }); });
  // 把敌方 0 号改造成机械AI龙（真实技能模块按 ai 判定）
  const dragon = b.enemies[0];
  dragon.ai = "ruins_dragon"; dragon.name = "机械AI龙";
  dragon.hp = 999; dragon.maxHp = 999;
  dragon.stats = Object.assign({}, dragon.stats, { attack: 6, magic: 6 });
  dragon.hand = []; dragon.ruinsHitsThisTurn = 1; dragon.ruinsGunFired = false;
  b.locked = false;
  b.kaiichiShare = null; b.kaiichiShareQueue = null; b.kaiichiShareScheduled = false;
  b.demonInvasionResume = null; b.reactionQueue = null;
  b.manualDodge = null; b.manualDodgeResume = null;
  b.animQueue = []; b.phase = 4; b.activeUid = dragon.uid;
  window.__enq = [];
  const orig = window.BattleReactionQueue.enqueue;
  window.BattleReactionQueue.enqueue = function (state, actions) {
    window.__enq.push((Array.isArray(actions) ? actions : [actions]).map(a => a && a.kind));
    return orig.apply(this, arguments);
  };
  if (window.BattleLog && window.BattleLog.clear) window.BattleLog.clear(st);
  window.render && window.render();
  return { allies: b.allies.length, damage: typeof window.__realDamage, dragon: dragon.ai };
})()`;

// 触发真实 fireTailGun：龙受到一次 slash 伤害，计数达阈值 → 机尾机枪扫全体
const TRIGGER = `(() => {
  const st = window.state, b = st.battle;
  const dragon = b.enemies[0];
  const fake = { uid: "fake", side: "enemy", ai: "normal", name: "攻击者", stats: {}, hp: 100 };
  window.__hpBefore = b.allies.map(u => ({ name: u.name, hp: u.hp }));
  window.RuinsDragonSkills.afterDamage(st, fake, dragon,
    { name: "杀（普攻）", type: "slash" }, 10, window.__realDamage, window.__realDirect);
  return { gunFired: dragon.ruinsGunFired, enq: window.__enq };
})()`;

const SNAP = `(() => {
  const b = window.state && window.state.battle;
  if (!b) return null;
  return { locked: !!b.locked, share: !!(b.kaiichiShare || (b.kaiichiShareQueue || []).length),
    enq: (b.reactionQueue || []).length, resume: !!b.demonInvasionResume,
    animQ: (b.animQueue || []).length, hp: b.allies.map(u => u.hp) };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errs = [];
  page.on("pageerror", e => errs.push(e.message));
  page.on("console", m => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); });
  // 捕获真实 lifecycle.damage：bundle 给 window.BattleDamage 赋值时包装工厂，
  // 工厂被调用后把返回的 damage/directDamage 存到全局，供真实技能复现使用。
  await page.addInitScript(() => {
    let real = null;
    Object.defineProperty(window, "BattleDamage", {
      configurable: true,
      get() {
        if (!real) return undefined;
        return function (...args) {
          const api = real.apply(this, args);
          window.__realDamage = api.damage;
          window.__realDirect = api.directDamage;
          return api;
        };
      },
      set(v) { real = v; },
    });
  });
  await openGame(page);
  await startFreshGame(page);
  await dismissOpeningStory(page);
  await page.evaluate(ids => { window.state.hallModal = "testBattle"; window.state.testAllies = ids; window.render(); },
    ["hoshino_kaiichi", "besta_doll", "manny", "elrana"]);
  await page.locator("[data-start-test-battle]").waitFor({ state: "visible" });
  await page.evaluate(() => {
    window.state.testEnemies = [0, 1];
    window.GameAssets.preloadBattle = async () => {};
    window.state.settings.battleSpeed = 2;
    window.BattleFX.playBattleStart = cb => cb && cb();
    window.BattleLines.intro = () => 0;
    window.render();
  });
  await page.locator("[data-start-test-battle]").click();
  await page.locator(".battle-screen").waitFor({ state: "visible" });
  await page.evaluate(() => {
    const b = window.state.battle;
    window.state.settings.battleSpeed = 1;
    b.animQueue = []; b.locked = false; b.phase = 4;
    b.activeUid = b.enemies[0].uid;
    window.BattleEffects.recover(window.state);
  });

  const setup = await page.evaluate(SETUP);
  check("真实 4 人队伍 + 真实 damage 出口就绪", setup.allies === 4 && setup.damage === "function" && setup.dragon === "ruins_dragon", setup);

  const trig = await page.evaluate(TRIGGER);
  check("机尾机枪真实触发", trig.gunFired === true, trig);

  // 提示条 shareVisible 要求动画队列清空，先让真实动画层 drain
  await page.evaluate(() => window.BattleEffects.recover(window.state));
  await page.waitForFunction(() => {
    const b = window.state?.battle;
    return !window.BattleEffects?.animating && !(b?.animQueue || []).length;
  }, null, { timeout: 12000 }).catch(() => {});
  let sawShare = false;
  for (let i = 0; i < 40; i++) {
    const s = await page.evaluate(SNAP);
    if (s && s.share) { sawShare = true; break; }
    await sleep(120);
  }
  const mid = await page.evaluate(SNAP);
  check("半魅魔血交牌窗挂起（battle.locked）", sawShare && mid.locked, mid);

  // 真实点击「不交」解除挂起（等提示条可见，不靠瞬时 DOM）
  let clicked = false;
  const skip = page.locator("[data-kaiichi-share-skip]").first();
  try { await skip.waitFor({ state: "visible", timeout: 8000 }); await skip.click(); clicked = true; } catch (e) {}
  check("「不交」按钮可点击", clicked);
  for (let i = 0; i < 60; i++) {
    const s = await page.evaluate(SNAP);
    if (s && !s.locked && !s.share && !s.enq && !s.resume && !s.animQ) break;
    await sleep(150);
  }
  await sleep(500);
  const final = await page.evaluate(SNAP);
  const before = await page.evaluate("window.__hpBefore || []");
  const took = final.hp.map((hp, i) => before[i] ? before[i].hp - hp : null);
  check("交牌解除后无残留锁定/队列", !final.locked && !final.share && !final.enq && !final.resume, final);
  check("后续 3 名目标全部结算（未被吞）", took.slice(1).every(v => v > 0), { took, enqCalls: await page.evaluate("window.__enq") });
  const armor = await page.evaluate(() => window.state.battle.enemies[0].block || 0);
  check("护甲按 4 段实际伤害累加（含队列续跑段）", armor === 24, { armor, took });

  // 对照：同一队伍下用真实【机枪扫杀】走 sweepDamage/captureHitContinuation
  const cmp = await page.evaluate(() => {
    const st = window.state, b = st.battle;
    const src = ["marketCards", "eliteCards", "baseDeck", "cardCodex"]
      .reduce((a, k) => a.concat(Array.isArray(window.GameData[k]) ? window.GameData[k] : []), [])
      .find(c => c.name === "机枪扫杀");
    if (!src) return { err: "card not found" };
    b.allies.forEach(u => { u.hp = 300; u.hand = []; });
    b.locked = false; b.kaiichiShare = null; b.kaiichiShareQueue = null;
    b.kaiichiShareScheduled = false; b.reactionQueue = null; b.demonInvasionResume = null;
    b.animQueue = [];
    const caster = b.enemies[1] || b.enemies[0];
    const card = Object.assign({}, src, { noIntentCost: true, _playedFromHand: true });
    window.BattleSystem.useCard(st, caster, b.allies[0], card);
    return { hp: b.allies.map(u => u.hp) };
  });
  await page.evaluate(() => window.BattleEffects.recover(window.state));
  await page.waitForFunction(() => {
    const b = window.state?.battle;
    return !window.BattleEffects?.animating && !(b?.animQueue || []).length;
  }, null, { timeout: 12000 }).catch(() => {});
  for (let i = 0; i < 40; i++) {
    const s = await page.evaluate(SNAP);
    if (s && s.share) {
      const sk = page.locator("[data-kaiichi-share-skip]").first();
      try { await sk.waitFor({ state: "visible", timeout: 8000 }); await sk.click(); } catch (e) {}
      break;
    }
    await sleep(120);
  }
  for (let i = 0; i < 60; i++) {
    const s = await page.evaluate(SNAP);
    if (s && !s.locked && !s.share && !s.enq && !s.resume && !s.animQ) break;
    await sleep(150);
  }
  const cmpHp = await page.evaluate(() => window.state.battle.allies.map(u => u.hp));
  check("对照：真正【机枪扫杀】4 人全部结算", !cmp.err && cmpHp.every(h => h < 300), { cmpHp });

  check("无 JS 错误", errs.length === 0, errs.slice(0, 3));
  await browser.close();
  const bad = results.filter(r => !r.ok);
  console.log(`RESULT ${results.length - bad.length}/${results.length}`);
  if (bad.length) { bad.forEach(b => console.log("  FAILED", b.n)); process.exit(1); }
})().catch(e => { console.error("FATAL", e.stack); process.exit(1); });
