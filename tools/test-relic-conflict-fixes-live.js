// 两处饰品冲突修复的浏览器实测
//   ① 冰心双刺剑 + 鲨鱼头套：冰心在「获得」阶段把【杀（普攻）】改写成【刺杀】，
//      鲨鱼头套原本只认牌名仍为【杀（普攻）】的牌，两件同戴时鲨鱼头套被整件废掉。
//      修复后两件叠加：牌显示为【咬杀】，保留冰心的不消耗杀意，并触发咬杀回血。
//   ② 物资货物 × 物资货物：两名友方各戴一件时互推喂牌，牌库被抽干。
//      修复后只触发一次。（该路径为纯摸牌阶段逻辑，见节点测试
//      test-ruins-relic-conflicts.js；此处仅确认真实对局里 draw 不再雪崩。）
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
  return !!cond;
};

const browser = { launched: null };
async function freshPage() {
  if (!browser.launched) browser.launched = await chromium.launch();
  const page = await browser.launched.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await openGame(page);
  await startRegressionBattle(page);
  return { page, errors };
}

async function drain(page) {
  await page.waitForFunction(() => !window.BattleEffects?.animating
    && !window.BattleEffects?.draining
    && !window.state?.battle?.animQueue?.length, null, { timeout: 15000 });
}

const setupTpl = relics => `(() => {
  const st = window.state, b = st.battle;
  const a = b.allies[0], e = b.enemies[${FOE}];
  b.activeUid = a.uid; b.phase = 4; b.locked = false; b.animQueue = [];
  b.selectedCardIndex = null; b.selectedSkillCard = null; b.pendingTargetUid = null;
  a.intent = 5; a.hp = 100; a.maxHp = 200;
  a.stats = Object.assign({}, a.stats, { attack: 10, magic: 6 });
  a.battleRelics = ${JSON.stringify(relics)};
  a.hand = []; a.deck = []; a.discard = [];
  // 走真实获得路径（gainCards 落位），冰心双刺剑在这一步完成转换
  const card = window.CardUtils.cloneEntity("杀（普攻）", { suit: "♠" });
  a.hand.push(card);
  a.hand.forEach(c => { delete c._pendingDraw; });
  window.RuinsRelicEffects.afterCardsLanded({ type: "gainCards", uid: a.uid, cards: [card] });
  b.enemies.forEach(x => { x.hand = []; x.battleRelics = []; });
  e.ai = "ruins_hilde"; e.name = "内英组杀手希尔德";
  e.hp = 400; e.maxHp = 400; e.deck = []; e.discard = [];
  st.log = [];
  window.render();
  return { hand: a.hand.map(c => ({ name: c.name, noIntent: !!c.noIntentCost })),
           shown: window.CardUtils.battleView(st, a, a.hand[0]).name };
})()`;

const playTpl = `(() => {
  const st = window.state, b = st.battle;
  const e = b.enemies[${FOE}];
  return { ok: window.BattleSystem.playActiveCard(st, 0, e.uid) };
})()`;

const readTpl = `(() => {
  const st = window.state, b = st.battle;
  const a = b.allies[0];
  return { hp: a.hp, foeHp: b.enemies[${FOE}].hp, intent: a.intent,
           logs: (st.log || []).slice(0, 24).map(String) };
})()`;

