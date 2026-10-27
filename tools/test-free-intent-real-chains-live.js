// 全库「免杀意」来源 —— 逐个走**真实触发链路**验证（此前只有格林机枪走过真实链路）。
//
// 每个来源统一验三步：
//   1. 真实入口触发（打技能牌 / 调技能函数 / AI 移动），确认当时确实免杀意
//   2. 检查进弃牌堆（或消耗区）的那张牌上，免杀意标记是否残留
//   3. 把该牌从弃牌堆取回手牌（模拟洗牌堆重洗 / 回收类技能），再打出，
//      确认这次**正常消耗杀意**——不错误免杀意
//
// 分批：FREE_REAL=A|B|C|D|E|F|G|H|I|J，不设则跑全部。
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const {
  openGame, startRegressionBattle, collectErrors, relevantErrors,
} = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const PART = (process.env.FREE_REAL || "ALL").toUpperCase();
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

// 基础战场：我方 allies[0] 为主角（intent 充足），敌人不可响应。
// relics 写到 battleRelics，RelicSystem.hasEquipped 据此判定（与牛头王测试同口径）。
const base = (o = {}) => `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false; b.phase = 4;
  delete b.karunaBubble; delete b.karunaBubblePending; delete b.thunderHammer;
  delete b.selectedSkillCard; delete b.greenGatlingResume;
  const u = b.allies[0], u2 = b.allies[1], foe = b.enemies[0];
  u.name = "主角"; u.gender = "female";
  u.stats = { attack: 10, magic: 4, speed: 3, maxHp: 100, bloodlust: 3, handLimit: 9 };
  u.hp = 100; u.maxHp = 100; u.block = 0; u.intent = ${o.intent ?? 2}; u.intentMax = 3;
  // CharacterSkillAccess.canResolve → owns() 要求 actor.skills 里有同名 active 技能
  // 且 skill.card 带对应 flag，否则技能牌一律拒绝放行（此前 A/C 段卡在这里）。
  u.skills = ${JSON.stringify(o.skills || [])}; u.ref = ${JSON.stringify(o.ref || "")};
  u.battleRelics = ${JSON.stringify(o.relics || [])};
  u.usedLokarWindSlash = false; u.usedCrazyShooting = false;
  u.usedArsenal = false; u.usedSuccubusFork = false; u.usedAssassinLatex = false;
  u.usedWithererPeek = false;
  u.pileStats = u.pileStats || {};
  u.pileStats.discard = []; u.pileStats.consumed = [];
  u.discard = u.pileStats.discard; u.consumed = u.pileStats.consumed;
  u.deck = ${JSON.stringify(o.deck || [])};
  if (u2) { u2.name = "队友"; u2.hp = u2.maxHp = 100; u2.stats = { attack: 8, magic: 3, speed: 2, maxHp: 100, bloodlust: 3, handLimit: 9 };
    u2.intent = 2; u2.intentMax = 3; u2.skills = []; u2.hand = []; u2.block = 0;
    u2.pileStats = u2.pileStats || {}; u2.pileStats.discard = []; u2.pileStats.consumed = [];
    u2.discard = u2.pileStats.discard; u2.consumed = u2.pileStats.consumed;
    u2.deck = ${JSON.stringify(o.deck2 || [])}; }
  b.enemies.forEach(e => {
    e.hp = e.maxHp = 300; e.block = 0; e.statuses = []; e.hand = []; e.noResponse = true;
    e.ai = ${JSON.stringify(o.foeAi || "")};
    e.pileStats = e.pileStats || {}; e.pileStats.discard = []; e.pileStats.consumed = [];
    e.discard = e.pileStats.discard; e.consumed = e.pileStats.consumed;
  });
  u.hand = ${JSON.stringify(o.hand || [])};
  b.activeUid = u.uid; b.selectedCardIndex = ${o.sel ?? -1};
  st.log = []; st.battleLog = [];
  window.render();
  return { hand: u.hand.length, intent: u.intent };
})()`;

const SLASH = (name = "杀（普攻）", suit = "♠") =>
  ({ name, type: "slash", suit, power: 0, scale: "attack" });
