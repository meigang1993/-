// 怪面诺亚【魅力改造】× 免杀意离区残留 · 真实链路严格检查
//
// 背景：【记忆泡泡】曾出现同类 BUG —— 牌打出后 _bubbleFree/_bubbleCast 未清除，
// 捞回后再打出错误免杀意。魅力改造的免杀意是「角色 + 出牌阶段 + 杀牌」动态判据，
// 不给牌打标记；本测试用真实 useCard 链路确认：杀牌离开手牌区后不残留免杀意，
// 换人 / 换阶段 / 回收再打出都按正常规则消耗杀意。
//
//   A 诺亚打出杀（免杀意）→ 弃牌堆无标记 → 捞回给队友打出正常扣杀意
//   B 杀牌经魅力改造弃置离手 → 弃牌堆无标记 → 捞回给队友打出正常扣杀意
//   C 对照：同一出牌阶段内诺亚自己回收再打出仍免杀意（锁定技设计，不是残留）
//   D 反向验证：把判据改成恒 true（模拟「标记跟着牌走」），A/B 的扣杀意断言必须变红
//
// 分批：NOA_IC=A|B|C|D，不设则跑全部。
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const {
  openGame, startRegressionBattle, collectErrors, relevantErrors,
} = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const PARTS = (process.env.NOA_IC || "ALL").toUpperCase().split(",");
const want = p => PARTS.includes("ALL") || PARTS.includes(p);
const REVERT = process.env.NOA_IC_REVERT === "1";

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
const settle = async page => {
  await evalT(page, "window.BattleEffects?.whenIdle?.()", 2500, "whenIdle");
  await page.waitForTimeout(250);
};
const run = async (page, expr, label = "run") => {
  const r = await evalT(page, expr, 20000, label);
  await settle(page);
  return r;
};

const KILL = (name = "杀（普攻）", suit = "♠", extra = {}) =>
  ({ name, type: "slash", suit, power: 0, scale: "attack", ...extra });

// 基础战场：allies[0] = 怪面诺亚（带魅力改造），allies[1] = 普通队友，敌人不可响应。
const base = (o = {}) => `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false; b.phase = ${o.phase ?? 4};
  b.noaCharmDiscard = null; b.discardPick = null; b.handReveal = null;
  b.selectedCardIndex = -1; b.selectedSkillCard = null;
  const u = b.allies[0], u2 = b.allies[1];
  u.name = "怪面诺亚"; u.gender = "female"; u.ref = "noa";
  u.skills = [{ type: "passive", name: "魅力改造", text: "锁定技" }];
  u.stats = { attack: 6, magic: 4, speed: 8, maxHp: 130, bloodlust: 3, handLimit: 4, drawPerTurn: 1, initialDraw: 1 };
  u.hp = u.maxHp = 130; u.block = 0; u.intent = 2; u.intentMax = 3;
  u.battleRelics = [];
  u.pileStats = u.pileStats || {};
  u.pileStats.discard = []; u.pileStats.consumed = [];
  u.discard = u.pileStats.discard; u.consumed = u.pileStats.consumed;
  u.deck = [];
  if (u2) {
    u2.name = "队友"; u2.gender = "male"; u2.ref = "lokar";
    u2.stats = { attack: 8, magic: 3, speed: 2, maxHp: 100, bloodlust: 3, handLimit: 9 };
    u2.hp = u2.maxHp = 100; u2.block = 0; u2.intent = 2; u2.intentMax = 3;
    u2.skills = []; u2.battleRelics = []; u2.hand = [];
    u2.pileStats = u2.pileStats || {};
    u2.pileStats.discard = []; u2.pileStats.consumed = [];
    u2.discard = u2.pileStats.discard; u2.consumed = u2.pileStats.consumed;
    u2.deck = [];
  }
  b.enemies.forEach(e => {
    e.hp = e.maxHp = 300; e.block = 0; e.statuses = []; e.hand = [];
    e.noResponse = true; e.ai = "";
    e.pileStats = e.pileStats || {};
    e.pileStats.discard = []; e.pileStats.consumed = [];
    e.discard = e.pileStats.discard; e.consumed = e.pileStats.consumed;
  });
  u.hand = ${JSON.stringify(o.hand || [])};
  b.activeUid = u.uid;
  st.log = []; st.battleLog = [];
  ${REVERT ? "window.NoaCharmSkills.noIntentCost = () => true;" : ""}
  window.render();
  return { hand: u.hand.length, intent: u.intent, phase: b.phase };
})()`;

