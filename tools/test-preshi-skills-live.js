// 普雷希 全技能 · 严格实战回归
//   ⭐ 女王威压：锁定技，使用的牌指定敌方角色为目标时，若手牌数大于该角色，其不可响应；
//                若手牌数为全场最多，造成与受到的伤害均为 2 倍（只有实体牌才触发，
//                技能伤害 / 技能生成的牌 / 虚拟牌一律不翻倍）。
//   ⚔️ 女王榨取：出牌阶段限一次，指定我方一名男性角色，对其造成等同于魔力值的伤害，
//                弃置其所有手牌，然后摸等量的牌。
//
// 断言实际效果：血量真的掉、手牌真的清空、真的摸到等量牌、伤害真的翻倍。
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startFreshGame, startRegressionBattle, dismissOpeningStory, collectErrors, relevantErrors } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
};

// 把我方 0 号改造成普雷希（魔力固定为 4，便于核对伤害），1 号改造成我方男性
const setupTpl = (preshiHand, allyHand) => `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false;
  const p = b.allies[0], m = b.allies[1];
  p.name = "普雷希"; p.ref = "preshi"; p.id = "preshi"; p.gender = "female";
  p.stats = { attack: 3, magic: 4, speed: 3 };
  p.tempMagic = 0; p.tempAttack = 0; p.block = 0;
  p.hp = p.maxHp = 56;
  p.skills = [
    { name: "女王威压", type: "passive" },
    { name: "女王榨取", type: "active", card: { name: "女王榨取", type: "tactic", preshiDrain: true, allyTarget: true, icon: "⚔️", text: "指定我方一名男性角色。" } },
  ];
  p.usedPreshiDrain = false;
  p.hand = [];
  for (let i = 0; i < ${preshiHand}; i++) p.hand.push({ name: "闪", type: "basic", suit: "♠", uid: "ph" + i });
  m.name = "罗卡尔"; m.ref = "lokar"; m.id = "lokar"; m.gender = "male";
  m.hp = m.maxHp = 62; m.block = 0;
  m.hand = [];
  for (let i = 0; i < ${allyHand}; i++) m.hand.push({ name: "闪", type: "basic", suit: "♥", uid: "mh" + i });
  // 敌方只留少量手牌，保证普雷希为全场手牌最多
  b.enemies.forEach(e => { e.hand = []; e.hp = e.maxHp = 60; });
  st.log = [];
  window.render();
  return { ok: true, allies: b.allies.length, foes: b.enemies.length };
})()`;

// ── 女王榨取 ──────────────────────────────────────────────
const drainTpl = `(() => {
  const st = window.state, b = st.battle;
  const p = b.allies[0], m = b.allies[1];
  const beforeHp = m.hp;
  const beforeHand = p.hand.filter(c => !c._pendingDraw).length;
  const allyHand = m.hand.filter(c => !c._pendingDraw).length;
  const card = { name: "女王榨取", type: "tactic", preshiDrain: true, allyTarget: true, icon: "⚔️", text: "t", _skill: true };
  p.hand.push(card);
  window.BattleSystem.useCard(st, p, m, card);
  // 摸到的牌先以 _pendingDraw 挂在手上等飞行动画，故按手牌总长度计量。
  const drawn = p.hand.length - (beforeHand + 1);
  return {
    magic: p.stats.magic,
    hpLoss: beforeHp - m.hp,
    allyHand, allyLeft: m.hand.filter(c => !c._pendingDraw).length,
    drawn, used: !!p.usedPreshiDrain,
    logged: (st.log || []).some(l => String(l).includes("女王榨取")),
  };
})()`;

// 出牌阶段限一次：第二次不应再生效
const drainTwiceTpl = `(() => {
  const st = window.state, b = st.battle;
  const p = b.allies[0], m = b.allies[1];
  m.hp = 62; m.hand = [{ name: "闪", type: "basic", suit: "♥", uid: "x1" }];
  const card = { name: "女王榨取", type: "tactic", preshiDrain: true, allyTarget: true, icon: "⚔️", text: "t", _skill: true };
  p.hand.push(card);
  window.BattleSystem.useCard(st, p, m, card);
  return { hpLoss: 62 - m.hp, allyLeft: m.hand.filter(c => !c._pendingDraw).length };
})()`;