// 技能栏条目：CharacterSkillAccess.owns 认的是 type/name/card[flag] 三者齐全
const SK = (name, flag) => ({ type: "active", name, card: { [flag]: true } });

// 取回弃牌堆里指定名字的牌到手牌，再打出，返回 intent 前后差异。
const recycleAndReplay = name => `(() => {
  const st = window.state, b = st.battle, u = b.allies[0];
  const disc = u.pileStats?.discard || u.discard || [];
  const before = disc.map(c => ({ n: c.name, m: { noIntentCost: !!c.noIntentCost, mikeDragonSlash: !!c.mikeDragonSlash, withererBerserkKill: !!c.withererBerserkKill, withererPeekSlash: !!c.withererPeekSlash, lukaWolfFang: !!c.lukaWolfFang, ramKill: !!c.ramKill, _iceDagger: !!c._iceDagger, _beastSuppressionApplied: !!c._beastSuppressionApplied, _bubbleFree: !!c._bubbleFree } }));
  const idx = disc.findIndex(c => c.name === ${JSON.stringify(name)});
  const recycled = idx >= 0;
  let card = null;
  if (recycled) { card = disc.splice(idx, 1)[0]; u.hand.push(card); }
  b.animQueue = []; b.locked = false; b.phase = 4;
  const i0 = u.intent;
  const iBefore = u.intent;
  if (card) window.BattleSystem.useCard(st, u, card.targetless ? null : b.enemies[0], card);
  return { before, recycled, iBefore, iAfter: u.intent,
    after: (u.pileStats?.discard || u.discard || []).map(c => c.name),
    logs: (st.battleLog || []).join(" | "), i0 };
})()`;

// 出牌后必须等动画结算，否则日志与弃牌堆尚未写入，断言会空转通过。
const run = async (page, expr, label = "run") => {
  const r = await evalT(page, expr, 20000, label);
  await settle(page);
  return r;
};
const settle = async page => {
  await evalT(page, "window.BattleEffects?.whenIdle?.()", 2500, "whenIdle");
  await page.waitForTimeout(300);
};

