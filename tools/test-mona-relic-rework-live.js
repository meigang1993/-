/* 【盖亚妮丝护符 / 圣鹰剑】重做实机检查（真实浏览器 + 真实出牌链路）
   LIVE_REVERT=charm|sword 运行时禁用对应模块，断言必须精准打红。 */
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const REVERT = process.env.LIVE_REVERT || "";
let pass = 0, total = 0;
const red = [];
function T(tag, name, cond, extra) {
  total++;
  if (cond) { pass++; console.log(`✅ ${tag} ${name}`); }
  else { red.push(tag); console.log(`❌ ${tag} ${name}  ← ${JSON.stringify(extra || {})}`); }
}

const charmSetup = relics => `(() => {
  const st = window.state, b = st.battle;
  const a = b.allies[0], e = b.enemies[0];
  b.activeUid = a.uid; b.phase = 4; b.locked = false;
  b.animQueue = []; b.handReveal = null; b.noaCharmDiscard = null;
  b.discardPick = null; b.selectedCardIndex = null; b.pendingTargetUid = null;
  b.selectedSkillCard = null;
  st.log = [];
  a.intent = 5; a.hp = 200; a.maxHp = 200; a.battleRelics = [];
  a.hand = [{ name: "束缚陷阱", type: "obstacle", statusKey: "stun", suit: "♥" }];
  a.deck = []; a.discard = [];
  e.battleRelics = ${JSON.stringify(relics)};
  e.hand = [{ name: "敌方原手牌", type: "tactic", suit: "♠" }];
  e.hp = 200; e.maxHp = 200; e.block = 0;
  e.deck = [
    { name: "摸牌甲", type: "slash", suit: "♠" },
    { name: "摸牌乙", type: "slash", suit: "♥" },
    { name: "摸牌丙", type: "slash", suit: "♣" },
  ];
  e.discard = [];
  window.render();
  return { handBefore: e.hand.length };
})()`;

const charmPlay = `(() => {
  const st = window.state, b = st.battle;
  const ok = window.BattleSystem.playActiveCard(st, 0, b.enemies[0].uid);
  return { ok };
})()`;

const charmPeek = `(() => {
  const e = window.state.battle.enemies[0];
  // 生成的状态牌与摸到的牌都带 _pendingDraw（摸牌动画占位），
  // 只统计可见牌会漏掉刚生成/刚摸到的那一张，必须看全量 hand。
  const all = e.hand || [];
  return {
    hand: all.filter(c => !c._pendingDraw).map(c => c.name),
    all: all.map(c => c.name),
    status: all.filter(c => c.type === "status" || c.stun || c.statusKey).map(c => c.name),
    logs: (window.state.log || []).slice(0, 25).map(String),
  };
})()`;

const swordSetup = relics => `(() => {
  const st = window.state, b = st.battle;
  const a = b.allies[0], e = b.enemies[0];
  b.activeUid = a.uid; b.phase = 4; b.locked = false;
  b.animQueue = []; b.handReveal = null; b.noaCharmDiscard = null;
  b.discardPick = null; b.selectedCardIndex = null; b.pendingTargetUid = null;
  b.selectedSkillCard = null;
  st.log = [];
  a.intent = 5; a.hp = 200; a.maxHp = 200;
  // 用真实小数攻击力 9.6（属性翻倍后的模板值）。修复前 ×2 会得到 19.2→19，
  // 玩家看到的「翻倍」比首击 10 少 1 点；修复后必须严格 10→20。
  a.stats = { attack: 9.6, magic: 0, speed: 4, handLimit: 4, bloodlust: 1 };
  a.tempAttack = 0;
  a.battleRelics = ${JSON.stringify(relics)};
  a.hand = [
    { name: "杀（普攻）", type: "slash", suit: "♠", scale: "attack" },
    { name: "杀（普攻）", type: "slash", suit: "♠", scale: "attack" },
  ];
  a.hand.forEach(c => { delete c._pendingDraw; });
  a.deck = []; a.discard = [];
  e.battleRelics = []; e.hand = []; e.hp = 200; e.maxHp = 200; e.block = 0;
  window.render();
  return { hp: e.hp };
})()`;

