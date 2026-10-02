// 专项：希特威【心血之咒】× 多段 / 连击的交互严格检查
//
// 心血之咒：希特威受到生命值伤害后，伤害来源须交出一张♥红桃牌；没有红桃牌
// 可交时，希特威对其造成等同于自身攻击力的伤害。
//
// 关注点：一次攻击被拆成 N 段（连击 / 多段 / 链锯追加）时，心血之咒是否逐段
// 触发。按当前约定「多段与连击对受击、反击类一律逐段结算」，期望段数 = 触发
// 次数。若只触发一次，说明某处仍有 _drillExtraHit 之类的合并守卫残留。
//
// 覆盖的多段源（三类实现机制各不相同，必须分别验）：
//   1) 橘千樱【红缨连鬼斩】—— gatlingRepeats 连击（判定红色继续，无限段）
//   2) 机械AI龙【电钻火花】—— _drillExtraHit 追加段（骰子点数决定段数）
//   3) 伊迪斯【狂暴链锯】  —— edisChain 追加段
//   4) 普通单体杀          —— 单段对照（排除把"两次独立攻击"误判成多段）
//
// 每个多段源都跑「敌方有红桃牌 → 交牌分支」；连击另跑「敌方无红桃 → 反击分支」。
// 段数优先从日志精确读出（红缨连鬼斩的"额外结算N次"、电钻火花的"骰子点数N"），
// 读不出时才退化为「触发 ≥2 且单段对照 =1」的定性判据。
//
// 防假通过：每个场景都先断言「多段确实发生（seg ≥ 2）」，再做次数比对。
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

const logText = page => page.evaluate(`(() => (window.state.log || [])
  .map(l => String(l.text || l)))()`);

// 交牌弹窗 / 次元转移等会置 battle.locked，未处理则追加段永不结算（假通过源头）
async function dismissPrompts(page) {
  return page.evaluate(`(() => {
    const el = document.querySelector(
      "[data-kaiichi-share-skip], [data-dimension-transfer-skip]");
    if (!el) return false;
    el.click();
    return true;
  })()`);
}

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

// 敌方定义来源：橘千樱在机械工厂、机械AI龙在废墟沙城，
// 两者都必须整份复制 skills，只改 ai/name 不会带上技能表（追加段永不发动）。
const ENEMY_SETUP = {
  chiyo: `
    const def = (window.GameDataMachineFactoryEnemies || [])
      .find(x => x.id === "invader_chiyo");
    if (def) { e.id = def.id; e.ai = def.ai; e.name = def.name;
      e.skills = JSON.parse(JSON.stringify(def.skills)); }
    e.stats = e.stats || {}; e.stats.attack = 6;
    e.hp = 3000; e.maxHp = 3000; e.intent = 1; e.block = 0;`,
  dragon: `
    const def = (window.GameDataRuinsSandCityEnemies || [])
      .find(x => x.id === "mech_ai_dragon");
    if (def) { e.id = def.id; e.ai = def.ai; e.name = def.name;
      e.skills = JSON.parse(JSON.stringify(def.skills)); }
    e.stats = e.stats || {}; e.stats.attack = 13;
    e.hp = 3000; e.maxHp = 3000; e.intent = 1; e.block = 0;`,
  edis: `
    e.ai = "pursuer_edis"; e.name = "内英组杀手伊迪斯";
    e.skills = [{ name: "狂暴链锯" }, { name: "无限暗刃" }];
    e.stats = e.stats || {}; e.stats.attack = 6;
    e.hp = 3000; e.maxHp = 3000; e.intent = 1; e.block = 0;`,
  plain: `
    e.ai = "grunt_basic"; e.name = "普通敌人"; e.skills = [];
    e.stats = e.stats || {}; e.stats.attack = 6;
    e.hp = 3000; e.maxHp = 3000; e.intent = 1; e.block = 0;`,
};

// hearts=true：敌方塞满红桃牌，走交牌分支；false：只留杀，走反击分支
const setup = (kind, hearts) => `(() => {
  const st = window.state, b = st.battle;
  const e = b.enemies[1], a0 = b.allies[0], a1 = b.allies[1];
  ${ENEMY_SETUP[kind]}
  // 目标固定为 0 号：希特威（心血之咒）。1 号陪练，保证回合能推进。
  a0.ref = "hitwell"; a0.name = "希特威"; a0.hp = 3000; a0.maxHp = 3000;
  a0.skills = [{ name: "心血之咒" }];
  a0.stats = a0.stats || {}; a0.stats.attack = 4;
  a0.hand = [];
  if (a1) { a1.ref = "bertis"; a1.name = "贝尔蒂丝陪练";
    a1.hp = 3000; a1.maxHp = 3000; a1.skills = []; a1.hand = []; }
  const kill = { name: "杀", type: "kill", suit: "♠" };
  e.hand = [kill];
  // 红缨连鬼斩的段数由判定决定（红色继续、黑色停止），纯随机会让"多段"有时
  // 根本不发生（实测首次判定即黑色时只有 1 段，断言随即空转）。这里把牌库
  // 顶（deck 末尾，drawJudge 用 pop 取）全设为红色且清空弃牌堆：判定必然连中
  // 3 次后牌库耗尽，第 4 次取到默认黑色判定才停止 —— 段数稳定为 4。
  if ("${kind}" === "chiyo") {
    e.deck = [0, 1, 2].map(i => ({ name: "判定红" + i, type: "basic", suit: "♥" }));
    e.discard = [];
  }
  if (${hearts}) {
    for (let i = 0; i < 8; i += 1) {
      e.hand.push({ name: "红桃牌" + i, type: "basic", suit: "♥" });
    }
  }
  b.enemies.forEach((u, i) => { if (i !== 1) { u.hand = []; u.hp = 1; } });
  window.state.log = [];
  window.render();
  return true;
})()`;

