// 武装直升机 ·【继续压制】摸到的牌应触发【螺旋桨】（英雄级自带饰品）
//
// 背景（本轮修的 BUG）：afterDodged 里是手动 `actor.hand.push(drawn)`，
// 不经过 draw()，因此 afterDraw 不会被调用 → 螺旋桨（出牌阶段摸牌时触发）
// 在继续压制这条路径上完全不发动。英雄级直升机自动携带螺旋桨，实测修复前
// 「继续压制触发」日志有、「螺旋桨触发」日志为 0。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
};

// 用真实缩放路径生成英雄级直升机（自带 螺旋桨 / 导弹发射器），替换敌方 0 号
const setupTpl = `(() => {
  const st = window.state, b = st.battle;
  const run = { missionId: "ruins_sand_city", difficultyId: "hell" };
  const made = window.DungeonEnemyGroups.fromIds(run, "elite", ["attack_helicopter"], st);
  const src = made?.[0];
  if (!src) return { err: "fromIds 未生成敌人" };
  b.animQueue = []; b.locked = false;
  b.selectedCardIndex = null; b.selectedSkillCard = null; b.pendingTargetUid = null;
  b.counterTrigger = null; b.counterTriggerQueue = null;
  b._damageDepth = 0; b._propellerHitKey = null;
  b.activeUid = b.enemies[0].uid; b.phase = 4;
  b.allies.forEach(a => { a.hp = 300; a.maxHp = 300; a.block = 0; a.hand = []; });
  b.enemies.forEach((u, i) => { if (i !== 0) { u.hp = 100; u.maxHp = 100; u.hand = []; } });
  const e = b.enemies[0];
  const uid = e.uid;
  Object.assign(e, src, { uid });
  e.stats = { attack: src.attack, magic: src.magic || 0, speed: src.speed,
    maxHp: src.hp, handLimit: src.handLimit || 5, drawPerTurn: src.drawPerTurn || 0,
    initialDraw: src.initialDraw || 0, bloodlust: src.bloodlust || 1 };
  e.block = 0; e.ai = "ruins_helicopter";
  // 牌库留一张牌，保证继续压制确实摸得到
  e.deck = [{ name: "杀", type: "slash", suit: "♣", scale: "attack", power: 0 }];
  e.pileStats = { discard: [], consumed: [] };
  e.hand = [];
  st.log = [];
  window.render();
  return { ok: true, name: e.name, hp: e.hp, attack: src.attack,
    relics: (e.battleRelics || src.battleRelics || []).slice(), deck: e.deck.length };
})()`;

// 直升机打出一张【杀】被我方【闪】抵消 → 继续压制摸 1 张 → 螺旋桨应发动
const dodgeTpl = `(() => {
  const st = window.state, b = st.battle;
  const heli = b.enemies[0];
  const hpBefore = b.allies.reduce((sum, u) => sum + u.hp, 0);
  const slash = { name: "杀", type: "slash", suit: "♠", scale: "attack", power: 0 };
  const deckBefore = heli.deck.length;
  const handBefore = heli.hand.length;
  window.RuinsEliteSkills.afterDodged(st, heli, b.allies[0], slash);
  window.render();
  const logs = (st.log || []).slice(0, 8).map(String);
  const hpAfter = b.allies.reduce((sum, u) => sum + u.hp, 0);
  return { hpBefore, hpAfter, deckBefore, deckAfter: heli.deck.length,
    handBefore, handAfter: heli.hand.length,
    suppress: logs.some(t => /继续压制/.test(t)),
    propeller: logs.some(t => /螺旋桨/.test(t)),
    logs };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await startRegressionBattle(page);

  const setup = await page.evaluate(setupTpl);
  T("英雄级直升机生成成功", setup.ok === true, setup);
  T("英雄级自动携带螺旋桨",
    (setup.relics || []).includes("螺旋桨") === true, setup);

  const r = await page.evaluate(dodgeTpl);
  T("继续压制触发（摸 1 张牌）", r.suppress === true, r);
  T("继续压制确实从牌库摸到牌",
    r.deckAfter === r.deckBefore - 1 && r.handAfter === r.handBefore + 1, r);
  T("摸到的牌触发了螺旋桨", r.propeller === true, r);
  T("螺旋桨对我方造成了伤害", r.hpAfter < r.hpBefore, r);
  T("伤害等于直升机攻击力（英雄级缩放值）",
    r.hpBefore - r.hpAfter === setup.attack,
    { loss: r.hpBefore - r.hpAfter, attack: setup.attack });

  T("页面无 JS 错误", errors.filter(t => !/favicon|ResizeObserver/.test(t)).length === 0,
    errors.slice(0, 3));

  console.log(`\n结果 ${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})().catch(err => {
  console.error("运行失败：", err);
  process.exit(1);
});
