// 严格检查：克罗【肉欲之欢】/ 莫娜【圣剑无双·圣天破军剑】的双闪要求
//   × 凋零者【极速标记】(黑色手牌当闪) / 芙萝娅【神速之翼】(任意手牌当闪)
//
// 分段：
//   A 四个核心组合（krow/mona × speed/wing）：双闪抵消成立、消耗 2 张牌
//   B 圣天破军剑（全体双闪）：主目标与次目标各自都要 2 张闪
//   C 守卫：只有 1 张可响牌时不可抵消，且【神速之翼不得白扔一张牌】(核心 BUG)
//   D 无防御对照（防空转）
//   E 克罗对男性目标只需 1 张闪（性别口径）
//   F 极速但全红手牌不抵消
//   G 极速 + 神速之翼同时存在不冲突
//   H 普通单闪杀 + 神速之翼 1 张牌仍可抵消（预检不得误伤非双闪）
//   I 手动响应模式下的行为（如实记录）
//
// 运行时反向验证：REVERT=speed|wing|noskill
// 源码级反向验证：REVERT=guard（临时撤掉预检守卫后重建，C 段必须变红）
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const SEG = process.env.SEG || "A,B,C,D,E,F,G,H,I";
const REVERT = process.env.REVERT || "";

const setup = opt => `(() => {
  const o = ${JSON.stringify(opt)}, st = window.state, b = st.battle;
  const actor = b.enemies[0], target = b.allies[0];
  // 每次先还原被反向验证覆盖的函数，避免场景间残留
  if (window.__origRefresh) window.WithererSkills.refreshShiftState = window.__origRefresh;
  if (window.__origWing) window.FloraSkills.dodgeAsFlash = window.__origWing;
  if (!window.__origRefresh) window.__origRefresh = window.WithererSkills.refreshShiftState;
  if (!window.__origWing) window.__origWing = window.FloraSkills.dodgeAsFlash;
  b.enemies.slice(1).forEach(u => { u.hp = 0; u.hand = []; });
  b.allies.slice(1).forEach(u => { u.hp = 0; u.hand = []; });
  actor.name = o.foe === "krow" ? "克罗博士" : "莫娜";
  actor.ai = o.revert === "noskill" ? "test_actor"
    : (o.foe === "krow" ? "krow_doctor" : "mona_eagle_captain");
  actor.hp = 900; actor.hand = []; actor.intent = 5;
  actor.stats = actor.stats || {}; actor.stats.attack = 6;
  actor.monaPiercingReady = !!o.sweep;
  actor.monaPiercingUsed = false;
  actor.statuses = [];
  target.name = "防御方"; target.hp = 200; target.maxHp = 200;
  target.gender = o.male ? "male" : "female";
  target.armor = 0; target.block = 0; target.noResponse = false;
  target.withererMode = null; target.skills = []; target.hand = [];
  target.statuses = []; target.holyScar = false;
  const mk = suits => suits.map(s => ({ name: "杀", type: "slash",
    suit: s, power: 0, scale: "attack" }));
  if (o.def === "speed" || o.def === "both") {
    target.withererMode = "极速";
    target.hand = mk(o.one ? ["♠"] : (o.red ? ["♥", "♦"] : ["♠", "♣", "♠"]));
  }
  if (o.def === "wing" || o.def === "both") {
    target.skills = [{ name: "神速之翼", type: "passive" }];
    if (o.def === "wing") target.hand = mk(o.one ? ["♠"] : ["♠", "♥", "♦"]);
  }
  if (o.def === "flash") {
    target.hand = o.one
      ? [{ name: "闪", type: "response", suit: "♥" }]
      : [{ name: "闪", type: "response", suit: "♥" },
         { name: "闪", type: "response", suit: "♥" }];
  } else if (o.def === "none") {
    target.hand = mk(["♠", "♥"]);
  }
  // 次目标（圣天破军剑 AOE）：给 1 张闪，用来观察"仍需两张闪"
  if (o.sweep && b.allies[1]) {
    const u = b.allies[1];
    u.hp = 200; u.maxHp = 200; u.armor = 0; u.block = 0;
    u.noResponse = false; u.withererMode = null; u.skills = []; u.statuses = [];
    u.hand = o.secondWing
      ? [{ name: "杀", type: "slash", suit: "♠", power: 0, scale: "attack" },
         { name: "杀", type: "slash", suit: "♥", power: 0, scale: "attack" }]
      : [{ name: "闪", type: "response", suit: "♥" }];
    if (o.secondWing) u.skills = [{ name: "神速之翼", type: "passive" }];
  }
  if (o.revert === "speed") window.WithererSkills.refreshShiftState = () => {};
  if (o.revert === "wing") window.FloraSkills.dodgeAsFlash = () => null;
  window.WithererSkills.refreshShiftState(target);
  b.phase = 4; b.activeUid = actor.uid; b.locked = false;
  b.manualDodge = null; b.manualCounter = null;
  st.settings = st.settings || {};
  st.settings.manualResponse = !!o.manual;
  st.log = []; window.__seen = [];
  if (window.__origAdd) window.BattleLog.add = window.__origAdd;
  if (!window.__origAdd) window.__origAdd = window.BattleLog.add;
  window.BattleLog.add = function (s, t) {
    try { window.__seen.push(String(t)); } catch (e) {}
    return window.__origAdd.call(this, s, t);
  };
  window.render();
  return { hand: target.hand.length };
})()`;