const marksOf = card => ["noIntentCost", "_bubbleFree", "_bubbleCast", "mikeDragonSlash",
  "withererPeekSlash", "withererBerserkKill", "lukaWolfFang", "ramKill", "_iceDagger"];

// 把弃牌堆里名为 name 的牌捞回给指定单位，再真实 useCard，返回 intent 前后差值。
const recycleAndReplay = (name, toAllyIndex) => `(() => {
  const st = window.state, b = st.battle, u = b.allies[0];
  const disc = u.pileStats?.discard || u.discard || [];
  const keys = ${JSON.stringify(marksOf(null))};
  const snapshot = disc.map(c => {
    const m = {}; keys.forEach(k => { m[k] = !!c[k]; });
    return { n: c.name, m };
  });
  const idx = disc.findIndex(c => c.name === ${JSON.stringify(name)});
  const recycled = idx >= 0;
  let card = null;
  if (recycled) card = disc.splice(idx, 1)[0];
  const who = b.allies[${toAllyIndex}] || u;
  if (card) who.hand.push(card);
  b.animQueue = []; b.locked = false;
  const i0 = who.intent;
  if (card) window.BattleSystem.useCard(st, who, b.enemies[0], card);
  return { snapshot, recycled, iBefore: i0, iAfter: who.intent,
    noaJudge: !!(card && window.NoaCharmSkills?.noIntentCost?.(who, card)),
    logs: (st.battleLog || []).join(" | ") };
})()`;

async function segA(browser) {
  const { page, errors } = await boot(browser);
  try {
    const s0 = await run(page, base({ hand: [KILL()] }), "A-setup");
    T("A0 场景：诺亚出牌阶段、手牌 1 张杀、杀意 2", s0 && s0.hand === 1 && s0.intent === 2 && s0.phase === 4, s0);

    // 真实打出：诺亚的杀不消耗杀意
    const played = await run(page, `(() => {
      const st = window.state, b = st.battle, u = b.allies[0];
      const card = u.hand.find(c => c.name === "杀（普攻）");
      const i0 = u.intent;
      window.BattleSystem.useCard(st, u, b.enemies[0], card);
      return { i0, i1: u.intent, hand: u.hand.length };
    })()`, "A-play");
    T("A1 诺亚打出杀免杀意（2 → 2）", played && played.i1 === played.i0, played);

    const disc = await run(page, `(() => {
      const st = window.state, u = st.battle.allies[0];
      const d = u.pileStats?.discard || u.discard || [];
      const keys = ${JSON.stringify(marksOf(null))};
      return d.map(c => { const m = {}; keys.forEach(k => { m[k] = !!c[k]; }); return { n: c.name, m }; });
    })()`, "A-disc");
    const killed = (disc || []).find(x => x.n === "杀（普攻）");
    T("A2 杀牌进弃牌堆（真实离区，不是留在手里）", !!killed, disc);
    T("A3 弃牌堆杀牌无任何免杀意标记残留",
      !!killed && marksOf(null).every(k => killed.m[k] === false), killed);

    // 捞回给队友打出：必须正常扣 1 点杀意
    const rec = await run(page, recycleAndReplay("杀（普攻）", 1), "A-recycle");
    T("A4 回收成功且判据对队友为 false（不跟着牌走）",
      rec && rec.recycled && rec.noaJudge === false, rec);
    T("A5 队友回收再打出正常消耗 1 点杀意",
      rec && rec.iBefore - rec.iAfter === 1, rec);

    // 附加：手动打上 noIntentCost 的杀牌离区后，通用 clearPlayFlags 必须抹掉
    const withMark = await run(page, `(() => {
      const st = window.state, b = st.battle, u = b.allies[0];
      b.phase = 4; b.animQueue = []; b.locked = false;
      u.intent = 2; u.pileStats.discard = []; u.discard = u.pileStats.discard;
      const card = ${JSON.stringify(KILL("杀（普攻）", "♥", { noIntentCost: true }))};
      u.hand = [card];
      window.BattleSystem.useCard(st, u, b.enemies[0], card);
      const d = u.pileStats.discard || [];
      return { found: d.some(c => c.name === "杀（普攻）"),
        free: d.some(c => !!c.noIntentCost) };
    })()`, "A-marked");
    T("A6 通用清除链路对诺亚手里出去的牌同样生效（无 noIntentCost 残留）",
      withMark && withMark.found && withMark.free === false, withMark);

    const errs = relevantErrors ? relevantErrors(errors) : errors;
    T("A7 无页面错误", !errs || errs.length === 0, errs);
  } finally { await page.close(); }
}