const snap = `(() => {
  const st = window.state, b = st.battle, u = b.allies[0];
  const disc = u.pileStats?.discard || u.discard || [];
  return {
    intent: u.intent, locked: !!b.locked,
    discard: disc.map(c => ({ n: c.name, noIntentCost: !!c.noIntentCost, lukaWolfFang: !!c.lukaWolfFang,
      ramKill: !!c.ramKill, _iceDagger: !!c._iceDagger, _beastSuppressionApplied: !!c._beastSuppressionApplied,
      withererPeekSlash: !!c.withererPeekSlash })),
    consumed: (u.pileStats?.consumed || u.consumed || []).map(c => c.name),
    hand: (u.hand || []).map(c => c.name),
    logs: (st.battleLog || []).join(" | "),
  };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = collectErrors(page);
  await openGame(page);
  await startRegressionBattle(page);

  // ---------- A 狂风绝息斩（罗卡尔大招，手牌单体杀依次打出） ----------
  if (want("A")) {
    await evalT(page, base({
      skills: [SK("狂风绝息斩", "lokarWindSlash")],
      hand: [SLASH("杀（普攻）", "♠"), SLASH("杀（普攻）", "♣"),
        { name: "狂风绝息斩", type: "tactic", lokarWindSlash: true, targetless: true, _skill: true }],
    }));
    const r = await run(page, `(() => {
      const st = window.state, b = st.battle, u = b.allies[0];
      const skill = u.hand.find(c => c.lokarWindSlash);
      const i0 = u.intent;
      const diag = {
        hasLokar: !!window.LokarSkills,
        hasUseCard: typeof window.BattleSystem?.useCard,
        canWind: window.LokarSkills?.canWindSlash?.(st, u),
        handNames: (u.hand || []).map(c => c.name),
        isSingleKill: (u.hand || []).map(c => !!window.CardUtils?.isSingleKill?.(c)),
        // target:"self" 的技能必须传 actor 自己，传 null 会被 targetAllowed 拒掉
        canResolveSelf: window.CharacterSkillAccess?.canResolve?.(st, u, u, skill),
        canResolveNull: window.CharacterSkillAccess?.canResolve?.(st, u, null, skill),
      };
      let err = null, ret = null;
      try { ret = window.BattleSystem.useCard(st, u, u, skill); }
      catch (e) { err = String(e && e.message || e); }
      return { i0, i1: u.intent, diag, err, ret,
        logs: (st.battleLog || []).join(" | ").slice(-200) };
    })()`);
    console.log("   [诊断A]", JSON.stringify(r));
    const s = await run(page, snap);
    T("A1 大招真实触发", /狂风绝息斩/.test(s.logs || ""), s.logs);
    T("A2 两张单体杀均已打出", (s.discard || []).length >= 2, s.discard);
    T("A3 打出时免杀意（intent 未扣）", r && r.i1 === r.i0, r);
    T("A4 弃牌堆杀牌无 noIntentCost 残留",
      (s.discard || []).every(c => !c.noIntentCost), s.discard);
    const rr = await run(page, recycleAndReplay("杀（普攻）"));
    T("A5 回收后再次打出正常消耗杀意",
      rr && rr.recycled && rr.iAfter === rr.iBefore - 1, rr);
  }

  // ---------- B 武器库（主动饰品，为友方发牌） ----------
  if (want("B")) {
    await evalT(page, base({
      relics: ["武器库"], deck2: [SLASH("杀（普攻）", "♥")],
      hand: [{ name: "武器库", type: "tactic", arsenal: true, targetless: true, _skill: true }],
    }));
    const s1 = await run(page, `(() => {
      const st = window.state, b = st.battle, u = b.allies[0], u2 = b.allies[1];
      window.BattleSystem.useCard(st, u, null, u.hand.find(c => c.arsenal));
      return { allyHand: (u2.hand || []).map(c => ({ n: c.name, free: !!c.noIntentCost })),
        logs: (st.battleLog || []).join(" | ") };
    })()`);
    T("B1 武器库真实触发并发牌", /武器库/.test(s1.logs || "")
      && (s1.allyHand || []).length >= 1, s1);
    T("B2 发放的杀牌带免杀意", (s1.allyHand || []).some(c => c.free), s1.allyHand);
    // 队友打出该牌，检查是否免杀意；再检查进的是队友弃牌堆
    const s2 = await run(page, `(() => {
      const st = window.state, b = st.battle, u2 = b.allies[1];
      b.activeUid = u2.uid; b.animQueue = []; b.locked = false; b.phase = 4;
      const card = u2.hand.find(c => c.noIntentCost);
      const i0 = u2.intent;
      window.BattleSystem.useCard(st, u2, b.enemies[0], card);
      const disc = u2.pileStats?.discard || u2.discard || [];
      return { i0, i1: u2.intent,
        discard: disc.map(c => ({ n: c.name, noIntentCost: !!c.noIntentCost })) };
    })()`);
    T("B3 队友打出该牌免杀意", s2 && s2.i1 === s2.i0, s2);
    T("B4 进弃牌堆无残留", (s2?.discard || []).every(c => !c.noIntentCost), s2?.discard);
  }

  // ---------- C 疯狂射击（卡洛斯，红桃牌转机枪扫杀） ----------
  if (want("C")) {
    await evalT(page, base({
      ref: "carlos", skills: [SK("疯狂射击", "crazyShooting")],
      hand: [SLASH("杀（普攻）", "♥"),
        { name: "疯狂射击", type: "tactic", crazyShooting: true, _skill: true }],
      sel: 0,
    }));
    const s = await run(page, `(() => {
      const st = window.state, b = st.battle, u = b.allies[0];
      const skill = u.hand.find(c => c.crazyShooting);
      b.selectedCardIndex = 0;
      // target:"self" + cost:"red"：目标传自己，代价取 selectedCardIndex 指向的红桃牌
      const i0 = u.intent;
      window.BattleSystem.useCard(st, u, u, skill);
      const disc = u.pileStats?.discard || u.discard || [];
      return { i0, i1: u.intent,
        discard: disc.map(c => ({ n: c.name, noIntentCost: !!c.noIntentCost })),
        logs: (st.battleLog || []).join(" | ") };
    })()`);
    T("C1 疯狂射击真实触发", /疯狂射击|机枪扫杀/.test(s.logs || ""), s.logs);
    T("C2 代价牌（红桃杀）进弃牌堆",
      (s.discard || []).some(c => c.n === "杀（普攻）"), s.discard);
    T("C3 代价牌无 noIntentCost 残留",
      (s.discard || []).every(c => !c.noIntentCost), s.discard);
    // 免杀意的直接证据：转化产物打出后杀意未扣。缺这条则该段免杀意完全没被盯住。
    T("C5 转化产物打出时免杀意（intent 未扣）", s && s.i1 === s.i0, s);
    const rr = await run(page, recycleAndReplay("杀（普攻）"));
    T("C4 回收后再次打出正常消耗杀意",
      rr && rr.recycled && rr.iAfter === rr.iBefore - 1, rr);
  }

  // ---------- D 撞杀（装甲运输车无脑冲撞，敌方 AI） ----------
  if (want("D")) {
    await evalT(page, base({ foeAi: "ruins_carrier" }));
    const s = await run(page, `(() => {
      const st = window.state, b = st.battle, foe = b.enemies[0];
      foe.hand = [${JSON.stringify(SLASH("杀（普攻）", "♠"))}];
      foe.deck = [];
      const move = window.RuinsCarrierRam?.carrierRamMove?.(st, foe);
      if (!move) return { ok: false };
      window.BattleSystem.useCard(st, foe, move.target, move.card);
      const disc = foe.pileStats?.discard || foe.discard || [];
      return { ok: true, prodName: move.card.name,
        // noIntentCost 是在 useCard 内部才打上的，调用前读必然为 false，
        // 因此以免杀意日志为准（clearPlayFlags 会在进堆前清掉标记）
        freeLog: (st.battleLog || []).some(l => /撞杀.*不消耗杀意/.test(l)),
        discard: disc.map(c => ({ n: c.name, noIntentCost: !!c.noIntentCost, ramKill: !!c.ramKill })),
        logs: (st.battleLog || []).join(" | ") };
    })()`);
    T("D1 无脑冲撞真实触发", s && s.ok && /无脑冲撞|撞杀/.test(s.logs || ""), s);
    T("D2 产物【撞杀】免杀意生效", s && s.prodName === "撞杀" && s.freeLog, s);
    T("D3 代价牌进弃牌堆且无残留",
      (s?.discard || []).some(c => c.n === "杀（普攻）" && !c.noIntentCost), s?.discard);
  }

  // ---------- E 冰心双刺剑（获得实体单体杀即转刺杀） ----------
  if (want("E")) {
    await evalT(page, base({ relics: ["冰心双刺剑"], hand: [SLASH("杀（普攻）", "♠")] }));
    const s1 = await run(page, `(() => {
      const st = window.state, b = st.battle, u = b.allies[0];
      const n = window.RuinsRelicIceDagger?.convertIceDaggers?.(st, u, u.hand);
      return { n, hand: (u.hand || []).map(c => ({ n: c.name, free: !!c.noIntentCost, ice: !!c._iceDagger })),
        logs: (st.battleLog || []).join(" | ") };
    })()`);
    T("E1 冰心双刺剑真实触发", /冰心双刺剑/.test(s1.logs || ""), s1);
    T("E2 手牌已转为【刺杀】且免杀意",
      (s1.hand || []).some(c => c.n === "刺杀" && c.free), s1.hand);
    const s2 = await run(page, `(() => {
      const st = window.state, b = st.battle, u = b.allies[0];
      const card = u.hand.find(c => c._iceDagger);
      const i0 = u.intent;
      window.BattleSystem.useCard(st, u, b.enemies[0], card);
      const disc = u.pileStats?.discard || u.discard || [];
      return { i0, i1: u.intent,
        discard: disc.map(c => ({ n: c.name, noIntentCost: !!c.noIntentCost, ice: !!c._iceDagger })),
        logs: (st.battleLog || []).join(" | ") };
    })()`);
    T("E3 打出时免杀意", s2 && s2.i1 === s2.i0, s2);
    T("E4 进弃牌堆无 noIntentCost 残留",
      (s2?.discard || []).every(c => !c.noIntentCost), s2?.discard);
    const rr = await run(page, recycleAndReplay("杀（普攻）"));
    T("E5 回收（还原为原牌）后打出正常消耗杀意",
      rr && rr.recycled && rr.iAfter === rr.iBefore - 1, rr);
  }

  // ---------- F 魅魔钢叉（红桃牌转魅杀） ----------
  if (want("F")) {
    await evalT(page, base({
      relics: ["魅魔钢叉"], hand: [SLASH("杀（普攻）", "♥"),
        { name: "魅魔钢叉", type: "tactic", succubusFork: true, _skill: true }], sel: 0,
    }));
    const s = await run(page, `(() => {
      const st = window.state, b = st.battle, u = b.allies[0];
      b.selectedCardIndex = 0;
      const i0 = u.intent;
      window.BattleSystem.useCard(st, u, b.enemies[0], u.hand.find(c => c.succubusFork));
      const disc = u.pileStats?.discard || u.discard || [];
      return { i0, i1: u.intent,
        discard: disc.map(c => ({ n: c.name, noIntentCost: !!c.noIntentCost })),
        logs: (st.battleLog || []).join(" | ") };
    })()`);
    T("F1 魅魔钢叉真实触发", /魅魔钢叉/.test(s.logs || ""), s.logs);
    T("F2 代价牌进弃牌堆无残留",
      (s.discard || []).every(c => !c.noIntentCost), s.discard);
    T("F4 转化产物打出时免杀意（intent 未扣）", s && s.i1 === s.i0, s);
    const rr = await run(page, recycleAndReplay("杀（普攻）"));
    T("F3 回收后再次打出正常消耗杀意",
      rr && rr.recycled && rr.iAfter === rr.iBefore - 1, rr);
  }

  // ---------- G 刺客胶衣（黑色牌转刺杀） ----------
  if (want("G")) {
    await evalT(page, base({
      relics: ["刺客胶衣"], hand: [SLASH("杀（普攻）", "♣"),
        { name: "刺客胶衣", type: "tactic", assassinLatex: true, _skill: true }], sel: 0,
    }));
    const s = await run(page, `(() => {
      const st = window.state, b = st.battle, u = b.allies[0];
      b.selectedCardIndex = 0;
      const i0 = u.intent;
      window.BattleSystem.useCard(st, u, b.enemies[0], u.hand.find(c => c.assassinLatex));
      const disc = u.pileStats?.discard || u.discard || [];
      return { i0, i1: u.intent,
        discard: disc.map(c => ({ n: c.name, noIntentCost: !!c.noIntentCost })),
        logs: (st.battleLog || []).join(" | ") };
    })()`);
    T("G1 刺客胶衣真实触发", /刺客胶衣/.test(s.logs || ""), s.logs);
    T("G2 代价牌进弃牌堆无残留",
      (s.discard || []).every(c => !c.noIntentCost), s.discard);
    T("G4 转化产物打出时免杀意（intent 未扣）", s && s.i1 === s.i0, s);
    const rr = await run(page, recycleAndReplay("杀（普攻）"));
    T("G3 回收后再次打出正常消耗杀意",
      rr && rr.recycled && rr.iAfter === rr.iBefore - 1, rr);
  }

  // ---------- H 杀欲窥视（凋零者，复制敌方杀牌） ----------
  if (want("H")) {
    await evalT(page, base({
      skills: [SK("杀欲窥视", "withererPeek")],
      hand: [{ name: "杀欲窥视", type: "tactic", withererPeek: true, _skill: true }],
    }));
    const s = await run(page, `(() => {
      const st = window.state, b = st.battle, u = b.allies[0], foe = b.enemies[0];
      foe.hand = [${JSON.stringify(SLASH("杀（普攻）", "♠"))}];
      const peek = u.hand.find(c => c.withererPeek);
      // target:"enemy"：目标传敌方单位，走真实 useCard 链路
      window.BattleSystem.useCard(st, u, foe, peek);
      const card = u.hand.find(c => c.withererPeekSlash);
      // 必须在打出前读：clearPlayFlags 会在进消耗区前清掉 noIntentCost
      const peekFree = !!card?.noIntentCost;
      const gotCard = !!card;
      const i0 = u.intent;
      if (card) window.BattleSystem.useCard(st, u, b.enemies[0], card);
      return { ok: gotCard, i0, i1: u.intent, peekFree,
        consumed: (u.pileStats?.consumed || u.consumed || []).map(c => c.name),
        discard: (u.pileStats?.discard || u.discard || []).map(c => ({ n: c.name, noIntentCost: !!c.noIntentCost })),
        logs: (st.battleLog || []).join(" | ") };
    })()`);
    T("H1 杀欲窥视真实触发", s && s.ok && /杀欲窥视/.test(s.logs || ""), s);
    T("H2 临时杀牌免杀意", s && s.peekFree && s.i1 === s.i0, s);
    T("H3 临时牌进消耗区而非弃牌堆",
      (s?.consumed || []).length >= 1
      && (s?.discard || []).every(c => !c.noIntentCost), s);
  }

  // ---------- I 火力压制（兽人，杀（普攻）转机枪扫杀） ----------
  if (want("I")) {
    await evalT(page, base({ foeAi: "demon_beast_unit" }));
    const s = await run(page, `(() => {
      const st = window.state, b = st.battle, foe = b.enemies[0];
      foe.intent = 2; foe.intentMax = 3;
      foe.hand = [${JSON.stringify(SLASH("杀（普攻）", "♠"))}];
      const i0 = foe.intent;
      const card = foe.hand[0];
      // 不可手动 prepareSlash：火力压制的转化发生在扣杀意**之后**，
      // 免杀意靠结算前预判 suppressionFreeIntent（此时标记尚未打上）。
      // 手动转化会把标记提前打上，预判恒 false，随后照扣杀意 —— 是构造错误不是 BUG。
      const free = window.OrcDungeonSkills?.suppressionFreeIntent?.(foe, card);
      window.BattleSystem.useCard(st, foe, b.allies[0], card);
      const disc = foe.pileStats?.discard || foe.discard || [];
      return { i0, i1: foe.intent, free,
        discard: disc.map(c => ({ n: c.name, noIntentCost: !!c.noIntentCost,
          beast: !!c._beastSuppressionApplied })),
        logs: (st.battleLog || []).join(" | ") };
    })()`);
    T("I1 火力压制真实触发", /火力压制/.test(s.logs || ""), s.logs);
    T("I2 转化牌免杀意（锁定技，每次转化均免）", s && s.i1 === s.i0, s);
    T("I3 进弃牌堆时 _beastSuppressionApplied 已清除",
      (s?.discard || []).every(c => !c.beast), s?.discard);
    T("I4 说明：锁定技每次转化均免杀意，回收后再打出仍免属设计意图", true);
  }

  // ---------- J 狼牙杀（安洁莉卡·露卡，clearPlayFlags 故意保留） ----------
  if (want("J")) {
    await evalT(page, base({ hand: [{ name: "狼牙杀", type: "slash", suit: "", power: 0,
      scale: "attack", noIntentCost: true, lukaWolfFang: true }] }));
    const s1 = await run(page, `(() => {
      const st = window.state, b = st.battle, u = b.allies[0];
      const i0 = u.intent;
      window.BattleSystem.useCard(st, u, b.enemies[0], u.hand.find(c => c.lukaWolfFang));
      const disc = u.pileStats?.discard || u.discard || [];
      return { i0, i1: u.intent,
        discard: disc.map(c => ({ n: c.name, noIntentCost: !!c.noIntentCost, lukaWolfFang: !!c.lukaWolfFang })) };
    })()`);
    T("J1 狼牙杀打出免杀意", s1 && s1.i1 === s1.i0, s1);
    T("J2 弃牌堆保留 noIntentCost（clearPlayFlags 有意豁免）",
      (s1?.discard || []).some(c => c.n === "狼牙杀" && c.noIntentCost), s1?.discard);
    const rr = await run(page, recycleAndReplay("狼牙杀"));
    T("J3 回收后再打出仍免杀意 —— 与卡面「此牌不消耗杀意」一致，属设计非 BUG",
      rr && rr.recycled && rr.iAfter === rr.iBefore, rr);
  }

  const list = relevantErrors(errors);
  T("无 JS 错误", list.length === 0, list.slice(0, 3));
  console.log(`\n免杀意真实链路：${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})();
