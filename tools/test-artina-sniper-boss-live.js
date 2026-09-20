// 实战回归：亚缇娜【狙击目标】对 XX型凋零者1124号（BOSS）
// 与 test-artina-sniper-converted-live.js 的区别：
//   - 敌方为 BOSS（id = xx_witherer_1124），形态切换走真实 useShift，不模拟标记
//   - 覆盖 BOSS 极速形态下「黑色牌可当【闪】或【看破】」两种响应
//   - 覆盖 BOSS 额外机制：杀欲窥视复制的临时杀牌（withererPeekSlash）
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0;
let fail = 0;
const check = (label, ok, extra = "") => {
  if (ok) { pass += 1; console.log(`  ✅ ${label}`); }
  else { fail += 1; console.log(`  ❌ ${label}${extra ? "  " + extra : ""}`); }
};

// artinaSpades: 亚缇娜手牌中 ♠ 数量（own），BOSS 固定 1 张 ♠（foe）
//   own > foe → 锁定成立；own <= foe → 未取得优势
// bossHand: BOSS 手牌（黑色牌 → 极速形态下可当【闪】/【看破】）
const runTpl = opt => `(() => {
  const o = ${JSON.stringify(opt)};
  const st = window.state, b = st.battle;
  const artina = b.allies[0], boss = b.enemies[0];

  // --- 亚缇娜 ---
  artina.ref = "artina"; artina.name = "亚缇娜";
  artina.hp = 300; artina.maxHp = 300; artina.armor = 0; artina.block = 0;
  artina.usedArtinaSniper = false; artina.artinaChargedTargetUid = null;
  artina.artinaSniperTargetUid = null; artina.artinaSuits = {};
  artina.stats.attack = 10; artina.stats.magic = 0;
  const hand = [];
  for (let i = 0; i < o.artinaSpades; i += 1) {
    hand.push({ name: "杀", type: "slash", suit: "♠",
      power: 0, damage: 0, scale: "attack" });
  }
  hand.push({ name: "杀", type: "slash", suit: "♥",
    power: 0, damage: 0, scale: "attack" });   // 实际打出的实体单体杀
  artina.hand = hand;
  artina.hand.forEach(c => { delete c._pendingDraw; });

  // --- BOSS ---
  boss.id = "xx_witherer_1124"; boss.name = "XX型凋零者1124号";
  boss.ai = "witherer_1124"; boss.type = "boss";
  boss.skills = [
    { name: "杀欲窥视", type: "active", icon: "⚔️" },
    { name: "鲜血之忆", type: "passive", icon: "⭐" },
    { name: "暴走与极速", type: "active", icon: "🔄" },
  ];
  boss.hp = 350; boss.maxHp = 350; boss.armor = 0; boss.block = 0;
  boss.stats.attack = 0; boss.stats.magic = 0;
  boss.withererMode = null; boss.withererModeMajority = null;
  boss.statuses = [];
  boss.hand = o.bossHand.map(c => ({ ...c }));
  boss.hand.forEach(c => { delete c._pendingDraw; });

  b.enemies.slice(1).forEach(e => { e.hp = 0; });
  b.allies.slice(1).forEach(u => { u.hp = 0; });
  b.phase = 4; b.activeUid = artina.uid; b.locked = false; b.animQueue = [];
  b.manualDodge = null; b.manualCounter = null;
  window.state.settings = window.state.settings || {};
  window.state.settings.manualResponse = false;

  // 阶段0：真实形态切换（黑色牌 > 红色牌 → 极速）
  st.log = [];
  const shiftOk = window.WithererSkills?.useShift?.(st, boss);
  const mode = boss.withererMode;
  const marked = (boss.hand || []).filter(c => c.withererSpeedResponse).length;
  const shiftLog = (st.log || []).slice(0, 3);

  // 阶段1：发动狙击目标
  st.log = [];
  const snipeOk = window.ArtinaMariaSkills?.handleSpecialCard?.(st, artina, boss,
    { name: "狙击目标", type: "tactic", artinaSniper: true,
      enemyTarget: true }, {});
  const charged = !!artina.artinaChargedTargetUid;
  const snipeLog = (st.log || []).slice(0, 4);

  // 阶段2：打出实体单体杀
  st.log = [];
  const kill = artina.hand.find(c => c.suit === "♥");
  window.BattleSystem.useCard(st, artina, boss, kill);
  return {
    shiftOk: String(shiftOk), mode, marked, shiftLog,
    snipeOk: String(snipeOk), charged, snipeLog,
    hpBefore: 350, bossHp: boss.hp,
    killLog: (st.log || []).slice(0, 12),
  };
})()`;

async function scenario(browser, opt, label) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await openGame(page);
  await startRegressionBattle(page);
  await page.waitForTimeout(1200);
  const out = await page.evaluate(runTpl(opt));
  await page.waitForTimeout(800);
  await page.close();
  const killText = (out.killLog || []).join(" | ");
  const shiftText = (out.shiftLog || []).join(" | ");
  const snipeText = (out.snipeLog || []).join(" | ");
  console.log(`\n=== ${label} ===`);
  console.log(`  形态: ok=${out.shiftOk} mode=${out.mode} 标记黑色牌=${out.marked}`);
  console.log(`    ${shiftText || "(空)"}`);
  console.log(`  狙击: ok=${out.snipeOk} charged=${out.charged}`);
  console.log(`    ${snipeText || "(空)"}`);
  console.log(`  BOSS HP: ${out.hpBefore} → ${out.bossHp}`);
  console.log(`    ${killText || "(空)"}`);
  return {
    mode: out.mode, marked: out.marked, charged: out.charged,
    hpBefore: out.hpBefore, hpAfter: out.bossHp, errors, killText,
    blocked: killText.includes("无法使用响应牌响应本次杀"),
    dodged: /抵消|自动使用闪|使用看破/.test(killText),
  };
}

