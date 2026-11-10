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
  // 模板攻击力是小数（属性翻倍后 9.6），伤害取整会让 ×2 变成 10→19。
  // 这里钉成整数，才能对「精确翻倍」做严格断言。
  a.stats = { attack: 10, magic: 0, speed: 4, handLimit: 4, bloodlust: 1 };
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

  T("C1", "无页面错误", errors.length === 0, errors.slice(0, 4));

  console.log(`\nRESULT ${pass}/${total}  LIVE_REVERT=${REVERT || "none"}  红=${red.join(",") || "无"}`);
  const expectRed = REVERT === "charm" ? ["A2", "A3", "A4"]
    : REVERT === "sword" ? ["B3", "B4"] : [];
  if (expectRed.length) {
    const missing = expectRed.filter(tag => !red.includes(tag));
    const unrelated = red.filter(tag => REVERT === "charm"
      ? tag.startsWith("B") || tag.startsWith("C") : !tag.startsWith("B"));
    const ok = missing.length === 0 && unrelated.length === 0;
    console.log(ok ? "REVERT_OK 反向验证精准打红" : `REVERT_BAD 缺失=${missing} 误伤=${unrelated}`);
    if (!ok) process.exitCode = 1;
  } else if (pass !== total) {
    process.exitCode = 1;
  }
  await browser.close();
})().catch(err => { console.error(err); process.exitCode = 1; });
