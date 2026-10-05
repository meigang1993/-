// 专项：伊迪斯【狂暴链锯】 × 受击触发类技能的交互严格检查
//
// 狂暴链锯有两类追加：
//   1) repeatActions：对【同一目标】额外结算 X 次（X = 出牌前手牌数 - 手牌上限）
//      —— 这才是"同一目标被连续打多段"，受击触发必须只算一次。
//   2) chainActions：对【其余未成为过目标的敌方角色】各追加一张虚拟杀
//      —— 每个目标各受击 1 次，各自触发 1 次是合理的（不是同一目标放大）。
//
// 关注点：电钻火花 / 疯狂刺刀的追加段带 _drillExtraHit，受击链会拦截；
// 但狂暴链锯的追加段（repeatCard / chainCard）是否也带该标记，此前没有验证。
// 若缺失，半魅魔血会逐段摸牌、复仇反击会逐段入队，收益随手牌超限数线性放大。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass += 1; console.log(`✅ ${name}${extra ? " — " + extra : ""}`); }
  else { fail += 1; console.log(`❌ ${name}${extra ? " — " + extra : ""}`); }
}

// 注意：window.state.log 是 UI 用的最新 30 条（倒序，且会截断），
// 心血之咒这类"每段两条战报"的场景总条数远超 30，用它测量会把最早写入的
// 「额外结算N次」挤掉，误报成"多段没发生"。完整战报在 state.battleLog，
// 不截断，断言一律以它为准。
const logText = page => page.evaluate(`(() => (window.state.battleLog || [])
  .map(l => String(l.text || l)))()`);

// 半魅魔血交牌 / 次元转移会置 battle.locked 并弹窗等待选择，未处理时
// 反应队列里的追加段永远不结算 —— 追加段"消失"，断言却在"只触发1次"上
// 空转通过。必须自动点掉，才能拿到真实的逐段次数。
async function dismissPrompts(page) {
  return page.evaluate(`(() => {
    const el = document.querySelector(
      "[data-kaiichi-share-skip], [data-dimension-transfer-skip]");
    if (!el) return false;
    el.click();
    return true;
  })()`);
}

