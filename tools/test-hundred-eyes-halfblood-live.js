// 百眼魅魔 × 半魅魔血：友方互殴时，百眼魅魔会不会被打断
//
// 场景：XX型凋零者1312号在结束阶段发动【百眼魅魔】，使我方所有存活角色
// 各自随机对另一名我方角色「视为使用一张虚拟【杀】」——也就是友方互殴。
// 若被打的人里有星野海一，【半魅魔血】会触发（摸牌 + 弹交牌窗，且会置 locked）。
// 而百眼魅魔是同步 forEach 逐个驱动的，且 resolveCard 开头有
// `if (state.battle?.locked) return;` —— 一旦中途被交牌窗锁住，
// 后面的角色就会静默跳过，表现为「百眼魅魔只打了一半就断掉」。
//
// 本测试把随机定死（GameRandom.sample 恒取第一个候选），构造出确定顺序：
//   海一 → 打 队友B（不触发）
//   队友B → 打 海一（触发半魅魔血，锁界面）
//   队友C → 打 海一（这一下是否会丢，是本测试要回答的问题）
//
// 断言同时覆盖两件事：
//   1. 半魅魔血在「受到友方角色攻击」时确实触发（摸 3 张）
//   2. 百眼魅魔没有被打断 —— 三名角色的攻击全部真的结算出伤害
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const {
  startRegressionBattle, collectErrors, relevantErrors,
} = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}`
    + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
};

const setupTpl = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.reactionQueue = []; b.locked = false;
  b.kaiichiShare = null; b.kaiichiShareQueue = []; b.kaiichiShareScheduled = false;
  b.manualDodgeResume = null;
  // 随机定死：候选里恒取第一个，保证顺序可复现。
  if (window.GameRandom && !window.__sampleHooked) {
    window.__origSample = window.GameRandom.sample;
    window.GameRandom.sample = arr => (Array.isArray(arr) ? arr[0] : arr);
    window.__sampleHooked = true;
  }
  // 我方扩到 3 名：海一 + 队友B + 队友C
  while (b.allies.length < 3) {
    const n = b.allies.length;
    b.allies.push({ uid: "afill" + n, name: "补友" + n, ref: "fill_a" + n, id: "fill_a" + n,
      gender: "male", side: "ally", hp: 80, maxHp: 80, block: 0, hand: [], skills: [],
      statuses: [], battleRelics: [], stats: { attack: 5, magic: 0, speed: 5 } });
  }
  const kaiichi = b.allies[0], bUnit = b.allies[1], cUnit = b.allies[2];
  kaiichi.name = "星野海一"; kaiichi.ref = "hoshino_kaiichi"; kaiichi.id = "hoshino_kaiichi";
  kaiichi.gender = "male"; kaiichi.hp = kaiichi.maxHp = 400; kaiichi.block = 0;
  kaiichi.hand = []; kaiichi.statuses = []; kaiichi.battleRelics = [];
  kaiichi.stats = Object.assign({}, kaiichi.stats, { attack: 4, magic: 0, speed: 5 });
  kaiichi.skills = [{ name: "半魅魔血", type: "trigger", icon: "🔵",
    text: "当你受到实体牌或虚拟牌造成的伤害后（同一张牌的多段或连击伤害逐段结算），"
      + "你摸3张牌，然后可以选择至多2张手牌并将这些牌交给一名其他友方角色。"
      + "若星野依在队伍中且存活，星野依令你恢复等同于其魔力值的生命值。"
      + "技能造成的追加伤害不触发此技。" }];
  [bUnit, cUnit].forEach((u, i) => {
    u.name = "队友" + (i === 0 ? "B" : "C");
    u.ref = "mate_" + i; u.id = "mate_" + i; u.gender = "male";
    u.hp = u.maxHp = 400; u.block = 0; u.hand = []; u.statuses = [];
    u.skills = []; u.battleRelics = [];
    u.stats = { attack: 5, magic: 0, speed: 5 };
  });
  // 敌方：凋零者1312，手牌放 2 张红桃以触发百眼魅魔
  const w = b.enemies[0];
  w.name = "XX型凋零者1312号"; w.ref = "witherer_1312"; w.id = "witherer_1312";
  w.ai = "ruins_witherer"; w.hp = w.maxHp = 300; w.block = 0; w.statuses = [];
  w.stats = Object.assign({}, w.stats, { attack: 5, magic: 0, speed: 5 });
  w.hand = [
    { name: "杀（普攻）", type: "slash", suit: "♥", uid: "wh1" },
    { name: "杀（普攻）", type: "slash", suit: "♥", uid: "wh2" },
  ];
  b.enemies.slice(1).forEach(e => { e.hp = e.maxHp = 300; e.hand = []; });
  b.allies.concat(b.enemies).forEach(u =>
    u.hand.forEach(c => { delete c._pendingDraw; }));
  st.log.length = 0;
  // 探针：记录每一次虚拟杀驱动前后的 locked / 交牌窗状态，用于定位「哪一段被吞掉」。
  window.__probe = [];
  if (window.BattleSystem && !window.__vkHooked) {
    const origVk = window.BattleSystem.useVirtualKill;
    if (typeof origVk === "function") {
      window.BattleSystem.useVirtualKill = function vkProbe(s, actor, target, card) {
        const bb = s.battle;
        const before = { actor: actor.name, target: target.name, hp: target.hp,
          locked: !!bb.locked, share: !!bb.kaiichiShare,
          queue: (bb.kaiichiShareQueue || []).length,
          defer: !!bb._deferSharePrompts };
        const ret = origVk.call(this, s, actor, target, card);
        window.__probe.push({ ...before, ret, hpAfter: target.hp,
          lockedAfter: !!bb.locked });
        return ret;
      };
      window.__vkHooked = true;
    }
  }
  window.render();
  window.BattleEffects.recover(st);
  return { kaiichi: kaiichi.uid, bUnit: bUnit.uid, cUnit: cUnit.uid, witherer: w.uid,
    hearts: w.hand.filter(c => c.suit === "♥").length,
    hasEndTurn: typeof window.RuinsWithererSkills?.endTurn === "function" };
})()`;

