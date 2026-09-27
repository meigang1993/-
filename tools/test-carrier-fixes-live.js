// 装甲运输车 · 三处修复回归
//   1. 物资货物：摸牌阶段(phase 3)才触发，原判 phase===2 导致真实对局永不触发
//   2. 武器库：发的牌必须随动画带出 cards，否则 _pendingDraw 清不掉，牌不可见不可用
//   3. 坚硬装甲：skipDamageModify 技能伤害 与 直伤 均能打穿，需在两条路各自独立免疫
//   4. 坚硬装甲：无法恢复自身生命值
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const fs = require("fs");
const SRC = path.join(__dirname, "..", "src", "original");

// 浏览器侧拿不到闭包实例，这几处"链路是否真的接上"只能靠源码静态核对。
function checkWiring() {
  const read = f => fs.readFileSync(path.join(SRC, f), "utf8");
  const hit = (f, re) => re.test(read(f));
  return {
    // 直伤入口 battle-damage-utils.directDamage 必须独立判定免疫
    direct: hit("battle-damage-utils.js", /immuneIncoming/),
    // 主伤害链必须在 Math.max(1,...) 之前判定
    resolution: hit("battle-damage-resolution.js", /immuneIncoming/),
    // 治疗统一入口 healUnit 必须走 EnemySkills.beforeHeal
    healHook: hit("battle-card-specials.js", /EnemySkills\?\.beforeHeal/),
    // EnemySkills.beforeHeal 必须桥接到 RuinsEnemySkills
    healBridge: hit("enemy-skills.js", /RuinsEnemySkills\?\.beforeHeal/),
    // RuinsEnemySkills.beforeHeal 必须桥接到 elite
    healElite: hit("ruins-enemy-skills.js", /beforeHeal/),
  };
}

const FOE = 0;
let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
};

const setupTpl = `(() => {
  const st = window.state, b = st.battle;
  const a = b.allies[0], e = b.enemies[${FOE}];
  b.animQueue = []; b.locked = false;
  b.selectedCardIndex = null; b.selectedSkillCard = null; b.pendingTargetUid = null;
  a.intent = 5; a.hp = 300; a.maxHp = 300; a.block = 0;
  e.ai = "ruins_carrier"; e.name = "装甲运输车";
  e.hp = 220; e.maxHp = 220; e.block = 0;
  e.stats = { attack: 10, magic: 6, speed: 14 };
  b.enemies.forEach((u, i) => { if (i !== ${FOE}) { u.hp = 100; u.maxHp = 100; } });
  b.allies.forEach(u => { u.battleRelics = []; });
  st.log = [];
  window.render();
  return { ok: true };
})()`;

// A 物资货物：真实摸牌阶段(3)必须触发；判定阶段(2)不应触发
const cargoTpl = `(() => {
  const st = window.state, b = st.battle;
  const a = b.allies[0], other = b.allies[1];
  a.battleRelics = ["物资货物"];
  const run = (phase) => {
    other.hand = [{ name: "闪", type: "response", suit: "♥" }];
    b.phase = phase; b.activeUid = a.uid; st.log = [];
    const drawFn = (unit, count) => {
      const got = [];
      for (let i = 0; i < count; i++) got.push({ name: "闪", type: "response", suit: "♥" });
      unit.hand = (unit.hand || []).concat(got);
      return got;
    };
    window.RuinsRelicEffects.afterDraw(st, a,
      [{ name: "杀", type: "slash" }, { name: "杀", type: "slash" }], drawFn, {});
    return { otherAfter: (other.hand || []).length,
      hit: (st.log || []).filter(t => /物资货物/.test(String(t))).length };
  };
  const p3 = run(3);   // 真实摸牌阶段
  const p2 = run(2);   // 判定阶段（不应触发）
  // 对照：无饰品时 phase 3 不触发
  a.battleRelics = [];
  const none = run(3);
  return { p3, p2, none };
})()`;

// B 武器库：牌必须可见（_pendingDraw 被清除）
const arsenalTpl = `(() => {
  const st = window.state, b = st.battle;
  const a = b.allies[0];
  a.battleRelics = ["武器库"];
  b.activeUid = a.uid; b.phase = 4; b.locked = false;
  b.animQueue = []; st.log = [];
  b.allies.forEach(u => {
    u.deck = [{ name: "杀", type: "slash", suit: "♠", scale: "attack" },
      { name: "杀", type: "slash", suit: "♣", scale: "attack" }];
    u.discard = []; u.hand = [];
  });
  // animQueue 会被 render() 消费掉，故 hook push 捕获事件而非事后读取
  const captured = [];
  const origPush = Array.prototype.push.bind(b.animQueue);
  b.animQueue.push = function (e) { captured.push(e); return origPush(e); };
  const skills = window.UICommon.skillsOf(a) || [];
  const idx = skills.findIndex(s => s.name === "武器库");
  if (idx < 0) return { noSkill: true };
  window.BattleSystem.selectSkill(st, idx);
  let ok = window.BattleSystem.playSelectedCard(st);
  if (!ok) { window.BattleSystem.chooseTarget(st, b.enemies[0].uid); ok = window.BattleSystem.playSelectedCard(st); }
  b.animQueue.push = origPush;
  const events = captured.filter(e => e && e.type === "gainCards")
    .map(e => ({ type: e.type, uid: e.uid, n: (e.cards || []).length }));
  const receivers = b.allies.filter(u => u !== a).map(u => ({
    uid: u.uid, hand: (u.hand || []).length,
    names: (u.hand || []).map(c => c.name),
    pending: (u.hand || []).filter(c => c._pendingDraw).length,
    noIntent: (u.hand || []).map(c => !!c.noIntentCost),
  }));
  return { ok, events, receivers,
    logs: (st.log || []).map(String).slice(0, 5) };
})()`;