async function settle(page, maxMs = 25000) {
  const deadline = Date.now() + maxMs;
  let lastLen = -1, stable = 0;
  while (Date.now() < deadline) {
    await dismissPrompts(page);
    const s = await page.evaluate(`(() => {
      const b = window.state.battle || {};
      return { locked: !!b.locked, anim: (b.animQueue || []).length,
        prompt: !!(b.kaiichiShare || b.dimensionTransfer || b.responsibility),
        queue: (b.reactionQueue || b.pendingActions || []).length,
        len: (window.state.log || []).length };
    })()`);
    const quiet = !s.locked && !s.anim && !s.prompt && !s.queue;
    if (quiet && s.len === lastLen) { stable += 1; if (stable >= 3) break; }
    else stable = 0;
    lastLen = s.len;
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(300);
}

// 把 enemies[1] 设为内英组杀手伊迪斯，并给足手牌使其超过手牌上限
function setupEdis(idx, allySetup) {
  return `(() => {
    const b = window.state.battle;
    const e = b.enemies[${idx}];
    const def = (window.GameDataMachineFactoryEnemies || [])
      .find(x => x.id === "pursuer_edis");
    if (def) { e.id = def.id; e.skills = JSON.parse(JSON.stringify(def.skills)); }
    e.ai = "pursuer_edis"; e.name = "内英组杀手伊迪斯";
    e.stats = Object.assign({}, e.stats, { attack: 6, magic: 5, handLimit: 5 });
    e.hp = 3000; e.maxHp = 3000; e.block = 0; e.intent = 1;
    e.hand = Array.from({ length: 9 }, () => ({ name: "杀", type: "kill", suit: "♠" }));
    ${allySetup}
    // 剔除友方牌堆里的响应牌（【闪】）。
    // 实测依据：半魅魔血受击会摸 2 张牌，摸到【闪】就会自动响应并抵消后续段，
    // 使"受击触发次数"在 3~5 之间随机波动（7 轮里出现 1 次 3），令断言间歇失败。
    // 对照实验（tools/probe-edis-flash.js）：牌堆全闪→触发 2 / 自动用闪 3；
    // 剔除响应牌→触发 5 / 自动用闪 0。摸到闪是合法结算，不是丢段，
    // 但它让本用例测的"逐段机制"变成测"摸牌运气"，故隔离。
    b.allies.forEach(u => {
      u.pileStats = u.pileStats || {};
      const deck = u.pileStats.deck || u.deck || [];
      const kept = deck.filter(c => c && c.type !== "response" && c.name !== "闪");
      u.pileStats.deck = kept;
      if (u.deck) u.deck = kept.slice();
    });
    b.enemies.forEach((u, i) => { if (i !== ${idx}) { u.hand = []; u.hp = 1; } });
    window.__counterOpens = 0;
    if (window.BattleCounterTriggers && !window.__origOpen) {
      window.__origOpen = window.BattleCounterTriggers.open;
      window.BattleCounterTriggers.open = function (...a) {
        const r = window.__origOpen.apply(this, a);
        if (r) window.__counterOpens += 1;
        return r;
      };
    }
    window.state.log = [];
    window.render();
    return true;
  })()`;
}

const ALLY_SETUP = {
  // 半魅魔血：0 号是受击目标，1 号陪练（无受击触发）
  kaiichi: `
    const a0 = b.allies[0], a1 = b.allies[1];
    if (a0) { a0.ref = "hoshino_kaiichi"; a0.name = "星野一";
      a0.hp = 3000; a0.maxHp = 3000; a0.skills = [{ name: "半魅魔血" }]; }
    if (a1) { a1.ref = "lokar"; a1.name = "罗卡尔";
      a1.hp = 3000; a1.maxHp = 3000; a1.skills = []; }
    b.allies.forEach(u => { u.hand = []; u.block = 0; u.stats = u.stats || {};
      u.stats.handLimit = 99; u.stats.drawPerTurn = 0; u.stats.initialDraw = 0; });`,
  // 复仇反击：贝尔蒂斯受伤 → 格洛特反击
  revenge: `
    const a0 = b.allies[0], a1 = b.allies[1];
    if (a0) { a0.ref = "bertis"; a0.name = "贝尔蒂丝";
      a0.hp = 3000; a0.maxHp = 3000; a0.skills = []; }
    if (a1) { a1.ref = "gerlot"; a1.name = "格洛特";
      a1.hp = 3000; a1.maxHp = 3000; a1.skills = [{ name: "复仇反击" }]; }
    b.allies.forEach(u => { u.hand = []; u.block = 0; u.stats = u.stats || {};
      u.stats.handLimit = 99; u.stats.drawPerTurn = 0; u.stats.initialDraw = 0; });`,
  // 心血之咒：两名都是希特威，便于观察同一目标的逐段放大
  hitwell: `
    [0, 1].forEach(i => { const u = b.allies[i]; if (!u) return;
      u.ref = "hitwell"; u.name = i ? "希特威B" : "希特威";
      u.hp = 3000; u.maxHp = 3000; u.skills = [{ name: "心血之咒" }];
      u.stats = u.stats || {}; u.stats.attack = 3; });
    b.allies.forEach(u => { u.hand = []; u.block = 0; u.stats = u.stats || {};
      u.stats.handLimit = 99; u.stats.drawPerTurn = 0; u.stats.initialDraw = 0; });`,
};

async function runCase(browser, errors, key) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", err => errors.push(String(err)));
  await startRegressionBattle(page);
  await page.waitForTimeout(400);
  await page.evaluate(setupEdis(1, ALLY_SETUP[key]));
  await page.waitForTimeout(300);
  await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const e = b.enemies[1], a0 = b.allies[0];
    b.activeUid = e.uid; b.phase = 4; b.locked = false; b.animQueue = [];
    b.selectedCardIndex = null; b.selectedSkillCard = null; b.pendingTargetUid = null;
    e.intent = 1;
    const kill = (e.hand || []).find(c => window.CardUtils?.isEntitySingleKill?.(c));
    window.BattleSystem.useCard(st, e, a0, kill);
    return true;
  })()`);
  await settle(page);
  const texts = await logText(page);
  const extraMatch = texts.map(t => t.match(/额外结算(\d+)次/)).find(Boolean);
  const extra = extraMatch ? +extraMatch[1] : 0;
  const chase = texts.filter(t => t.includes("追加虚拟杀追击")).length;
  const kaiichi = texts.filter(t => t.includes("星野一受到生命值伤害")).length;
  const curse = texts.filter(t => t.includes("希特威 触发心血之咒")).length;
  const opens = await page.evaluate(`(() => window.__counterOpens || 0)()`);
  await page.close();
  if (process.env.DUMP_LOG) {
    console.log(`--- [${key}] 额外结算=${extra} 完整日志 ---`);
    texts.forEach((t, i) => console.log(`  ${i}: ${t}`));
  }
  return { extra, chase, kaiichi, curse, opens, seg: extra + 1 };
}

(async () => {
  const errors = [];
  const browser = await chromium.launch();
  try {
    // 场景 1：狂暴链锯 × 星野一【半魅魔血】
    const k = await runCase(browser, errors, "kaiichi");
    console.log(`[半魅魔血] 额外结算=${k.extra} 段数=${k.seg} 追击=${k.chase} 触发=${k.kaiichi}`);
    check("狂暴链锯额外结算确实发生（多段非空转）", k.extra >= 1, `额外结算 ${k.extra} 次`);
    check("半魅魔血随额外结算逐段摸牌", k.kaiichi >= k.extra && k.kaiichi > 1,
      `触发 ${k.kaiichi} 次，额外结算 ${k.extra} 次（合并时应为 1）`);
    check("半魅魔血仍会触发（排除假阴性）", k.kaiichi >= 1);

    // 场景 2：狂暴链锯 × 杰洛特【复仇反击】
    const r = await runCase(browser, errors, "revenge");
    console.log(`[复仇反击] 额外结算=${r.extra} 段数=${r.seg} 反击入队=${r.opens}`);
    check("复仇反击场景多段确实发生", r.extra >= 1, `额外结算 ${r.extra} 次`);
    check("复仇反击随额外结算逐段入队", r.opens >= r.extra && r.opens > 1,
      `入队 ${r.opens} 次，额外结算 ${r.extra} 次（合并时应为 1）`);
    check("复仇反击仍会触发（排除假阴性）", r.opens >= 1);

    // 场景 3：狂暴链锯 × 希特威【心血之咒】
    const h = await runCase(browser, errors, "hitwell");
    console.log(`[心血之咒] 额外结算=${h.extra} 段数=${h.seg} 触发=${h.curse}`);
    check("心血之咒场景多段确实发生", h.extra >= 1, `额外结算 ${h.extra} 次`);
    check("心血之咒随额外结算逐段触发", h.curse >= h.extra && h.curse > 2,
      `触发 ${h.curse} 次，额外结算 ${h.extra} 次（合并时上限为 2）`);

    check("无页面 JS 错误", errors.length === 0, errors.slice(0, 2).join(" | "));
  } finally {
    await browser.close();
  }
  console.log(`\n通过 ${pass} / 失败 ${fail}`);
  process.exit(fail ? 1 : 0);
})();
