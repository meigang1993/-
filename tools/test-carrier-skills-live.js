// 装甲运输车 · 实战回归
//   ⭐ 无脑冲撞：出牌阶段，摸到或获得的实体单体【杀】转换为【撞杀】并自动使用，
//      随机指定敌方一名角色，不消耗杀意
//   ⭐ 坚硬装甲：不会受到任何伤害
//   🔵 增援部队：准备阶段当有其它角色死亡后，复活全部已死亡的其他角色，
//      每复活一名损失 10% 生命值，直到自己死亡
//   物资货物（被动）：摸牌阶段，你摸牌时其他角色根据你摸的牌数摸等量的牌
//   武器库（主动）：出牌阶段限一次，我方所有其他角色各摸 1 张【杀】，不消耗杀意
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const FOE = 0;
let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
};

// 把敌方 0 号改造成装甲运输车
const setupTpl = (opts) => `(() => {
  const st = window.state, b = st.battle;
  const o = ${JSON.stringify(opts || {})};
  const a = b.allies[0], e = b.enemies[${FOE}];
  b.animQueue = []; b.locked = false;
  b.selectedCardIndex = null; b.selectedSkillCard = null; b.pendingTargetUid = null;
  a.intent = 5; a.hp = 300; a.maxHp = 300; a.block = 0;
  a.battleRelics = ${JSON.stringify((opts || {}).allyRelics || [])};
  e.ai = "ruins_carrier"; e.name = "装甲运输车";
  e.hp = 220; e.maxHp = 220; e.block = o.block || 0;
  e.stats = { attack: 10, magic: 6, speed: 14 };
  e.hand = o.hand || [{ name: "杀", type: "slash", suit: "♠", scale: "attack" }];
  e.hand.forEach(c => { delete c._pendingDraw; });
  b.enemies.forEach((u, i) => { if (i !== ${FOE}) { u.hp = o.deadAlly ? 0 : 100; u.maxHp = 100; } });
  st.log = [];
  window.render();
  return { ok: true };
})()`;

// 无脑冲撞：carrierRamMove 返回的牌是否真的变成了【撞杀】
const ramTpl = `(() => {
  const st = window.state, b = st.battle;
  const e = b.enemies[${FOE}];
  const mv = window.RuinsEliteSkills.carrierRamMove(st, e);
  return { has: !!mv, name: mv?.card?.name, armoredRam: !!mv?.card?.armoredRam,
    noIntent: !!mv?.card?.noIntentCost, hasTarget: !!mv?.target };
})()`;

// 无脑冲撞端到端：真实打出，看日志与伤害
const ramPlayTpl = `(() => {
  const st = window.state, b = st.battle;
  const e = b.enemies[${FOE}];
  b.activeUid = e.uid; b.phase = 4; b.locked = false;
  const mv = window.RuinsEliteSkills.carrierRamMove(st, e);
  if (!mv) return { err: "no move" };
  const target = mv.target || b.allies.find(u => u.hp > 0);
  const before = target.hp;
  window.BattleSystem.useCard(st, e, target, mv.card);
  return { name: mv.card.name, armoredRam: !!mv.card.armoredRam,
    before, after: target.hp, dealt: before - target.hp,
    logs: (st.log || []).slice(-5).map(String) };
})()`;

// 坚硬装甲：任何伤害都应被归零
const armorTpl = `(() => {
  const st = window.state, b = st.battle;
  const e = b.enemies[${FOE}];
  const slash = window.RuinsEliteSkills.modifyDamage(st, e, 50, { name: "火杀", type: "slash" });
  const magic = window.RuinsEliteSkills.modifyDamage(st, e, 80, { name: "魔力提炼", type: "tactic" });
  return { slash, magic };
})()`;

// 增援部队：准备阶段复活全部死亡友军，每名损失 10% 生命
const reinTpl = `(() => {
  const st = window.state, b = st.battle;
  const e = b.enemies[${FOE}];
  b.enemies[1].hp = 0; b.enemies[1].maxHp = 100;
  const before = e.hp;
  window.RuinsEliteSkills.prepare(st, e, null);
  return { before, after: e.hp, revived: b.enemies[1].hp,
    logs: (st.log || []).slice(-3).map(String) };
})()`;

// 物资货物
const cargoTpl = `(() => {
  const st = window.state, b = st.battle;
  const a = b.allies[0], other = b.allies[1];
  b.phase = 2; b.activeUid = a.uid;
  const oh = (other.hand || []).length;
  const drawFn = (unit, count) => {
    const got = [];
    for (let i = 0; i < count; i++) got.push({ name: "闪", type: "response", suit: "♥" });
    unit.hand = (unit.hand || []).concat(got);
    return got;
  };
  window.RuinsRelicEffects.afterDraw(st, a,
    [{ name: "杀", type: "slash" }, { name: "杀", type: "slash" }, { name: "杀", type: "slash" }],
    drawFn, {});
  return { otherBefore: oh, otherAfter: (other.hand || []).length,
    logs: (st.log || []).slice(-2).map(String) };
})()`;