// 摸牌阶段：两名友方各戴物资货物，走真实 draw
const cargoTpl = `(() => {
  const st = window.state, b = st.battle;
  // 真实对局的友方人数由编队决定，这里取前两名（各戴一件即可复现互推）
  const team = b.allies.filter(Boolean);
  const [a, bb] = team;
  b.phase = 3; b.locked = false; b.animQueue = [];
  team.forEach(u => { u.hand = []; u.discard = []; u.deck = []; });
  for (let i = 0; i < 30; i += 1) {
    a.deck.push(window.CardUtils.cloneEntity("杀（普攻）", { suit: "♠" }));
    bb.deck.push(window.CardUtils.cloneEntity("杀（普攻）", { suit: "♠" }));
  }
  a.battleRelics = ["物资货物"]; bb.battleRelics = ["物资货物"];
  st.log = [];
  const drawn = window.BattleSystem.draw(a, 2, b) || [];
  return { allyCount: team.length, drawn: drawn.length,
           hands: [a.hand.length, bb.hand.length],
           decks: [a.deck.length, bb.deck.length],
           logs: (st.log || []).filter(t => String(t).includes("的物资货物触发：")).length,
           raw: (st.log || []).slice(0, 6).map(String) };
})()`;

(async () => {
  // ===== ① 冰心双刺剑 + 鲨鱼头套 =====
  {
    const { page, errors } = await freshPage();
    const setup = await page.evaluate(setupTpl(["冰心双刺剑", "鲨鱼头套"]));
    console.log(`   获得后手牌 ${JSON.stringify(setup.hand)}，界面显示【${setup.shown}】`);
    T("冰心双刺剑把【杀】转换为【刺杀】", setup.hand[0]?.name === "刺杀", setup.hand);
    T("叠加后界面显示为【咬杀】（鲨鱼头套未被顶掉）", setup.shown === "咬杀", { shown: setup.shown });
    T("保留冰心的不消耗杀意", setup.hand[0]?.noIntent === true, setup.hand);

    const before = await page.evaluate(readTpl);
    await page.evaluate(playTpl);
    await drain(page);
    const after = await page.evaluate(readTpl);
    const logs = after.logs.join(" | ");
    console.log(`   敌方 400 → ${after.foeHp}；我方 100 → ${after.hp}`);
    T("鲨鱼头套触发日志出现", logs.includes("鲨鱼头套"), { logs });
    T("咬杀回血日志出现", /咬杀恢复\d+点生命/.test(logs), { logs });
    T("我方实际回血（HP 上升）", after.hp > before.hp, { before: before.hp, after: after.hp });
    T("不消耗杀意（打出后杀意未减少）", after.intent === before.intent,
      { before: before.intent, after: after.intent });
    T("页面无 JS 错误", errors.length === 0, errors.slice(0, 3));
    await page.close();
  }

  // 对照组：只有鲨鱼头套（无冰心）
  {
    const { page, errors } = await freshPage();
    const setup = await page.evaluate(setupTpl(["鲨鱼头套"]));
    console.log(`   对照组 获得后手牌 ${JSON.stringify(setup.hand)}，显示【${setup.shown}】`);
    T("对照组：牌名保持【杀（普攻）】", setup.hand[0]?.name === "杀（普攻）", setup.hand);
    T("对照组：仍显示为【咬杀】", setup.shown === "咬杀", { shown: setup.shown });
    T("页面无 JS 错误", errors.length === 0, errors.slice(0, 3));
    await page.close();
  }

  // ===== ② 物资货物 × 物资货物 =====
  {
    const { page, errors } = await freshPage();
    const r = await page.evaluate(cargoTpl);
    console.log(`   友方 ${r.allyCount} 名；物资货物触发 ${r.logs} 次；手牌 ${JSON.stringify(r.hands)}；牌库剩 ${JSON.stringify(r.decks)}`);
    console.log(`   日志: ${JSON.stringify(r.raw)}`);
    T("两名友方各戴一件时只触发 1 次", r.logs === 1, { logs: r.logs });
    T("牌库不再被抽干（各剩 28 张）", r.decks[0] === 28 && r.decks[1] === 28, r.decks);
    T("友方被喂到等量牌（B 2 张）", r.hands[1] === 2, r.hands);
    T("页面无 JS 错误", errors.length === 0, errors.slice(0, 3));
    await page.close();
  }

  if (browser.launched) await browser.launched.close();
  console.log(`\n结果 ${pass}/${total}`);
  process.exit(pass === total ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
