// 内英组杀手拉芙·控神魔眼「成本牌」专项实测
// 目的：验证 AI 发动时是否真的弃置「任意一张手牌」（不再限定红桃），
//       并核对弃的是哪一张、是否跳过待摸牌、是否有记录、归属是否正确。
const { chromium } = require("playwright");
const path = require("path");
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const { startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, fail = 0;
const T = (name, ok, extra) => {
  if (ok) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.log(`❌ ${name}${extra !== undefined ? "  ← " + JSON.stringify(extra) : ""}`); }
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));

  const entered = await startRegressionBattle(page).then(() => ({ ok: true }))
    .catch(e => ({ ok: false, reason: String(e).slice(0, 200) }));
  T("进入真实战斗", !!(entered && entered.ok), entered);
  if (!entered.ok) {
    console.log(`=== ${pass}/${pass + fail} 通过 ===`);
    await browser.close();
    process.exit(1);
  }

  // 执行一次控神魔眼：手牌由调用方给定
  const runOnce = (handJson) => page.evaluate((hs) => {
    const w = window, st = w.state, b = st.battle;
    const raff = (b.enemies || [])[0];
    raff.ai = "raff_assassin"; raff.ref = "raff_assassin";
    raff.name = "内英组杀手拉芙";
    raff.usedControlEye = false; raff.hp = 150;
    raff.hand = JSON.parse(hs);
    const allies = (b.allies || []).slice(0, 2);
    allies.forEach((u, i) => {
      u.hp = 300; u.stats = u.stats || {};
      u.stats.attack = i === 0 ? 30 : 5;
      u.hand = [{ name: "杀（普攻）", type: "kill", suit: "♥" }, { name: "闪", type: "response", suit: "♦" }];
    });
    const sig = arr => (arr || []).map(c => `${c.suit || ""}${c.name}`);
    const before = sig(raff.hand);
    const move = w.UnderwaterTrainSkills?.controlEyeMove?.(st, raff);
    // 与 battle-combat-card-effects.js:33 同形：damage / draw 由外部注入
    const damage = (_st, t, a) => { if (t) t.hp = Math.max(0, (t.hp || 0) - (a || 0)); };
    const draw = (u, n) => {
      for (let i = 0; i < (n || 0); i++) (u.hand ||= []).push({ name: "摸入", suit: "♦" });
      return n;
    };
    let err = null;
    try {
      w.UnderwaterTrainSkills?.useControlEye?.(st, raff, damage, draw);
    } catch (e) { err = String(e); }
    const logs = (w.state.log || b.log || []).slice(0, 80).map(x => String(x?.text ?? x));
    const played = (b.played || []).slice(0, 10)
      .map(p => `${p._playedByName || ""} ${p._playedAction || ""} ${p.suit || ""}${p.name || ""}`);
    return {
      err, before, after: sig(raff.hand),
      move: move?.card?.name || null,
      usedFlag: !!raff.usedControlEye,
      logs, played, raffName: raff.name,
    };
  }, handJson);

  // 场景A：全非红桃手牌 → 仍发动，且弃的是第一张（♦闪）
  const a = await runOnce(JSON.stringify([
    { name: "闪", type: "response", suit: "♦" },
    { name: "杀", type: "kill", suit: "♠" },
  ]));
  T("A 无红桃手牌时 AI 仍选择控神魔眼", a.move === "控神魔眼", { move: a.move, before: a.before });
  T("A 确实弃置了 1 张非红桃牌（♦闪）作为成本",
    !a.after.includes("♦闪") && a.after.includes("♠杀"), { before: a.before, after: a.after });

  // 场景B：手牌含红桃 → 弃的是第一张（♠杀），而非挑红桃
  const b = await runOnce(JSON.stringify([
    { name: "杀", type: "kill", suit: "♠" },
    { name: "桃", type: "tactic", suit: "♥" },
  ]));
  T("B 弃置第一张（♠杀）而非优先挑红桃",
    !b.after.includes("♠杀") && b.after.includes("♥桃"), { before: b.before, after: b.after });

  // 场景C：首张为待摸牌 → 应跳过，弃下一张可用牌
  const c = await runOnce(JSON.stringify([
    { name: "闪", type: "response", suit: "♣", _pendingDraw: true },
    { name: "杀", type: "kill", suit: "♠" },
  ]));
  T("C 跳过待摸牌，弃置下一张可用牌（♠杀）",
    !c.after.includes("♠杀") && c.after.includes("♣闪"), { before: c.before, after: c.after });

  // 场景D：仅 1 张手牌 → 弃后手牌为空（成本照付）
  const d = await runOnce(JSON.stringify([{ name: "杀", type: "kill", suit: "♠" }]));
  T("D 仅 1 张手牌时仍弃置成本",
    !d.after.includes("♠杀") && d.usedFlag, { before: d.before, after: d.after, usedFlag: d.usedFlag });

  // 场景E：成本牌归属 —— 若该牌本属我方，弃置后应回到我方牌堆
  const e = await page.evaluate(() => {
    const w = window, st = w.state, b = st.battle;
    const raff = (b.enemies || [])[0];
    const ally0 = (b.allies || [])[0];
    raff.ai = "raff_assassin"; raff.usedControlEye = false; raff.hp = 150;
    // 一张本属我方 ally0 的牌（拉芙此前从我方夺得）
    raff.hand = [{ name: "闪", type: "response", suit: "♥", stolenFromUid: ally0.uid }];
    const allies = (b.allies || []).slice(0, 2);
    allies.forEach((u, i) => {
      u.hp = 300; u.stats = u.stats || {}; u.stats.attack = i === 0 ? 30 : 5;
      u.hand = [{ name: "杀（普攻）", type: "kill", suit: "♥" }];
    });
    const damage = (_s, t, am) => { if (t) t.hp = Math.max(0, (t.hp || 0) - (am || 0)); };
    const draw = (u, n) => { for (let i = 0; i < (n || 0); i++) (u.hand ||= []).push({ name: "摸入", suit: "♦" }); return n; };
    w.UnderwaterTrainSkills?.useControlEye?.(st, raff, damage, draw);
    // put() 落在 dest.pileStats[pile]（见 battle-cards-system.js:59-60）
    const allyDiscard = (ally0.pileStats?.discard || ally0.discard || []);
    const raffDiscard = (raff.pileStats?.discard || raff.discard || []);
    return {
      landedAlly: allyDiscard.some(c => c.suit === "♥" && c.name === "闪"),
      landedEnemy: raffDiscard.some(c => c.suit === "♥" && c.name === "闪"),
      raffHand: raff.hand.length,
    };
  });
  T("E 成本牌本属我方 → 弃置后回到我方牌堆（不被洗成敌方）",
    e.landedAlly && !e.landedEnemy, e);

  // 场景F：成本弃牌是否可见（出牌区 + 战报）
  const joined = [a, b, c, d].map(x => (x.logs || []).join("|")).join("|");
  T("F 战报含发动控神魔眼", /发动控神魔眼/.test(joined), (a.logs || []).slice(0, 5));
  // 出牌区：put(..., {showDiscard:true}) 会写入 b.played（battle-cards-system.js:51-56）
  const playedAll = [a, b, c, d].map(x => (x.played || []).join("|")).join("|");
  T("F1 出牌区显示了成本弃牌", /弃置了/.test(playedAll), { sample: (a.played || []).slice(0, 4) });
  // 必须认准「发动者本人」的弃置记录：战报里另有「罗卡尔 因控神魔眼弃置了…」
  // （那是 first 被令弃牌），若只匹配「弃置」会被它蒙混过关。
  const costRe = new RegExp(`${a.raffName}[^|]*弃置`);
  T("F2 战报记录了发动者本人弃置成本牌（玩家能看到弃了哪张）",
    costRe.test(joined), { raffName: a.raffName, sample: (a.logs || []).slice(0, 8) });

  console.log(`\n页面错误: ${errors.length ? errors.join("; ") : "无"}`);
  T("无页面 JS 错误", errors.length === 0, errors.slice(0, 3));
  console.log(`\n=== ${pass}/${pass + fail} 通过 ===`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
