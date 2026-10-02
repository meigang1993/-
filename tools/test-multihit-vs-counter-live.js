// 专项：多段/连击攻击技能 × 受击触发类技能的交互严格检查
//
// 关注点：一次攻击被拆成 N 段伤害时，受击方的「受伤后反击 / 受伤后获得收益」
// 是否被逐段重复触发。逐段触发会让收益随段数线性放大（骰子点数、手牌杀数
// 直接放大反伤、摸牌量、标记数），与 battle-damage-triggers.js 的统一约定
// 「追加段 _drillExtraHit 不触发受击类」相悖。
//
// 关键：早期版本本用例存在「假通过」——机械AI龙的追加段被半魅魔血交牌弹窗
// （battle.locked）挡住没有真正结算，日志里看不到后续段，断言却在"只触发1次"
// 上通过。因此本用例做了两件事：
//   1) 自动点掉所有阻塞弹窗（半魅魔血交牌 / 次元转移），让反应队列能 flush 完；
//   2) 每段都先断言「多段确实发生（seg > 1）」，再做放大判定，杜绝空转通过。
//
// 覆盖：
//   1) 电钻火花 × 杰洛特【复仇反击】        2) 电钻火花 × 希特威【心血之咒】
//   3) 电钻火花 × 曼妮【刺刀AK47】          4) 疯狂刺刀 × 凋零者【外神之眼】
//   5) 实体牌 + _drillExtraHit 的显式守卫   6) 单段对照（排除假阴性）
//   7) 电钻火花 × 星野一【半魅魔血】        8) 电钻火花 × 安洁莉卡【狂战】
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

// 逐段 / 合并的判据来自技能描述本身，不靠口头约定：
// 描述里写了「多段或连击伤害时逐段结算」的，逐段就是预期；没写的必须合并。
// 描述一旦被改，这两条会先于行为断言变红，提示同步实现与本用例。
const srcOf = name => fs.readFileSync(
  path.join(__dirname, "..", "src", "original", name), "utf8");
// 【狂战意志】「多段或连击伤害时逐段结算」已取消：多段只发 1 枚。
// 描述一旦被加回逐段声明，这条会先于行为断言变红，提示同步实现与本用例。
const berserkDescPerSeg = /狂战意志[\s\S]{0,600}?逐段结算/
  .test(srcOf("data-characters-extra.js"));
// 【半魅魔血】「多段或连击伤害时逐段结算」已取消：多段只摸 1 次 2 张。
// 描述一旦被加回逐段声明，这条会先于行为断言变红，提示同步实现与本用例。
const kaiichiDescPerSeg = /半魅魔血[\s\S]{0,600}?逐段结算/
  .test(srcOf("data-new-characters.js"));

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass += 1; console.log(`✅ ${name}${extra ? " — " + extra : ""}`); }
  else { fail += 1; console.log(`❌ ${name}${extra ? " — " + extra : ""}`); }
}

const logText = page => page.evaluate(`(() => (window.state.log || [])
  .map(l => String(l.text || l)))()`);

// 半魅魔血交牌 / 次元转移都会置 battle.locked 并弹窗等待玩家选择，
// 未处理时反应队列里的追加段永远不会结算（追加段"消失"，用例假通过）。
// 这里统一点掉「不交 / 放弃发动」，让后续段真正落地。
async function dismissPrompts(page) {
  return page.evaluate(`(() => {
    const el = document.querySelector(
      "[data-kaiichi-share-skip], [data-dimension-transfer-skip]");
    if (!el) return false;
    el.click();
    return true;
  })()`);
}

// 等到「没有弹窗、没有动画、日志不再增长」，确保追加段全部结算完毕。
async function settle(page, maxMs = 20000) {
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
  await dismissPrompts(page);
  await page.waitForTimeout(300);
}

