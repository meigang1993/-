// 实战回归：亚缇娜【狙击目标】锁定下，转换类响应牌是否失效
//   A/B 凋零者·极速：黑色牌标 withererSpeedResponse（可当【闪】）
//   C/D 凯丽·突破重围：黑色牌标 deflect（可当【看破】）
// 构造说明：window.WithererSkills.markSpeedCards 未导出，故直接置标记模拟形态效果。
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

// artinaSpades: 亚缇娜手牌中 ♠ 数量（own），敌方固定 1 张 ♠（foe）
//   own > foe → 锁定成立；own <= foe → 未取得优势，不锁定
const runTpl = opt => `(() => {
  const o = ${JSON.stringify(opt)};
  const st = window.state, b = st.battle;
  const artina = b.allies[0], foe = b.enemies[0];

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

  foe.name = o.foeName; foe.ai = o.foeAi;
  foe.hp = 100; foe.maxHp = 100; foe.armor = 0; foe.block = 0;
  foe.stats.attack = 0; foe.stats.magic = 0;
  if (o.foeAi === "witherer") foe.withererMode = "极速";
  // 敌方持一张黑色牌，按形态标记为可当【闪】或【看破】
  foe.hand = [{ name: "杀", type: "slash", suit: "♠",
    power: 0, damage: 0, scale: "attack" }];
  if (o.foeAi === "witherer") foe.hand[0].withererSpeedResponse = true;
  else foe.hand[0].deflect = true;

  b.enemies.slice(1).forEach(e => { e.hp = 0; });
  b.allies.slice(1).forEach(u => { u.hp = 0; });
  b.phase = 4; b.activeUid = artina.uid; b.locked = false; b.animQueue = [];
  b.manualDodge = null; b.manualCounter = null;
  window.state.settings = window.state.settings || {};
  window.state.settings.manualResponse = false;

  // 阶段1：发动狙击目标（技能函数，非 useCard——技能卡经 useCard 会静默返回 false）
  st.log = [];
  const snipeOk = window.ArtinaMariaSkills?.handleSpecialCard?.(st, artina, foe,
    { name: "狙击目标", type: "tactic", artinaSniper: true,
      enemyTarget: true }, {});
  const charged = !!artina.artinaChargedTargetUid;
  const snipeLog = (st.log || []).slice(0, 4);

  // 阶段2：打出实体单体杀
  st.log = [];
  const kill = artina.hand.find(c => c.suit === "♥");
  window.BattleSystem.useCard(st, artina, foe, kill);
  return {
    snipeOk: String(snipeOk), charged, snipeLog,
    hpBefore: 100, foeHp: foe.hp,
    killLog: (st.log || []).slice(0, 10),
    foeFlag: o.foeAi === "witherer"
      ? "withererSpeedResponse" : "deflect(看破)",
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
  const snipeText = (out.snipeLog || []).join(" | ");
  console.log(`\n=== ${label} ===`);
  console.log(`  敌方: ${opt.foeName} (${opt.foeAi})  响应标记=${out.foeFlag}`);
  console.log(`  狙击: ok=${out.snipeOk} charged=${out.charged}`);
  console.log(`    ${snipeText || "(空)"}`);
  console.log(`  敌方 HP: ${out.hpBefore} → ${out.foeHp}`);
  console.log(`    ${killText || "(空)"}`);
  return {
    charged: out.charged, hpBefore: out.hpBefore, hpAfter: out.foeHp,
    errors, killText,
    blocked: killText.includes("无法使用响应牌响应本次杀"),
    dodged: /抵消|自动使用闪|使用看破/.test(killText),
  };
}

(async () => {
  const browser = await chromium.launch();

  // A: 凋零者·极速 + 锁定成立（own 3 > foe 1）
  {
    const r = await scenario(browser,
      { foeName: "凋零者1124号分裂体", foeAi: "witherer", artinaSpades: 3 },
      "A: 凋零者·极速 + 狙击锁定成立");
    check("A 锁定成立(charged)", r.charged);
    check("A 日志含「无法使用响应牌响应本次杀」", r.blocked, r.killText);
    check("A 转换闪失效（敌方掉血）", r.hpAfter < r.hpBefore,
      `HP ${r.hpBefore}→${r.hpAfter}`);
    check("A 无页面错误", r.errors.length === 0, r.errors.join(";"));
  }

  // B: 凋零者·极速 + 未锁定（own 0 < foe 1，对照）
  {
    const r = await scenario(browser,
      { foeName: "凋零者1124号分裂体", foeAi: "witherer", artinaSpades: 0 },
      "B: 凋零者·极速 + 未取得优势（对照：应可响应）");
    check("B 未锁定", !r.charged);
    check("B 转换闪生效（未掉血）", r.hpAfter === r.hpBefore,
      `HP ${r.hpBefore}→${r.hpAfter} | ${r.killText}`);
    check("B 无页面错误", r.errors.length === 0, r.errors.join(";"));
  }

  // C: 凯丽 + 锁定成立
  {
    const r = await scenario(browser,
      { foeName: "凯丽", foeAi: "guard_kelly", artinaSpades: 3 },
      "C: 凯丽·突破重围(黑色牌当看破) + 狙击锁定成立");
    check("C 锁定成立(charged)", r.charged);
    check("C 转换看破失效（敌方掉血）", r.hpAfter < r.hpBefore,
      `HP ${r.hpBefore}→${r.hpAfter} | ${r.killText}`);
    check("C 无页面错误", r.errors.length === 0, r.errors.join(";"));
  }

  // D: 凯丽 + 未锁定（对照）
  {
    const r = await scenario(browser,
      { foeName: "凯丽", foeAi: "guard_kelly", artinaSpades: 0 },
      "D: 凯丽 + 未取得优势（对照）");
    check("D 未锁定", !r.charged);
    check("D 无页面错误", r.errors.length === 0, r.errors.join(";"));
  }

  await browser.close();
  console.log(`\n汇总：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})();