// 武器库
const arsenalTpl = `(() => {
  const st = window.state, b = st.battle;
  const a = b.allies[0];
  b.activeUid = a.uid; b.phase = 4; b.locked = false;
  const skills = window.UICommon.skillsOf(a) || [];
  const idx = skills.findIndex(s => s.name === "武器库");
  if (idx < 0) return { noSkill: true, names: skills.map(s => s.name) };
  const picked = window.BattleSystem.selectSkill(st, idx);
  const sel = b.selectedSkillCard ? { name: b.selectedSkillCard.name, arsenal: !!b.selectedSkillCard.arsenal } : null;
  const allies = (b.allies || []).map(u => ({ hp: u.hp, hand: (u.hand || []).length }));
  let ok = window.BattleSystem.playSelectedCard(st);
  let aimed = null;
  // 武器库未标 targetless，UI 流程要求先点一个敌方目标再确认发动
  if (!ok) { aimed = window.BattleSystem.chooseTarget(st, (b.enemies[0] || b.allies[0]).uid); ok = window.BattleSystem.playSelectedCard(st); }
  return { picked, ok, aimed, sel, allyCount: (b.allies || []).length, alliesBefore: allies,
    alliesAfter: (b.allies || []).map(u => (u.hand || []).length),
    logs: (st.log || []).slice(0, 6).map(String) };
})()`;

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", e => errors.push(String(e)));
  await openGame(page);
  await startRegressionBattle(page);

  // ===== 无脑冲撞：转换为【撞杀】 =====
  await page.evaluate(setupTpl({ block: 5 }));
  const ram = await page.evaluate(ramTpl);
  console.log(`[无脑冲撞] name=${ram.name} armoredRam=${ram.armoredRam} noIntent=${ram.noIntent} target=${ram.hasTarget}`);
  T("无脑冲撞：实体单体【杀】转换为【撞杀】牌", ram.has === true && ram.name === "撞杀", ram);
  T("无脑冲撞：转换产物具备撞杀效果（armoredRam）", ram.armoredRam === true, ram);
  T("无脑冲撞：不消耗杀意", ram.noIntent === true, ram);
  T("无脑冲撞：随机指定敌方一名角色", ram.hasTarget === true, ram);

  // ===== 无脑冲撞端到端 =====
  await page.evaluate(setupTpl({ block: 5 }));
  const play = await page.evaluate(ramPlayTpl);
  await page.waitForTimeout(1200);
  console.log(`[无脑冲撞·打出] name=${play.name} 伤害=${play.dealt}`);
  console.log(`  日志: ${JSON.stringify((play.logs || []).slice(-3))}`);
  T("无脑冲撞：自动使用且日志记为撞杀",
    (play.logs || []).some(t => /撞杀/.test(t)), play);

  // ===== 坚硬装甲 =====
  await page.evaluate(setupTpl({}));
  const armor = await page.evaluate(armorTpl);
  console.log(`[坚硬装甲] slash=${armor.slash} magic=${armor.magic}`);
  T("坚硬装甲：不受到任何伤害", armor.slash === 0 && armor.magic === 0, armor);

  // ===== 增援部队 =====
  await page.evaluate(setupTpl({ deadAlly: true }));
  const rein = await page.evaluate(reinTpl);
  console.log(`[增援部队] 自己 ${rein.before}→${rein.after}，被复活者 hp=${rein.revived}`);
  console.log(`  日志: ${JSON.stringify(rein.logs)}`);
  T("增援部队：复活已死亡的其他角色", rein.revived > 0, rein);
  T("增援部队：每复活一名损失 10% 生命值", rein.before - rein.after === 22, rein);

  // ===== 物资货物 =====
  await page.evaluate(setupTpl({ allyRelics: ["物资货物"] }));
  const cargo = await page.evaluate(cargoTpl);
  console.log(`[物资货物] 友方手牌 ${cargo.otherBefore}→${cargo.otherAfter}`);
  T("物资货物：摸牌时其他角色摸等量牌",
    cargo.otherAfter - cargo.otherBefore === 3, cargo);

  // ===== 武器库 =====
  await page.evaluate(setupTpl({ allyRelics: ["武器库"] }));
  const ars = await page.evaluate(arsenalTpl);
  await page.waitForTimeout(1000);
  console.log(`[武器库] picked=${ars.picked} ok=${ars.ok}`);
  console.log(`  日志: ${JSON.stringify((ars.logs || []).slice(-3))}`);
  T("武器库：可发动并为我方其他角色发放【杀】牌",
    ars.noSkill !== true && ars.picked === true && ars.ok === true
    && (ars.logs || []).some(t => /武器库/.test(t)), ars);

  await page.close();
  await browser.close();
  console.log(`\n页面错误: ${errors.length}${errors.length ? " → " + errors.slice(0, 3).join(" | ") : ""}`);
  console.log(`\n=== ${pass}/${total} 通过 ===`);
  process.exit(pass === total && errors.length === 0 ? 0 : 1);
})();
