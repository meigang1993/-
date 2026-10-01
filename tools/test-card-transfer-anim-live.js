// 交牌类技能 · 飞行动画 专项检查
//
// 要回答的问题：
//   1) 每个「把牌从一名角色手牌转给另一名角色」的技能，有没有入队飞行动画事件？
//   2) 入队之后浏览器里有没有真的画出飞行卡牌（DOM）？
//
// 判定方式不是"看代码里有没有 push"，而是：
//   A. 调用真实触发入口后，battle.animQueue 里出现对应 type 的事件（count>0、cards 非空）
//   B. 真正播放（BattleEffects.drain）期间，MutationObserver 捕获到 .card-flight-inner 插入
//
// 覆盖的交牌入口：
//   希特威·心血之咒（受伤索牌）
//   凯瑟琳·窃取（转移敌方手牌给队友）
//   凯瑟琳·知识吸收（gainCards，回收用过的实体牌）
//   艾斯·勾爪陷阱（响应后夺取对方手牌）
//   狂鲨海盗团掠夺者·冲锋掠夺（单体杀指定目标时夺牌）
//   废墟·凋零者·魅魔吸取（实体战术牌命中后索牌）
//   兽人·自杀无人机·采精（夺取 2 张）
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}`
    + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
};

const installObserverTpl = `(() => {
  window.__flight = { count: 0, types: [] };
  if (window.__flightObs) window.__flightObs.disconnect();
  window.__flightObs = new MutationObserver(records => {
    records.forEach(record => {
      [...record.addedNodes].forEach(node => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const hit = node.matches?.(".card-flight-inner")
          ? node : node.querySelector?.(".card-flight-inner");
        if (!hit) return;
        window.__flight.count++;
        window.__flight.types.push(hit.parentElement?.className || "");
      });
    });
  });
  window.__flightObs.observe(document.body, { childList: true, subtree: true });
  return true;
})()`;

// 统一战斗环境：清队列、解锁、全员高血量，避免死亡打断
const baseTpl = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false; b.pendingVictory = false;
  b.allies.concat(b.enemies).forEach(u => {
    u.hp = 80; u.maxHp = 100; u.block = 0; u.hand = [];
  });
  st.log = [];
  window.render();
  window.BattleEffects.recover(st);
  return { allies: b.allies.length, foes: b.enemies.length };
})()`;

const drainTpl = `(async () => {
  const st = window.state;
  const before = (st.battle.animQueue || []).length;
  if (before) await window.BattleEffects.drain(st, () => window.render());
  let guard = 0;
  while ((window.BattleEffects.animating || window.BattleEffects.draining)
    && guard++ < 400) await new Promise(r => setTimeout(r, 25));
  await new Promise(r => setTimeout(r, 250));
  return {
    before,
    remaining: (st.battle.animQueue || []).length,
    flight: window.__flight ? window.__flight.count : -1,
  };
})()`;

// ── 1. 希特威·心血之咒 ────────────────────────────────────
const hitwellTpl = `(() => {
  const st = window.state, b = st.battle;
  const t = b.allies[0], src = b.enemies[0];
  t.name = "希特威"; t.ref = "hitwell"; t.id = "hitwell";
  t.stats = { attack: 3, magic: 3, speed: 4 };
  t.tempAttack = 0; t.tempMagic = 0;
  t.skills = [{ name: "心血之咒", type: "passive" }];
  t.hand = [];
  src.hand = [{ name: "红桃牌", type: "slash", suit: "♥" }];
  const before = { srcHand: src.hand.length, tHand: t.hand.length };
  window.HitwellSkills.afterDamage(st, src, t,
    { name: "攻击", type: "slash", suit: "♠" }, 4, { damage: () => {}, directDamage: () => {} });
  const evts = (b.animQueue || []).map(e => ({
    type: e.type, count: e.count, cards: (e.cards || []).length,
  }));
  return { before, evts, srcHand: src.hand.length, tHand: t.hand.length,
    stolen: t.hand[0]?.stolenFromUid || null, ownerUid: src.uid,
    logs: st.log.slice(-3) };
})()`;

