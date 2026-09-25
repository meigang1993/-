// 补测：饰品转换牌在【锁魂镰刀】判定下的归属（真实浏览器 + 真实伤害触发链）
//   背景：锁魂镰刀用 CardUtils.isEntitySingleKill（isKillCard && !virtual && 单体），
//         该判定不看 _skill，也不看 _entityConversion。
//   而外神之眼用 isEntityCard（!virtual && (!_skill || _entityConversion)）。
//   两套判定口径不同，需实测饰品转换牌在锁魂镰刀下的真实行为是否与其他技能一致。
//   债务 2（2026-09-25 处理）：三件 convertAs 饰品均已标 _entityConversion，
//   两套判定对同一张牌结论一致，此前「刺客胶衣」的反向冲突已消除。
//   造牌参数与 src/original/battle-card-active-relics-assassin.js 源码一字不差。
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

// 页面内：用给定造牌参数产出牌，喂 BattleDamageTriggers，返回是否触发锁魂镰刀
const RUN = (expr) => `(() => {
  const b = window.state.battle;
  const actor = b.allies[0];
  actor.ref = "besta_doll"; actor.name = "贝丝妲魔偶";
  actor.skills = [{ name: "锁魂镰刀" }];
  actor.stats = { attack: 3, magic: 3, speed: 3, maxHp: 28 };
  actor.hp = 28; actor.intent = 3;
  const e1 = b.enemies[0], e2 = b.enemies[1];
  e1.hp = 30; e2.hp = 30;
  window.render();
  const source = window.CardUtils.cloneEntity("闪");
  const card = ${expr};
  const hits = [];
  window.BattleDamageTriggers && window.BattleDamageTriggers({
    deps: { isKillCard: window.CardUtils.isKillCard, draw() {} },
    ctx: { hasSkill: (u, n) => (u.skills||[]).some(s=>s.name===n),
           statOf: u => u.stats.magic, queueSlashPlay(){}, pushFloat(){} },
    damage: {},
    directDamage(_s, t, amt) { hits.push(t.uid); t.hp -= amt; },
  }).afterDamage(window.state, actor, e1, card, 2, 0);
  window.render();
  return {
    hits: hits.length,
    e2: e2.hp,
    isEntitySingleKill: !!window.CardUtils.isEntitySingleKill(card),
    card: { name: card.name, type: card.type,
            virtual: !!card.virtual, convertedFrom: card.convertedFrom || null,
            _skill: !!card._skill, _entityConversion: !!card._entityConversion },
  };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await startRegressionBattle(page);

  // --- 1. 魅魔钢叉产物（源码参数一致）---
  const fork = await page.evaluate(RUN(`window.CardUtils.convertAs("魅杀", source, {
      type: "slash", scale: "magic", attackType: "magic", noIntentCost: true,
      _skill: true, _relicSkill: true, _skipHandMove: true,
      _entitySourceCard: source, _entityConversion: true })`));
  console.log("魅魔钢叉产物:", JSON.stringify(fork.card));
  check("魅魔钢叉产物：不带 virtual、带 convertedFrom（实体转换牌）",
    fork.card.virtual === false && !!fork.card.convertedFrom, fork.card);
  check("魅魔钢叉产物：isEntitySingleKill = true",
    fork.isEntitySingleKill === true, fork);
  check("魅魔钢叉产物：触发锁魂镰刀（第二名敌人掉血）",
    fork.hits === 2 && fork.e2 < 30, fork);

  // --- 2. 刺客胶衣产物（源码参数一致，已标 _entityConversion）---
  const latex = await page.evaluate(RUN(`window.CardUtils.convertAs("刺杀", source, {
      type: "slash", ignoreResponse: true, scale: "attack", noIntentCost: true,
      _skill: true, _relicSkill: true, _skipHandMove: true,
      _entitySourceCard: source, _entityConversion: true })`));
  console.log("刺客胶衣产物:", JSON.stringify(latex.card));
  check("刺客胶衣产物：不带 virtual（按 isEntitySingleKill 算实体）",
    latex.card.virtual === false, latex.card);
  // 债务 2 补齐标记后：外神之眼口径（isEntityCard）与锁魂镰刀口径
  // （isEntitySingleKill）统一为「都算实体牌」，口径冲突消除。
  check("刺客胶衣产物：已标 _entityConversion（与钢叉/扑克口径统一）",
    latex.card._entityConversion === true, latex.card);
  console.log(`   ↳ 实测锁魂镰刀 hits=${latex.hits} e2=${latex.e2}`
    + ` isEntitySingleKill=${latex.isEntitySingleKill}`);
  check("刺客胶衣产物：触发锁魂镰刀（与外神之眼口径一致，冲突消除）",
    latex.hits === 2 && latex.e2 < 30, latex);

  // --- 3. 鬼王扑克产物（战术牌，不是杀）---
  const poker = await page.evaluate(RUN(`window.CardUtils.convertAs("魔法对决", source, {
      type: "tactic", originalType: source.type, convertedTactic: true,
      _skill: true, _relicSkill: true, _skipHandMove: true,
      _playedTargetUid: window.state.battle.enemies[0].uid,
      _entitySourceCard: source, _entityConversion: true })`));
  console.log("鬼王扑克产物:", JSON.stringify(poker.card));
  check("鬼王扑克产物：非杀牌，不触发锁魂镰刀",
    poker.hits === 0 && poker.e2 === 30, poker);

  // --- 4. 反向验证：给魅魔钢叉产物加 virtual，应不再触发 ---
  const forkVirtual = await page.evaluate(RUN(`Object.assign(
      window.CardUtils.convertAs("魅杀", source, {
        type: "slash", scale: "magic", attackType: "magic", noIntentCost: true,
        _skill: true, _relicSkill: true, _skipHandMove: true,
        _entitySourceCard: source, _entityConversion: true }),
      { virtual: true })`));
  check("反向验证：魅魔钢叉产物若带 virtual 则不触发锁魂镰刀",
    forkVirtual.hits === 0 && forkVirtual.e2 === 30, forkVirtual);

  check("页面无 JS 错误", errors.length === 0, errors.slice(0, 3));

  await browser.close();
  console.log(`\n结果 ${pass}/${total}`);
  process.exit(pass === total ? 0 : 1);
})();
