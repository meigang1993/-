// 冰心双刺剑：口径由「摸到」改为「获得」。
// 重点验证两类非摸牌的获得路径：
//   ① 影舞步（技能判定收牌 → gainCards 动画）
//   ② 其他角色交牌（收获分享等 → giveCards 动画）
// 同时校验改写牌面不破坏手牌数统计（syncIncomingHand 用 hand.includes(card) 计数）。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
function check(name, cond, extra) {
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
}
const T = (n, c, x) => { total++; pass += check(n, c, x); };

const drain = page => page.waitForFunction(() => {
  const b = window.state?.battle;
  return !window.BattleEffects?.animating && !window.BattleEffects?.draining
    && !(b?.animQueue?.length);
}, null, { timeout: 20000 });

// ===== ① 影舞步：连续判定收黑色牌（gainCards）=====
const shadowTpl = relics => `(() => {
  const st = window.state, b = st.battle;
  const e = b.enemies[0];
  b.animQueue = []; b.locked = false;
  e.ai = "ruins_hilde"; e.hp = 200; e.maxHp = 200;
  e.battleRelics = ${JSON.stringify(relics)};
  e.hand = []; e.discard = [];
  // deck.pop() 从尾部取，故黑牌要放在尾部才会先被判定到。
  e.deck = [
    { name: "杀（普攻）", type: "slash", suit: "♥", scale: "attack" },
    { name: "杀（普攻）", type: "slash", suit: "♣", scale: "attack" },
    { name: "杀（普攻）", type: "slash", suit: "♠", scale: "attack" }
  ];
  st.log = [];
  window.RuinsEliteSkills.prepare(st, e, null);
  window.render();
  return { queued: (b.animQueue || []).map(q => q.type) };
})()`;

const shadowPeek = `(() => {
  const e = window.state.battle.enemies[0];
  const st = window.state;
  return {
    hand: (e.hand || []).map(c => ({ name: c.name, noIntent: !!c.noIntentCost,
      temp: !!c.temporary, void: !!c.void, pending: !!c._pendingDraw })),
    visual: e.visualHandCount,
    logs: (st.log || []).map(String).filter(t => /冰心双刺剑|影舞步/.test(t)).slice(0, 6),
  };
})()`;

// ===== ② 交牌：收获分享把实体单体杀交给队友（giveCards）=====
const giveTpl = (relics, killName, sweep) => `(() => {
  const st = window.state, b = st.battle;
  const giver = b.allies[0], recv = b.allies[1];
  b.animQueue = []; b.locked = false;
  st.log = [];
  giver.battleRelics = [];
  recv.battleRelics = ${JSON.stringify(relics)};
  const card = { name: ${JSON.stringify(killName)}, type: "slash", suit: "♠",
    scale: "attack"${sweep ? ", sweep: true, targetless: true" : ""} };
  // 记下原牌对象引用：syncIncomingHand 用 hand.includes(card) 统计手牌数，
  // 若转换时换成新对象，includes 会判 false → 手牌数显示漏加。
  window.__probeCard = card;
  giver.hand = [card]; recv.hand = [];
  b.millerShare = { unitUid: giver.uid, cards: [card] };
  const r = window.MillerSkills.resolveShare(st, recv.uid, {}) || {};
  window.render();
  return { ok: !!r.ok, shared: !!r.shared,
    queued: (b.animQueue || []).map(q => q.type) };
})()`;

const givePeek = `(() => {
  const b = window.state.battle, st = window.state;
  const recv = b.allies[1];
  return {
    hand: (recv.hand || []).map(c => ({ name: c.name, noIntent: !!c.noIntentCost,
      pending: !!c._pendingDraw })),
    sameObject: (recv.hand || []).includes(window.__probeCard),
    landedCalls: (window.__landedCalls || []).slice(0, 6),
    logs: (st.log || []).map(String).filter(t => /冰心双刺剑|交给/.test(t)).slice(0, 6),
  };
})()`;

// ===== ③ 摸牌路径回归（不得被改坏）=====
const drawTpl = relics => `(() => {
  const st = window.state, b = st.battle;
  const a = b.allies[0];
  b.animQueue = []; b.locked = false;
  a.battleRelics = ${JSON.stringify(relics)};
  a.hand = []; a.discard = [];
  a.deck = [{ name: "杀（普攻）", type: "slash", suit: "♠", scale: "attack" }];
  st.log = [];
  window.BattleSystem.draw(a, 1, b, null);
  window.render();
  return { queued: (b.animQueue || []).map(q => q.type) };
})()`;