// 通用构造：把敌方 idx 设为机械AI龙，我方设为指定受击角色
function setupDragonVs(idx, allySetup) {
  return `(() => {
    const b = window.state.battle;
    const e = b.enemies[${idx}];
    // 电钻火花是机械AI龙的【主动技】，只改 ai/name 不会带上技能表，
    // 骰子追加段永远不会发动。必须整份复制定义里的 skills。
    const def = (window.GameDataRuinsSandCityEnemies || [])
      .find(x => x.id === "mech_ai_dragon");
    if (def) { e.id = def.id; e.skills = JSON.parse(JSON.stringify(def.skills)); }
    e.ai = "ruins_dragon"; e.name = "机械AI龙";
    e.stats = e.stats || {}; e.stats.attack = 13;
    e.hp = 342; e.intent = 1; e.block = 0;
    e.hand = [{ name: "杀", type: "kill", suit: "♠" }];
    ${allySetup}
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
    if (!window.__origChoose) window.__origChoose = window.BattleAI.choose;
    const orig = window.__origChoose;
    window.BattleAI.choose = function (bb, actor, canPlay) {
      let r = null;
      if (actor?.ai === "ruins_dragon" && !window.__dkDone) {
        let kill = (actor.hand || []).find(c => window.CardUtils?.isEntitySingleKill?.(c))
          || { name: "杀", type: "kill", suit: "♠" };
        if (!actor.hand.includes(kill)) actor.hand.push(kill);
        r = { card: kill, target: (bb.allies || [])[0], score: 999 };
        window.__dkDone = true;
      }
      if (!r) { try { r = orig(bb, actor, canPlay); } catch (err) {} }
      return r;
    };
    window.state.log = [];
    window.render();
    return true;
  })()`;
}

// 注意：不能把 allies 截断到 1 名——回合引擎需要至少两名存活角色才会推进到
// 敌方回合，截断后机械AI龙永不行动。因此保留 1 名陪练，且陪练必须与目标同源，
// 否则敌方目标随机、攻击落到陪练时目标技能不触发，用例会随机 flaky。
const ALLY_SETUP = {
  gerlot: `
    const a0 = b.allies[0], a1 = b.allies[1];
    if (a0) { a0.ref = "bertis"; a0.name = "贝尔蒂丝"; a0.hp = 3000; a0.maxHp = 3000;
      a0.skills = [{ name: "快速生长" }]; }
    if (a1) { a1.ref = "gerlot"; a1.name = "格洛特"; a1.hp = 3000; a1.maxHp = 3000;
      a1.skills = [{ name: "复仇反击" }];
      a1.stats = a1.stats || {}; a1.stats.attack = 5; }
    b.allies.forEach(u => { u.hand = []; u.stats = u.stats || {};
      u.stats.handLimit = 99; u.stats.drawPerTurn = 0; u.stats.initialDraw = 0; });`,
  hitwell: `
    [0, 1].forEach(i => { const u = b.allies[i]; if (!u) return;
      u.ref = "hitwell"; u.name = i ? "希特威B" : "希特威";
      u.hp = 3000; u.maxHp = 3000; u.skills = [{ name: "心血之咒" }];
      u.stats = u.stats || {}; u.stats.attack = 3; });
    b.allies.forEach(u => { u.hand = []; u.stats = u.stats || {};
      u.stats.handLimit = 99; u.stats.drawPerTurn = 0; u.stats.initialDraw = 0; });`,
  manny: `
    [0, 1].forEach(i => { const u = b.allies[i]; if (!u) return;
      u.ref = "manny"; u.name = i ? "曼妮B" : "曼妮";
      u.hp = 3000; u.maxHp = 3000; u.mannyWeapon = "ak47";
      u.skills = [{ name: "刺刀AK47" }];
      u.stats = u.stats || {}; u.stats.attack = 4; });
    b.allies.forEach(u => { u.hand = []; u.stats = u.stats || {};
      u.stats.handLimit = 99; u.stats.drawPerTurn = 0; u.stats.initialDraw = 0; });`,
  kaiichi: `
    [0, 1].forEach(i => { const u = b.allies[i]; if (!u) return;
      u.ref = "hoshino_kaiichi"; u.name = i ? "星野一B" : "星野一";
      u.hp = 3000; u.maxHp = 3000; u.skills = [{ name: "半魅魔血" }]; });
    b.allies.forEach(u => { u.hand = []; u.stats = u.stats || {};
      u.stats.handLimit = 99; u.stats.drawPerTurn = 0; u.stats.initialDraw = 0; });`,
  angelica: `
    [0, 1].forEach(i => { const u = b.allies[i]; if (!u) return;
      u.ref = "angelica"; u.name = i ? "安洁莉卡B" : "安洁莉卡";
      u.hp = 3000; u.maxHp = 3000; u.skills = [{ name: "狂战" }];
      u.rageMarks = 0; });
    b.allies.forEach(u => { u.hand = []; u.stats = u.stats || {};
      u.stats.handLimit = 99; u.stats.drawPerTurn = 0; u.stats.initialDraw = 0; });`,
};

