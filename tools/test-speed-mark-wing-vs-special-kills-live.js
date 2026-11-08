// 严格检查：凋零者【极速标记】与芙萝娅【神速之翼】能否抵消三类特殊杀
//   威胁牌：坦克炮弹（AOE 技能牌 / 双闪）、虚拟杀（杀欲窥视临时牌）、转换杀（convertAs）
//   防御侧：极速标记 = 黑色手牌当【闪】；神速之翼 = 任意手牌当【闪】
// 分段：A 极速×3  B 神速之翼×3  C 无防御对照（防"伤害根本没发出"的空转）
//       D 双闪守卫（只有 1 张可响牌时炮弹不应被抵消）
//       E 攻击方极速：黑色虚拟杀/转换杀带 ignoreResponse，属设计而非 BUG
//       G 极速但全红手牌（负向对照：只有黑牌可转化）
// 运行时反向验证：REVERT=speed|wing|needsResponse 禁用对应机制，确认断言会变红
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const SEG = process.env.SEG || "A,B,C,D,E,G";
const REVERT = process.env.REVERT || "";
const CARDS = {
  shell: { name: "坦克炮弹", type: "skill", sweep: true, targetless: true,
    virtual: true, scale: "attack", responseKind: "dodge", twoDodgesRequired: true },
  virtual: { name: "杀（普攻）", type: "slash", suit: "♠", virtual: true,
    scale: "attack", noIntentCost: true, withererPeekSlash: true,
    generatedBySkill: "杀欲窥视" },
  converted: { name: "刺杀", type: "slash", suit: "♠",
    convertedFrom: "杀（普攻）", scale: "attack" },
};
const LABEL = { shell: "坦克炮弹", virtual: "虚拟杀", converted: "转换杀" };

const setupTpl = opt => `(() => {
  const o = ${JSON.stringify(opt)}, st = window.state, b = st.battle;
  const actor = b.enemies[0], target = b.allies[0];
  if (o.revert === "speed") window.WithererSkills.refreshShiftState = () => {};
  if (o.revert === "wing") window.FloraSkills.dodgeAsFlash = () => null;
  b.enemies.slice(1).forEach(u => { u.hp = 0; u.hand = []; });
  b.allies.slice(1).forEach(u => { u.hp = 0; u.hand = []; });
  // 默认敌人是机械哥布林（ai=goblin），命中后会触发激光射线消耗防御方手牌，
  // 会污染「手牌守恒」判据。换掉 ai 以隔离该命中后副作用。
  actor.name = "攻击方"; actor.ai = "test_actor"; actor.hp = 900; actor.hand = [];
  actor.stats = actor.stats || {}; actor.stats.attack = 5;
  target.name = "防御方"; target.hp = 200; target.maxHp = 200;
  target.armor = 0; target.block = 0; target.noResponse = false;
  target.withererMode = null; target.skills = []; target.hand = [];
  const mk = suits => suits.map(s => ({ name: "杀", type: "slash",
    suit: s, power: 0, scale: "attack" }));
  if (o.def === "speed") {
    target.withererMode = "极速";
    target.hand = mk(o.red ? ["♥", "♦"] : o.one ? ["♠"] : ["♠", "♣", "♠"]);
  } else if (o.def === "wing") {
    target.skills = [{ name: "神速之翼", type: "passive" }];
    target.hand = mk(o.one ? ["♠"] : ["♠", "♥", "♦"]);
  } else target.hand = mk(["♠", "♥"]);
  if (o.def === "speed") window.WithererSkills.refreshShiftState(target);
  b.phase = 4; b.activeUid = actor.uid; b.locked = false;
  b.manualDodge = null; b.manualCounter = null;
  st.settings = st.settings || {}; st.settings.manualResponse = false;
  st.log = []; window.__seen = [];
  if (!window.__origAdd) window.__origAdd = window.BattleLog.add;
  window.BattleLog.add = function (s, t) {
    try { window.__seen.push(String(t)); } catch (e) {}
    return window.__origAdd.call(this, s, t);
  };
  window.render();
  return { hp: target.hp, hand: target.hand.length };
})()`;

const runTpl = opt => `(() => {
  const o = ${JSON.stringify(opt)}, st = window.state, b = st.battle;
  const actor = b.enemies[0], target = b.allies[0];
  const card = ${JSON.stringify(CARDS[opt.atk])};
  if (o.revert === "needsResponse") delete card.responseKind;
  window.__seen = [];
  window.BattleSystem.damage(st, target, 6, "测试伤害", actor, card);
  return true;
})()`;

