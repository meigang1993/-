// 米尔尤拉【神奇怀表】时停 · 标记消失后技能是否恢复
//
// 背景：时停是「禁用」类效果，禁用容易、恢复难。真正的风险在于标记被消耗或
// 清除之后，各条链路上的判据是否真的解除 —— 若某个入口只在「施加」时写了
// 守卫、而守卫依赖的状态没被正确清除，角色就会永久残废（技能永远用不了）。
//
// 本文件对每条已确认被时停压制的链路，都补一段「标记消失后是否恢复」的验证，
// 并各带「从未施加时停」的基线对照组，确保恢复不是恒真。
//
// 覆盖：
//   A 主动技牌        → BattleCardPlayability.canPlay
//   B 杀牌前置被动     → enemy-kill-hooks（机甲牛头怪·铁甲红怒）
//   C 受击后被动       → battle-damage-triggers（凋零者·外神之眼）
//   D 不可响应         → battle-damage-resolution
//   E 跳过回合         → MieryulaTimeStop.shouldSkipTurn
//   F BGM 暂停/恢复    → MieryulaTimeStop.mark / consume
//   G 逐个消耗         → 只消耗被标记者自己，其余保留
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const { startRegressionBattle, collectErrors, relevantErrors } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
};

const FOE = {
  minotaur: `w.name = "机甲牛头怪"; w.ref = "mecha_minotaur"; w.id = "mecha_minotaur";
    w.ai = "minotaur"; w.gender = "male";
    w.stats = Object.assign({}, w.stats || {}, { attack: 5, magic: 3, speed: 5 });
    w.skills = [{ name: "铁甲红怒", type: "passive", icon: "⭐", text: "t" }];`,
  witherer: `w.name = "XX型凋零者1312号"; w.ref = "witherer_1312"; w.id = "witherer_1312";
    w.ai = "ruins_witherer"; w.gender = "female";
    w.stats = Object.assign({}, w.stats || {}, { attack: 15, magic: 14, speed: 16 });
    w.skills = [
      { name: "外神之眼", type: "passive", icon: "⭐", text: "t" },
      { name: "魅魔吸精术", type: "passive", icon: "⭐", text: "t" },
      { name: "百眼魅魔", type: "active", icon: "🔵", text: "t" }];`,
};

const setupTpl = (foeKey, extra) => `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.reactionQueue = []; b.locked = false; b.phase = 4;
  b.kaiichiShare = null; b.kaiichiShareQueue = [];
  b.mieryulaTimeStopOwner = null; b.mieryulaBloodthirstPicker = null;
  while (b.allies.length < 3) {
    const n = b.allies.length;
    b.allies.push({ uid: "afill" + n, name: "补友" + n, ref: "fill_a" + n, id: "fill_a" + n,
      gender: "female", side: "ally", hp: 80, maxHp: 80, block: 0, hand: [], skills: [],
      statuses: [], battleRelics: [], stats: { attack: 4, magic: 4, speed: 4 } });
  }
  const m = b.allies[0];
  m.name = "米尔尤拉"; m.ref = "mieryula"; m.id = "mieryula"; m.gender = "female";
  m.stats = { attack: 4, magic: 2, speed: 5 }; m.tempAttack = 0;
  m.hp = m.maxHp = 52; m.bloodlust = 1; m.bloodlustMax = 1; m.hand = [];
  m.skills = [
    { name: "无谋霸姬", type: "passive" },
    { name: "神奇怀表", type: "active", card: { name: "神奇怀表", type: "tactic",
      mieryulaTimeStop: true, targetless: true, icon: "🔺", text: "t" } },
  ];
  m.usedMieryulaTimeStop = false;
  b.allies.slice(1).forEach(a => { a.hp = a.maxHp = 80; a.block = 0; a.hand = []; a.statuses = []; });
  const w = b.enemies[0];
  w.hp = w.maxHp = 300; w.block = 0; w.statuses = []; w.hand = [];
  ${FOE[foeKey]}
  b.enemies.slice(1).forEach(e => { e.hp = e.maxHp = 60; e.block = 0; e.hand = [];
    e.statuses = []; e.skills = []; });
  ${extra || ""}
  // 关键：useCard 要求 actionUid 与出牌者一致。前一组 hitTpl 会把 activeUid 改成
  // 友方 2 号位，若不在此复位，下一组 cast 会被 useCard 直接拒绝（返回 false），
  // 时停根本没施加 —— 这正是本文件首轮 6 项假红的根因。
  b.activeUid = m.uid;
  st.log = [];
  window.render();
  return { ok: true, allies: b.allies.length, foes: b.enemies.length };
})()`;

// 记录 BGM 的 suspend / resume 调用，用于验证「标记全解除后音乐恢复」
const hookBgmTpl = `(() => {
  window.__bgm = { suspend: [], resume: [] };
  if (!window.GameBGM) window.GameBGM = {};
  window.GameBGM.suspend = tag => window.__bgm.suspend.push(String(tag));
  window.GameBGM.resume = tag => window.__bgm.resume.push(String(tag));
  return { hooked: true };
})()`;