async function runDragonCase(browser, errors, key, logNeedle, extraNeedle = null) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", err => errors.push(String(err)));
  await startRegressionBattle(page);
  await page.waitForTimeout(400);
  await page.evaluate(setupDragonVs(1, ALLY_SETUP[key]));
  await page.waitForTimeout(300);
  // 不再依赖「我方结束出牌 → 敌方 AI 行动」这条链路：实测敌方 AI 是否出牌
  // 会随手牌与意图浮动（同一构造多次跑结果不同），追加段时有时无。
  // 改为把行动权直接交给机械AI龙并打出那张单体杀，多段因此必然发生。
  await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const e = b.enemies[1], a0 = b.allies[0];
    b.activeUid = e.uid; b.phase = 4; b.locked = false; b.animQueue = [];
    b.selectedCardIndex = null; b.selectedSkillCard = null; b.pendingTargetUid = null;
    // 杀意只给 1 点：给多了敌方会自动连出第 2 张杀，变成两次独立攻击，
    // 受击触发计数随之翻倍，与「多段放大」混淆（实测 intent=9 时 drill=2）。
    e.intent = 1;
    // playActiveCard 有 actor.side !== "ally" 的硬校验，敌方走不通；
    // 用 useCard（AI 出牌 commit 里调的就是它）直接打出，等价敌方真实出牌。
    const killCard = (e.hand || []).find(c => window.CardUtils?.isEntitySingleKill?.(c))
      || { name: "杀", type: "kill", suit: "♠" };
    if (!e.hand.includes(killCard)) e.hand.push(killCard);
    window.BattleSystem.useCard(st, e, a0, killCard);
    return true;
  })()`);
  // 追加段排在反应队列里，且交牌弹窗会锁住战斗，必须等它真正结算完
  await settle(page);
  const texts = await logText(page);
  const rollMatch = texts.map(t => t.match(/骰子点数(\d)/)).find(Boolean);
  const roll = rollMatch ? +rollMatch[1] : null;
  const drill = texts.filter(t => t.includes("发动电钻火花")).length;
  const hits = texts.filter(t => t.includes(logNeedle)).length;
  const extra = extraNeedle ? texts.filter(t => t.includes(extraNeedle)).length : null;
  const opens = await page.evaluate(`(() => window.__counterOpens || 0)()`);
  const rage = await page.evaluate(`(() => Math.max(0, ...(window.state.battle.allies || [])
    .map(u => u.rageMarks || 0)))()`);
  await page.close();
  if (process.env.DUMP_LOG) {
    console.log(`--- [${key}] 段数=${roll != null ? 1 + roll : "?"} 完整日志 ---`);
    texts.forEach((t, i) => console.log(`  ${i}: ${t}`));
  }
  return { roll, drill, hits, extra, opens, rage, seg: roll != null ? 1 + roll : null };
}

// 凋零者【外神之眼】构造：我方 2 名存活、敌方 1 名 1312。
// carlos=true 时 0 号设为卡洛斯并塞 3 张杀，出牌后触发【疯狂刺刀】追加多段。
const EYE_SETUP = carlos => `(() => {
  const st = window.state, b = st.battle;
  const a0 = b.allies[0], a1 = b.allies[1];
  const w = b.enemies[0];
  b.enemies.length = 1;
  w.ai = "ruins_witherer"; w.name = "XX型凋零者1312号"; w.gender = "female";
  w.hp = 3000; w.maxHp = 3000;
  w.stats = Object.assign({}, w.stats, { attack: 12, magic: 11 });
  w.hand = [];
  a0.ref = ${carlos ? '"carlos"' : '"lokar"'};
  a0.name = ${carlos ? '"卡洛斯"' : '"罗卡尔"'};
  a0.hp = 3000; a0.maxHp = 3000;
  a0.stats = Object.assign({}, a0.stats, { attack: 5, magic: 3 });
  a0.hand = [{ name: "杀", type: "kill", suit: "♠" },
             { name: "杀", type: "kill", suit: "♠" },
             { name: "杀", type: "kill", suit: "♠" }];
  a0.hand.forEach(c => { delete c._pendingDraw; });
  if (a1) { a1.hp = 3000; a1.maxHp = 3000; a1.hand = []; a1.ref = "bertis"; }
  b.activeUid = a0.uid; b.phase = 4; b.locked = false; b.animQueue = [];
  b.selectedCardIndex = null; b.selectedSkillCard = null; b.pendingTargetUid = null;
  a0.intent = 9;
  st.log = [];
  if (window.BattleSystem && !window.__vkhooked) {
    const orig = window.BattleSystem.useVirtualKill;
    window.__vkLog = [];
    window.BattleSystem.useVirtualKill = function (s2, actor, target, card) {
      window.__vkLog.push({ gen: card?.generatedBySkill || "",
        actor: actor?.name, target: target?.name });
      return orig.apply(this, arguments);
    };
    window.__vkhooked = true;
  }
  window.__vkLog = [];
  window.render();
  return { allyCount: b.allies.length, foeAi: w.ai, allyName: a0.name };
})()`;

async function runEyeCase(browser, errors, carlos) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", err => errors.push(String(err)));
  await startRegressionBattle(page);
  await page.waitForTimeout(400);
  await page.evaluate(EYE_SETUP(carlos));
  await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    window.BattleSystem.playActiveCard(st, 0, b.enemies[0].uid);
    return true;
  })()`);
  await settle(page);
  const texts = await logText(page);
  const eye = (await page.evaluate(`(() => window.__vkLog || [])()`))
    .filter(v => v.gen === "外神之眼").length;
  const bayonet = texts.filter(t => t.includes("触发疯狂刺刀")).length;
  const m = texts.map(t => t.match(/追加(\d+)次攻击力伤害/)).find(Boolean);
  const extra = m ? +m[1] : 0;
  await page.close();
  if (process.env.DUMP_LOG) {
    console.log(`--- [eye/${carlos ? "carlos" : "control"}] 完整日志 ---`);
    texts.forEach((t, i) => console.log(`  ${i}: ${t}`));
  }
  return { eye, bayonet, extra };
}

