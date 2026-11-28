// 【追魂之刃 → 锁魂镰刀】实机回归（307 版，真实浏览器 + 真实页面装配）
//   BUG：追魂之刃重放牌内部带 virtual，锁魂镰刀旧判据 isEntitySingleKill 把它当
//   技能生成的虚拟派生杀拦掉，导致「触发使用的杀」造成伤害后不触发锁魂镰刀。
//   修复：CardUtils.isSoulScytheTriggerCard 放行 _soulBladeRepeat 重放杀，
//   普通虚拟杀 / 群体杀 / 技能载荷仍拦住；重放牌仍带 virtual 以免触发额外结算类。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const check = (name, cond, extra) => {
  total++; if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}${cond ? "" : "  ← " + JSON.stringify(extra || {})}`);
};

// 页面内：构造贝丝妲魔偶，用真实 BattleDamageTriggers 工厂驱动 afterDamage
const RUN = expr => `(() => {
  const b = window.state.battle;
  const actor = b.allies[0];
  actor.ref = "besta_doll"; actor.name = "贝丝妲魔偶";
  actor.skills = [{ name: "锁魂镰刀" }];
  actor.stats = { attack: 3, magic: 3, speed: 3, maxHp: 28 };
  actor.hp = 28; actor.intent = 3;
  const e1 = b.enemies[0], e2 = b.enemies[1];
  e1.hp = 30; e2.hp = 30; e1.block = 0; e2.block = 0;
  window.render();
  const card = ${expr};
  const hits = [];
  window.BattleDamageTriggers({
    deps: { isKillCard: window.CardUtils.isKillCard, draw() {} },
    ctx: { hasSkill: (u, n) => (u.skills || []).some(s => s.name === n),
           statOf: u => u.stats.magic, queueSlashPlay() {}, pushFloat() {} },
    damage: {},
    directDamage(_s, t, amt) { hits.push(t.uid); t.hp -= amt; },
  }).afterDamage(window.state, actor, e1, card, 2, 0);
  return { hits: hits.length, e2: e2.hp,
           judge: !!window.CardUtils.isSoulScytheTriggerCard(card) };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await startRegressionBattle(page);

  const solid = await page.evaluate(RUN(`window.CardUtils.cloneEntity("杀（普攻）")`));
  check("01 实体单体杀照常触发锁魂镰刀（正向对照）",
    solid.hits === 2 && solid.e2 < 30 && solid.judge === true, solid);

  const virt = await page.evaluate(RUN(
    `Object.assign(window.CardUtils.cloneEntity("杀（普攻）"), { virtual: true })`));
  check("02 普通虚拟单体杀不触发（既有口径不退化）",
    virt.hits === 0 && virt.e2 === 30 && virt.judge === false, virt);

  const replay = await page.evaluate(RUN(`Object.assign(
      window.CardUtils.cloneEntity("杀（普攻）"),
      { virtual: true, _soulBladeRepeat: true, _skipHandMove: true })`));
  check("03 【核心】追魂之刃重放杀造成伤害触发锁魂镰刀",
    replay.hits === 2 && replay.e2 < 30 && replay.judge === true, replay);

  const group = await page.evaluate(RUN(`Object.assign(
      window.CardUtils.cloneEntity("杀（普攻）"),
      { virtual: true, _soulBladeRepeat: true, sweep: true })`));
  check("04 重放群体杀仍不触发", group.hits === 0 && group.e2 === 30, group);

  const payload = await page.evaluate(RUN(`Object.assign(
      window.CardUtils.cloneEntity("杀（普攻）"),
      { type: "skill", name: "锁魂镰刀", soulScythe: true })`));
  check("05 锁魂镰刀自身技能载荷不触发（防连锁）",
    payload.hits === 0 && payload.e2 === 30, payload);

  const conv = await page.evaluate(RUN(
    `Object.assign(window.CardUtils.cloneEntity("魔杀"), { convertedFrom: "闪" })`));
  check("06 转换单体杀仍触发（本质为实体牌）",
    conv.hits === 2 && conv.e2 < 30, conv);

  // 真实 afterDodged → 重放 → 判据链路：重放牌带标记、只重放一次、战报无「额外」
  const chain = await page.evaluate(`(() => {
    const b = window.state.battle;
    const actor = b.allies[0];
    actor.ref = "besta_doll"; actor.name = "贝丝妲魔偶";
    actor.skills = [{ name: "追魂之刃" }, { name: "锁魂镰刀" }];
    actor.stats = { attack: 3, magic: 3, speed: 3, maxHp: 28 };
    actor.hp = 28; actor.intent = 3;
    const e1 = b.enemies[0]; e1.hp = 30;
    window.render();
    const calls = [];
    const T = window.BattleDamageTriggers({
      deps: { isKillCard: window.CardUtils.isKillCard, draw() {} },
      ctx: { hasSkill: (u, n) => (u.skills || []).some(s => s.name === n),
             statOf: () => 3, queueSlashPlay() {}, pushFloat() {} },
      damage: { useCard: (...a) => { calls.push(a[3]); } },
      directDamage() {},
    });
    const first = window.CardUtils.cloneEntity("杀（普攻）");
    T.afterDodged(window.state, actor, e1, first);
    const rp = calls[0] || null;
    const judged = rp ? !!window.CardUtils.isSoulScytheTriggerCard(rp) : false;
    if (rp) T.afterDodged(window.state, actor, e1, rp);
    const logs = (window.state.log || []).concat(window.state.battleLog || []);
    return { calls: calls.length, virtual: !!rp?.virtual,
             marked: !!rp?._soulBladeRepeat, judged,
             firstMarked: !!first._soulBladeRepeated,
             log: logs.slice(-8) };
  })()`);
  check("07 真实重放链路：只重放一次、重放牌带 _soulBladeRepeat、仍带 virtual",
    chain.calls === 1 && chain.marked === true && chain.virtual === true
    && chain.firstMarked === true, chain);
  check("08 重放牌经统一判据判为可触发锁魂镰刀", chain.judged === true, chain);
  check("09 战报写「再次使用」且无「额外」",
    chain.log.some(t => t.includes("触发追魂之刃，再次使用"))
    && !chain.log.some(t => t.includes("额外再次使用")), chain.log);
  check("10 页面无 JS 错误", errors.length === 0, errors.slice(0, 3));

  await browser.close();
  console.log(`\n结果 ${pass}/${total}`);
  process.exit(pass === total ? 0 : 1);
})().catch(e => { console.error("LIVE_FAIL", e.message); process.exit(1); });