// ── 女王威压 · 不可响应 ──────────────────────────────────
const suppressTpl = `(() => {
  const st = window.state, b = st.battle;
  const p = b.allies[0], foe = b.enemies[0];
  foe.hand = [];
  const card = { name: "杀（普攻）", type: "slash", suit: "♠" };
  window.PreshiSkills.beforeCardPlayed(st, p, card, foe);
  const more = !!card.ignoreResponse;
  const card2 = { name: "杀（普攻）", type: "slash", suit: "♠" };
  for (let i = 0; i < 9; i++) foe.hand.push({ name: "闪", type: "basic", suit: "♥" });
  window.PreshiSkills.beforeCardPlayed(st, p, card2, foe);
  const fewer = !!card2.ignoreResponse;
  foe.hand = [];
  return { more, fewer };
})()`;

// ── 女王威压 · 伤害翻倍 ──────────────────────────────────
const doubleTpl = `(() => {
  const st = window.state, b = st.battle;
  const p = b.allies[0], foe = b.enemies[0];
  b.animQueue = []; b.locked = false;
  foe.hp = foe.maxHp = 60; foe.block = 0; foe.hand = [];
  p.hp = p.maxHp = 56; p.block = 0;
  const card = { name: "杀（普攻）", type: "slash", suit: "♠", ignoreResponse: true };
  // 造成的伤害翻倍
  window.BattleSystem.damage(st, foe, 10, "测试", p, card);
  const out = 60 - foe.hp;
  b.animQueue = []; b.locked = false;
  foe.hp = foe.maxHp = 60;
  // 受到的伤害翻倍
  window.BattleSystem.damage(st, p, 10, "测试", foe, { ...card });
  const inc = 56 - p.hp;
  return { out, inc, top: window.PreshiSkills.topHand(st, p) };
})()`;

// 手牌不是全场最多时不应翻倍
const noDoubleTpl = `(() => {
  const st = window.state, b = st.battle;
  const p = b.allies[0], foe = b.enemies[0];
  b.animQueue = []; b.locked = false;
  p.hand = [];
  foe.hand = [{ name: "闪", type: "basic", suit: "♥" }, { name: "闪", type: "basic", suit: "♥" }];
  foe.hp = foe.maxHp = 60; foe.block = 0;
  const card = { name: "杀（普攻）", type: "slash", suit: "♠", ignoreResponse: true };
  window.BattleSystem.damage(st, foe, 10, "测试", p, card);
  const out = 60 - foe.hp;
  foe.hand = [];
  return { out, top: window.PreshiSkills.topHand(st, p) };
})()`;

// ── 女王威压 · 只有实体牌才触发翻倍（规则层）──────────────
const verbRuleTpl = `(() => {
  const st = window.state;
  const p = st.battle.allies[0];
  const cases = {
    entity: { name: "杀（普攻）", type: "slash", suit: "♠" },
    skill: { name: "女王榨取", type: "skill" },
    virtual: { name: "杀（普攻）", type: "slash", suit: "♠", virtual: true },
    generated: { name: "杀（普攻）", type: "slash", suit: "♠", generatedBySkill: "x" },
    tacticSkill: { name: "女王榨取", type: "tactic", _skill: true },
    converted: { name: "杀（普攻）", type: "slash", suit: "♠", _skill: true, _entityConversion: true },
  };
  const out = {}, inc = {};
  Object.keys(cases).forEach(k => {
    out[k] = window.PreshiSkills.modifyOutgoingDamage(st, p, 10, cases[k]);
    inc[k] = window.PreshiSkills.modifyIncomingDamage(st, p, 10, cases[k]);
  });
  return { out, inc };
})()`;

