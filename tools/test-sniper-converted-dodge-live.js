// 实战回归扩展：狙击锁定下，各类「转换闪 / 虚拟牌 / 手动响应」是否仍可响应
// 目标：定位用户反馈「狙击目标对转换闪依然可被响应」的真实触发路径
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

// opt: { locked, manual, cardExtra, floraHand }
const setupTpl = opt => `(() => {
  const o = ${JSON.stringify(opt)};
  const b = window.state.battle;
  const flora = b.allies[0];
  flora.ref = "flora"; flora.name = "芙萝娅";
  flora.skills = [{ name: "神速之翼", type: "passive", icon: "⭐",
    text: "锁定技，当你成为【杀】的目标时，你将1张手牌当【闪】使用。" }];
  flora.hp = 200; flora.maxHp = 200; flora.armor = 0; flora.block = 0;
  flora.stats.attack = 0; flora.stats.magic = 0;
  flora.hand = o.floraHand.map(c => ({ ...c }));
  flora.hand.forEach(c => { delete c._pendingDraw; });

  const sniper = b.enemies[0];
  sniper.name = "贵族军狙击手"; sniper.ai = "ruins_sniper";
  sniper.hp = 300; sniper.maxHp = 300;
  sniper.stats.attack = 10; sniper.stats.magic = 0;
  sniper.intent = 99;
  sniper.ruinsSniperTargetUid = flora.uid;
  sniper.ruinsSniperSuit = "♠";
  sniper.ruinsSniperLocked = ${opt.locked ? "true" : "false"};
  sniper.usedRuinsSnipe = true;
  const kill = Object.assign({ name: "杀", type: "slash", suit: "♣",
    power: 0, damage: 0, scale: "attack" }, o.cardExtra || {});
  sniper.hand = [kill];

  b.enemies.slice(1).forEach(e => { e.hp = 0; });
  b.allies.slice(1).forEach(u => { u.hp = 0; });
  b.phase = 4; b.activeUid = sniper.uid; b.locked = false; b.animQueue = [];
  b.manualDodge = null; b.manualCounter = null;
  window.state.settings = window.state.settings || {};
  window.state.settings.manualResponse = ${opt.manual ? "true" : "false"};
  window.state.log = [];
  window.render();
  return { floraUid: flora.uid, floraHp: flora.hp, sniperUid: sniper.uid };
})()`;

const runTpl = `(() => {
  const b = window.state.battle;
  const sniper = b.enemies[0], flora = b.allies[0];
  const card = sniper.hand[0];
  window.state.log = [];
  window.BattleSystem.useCard(window.state, sniper, flora, card);
  return true;
})()`;

const readTpl = `(() => {
  const b = window.state.battle;
  return {
    hp: b.allies[0].hp,
    manualDodge: !!b.manualDodge,
    log: (window.state.log || []).slice(0, 20),
  };
})()`;

const NO_FLASH_HAND = [
  { name: "杀", type: "slash", suit: "♠", power: 0, damage: 0, scale: "attack" },
  { name: "杀", type: "slash", suit: "♥", power: 0, damage: 0, scale: "attack" },
  { name: "杀", type: "slash", suit: "♦", power: 0, damage: 0, scale: "attack" },
];

async function scenario(browser, opt, label) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await openGame(page);
  await startRegressionBattle(page);
  await page.waitForTimeout(1200);
  const setup = await page.evaluate(setupTpl(opt));
  await page.evaluate(runTpl);
  await page.waitForTimeout(1500);
  const out = await page.evaluate(readTpl);
  await page.close();
  const logText = (out.log || []).join(" | ");
  console.log(`\n=== ${label} ===`);
  console.log(`  芙萝娅 HP: ${setup.floraHp} → ${out.hp}   手动弹窗=${out.manualDodge}`);
  console.log(`  日志: ${logText || "(空)"}`);
  return {
    hp: out.hp, manualDodge: out.manualDodge, errors, logText,
    wingFired: logText.includes("发动神速之翼"),
    blocked: logText.includes("无法使用响应牌响应本次杀"),
  };
}

(async () => {
  const browser = await chromium.launch();

  // B: 手动响应模式 ON + 狙击锁定
  {
    const r = await scenario(browser,
      { locked: true, manual: true, floraHand: NO_FLASH_HAND },
      "B: 手动响应ON + 狙击锁定（应不可响应）");
    check("B 神速之翼未被触发", !r.wingFired, r.logText);
    check("B 未弹出手动响应窗", !r.manualDodge);
    check("B 芙萝娅掉血", r.hp < 200, `HP=${r.hp}`);
    check("B 无页面错误", r.errors.length === 0, r.errors.join(";"));
  }

  // C: 虚拟杀 + 狙击锁定
  {
    const r = await scenario(browser,
      { locked: true, manual: false, floraHand: NO_FLASH_HAND,
        cardExtra: { name: "杀（普攻）", virtual: true } },
      "C: 虚拟杀 + 狙击锁定（统一后虚拟杀不吃锁定，应可响应）");
    check("C 神速之翼被触发", r.wingFired, r.logText);
    check("C 虚拟杀未锁定（不掉血）", r.hp === 200, `HP=${r.hp}`);
    check("C 无不可响应日志", !r.blocked, r.logText);
    check("C 无页面错误", r.errors.length === 0, r.errors.join(";"));
  }

  // D: 需要两张闪(twoDodgesRequired) + 狙击锁定
  {
    const r = await scenario(browser,
      { locked: true, manual: false, floraHand: NO_FLASH_HAND,
        cardExtra: { twoDodgesRequired: true } },
      "D: 双闪需求 + 狙击锁定（应不可响应）");
    check("D 神速之翼未被触发", !r.wingFired, r.logText);
    check("D 芙萝娅掉血", r.hp < 200, `HP=${r.hp}`);
    check("D 无页面错误", r.errors.length === 0, r.errors.join(";"));
  }

  // E: 狙击锁定 + 芙萝娅手里有实体闪（对照：连实体闪也不该生效）
  {
    const r = await scenario(browser,
      { locked: true, manual: false,
        floraHand: [{ name: "闪", type: "response", suit: "♠" },
          { name: "杀", type: "slash", suit: "♥", power: 0, damage: 0, scale: "attack" }] },
      "E: 狙击锁定 + 有实体闪（应不可响应）");
    check("E 无响应抵消", r.hp < 200, `HP=${r.hp}`);
    check("E 打印不可响应", r.blocked, r.logText);
    check("E 无页面错误", r.errors.length === 0, r.errors.join(";"));
  }

  await browser.close();
  console.log(`\n汇总：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("FATAL", e); process.exit(1); });