const readTpl = `(() => {
  const b = window.state.battle, t = b.allies[0];
  return { hp: t.hp, hand: (t.hand || []).map(c => c.name),
    logs: (window.__seen || []).slice() };
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
    await page.evaluate(setupTpl(opt));
    await page.evaluate(runTpl(opt));
    await page.waitForTimeout(700);
    const r = await page.evaluate(readTpl);
    const text = r.logs.join(" | ");
    const loss = 200 - r.hp;
    const dodged = /抵消一次伤害/.test(text);
    const wing = /发动神速之翼/.test(text);
    const speedUsed = /闪/.test(text) && dodged;
    console.log(`\n[${label}] 掉血=${loss} 手牌=${JSON.stringify(r.hand)}`);
    console.log(`  日志: ${text.slice(0, 220) || "(空)"}`);
    return { loss, dodged, wing, speedUsed, text,
      hand: r.hand || [], errors: errors.length };
  }

  for (const atk of Object.keys(CARDS)) {
    if (!segs.includes("A")) break;
    const r = await scenario({ def: "speed", atk, revert: REVERT }, `A/${atk}`);
    const need = atk === "shell" ? 2 : 1;
    T(`A ${LABEL[atk]}：极速标记触发抵消`, r.dodged && r.loss === 0, r);
    T(`A ${LABEL[atk]}：抵消用了转化闪`, r.speedUsed, r.text.slice(0, 120));
    T(`A ${LABEL[atk]}：黑牌确实作为闪离手（3-${need}）`,
      r.hand.length === 3 - need, r.hand);
    T(`A ${LABEL[atk]}：无页面错误`, r.errors === 0, r.errors);
  }
  for (const atk of Object.keys(CARDS)) {
    if (!segs.includes("B")) break;
    const r = await scenario({ def: "wing", atk, revert: REVERT }, `B/${atk}`);
    const need = atk === "shell" ? 2 : 1;
    const calls = (r.text.match(/发动神速之翼/g) || []).length;
    T(`B ${LABEL[atk]}：神速之翼被触发`, r.wing, r.text.slice(0, 120));
    T(`B ${LABEL[atk]}：伤害被抵消`, r.dodged && r.loss === 0, r);
    T(`B ${LABEL[atk]}：手牌按 ${need} 张被转化`, r.hand.length === 3 - need, r.hand);
    T(`B ${LABEL[atk]}：神速之翼转化 ${need} 次`, calls === need, { calls });
    T(`B ${LABEL[atk]}：无页面错误`, r.errors === 0, r.errors);
  }
  for (const atk of Object.keys(CARDS)) {
    if (!segs.includes("C")) break;
    const r = await scenario({ def: "none", atk, revert: REVERT }, `C/${atk}`);
    T(`C ${LABEL[atk]}：无防御时确实造成伤害（防空转）`, r.loss > 0, r);
    T(`C ${LABEL[atk]}：无防御时不出现抵消`, !r.dodged, r.text.slice(0, 120));
  }
  if (segs.includes("D")) {
    const r = await scenario({ def: "speed", atk: "shell", one: true, revert: REVERT }, "D/单闪");
    T("D 炮弹只有 1 张可响牌时不可抵消", r.loss > 0 && !r.dodged, r);
    T("D 打印需要两张闪", /需要两张闪/.test(r.text), r.text.slice(0, 140));
  }
  if (segs.includes("E")) {
    // 攻击方极速：黑牌 prepareSpeedCard 打 ignoreResponse，防御方有实体闪也不该抵消
    const r = await page.evaluate(`(() => {
      const st = window.state, b = st.battle, a = b.enemies[0], t = b.allies[0];
      a.withererMode = "极速"; t.withererMode = null; t.skills = [];
      t.hand = [{ name: "闪", type: "response", suit: "♥" }];
      t.hp = 200; b.locked = false; window.__seen = [];
      const card = { name: "杀（普攻）", type: "slash", suit: "♠", virtual: true,
        scale: "attack", noIntentCost: true, withererPeekSlash: true,
        generatedBySkill: "杀欲窥视" };
      window.WithererSkills.prepareSpeedCard(st, a, card);
      window.__ignore = !!card.ignoreResponse;
      window.BattleSystem.damage(st, t, 6, "测试伤害", a, card);
      return true;
    })()`);
    await page.waitForTimeout(700);
    const out = await page.evaluate(`(() => ({
      ignore: window.__ignore, hp: window.state.battle.allies[0].hp,
      logs: (window.__seen || []).slice() }))()`);
    T("E 攻击方极速给黑色虚拟杀打 ignoreResponse（设计）", out.ignore === true, out);
    T("E 该牌因此不可被实体闪抵消", out.hp < 200, out);
  }

  if (segs.includes("G")) {
    // 极速标记只认黑色手牌：全红手牌时即便处于极速也不该有可响应牌
    for (const atk of Object.keys(CARDS)) {
      const r = await scenario({ def: "speed", atk, red: true, revert: REVERT }, `G/${atk}`);
      T(`G ${LABEL[atk]}：极速但全红手牌不抵消`, r.loss > 0 && !r.dodged, r);
    }
  }

  console.log(`\n=== ${pass} 通过 / ${fail} 失败 ${REVERT ? `(REVERT=${REVERT})` : ""} ===`);
  await browser.close();
  process.exit(fail || errors.length ? 1 : 0);
})().catch(e => { console.error("FATAL", e); process.exit(1); });