// ── 女王威压 · 只有实体牌才触发翻倍（真实伤害链）─────────
const entityOnlyTpl = `(() => {
  const st = window.state, b = st.battle;
  const p = b.allies[0], foe = b.enemies[0];
  foe.hand = []; foe.skills = []; foe.ai = null; foe.block = 0;
  p.block = 0;
  const runOut = card => {
    b.animQueue = []; b.locked = false;
    foe.hp = foe.maxHp = 60;
    window.BattleSystem.damage(st, foe, 10, "测试", p, { ...card });
    return 60 - foe.hp;
  };
  const runInc = card => {
    b.animQueue = []; b.locked = false;
    p.hp = p.maxHp = 56;
    window.BattleSystem.damage(st, p, 10, "测试", foe, { ...card });
    return 56 - p.hp;
  };
  const entity = { name: "杀（普攻）", type: "slash", suit: "♠", ignoreResponse: true };
  const skillHit = { name: "女王榨取", type: "skill", ignoreResponse: true, skipDamageModify: true };
  const virtual = { name: "杀（普攻）", type: "slash", suit: "♠", virtual: true, ignoreResponse: true };
  const skillCard = { name: "女王榨取", type: "tactic", preshiDrain: true, _skill: true, ignoreResponse: true };
  return {
    entityOut: runOut(entity),
    skillOut: runOut(skillHit),
    virtualOut: runOut(virtual),
    skillCardOut: runOut(skillCard),
    entityInc: runInc(entity),
    skillInc: runInc(skillHit),
    top: window.PreshiSkills.topHand(st, p),
  };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  await dismissOpeningStory(page);

  // ── 解锁事件：首次击败机械AI龙后回到别墅触发 ──
  const pending = await page.evaluate(`(() => {
    const st = window.state;
    st.defeatedElites = ["mech_ai_dragon"];
    st.hallModal = null; st.flags = st.flags || {};
    st.flags.preshiUnlockSeen = false;
    const fired = window.NewCharacterUnlockEvents.triggerPending(st);
    window.render();
    return { fired, modal: st.hallModal };
  })()`);
  T("⑤ 首次击败机械AI龙后触发解锁事件", pending.fired === true && pending.modal === "preshiUnlock", pending);
  const dialog = await page.evaluate(`(() => {
    const html = window.NewCharacterUnlockEvents.preshiUnlock(window.state) || "";
    const text = document.body.innerText;
    return {
      html: html.includes("普雷希") && html.includes("加油机"),
      shown: text.includes("姨妈"),
    };
  })()`);
  T("⑤ 事件弹窗渲染普雷希台词", dialog.html && dialog.shown, dialog);
  // 对话逐句推进，先跳到末句才会出现完成按钮
  await page.click("[data-adv-skip]");
  await page.waitForTimeout(200);
  const btn = await page.locator("[data-preshi-unlock-complete]").count();
  T("⑤ 完成按钮已渲染且带绑定属性", btn === 1, { btn });
  await page.locator("[data-preshi-unlock-complete]").click();
  await page.waitForTimeout(400);
  const unlocked = await page.evaluate(`(() => {
    const c = window.state.chars.find(x => x.id === "preshi");
    return { locked: !!c?.locked, modal: window.state.hallModal, seen: !!window.state.flags?.preshiUnlockSeen };
  })()`);
  T("⑤ 点击后普雷希加入角色栏", unlocked.locked === false && unlocked.seen === true, unlocked);
  T("⑤ 点击后弹窗关闭", unlocked.modal === null, unlocked);
  await startRegressionBattle(page);

  const roster = await page.evaluate(`(() => {
    const tpls = window.GameData?.characters || [];
    return { count: tpls.length, has: tpls.some(c => c.id === "preshi"),
      skills: (tpls.find(c => c.id === "preshi") || {}).skills?.map(s => s.name) || [] };
  })()`);
  T("① 可培养职业为 31 名", roster.count === 31, roster);
  T("① 角色表含普雷希", roster.has, roster);
  T("① 普雷希拥有两个技能", roster.skills.length === 2, roster);

  await page.evaluate(setupTpl(5, 3));
  const drain = await page.evaluate(drainTpl);
  T("② 女王榨取造成等同于魔力值的伤害（魔力4 → 掉4）", drain.hpLoss === drain.magic, drain);
  T("② 女王榨取弃置目标全部手牌（3 → 0）", drain.allyHand === 3 && drain.allyLeft === 0, drain);
  T("② 女王榨取摸等量牌（3张）", drain.drawn === 3, drain);
  T("② 女王榨取写入战报", drain.logged, drain);
  T("② 女王榨取标记为已使用", drain.used, drain);

  const twice = await page.evaluate(drainTwiceTpl);
  T("② 出牌阶段限一次：第二次不再生效", twice.hpLoss === 0 && twice.allyLeft === 1, twice);

  await page.evaluate(setupTpl(5, 3));
  const sup = await page.evaluate(suppressTpl);
  T("③ 女王威压：手牌多于目标 → 不可响应", sup.more === true, sup);
  T("③ 女王威压：手牌不多于目标 → 可响应", sup.fewer === false, sup);

  await page.evaluate(setupTpl(5, 3));
  const dbl = await page.evaluate(doubleTpl);
  T("④ 女王威压：手牌全场最多时造成伤害翻倍（10 → 20）", dbl.top === true && dbl.out === 20, dbl);
  T("④ 女王威压：手牌全场最多时受到伤害翻倍（10 → 20）", dbl.inc === 20, dbl);

  const nd = await page.evaluate(noDoubleTpl);
  T("④ 女王威压：手牌非最多时不翻倍（10 → 10）", nd.top === false && nd.out === 10, nd);

  // 规则层：只有实体牌才触发翻倍，直接问两个 modify 钩子
  // 上一个用例把普雷希手牌清成了全场非最多，翻倍前提不成立，故此处重置手牌。
  await page.evaluate(setupTpl(5, 3));
  const rule = await page.evaluate(verbRuleTpl);
  T("④ 实体【杀】触发翻倍（造成 10 → 20）", rule.out.entity === 20, rule.out);
  T("④ 实体【杀】触发翻倍（受到 10 → 20）", rule.inc.entity === 20, rule.inc);
  T("④ 技能伤害不触发翻倍（造成 10 → 10）", rule.out.skill === 10, rule.out);
  T("④ 技能伤害不触发翻倍（受到 10 → 10）", rule.inc.skill === 10, rule.inc);
  T("④ 虚拟牌不触发翻倍", rule.out.virtual === 10 && rule.inc.virtual === 10, rule);
  T("④ 技能生成的牌不触发翻倍", rule.out.generated === 10 && rule.inc.generated === 10, rule);
  T("④ 技能卡（战术·带技能标记）不触发翻倍",
    rule.out.tacticSkill === 10 && rule.inc.tacticSkill === 10, rule);
  T("④ 饰品转换的实体牌仍算实体牌（可触发翻倍）",
    rule.out.converted === 20 && rule.inc.converted === 20, rule);

  // 集成层：真实伤害链下，实体牌翻倍而技能伤害不翻倍
  await page.evaluate(setupTpl(5, 3));
  const ent = await page.evaluate(entityOnlyTpl);
  T("④ 真实伤害链：实体牌造成翻倍（10 → 20）", ent.top === true && ent.entityOut === 20, ent);
  T("④ 真实伤害链：技能伤害不翻倍（10 → 10）", ent.skillOut === 10, ent);
  T("④ 真实伤害链：虚拟牌不翻倍（10 → 10）", ent.virtualOut === 10, ent);
  T("④ 真实伤害链：技能卡不翻倍（10 → 10）", ent.skillCardOut === 10, ent);
  T("④ 真实伤害链：实体牌受到翻倍（10 → 20）", ent.entityInc === 20, ent);
  T("④ 真实伤害链：技能伤害受到不翻倍（10 → 10）", ent.skillInc === 10, ent);

  const bad = relevantErrors(errors);
  T("页面无 JS 错误", bad.length === 0, bad.slice(0, 3));

  console.log(`\n通过 ${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})().catch(err => { console.error("FATAL", err); process.exit(1); });