const playSlash = `(() => {
  const st = window.state, b = st.battle;
  const before = b.enemies[0].hp;
  const ok = window.BattleSystem.playActiveCard(st, 0, b.enemies[0].uid);
  return {
    ok, before, after: b.enemies[0].hp, loss: before - b.enemies[0].hp,
    logs: (st.log || []).slice(0, 25).map(String),
  };
})()`;

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", e => errors.push(String(e)));
  await openGame(page);
  await startRegressionBattle(page);
  // 登场字幕是 Infinity 超时 + dismissible，不关掉会一直 locked。
  await page.evaluate(() => {
    document.querySelectorAll("[data-dismiss-speech]").forEach(el => el.click());
  });
  await page.waitForTimeout(400);

  if (REVERT === "charm") {
    await page.evaluate(() => {
      window.GaianisAmuletSkills.nullifyStatus = () => false;
      window.GaianisAmuletSkills.resolveObstacle = () => false;
      window.GaianisAmuletSkills.suppressJudgement = () => false;
    });
  } else if (REVERT === "sword") {
    await page.evaluate(() => {
      window.HolyEagleSwordSkills.modifyDamage = (_s, _a, _t, _c, amount) => amount;
    });
  } else if (REVERT === "round") {
    // 旧版：翻倍前不取整（保留日志，让只有 B3 精准打红）。
    await page.evaluate(() => {
      window.HolyEagleSwordSkills.modifyDamage = (s, a, t, _c, amount) => {
        if (!window.HolyEagleSwordSkills.marked(s, a, t)) return amount;
        window.BattleLog.add(s, `${a.name} 的圣鹰剑触发，对${t.name}的下一张单体【杀】伤害翻倍。`);
        return amount * 2;
      };
    });
  } else if (REVERT === "forced") {
    // 旧版：兜底消耗走 forcedDiscard，会往出牌区写「被弃置」快照。
    await page.evaluate(() => {
      window.GaianisAmuletSkills.suppressJudgement = (state, unit, card) => {
        window.BattleStatusCardStorage.consumeRemoved(state, unit, card, true);
        window.BattleLog.add(state, `${unit.name} 的盖亚妮丝护符令${card.name}判定无效。`);
        return true;
      };
    });
  }

  // ===== A 盖亚妮丝护符：障碍牌无效 + 摸一张 =====
  await page.evaluate(charmSetup(["盖亚妮丝护符"]));
  const playA = await page.evaluate(charmPlay);
  await page.waitForTimeout(700);
  const A = await page.evaluate(charmPeek);
  T("A1", "障碍牌真实打出成功", playA.ok === true, playA);
  T("A2", "护符令障碍牌无效：目标手里不生成眩晕状态牌",
    A.status.length === 0, { status: A.status, logs: A.logs.slice(0, 4) });
  T("A3", "其他角色使用障碍牌时，持有者摸一张牌",
    A.all.length === 2 && A.all.some(n => n.startsWith("摸牌")), A);
  T("A4", "战报写明护符令障碍牌无效并摸牌",
    A.logs.some(l => l.includes("盖亚妮丝护符") && l.includes("无效"))
    && A.logs.some(l => l.includes("摸")), A.logs);

  await page.evaluate(charmSetup([]));
  await page.evaluate(charmPlay);
  await page.waitForTimeout(700);
  const A0 = await page.evaluate(charmPeek);
  T("A5", "对照：无护符时正常生成眩晕状态牌",
    A0.status.length === 1, { status: A0.status, logs: A0.logs.slice(0, 4) });
  T("A6", "对照：无护符时不额外摸牌",
    !A0.all.some(n => n.startsWith("摸牌")), A0);

  // ===== B 圣鹰剑：同目标下一张单体杀翻倍 =====
  await page.evaluate(swordSetup(["圣鹰剑"]));
  const first = await page.evaluate(playSlash);
  await page.waitForTimeout(500);
  const second = await page.evaluate(playSlash);
  await page.waitForTimeout(500);
  T("B1", "两张单体杀都真实打出", first.ok === true && second.ok === true,
    { first: first.ok, second: second.ok });
  T("B2", "第一张造成真实伤害", first.loss > 0, first);
  T("B3", "第二张对同一目标伤害翻倍",
    second.loss === first.loss * 2, { first: first.loss, second: second.loss });
  T("B4", "战报出现圣鹰剑触发",
    second.logs.some(l => l.includes("圣鹰剑触发")), second.logs.slice(0, 8));

  await page.evaluate(swordSetup([]));
  const n1 = await page.evaluate(playSlash);
  await page.waitForTimeout(500);
  const n2 = await page.evaluate(playSlash);
  await page.waitForTimeout(500);
  T("B5", "对照：未装备圣鹰剑时两次伤害相等",
    n1.loss > 0 && n2.loss === n1.loss, { n1: n1.loss, n2: n2.loss });

  // ===== C 护符：残留状态牌经判定层兜底消耗时，不写出牌区「被弃置」快照 =====
  await page.evaluate(charmSetup(["盖亚妮丝护符"]));
  const C = await page.evaluate(`(() => {
    const st = window.state, b = st.battle, e = b.enemies[0];
    b.played = [];
    e.hand.push({ name: "眩晕", type: "status", statusKey: "stun", stun: true });
    window.BattleStatusCardTriggers.judgement(st, e);
    return {
      forced: (b.played || []).filter(x => x._playedAction === "被弃置" || x.dismantled).length,
      statusLeft: e.hand.filter(x => x.type === "status" || x.stun).length,
      logs: (st.log || []).slice(0, 20).map(String),
    };
  })()`);
  T("C2", "兜底消耗不写出牌区「被弃置」快照", C.forced === 0, C);
  T("C3", "兜底消耗清掉残留状态牌并写判定无效战报",
    C.statusLeft === 0 && C.logs.some(l => l.includes("判定无效")), C);
  T("C1", "无页面错误", errors.length === 0, errors.slice(0, 4));

  console.log(`\nRESULT ${pass}/${total}  LIVE_REVERT=${REVERT || "none"}  红=${red.join(",") || "无"}`);
  const expectRed = REVERT === "charm" ? ["A2", "A3", "A4"]
    : REVERT === "sword" ? ["B3", "B4"]
      : REVERT === "round" ? ["B3"]
        : REVERT === "forced" ? ["C2"] : [];
  if (expectRed.length) {
    const missing = expectRed.filter(tag => !red.includes(tag));
    // charm 反向会同时关掉 A 段与 C 段（C 段验的正是护符兜底），
    // 因此 A/C 段红都属合理连带，只有 B 段（圣鹰剑）算误伤。
    const unrelated = red.filter(tag => REVERT === "charm" ? tag.startsWith("B")
      : REVERT === "sword" || REVERT === "round" ? !tag.startsWith("B")
        : !tag.startsWith("C"));
    const ok = missing.length === 0 && unrelated.length === 0;
    console.log(ok ? "REVERT_OK 反向验证精准打红" : `REVERT_BAD 缺失=${missing} 误伤=${unrelated}`);
    if (!ok) process.exitCode = 1;
  } else if (pass !== total) {
    process.exitCode = 1;
  }
  await browser.close();
})().catch(err => { console.error(err); process.exitCode = 1; });