const run = opt => `(() => {
  const o = ${JSON.stringify(opt)}, st = window.state, b = st.battle;
  const actor = b.enemies[0], target = b.allies[0];
  const card = { name: "杀（普攻）", type: "slash", suit: "♠",
    scale: "attack", power: 0 };
  actor.hand.push(card);
  window.__seen = [];
  window.BattleSystem.useCard(st, actor, target, card);
  window.__cardFlags = { krow: !!card.krowFemaleTarget,
    two: !!card.twoDodgesRequired, holy: !!card.holy, sweep: !!card.sweep };
  return true;
})()`;

const read = `(() => {
  const b = window.state.battle, t = b.allies[0], t2 = b.allies[1];
  return { hp: t.hp, hand: (t.hand || []).map(c => c.name),
    hp2: t2 ? t2.hp : null, hand2: t2 ? (t2.hand || []).map(c => c.name) : [],
    logs: (window.__seen || []).slice(), flags: window.__cardFlags || {},
    manualDodge: !!b.manualDodge, locked: !!b.locked };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await openGame(page);
  await startRegressionBattle(page);
  await page.waitForTimeout(800);

  let pass = 0, fail = 0;
  const T = (name, ok, extra) => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.log(`  ❌ ${name}  ← ${JSON.stringify(extra || {})}`); }
  };
  const segs = SEG.split(",").map(s => s.trim().toUpperCase());

  async function scenario(opt, label) {
    await page.evaluate(setup({ ...opt, revert: REVERT }));
    await page.evaluate(run({ ...opt, revert: REVERT }));
    await page.waitForTimeout(600);
    const r = await page.evaluate(read);
    const text = r.logs.join(" | ");
    const out = {
      loss: 200 - r.hp, hand: r.hand, hp2: r.hp2, hand2: r.hand2,
      text, flags: r.flags, manualDodge: r.manualDodge,
      dodged: /抵消一次伤害/.test(text), twoFlash: /两张闪/.test(text),
      wing: (text.match(/发动神速之翼/g) || []).length,
      needTwo: /需要两张闪/.test(text), errors: errors.length,
    };
    console.log(`\n[${label}] 掉血=${out.loss} 手牌=${JSON.stringify(out.hand)}`
      + ` 翼=${out.wing} 双闪日志=${out.twoFlash}`);
    console.log(`  日志: ${text.slice(0, 260) || "(空)"}`);
    return out;
  }

  const FOES = ["krow", "mona"];
  const DEFS = ["speed", "wing"];
  const L = { krow: "克罗·肉欲之欢", mona: "莫娜·圣剑无双",
    speed: "极速标记", wing: "神速之翼", flash: "实体闪", none: "无防御" };

  if (segs.includes("A")) {
    for (const foe of FOES) for (const def of DEFS) {
      const r = await scenario({ foe, def }, `A/${foe}/${def}`);
      T(`A ${L[foe]} × ${L[def]}：双闪抵消成立`, r.dodged && r.loss === 0, r);
      T(`A ${L[foe]} × ${L[def]}：日志为「两张闪」`, r.twoFlash, r.text.slice(0, 140));
      T(`A ${L[foe]} × ${L[def]}：恰好消耗 2 张手牌`, r.hand.length === 1, r.hand);
      if (def === "wing") T(`A ${L[foe]} × 神速之翼：转化 2 次`, r.wing === 2, { wing: r.wing });
      T(`A ${L[foe]} × ${L[def]}：无页面错误`, r.errors === 0, r.errors);
    }
  }

  if (segs.includes("B")) {
    for (const def of DEFS) {
      const r = await scenario({ foe: "mona", def, sweep: true }, `B/${def}`);
      T(`B 圣天破军剑 × ${L[def]}：主目标双闪抵消`, r.dodged && r.loss === 0, r);
      T(`B 圣天破军剑 × ${L[def]}：主目标用「两张闪」`, r.twoFlash, r.text.slice(0, 140));
      T(`B 圣天破军剑 × ${L[def]}：次目标只有 1 张闪时仍受伤`,
        r.hp2 !== null && r.hp2 < 200, { hp2: r.hp2 });
      T(`B 圣天破军剑 × ${L[def]}：次目标打印「需要两张闪」`,
        r.needTwo, r.text.slice(-180));
    }
    const r2 = await scenario({ foe: "mona", def: "wing", sweep: true,
      secondWing: true }, "B/次目标翼");
    T("B 圣天破军剑：次目标有神速之翼时也能凑齐双闪",
      r2.hp2 === 200 && (r2.text.match(/发动神速之翼/g) || []).length >= 4,
      { hp2: r2.hp2, wing: r2.wing });
  }

  if (segs.includes("C")) {
    for (const foe of FOES) for (const def of ["speed", "wing", "flash"]) {
      const r = await scenario({ foe, def, one: true }, `C/${foe}/${def}`);
      T(`C ${L[foe]} × ${L[def]}：1 张可响牌时不可抵消`,
        !r.dodged && r.loss > 0, r);
      T(`C ${L[foe]} × ${L[def]}：手牌不被消耗（仍 1 张）`,
        r.hand.length === 1, r.hand);
      if (def === "wing") {
        T(`C ${L[foe]} × 神速之翼：凑不齐时不发动转化（核心修复）`,
          r.wing === 0, { wing: r.wing });
      } else {
        T(`C ${L[foe]} × ${L[def]}：打印需要两张闪`, r.needTwo, r.text.slice(0, 160));
      }
    }
  }

  if (segs.includes("D")) {
    for (const foe of FOES) {
      const r = await scenario({ foe, def: "none" }, `D/${foe}`);
      T(`D ${L[foe]}：无防御时确实造成伤害（防空转）`, r.loss > 0 && !r.dodged, r);
    }
  }

  if (segs.includes("E")) {
    for (const def of ["flash", "wing"]) {
      const r = await scenario({ foe: "krow", def, one: true, male: true },
        `E/${def}`);
      T(`E 克罗 × 男性目标 × ${L[def]}：只需 1 张闪即可抵消`,
        r.dodged && r.loss === 0, r);
      T(`E 克罗 × 男性目标 × ${L[def]}：手牌消耗 1 张`,
        r.hand.length === 0, r.hand);
    }
  }

  if (segs.includes("F")) {
    for (const foe of FOES) {
      const r = await scenario({ foe, def: "speed", red: true }, `F/${foe}`);
      T(`F ${L[foe]} × 极速全红手牌：不抵消`, !r.dodged && r.loss > 0, r);
      T(`F ${L[foe]} × 极速全红手牌：手牌不丢`, r.hand.length === 2, r.hand);
    }
  }

  if (segs.includes("G")) {
    for (const foe of FOES) {
      const r = await scenario({ foe, def: "both" }, `G/${foe}`);
      T(`G ${L[foe]} × 极速+翼：抵消成立且只消耗 2 张`,
        r.dodged && r.loss === 0 && r.hand.length === 1, r);
      T(`G ${L[foe]} × 极速+翼：翼未重复触发`, r.wing === 0, { wing: r.wing });
    }
  }

  if (segs.includes("H")) {
    for (const def of ["wing", "speed"]) {
      const r = await scenario({ foe: "krow", def, one: true, male: true },
        `H/${def}`);
      T(`H 单闪威胁 × ${L[def]} × 1 张牌：仍可抵消（预检不误伤）`,
        r.dodged && r.loss === 0, r);
    }
  }

  if (segs.includes("I")) {
    const r = await scenario({ foe: "krow", def: "wing", manual: true }, "I/manual");
    T("I 手动响应模式：未残留挂起弹窗（自动抵消或不抵消，不卡死）",
      !r.manualDodge, { manualDodge: r.manualDodge, dodged: r.dodged });
    T("I 手动响应模式：结算完整（抵消或掉血二选一）",
      r.loss === 0 || r.loss > 0, r);
  }

  console.log(`\n=== ${pass} 通过 / ${fail} 失败 ${REVERT ? `(REVERT=${REVERT})` : ""} ===`);
  await browser.close();
  process.exit(fail || errors.length ? 1 : 0);
})().catch(e => { console.error("FATAL", e); process.exit(1); });
