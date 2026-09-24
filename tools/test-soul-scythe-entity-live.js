// 专项实战：贝丝妲魔偶【锁魂镰刀】仅由实体单体【杀】触发（真实浏览器 + 真实伤害结算）
//   曾出现：判定用 isSingleKill，技能生成的虚拟单体杀也会触发群体连锁收割。
//   修复：改用 isEntitySingleKill（实体与转换杀可触发，虚拟杀不触发）。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
function check(name, cond, extra) {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
}

// 在页面内构造贝丝妲魔偶对两名敌人出牌，返回敌人血量与日志
const RUN = (virtual) => `(() => {
  const b = window.state.battle;
  const actor = b.allies[0];
  actor.ref = "besta_doll"; actor.name = "贝丝妲魔偶";
  actor.skills = [{ name: "锁魂镰刀" }];
  actor.stats = { attack: 3, magic: 3, speed: 3, maxHp: 28 };
  actor.hp = 28; actor.intent = 3;
  const e1 = b.enemies[0], e2 = b.enemies[1];
  e1.hp = 20; e2.hp = 20;
  window.render();
  const before = [e1.hp, e2.hp];
  const card = ${virtual}
    ? Object.assign(window.CardUtils.cloneEntity("杀（普攻）"), { virtual: true })
    : window.CardUtils.cloneEntity("杀（普攻）");
  const ok = window.BattleSystem.playActiveCard
    ? window.BattleSystem.playActiveCard(window.state, 0, e1.uid, null)
    : false;
  return { before, after: [e1.hp, e2.hp], ok,
           log: (window.state.log || []).slice(0, 12) };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await startRegressionBattle(page);

  // --- 实体单体杀：应触发锁魂镰刀，第二名敌人也掉血 ---
  const solid = await page.evaluate(`(() => {
    const b = window.state.battle;
    const actor = b.allies[0];
    actor.ref = "besta_doll"; actor.name = "贝丝妲魔偶";
    actor.skills = [{ name: "锁魂镰刀" }];
    actor.stats = { attack: 3, magic: 3, speed: 3, maxHp: 28 };
    actor.hp = 28; actor.intent = 3;
    const e1 = b.enemies[0], e2 = b.enemies[1];
    e1.hp = 30; e2.hp = 30;
    // 直接驱动伤害触发链：实体单体杀
    const card = window.CardUtils.cloneEntity("杀（普攻）");
    const hits = [];
    window.BattleDamageTriggers && window.BattleDamageTriggers({
      deps: { isKillCard: window.CardUtils.isKillCard, draw() {} },
      ctx: { hasSkill: (u, n) => (u.skills||[]).some(s=>s.name===n),
             statOf: u => u.stats.magic, queueSlashPlay(){}, pushFloat(){} },
      damage: {},
      directDamage(_s, t, amt) { hits.push(t.uid); t.hp -= amt; },
    }).afterDamage(window.state, actor, e1, card, 2, 0);
    window.render();
    return { hits, e1: e1.hp, e2: e2.hp };
  })()`);
  check("实体单体杀触发锁魂镰刀（两名敌人各受魔力伤害）",
    solid.hits.length === 2 && solid.e2 < 30,
    solid);

  // --- 虚拟单体杀：不应触发 ---
  const virt = await page.evaluate(`(() => {
    const b = window.state.battle;
    const actor = b.allies[0];
    const e1 = b.enemies[0], e2 = b.enemies[1];
    e1.hp = 30; e2.hp = 30;
    const card = Object.assign(window.CardUtils.cloneEntity("杀（普攻）"), { virtual: true });
    const hits = [];
    window.BattleDamageTriggers && window.BattleDamageTriggers({
      deps: { isKillCard: window.CardUtils.isKillCard, draw() {} },
      ctx: { hasSkill: (u, n) => (u.skills||[]).some(s=>s.name===n),
             statOf: u => u.stats.magic, queueSlashPlay(){}, pushFloat(){} },
      damage: {},
      directDamage(_s, t, amt) { hits.push(t.uid); t.hp -= amt; },
    }).afterDamage(window.state, actor, e1, card, 2, 0);
    window.render();
    return { hits, e1: e1.hp, e2: e2.hp };
  })()`);
  check("虚拟单体杀不触发锁魂镰刀（第二名敌人不掉血）",
    virt.hits.length === 0 && virt.e2 === 30,
    virt);

  // --- 转换杀仍算实体 ---
  const conv = await page.evaluate(`(() => {
    const b = window.state.battle;
    const actor = b.allies[0];
    const e1 = b.enemies[0], e2 = b.enemies[1];
    e1.hp = 30; e2.hp = 30;
    const card = Object.assign(window.CardUtils.cloneEntity("魔杀"), { convertedFrom: "闪" });
    const hits = [];
    window.BattleDamageTriggers && window.BattleDamageTriggers({
      deps: { isKillCard: window.CardUtils.isKillCard, draw() {} },
      ctx: { hasSkill: (u, n) => (u.skills||[]).some(s=>s.name===n),
             statOf: u => u.stats.magic, queueSlashPlay(){}, pushFloat(){} },
      damage: {},
      directDamage(_s, t, amt) { hits.push(t.uid); t.hp -= amt; },
    }).afterDamage(window.state, actor, e1, card, 2, 0);
    window.render();
    return { hits, e2: e2.hp };
  })()`);
  check("转换单体杀仍触发（本质为实体手牌）",
    conv.hits.length === 2 && conv.e2 < 30,
    conv);

  check("页面无 JS 错误", errors.length === 0, errors.slice(0, 3));

  await browser.close();
  console.log(`\n结果 ${pass}/${total}`);
  process.exit(pass === total ? 0 : 1);
})();
