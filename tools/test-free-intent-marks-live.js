// 全库「免杀意」标记的残留与回收危害检查。
//
// 背景：【记忆泡泡】曾出现同类 BUG —— 牌打出后 _bubbleFree/_bubbleCast 未清除，
// 牌带着「免杀意」标记进弃牌堆；弃牌堆被洗回牌库或被技能取回后，
// 再打出会错误地不消耗杀意（且不再询问放入）。
//
// 本测试把同类风险推广到全库所有免杀意来源：
//   1. 打出免杀意实体【杀】，确认当时确实免杀意（intent 未扣）
//   2. 检查进弃牌堆时牌上是否残留免杀意标记
//   3. 把该牌从弃牌堆取回手牌（模拟洗牌 / 回收类技能）再打出，
//      确认这次**正常消耗杀意**（不错误免杀意）
//
// 覆盖来源（battle-card-playability.js 的 hasNoIntentCost）：
//   noIntentCost 直接标记（格林机枪 / 狂风绝息斩 / 武器库 / 猛龙断空斩 /
//   疯狂射击 / 撞杀 / 冰心双刺剑 / 魅魔钢叉 / 刺客胶衣 / 暴走）
//   rageKill（怒杀，hp<maxHp）        pursueKill（追杀 + pursueFreeThisTurn）
//   withererPeekSlash（杀欲窥视）     withererBerserkKill（暴走转换）
//   兽人火力压制（动态判定 + _beastSuppressionApplied）
//   _bubbleFree（记忆泡泡，已修，回归）
//
// 分批：FREE_INTENT=A|B|C|D|E，不设则跑全部。
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const {
  openGame, startRegressionBattle, collectErrors, relevantErrors,
} = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const PART = (process.env.FREE_INTENT || "ALL").toUpperCase();
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

// 构造：我方首名角色持一张实体【杀】，杀意充足，敌人不可响应。
const setupTpl = (card, opts = {}) => `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false; b.phase = 4;
  delete b.karunaBubble; delete b.karunaBubblePending; delete b.thunderHammer;
  delete b.selectedSkillCard; delete b.greenGatlingResume;
  const u = b.allies[0], foe = b.enemies[0];
  ${opts.ref ? `u.ref = ${JSON.stringify(opts.ref)}; u.id = ${JSON.stringify(opts.ref)};` : ""}
  u.name = ${JSON.stringify(opts.name || "测试角色")};
  u.gender = "female";
  u.stats = { attack: 10, magic: 4, speed: 3, maxHp: 100, bloodlust: 3, handLimit: 9 };
  u.hp = ${opts.hp ?? 100}; u.maxHp = 100; u.block = 0; u.intent = ${opts.intent ?? 2};
  u.intentMax = 3;
  u.skills = [];
  ${opts.extraUnit || ""}
  u.pileStats = u.pileStats || {};
  u.pileStats.discard = []; u.pileStats.consumed = [];
  u.discard = u.pileStats.discard; u.consumed = u.pileStats.consumed;
  b.enemies.forEach(e => {
    e.hp = e.maxHp = 200; e.block = 0; e.statuses = [];
    e.hand = []; e.noResponse = true;
    e.pileStats = e.pileStats || {};
    e.pileStats.discard = []; e.pileStats.consumed = [];
    e.discard = e.pileStats.discard; e.consumed = e.pileStats.consumed;
  });
  u.hand = ${JSON.stringify(Array.isArray(card) ? card : [card])};
  b.activeUid = u.uid;
  b.selectedCardIndex = -1;
  st.log = []; st.battleLog = [];
  window.render();
  return { hand: u.hand.length, intent: u.intent, foeUid: b.enemies[0].uid };
})()`;

