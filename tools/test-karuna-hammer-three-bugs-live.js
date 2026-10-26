// 三个 BUG 的回归（玩家反馈 10-26）：
//   ① 霹雳之锤：弃牌补伤后被判定为回合结束，直接推进到弃牌阶段并换人。
//      根因：battle-manual-continuation 的 continueAfterInterruptedActions
//      在锤子解决后落到 finishTurnAndAdvance。补伤/放弃都不等于结束回合。
//   ② 同频歌姬：回合结束后头像「同频 ♦」标记残留（只清了 karunaLastColor，
//      没清 karunaLastSuit），玩家误以为下回合还能接续。
//   ③ 记忆泡泡 × 霹雳之锤：出【杀】被【闪】抵消时锤子先挂起（battle.locked），
//      记忆泡泡的 afterCardPlayed 直接 return，存牌机会被永久吞掉。
// 用例支持 PART=H / G / P 分段跑，不设则全跑。
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const {
  openGame, startRegressionBattle, collectErrors, relevantErrors,
} = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const PARTS = (process.env.PART || "HGP").toUpperCase();
let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}`
    + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
};

const idle = `(async () => {
  await new Promise(r => setTimeout(r, 700));
  await window.BattleEffects?.whenIdle?.();
  await new Promise(r => setTimeout(r, 300));
  return true;
})()`;

// ---------- H / P 共用：出【杀】→ 敌人【闪】→ 锤子挂起 ----------
const setupHammer = (ref, withBubble) => `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false; b.phase = 4;
  delete b.thunderHammer; delete b.greenGatlingResume;
  delete b.karunaBubble; delete b.karunaBubblePending;
  delete b.thunderHammerKeepPhase;
  const c = b.allies[0];
  c.name = ${JSON.stringify(ref === "abe_karuna" ? "安倍卡露娜" : "卡洛斯")};
  c.ref = ${JSON.stringify(ref)}; c.id = ${JSON.stringify(ref)};
  c.skills = ${withBubble
    ? '[{ name: "同频歌姬" }, { name: "记忆泡泡" }, { name: "幸运海螺" }]'
    : "[]"};
  c.stats = { attack: 6, magic: 3, speed: 5 };
  c.handLimit = 20;
  c.hp = c.maxHp = 100; c.block = 0;
  c.bloodlust = 3; c.bloodlustMax = 3;
  c.usedGreenGatling = true;
  c.bubbleCards = [];
  b.activeUid = c.uid;
  st.equipment = st.equipment || {}; st.equipment[${JSON.stringify(ref)}] = ["霹雳之锤"];
  st.testEquipment = st.testEquipment || {};
  st.testEquipment[${JSON.stringify(ref)}] = ["霹雳之锤"];
  c.battleRelics = ["霹雳之锤"];
  b.enemies.forEach((e, i) => {
    e.hp = e.maxHp = 60; e.block = 0; e.statuses = [];
    e.hand = i === 0 ? [{ name: "闪", type: "response", suit: "♠", text: "" }] : [];
    e.noResponse = false;
  });
  c.hand = [
    { name: "杀（普攻）", type: "slash", scale: "attack",
      responseKind: "dodge", suit: "♦", text: "" },
    // 只放一张【杀】：卡洛斯的「疯狂刺刀」会按手牌杀牌数量追加伤害，
    // 多放一张杀就会多 6 点，掩盖真正要验的锤子补伤数值。
    { name: "战术A", type: "tactic", suit: "♣", text: "" },
    { name: "弃牌A", type: "consume", suit: "♥", text: "" },
  ];
  st.log = []; st.battleLog = [];
  window.render();
  return { hasHammer: !!window.RelicSystem?.hasEquipped?.(st, c, "霹雳之锤"),
    hand: c.hand.map(x => x.name) };
})()`;

const castKill = `(() => {
  const st = window.state, b = st.battle;
  const c = b.allies[0];
  const card = c.hand.find(x => x.name === "杀（普攻）");
  window.BattleSystem.useCard(st, c, b.enemies[0], card);
  return { phase: b.phase, locked: !!b.locked, hammer: !!b.thunderHammer,
    pending: !!b.karunaBubblePending };
})()`;

const clickByName = name => `(async () => {
  const b = window.state.battle;
  const c = b.allies[0];
  const nodes = [...document.querySelectorAll("[data-card-index]")];
  const t = nodes.find(n => c.hand[Number(n.dataset.cardIndex)]
    && c.hand[Number(n.dataset.cardIndex)].name === ${JSON.stringify(name)});
  if (!t) return { clicked: false };
  t.click();
  await new Promise(r => setTimeout(r, 900));
  await window.BattleEffects?.whenIdle?.();
  await new Promise(r => setTimeout(r, 400));
  return { clicked: true, phase: b.phase, locked: !!b.locked,
    hammer: !!b.thunderHammer, hp: b.enemies.map(e => e.hp),
    activeUid: b.activeUid, me: c.uid, bubble: !!b.karunaBubble,
    pending: !!b.karunaBubblePending,
    log: (window.state.battleLog || []).slice(0, 8) };
})()`;

const clickCancel = `(async () => {
  const btn = document.querySelector("[data-cancel-hammer]");
  if (!btn) return { clicked: false };
  btn.click();
  await new Promise(r => setTimeout(r, 900));
  await window.BattleEffects?.whenIdle?.();
  await new Promise(r => setTimeout(r, 400));
  const b = window.state.battle;
  return { clicked: true, phase: b.phase, locked: !!b.locked,
    hammer: !!b.thunderHammer, hp: b.enemies.map(e => e.hp),
    activeUid: b.activeUid, me: b.allies[0].uid, bubble: !!b.karunaBubble };
})()`;

const playAgain = `(() => {
  const st = window.state, b = st.battle;
  const c = b.allies[0];
  const card = c.hand.find(x => x.name === "战术A");
  if (!card) return { played: false };
  window.BattleSystem.useCard(st, c, b.enemies[0], card);
  return { played: true, phase: b.phase, activeUid: b.activeUid,
    hand: c.hand.map(x => x.name) };
})()`;

const logHas = key => `(() => (window.state.battleLog || [])
  .some(t => t.includes(${JSON.stringify(key)})))()`;

async function partH(page) {
  console.log("\n---- H 霹雳之锤：补伤不结束回合 ----");
  const s = await page.evaluate(setupHammer("carlos", false));
  T("H0 霹雳之锤已装备", s.hasHammer === true, s);
  await page.evaluate(castKill);
  await page.evaluate(idle);
  T("H1 出杀被闪后锤子挂起", await page.evaluate(
    `(() => !!window.state.battle.thunderHammer)()`));

  const r = await page.evaluate(clickByName("弃牌A"));
  T("H2 弃牌发动成功（敌人掉血）", r.hp[0] === 54, r);
  T("H3 补伤后仍在出牌阶段（phase 4）", r.phase === 4, r);
  T("H4 仍是该角色的回合", r.activeUid === r.me, r);
  T("H5 锤子已解除", r.hammer === false && r.locked === false, r);

  const again = await page.evaluate(playAgain);
  await page.evaluate(idle);
  const after = await page.evaluate(`(() => {
    const b = window.state.battle;
    return { phase: b.phase, activeUid: b.activeUid, me: b.allies[0].uid,
      hp: b.enemies.map(e => e.hp) };
  })()`);
  T("H6 补伤后还能继续出牌（未被结束回合）",
    again.played === true && after.phase === 4
    && after.activeUid === after.me, { again, after });

  // 放弃发动同样不应结束回合
  console.log("\n---- H 放弃发动也不结束回合 ----");
  await page.evaluate(setupHammer("carlos", false));
  await page.evaluate(castKill);
  await page.evaluate(idle);
  const c = await page.evaluate(clickCancel);
  T("H7 放弃发动成功", c.clicked === true && c.hammer === false, c);
  T("H8 放弃后仍在出牌阶段", c.phase === 4, c);
  T("H9 放弃后仍是该角色回合", c.activeUid === c.me, c);
  T("H10 放弃后未补伤", c.hp[0] === 60, c);
}

// ---------- G：同频歌姬 ----------
const gSetup = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false; b.phase = 4;
  const k = b.allies[0];
  k.name = "安倍卡露娜"; k.ref = "abe_karuna"; k.id = "abe_karuna";
  k.skills = [{ name: "同频歌姬" }];
  k.hp = k.maxHp = 50;
  delete k.karunaLastColor; delete k.karunaLastSuit;
  b.activeUid = k.uid;
  k.hand = [
    { name: "牌A", type: "consume", suit: "♥", text: "" },
    { name: "牌B", type: "consume", suit: "♦", text: "" },
  ];
  st.log = []; st.battleLog = [];
  window.render();
  return { ref: k.ref };
})()`;

