// 凯瑟琳 · 实战回归（严格版）
//   ⚔️ 窃取：出牌阶段限一次，指定敌方一名角色与我方其他一名角色，将前者一张牌转给后者
//   ⭐ 知识吸收：锁定技，友方角色使用战术牌结算完毕后，你获得该战术牌
//   ⭐ 魔力增幅：锁定技，每有一张战术牌魔力+1；魔力全场最多时战术牌不可被响应
//
// 注意：本文件断言的是「实际效果」，不是「标记是否存在」。
//   例：魔力增幅的不可响应，走 CardUtils.isCounterableTactic（响应判定的唯一入口），
//   而不是只看 card.ignoreResponse。
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
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
};

// 把我方 0 号改造成凯瑟琳，敌方留 2 名且各持有手牌
const setupTpl = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false;
  b.selectedCardIndex = null; b.selectedSkillCard = null; b.pendingTargetUid = null;
  b.catherineStealPicker = null; b.handReveal = null;
  const c = b.allies[0];
  c.name = "凯瑟琳"; c.ref = "catherine"; c.id = "catherine";
  c.hp = 28; c.maxHp = 28; c.block = 0; c.tempMagic = 0;
  c.stats = { attack: 1, magic: 3, speed: 2 };
  c.handLimit = 3; c.intent = 1; c.usedCatherineSteal = false;
  c.pileStats = { discard: [], consumed: [] };
  c.skills = [
    { name: "窃取", type: "active" },
    { name: "知识吸收", type: "passive" },
    { name: "魔力增幅", type: "passive" },
  ];
  c.hand = [{ name: "窃取", type: "tactic", catherineSteal: true, suit: "♠" }];
  c.hand.forEach(x => { delete x._pendingDraw; });
  b.allies.forEach((u, i) => {
    if (i === 0) return;
    u.hp = 100; u.maxHp = 100; u.hand = [];
    u.pileStats = { discard: [], consumed: [] };
  });
  b.enemies.forEach((u, i) => {
    u.hp = i === 0 ? 100 : 90; u.maxHp = 100; u.block = 0;
    u.stats = Object.assign({}, u.stats, { magic: 1 });
    u.pileStats = { discard: [], consumed: [] };
    u.hand = [
      { name: "杀", type: "slash", suit: "♥", scale: "attack" },
      { name: "闪", type: "response", suit: "♠" },
    ];
    u.hand.forEach(x => { delete x._pendingDraw; });
  });
  st.log = [];
  window.render();
  return { ok: true, allies: b.allies.length, foes: b.enemies.length };
})()`;

// 窃取：打出后应弹出「选择接收队友」面板（含放弃按钮），且敌方手牌尚未变动
const stealOpenTpl = `(() => {
  const st = window.state, b = st.battle;
  const c = b.allies[0], foe = b.enemies[0];
  b.activeUid = c.uid; b.phase = 4; b.locked = false; b.animQueue = [];
  const card = c.hand[0];
  const foeBefore = foe.hand.length;
  const handled = window.CatherineSkills.handleSpecialCard(st, c, foe, card);
  window.render();
  const el = document.querySelector(".armory-popup");
  return { handled, foeBefore, foeAfter: foe.hand.length,
    picker: !!b.catherineStealPicker, locked: !!b.locked,
    hasPopup: !!el, text: el?.innerText || "",
    hasReceiver: !!document.querySelector("[data-catherine-receiver]"),
    hasSkip: !!document.querySelector("[data-catherine-receiver-skip]"),
    logs: (st.log || []).slice(0, 3).map(String) };
})()`;

// 选择接收队友后应打开敌方手牌展示，供玩家挑一张
const chooseReceiverTpl = `(() => {
  const st = window.state, b = st.battle;
  const mate = b.allies.find(u => u.uid !== b.allies[0].uid && u.hp > 0);
  const ok = window.CatherineSkills.chooseReceiver(st, mate?.uid);
  window.render();
  return { ok, receiverUid: b.handReveal?.receiverUid || null,
    reveal: !!b.handReveal, locked: !!b.locked };
})()`;

// 从展示的手牌里挑第 1 张，完成转移
const resolveStealTpl = `(() => {
  const st = window.state, b = st.battle;
  const c = b.allies[0], foe = b.enemies[0];
  const receiverUid = b.handReveal?.receiverUid;
  const receiver = b.allies.find(u => u.uid === receiverUid);
  if (!receiver) return { ok: false, err: "no receiver", receiverUid };
  const card = foe.hand.find(x => !x._pendingDraw);
  const before = { foe: foe.hand.length, mate: receiver.hand.length };
  const ok = window.CatherineSkills.resolveSteal(st, c, foe, b.handReveal, card);
  b.handReveal = null;
  window.render();
  return { ok, before, foeAfter: foe.hand.length, mateAfter: receiver.hand.length,
    cardName: card?.name, logs: (st.log || []).slice(0, 4).map(String) };
})()`;

// 窃取：出牌阶段限一次
const stealOnceTpl = `(() => {
  const st = window.state, b = st.battle;
  const c = b.allies[0], foe = b.enemies[0];
  c.usedCatherineSteal = false;
  b.catherineStealPicker = null; b.locked = false;
  const first = window.CatherineSkills.handleSpecialCard(st, c, foe,
    { name: "窃取", type: "tactic", catherineSteal: true });
  b.catherineStealPicker = null; b.locked = false;
  const second = window.CatherineSkills.handleSpecialCard(st, c, foe,
    { name: "窃取", type: "tactic", catherineSteal: true });
  return { first, second, used: !!c.usedCatherineSteal };
})()`;

// 窃取：放弃发动 → 不应转移任何牌，且界面解锁
const stealSkipTpl = `(() => {
  const st = window.state, b = st.battle;
  const c = b.allies[0], foe = b.enemies[0];
  c.usedCatherineSteal = false; b.locked = false; b.animQueue = [];
  foe.hand = [{ name: "杀", type: "slash", suit: "♥" },
    { name: "闪", type: "response", suit: "♠" }];
  foe.hand.forEach(x => { delete x._pendingDraw; });
  const foeBefore = foe.hand.length;
  window.CatherineSkills.handleSpecialCard(st, c, foe,
    { name: "窃取", type: "tactic", catherineSteal: true });
  const ok = window.CatherineSkills.chooseReceiver(st, null);
  window.render();
  return { ok, foeBefore, foeAfter: foe.hand.length,
    locked: !!b.locked, picker: !!b.catherineStealPicker,
    logs: (st.log || []).slice(0, 2).map(String) };
})()`;

// 窃取：敌方无手牌 → 不发动，且不消耗限一次次数
const stealNoHandTpl = `(() => {
  const st = window.state, b = st.battle;
  const c = b.allies[0], foe = b.enemies[0];
  c.usedCatherineSteal = false; b.locked = false;
  const saved = foe.hand.slice();
  foe.hand = [];
  const handled = window.CatherineSkills.handleSpecialCard(st, c, foe,
    { name: "窃取", type: "tactic", catherineSteal: true });
  const used = !!c.usedCatherineSteal;
  foe.hand = saved;
  return { handled, used };
})()`;

// 窃取：没有可接收的队友 → 不发动
const stealNoMateTpl = `(() => {
  const st = window.state, b = st.battle;
  const c = b.allies[0];
  c.usedCatherineSteal = false; b.locked = false;
  const saved = b.allies.slice(1);
  b.allies.length = 1;
  const handled = window.CatherineSkills.handleSpecialCard(st, c, b.enemies[0],
    { name: "窃取", type: "tactic", catherineSteal: true });
  const out = { handled, picker: !!b.catherineStealPicker, locked: !!b.locked };
  b.allies.push(...saved);
  return out;
})()`;

// 知识吸收：其他角色使用战术牌结算完毕后，凯瑟琳获得该牌
const absorbTpl = `(() => {
  const st = window.state, b = st.battle;
  const c = b.allies[0], other = b.allies[1];
  b.animQueue = [];
  c.hand = [];
  // 真实战术牌模板：【魅惑术】【冰冻术】是障碍牌（type=obstacle），【偷袭】是响应牌，
  // 手工拼 type:"tactic" 会让断言脱离真实牌面，这里一律取实体模板。
  const tactic = window.CardUtils.cloneEntity("蓄力", { suit: "♣" });
  tactic.__probe = "origin";
  other.discard = other.discard || [];
  other.pileStats = other.pileStats || {};
  other.pileStats.discard = other.pileStats.discard || [];
  other.pileStats.discard.push(tactic);
  window.CatherineSkills.afterCardPlayed(st, other, tactic);
  window.render();
  const g = (c.hand || []).find(x => x.name === "蓄力");
  return { hand: c.hand.map(x => x.name), count: c.hand.length,
    sameObject: !!g && g.__probe === "origin",
    virtual: g ? !!g.virtual : null,
    temporary: g ? !!g.temporary : null,
    gainedType: g?.type,
    discard: other.pileStats.discard.map(x => x.name),
    tempMagic: c.tempMagic,
    logs: (st.log || []).slice(0, 3).map(String) };
})()`;

// 知识吸收：敌方角色使用战术牌 → 不回收（描述限定为「友方角色」）
const absorbFoeTpl = `(() => {
  const st = window.state, b = st.battle;
  const c = b.allies[0], foe = b.enemies[0];
  b.animQueue = [];
  c.hand = [];
  const tactic = window.CardUtils.cloneEntity("武装", { suit: "♦" });
  foe.pileStats.discard = [tactic];
  window.CatherineSkills.afterCardPlayed(st, foe, tactic);
  return { count: c.hand.length, hand: c.hand.map(x => x.name),
    foeDiscard: foe.pileStats.discard.length };
})()`;

// 知识吸收·归属：友方用的是「从敌方夺来」的战术牌 → 回收后仍属敌方，不得洗成友方
const absorbStolenTpl = `(() => {
  const st = window.state, b = st.battle;
  const c = b.allies[0], other = b.allies[1], foe = b.enemies[0];
  b.animQueue = [];
  c.hand = [];
  const tactic = window.CardUtils.cloneEntity("蓄力", { suit: "♣" });
  tactic.__probe = "foe-owned";
  tactic.stolenFromUid = foe.uid;      // 该牌本属敌方，友方只是临时持有
  other.pileStats.discard = [tactic];
  window.CatherineSkills.afterCardPlayed(st, other, tactic);
  const g = (c.hand || []).find(x => x.name === "蓄力");
  let put = null;
  if (g) {
    delete g._pendingDraw;
    foe.pileStats.discard = foe.pileStats.discard || [];
    c.pileStats.discard = c.pileStats.discard || [];
    other.pileStats.discard = other.pileStats.discard || [];
    window.BattleCards.put(st.battle, c, g, "discard", { forcedDiscard: true });
    put = { foeDiscard: foe.pileStats.discard.some(x => x.__probe === "foe-owned"),
      allyDiscard: other.pileStats.discard.some(x => x.__probe === "foe-owned"),
      selfDiscard: c.pileStats.discard.some(x => x.__probe === "foe-owned") };
  }
  return { count: c.hand.length,
    stolenFromUid: g ? g.stolenFromUid : null,
    foeUid: foe.uid, allyUid: other.uid, cathyUid: c.uid, put };
})()`;

// 知识吸收：凯瑟琳自己使用战术牌 → 不得把牌收回到自己手上（否则可无限重复使用）
const absorbSelfTpl = `(() => {
  const st = window.state, b = st.battle;
  const c = b.allies[0];
  b.animQueue = [];
  c.pileStats.discard = [];
  const tactic = window.CardUtils.cloneEntity("蓄力", { suit: "♣" });
  c.pileStats.discard.push(tactic);      // 模拟「已使用、进入弃牌堆」
  c.hand = [];
  window.CatherineSkills.afterCardPlayed(st, c, tactic);
  return { handCount: c.hand.length, hand: c.hand.map(x => x.name),
    discard: c.pileStats.discard.map(x => x.name) };
})()`;

// 知识吸收：不应回收虚拟牌 / 临时牌 / 非战术牌
const absorbGuardTpl = `(() => {
  const st = window.state, b = st.battle;
  const c = b.allies[0], other = b.allies[1];
  const out = {};
  const run = (card) => {
    b.animQueue = [];
    c.hand = [];
    other.pileStats.consumed = [];
    other.pileStats.discard = [card];
    window.CatherineSkills.afterCardPlayed(st, other, card);
    return c.hand.length;
  };
  out.virtual = run(window.CardUtils.cloneEntity("武装", { suit: "♦", virtual: true }));
  out.temporary = run(window.CardUtils.cloneEntity("武装", { suit: "♦", temporary: true }));
  out.slash = run({ name: "杀", type: "slash", suit: "♠" });
  out.fromConsumed = (() => {
    b.animQueue = []; c.hand = [];
    const t = window.CardUtils.cloneEntity("武装", { suit: "♦" });
    other.pileStats.discard = [];
    other.pileStats.consumed = [t];
    window.CatherineSkills.afterCardPlayed(st, other, t);
    return c.hand.length;
  })();
  return out;
})()`;


// 知识吸收·真实路径：走引擎 useCard + resume，验证拿到的是原牌实体对象且可再次打出
const absorbRealTpl = `(() => {
  const st = window.state, b = st.battle;
  const c = b.allies[0], other = b.allies[1];
  b.activeUid = other.uid; b.phase = 4; b.locked = false; b.animQueue = [];
  b.cardResumeQueue = null;
  c.hand = [];
  const tactic = window.CardUtils.cloneEntity("蓄力", { suit: "♣" });
  tactic.__probe = "origin";
  other.hand = [tactic];
  window.BattleSystem.useCard(st, other, b.enemies[0], tactic);
  let guard = 0;
  while ((b.cardResumeQueue || []).length && !b.locked && guard++ < 20) {
    window.BattleCardResume?.resume?.(st);
  }
  const gained = (c.hand || []).find(x => x.name === "蓄力");
  let replay = null;
  if (gained) {
    delete gained._pendingDraw;
    b.activeUid = c.uid; b.locked = false; b.animQueue = [];
    b.cardResumeQueue = null;
    c.pileStats.discard = [];
    st.log = [];
    window.BattleSystem.useCard(st, c, b.enemies[1] || b.enemies[0], gained);
    let g2 = 0;
    while ((b.cardResumeQueue || []).length && !b.locked && g2++ < 20) {
      window.BattleCardResume?.resume?.(st);
    }
    replay = { handAfter: c.hand.length,
      discard: (c.pileStats.discard || []).map(x => x.name),
      // 知识吸收拿到的是队友用过的牌，带 stolenFromUid，弃置时须回到该队友牌堆，
      // 否则等于把队友的牌转成自己的。所以这里看的是 actor（队友）的弃牌堆。
      ownerDiscard: (other.pileStats.discard || []).map(x => x.name),
      stolenFromUid: gained.stolenFromUid === other.uid,
      logs: (st.log || []).slice(0, 4).map(String) };
  }
  return { gained: !!gained,
    sameObject: !!gained && gained.__probe === "origin",
    virtual: gained ? !!gained.virtual : null,
    type: gained?.type || null, replay };
})()`;

// 知识吸收：障碍牌（【魅惑术】type=obstacle）不是战术牌，不应获得
const absorbObstacleTpl = `(() => {
  const st = window.state, b = st.battle;
  const c = b.allies[0], other = b.allies[1];
  b.animQueue = [];
  c.hand = [];
  const card = window.CardUtils.cloneEntity("魅惑术", { suit: "♣" });
  other.pileStats.discard = [card];
  window.CatherineSkills.afterCardPlayed(st, other, card);
  return { type: card.type, count: c.hand.length,
    discard: other.pileStats.discard.length };
})()`;

// 魔力增幅：每有一张战术牌魔力+1（基础魔力 3）
// 传入的是牌名数组，在页面内取实体模板：Node 侧没有 window，不能在这里 cloneEntity
const magicTpl = (names) => `(() => {
  const st = window.state, b = st.battle;
  const c = b.allies[0];
  c.tempMagic = 0;
  const SUITS = ["♣", "♥", "♠", "♦"];
  c.hand = ${JSON.stringify(names)}.map((nm, i) =>
    window.CardUtils.cloneEntity(nm, { suit: SUITS[i % SUITS.length] }));
  c.hand.forEach(x => { delete x._pendingDraw; });
  window.CatherineSkills.syncMagic(st, c);
  return { tacticCount: c.hand.filter(x => x.type === "tactic").length,
    base: c.stats?.magic || 0, tempMagic: c.tempMagic,
    total: (c.stats?.magic || 0) + (c.tempMagic || 0) };
})()`;

// 魔力增幅：非战术牌不加魔力
const magicNonTacticTpl = `(() => {
  const st = window.state, b = st.battle;
  const c = b.allies[0];
  c.tempMagic = 0;
  c.hand = [
    { name: "杀", type: "slash", suit: "♠" },
    { name: "闪", type: "response", suit: "♥" },
  ];
  c.hand.forEach(x => { delete x._pendingDraw; });
  window.CatherineSkills.syncMagic(st, c);
  return { tempMagic: c.tempMagic };
})()`;

// 魔力增幅：不可响应的「实际效果」——走响应判定的唯一入口 isCounterableTactic
const counterableTpl = `(() => {
  const st = window.state, b = st.battle;
  const c = b.allies[0];
  c.tempMagic = 0;
  c.hand = [
    window.CardUtils.cloneEntity("蓄力", { suit: "♣" }),
    window.CardUtils.cloneEntity("武装", { suit: "♥" }),
  ];
  c.hand.forEach(x => { delete x._pendingDraw; });
  b.allies.forEach((u, i) => { if (i) u.stats = Object.assign({}, u.stats, { magic: 0 }); });
  b.enemies.forEach(u => { u.stats = Object.assign({}, u.stats, { magic: 0 }); });
  window.CatherineSkills.syncMagic(st, c);
  const card = window.CardUtils.cloneEntity("蓄力", { suit: "♣" });
  window.CatherineSkills.beforeCardPlayed(st, c, card);
  const top = { counterable: !!window.CardUtils.isCounterableTactic(card),
    ignore: !!card.ignoreResponse,
    total: (c.stats?.magic || 0) + (c.tempMagic || 0) };
  // 对手魔力压过凯瑟琳时，战术牌应恢复为可被响应
  const card2 = window.CardUtils.cloneEntity("武装", { suit: "♥" });
  b.enemies.forEach(u => { u.stats = Object.assign({}, u.stats, { magic: 99 }); });
  window.CatherineSkills.beforeCardPlayed(st, c, card2);
  return { top, notTop: { counterable: !!window.CardUtils.isCounterableTactic(card2),
    ignore: !!card2.ignoreResponse } };
})()`;

// 魔力增幅：弃牌后必须重算 tempMagic（否则「魔力是否最多」按弃牌前的旧值判定）
const magicAfterDiscardTpl = `(() => {
  const st = window.state, b = st.battle;
  const c = b.allies[0];
  c.tempMagic = 0;
  c.hand = [
    window.CardUtils.cloneEntity("蓄力", { suit: "♣" }),
    window.CardUtils.cloneEntity("武装", { suit: "♥" }),
    window.CardUtils.cloneEntity("拆解", { suit: "♠" }),
  ];
  c.hand.forEach(x => { delete x._pendingDraw; });
  window.CatherineSkills.syncMagic(st, c);
  // 走引擎真实弃牌路径（溢出弃牌），手牌上限 3 → 先压到 4 张再弃
  c.hand.push(window.CardUtils.cloneEntity("拆解", { suit: "♦" }));
  c.hand.forEach(x => { delete x._pendingDraw; });
  // 必须先把 4 张的状态同步进去，否则 before 与弃牌后的正确值恰好相等，断言恒真
  window.CatherineSkills.syncMagic(st, c);
  const before = c.tempMagic;
  const inst = window.BattleDiscardOverflow({
    visibleHand: u => (u?.hand || []).filter(x => !x._pendingDraw).length,
    handLimit: u => u?.handLimit || 4,
    draw: () => {}, combat: { pushFloat: () => {} },
  });
  inst.discardOverflow(st, c);
  return { before, after: c.tempMagic, handNow: c.hand.length };
})()`;

// 台词：三个技能各有一条。
// 注意：BattleLines.skill 只是「打字幕」，真实台词下一帧才落到 battle.speech.lines，
// 同步读取会拿到空值（历史教训：不要用它当查询函数）。
const speechFor = (skillName) => `(() => {
  const st = window.state, b = st.battle;
  const c = b.allies[0];
  b.speech = null;
  window.BattleLines.skill(st, c, ${JSON.stringify(skillName)});
  return true;
})()`;
const speechReadTpl = `(() => {
  const lines = window.state.battle.speech?.lines || [];
  return lines.map(item => item.text).join("|");
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await startRegressionBattle(page);

  const setup = await page.evaluate(setupTpl);
  T("战斗场景就绪", setup.ok && setup.allies >= 2 && setup.foes >= 1, setup);

  // ── 窃取 ──
  const open = await page.evaluate(stealOpenTpl);
  T("窃取：打出后进入选择流程", open.handled === true, open);
  T("窃取：弹出选择接收队友面板", open.hasPopup === true, open);
  T("窃取：面板含接收队友按钮", open.hasReceiver === true, open);
  T("窃取：面板含放弃发动按钮", open.hasSkip === true, open);
  T("窃取：未选择前敌方手牌未变动", open.foeBefore === open.foeAfter, open);

  const chosen = await page.evaluate(chooseReceiverTpl);
  T("窃取：选择队友后打开手牌展示", chosen.ok === true && chosen.reveal === true, chosen);

  const resolved = await page.evaluate(resolveStealTpl);
  const rb = resolved.before || { foe: -1, mate: -1 };
  T("窃取：敌方手牌减少 1", resolved.foeAfter === rb.foe - 1, resolved);
  T("窃取：队友手牌增加 1", resolved.mateAfter === rb.mate + 1, resolved);
  T("窃取：日志记录转移", (resolved.logs || []).some(s => /窃取/.test(String(s))), resolved);

  const once = await page.evaluate(stealOnceTpl);
  T("窃取：出牌阶段限一次", once.first === true && once.second === false, once);

  const skip = await page.evaluate(stealSkipTpl);
  T("窃取：放弃发动不转移任何牌", skip.foeAfter === skip.foeBefore, skip);
  T("窃取：放弃发动后界面解锁", skip.locked === false && skip.picker === false, skip);

  const noHand = await page.evaluate(stealNoHandTpl);
  T("窃取：敌方无手牌时不发动", noHand.handled === false, noHand);
  T("窃取：敌方无手牌时不消耗次数", noHand.used === false, noHand);

  const noMate = await page.evaluate(stealNoMateTpl);
  T("窃取：无队友时不发动", noMate.handled === false && noMate.picker === false, noMate);

  // ── 知识吸收 ──
  const absorb = await page.evaluate(absorbTpl);
  T("知识吸收：获得使用过的战术牌",
    absorb.count === 1 && absorb.hand[0] === "蓄力", absorb);
  T("知识吸收：该牌从弃牌堆移除", absorb.discard.length === 0, absorb);
  T("知识吸收：日志记录", (absorb.logs || []).some(s => /知识吸收/.test(String(s))), absorb);
  T("知识吸收：获得的战术牌立刻计入魔力增幅", absorb.tempMagic === 1, absorb);

  const absorbFoe = await page.evaluate(absorbFoeTpl);
  T("知识吸收：敌方使用战术牌不回收", absorbFoe.count === 0, absorbFoe);
  T("知识吸收：敌方用过的战术牌留在敌方弃牌堆",
    absorbFoe.foeDiscard === 1, absorbFoe);

  const stolen = await page.evaluate(absorbStolenTpl);
  T("知识吸收·归属：友方用敌方牌后仍被回收", stolen.count === 1, stolen);
  T("知识吸收·归属：保留敌方原归属（不被洗成友方）",
    stolen.stolenFromUid === stolen.foeUid && stolen.stolenFromUid !== stolen.allyUid,
    stolen);
  T("知识吸收·归属：弃置后回到敌方牌堆",
    !!stolen.put && stolen.put.foeDiscard === true, stolen);
  T("知识吸收·归属：弃置后不落友方/凯瑟琳牌堆",
    !!stolen.put && stolen.put.allyDiscard === false && stolen.put.selfDiscard === false,
    stolen);

  const self = await page.evaluate(absorbSelfTpl);
  T("知识吸收：自己用的战术牌不回收给自己", self.handCount === 0, self);
  T("知识吸收：自己用的战术牌留在弃牌堆",
    self.discard.length === 1 && self.discard[0] === "蓄力", self);

  const guard = await page.evaluate(absorbGuardTpl);
  T("知识吸收：不回收虚拟牌", guard.virtual === 0, guard);
  T("知识吸收：不回收临时牌", guard.temporary === 0, guard);
  T("知识吸收：不回收非战术牌", guard.slash === 0, guard);
  T("知识吸收：消耗区的战术牌可回收", guard.fromConsumed === 1, guard);

  T("知识吸收：获得的是原牌实体对象（同一引用）", absorb.sameObject === true, absorb);
  T("知识吸收：获得的牌不是虚拟牌", absorb.virtual === false, absorb);
  T("知识吸收：获得的牌类型为战术牌", absorb.gainedType === "tactic", absorb);

  const real = await page.evaluate(absorbRealTpl);
  T("知识吸收·真实路径：打出后获得该牌", real.gained === true, real);
  T("知识吸收·真实路径：获得的是原牌实体对象",
    real.sameObject === true && real.virtual === false, real);
  T("知识吸收·真实路径：实体牌可再次打出",
    !!real.replay && real.replay.handAfter === 0
    && real.replay.ownerDiscard.includes("蓄力"), real);
  T("知识吸收·真实路径：弃置后回到原使用队友牌堆（不占为己有）",
    !!real.replay && real.replay.stolenFromUid === true
    && !real.replay.discard.includes("蓄力"), real);

  const obs = await page.evaluate(absorbObstacleTpl);
  T("知识吸收：障碍牌不是战术牌，不获得",
    obs.type === "obstacle" && obs.count === 0 && obs.discard === 1, obs);

  // ── 魔力增幅 ──
  const m0 = await page.evaluate(magicTpl([]));
  T("魔力增幅：无战术牌时不加魔力", m0.tempMagic === 0, m0);
  const m2 = await page.evaluate(magicTpl(["蓄力", "武装"]));
  T("魔力增幅：2 张战术牌 → 魔力+2", m2.tempMagic === 2 && m2.total === 5, m2);
  const m3 = await page.evaluate(magicTpl(["蓄力", "武装", "拆解"]));
  T("魔力增幅：3 张战术牌 → 魔力+3", m3.tempMagic === 3 && m3.total === 6, m3);
  const mNon = await page.evaluate(magicNonTacticTpl);
  T("魔力增幅：非战术牌不加魔力", mNon.tempMagic === 0, mNon);

  const cnt = await page.evaluate(counterableTpl);
  T("魔力增幅：魔力全场最多时战术牌不可被响应",
    cnt.top.counterable === false && cnt.top.ignore === true, cnt);
  T("魔力增幅：魔力非最多时战术牌可被响应",
    cnt.notTop.counterable === true && cnt.notTop.ignore === false, cnt);

  const afterDiscard = await page.evaluate(magicAfterDiscardTpl);
  T("魔力增幅：弃牌后重算魔力",
    afterDiscard.after === afterDiscard.handNow, afterDiscard);

  // ── 台词 ──
  const speechOf = async (name) => {
    await page.evaluate(speechFor(name));
    await page.waitForTimeout(200);
    return page.evaluate(speechReadTpl);
  };
  const stealLine = await speechOf("窃取");
  const absorbLine = await speechOf("知识吸收");
  const magicLine = await speechOf("魔力增幅");
  T("台词：窃取", /拿到了/.test(String(stealLine)), { stealLine });
  T("台词：知识吸收", /学到了/.test(String(absorbLine)), { absorbLine });
  T("台词：魔力增幅", /魔法师/.test(String(magicLine)), { magicLine });

  T("页面无 JS 错误", errors.length === 0, errors);

  console.log(`\n结果 ${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})();
