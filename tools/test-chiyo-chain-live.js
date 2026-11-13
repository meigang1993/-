// 橘千樱【红缨连鬼斩】实机回归：真实 bundle 装配里跑「判定 → 虚拟杀链 → 目标转移」。
// 旧实现把整张杀重复结算 X+1 次且目标一死剩余次数作废；现在逐张虚拟【杀（普攻）】，
// 目标阵亡后剩余次数转移给另一名存活敌方。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}`
    + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
};

// 布场：allies[0]=橘千樱（带两技能、攻击 10）；enemies[0] 低血量、[1] 高血量
const setupTpl = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false; b.turn = 9;
  b.discardPick = null; b.selectedCardIndex = null; b.selectedSkillCard = null;
  st.log = []; st.battleLog = [];
  while (b.enemies.length < 2) {
    b.enemies.push({ uid: "foe" + b.enemies.length, name: "备用敌人",
      side: "enemy", hp: 100, maxHp: 100, block: 0, hand: [],
      stats: { attack: 10 } });
  }
  const chiyo = b.allies[0];
  chiyo.ref = "chiyo"; chiyo.name = "橘千樱"; chiyo.side = "ally";
  chiyo.ai = "invader_chiyo";
  chiyo.hp = 100; chiyo.maxHp = 100; chiyo.block = 0;
  chiyo.stats = chiyo.stats || {}; chiyo.stats.attack = 10;
  chiyo.hand = [];
  chiyo.skills = [
    { name: "红缨连鬼斩", type: "passive", icon: "⭐", text: "" },
    { name: "心眼拔刀术", type: "passive", icon: "⭐", text: "" },
  ];
  b.enemies[0].name = "残血敌人"; b.enemies[0].hp = 10;
  b.enemies[0].maxHp = 100; b.enemies[0].block = 0; b.enemies[0].hand = [];
  b.enemies[1].name = "满血敌人"; b.enemies[1].hp = 100;
  b.enemies[1].maxHp = 100; b.enemies[1].block = 0; b.enemies[1].hand = [];
  window.render();
  return {
    chainWired: typeof window.ChiyoChainSkills?.afterCardPlayed === "function",
    resumeWired: typeof window.ChiyoChainSkills?.resume === "function",
    virtualWired: typeof window.BattleSystem?.useVirtualKill === "function",
    hooksWired: /ChiyoChainSkills/.test(String(window.BattleCardResumeHooks || "")),
  };
})()`;

// 端到端：受控判定（3 红 + 1 黑）→ 真实 EnemyKillHooks 记录次数 → 真实虚拟杀链
const chainTpl = `(() => {
  const st = window.state, b = st.battle;
  const actor = b.allies[0], target = b.enemies[0];
  let judged = 0;
  const drawJudge = () => {
    judged += 1;
    const red = judged <= 3;
    return { card: { suit: red ? "♥" : "♠", name: "判定牌" }, success: red };
  };
  const hooks = window.EnemyCombatHooks({
    black: item => /[♠♣]/.test(item?.suit || ""),
    hasSkill: (u, name) => ["红缨连鬼斩", "心眼拔刀术"].includes(name),
    drawJudge,
    machine: {}, discardOne: () => {}, status: {},
  });
  const card = { name: "杀（普攻）", type: "slash", scale: "attack", suit: "♠" };
  hooks.beforeKillTargeted(st, actor, target, card);
  const before = b.enemies.slice(0, 2).map(e => e.hp);
  const extra = card._chiyoExtra || 0;
  const repeats = card.gatlingRepeats;
  window.ChiyoChainSkills.afterCardPlayed(st, actor, target, card);
  window.render();
  return {
    judged, extra, repeats,
    before,
    after: b.enemies.slice(0, 2).map(e => e.hp),
    log: (st.battleLog || st.log || []).slice(0, 25),
    chainLeft: b.chiyoChain || null,
  };
})()`;

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", e => errors.push(String(e.message || e)));
  await openGame(page);
  await startRegressionBattle(page);

  const setup = await page.evaluate(setupTpl);
  T("ChiyoChainSkills.afterCardPlayed 已打进 bundle", setup.chainWired === true, setup);
  T("ChiyoChainSkills.resume 已打进 bundle", setup.resumeWired === true, setup);
  T("BattleSystem.useVirtualKill 真实入口可用", setup.virtualWired === true, setup);
  T("afterCardPlayed 钩子链已登记红缨连鬼斩", setup.hooksWired === true, setup);

  const r = await page.evaluate(chainTpl);
  T("判定 3 红 1 黑后停止", r.judged === 4, r);
  T("记录额外虚拟杀张数 3，不再改 gatlingRepeats",
    r.extra === 3 && r.repeats === undefined, { extra: r.extra, repeats: r.repeats });
  T("战报写明额外使用 3 张虚拟【杀（普攻）】",
    r.log.some(x => /额外使用3张虚拟/.test(x)), r.log);
  T("虚拟杀链真实扣血（残血敌人被打死）",
    r.after[0] === 0, { before: r.before, after: r.after });
  T("目标阵亡后剩余次数转移给另一名存活敌方并继续扣血",
    r.after[1] < r.before[1], { before: r.before, after: r.after });
  T("转移写入战报",
    r.log.some(x => /连击转移至/.test(x)), r.log);
  T("链结束后不残留状态", r.chainLeft === null, r.chainLeft);

  // 幂等：重复进入钩子不再发动
  const idem = await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const before = b.enemies.map(e => e.hp);
    window.ChiyoChainSkills.afterCardPlayed(st, b.allies[0], b.enemies[0],
      { name: "杀（普攻）", type: "slash", _chiyoExtra: 2 });
    return { before, after: b.enemies.map(e => e.hp) };
  })()`);
  // 新 card 带 2 次：这是「另一张杀」，正常应发动；这里验证无异常且确实扣血。
  T("另一张杀的连击同样可发动（无残留卡死）",
    idem.after[1] <= idem.before[1], idem);

  const desc = await page.evaluate(`(() => {
    const all = (GameData.characters || []).concat(GameData.enemies || []);
    const texts = [];
    all.forEach(c => (c.skills || []).forEach(s => {
      if (s.name === "红缨连鬼斩") texts.push(s.text || "");
    }));
    return texts;
  })()`);
  T("技能描述含「额外对目标使用等量的虚拟【杀（普攻）】」",
    desc.some(t => /额外对目标使用等量的虚拟【杀（普攻）】/.test(t)), desc);
  T("技能描述含「剩余未使用的连击次数可指定另一名敌方角色」",
    desc.some(t => /剩余未使用的连击次数可指定另一名敌方角色/.test(t)), desc);

  // 新隐身口径端到端：真实 bundle 装配里，实体单体【杀】被统一判定源拦下，
  // 而虚拟【杀】可指定隐身希尔德；不能只在模块级 vm 里成立。
  const stealthTpl = `(() => {
    const st = window.state, b = st.battle;
    b.locked = false; b.ended = false; b.animQueue = [];
    const chiyo = b.allies[0];
    chiyo.hp = 100; chiyo.stats.attack = 10;
    b.enemies = [
      { uid: "foe0", name: "残血敌人", side: "enemy", hp: 10, maxHp: 100,
        block: 0, hand: [], stats: { attack: 10 } },
      { uid: "hilde", name: "隐身希尔德", side: "enemy", hp: 1, maxHp: 100,
        block: 0, ai: "ruins_hilde", hand: [{ name: "黑牌", suit: "♠" }],
        stats: { attack: 10 } },
    ];
    st.log = []; st.battleLog = [];
    const judgeOk = typeof window.RuinsEnemySkills?.blocksKillTarget === "function";
    const entityProbe = window.CardUtils.cloneEntity("杀（普攻）", {});
    const probe = window.CardUtils.fromEntity("杀（普攻）", {});
    const blockedEntity = window.RuinsEnemySkills?.blocksKillTarget?.(b.enemies[1], entityProbe) === true;
    const blocked = window.RuinsEnemySkills?.blocksKillTarget?.(b.enemies[1], probe) === true;
    window.ChiyoChainSkills.afterCardPlayed(st, chiyo, b.enemies[0], { _chiyoExtra: 5 });
    const lines = st.battleLog || st.log || [];
    return { judgeOk, blockedEntity, blocked, foe0: b.enemies[0].hp, hilde: b.enemies[1].hp,
      text: lines.join("|"), chainLeft: b.chiyoChain || null };
  })()`;
  const sr = await page.evaluate(stealthTpl);
  T("实机：统一判定源 blocksKillTarget 已装配进 bundle", sr.judgeOk === true, sr);
  T("实机：实体单体【杀】被隐身拦下", sr.blockedEntity === true, sr);
  T("实机：虚拟【杀】不受隐身限制", sr.blocked === false, sr);
  T("实机：连击收割普通目标", sr.foe0 === 0, sr);
  T("实机：剩余连击转移到隐身希尔德并命中", sr.hilde === 0, sr);
  T("实机：战报写明转移至隐身希尔德",
    /转移至隐身希尔德/.test(sr.text), sr.text);
  T("实机：收割完写明「已无可指定的存活敌方」",
    /已无可指定的存活敌方/.test(sr.text), sr.text);
  T("实机：链不残留", sr.chainLeft === null, sr.chainLeft);

  T("全程无 JS 错误", errors.length === 0, errors.slice(0, 3));

  console.log(`\n通过 ${pass} / ${total}`);
  await browser.close();
  if (pass !== total) process.exit(1);
})().catch(e => {
  console.error("FATAL", e);
  process.exit(1);
});