const gPlay = `(() => {
  const st = window.state, b = st.battle;
  const k = b.allies[0];
  const draw = (u, n) => {
    const got = [];
    for (let i = 0; i < n; i++) got.push({ name: "摸" + i });
    return got;
  };
  window.AbeKarunaDivaSkills.afterCardPlayed(st, k,
    k.hand.find(c => c.name === "牌A"), { draw });
  const before = (st.battleLog || []).length;
  window.AbeKarunaDivaSkills.afterCardPlayed(st, k,
    k.hand.find(c => c.name === "牌B"), { draw });
  return { lastColor: k.karunaLastColor ?? null, lastSuit: k.karunaLastSuit ?? null,
    mark: window.AbeKarunaDivaSkills.suitMark(k),
    drew: (st.battleLog || []).length > before };
})()`;

const gEnd = `(() => {
  const st = window.state, b = st.battle;
  const k = b.allies[0];
  window.AbeKarunaDivaSkills.endTurn(st, k);
  return { lastColor: k.karunaLastColor ?? null, lastSuit: k.karunaLastSuit ?? null,
    mark: window.AbeKarunaDivaSkills.suitMark(k),
    hasColor: Object.prototype.hasOwnProperty.call(k, "karunaLastColor"),
    hasSuit: Object.prototype.hasOwnProperty.call(k, "karunaLastSuit") };
})()`;