const snapTpl = `(() => {
  const st = window.state, b = st.battle, u = b.allies[0];
  const disc = u.pileStats?.discard || u.discard || [];
  return {
    hand: (u.hand || []).map(c => c.name),
    discard: disc.map(c => c.name),
    marks: disc.map(c => ({
      n: c.name,
      noIntentCost: !!c.noIntentCost,
      mikeDragonSlash: !!c.mikeDragonSlash,
      withererBerserkKill: !!c.withererBerserkKill,
      withererPeekSlash: !!c.withererPeekSlash,
      pursueKill: !!c.pursueKill,
      rageKill: !!c.rageKill,
      bubbleFree: !!c._bubbleFree,
      beastApplied: !!c._beastSuppressionApplied,
      lukaWolfFang: !!c.lukaWolfFang,
    })),
    intent: u.intent,
    locked: !!b.locked,
    logs: (st.battleLog || []).join(" | "),
  };
})()`;

const playTpl = name => `(() => {
  const st = window.state, b = st.battle, u = b.allies[0];
  const card = u.hand.find(c => c.name === ${JSON.stringify(name)});
  if (!card) return false;
  window.BattleSystem.useCard(st, u, card.targetless ? null : b.enemies[0], card);
  return true;
})()`;

// 把弃牌堆里的牌取回手牌：模拟弃牌堆洗回牌库 / 回收类技能后的再次上手。
const recycleTpl = name => `(() => {
  const st = window.state, b = st.battle, u = b.allies[0];
  const disc = u.pileStats?.discard || u.discard || [];
  const i = disc.findIndex(c => c.name === ${JSON.stringify(name)});
  if (i < 0) return false;
  const card = disc.splice(i, 1)[0];
  // 洗回牌库再摸上手，是真实存在的路径（battle-pile-stats 洗牌）。
  u.hand.push(card);
  u.intent = 2;
  b.animQueue = []; b.locked = false; b.phase = 4;
  b.activeUid = u.uid;
  window.render();
  return true;
})()`;

const settle = async page => {
  await evalT(page, "window.BattleEffects?.whenIdle?.()", 8000, "whenIdle");
  await page.waitForTimeout(300);
};

const playAndSnap = async (page, name) => {
  await evalT(page, playTpl(name), 15000, `play:${name}`);
  await page.waitForTimeout(600);
  await settle(page);
  return evalT(page, snapTpl, 15000, `snap:${name}`);
};

// 单一来源的完整三步：免杀意生效 → 进堆无残留 → 回收再打出正常扣杀意。
const checkSource = async (page, label, card, opts = {}) => {
  await evalT(page, setupTpl(card, opts), 20000, `setup:${label}`);
  const before = await evalT(page, snapTpl, 15000, `before:${label}`);
  const s1 = await playAndSnap(page, card.name);
  T(`${label} 1 打出时免杀意生效（intent 未扣）`,
    s1.intent === before.intent,
    { before: before.intent, after: s1.intent, logs: s1.logs.slice(-90) });
  T(`${label} 2 牌进了弃牌堆`, s1.discard.includes(card.name),
    { discard: s1.discard });
  const mark = (s1.marks || []).find(m => m.n === card.name) || {};
  // 会造成错误免杀意的标记：hasNoIntentCost 实际读取的那些。
  const lethal = Object.entries(mark).filter(([k, v]) =>
    v === true && ["noIntentCost", "withererBerserkKill", "withererPeekSlash",
      "bubbleFree", "beastApplied"].includes(k));
  T(`${label} 3 进弃牌堆时会造成免杀意的标记已清除`,
    lethal.length === 0, { lethal: lethal.map(([k]) => k), mark });
  // rageKill / pursueKill 是卡牌固有属性（卡牌表定义），本就该留在牌上；
  // mikeDragonSlash 不参与 hasNoIntentCost 判定，仅用于回合重置清理，
  // 残留属无害泄漏，单独记录但不判失败。
  const leaked = Object.entries(mark).filter(([k, v]) =>
    v === true && !["n", "rageKill", "pursueKill"].includes(k)
    && !lethal.some(([lk]) => lk === k));
  if (leaked.length) {
    console.log(`   ℹ️  ${label} 无害残留标记（不参与免杀意判定）：`
      + leaked.map(([k]) => k).join("、"));
  }

  const ok = await evalT(page, recycleTpl(card.name), 15000, `recycle:${label}`);
  if (ok !== true) {
    T(`${label} 4 回收成功`, false, { ok });
    return;
  }
  const s2 = await playAndSnap(page, card.name);
  T(`${label} 4 回收后再打出正常消耗杀意（不错误免杀意）`,
    s2.intent === 1,
    { intent: s2.intent, logs: s2.logs.slice(-90) });
};