const runEndTurn = () => `(() => {
  const st = window.state, b = st.battle;
  const w = b.enemies[0];
  const before = b.allies.map(u => ({ uid: u.uid, hp: u.hp }));
  window.RuinsWithererSkills.endTurn(st, w);
  const logs = (st.log || []).slice();
  return {
    before,
    after: b.allies.map(u => ({ uid: u.uid, hp: u.hp })),
    drive: logs.filter(x => String(x).includes("百眼魅魔使")).length,
    damage: logs.filter(x => /造成\\d+伤害/.test(String(x))).length,
    halfBlood: logs.filter(x => String(x).includes("半魅魔血")).length,
    drawLine: logs.filter(x => /半魅魔血令其摸/.test(String(x))).map(x => String(x)),
    locked: !!b.locked,
    shareQueue: (b.kaiichiShareQueue || []).length,
    shareActive: !!b.kaiichiShare,
    handLen: b.allies[0].hand.filter(c => !c._pendingDraw).length,
    logs: logs.slice(0, 24),
  };
})()`;

const giveSkip = () => `(() => {
  // 交牌窗要等动画队列排空才可见（shareVisible 要求 !animQueue.length）：
  // 真实对局里动画会自动播完，测试里手动收尾再渲染，才拿得到「不交」按钮。
  window.state.battle.animQueue = [];
  window.BattleEffects.recover(window.state);
  window.render();
  const btn = document.querySelector("[data-kaiichi-share-skip]");
  if (!btn) return { ok: false, share: !!window.state.battle.kaiichiShare,
    locked: !!window.state.battle.locked };
  btn.click();
  return { ok: true };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = collectErrors(page);
  await startRegressionBattle(page);
  await page.waitForTimeout(300);
  const info = await page.evaluate(setupTpl);
  console.log(`   setup: 我方 3 名（海一/队友B/队友C），凋零者红桃 ${info.hearts} 张`);
  T("A0 endTurn 可调用", info.hasEndTurn, info);
  T("A1 凋零者手握红桃牌（百眼魅魔发动前提）", info.hearts >= 2, info);

  const res = await page.evaluate(runEndTurn());
  console.log("   ---- 战斗日志 ----");
  res.logs.forEach(line => console.log(`   log: ${line}`));
  const probe = await page.evaluate(`(() => window.__probe || [])()`);
  probe.forEach(p => console.log(`   probe: ${JSON.stringify(p)}`));
  console.log(`   ---- 血量 ----`);
  res.before.forEach((u, i) => console.log(
    `   ${u.uid}: ${u.hp} → ${res.after[i].hp}`));

  const kaiLoss = res.before[0].hp - res.after[0].hp;
  const bLoss = res.before[1].hp - res.after[1].hp;
  const cLoss = res.before[2].hp - res.after[2].hp;

  // ── 一、百眼魅魔有没有被打断 ────────────────────────────────
  T("B1 百眼魅魔驱动了全部 3 名我方角色", res.drive === 3, res);
  T("B2 三次驱动全部真的结算出伤害（未断续）", res.damage === 3, res);
  T("B3 海一被队友B打到（中段触发半魅魔血）", kaiLoss > 0, { kaiLoss });
  T("B4 海一也被队友C打到（触发之后没断）", kaiLoss >= 10, { kaiLoss, note: "两次各5点" });
  T("B5 队友B也被海一打到（首段未被跳过）", bLoss > 0, { bLoss });
  T("B6 队友C未受伤（它只出手，不是目标）", cLoss === 0, { cLoss });

  // ── 二、半魅魔血在友方攻击下是否触发、摸几张 ─────────────────
  T("C1 半魅魔血受到友方攻击时确实触发", res.halfBlood > 0, res);
  T("C2 摸牌日志写明摸 3 张",
    res.drawLine.some(x => x.includes("摸3张牌")), res.drawLine);

  // ── 三、交牌提示的排队与解锁 ──────────────────────────────────
  console.log(`   交牌队列：queue=${res.shareQueue} active=${res.shareActive} locked=${res.locked}`);
  T("D1 交牌提示已排队/激活（半魅魔血走的是底部提示条链路，非居中弹窗）",
    res.shareActive || res.shareQueue > 0, res);
  T("D2 逻辑层 locked 置位等待玩家操作（与提示条显示位置无关）", res.locked, res);

  // 逐一点掉「不交」，验证不会卡死、最终解锁
  let unlocked = false;
  for (let i = 0; i < 6; i++) {
    const clicked = await page.evaluate(giveSkip());
    if (!clicked.ok) break;
    await page.waitForTimeout(200);
    const st = await page.evaluate(`(() => {
      const b = window.state.battle;
      return { locked: !!b.locked, active: !!b.kaiichiShare,
        queue: (b.kaiichiShareQueue || []).length,
        btn: !!document.querySelector("[data-kaiichi-share-skip]") };
    })()`);
    console.log(`   skip#${i + 1}: ${JSON.stringify(st)}`);
    if (!st.locked && !st.active && !st.queue) { unlocked = true; break; }
  }
  T("D3 逐次点「不交」后完全解锁（不卡死）", unlocked, { unlocked });

  const bad = relevantErrors(errors);
  T("E0 无 JS 报错", bad.length === 0, bad.slice(0, 3));

  await browser.close();
  console.log(`\n通过 ${pass}/${total}`);
  process.exit(pass === total ? 0 : 1);
})();