async function segB(browser) {
  const { page, errors } = await boot(browser);
  try {
    // 手牌 6 张（含 2 张杀），上限 4 → 魅力改造需弃 2 张
    const hand = [KILL("杀（普攻）", "♠"), KILL("杀（普攻）", "♥"),
      { name: "试牌1", type: "tactic", suit: "♠" }, { name: "试牌2", type: "tactic", suit: "♥" },
      { name: "试牌3", type: "tactic", suit: "♣" }, { name: "试牌4", type: "tactic", suit: "♦" }];
    const s0 = await run(page, base({ hand }), "B-setup");
    T("B0 场景：手牌 6 > 上限 4", s0 && s0.hand === 6, s0);

    // 触发魅力改造溢出：标准弃牌阶段同款（手牌区选牌 + 确认弃置）
    const hang = await run(page, `(() => {
      const st = window.state, b = st.battle, u = b.allies[0];
      window.NoaCharmSkills.balanceHand(st, u, () => {}, { onlySelf: true });
      window.render();
      return { need: b.noaCharmDiscard?.need || 0, locked: !!b.locked,
        hand: u.hand.length, hasReveal: !!b.handReveal };
    })()`, "B-hang");
    T("B1 溢出挂起：弃 2 张、不锁战斗、无专用弹窗",
      hang && hang.need === 2 && hang.locked === false && hang.hasReveal === false, hang);

    // 选中第 0、1 张（两张杀）→ 走真实 confirmDiscard → discardCards 一次性结算
    const conf = await run(page, `(() => {
      const st = window.state, b = st.battle, u = b.allies[0];
      b.discardPick = { unitUid: u.uid, indexes: [0, 1] };
      window.BattleSystem.confirmDiscard(st, () => {});
      return { hand: u.hand.length, charm: !!b.noaCharmDiscard,
        disc: (u.pileStats?.discard || u.discard || []).map(c => c.name) };
    })()`, "B-confirm");
    T("B2 确认弃置后回到手牌上限 4、挂起已清",
      conf && conf.hand === 4 && conf.charm === false, conf);
    T("B3 两张杀确实进了弃牌堆",
      conf && conf.disc.filter(n => n === "杀（普攻）").length === 2, conf);

    const disc = await run(page, `(() => {
      const u = window.state.battle.allies[0];
      const keys = ${JSON.stringify(marksOf(null))};
      return (u.pileStats?.discard || u.discard || []).map(c => {
        const m = {}; keys.forEach(k => { m[k] = !!c[k]; }); return { n: c.name, m };
      });
    })()`, "B-disc");
    T("B4 弃置离区的杀牌无任何免杀意标记残留",
      (disc || []).filter(x => x.n === "杀（普攻）").length === 2
      && disc.filter(x => x.n === "杀（普攻）").every(x => marksOf(null).every(k => x.m[k] === false)), disc);

    const rec = await run(page, recycleAndReplay("杀（普攻）", 1), "B-recycle");
    T("B5 捞回给队友打出正常消耗 1 点杀意",
      rec && rec.recycled && rec.iBefore - rec.iAfter === 1, rec);

    // 非出牌阶段：诺亚自己打杀也要正常扣（判据按阶段，不按牌）
    const other = await run(page, `(() => {
      const st = window.state, b = st.battle, u = b.allies[0];
      b.phase = 5; b.animQueue = []; b.locked = false;
      b.noaCharmDiscard = null;
      u.intent = 2;
      const card = ${JSON.stringify(KILL("杀（普攻）", "♠"))};
      u.hand = [card];
      const i0 = u.intent;
      window.BattleSystem.useCard(st, u, b.enemies[0], card);
      return { i0, i1: u.intent };
    })()`, "B-other-phase");
    T("B6 非出牌阶段诺亚打杀正常消耗 1 点杀意",
      other && other.i0 - other.i1 === 1, other);

    const errs = relevantErrors ? relevantErrors(errors) : errors;
    T("B7 无页面错误", !errs || errs.length === 0, errs);
  } finally { await page.close(); }
}

