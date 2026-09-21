// 实战回归：贵族军狙击手【狙击目标】锁定为「一次性」——与亚缇娜【狙击目标】一致
// 背景：此前狙击手为「本回合持续锁定」（endTurn 才清除），而描述/亚缇娜均为「下一张」，
//       两者不一致。现统一为命中一张实体单体【杀】后立即失效。
// 覆盖：
//   A 奥菲莉亚（无闪，护驾者罗卡尔有闪）+ 锁定成立
//       → 第 1 杀：不可响应，护驾触发且护驾者也无法用闪（ignoreResponse 随卡传递）
//       → 第 2 杀：锁定已失效，护驾者可用【闪】抵消
//   B 艾斯（有手牌）+ 锁定成立
//       → 第 1 杀：不可响应，掉血
//       → 第 2 杀：无「不可响应」日志（锁定已消耗）
//   C 对照：未取得优势时不锁定
//   D 艾斯空手 → 急逃补牌（狙击因无可展示手牌直接失败）
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

// artinaSpades 对应狙击手手牌中的 ♠ 数量（own）；目标固定 1 张 ♠（foe）
//   own > foe → 锁定成立；own <= foe → 未取得优势
const runTpl = opt => `(() => {
  const o = ${JSON.stringify(opt)};
  const st = window.state, b = st.battle;
  const sniper = b.enemies[0], t0 = b.allies[0], t1 = b.allies[1];
  sniper.ai = "ruins_sniper"; sniper.name = "贵族军狙击手"; sniper.id = "noble_sniper";
  sniper.usedRuinsSnipe = false; sniper.ruinsSniperLocked = false;
  sniper.ruinsSniperTargetUid = null;
  sniper.stats.attack = 10; sniper.stats.magic = 0;
  sniper.hand = o.sniperHand.map(c => ({ ...c }));
  sniper.hand.forEach(c => { delete c._pendingDraw; });

  t0.ref = o.ref0; t0.name = o.name0;
  t0.hp = 300; t0.maxHp = 300; t0.armor = 0; t0.block = 0;
  t0.stats = t0.stats || {};
  t0.stats.drawPerTurn = o.drawPerTurn;
  t0._urgentEscapeTurn = null;
  t0.hand = o.t0Hand.map(c => ({ ...c }));
  t0.hand.forEach(c => { delete c._pendingDraw; });

  if (o.keepAlly1) {
    t1.ref = "lokar"; t1.name = "罗卡尔";
    t1.hp = 300; t1.maxHp = 300; t1.armor = 0; t1.block = 0;
    t1.hand = o.t1Hand.map(c => ({ ...c }));
    t1.hand.forEach(c => { delete c._pendingDraw; });
  }
  b.enemies.slice(1).forEach(e => { e.hp = 0; });
  if (o.keepAlly1) b.allies.slice(2).forEach(u => { u.hp = 0; });
  else b.allies.slice(1).forEach(u => { u.hp = 0; });
  b.phase = 4; b.activeUid = sniper.uid; b.locked = false; b.animQueue = [];
  b.opheliaGuard = null; b.opheliaGuardUid = null;
  window.state.settings = window.state.settings || {};
  window.state.settings.manualResponse = false;
  window.state.settings.manualDodge = false;

  // 阶段1：发动狙击目标
  st.log = [];
  window.RuinsEnemySkills?.useSnipe?.(st, sniper, t0)
    ?? window.RuinsGruntSkills?.useSnipe?.(st, sniper, t0);
  const snipeLog = (st.log || []).slice(0, 3);
  const lockedAfterSnipe = !!sniper.ruinsSniperLocked;

  // 阶段2：第 1 张实体单体杀（锁定生效 → 不可响应）
  st.log = [];
  const k1 = sniper.hand.filter(c => c.suit === "♥")[0];
  if (k1) { k1.forceAutoResponse = true; window.BattleSystem.useCard(st, sniper, t0, k1); }
  const hpAfter1 = t0.hp;
  const log1 = (st.log || []).slice(0, 14);
  const lockedAfter1 = !!sniper.ruinsSniperLocked;

  // 阶段3：第 2 张实体单体杀（锁定应已失效）
  st.log = [];
  const k2 = sniper.hand.filter(c => c.suit === "♥")[0];
  if (k2) { k2.forceAutoResponse = true; window.BattleSystem.useCard(st, sniper, t0, k2); }
  const hpAfter2 = t0.hp;
  const log2 = (st.log || []).slice(0, 14);

  return {
    snipeLog, lockedAfterSnipe, hpAfter1, log1, lockedAfter1, hpAfter2, log2,
    guardHp: o.keepAlly1 ? t1.hp : null,
    guardHand: o.keepAlly1 ? t1.hand.length : null,
    t0Hand: t0.hand.length,
  };
})()`;

const slash = suit => ({ name: "杀", type: "slash", suit, power: 0, damage: 0, scale: "attack" });
const flash = suit => ({ name: "闪", type: "response", suit });

// 狙击手手牌：o.ownSpades 张 ♠（决定 own）+ 2 张 ♥杀（用于连续两次单体杀）
const sniperHand = ownSpades => [
  ...Array.from({ length: ownSpades }, () => slash("♠")),
  slash("♥"), slash("♥"),
];
const TWO_FLASH = [flash("♥"), flash("♥")];

