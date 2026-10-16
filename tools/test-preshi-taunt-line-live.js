// 普雷希【女王威压】触发「不可响应」时的台词核对。
// 台词通过 BattleLines.skill → 字幕控制器 → 语音气泡渲染，本测试读真实 DOM
// （.unit-speech-bubble）与 state.battle.speech 两处，确认播放的就是当前设定稿文本。
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startFreshGame, startRegressionBattle, dismissOpeningStory, collectErrors, relevantErrors } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const WANT = "女王的力量，你躲不开的。都给我跪下";
let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
};

// 我方 0 号改造成普雷希：手牌压过敌方，保证「不可响应」分支成立
const setupTpl = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false;
  b.speech = null; b.skillCaption = null; b.skillCaptions = [];
  const p = b.allies[0];
  p.name = "普雷希"; p.ref = "preshi"; p.id = "preshi"; p.gender = "female";
  p.hp = p.maxHp = 56;
  p.skills = [
    { name: "女王威压", type: "passive" },
    { name: "女王榨取", type: "active" },
  ];
  p.hand = [];
  for (let i = 0; i < 5; i++) p.hand.push({ name: "闪", type: "basic", suit: "♠", uid: "ph" + i });
  b.enemies.forEach(e => { e.hand = []; e.hp = e.maxHp = 60; });
  st.log = [];
  window.render();
  return { ok: true, foes: b.enemies.length };
})()`;

// 真实触发：使用一张实体【杀】指定敌方角色为目标 → 走 beforeCardPlayed
const fireTpl = `(() => {
  const st = window.state, b = st.battle;
  const p = b.allies[0], foe = b.enemies[0];
  const card = { name: "杀（普攻）", type: "slash", suit: "♠", uid: "atk1" };
  window.PreshiSkills.beforeCardPlayed(st, p, card, foe);
  window.render();
  // 压制不再写成牌上的 ignoreResponse，改为逐目标实时判定，此处断言判据。
  return { ignoreResponse: window.PreshiSkills.suppressesResponse(st, p, foe, card) };
})()`;

const readTpl = `(() => {
  const st = window.state, b = st.battle;
  const bubbles = Array.from(document.querySelectorAll(".unit-speech-bubble"))
    .map(node => (node.textContent || "").trim()).filter(Boolean);
  const speechLines = (b.speech?.lines || []).map(l => l.text || "");
  const captions = (b.skillCaptions || []).map(c => c.text || "");
  return { bubbles, speechLines, captions };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  await dismissOpeningStory(page);
  await startRegressionBattle(page);

  await page.evaluate(setupTpl);
  const fired = await page.evaluate(fireTpl);
  T("① 触发条件成立：目标被标记为不可响应", fired.ignoreResponse === true, fired);

  // 台词走 setTimeout(0) 后才进入语音气泡，需让出一次事件循环并等待渲染
  await page.waitForTimeout(600);
  const shown = await page.evaluate(readTpl);
  const all = shown.bubbles.concat(shown.speechLines);
  T("② 台词气泡播放了新文案", all.some(text => text.includes(WANT)), shown);

  // 对照：另外三条台词保持原样，确认只改了这一条
  const others = await page.evaluate(`(() => {
    const L = window.BattleLineData?.skillLines?.preshi || {};
    return {
      suppress: L["女王威压"],
      out: L["女王威压造成伤害"],
      inc: L["女王威压受到伤害"],
      drain: L["女王榨取"],
    };
  })()`);
  T("③ 不可响应台词已改为设定稿文本", others.suppress === WANT, others);
  T("③ 造成伤害台词未受影响", others.out === "这就是魅魔女王力量，我不会把罗卡尔交给你们。", others);
  T("③ 受到伤害台词未受影响",
    others.inc === "啊……我大意了……要不要使用那个？不过还不行！", others);
  T("③ 女王榨取台词未受影响", others.drain === "男人，在魅魔族眼里就是加油机罢了。", others);

  const bad = relevantErrors(errors);
  T("页面无 JS 错误", bad.length === 0, bad.slice(0, 3));

  console.log(`\n通过 ${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})().catch(err => { console.error("FATAL", err); process.exit(1); });
