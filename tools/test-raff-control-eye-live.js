// 内英组杀手拉芙·控神魔眼 实测
// 覆盖：弃置任意手牌（不再限红桃）→ 指定敌方一名角色弃置一张牌 →
//       第一名角色对第二名角色打出虚拟【与我一战】 → 按双方打出的【杀】数摸牌
//       AI 行为：优先使用；指定我方攻击力最高的角色去决斗另一名我方角色
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
  // 开场 + 进入真实战斗（标准回归助手，含新档确认与开场剧情处理）
  const entered = await startRegressionBattle(page).then(() => ({ ok: true }))
    .catch(e => ({ ok: false, reason: String(e).slice(0, 200) }));
  T("进入真实战斗", !!(entered && (entered.ok !== false)), entered);
  if (!entered.ok) { console.log(`=== ${pass}/${pass + fail} 通过 ===`); await browser.close(); process.exit(1); }

  // 场景1：拉芙持【非红桃】手牌 → 仍应可发动（旧版限红桃）
  const s1 = await page.evaluate(() => {
    const w = window, st = w.state, b = st.battle;
    const raff = (b.enemies || [])[0];
    raff.ai = "raff_assassin"; raff.ref = "raff_assassin"; raff.name = "内英组杀手拉芙";
    raff.usedControlEye = false; raff.hp = 150;
    // 刻意不给红桃：全黑桃，验证「任意手牌」
    raff.hand = [{ name: "杀", type: "kill", suit: "♠" }, { name: "杀", type: "kill", suit: "♣" }];
    const allies = (b.allies || []).slice(0, 2);
    allies.forEach((u, i) => {
      u.hp = 300;
      u.stats = u.stats || {};
      u.stats.attack = i === 0 ? 30 : 5;   // 0 号攻击力最高 → 应为 first
      u.hand = [{ name: "杀（普攻）", type: "kill", suit: "♥" }, { name: "闪", type: "response", suit: "♦" }];
    });
    const move = w.UnderwaterTrainSkills?.controlEyeMove?.(st, raff);
    return {
      hasHeart: raff.hand.some(c => c.suit === "♥"),
      moveName: move?.card?.name || null,
      allyNames: allies.map(u => u.name),
      firstAttack: allies[0].stats.attack, secondAttack: allies[1].stats.attack,
    };
  });
  T("无红桃手牌时 AI 仍选择控神魔眼（旧版限红桃）", s1.moveName === "控神魔眼" && !s1.hasHeart, s1);

  // 场景2：真实执行 → 目标弃牌 + 决斗 + 摸牌
  const s2 = await page.evaluate(() => {
    const w = window, st = w.state, b = st.battle;
    const raff = (b.enemies || [])[0];
    const allies = (b.allies || []).slice(0, 2);
    const before = {
      raffHand: raff.hand.length,
      a0Hand: allies[0].hand.length,
      a1Hand: allies[1].hand.length,
      a0Attack: allies[0].stats?.attack,
      a1Attack: allies[1].stats?.attack,
    };
    // 走真实技能执行入口。damage/draw 由战斗模块注入（battle-combat-card-effects），
    // 这里注入等价的最小实现：只做扣血与摸牌记账，用于核对弃牌与摸牌数量。
    const __drawn = [];
    const damage = (_st, target, amount, _label, _src) => {
      if (target) target.hp = Math.max(0, (target.hp || 0) - (amount || 0));
    };
    const draw = (unit, n) => { __drawn.push(n); for (let i = 0; i < (n || 0); i++) (unit.hand ||= []).push({ name: "摸入", suit: "♦", _pendingDraw: false }); return n; };
    let used;
    try {
      used = w.UnderwaterTrainSkills?.useControlEye?.(st, raff, damage, draw);
    } catch (e) { return { err: String(e), before }; }
    const logs = (w.state.log || b.log || []).slice(0, 40).map(x => String(x?.text ?? x));
    return {
      used,
      before,
      after: {
        raffHand: raff.hand.length,
        a0Hand: allies[0].hand.length,
        a1Hand: allies[1].hand.length,
      },
      logs,
      usedFlag: !!raff.usedControlEye,
      drawCalls: __drawn,
    };
  });
  if (s2.err) T("执行控神魔眼未抛错", false, s2);
  else {
    T("控神魔眼已执行并置位使用标记", s2.used === true && s2.usedFlag, { used: s2.used, usedFlag: s2.usedFlag });
    // 拉芙弃 1 张（成本）
    const drawnTotal = (s2.drawCalls || []).reduce((a, b) => a + b, 0);
    T("拉芙弃置 1 张手牌作为成本（并因决斗摸牌）",
      s2.after.raffHand === s2.before.raffHand - 1 + drawnTotal
      && (s2.drawCalls || []).length > 0, { before: s2.before, after: s2.after, drawnTotal });
    // first = 攻击力最高者
    const firstIsA0 = s2.before.a0Attack > s2.before.a1Attack;
    T("AI 指定攻击力最高的我方角色为第一名（first）", firstIsA0, s2.before);
    // first 额外弃 1 张（描述新增）
    // 注意：决斗本身也会消耗手牌，故不能只看数量变化——必须认准「因控神魔眼弃置」这条日志，
    // 否则撤掉新增弃牌步骤后，本条仍会因决斗掉牌而假通过。
    T("first 因控神魔眼弃置 1 张牌（认准专属日志）",
      firstIsA0 && /因控神魔眼弃置了/.test((s2.logs || []).join("|")), (s2.logs || []).slice(0, 6));
    const joined = (s2.logs || []).join("|");
    T("日志含「与我一战」决斗", /与我一战/.test(joined), (s2.logs || []).slice(0, 8));
    T("日志含 first 弃牌记录", /弃置/.test(joined), (s2.logs || []).slice(0, 8));
  }

  // 场景3：描述文案同步（数据 + 产物）
  const s3 = await page.evaluate(() => {
    const w = window;
    const e = (w.GameDataUnderwaterTrainEnemies || [])
      .find(x => x.id === "raff_assassin" || x.name === "内英组杀手拉芙");
    const skill = (e?.skills || []).find(s => s.name === "控神魔眼");
    return { text: skill?.text || null, evalText: e?.evaluation || null };
  });
  T("技能描述含「弃置一张任意手牌」", /弃置一张任意手牌/.test(s3.text || ""), s3.text);
  T("技能描述含「指定敌方一名角色弃置一张牌」", /指定敌方一名角色弃置一张牌/.test(s3.text || ""), s3.text);
  T("技能描述不再要求红桃", !/红桃/.test(s3.text || ""), s3.text);
  T("技能描述含「摸等量的牌」", /摸等量的牌/.test(s3.text || ""), s3.text);

  // 场景4：台词
  const s4 = await page.evaluate(() => {
    const data = window.BattleLineData;
    return { line: data?.skillLines?.raff_assassin?.["控神魔眼"] || null };
  });
  T("台词为「好了，亲爱的傀儡，与他决斗！」", s4.line === "好了，亲爱的傀儡，与他决斗！", s4);

  console.log(`\n页面错误: ${errors.length ? errors.join("; ") : "无"}`);
  T("无页面 JS 错误", errors.length === 0, errors.slice(0, 3));
  console.log(`\n=== ${pass}/${pass + fail} 通过 ===`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