// ── 2. 凯瑟琳·窃取 ────────────────────────────────────────
// 真实三步：handleSpecialCard（锁定目标）→ chooseReceiver（选接收队友）
//          → resolveSteal（亮牌后转移）。只调第一步不会转牌。
const stealTpl = `(() => {
  const st = window.state, b = st.battle;
  const c = b.allies[0], mate = b.allies[1], victim = b.enemies[0];
  c.name = "凯瑟琳"; c.ref = "catherine"; c.id = "catherine";
  c.skills = [{ name: "窃取", type: "trigger" }];
  c.usedCatherineSteal = false; c.hand = [];
  mate.hand = [];
  victim.hand = [{ name: "敌方手牌", type: "slash", suit: "♠" }];
  const before = { victimHand: victim.hand.length, mateHand: mate.hand.length };
  window.CatherineSkills.handleSpecialCard(st, c, victim,
    { name: "窃取", type: "tactic", catherineSteal: true });
  const picked = !!b.catherineStealPicker;
  window.CatherineSkills.chooseReceiver(st, mate.uid);
  const reveal = b.handReveal ? b.handReveal.mode : null;
  const shown = victim.hand[0];
  window.CatherineSkills.resolveSteal(st, c, victim, b.handReveal, shown);
  const evts = (b.animQueue || []).map(e => ({
    type: e.type, count: e.count, cards: (e.cards || []).length,
  }));
  return { before, picked, reveal, evts, victimHand: victim.hand.length,
    mateHand: mate.hand.length,
    stolen: mate.hand[0]?.stolenFromUid || null, ownerUid: victim.uid,
    logs: st.log.slice(-3) };
})()`;

// ── 3. 凯瑟琳·知识吸收（gainCards 对照） ──────────────────
// takeUsedCard 只从使用者的弃牌堆 / 消耗堆取牌，放错位置会静默返回 null。
const absorbTpl = `(() => {
  const st = window.state, b = st.battle;
  const c = b.allies[0], mate = b.allies[1];
  c.name = "凯瑟琳"; c.ref = "catherine"; c.id = "catherine";
  c.skills = [{ name: "知识吸收", type: "passive" }];
  c.hand = [];
  const used = { name: "用过的战术牌", type: "tactic", suit: "♥" };
  mate.hand = [];
  mate.pileStats = { discard: [used], consumed: [], draw: [], deck: [] };
  window.CatherineSkills.afterCardPlayed(st, mate, used, {});
  const evts = (b.animQueue || []).map(e => ({
    type: e.type, count: e.count, cards: (e.cards || []).length,
  }));
  return { evts, selfHand: c.hand.length,
    stolen: c.hand[0]?.stolenFromUid || null, ownerUid: mate.uid,
    logs: st.log.slice(-3) };
})()`;

// ── 4. 艾斯·勾爪陷阱 ──────────────────────────────────────
const aceTpl = `(() => {
  const st = window.state, b = st.battle;
  const responder = b.allies[0], source = b.enemies[0];
  responder.name = "艾斯"; responder.ref = "ace";
  responder.skills = [{ name: "勾爪陷阱", type: "passive" }];
  responder.hand = [];
  source.hand = [{ name: "敌牌", type: "slash", suit: "♣" }];
  const before = { srcHand: source.hand.length, selfHand: responder.hand.length };
  const api = { pushFloat: () => {}, damage: () => {}, draw: () => 0 };
  window.ElranaAceNanaliSkills.afterResponse(st, responder, source, api);
  const evts = (b.animQueue || []).map(e => ({
    type: e.type, count: e.count, cards: (e.cards || []).length,
  }));
  return { before, evts, srcHand: source.hand.length,
    selfHand: responder.hand.length,
    stolen: responder.hand[0]?.stolenFromUid || null, ownerUid: source.uid,
    logs: st.log.slice(-3) };
})()`;

// ── 5. 狂鲨海盗团掠夺者·冲锋掠夺 ──────────────────────────
const raiderTpl = `(() => {
  const st = window.state, b = st.battle;
  const actor = b.enemies[0], target = b.allies[0];
  actor.name = "狂鲨海盗团掠夺者"; actor.ai = "shark_pirate_raider";
  actor.hand = [];
  target.hand = [{ name: "我方牌", type: "slash", suit: "♦" }];
  const before = { tgtHand: target.hand.length, selfHand: actor.hand.length };
  const api = { pushFloat: () => {}, damage: () => {}, draw: () => 0 };
  const fns = {
    beforeKillTargeted: typeof window.UnderwaterTrainSkills?.beforeKillTargeted,
    afterDamage: typeof window.UnderwaterTrainSkills?.afterDamage,
  };
  window.UnderwaterTrainSkills?.beforeKillTargeted?.(
    st, actor, target, { name: "杀（普攻）", type: "slash", suit: "♠" }, api);
  const evts = (b.animQueue || []).map(e => ({
    type: e.type, count: e.count, cards: (e.cards || []).length,
  }));
  return { before, evts, fns, tgtHand: target.hand.length,
    selfHand: actor.hand.length,
    stolen: actor.hand[0]?.stolenFromUid || null, ownerUid: target.uid,
    logs: st.log.slice(-3) };
})()`;