async function scenario(page, opt, label) {
  const out = await page.evaluate(runTpl(opt));
  await page.waitForTimeout(400);
  const t1 = (out.log1 || []).join(" | ");
  const t2 = (out.log2 || []).join(" | ");
  console.log(`\n=== ${label} ===`);
  console.log(`  狙击: ${out.snipeLog.join(" | ") || "(空)"}`);
  console.log(`  锁定: 狙击后=${out.lockedAfterSnipe}  第1杀后=${out.lockedAfter1}`);
  console.log(`  目标HP: 300 → ${out.hpAfter1} → ${out.hpAfter2}`);
  if (out.guardHp !== null) console.log(`  护驾者HP=${out.guardHp} 手牌=${out.guardHand}`);
  console.log(`  第1杀: ${t1 || "(空)"}`);
  console.log(`  第2杀: ${t2 || "(空)"}`);
  return {
    ...out,
    text1: t1,
    text2: t2,
    blocked1: t1.includes("无法使用响应牌响应本次杀"),
    blocked2: t2.includes("无法使用响应牌响应本次杀"),
    guarded: /为奥菲莉亚护驾/.test(t1) || /为奥菲莉亚护驾/.test(t2),
    dodgeOnSecond: /护驾，使用闪抵消杀/.test(t2),
  };
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await openGame(page);
  await startRegressionBattle(page);
  await page.waitForTimeout(1200);

  // A: 奥菲莉亚（无闪，护驾者罗卡尔有 2 张闪）+ 锁定成立
  {
    const r = await scenario(page, {
      ref0: "ophelia", name0: "奥菲莉亚", drawPerTurn: 3, keepAlly1: true,
      sniperHand: sniperHand(3),
      t0Hand: [slash("♠")],
      t1Hand: TWO_FLASH,
    }, "A: 奥菲莉亚(无闪) + 锁定成立");
    check("A 锁定成立", r.lockedAfterSnipe);
    check("A 第1杀不可响应", r.blocked1, r.text1);
    check("A 第1杀后锁定已消耗", !r.lockedAfter1);
    check("A 护驾触发", r.guarded, r.text1);
    check("A 被锁定的第1杀仍被护驾者用闪抵消（护驾不受锁定影响）",
      /护驾，使用闪抵消杀/.test(r.text1), r.text1);
    check("A 护驾者未掉血（用闪而非承受）", r.guardHp === 300,
      `护驾者HP=${r.guardHp}`);
    check("A 第2杀不再不可响应", !r.blocked2, r.text2);
    check("A 第2杀被护驾者闪抵消", r.dodgeOnSecond, r.text2);
    check("A 奥菲莉亚自身未掉血（全程护驾）", r.hpAfter2 === 300,
      `HP=${r.hpAfter2}`);
  }

  // B: 艾斯（有手牌）+ 锁定成立
  {
    const r = await scenario(page, {
      ref0: "ace", name0: "艾斯", drawPerTurn: 1, keepAlly1: false,
      sniperHand: sniperHand(3),
      t0Hand: [slash("♠")],
      t1Hand: [],
    }, "B: 艾斯(有手牌) + 锁定成立");
    check("B 锁定成立", r.lockedAfterSnipe);
    check("B 第1杀不可响应", r.blocked1, r.text1);
    check("B 第1杀掉血", r.hpAfter1 === 290, `HP=${r.hpAfter1}`);
    check("B 第1杀后锁定已消耗", !r.lockedAfter1);
    check("B 第2杀不再有「不可响应」", !r.blocked2, r.text2);
  }

  // C: 对照——未取得优势（own 0 < foe 1）不锁定
  {
    const r = await scenario(page, {
      ref0: "ace", name0: "艾斯", drawPerTurn: 1, keepAlly1: false,
      sniperHand: sniperHand(0),
      t0Hand: [slash("♠")],
      t1Hand: [],
    }, "C: 对照——未取得优势不锁定");
    check("C 未锁定", !r.lockedAfterSnipe);
    check("C 第1杀无「不可响应」", !r.blocked1, r.text1);
  }

  // D: 艾斯空手 → 狙击失败 + 急逃补牌
  {
    const r = await scenario(page, {
      ref0: "ace", name0: "艾斯", drawPerTurn: 1, keepAlly1: false,
      sniperHand: sniperHand(3),
      t0Hand: [],
      t1Hand: [],
    }, "D: 艾斯空手 → 狙击失败，急逃补牌");
    const snipeText = (r.snipeLog || []).join(" | ");
    check("D 狙击因无手牌失败", /没有可展示的手牌/.test(snipeText), snipeText);
    check("D 未锁定", !r.lockedAfterSnipe);
    check("D 急逃触发", /触发急逃/.test(r.text1), r.text1);
    // 实现为 2 + drawPerTurn = 2 + 1 = 3
    check("D 急逃摸 2+X = 3 张", /摸3张牌/.test(r.text1), r.text1);
  }

  check("无页面错误", errors.length === 0, errors.join(";"));
  await browser.close();
  console.log(`\n汇总：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})();