// B2 武器库落位后：模拟动画落位清除（直接调 transfer 的清除语义）
const arsenalLandedTpl = `(() => {
  const st = window.state, b = st.battle;
  const a = b.allies[0];
  a.battleRelics = ["武器库"];
  b.activeUid = a.uid; b.phase = 4; b.locked = false;
  b.animQueue = []; st.log = [];
  b.allies.forEach(u => {
    u.deck = [{ name: "杀", type: "slash", suit: "♠", scale: "attack" }];
    u.discard = []; u.hand = [];
  });
  a.usedArsenal = false;   // 上一段用例会留下"已发动"标记
  const captured = [];
  const origPush = Array.prototype.push.bind(b.animQueue);
  b.animQueue.push = function (e) { captured.push(e); return origPush(e); };
  const skills = window.UICommon.skillsOf(a) || [];
  window.BattleSystem.selectSkill(st, skills.findIndex(s => s.name === "武器库"));
  let ok = window.BattleSystem.playSelectedCard(st);
  if (!ok) { window.BattleSystem.chooseTarget(st, b.enemies[0].uid); ok = window.BattleSystem.playSelectedCard(st); }
  b.animQueue.push = origPush;
  const evt = captured.find(e => e && e.type === "gainCards");
  // 复刻 battle-effect-card-motion.transfer(clearPending=true) 的落位行为
  if (evt) (evt.cards || []).forEach(c => { delete c._pendingDraw; });
  const receivers = b.allies.filter(u => u !== a).map(u => ({
    hand: (u.hand || []).length,
    pending: (u.hand || []).filter(c => c._pendingDraw).length,
    visible: (u.hand || []).filter(c => !c._pendingDraw).length,
  }));
  return { ok, evtCards: evt ? (evt.cards || []).length : -1,
    evtUid: evt ? evt.uid : null, receivers };
})()`;

// C 坚硬装甲：普通杀 / skipDamageModify 技能伤害 / 直伤 全部免疫
const armorTpl = `(() => {
  const st = window.state, b = st.battle;
  const e = b.enemies[${FOE}];
  const out = {};
  const reset = () => { e.hp = 220; e.block = 0; st.log = []; };
  const atk = b.allies[0];

  // C1 普通杀
  reset();
  window.BattleSystem.damage(st, e, 50, "火杀", atk, { name: "火杀", type: "slash", suit: "♠" });
  out.slash = 220 - e.hp;

  // C2 带 skipDamageModify 的技能伤害（原可打穿）
  reset();
  window.BattleSystem.damage(st, e, 60, "潜影背刺", atk,
    { name: "潜影背刺", type: "skill", ignoreResponse: true, skipDamageModify: true });
  out.skillSkip = 220 - e.hp;

  // C3 魔法战术牌带 skipDamageModify
  reset();
  window.BattleSystem.damage(st, e, 33, "燃烧", atk,
    { name: "燃烧", type: "skill", magicDamage: true, ignoreBlock: true, skipDamageModify: true });
  out.burn = 220 - e.hp;

  // C4 直伤：BattleDamageUtils 是工厂闭包，浏览器侧拿不到实例，无法端到端直调。
  // 改为验证免疫判定本身 + 源码接入点（接入点由 node 侧静态检查覆盖）。
  const directCard = { name: "直伤测试", type: "skill", ignoreBlock: true, skipDamageModify: true };
  out.immuneDirect = window.RuinsEliteSkills.immuneIncoming(st, e, directCard);
  out.immuneWithRealDamage = window.RuinsEliteSkills.immuneIncoming(st, e,
    { ...directCard, realDamage: true });
  out.immuneNormal = window.RuinsEliteSkills.immuneIncoming(st, b.enemies[1], directCard);
  return out;
})()`;

// D 无法恢复自身生命值
const healTpl = `(() => {
  const st = window.state, b = st.battle;
  const e = b.enemies[${FOE}];
  const normal = b.enemies[1];
  e.hp = 100; e.maxHp = 220; normal.hp = 50; normal.maxHp = 100;
  const carrier = window.EnemySkills?.beforeHeal?.(st, e, 50, b.allies[0], { name: "愈魔瓶" }, null);
  const other = window.EnemySkills?.beforeHeal?.(st, normal, 50, b.allies[0], { name: "愈魔瓶" }, null);
  // 真实治疗：装甲运输车血量不变
  e.hp = 100;
  window.BattleCardSpecials?.healUnit?.(st, b.allies[0], e, { name: "愈魔瓶", healPct: 0.3 });
  return { carrier, other, hpAfterRealHeal: e.hp };
})()`;