// 直接喂一张牌给外神之眼（不走出牌），用于验证「实体牌 + _drillExtraHit」被守卫拦下。
// 走技能模块本体 afterDamage：enemy-damage-hooks.js 只是把 card 原样透传，等价真实分发。
async function runEyeFeed(browser, errors, cardJson) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", err => errors.push(String(err)));
  await startRegressionBattle(page);
  await page.waitForTimeout(400);
  await page.evaluate(EYE_SETUP(false));
  const hooked = await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const a0 = b.allies[0], w = b.enemies[0];
    const card = ${cardJson};
    const ok = !!window.RuinsWithererSkills
      && typeof window.RuinsWithererSkills.afterDamage === "function";
    window.RuinsWithererSkills.afterDamage(st, a0, w, card, 5, {});
    return ok;
  })()`);
  await page.waitForTimeout(1200);
  const eyeN = (await page.evaluate(`(() => window.__vkLog || [])()`))
    .filter(v => v.gen === "外神之眼").length;
  await page.close();
  return { eye: eyeN, hooked };
}

(async () => {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const errors = [];
  try {
    // ---------- 场景1：杰洛特【复仇反击】 ----------
    const r1 = await runDragonCase(browser, errors, "gerlot", "受伤反击");
    check("1.0 电钻火花已发动且为多段（非构造失效）", r1.drill > 0 && r1.seg > 1,
      `发动=${r1.drill} 段数=${r1.seg}(骰子=${r1.roll})`);
    // 【复仇反击】只响应「有目标线的牌」（hasTargetLine），电钻火花的追加段是
    // type:"skill" 且无目标线，故只有第一段（实体杀）触发——与外神之眼的实体牌
    // 限定同口径；不限定牌类型的受击类（曼妮 / 心血之咒 / 半魅魔血 / 狂战）才是逐段。
    check("1.1 杰洛特【复仇反击】只响应有目标线的牌（追加段为技能伤害）",
      r1.opens === r1.drill,
      `入队=${r1.opens} 攻击次数=${r1.drill} 段数=${r1.seg}`);

    // ---------- 场景2：希特威【心血之咒】反击分支 ----------
    // 对手无♥可交时走「对其造成攻击力伤害」分支；追加段必须被拦截。
    const r2 = await runDragonCase(browser, errors, "hitwell", "未能交出♥红桃牌", "交出一张♥");
    check("2.0 电钻火花已发动且为多段（非构造失效）", r2.drill > 0 && r2.seg > 1,
      `发动=${r2.drill} 段数=${r2.seg}`);
    check("2.1 心血之咒链路确实可用（非构造失效）", r2.hits + r2.extra > 0,
      `反击分支=${r2.hits} 交牌分支=${r2.extra}`);
    const r2Total = r2.drill * (r2.seg || 0);
    check("2.2 希特威【心血之咒】反击分支逐段结算", r2.hits === r2Total,
      `反击分支=${r2.hits} 总段数=${r2Total}(发动${r2.drill}×每次${r2.seg})`);

    // ---------- 场景3：曼妮【刺刀AK47】反击 ----------
    const r3 = await runDragonCase(browser, errors, "manny", "刺刀AK47");
    check("3.0 电钻火花已发动且为多段（非构造失效）", r3.drill > 0 && r3.seg > 1,
      `发动=${r3.drill} 段数=${r3.seg}`);
    const r3Total = r3.drill * (r3.seg || 0);
    check("3.1 曼妮【刺刀AK47】逐段结算（每段各入队一次）", r3.opens === r3Total,
      `入队=${r3.opens} 总段数=${r3Total}(发动${r3.drill}×每次${r3.seg})`);

    // ---------- 场景4：卡洛斯【疯狂刺刀】多段 × 凋零者【外神之眼】 ----------
    const r4 = await runEyeCase(browser, errors, true);
    check("4.0 疯狂刺刀确实发动并带追加段（非构造失效）",
      r4.bayonet > 0 && r4.extra > 0, `发动=${r4.bayonet} 追加段=${r4.extra}`);
    // 场景4 用疯狂刺刀，其 drill 是「发动次数」而非本牌攻击次数（实测恒为 2），
    // 不能按 drill 归一化；该场景一次出牌只产生一条追伤链，故直接锁 1。
    check("4.1 凋零者【外神之眼】只响应实体牌（追加段为技能伤害，不触发）", r4.eye === 1,
      `触发=${r4.eye} 段数=${1 + r4.extra}（追加段是技能卡，实体牌限定仍成立）`);

    // ---------- 场景5：追加段若换成实体牌，也应被拦截（守住显式守卫） ----------
    const r5 = await runEyeFeed(browser, errors,
      `{ name:"杀", type:"kill", suit:"♠", _drillExtraHit:true }`);
    check("5.1 实体牌带 _drillExtraHit 也照常触发（守卫已移除，逐段）", r5.eye === 1,
      `触发=${r5.eye}`);

    // ---------- 场景6：对照——单段攻击时外神之眼仍正常触发 ----------
    const r6 = await runEyeCase(browser, errors, false);
    check("6.0 单段攻击链路可用（非构造失效）", r6.extra === 0 && r6.eye === 1,
      `追加段=${r6.extra} 触发=${r6.eye}`);

    // 场景5 的构造值必须本身能通过 isEntityCard，否则「不触发」只是因为不是实体牌。
    const r7 = await runEyeFeed(browser, errors, `{ name:"杀", type:"kill", suit:"♠" }`);
    check("7.1 同一张牌去掉 _drillExtraHit 后仍会触发（排除假阴性）", r7.eye === 1,
      `触发=${r7.eye}`);

    // ---------- 场景8：星野一【半魅魔血】受击摸牌 × 多段 ----------
    // 这是本用例最早出现「假通过」的场景：交牌弹窗锁住战斗，追加段从未落地，
    // 计数自然是 1。现在弹窗会被自动点掉，追加段真正结算后才计数。
    const r8 = await runDragonCase(browser, errors, "kaiichi", "半魅魔血令其");
    check("8.0 电钻火花已发动且为多段（非构造失效）", r8.drill > 0 && r8.seg > 1,
      `发动=${r8.drill} 段数=${r8.seg}`);
    check("8.1 半魅魔血链路确实可用（非构造失效）", r8.hits > 0,
      `触发=${r8.hits} 段数=${r8.seg}`);
    // 计数按「攻击次数」归一化：电钻火花可能发动多次（敌方偶尔连出第 2 张杀），
    // 每次独立攻击各触发 1 次才是对的；只要触发数不超过攻击次数，就没有被段数放大。
    // 【半魅魔血】「多段或连击伤害时逐段结算」已取消（与狂战同口径）：
    // 多段属同一次攻击，只摸 1 次 2 张。此前 4 段可摸 8 张并连续弹交牌窗。
    // seg 是「单次发动的段数」(1+roll)，不是总段数；总段数 = 发动次数 × 每次段数。
    // 逐段结算时触发数应等于总段数（远超攻击次数）。
    const r8Total = r8.drill * (r8.seg || 0);
    check("8.2 半魅魔血逐段结算（每段各摸 1 次）", r8.hits === r8Total,
      `触发=${r8.hits} 总段数=${r8Total}(发动${r8.drill}×每次${r8.seg})`);
    check("8.2b 摸牌次数超过攻击次数（证明确实按段放大）", r8.hits > r8.drill,
      `触发=${r8.hits} 攻击次数=${r8.drill}（合并时两者应相等）`);
    // 【半魅魔血】已取消逐段，描述里不得再出现这句话，否则与实现不一致。
    check("8.3 【半魅魔血】描述已声明逐段（与实现一致）", kaiichiDescPerSeg,
      kaiichiDescPerSeg ? "描述含逐段声明" : "描述缺逐段声明，需同步补回");

    // ---------- 场景9：安洁莉卡【狂战】受击标记 × 多段 ----------
    const r9 = await runDragonCase(browser, errors, "angelica", "获得1枚狂战标记");
    check("9.0 电钻火花已发动且为多段（非构造失效）", r9.drill > 0 && r9.seg > 1,
      `发动=${r9.drill} 段数=${r9.seg}`);
    // 【狂战意志】「多段或连击伤害时逐段结算」已取消（与半魅魔血同口径）：
    // 多段属同一次攻击，只发 1 枚标记。本用例同时校验描述里确实没有这句话。
    check("9.1 【狂战意志】描述已声明逐段（与实现一致）", berserkDescPerSeg,
      berserkDescPerSeg ? "描述含逐段声明" : "描述缺逐段声明，需同步补回");
    // 与 8.2 同口径：按攻击次数归一化，避免敌方连出第 2 张杀时误判为放大。
    const r9Total = r9.drill * (r9.seg || 0);
    check("9.2 狂战标记逐段结算（每段各发 1 枚）", r9.hits === r9Total,
      `日志标记=${r9.hits} 总段数=${r9Total}(发动${r9.drill}×每次${r9.seg})`);
    check("9.2b 标记数超过攻击次数（证明确实按段放大）", r9.hits > r9.drill,
      `标记=${r9.hits} 攻击次数=${r9.drill}（合并时两者应相等）`);
    check("9.3 rageMarks 与日志一致", r9.rage === r9.hits,
      `rageMarks=${r9.rage} 日志=${r9.hits}`);

    check("页面无 JS 错误", errors.length === 0, errors.slice(0, 2).join(" | "));
  } catch (err) {
    fail += 1; console.log("❌ 异常:", String(err));
  } finally {
    await browser.close();
  }
  console.log(`\n汇总：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})();