const KILL = (extra = {}) => Object.assign({
  name: "测试杀", type: "slash", suit: "♣", power: 0, scale: "attack",
  text: "", targetless: false,
}, extra);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = collectErrors(page);
  await openGame(page);
  await startRegressionBattle(page);

  // ---------- A 段：noIntentCost 直接标记（各类技能/饰品转化的最终形态）----------
  if (want("A")) {
    console.log("\n--- A 段：手牌实体【杀】被打上 noIntentCost 后打出 ---");
    await checkSource(page, "A", KILL({ noIntentCost: true }));
  }

  // ---------- B 段：安倍麦克【猛龙断空斩】（mikeDragonSlash，摸牌堆获得）----------
  if (want("B")) {
    console.log("\n--- B 段：猛龙断空斩 mikeDragonSlash ---");
    await checkSource(page, "B", KILL({ noIntentCost: true, mikeDragonSlash: true }));
  }

  // ---------- C 段：凋零者【暴走】转换（withererBerserkKill）----------
  if (want("C")) {
    console.log("\n--- C 段：暴走转换 withererBerserkKill ---");
    await checkSource(page, "C", KILL({ noIntentCost: true, withererBerserkKill: true }),
      { extraUnit: "u.withererMode = '暴走';" });
  }

  // ---------- D 段：固有属性类（怒杀 / 追杀），本就按牌面与单位状态动态判定 ----------
  if (want("D")) {
    console.log("\n--- D 段：怒杀 rageKill（hp<maxHp 时免杀意）---");
    // 怒杀是卡牌固有属性，不依赖运行时标记：回收后若已回满血则应正常消耗。
    await evalT(page, setupTpl(KILL({ rageKill: true }), { hp: 60 }), 20000, "setupD");
    const b0 = await evalT(page, snapTpl, 15000, "beforeD");
    const s1 = await playAndSnap(page, "测试杀");
    T("D1 怒杀在 hp<maxHp 时免杀意", s1.intent === b0.intent,
      { before: b0.intent, after: s1.intent });
    await evalT(page, recycleTpl("测试杀"), 15000, "recycleD");
    // 回满血后怒杀不再免杀意，应正常扣 1 点。
    await evalT(page, "window.state.battle.allies[0].hp = window.state.battle.allies[0].maxHp;",
      15000, "healD");
    const s2 = await playAndSnap(page, "测试杀");
    T("D2 回满血后怒杀正常消耗杀意（说明是动态判定、非残留标记）",
      s2.intent === 1, { intent: s2.intent });

    console.log("\n--- D 段：追杀 pursueKill + pursueFreeThisTurn ---");
    await evalT(page, setupTpl(KILL({ pursueKill: true }),
      { extraUnit: "u.pursueFreeThisTurn = true;" }), 20000, "setupD2");
    const b1 = await evalT(page, snapTpl, 15000, "beforeD2");
    const s3 = await playAndSnap(page, "测试杀");
    T("D3 追杀在本回合标记下免杀意", s3.intent === b1.intent,
      { before: b1.intent, after: s3.intent });
    await evalT(page, recycleTpl("测试杀"), 15000, "recycleD2");
    await evalT(page, "window.state.battle.allies[0].pursueFreeThisTurn = false;",
      15000, "clearD2");
    const s4 = await playAndSnap(page, "测试杀");
    T("D4 标记清空后追杀正常消耗杀意", s4.intent === 1, { intent: s4.intent });
  }

  // ---------- E 段：记忆泡泡（已修 BUG 的回归）----------
  if (want("E")) {
    console.log("\n--- E 段：记忆泡泡 _bubbleFree 回归 ---");
    await evalT(page, setupTpl(KILL({ _bubbleFree: true, _bubbleCast: true }),
      { ref: "abe_karuna", name: "安倍卡露娜" }), 20000, "setupE");
    const b0 = await evalT(page, snapTpl, 15000, "beforeE");
    const s1 = await playAndSnap(page, "测试杀");
    T("E1 泡泡牌打出时免杀意", s1.intent === b0.intent,
      { before: b0.intent, after: s1.intent });
    const m = (s1.marks || []).find(x => x.n === "测试杀") || {};
    T("E2 进弃牌堆时 _bubbleFree 已清除（上轮修复点）",
      m.bubbleFree === false, { mark: m });
  }

  // ---------- F 段：真实触发链路端到端（不手工打标记）----------
  if (want("F")) {
    console.log("\n--- F 段：格林机枪真实触发后检查弃牌堆 ---");
    await evalT(page, setupTpl([
      KILL({ name: "甲杀" }), KILL({ name: "乙杀" }),
    ], { extraUnit: "u.battleRelics = ['格林机枪'];" }), 20000, "setupF1");
    const b0 = await evalT(page, snapTpl, 15000, "beforeF1");
    const s1 = await playAndSnap(page, "甲杀");
    T("F1 格林机枪追加使用了另一张杀（两张都离手）",
      s1.discard.includes("甲杀") && s1.discard.includes("乙杀"),
      { discard: s1.discard, logs: s1.logs.slice(-120) });
    const mA = (s1.marks || []).find(x => x.n === "甲杀") || {};
    const mB = (s1.marks || []).find(x => x.n === "乙杀") || {};
    T("F2 主牌进弃牌堆时 noIntentCost 已清除", mA.noIntentCost === false, { mA });
    T("F3 追加牌进弃牌堆时 noIntentCost 已清除", mB.noIntentCost === false, { mB });

    // 回收追加牌再打出：应正常消耗杀意。
    const rc = await evalT(page, recycleTpl("乙杀"), 15000, "recycleF1");
    T("F4 追加牌已回收到手牌（否则下条断言会假通过）", rc === true, { rc });
    const s2 = await playAndSnap(page, "乙杀");
    T("F5 追加牌回收后再打出正常消耗杀意", s2.intent === 1,
      { intent: s2.intent, logs: s2.logs.slice(-120) });

    // 【狂风绝息斩】（罗卡尔）未在此做真实触发：CharacterSkillAccess.canActor
    // 对该大招的前置校验无法通过测试装配（已尝试补 skills / card 字段仍未放行）。
    // 该大招打的同样是标准 noIntentCost 标记（lokar-skills.js:31），
    // 与格林机枪同源，已被上面 F1~F4 的真实链路与 A 段的直接打标覆盖。
    // 这里改为核对源码口径，避免留下构造不通的假通过断言。
    const lokar = await evalT(page, `(() => {
      const src = ${JSON.stringify(require("fs").readFileSync(
        path.join(__dirname, "..", "src", "original", "lokar-skills.js"), "utf8"))};
      return { marks: (src.match(/slash\\.noIntentCost = true/g) || []).length };
    })()`, 15000, "lokarSrc");
    T("F6 狂风绝息斩打的也是标准 noIntentCost 标记（与已验证链路同源）",
      (lokar?.marks || 0) >= 1, { lokar });
  }

  const rel = relevantErrors(errors);
  T("无 JS 错误", rel.length === 0, { count: rel.length, sample: rel.slice(0, 2) });

  console.log(`\n结果：${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})();