async function partG(page) {
  console.log("\n---- G 同频歌姬：回合结束清除标记 ----");
  await page.evaluate(gSetup);
  const p = await page.evaluate(gPlay);
  T("G1 出牌后记录颜色与花色",
    p.lastColor === "red" && p.lastSuit === "♦", p);
  T("G2 头像显示同频标记", p.mark.includes("同频 ♦"), p);
  T("G3 同色二连触发摸牌", p.drew === true, p);
  const e = await page.evaluate(gEnd);
  T("G4 回合结束清除颜色记忆", e.lastColor === null, e);
  T("G5 回合结束清除花色记忆", e.lastSuit === null, e);
  T("G6 回合结束头像标记消失", e.mark === "", e);
}

// ---------- P：记忆泡泡 × 霹雳之锤 ----------
async function partP(page) {
  console.log("\n---- P 记忆泡泡 × 霹雳之锤 ----");
  const s = await page.evaluate(setupHammer("abe_karuna", true));
  T("P0 卡露娜装备霹雳之锤", s.hasHammer === true, s);
  const cast = await page.evaluate(castKill);
  await page.evaluate(idle);
  T("P1 出杀被闪后锤子挂起", cast.hammer === true, cast);
  T("P2 泡泡请求被暂存而非丢弃", cast.pending === true, cast);

  const r = await page.evaluate(clickByName("弃牌A"));
  T("P3 弃牌补伤生效", r.hp[0] === 54, r);
  T("P4 锤子解决后补问记忆泡泡", r.bubble === true, r);
  T("P5 暂存已消费", r.pending === false, r);
  T("P6 日志出现记忆泡泡询问", await page.evaluate(logHas("记忆泡泡可发动")));

  // 点「放入」
  const store = await page.evaluate(`(async () => {
    const btn = document.querySelector("[data-karuna-bubble-store]");
    if (!btn) return { clicked: false };
    btn.click();
    await new Promise(r => setTimeout(r, 800));
    await window.BattleEffects?.whenIdle?.();
    const b = window.state.battle;
    return { clicked: true, locked: !!b.locked, bubble: !!b.karunaBubble,
      zone: (b.allies[0].bubbleCards || []).map(c => c.name),
      phase: b.phase, activeUid: b.activeUid, me: b.allies[0].uid };
  })()`);
  T("P7 放入按钮可点击", store.clicked === true, store);
  T("P8 牌进入泡泡手牌区", store.zone.length === 1, store);
  T("P9 放入后仍在出牌阶段", store.phase === 4 && store.activeUid === store.me,
    store);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = collectErrors(page);
  await openGame(page);
  await startRegressionBattle(page);
  if (PARTS.includes("H")) await partH(page);
  if (PARTS.includes("G")) await partG(page);
  if (PARTS.includes("P")) await partP(page);
  const rel = relevantErrors(errors);
  T("页面无 JS 错误", rel.length === 0, rel.slice(0, 3));
  console.log(`\n通过 ${pass}/${total}  [PART=${PARTS}]`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})().catch(err => {
  console.error("FATAL", err);
  process.exit(1);
});