const castTpl = cast => `(() => {
  const st = window.state, b = st.battle;
  const m = b.allies[0];
  let ret = null, err = null;
  if (${cast}) {
    const card = { name: "神奇怀表", type: "tactic", mieryulaTimeStop: true,
      targetless: true, icon: "🔺", text: "t", _skill: true };
    m.hand.push(card);
    try { ret = String(window.BattleSystem.useCard(st, m, m, card)); }
    catch (e) { err = String(e && e.message || e); }
  }
  return { marked: (b.enemies[0].statuses || []).includes("时停"),
    markedAll: (b.enemies || []).filter(e => (e.statuses || []).includes("时停")).length,
    used: !!m.usedMieryulaTimeStop, owner: b.mieryulaTimeStopOwner ?? null,
    ret, err, handLen: (m.hand || []).length, ally0: m.name,
    hasSystem: typeof window.BattleSystem?.useCard,
    hasSkills: typeof window.MieryulaSkills?.playTimeStop,
    foeStatuses: JSON.parse(JSON.stringify((b.enemies || []).map(e => e.statuses || []))),
    log: (st.log || []).map(String).slice(0, 6) };
})()`;

// 主动技牌：canPlay 判定（真实可打出入口）
const canPlayTpl = `(() => {
  const st = window.state, b = st.battle;
  const w = b.enemies[0];
  const deps = { isKillCard: c => c?.type === "slash",
    isSingleKillCard: c => c?.type === "slash" && !c.sweep, active: bb => bb.enemies[0] };
  const { canPlay } = window.BattleCardPlayability(deps);
  return { canPlay: !!canPlay(w, { name: "百眼魅魔", _skill: true, withererManyEyes: true,
    targetless: true }, b) };
})()`;

// 我方 2 号位对敌人[0]打出一张实体【杀】
const hitTpl = `(() => {
  const st = window.state, b = st.battle;
  const a1 = b.allies[1], w = b.enemies[0];
  b.animQueue = []; b.locked = false; b.activeUid = a1.uid;
  st.log = [];
  const card = { name: "杀（普攻）", type: "slash", suit: "\\u2660", uid: "hk" + Date.now() };
  a1.hand.push(card);
  window.BattleSystem.useCard(st, a1, w, card);
  return { ok: true };
})()`;

const readTpl = () => `(() => {
  const st = window.state, b = st.battle;
  const logs = (st.log || []).map(String);
  return {
    armor: logs.filter(x => x.includes("铁甲判定")).length,
    eye: logs.filter(x => x.includes("外神之眼")).length,
    noResponse: logs.filter(x => x.includes("无法使用响应牌")).length,
    marked: (b.enemies[0].statuses || []).includes("时停"),
    foeHp: b.enemies[0].hp,
    all: logs.slice(0, 8),
  };
})()`;

// 消耗敌人[0] 自己的标记（生产链路 battle-turn-start.js 里跳回合后调用的就是它）
const consumeTpl = `(() => {
  const st = window.state, b = st.battle;
  const n = window.MieryulaTimeStop.consume(st, b.enemies[0]);
  return { consumed: n,
    marked: (b.enemies[0].statuses || []).includes("时停"),
    markedAll: (b.enemies || []).filter(e => (e.statuses || []).includes("时停")).length,
    skip: !!window.MieryulaTimeStop.shouldSkipTurn(b.enemies[0]),
    bgm: JSON.parse(JSON.stringify(window.__bgm || { suspend: [], resume: [] })) };
})()`;