const drawPeek = `(() => {
  const a = window.state.battle.allies[0], st = window.state;
  return {
    hand: (a.hand || []).map(c => ({ name: c.name, noIntent: !!c.noIntentCost,
      pending: !!c._pendingDraw })),
    logs: (st.log || []).map(String).filter(t => /冰心双刺剑/.test(t)).slice(0, 4),
  };
})()`;

// ===== ④ 偷牌：stealCard 动画（偷窃/勾爪陷阱/吸魔杀等）=====
const stealTpl = relics => `(() => {
  const st = window.state, b = st.battle;
  const thief = b.allies[0], victim = b.enemies[0];
  b.animQueue = []; b.locked = false;
  st.log = [];
  thief.battleRelics = ${JSON.stringify(relics)};
  victim.battleRelics = [];
  thief.hand = []; victim.hand = [];
  const card = { name: "杀（普攻）", type: "slash", suit: "♠", scale: "attack" };
  window.__stealCard = card;
  // 偷牌路径：牌先进 thief 手牌，再推 stealCard 动画（toUid 为获得者）
  card._pendingDraw = true;
  thief.hand.push(card);
  b.animQueue.push({ type: "stealCard", fromUid: victim.uid, fromSide: victim.side,
    toUid: thief.uid, toSide: thief.side, count: 1, cards: [card] });
  window.render();
  return { queued: (b.animQueue || []).map(q => q.type) };
})()`;

const stealPeek = `(() => {
  const b = window.state.battle, st = window.state;
  const thief = b.allies[0];
  return {
    hand: (thief.hand || []).map(c => ({ name: c.name, noIntent: !!c.noIntentCost,
      pending: !!c._pendingDraw, conv: c.convertedFrom || null })),
    sameObject: (thief.hand || []).includes(window.__stealCard),
    logs: (st.log || []).map(String).filter(t => /冰心双刺剑/.test(t)).slice(0, 4),
  };
})()`;