// BOSS 全黑色手牌（♠×1 + ♣×2）→ 极速形态，全部可当【闪】/【看破】
const BOSS_BLACK_HAND = [
  { name: "杀", type: "slash", suit: "♠", power: 0, damage: 0, scale: "attack" },
  { name: "杀", type: "slash", suit: "♣", power: 0, damage: 0, scale: "attack" },
  { name: "闪", type: "response", suit: "♣" },
];

(async () => {
  const browser = await chromium.launch();

  // A: BOSS 极速 + 狙击锁定成立（own 3 > foe 1）
  {
    const r = await scenario(browser,
      { bossHand: BOSS_BLACK_HAND, artinaSpades: 3 },
      "A: BOSS(XX型凋零者1124号)极速 + 狙击锁定成立");
    check("A 形态切换成功(极速)", r.mode === "极速", `mode=${r.mode}`);
    check("A 黑色牌被真实标记", r.marked === 3, `marked=${r.marked}`);
    check("A 锁定成立(charged)", r.charged);
    check("A 日志含「无法使用响应牌响应本次杀」", r.blocked, r.killText);
    check("A 转换闪失效（BOSS掉血）", r.hpAfter < r.hpBefore,
      `HP ${r.hpBefore}→${r.hpAfter}`);
    check("A 无页面错误", r.errors.length === 0, r.errors.join(";"));
  }

  // B: BOSS 极速 + 未取得优势（own 0 < foe 1，对照）
  {
    const r = await scenario(browser,
      { bossHand: BOSS_BLACK_HAND, artinaSpades: 0 },
      "B: BOSS极速 + 未取得优势（对照：应可响应）");
    check("B 形态切换成功(极速)", r.mode === "极速", `mode=${r.mode}`);
    check("B 未锁定", !r.charged);
    check("B 转换闪生效（BOSS未掉血）", r.hpAfter === r.hpBefore,
      `HP ${r.hpBefore}→${r.hpAfter} | ${r.killText}`);
    check("B 无页面错误", r.errors.length === 0, r.errors.join(";"));
  }

  // C: BOSS 暴走形态（红色牌多于黑色）+ 狙击锁定
  //    暴走形态下黑色牌不可当闪，故无论如何都掉血——验证描述与实现一致
  {
    const r = await scenario(browser,
      {
        bossHand: [
          // hand[0] 固定 ♠（狙击展示此牌），亚缇娜 ♠=3 > BOSS ♠=1 → 锁定成立
          // 红2 >= 黑1 → 暴走形态
          { name: "杀", type: "slash", suit: "♠", power: 0, damage: 0, scale: "attack" },
          { name: "杀", type: "slash", suit: "♥", power: 0, damage: 0, scale: "attack" },
          { name: "杀", type: "slash", suit: "♦", power: 0, damage: 0, scale: "attack" },
        ],
        artinaSpades: 3,
      },
      "C: BOSS暴走 + 狙击锁定（黑色牌不可当闪，应掉血）");
    check("C 形态切换成功(暴走)", r.mode === "暴走", `mode=${r.mode}`);
    check("C 无标记（暴走下黑色牌不当闪）", r.marked === 0, `marked=${r.marked}`);
    check("C 锁定成立(charged)", r.charged);
    check("C BOSS掉血", r.hpAfter < r.hpBefore, `HP ${r.hpBefore}→${r.hpAfter}`);
    check("C 无页面错误", r.errors.length === 0, r.errors.join(";"));
  }

  // D: 杀欲窥视复制的临时杀牌（withererPeekSlash，virtual/temporary）+ 狙击锁定
  //    复制牌带 temporary+void，属虚拟牌 → 统一后不应被锁定
  {
    const r = await scenario(browser,
      {
        bossHand: [
          // hand[0] 固定 ♠（狙击展示此牌）→ 亚缇娜 ♠=3 > BOSS ♠=1 → 锁定成立
          // 全黑 → 极速形态；此牌为杀欲窥视复制的临时杀牌
          { name: "杀", type: "slash", suit: "♠", power: 0, damage: 0, scale: "attack",
            withererPeekSlash: true, temporary: true, void: true },
          { name: "杀", type: "slash", suit: "♣", power: 0, damage: 0, scale: "attack" },
        ],
        artinaSpades: 3,
      },
      "D: BOSS持有杀欲窥视复制临时杀牌 + 狙击锁定");
    check("D 锁定成立(charged)", r.charged, r.killText);
    check("D BOSS掉血（临时牌不可响应）", r.hpAfter < r.hpBefore,
      `HP ${r.hpBefore}→${r.hpAfter} | ${r.killText}`);
    check("D 无页面错误", r.errors.length === 0, r.errors.join(";"));
  }

  await browser.close();
  console.log(`\n汇总：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("FATAL", e); process.exit(1); });