// 逐个消耗全部被标记者（走与 battle-turn-start.js 相同的 consume 入口）
const consumeAllTpl = `(() => {
  const st = window.state, b = st.battle;
  let n = 0;
  (b.enemies || []).forEach(e => { n += window.MieryulaTimeStop.consume(st, e); });
  return { consumed: n,
    marked: (b.enemies[0].statuses || []).includes("时停"),
    markedAll: (b.enemies || []).filter(e => (e.statuses || []).includes("时停")).length,
    skip: !!window.MieryulaTimeStop.shouldSkipTurn(b.enemies[0]),
    bgm: JSON.parse(JSON.stringify(window.__bgm || { suspend: [], resume: [] })) };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = collectErrors(page);
  await startRegressionBattle(page);
  await page.waitForTimeout(300);

  // ── A/B/D：机甲牛头怪（主动技牌 + 杀牌前置钩子 + 不可响应）────────
  const runMinotaur = async (cast) => {
    await page.evaluate(setupTpl("minotaur"));
    await page.evaluate(hookBgmTpl);
    const c = await page.evaluate(castTpl(cast));
    await page.waitForTimeout(400);
    const cp1 = await page.evaluate(canPlayTpl);
    await page.evaluate(hitTpl);
    await page.waitForTimeout(2500);
    const r1 = await page.evaluate(readTpl());
    // 清空全部标记：避免「其余敌人仍被时停」污染 D 组与 F 组的判定
    const k = await page.evaluate(consumeAllTpl);
    const cp2 = await page.evaluate(canPlayTpl);
    await page.evaluate(hitTpl);
    await page.waitForTimeout(2500);
    const r2 = await page.evaluate(readTpl());
    return { c, cp1, r1, k, cp2, r2 };
  };

  console.log("\n── 基线：从未施加时停 ──");
  const base = await runMinotaur(false);
  console.log(`   铁甲判定 ${base.r1.armor} 条；canPlay ${base.cp1.canPlay}`);

  console.log("\n── 施加时停 → 消耗标记 → 复测 ──");
  const got = await runMinotaur(true);
  console.log(`   cast 结果：${JSON.stringify(got.c)}`);
  console.log(`   时停中 铁甲判定 ${got.r1.armor} 条 / canPlay ${got.cp1.canPlay} / 不可响应 ${got.r1.noResponse}`);
  console.log(`   已解除 铁甲判定 ${got.r2.armor} 条 / canPlay ${got.cp2.canPlay} / 不可响应 ${got.r2.noResponse}`);

  console.log("\n── A 主动技牌 ──");
  T("时停中：主动技牌不可打出", got.cp1.canPlay === false, got.cp1);
  T("标记消失后：主动技牌恢复可打出", got.cp2.canPlay === true, got.cp2);
  T("基线对照：从未时停时可打出", base.cp1.canPlay === true, base.cp1);

  console.log("\n── B 杀牌前置被动（铁甲红怒）──");
  T("时停中：铁甲判定不发生", got.r1.armor === 0, got.r1);
  T("标记消失后：铁甲判定恢复", got.r2.armor > 0, got.r2);
  T("基线对照：从未时停时判定发生", base.r1.armor > 0, base.r1);

  console.log("\n── E/F 跳回合与 BGM ──");
  T("消耗后标记已移除", got.k.marked === false, got.k);
  T("消耗后不再跳过其回合", got.k.skip === false, got.k);
  T("施加时 BGM 暂停一次", got.k.bgm.suspend.length === 1, got.k.bgm);
  T("标记解除后 BGM 恢复", got.k.bgm.resume.length === 1, got.k.bgm);
  T("基线对照：未施加时 BGM 无暂停", base.k.bgm.suspend.length === 0, base.k.bgm);

  // ── C：凋零者（受击后被动·外神之眼）───────────────────────
  const runWitherer = async (cast) => {
    await page.evaluate(setupTpl("witherer"));
    const c = await page.evaluate(castTpl(cast));
    await page.waitForTimeout(400);
    await page.evaluate(hitTpl);
    await page.waitForTimeout(3000);
    const r1 = await page.evaluate(readTpl());
    const k = await page.evaluate(consumeTpl);
    await page.evaluate(hitTpl);
    await page.waitForTimeout(3000);
    const r2 = await page.evaluate(readTpl());
    return { c, r1, k, r2 };
  };

  console.log("\n── C 受击后被动（外神之眼）──");
  const wb = await runWitherer(false);
  const wg = await runWitherer(true);
  console.log(`   基线 ${wb.r1.eye} 条；时停中 ${wg.r1.eye} 条；解除后 ${wg.r2.eye} 条`);
  T("基线对照：从未时停时外神之眼触发", wb.r1.eye > 0, wb.r1);
  T("时停中：外神之眼不触发", wg.r1.eye === 0, wg.r1);
  T("标记消失后：外神之眼恢复触发", wg.r2.eye > 0, wg.r2);

  // D 组放在凋零者场景：机甲牛头怪的【铁甲红怒】判定成功时，其技能本身也会让
  // 本次杀不可响应并打印同一句日志 —— 用它做基线的「无压制」对照会随机翻红。
  console.log("\n── D 不可响应 ──");
  console.log(`   基线 ${wb.r1.noResponse} 条；时停中 ${wg.r1.noResponse} 条；解除后 ${wg.r2.noResponse} 条`);
  T("时停中：目标无法响应", wg.r1.noResponse > 0, wg.r1);
  T("标记消失后：不再压制响应", wg.r2.noResponse === 0, wg.r2);
  T("基线对照：从未时停时无压制", wb.r1.noResponse === 0, wb.r1);

  // ── G：逐个消耗，只清被标记者自己 ─────────────────────────
  console.log("\n── G 逐个消耗 ──");
  await page.evaluate(setupTpl("minotaur"));
  await page.evaluate(hookBgmTpl);
  const gc = await page.evaluate(castTpl(true));
  await page.waitForTimeout(400);
  const gk = await page.evaluate(consumeTpl);
  T("全部敌人被标记", gc.markedAll >= 2, gc);
  T("只消耗敌人[0] 自己的标记", gk.consumed === 1, gk);
  T("其余敌人标记仍保留", gk.markedAll === gc.markedAll - 1, { before: gc.markedAll, after: gk.markedAll });
  T("仍有标记时 BGM 不恢复", gk.bgm.resume.length === 0, gk.bgm);

  const real = relevantErrors(errors);
  console.log(`\n控制台错误: ${real.length}`);
  T("无控制台错误", real.length === 0, real.slice(0, 3));

  await browser.close();
  console.log(`\n通过 ${pass}/${total}`);
  process.exit(pass === total ? 0 : 1);
})();