// ===== ⑤ 转换产物打出后进入弃牌堆：应还原为原牌 =====
const playTpl = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false; st.log = [];
  const me = b.allies[0], foe = b.enemies[0];
  me.battleRelics = ["冰心双刺剑"]; foe.battleRelics = [];
  foe.hp = 300; foe.maxHp = 300; foe.hand = [];
  me.hp = 300; me.maxHp = 300; me.hand = [];
  me.pileStats = me.pileStats || {};
  me.pileStats.discard = [];
  const card = { name: "杀（普攻）", type: "slash", suit: "♠", scale: "attack" };
  window.__orig = card;
  me.hand = [card];
  b.phase = 4; b.activeUid = me.uid;
  const n = window.RuinsRelicEffects.afterCardsLanded({
    type: "gainCards", uid: me.uid, side: "ally", count: 1, cards: [card],
  });
  window.__playedName = me.hand[0] && me.hand[0].name;
  const ok = window.BattleSystem.playActiveCard(st, 0, foe.uid);
  // 出牌区快照必须在打出瞬间抓取：endPlay 会清空 b.played，
  // 等到结算后再读必然是空数组，断言会恒假。
  const playedNow = (b.played || []).map(c => ({ name: c.name, conv: c.convertedFrom || null,
    by: c._playedByName || null, act: c._playedAction || null }));
  return { converted: n, playedName: window.__playedName, ok,
    handLeft: me.hand.length, playedNow };
})()`;

const discardPeek = `(() => {
  const st = window.state, b = st.battle;
  const me = b.allies[0];
  const dump = arr => (arr || []).map(c => ({ name: c.name, type: c.type,
    conv: c.convertedFrom || null }));
  return { discard: dump(me.pileStats?.discard), played: dump(b.played),
    orig: { name: window.__orig.name, conv: window.__orig.convertedFrom || null } };
})()`;

// ===== ⑥ 交牌还原：米勒【收获分享】把已转换的【刺杀】交给队友 =====
// 关键场景：交出方装备了冰心双刺剑，手牌已是【刺杀】；牌离开其手牌区必须还原，
// 否则队友（无饰品）会拿到一张本不该存在的【刺杀】，原牌【杀】永久消失。
const giveRevertTpl = recvRelics => `(() => {
  const st = window.state, b = st.battle;
  const giver = b.allies[0], recv = b.allies[1];
  b.animQueue = []; b.locked = false; st.log = [];
  // 落位钩子：记录每次 afterCardsLanded 的真实入参与转换结果。
  // drain 期间战斗可能继续推进（敌方行动、受伤弃牌），手牌快照会失真；
  // 钩子记录的是转换发生那一刻的结果，不受后续流程污染。
  window.__landedCalls = [];
  const origLanded = window.RuinsRelicIceDagger?.afterCardsLanded;
  if (origLanded && !origLanded.__hooked) {
    const wrapped = function (ev) {
      const rec = { type: ev?.type, uid: ev?.uid, toUid: ev?.toUid,
        before: (ev?.cards || []).map(c => c.name) };
      const r = origLanded.apply(this, arguments);
      rec.converted = r;
      rec.after = (ev?.cards || []).map(c => ({ name: c.name,
        noIntent: !!c.noIntentCost, conv: c.convertedFrom || null }));
      // 对象身份：获得者手牌里必须是同一个对象，否则 syncIncomingHand 的
      // hand.includes(card) 会漏计手牌数。必须在落位当刻采样，晚一步牌可能已被弃。
      const tgt = ev?.toUid && b.allies.concat(b.enemies || [])
        .find(u => u.uid === ev.toUid);
      rec.sameObjectAfter = !!tgt && (ev?.cards || [])
        .every(c => (tgt.hand || []).includes(c));
      window.__landedCalls.push(rec);
      return r;
    };
    wrapped.__hooked = true;
    window.RuinsRelicIceDagger.afterCardsLanded = wrapped;
  }
  giver.battleRelics = ["冰心双刺剑"];
  recv.battleRelics = ${JSON.stringify(recvRelics)};
  // 作弊：放宽手牌上限。否则交牌后队友会在动画期间因手牌上限把这张牌弃掉
  // （正常弃牌逻辑，与还原无关），导致收牌断言偶发失败。
  recv.stats = recv.stats || {}; recv.stats.handLimit = 99;
  giver.stats = giver.stats || {}; giver.stats.handLimit = 99;
  // 彻底重置：上一场景可能留下状态牌（如眩晕）、残血与出牌区记录，
  // 不清会在动画期间给交出方塞进新牌，让收牌断言偶发失败。
  [giver, recv].forEach(u => {
    u.hp = u.maxHp || 300; u.statusCards = [];
    u.pileStats = { discard: [], consumed: [] };
  });
  b.played = []; b.shownPlayed = [];
  recv.hand = []; giver.hand = [];
  const card = { name: "杀（普攻）", type: "slash", suit: "♠", scale: "attack" };
  window.__probeCard = card;
  giver.hand = [card];
  // 模拟交出方已获得并转换：手牌里此时是【刺杀】
  window.RuinsRelicEffects.afterCardsLanded({
    type: "gainCards", uid: giver.uid, side: "ally", count: 1, cards: [card],
  });
  const beforeName = (giver.hand[0] || {}).name;
  b.millerShare = { unitUid: giver.uid, cards: [card] };
  const r = window.MillerSkills.resolveShare(st, recv.uid, {}) || {};
  const recvImmediate = (recv.hand || []).map(c => c.name);
  window.render();
  return { ok: !!r.ok, shared: !!r.shared, beforeName,
    allies: b.allies.map(u => u.name + "(hp" + u.hp + ")"),
    recvName: recv.name, recvHp: recv.hp, recvImmediate,
    queued: (b.animQueue || []).map(q => q.type) };
})()`;

const giveRevertPeek = `(() => {
  const b = window.state.battle, st = window.state;
  const recv = b.allies[1], giver = b.allies[0];
  return {
    recvHand: (recv.hand || []).map(c => ({ name: c.name, noIntent: !!c.noIntentCost,
      conv: c.convertedFrom || null })),
    recvHp: recv.hp, recvAlive: recv.hp > 0,
    recvDiscard: (recv.pileStats?.discard || []).map(c => c.name),
    recvConsumed: (recv.pileStats?.consumed || []).map(c => c.name),
    giverHand: (giver.hand || []).map(c => c.name),
    giverHasProbe: (giver.hand || []).includes(window.__probeCard),
    sameObject: (recv.hand || []).includes(window.__probeCard),
    landedCalls: (window.__landedCalls || []).slice(0, 6),
    logs: (st.log || []).map(String).filter(t => /冰心双刺剑|交给/.test(t)).slice(0, 6),
  };
})()`;

// ===== ⑦ 弃置还原：转换牌被弃置/作代价时走 BattleCards.put 统一出口 =====
const discardRevertTpl = `(() => {
  const st = window.state, b = st.battle;
  const me = b.allies[0];
  b.animQueue = []; b.locked = false;
  me.battleRelics = ["冰心双刺剑"];
  me.pileStats = me.pileStats || {};
  me.pileStats.discard = [];
  const card = { name: "杀（普攻）", type: "slash", suit: "♠", scale: "attack" };
  me.hand = [card];
  window.RuinsRelicEffects.afterCardsLanded({
    type: "gainCards", uid: me.uid, side: "ally", count: 1, cards: [card],
  });
  const inHand = (me.hand[0] || {}).name;
  me.hand.splice(0, 1);
  window.BattleCards.put(b, me, card, "discard");
  return { inHand,
    discard: (me.pileStats.discard || []).map(c => ({ name: c.name,
      type: c.type, conv: c.convertedFrom || null })) };
})()`;


(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", e => errors.push(String(e)));
  await openGame(page);
  await startRegressionBattle(page);

  const sizes = await page.evaluate(() => ({
    allies: window.state.battle.allies.map(u => u.name),
    enemies: window.state.battle.enemies.map(u => u.name),
  }));
  console.log(`[队伍] 我方 ${JSON.stringify(sizes.allies)} 敌方 ${JSON.stringify(sizes.enemies)}`);

  // ---------- ① 影舞步 ----------
  console.log("\n=== ① 影舞步（gainCards）===");
  await page.evaluate(shadowTpl([]));
  await drain(page);
  await page.waitForTimeout(300);
  const sdBase = await page.evaluate(shadowPeek);
  console.log(`[对照] 无饰品 手牌 ${JSON.stringify(sdBase.hand.map(c => c.name))}`);
  T("影舞步对照：未装备时不转换（手牌为【杀】）",
    sdBase.hand.length === 2 && sdBase.hand.every(c => c.name === "杀（普攻）"),
    sdBase);

  await page.evaluate(shadowTpl(["冰心双刺剑"]));
  await drain(page);
  await page.waitForTimeout(300);
  const sd = await page.evaluate(shadowPeek);
  console.log(`[冰心双刺剑] 手牌 ${JSON.stringify(sd.hand)}`);
  console.log(`  日志 ${JSON.stringify(sd.logs.slice(0, 3))}`);
  T("影舞步：获得的黑色【杀】转换为【刺杀】",
    sd.hand.length === 2 && sd.hand.every(c => c.name === "刺杀"), sd);
  T("影舞步：转换产物不消耗杀意",
    sd.hand.length === 2 && sd.hand.every(c => c.noIntent), sd);
  T("影舞步：转换产物保留 temporary/void（仍是本回合临时牌）",
    sd.hand.length === 2 && sd.hand.every(c => c.temp && c.void), sd);
  T("影舞步：转换后不再处于飞行待定状态",
    sd.hand.length === 2 && sd.hand.every(c => !c.pending), sd);
  T("影舞步：触发日志出现冰心双刺剑",
    sd.logs.some(t => /冰心双刺剑/.test(t)), sd.logs);

  // ---------- ② 交牌 ----------
  console.log("\n=== ② 交牌（giveCards）===");
  await page.evaluate(giveTpl([], "杀（普攻）", false));
  await drain(page);
  await page.waitForTimeout(300);
  const gvBase = await page.evaluate(givePeek);
  console.log(`[对照] 无饰品 收到 ${JSON.stringify(gvBase.hand)} 同对象=${gvBase.sameObject}`);
  T("交牌对照：未装备时不转换（收到【杀】）",
    gvBase.hand.length === 1 && gvBase.hand[0].name === "杀（普攻）", gvBase);
  T("交牌对照：未转换时手牌仍持有原牌对象", gvBase.sameObject === true, gvBase);

  await page.evaluate(giveTpl(["冰心双刺剑"], "杀（普攻）", false));
  await drain(page);
  await page.waitForTimeout(300);
  const gv = await page.evaluate(givePeek);
  console.log(`[冰心双刺剑] 收到 ${JSON.stringify(gv.hand)} 同对象=${gv.sameObject}`);
  console.log(`  日志 ${JSON.stringify(gv.logs.slice(0, 3))}`);
  T("交牌：收到的实体单体【杀】转换为【刺杀】",
    gv.hand.length === 1 && gv.hand[0].name === "刺杀", gv);
  T("交牌：转换产物不消耗杀意",
    gv.hand.length === 1 && gv.hand[0].noIntent, gv);
  T("交牌：改写牌面后手牌仍持有原牌对象（手牌数统计不漏加）",
    gv.sameObject === true, gv);
  T("交牌：触发日志出现冰心双刺剑",
    gv.logs.some(t => /冰心双刺剑/.test(t)), gv.logs);

  // 群体杀不该被转换
  await page.evaluate(giveTpl(["冰心双刺剑"], "机枪扫杀", true));
  await drain(page);
  await page.waitForTimeout(300);
  const gvSweep = await page.evaluate(givePeek);
  console.log(`[群体杀] 收到 ${JSON.stringify(gvSweep.hand)}`);
  T("交牌：群体【杀】不属于单体杀，不转换",
    gvSweep.hand.length === 1 && gvSweep.hand[0].name === "机枪扫杀", gvSweep);

  // ---------- ③ 摸牌回归 ----------
  console.log("\n=== ③ 摸牌路径回归 ===");
  await page.evaluate(drawTpl(["冰心双刺剑"]));
  await drain(page);
  await page.waitForTimeout(300);
  const dw = await page.evaluate(drawPeek);
  console.log(`[摸牌] 手牌 ${JSON.stringify(dw.hand)}`);
  T("摸牌：实体单体【杀】仍转换为【刺杀】（原路径未被改坏）",
    dw.hand.length === 1 && dw.hand[0].name === "刺杀", dw);
  T("摸牌：转换产物不消耗杀意",
    dw.hand.length === 1 && dw.hand[0].noIntent, dw);

  // ---------- ④ 偷牌 ----------
  console.log("\n=== ④ 偷牌（stealCard）===");
  await page.evaluate(stealTpl([]));
  await drain(page);
  await page.waitForTimeout(300);
  const stBase = await page.evaluate(stealPeek);
  console.log(`[对照] 无饰品 偷到 ${JSON.stringify(stBase.hand.map(c => c.name))}`);
  T("偷牌对照：未装备时不转换（偷到的是【杀】）",
    stBase.hand.length === 1 && stBase.hand[0].name === "杀（普攻）", stBase);

  await page.evaluate(stealTpl(["冰心双刺剑"]));
  await drain(page);
  await page.waitForTimeout(300);
  const stl = await page.evaluate(stealPeek);
  console.log(`[冰心双刺剑] 偷到 ${JSON.stringify(stl.hand)} 同对象=${stl.sameObject}`);
  console.log(`  日志 ${JSON.stringify(stl.logs.slice(0, 3))}`);
  T("偷牌：偷到的实体单体【杀】转换为【刺杀】",
    stl.hand.length === 1 && stl.hand[0].name === "刺杀", stl);
  T("偷牌：转换产物不消耗杀意",
    stl.hand.length === 1 && stl.hand[0].noIntent, stl);
  T("偷牌：转换产物带 convertedFrom（保留来源牌名）",
    stl.hand.length === 1 && stl.hand[0].conv === "杀（普攻）", stl);
  T("偷牌：改写牌面后手牌仍持有原牌对象（手牌数统计不漏加）",
    stl.sameObject === true, stl);
  T("偷牌：触发日志出现冰心双刺剑",
    stl.logs.some(t => /冰心双刺剑/.test(t)), stl.logs);

  // ---------- ⑤ 转换产物进弃牌堆后不变回原牌 ----------
  console.log("\n=== ⑤ 转换产物打出后进弃牌堆 ===");
  const pl = await page.evaluate(playTpl);
  console.log(`[打出] converted=${pl.converted} 打出牌=${pl.playedName} ok=${pl.ok}`);
  T("前置：转换成功且打出的就是【刺杀】",
    pl.converted === 1 && pl.playedName === "刺杀" && pl.ok === true, pl);
  await page.waitForTimeout(2500);
  await drain(page).catch(() => {});
  await page.locator("[data-end-play]").click().catch(async () => {
    await page.evaluate(() => {
      try { window.BattleSystem.endPlay(window.state, window.render); } catch (e) {}
    });
  });
  await page.waitForTimeout(3000);
  await drain(page).catch(() => {});
  await page.waitForTimeout(1500);
  const dp = await page.evaluate(discardPeek);
  console.log(`[弃牌堆] ${JSON.stringify(dp.discard)}`);
  const origInDiscard = (dp.discard || []).filter(c => c.name === "杀（普攻）");
  T("弃牌堆：转换后的【刺杀】离手后还原为原牌【杀（普攻）】",
    origInDiscard.length >= 1, dp);
  T("弃牌堆：不留【刺杀】（原牌不会被永久替换，牌库不会凭空累积刺杀）",
    !(dp.discard || []).some(c => c.name === "刺杀"), dp);
  T("出牌区：玩家看到的仍是打出的【刺杀】（显示快照在还原前已生成）",
    (pl.playedNow || []).some(c => c.name === "刺杀"), pl);

  // ---------- ⑥ 交牌还原（米勒·收获分享）----------
  console.log("\n=== ⑥ 交牌还原：交出方手牌已是【刺杀】 ===");
  const gr0 = await page.evaluate(giveRevertTpl([]));
  console.log(`[交出前] 交出方手牌=${gr0.beforeName} ok=${gr0.ok} shared=${gr0.shared}`);
  console.log(`  我方=${JSON.stringify(gr0.allies)} 接收者=${gr0.recvName}(hp${gr0.recvHp}) 交后立即=${JSON.stringify(gr0.recvImmediate)}`);
  T("交牌还原：前置成立——交出方手牌确实是【刺杀】",
    gr0.beforeName === "刺杀" && gr0.ok === true && gr0.shared === true, gr0);
  await drain(page);
  await page.waitForTimeout(300);
  const gr = await page.evaluate(giveRevertPeek);
  console.log(`[队友无饰品] 收到 ${JSON.stringify(gr.recvHand)}`);
  // 用筛选而非 length==1：动画期间可能有状态牌（如眩晕）进入手牌，卡死数量会偶发失败
  const grOrig = gr.recvHand.filter(c => c.name === "杀（普攻）");
  const grGive = (gr.landedCalls || []).filter(r => r.type === "giveCards");
  const grReverted = grGive.some(r => (r.after || []).some(c => c.name === "杀（普攻）"));
  T("交牌还原：队友未装备时收到还原后的原牌【杀（普攻）】",
    grOrig.length >= 1 || grReverted, gr);
  T("交牌还原：队友未装备时不会收到【刺杀】",
    !gr.recvHand.some(c => c.name === "刺杀"), gr);
  T("交牌还原：交出方不再持有该牌（已转交）",
    gr.giverHasProbe === false, gr);
  const grSame = grGive.some(r => r.sameObjectAfter === true);
  T("交牌还原：还原后仍是同一对象（手牌数统计不漏加）",
    gr.sameObject === true || grSame, gr);

  // 队友也装备了冰心双刺剑：应先还原、再按获得者重新转换
  const gr2Setup = await page.evaluate(giveRevertTpl(["冰心双刺剑"]));
  await drain(page);
  await page.waitForTimeout(300);
  const gr2 = await page.evaluate(giveRevertPeek);
  console.log(`[队友有饰品] 收到 ${JSON.stringify(gr2.recvHand)}`);
  const gr2Ice = gr2.recvHand.filter(c => c.name === "刺杀");
  const gr2Give = (gr2.landedCalls || []).filter(r => r.type === "giveCards");
  const gr2Hit = gr2Give.some(r => (r.after || []).some(c => c.name === "刺杀" && c.noIntent));
  T("交牌还原：队友装备时先还原再重新转换为【刺杀】",
    gr2Ice.length >= 1 || gr2Hit, gr2);
  T("交牌还原：重新转换后仍不消耗杀意",
    (gr2Ice.length >= 1 && gr2Ice[0].noIntent) || gr2Hit, gr2);

  // ---------- ⑦ 弃置还原 ----------
  console.log("\n=== ⑦ 弃置还原（BattleCards.put 统一出口）===");
  const dr = await page.evaluate(discardRevertTpl);
  console.log(`[弃置] 手牌中=${dr.inHand} 弃牌堆=${JSON.stringify(dr.discard)}`);
  T("弃置还原：弃置前手牌中是【刺杀】",
    dr.inHand === "刺杀", dr);
  T("弃置还原：进入弃牌堆的是原牌【杀（普攻）】",
    dr.discard.length === 1 && dr.discard[0].name === "杀（普攻）", dr);
  T("弃置还原：弃牌堆中不残留【刺杀】",
    !dr.discard.some(c => c.name === "刺杀"), dr);


  console.log(`\n结果 ${pass}/${total}，页面错误 ${errors.length}`);
  if (errors.length) console.log(errors.slice(0, 5).join("\n"));
  await browser.close();
  process.exit(pass === total && !errors.length ? 0 : 1);
})();