async function runCase(browser, errors, kind, hearts) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", err => errors.push(String(err)));
  await startRegressionBattle(page);
  await page.waitForTimeout(400);
  await page.evaluate(setup(kind, hearts));
  await page.waitForTimeout(300);
  // 不依赖「我方结束出牌 → 敌方 AI 行动」：该链路实测会随手牌与意图浮动，
  // 追加段时有时无。直接把行动权交给敌方并打出那张单体杀，多段必然发生。
  await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const e = b.enemies[1], a0 = b.allies[0];
    b.activeUid = e.uid; b.phase = 4; b.locked = false; b.animQueue = [];
    b.selectedCardIndex = null; b.selectedSkillCard = null; b.pendingTargetUid = null;
    e.intent = 1;
    const killCard = (e.hand || []).find(c => window.CardUtils?.isEntitySingleKill?.(c))
      || { name: "杀", type: "kill", suit: "♠" };
    if (!e.hand.includes(killCard)) e.hand.push(killCard);
    window.BattleSystem.useCard(st, e, a0, killCard);
    return true;
  })()`);
  await settle(page);
  const texts = await logText(page);
  const gives = texts.filter(t => t.includes("交出一张♥")).length;
  const counters = texts.filter(t => t.includes("未能交出♥红桃牌")).length;
  const trig = gives + counters;
  // 段数：红缨连鬼斩「额外结算N次」→ N+1；电钻火花「骰子点数N」→ N+1
  // 连击/链锯都写「额外结算N次」（橘千樱：本次杀额外结算N次；
  // 狂暴链锯：本次【杀】对X额外结算N次），统一用宽松正则覆盖两种文案。
  const extraMatch = texts.map(t => t.match(/额外结算(\d+)次/)).find(Boolean);
  const rollMatch = texts.map(t => t.match(/骰子点数(\d)/)).find(Boolean);
  const seg = extraMatch ? +extraMatch[1] + 1
    : rollMatch ? +rollMatch[1] + 1 : null;
  const drill = texts.filter(t => t.includes("发动电钻火花")).length;
  const hp = await page.evaluate(
    `(() => (window.state.battle.allies[0] || {}).hp)()`);
  await page.close();
  if (process.env.DUMP_LOG) {
    console.log(`--- [${kind}/${hearts ? "交牌" : "反击"}] 段数=${seg} 日志 ---`);
    texts.forEach((t, i) => console.log(`  ${i}: ${t}`));
  }
  return { gives, counters, trig, seg, drill, hp };
}

(async () => {
  const errors = [];
  const browser = await chromium.launch();
  const only = process.env.ONLY || "";
  const cases = [
    ["chiyo", true, "橘千樱连击 × 心血之咒（交牌）"],
    ["chiyo", false, "橘千樱连击 × 心血之咒（反击）"],
    ["dragon", true, "电钻火花多段 × 心血之咒（交牌）"],
    ["edis", true, "狂暴链锯多段 × 心血之咒（交牌）"],
    ["plain", true, "单段对照 × 心血之咒（交牌）"],
  ].filter(([kind]) => !only || only.split(",").includes(kind));

  for (const [kind, hearts, title] of cases) {
    const r = await runCase(browser, errors, kind, hearts);
    const mode = hearts ? "交牌" : "反击";
    console.log(`\n【${title}】段数=${r.seg ?? "?"} 触发=${r.trig}`
      + `（交牌${r.gives}/反击${r.counters}）`);
    if (kind === "plain") {
      check(`单段对照：仅触发 1 次（排除把两次独立攻击误判为多段）`,
        r.trig === 1, `触发=${r.trig}`);
      continue;
    }
    // 多段必须真的发生，否则"触发次数 == 段数"会在 1 段时空转通过
    const multi = r.seg != null ? r.seg >= 2 : r.trig >= 2;
    check(`${title}：多段确实发生`, multi,
      `段数=${r.seg ?? "?"} 触发=${r.trig}`);
    if (r.seg != null) {
      check(`${title}：逐段触发（触发次数 = 段数 ${r.seg}）`, r.trig === r.seg,
        `触发=${r.trig} 段数=${r.seg} ${mode}=${hearts ? r.gives : r.counters}`);
    } else {
      check(`${title}：逐段触发（触发 ≥2，单段对照为 1）`, r.trig >= 2,
        `触发=${r.trig}`);
    }
    if (hearts) {
      check(`${title}：走的是交牌分支`, r.gives > 0 && r.counters === 0,
        `交牌=${r.gives} 反击=${r.counters}`);
    } else {
      check(`${title}：走的是反击分支`, r.counters > 0 && r.gives === 0,
        `交牌=${r.gives} 反击=${r.counters}`);
    }
  }

  await browser.close();
  check("无页面 JS 错误", errors.length === 0, errors.slice(0, 2).join(" | "));
  console.log(`\n通过 ${pass} / 失败 ${fail}`);
  process.exit(fail ? 1 : 0);
})();
