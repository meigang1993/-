// 诺亚【终极刀魔】实机回归：真实 bundle 装配下跑「发动 → 下一张实体单体杀 →
// 按本回合已用杀数额外结算 → 目标阵亡转移」，并校验专属卡图真实解码。
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
};

const setupTpl = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false; b.ended = false; b.turn = 9;
  b.phase = 4; b.activeUid = b.allies[0].uid;
  b.discardPick = null; b.selectedCardIndex = null; b.selectedSkillCard = null;
  st.log = []; st.battleLog = [];
  const noa = b.allies[0];
  noa.ref = "noa"; noa.name = "怪面诺亚"; noa.side = "ally";
  noa.hp = 100; noa.maxHp = 130; noa.block = 0;
  noa.stats = noa.stats || {}; noa.stats.attack = 10;
  noa.hand = []; noa.usedUltimateBlade = false;
  noa.skills = [
    { name: "淫气改造", type: "passive", icon: "⭐", text: "" },
    { name: "终极刀魔", type: "active", icon: "⚔️", text: "",
      card: { name: "终极刀魔", type: "tactic", ultimateBlade: true,
        targetless: true, icon: "⚔️", text: "" } },
  ];
  b.enemies = [
    { uid: "foe0", name: "残血敌人", side: "enemy", hp: 5, maxHp: 100,
      block: 0, hand: [], stats: { attack: 10 } },
    { uid: "foe1", name: "高血敌人", side: "enemy", hp: 100, maxHp: 100,
      block: 0, hand: [], stats: { attack: 10 } },
  ];
  window.render();
  const card = { name: "终极刀魔", type: "tactic", _skill: true,
    ultimateBlade: true, targetless: true, skillName: "终极刀魔" };
  return {
    handleWired: typeof window.NoaUltimateBladeSkills?.handleSpecialCard === "function",
    hookWired: typeof window.NoaUltimateBladeSkills?.afterCardPlayed === "function",
    resumeWired: typeof window.NoaUltimateBladeSkills?.resume === "function",
    chainWired: typeof window.ChiyoChainSkills?.run === "function",
    hooksWired: /NoaUltimateBladeSkills/.test(String(window.BattleCardResumeHooks || "")),
    definition: window.CharacterSkillAccess?.definitions?.some(d => d.name === "终极刀魔") === true,
    onceField: window.SkillOncePerTurn?.fieldFor?.(card) === "usedUltimateBlade",
    virtualWired: typeof window.BattleSystem?.useVirtualKill === "function",
  };
})()`;

// 发动前先用 2 张杀，发动后再出第 3 张 → X=3；残血敌人 5 血，攻击 10 一击致死，
// 剩余 2 次转移到高血敌人。
const flowTpl = `(() => {
  const st = window.state, b = st.battle;
  const noa = b.allies[0], foe0 = b.enemies[0];
  const slash = () => ({ name: "杀（普攻）", type: "slash",
    scale: "attack", suit: "♠", _playedFromHand: true });
  const before = b.enemies.map(e => e.hp);
  const s1 = slash(), s2 = slash(), s3 = slash();
  window.NoaUltimateBladeSkills.afterCardPlayed(st, noa, foe0, s1);
  window.NoaUltimateBladeSkills.afterCardPlayed(st, noa, foe0, s2);
  const activated = window.NoaUltimateBladeSkills.handleSpecialCard(st, noa, noa,
    { name: "终极刀魔", _skill: true, ultimateBlade: true });
  const pending = noa.noaUltimateBladePending === true;
  window.NoaUltimateBladeSkills.afterCardPlayed(st, noa, foe0, s3);
  const lines = (st.battleLog || st.log || []).slice(0, 40);
  return {
    activated, pending, count: noa.noaSlashCount,
    used: noa.usedUltimateBlade === true,
    pendingAfter: !!noa.noaUltimateBladePending,
    before, after: b.enemies.map(e => e.hp),
    chainLeft: b.noaUltimateChain || null,
    lines,
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
  T("实机：终极刀魔执行块已打进 bundle", setup.handleWired && setup.hookWired && setup.resumeWired, setup);
  T("实机：通用虚拟杀链执行器已导出", setup.chainWired, setup);
  T("实机：出牌后钩子链已登记新技能", setup.hooksWired, setup);
  T("实机：CharacterSkillAccess 已登记终极刀魔", setup.definition, setup);
  T("实机：出牌阶段限一次登记表认 ultimateBlade", setup.onceField, setup);
  T("实机：真实 useVirtualKill 入口可用", setup.virtualWired, setup);

  const r = await page.evaluate(flowTpl);
  T("实机：主动发动成功并挂预约", r.activated === true && r.pending === true && r.used === true, r);
  T("实机：X = 本回合已用杀数（含当前这张）= 3", r.count === 3, { count: r.count });
  T("实机：额外结算写入战报", r.lines.some(x => /额外结算3次/.test(x)), r.lines);
  T("实机：残血目标被额外结算击倒", r.after[0] === 0, { before: r.before, after: r.after });
  T("实机：剩余次数转移到另一名存活敌方并真实扣血",
    r.after[1] < r.before[1] && r.lines.some(x => /转移至/.test(x)),
    { before: r.before, after: r.after, lines: r.lines });
  T("实机：预约已消耗、链不残留", !r.pendingAfter && r.chainLeft === null, r);

  // 置灰：已发动后 SkillOncePerTurn 与 canPlay 均拦下
  const grey = await page.evaluate(`(() => {
    const b = window.state.battle, noa = b.allies[0];
    const card = { name: "终极刀魔", type: "tactic", _skill: true,
      ultimateBlade: true, targetless: true };
    return { blocked: window.SkillOncePerTurn?.blocked?.(noa, card, b) === true };
  })()`);
  T("实机：发动一次后登记表判为已使用（按钮置灰依据）", grey.blocked === true, grey);

  // 专属卡图真实解码（不是只查文件存在）
  const art = await page.evaluate(async () => {
    const url = "./assets/generated/cards/skill-art-ultimate-blade.c1dcc172.webp";
    return await new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve({ ok: true, w: img.naturalWidth, h: img.naturalHeight, url });
      img.onerror = () => resolve({ ok: false, url });
      img.src = url;
    });
  });
  T("实机：终极刀魔专属卡图可解码 384×384",
    art.ok === true && art.w === 384 && art.h === 384, art);

  T("全程无 JS 错误", errors.length === 0, errors.slice(0, 3));

  console.log(`\n通过 ${pass} / ${total}`);
  await browser.close();
  if (pass !== total) process.exit(1);
})().catch(e => {
  console.error("FATAL", e);
  process.exit(1);
});