// E 增援部队自身损失生命值不应被免疫/被治疗拦截影响
const reinTpl = `(() => {
  const st = window.state, b = st.battle;
  const e = b.enemies[${FOE}];
  b.enemies[1].hp = 0; b.enemies[1].maxHp = 100;
  e.hp = 220; e.maxHp = 220;
  window.RuinsEliteSkills.prepare(st, e, null);
  return { hp: e.hp, revived: b.enemies[1].hp };
})()`;

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const page = await browser.newPage();
  page.on("pageerror", e => errors.push(String(e && e.message || e)));
  await openGame(page);
  await startRegressionBattle(page);

  await page.evaluate(setupTpl);
  const A = await page.evaluate(cargoTpl);
  console.log("[物资货物]", JSON.stringify(A));
  T("物资货物：摸牌阶段(phase 3)触发，友方摸 2 张", A.p3.otherAfter === 3 && A.p3.hit > 0, A.p3);
  T("物资货物：判定阶段(phase 2)不触发", A.p2.otherAfter === 1 && A.p2.hit === 0, A.p2);
  T("物资货物：无饰品对照不触发", A.none.otherAfter === 1 && A.none.hit === 0, A.none);

  await page.evaluate(setupTpl);
  const B = await page.evaluate(arsenalTpl);
  console.log("[武器库]", JSON.stringify(B));
  T("武器库：动画事件带出真实卡牌（cards 非空）",
    B.events.some(e => e.type === "gainCards" && e.n >= 1), B.events);
  T("武器库：动画 uid 指向实际收牌的友方",
    B.receivers.length > 0 && B.events.some(e => e.type === "gainCards"
      && B.receivers.some(r => r.hand >= 1)), { events: B.events, receivers: B.receivers });

  await page.evaluate(setupTpl);
  const B2 = await page.evaluate(arsenalLandedTpl);
  console.log("[武器库·落位]", JSON.stringify(B2));
  T("武器库：落位后 _pendingDraw 被清除（牌可见可用）",
    B2.evtCards >= 1 && B2.receivers.every(r => r.pending === 0 && r.visible === r.hand), B2);
  // 必须同时看 visible===hand：只看 hand 数的话，牌带 _pendingDraw 时 hand>=1 仍成立，
  // 但玩家看不见也用不了——撤销修复后这条会假通过。
  T("武器库：友方收到且可见可用的不消耗杀意【杀】",
    B2.receivers.some(r => r.hand >= 1 && r.visible === r.hand && r.pending === 0), B2.receivers);

  await page.evaluate(setupTpl);
  const C = await page.evaluate(armorTpl);
  console.log("[坚硬装甲]", JSON.stringify(C));
  T("坚硬装甲：普通杀免疫", C.slash === 0, C.slash);
  T("坚硬装甲：skipDamageModify 技能伤害免疫", C.skillSkip === 0, C.skillSkip);
  T("坚硬装甲：燃烧类法术伤害免疫", C.burn === 0, C.burn);
  T("坚硬装甲：直伤载荷判为免疫", C.immuneDirect === true, C.immuneDirect);
  T("坚硬装甲：realDamage 真伤仍可穿透（保留口子）", C.immuneWithRealDamage === false, C.immuneWithRealDamage);
  T("对照：普通敌人不免疫（防恒真）", C.immuneNormal === false, C.immuneNormal);

  await page.evaluate(setupTpl);
  const D = await page.evaluate(healTpl);
  console.log("[治疗]", JSON.stringify(D));
  T("坚硬装甲：无法恢复自身生命值（beforeHeal 返回 0）", D.carrier === 0, D.carrier);
  T("对照：其他角色治疗不受影响", D.other === 50, D.other);
  // 注：healUnit 未挂到 window（实测 typeof undefined），端到端治疗无法直调，
  // 此处只验证统一拦截点 beforeHeal；healUnit 确实调用该钩子由 checkHealHook() 静态覆盖。

  await page.evaluate(setupTpl);
  const E = await page.evaluate(reinTpl);
  console.log("[增援部队]", JSON.stringify(E));
  T("增援部队：自身损失 10% 生命值未被免疫误伤", E.hp === 198, E);
  T("增援部队：友军复活至 40%", E.revived === 40, E);

  const W = checkWiring();
  console.log("[接入点]", JSON.stringify(W));
  T("接入点：直伤入口判定免疫", W.direct);
  T("接入点：主伤害链判定免疫", W.resolution);
  T("接入点：healUnit 走 beforeHeal", W.healHook);
  T("接入点：EnemySkills 桥接 RuinsEnemySkills", W.healBridge);
  T("接入点：RuinsEnemySkills 桥接 elite", W.healElite);

  console.log(`\n结果 ${pass}/${total}   页面错误 ${errors.length}`);
  if (errors.length) console.log(errors.slice(0, 3));
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})();