async function segC(browser) {
  const { page, errors } = await boot(browser);
  try {
    await run(page, base({ hand: [KILL()] }), "C-setup");
    await run(page, `(() => {
      const st = window.state, b = st.battle, u = b.allies[0];
      const card = u.hand.find(c => c.name === "杀（普攻）");
      window.BattleSystem.useCard(st, u, b.enemies[0], card);
      return u.intent;
    })()`, "C-play");
    // 同一出牌阶段内由诺亚自己捞回：锁定技仍免杀意（设计如此，不是标记残留）
    const rec = await run(page, recycleAndReplay("杀（普攻）", 0), "C-recycle");
    T("C1 诺亚本人同阶段回收再打出仍免杀意（设计：判据跟着角色与阶段）",
      rec && rec.recycled && rec.noaJudge === true && rec.iBefore === rec.iAfter, rec);
    const disc = await run(page, `(() => {
      const u = window.state.battle.allies[0];
      return (u.pileStats?.discard || u.discard || []).map(c => ({ n: c.name, free: !!c.noIntentCost }));
    })()`, "C-disc");
    T("C2 即便本人打出，牌上也不写标记（免杀意不是牌属性）",
      (disc || []).every(x => x.free === false), disc);
    const errs = relevantErrors ? relevantErrors(errors) : errors;
    T("C3 无页面错误", !errs || errs.length === 0, errs);
  } finally { await page.close(); }
}

async function segD(browser) {
  const { page, errors } = await boot(browser);
  try {
    // 反向态：判据改成恒 true，模拟「牌上残留免杀意标记 / 判据跟着牌走」。
    // 若断言有效，A/B 中「队友回收后正常扣杀意」这一类必须变红。
    await page.evaluate(() => { window.NoaCharmSkills.noIntentCost = () => true; });
    const s0 = await run(page, base({ hand: [KILL()] }), "D-setup");
    T("D0 反向态已生效（判据对队友恒 true）", await evalT(page, `(() => {
      const b = window.state.battle;
      return window.NoaCharmSkills.noIntentCost(b.allies[1], { name: "杀（普攻）", type: "slash" });
    })()`) === true, s0);
    await run(page, `(() => {
      const st = window.state, b = st.battle, u = b.allies[0];
      window.BattleSystem.useCard(st, u, b.enemies[0], u.hand[0]);
      return u.intent;
    })()`, "D-play");
    const rec = await run(page, recycleAndReplay("杀（普攻）", 1), "D-recycle");
    T("D1 反向态下队友回收再打出被错误免杀意（iAfter === iBefore，正向 A5/B5 应红）",
      rec && rec.iBefore === rec.iAfter, rec);
    T("D2 反向态下判据对队友仍为 true（正向 A4 应红）",
      rec && rec.noaJudge === true, rec);
    const errs = relevantErrors ? relevantErrors(errors) : errors;
    T("D3 无页面错误", !errs || errs.length === 0, errs);
  } finally { await page.close(); }
}

const boot = async browser => {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = collectErrors(page);
  await openGame(page);
  await startRegressionBattle(page);
  return { page, errors };
};

(async () => {
  const browser = await chromium.launch();
  try {
    if (want("A")) await segA(browser);
    if (want("B")) await segB(browser);
    if (want("C")) await segC(browser);
    if (want("D")) await segD(browser);
  } finally {
    await browser.close();
  }
  console.log(`\n${pass}/${total} passed  (NOA_IC=${PARTS.join(",")}, REVERT=${REVERT ? 1 : 0})`);
  if (pass !== total) process.exitCode = 1;
})();