// ── 6. 废墟·凋零者·魅魔吸取 ───────────────────────────────
const withererTpl = `(() => {
  const st = window.state, b = st.battle;
  const actor = b.enemies[0], target = b.allies[0];
  actor.name = "凋零者"; actor.ai = "ruins_witherer";
  actor.hand = [];
  target.hand = [{ name: "我方牌", type: "slash", suit: "♠" }];
  const before = { tgtHand: target.hand.length, selfHand: actor.hand.length };
  const api = { pushFloat: () => {}, damage: () => {}, draw: () => 0 };
  window.RuinsWithererSkills?.afterDamage?.(
    st, actor, target, { name: "战术牌", type: "tactic", suit: "♥" }, 5, api);
  const evts = (b.animQueue || []).map(e => ({
    type: e.type, count: e.count, cards: (e.cards || []).length,
  }));
  return { before, evts, tgtHand: target.hand.length,
    selfHand: actor.hand.length,
    stolen: actor.hand[0]?.stolenFromUid || null, ownerUid: target.uid,
    logs: st.log.slice(-3) };
})()`;

// ── 7. 兽人·自杀无人机·采精 ───────────────────────────────
const droneTpl = `(() => {
  const st = window.state, b = st.battle;
  const drone = b.enemies[0], target = b.allies[0];
  drone.name = "自杀无人机"; drone.ai = "suicide_drone";
  drone.hand = [];
  target.gender = "male";
  target.hand = [
    { name: "牌A", type: "slash", suit: "♠" },
    { name: "牌B", type: "slash", suit: "♣" },
  ];
  const before = { tgtHand: target.hand.length, selfHand: drone.hand.length };
  const ok = window.OrcDungeonSkills?.resolveDroneExtract?.(
    st, drone, target, { name: "采精", type: "tactic" }, null);
  const evts = (b.animQueue || []).map(e => ({
    type: e.type, count: e.count, cards: (e.cards || []).length,
  }));
  return { before, evts, ok, tgtHand: target.hand.length,
    selfHand: drone.hand.length,
    stolen: drone.hand[0]?.stolenFromUid || null, ownerUid: target.uid,
    logs: st.log.slice(-3) };
})()`;

async function runCase(page, label, triggerTpl, wantType) {
  await page.evaluate(baseTpl);
  await page.evaluate(installObserverTpl);
  const trig = await page.evaluate(triggerTpl);
  const matched = (trig.evts || []).filter(e => e.type === wantType);
  T(`${label} · 入队 ${wantType}（count>0 且有牌）`,
    matched.length > 0 && matched[0].count > 0 && matched[0].cards > 0,
    { evts: trig.evts, want: wantType, logs: trig.logs });
  const drained = await page.evaluate(drainTpl);
  T(`${label} · 浏览器真的画出飞行卡牌`, drained.flight > 0, drained);
  T(`${label} · 转来的牌标了原主（弃置须归还）`,
    !!trig.stolen && trig.stolen === trig.ownerUid,
    { stolen: trig.stolen, ownerUid: trig.ownerUid });
  return { trig, drained };
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(e.message));

  await startRegressionBattle(page);

  await runCase(page, "心血之咒（希特威）", hitwellTpl, "stealCard");
  await runCase(page, "窃取（凯瑟琳）", stealTpl, "stealCard");
  await runCase(page, "知识吸收（凯瑟琳）", absorbTpl, "gainCards");
  await runCase(page, "勾爪陷阱（艾斯）", aceTpl, "stealCard");
  await runCase(page, "冲锋掠夺（狂鲨掠夺者）", raiderTpl, "stealCard");
  await runCase(page, "魅魔吸取（凋零者）", withererTpl, "stealCard");
  await runCase(page, "采精（自杀无人机）", droneTpl, "stealCard");

  console.log(`\n结果：${pass}/${total}`);
  console.log(`页面错误：${errors.length}`, errors.slice(0, 3));
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})().catch(err => {
  console.error("运行失败:", err.message);
  process.exit(1);
});
