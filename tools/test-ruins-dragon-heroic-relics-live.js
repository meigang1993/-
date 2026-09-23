// 专项实战：英雄级（hell）设定「精英与BOSS携带掉落饰品技能」是否真的生效
// 以废墟沙城领主 机械AI龙 为样本：
//   1. 英雄级生成的 boss 是否挂上 battleRelics（应为 推进器 + 智能大脑）
//   2. 战斗内是否真的触发饰品效果（推进器：按目标数摸牌）
//   3. 对照组：非英雄级（普通级）不应携带
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

function check(name, cond, extra) {
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
}

// 用指定难度开启测试战斗，敌人固定为机械AI龙
async function startBattleAt(page, diffId) {
  await openGame(page);
  await page.locator("[data-start-game]").click();
  await page.locator(".villa-hall").waitFor({ state: "visible" });
  await page.evaluate(() => {
    window.state.hallModal = "testBattle";
    window.render();
  });
  await page.locator("[data-start-test-battle]").waitFor({ state: "visible" });
  const idx = await page.evaluate(`(() => window.GameData.testEnemies.findIndex(e => e.id === "mech_ai_dragon"))()`);
  if (idx < 0) throw new Error("testEnemies 中未找到 mech_ai_dragon");
  await page.evaluate(d => {
    const idx = window.GameData.testEnemies.findIndex(e => e.id === "mech_ai_dragon");
    window.state.testEnemies = [idx];
    window.state.testDifficulty = d;
    window.GameAssets.preloadBattle = async () => {};
    window.state.settings.battleSpeed = 2;
    window.BattleFX.playBattleStart = callback => callback?.();
    window.BattleLines.intro = () => 0;
    window.render();
  }, diffId);
  await page.locator("[data-start-test-battle]").click();
  await page.locator(".battle-screen").waitFor({ state: "visible" });
  await page.waitForFunction(() =>
    !window.BattleEffects.animating
    && !window.BattleEffects.draining
    && !window.state?.battle?.animQueue?.length, null, { timeout: 30000 });
  await page.evaluate(() => {
    const battle = window.state.battle;
    window.state.settings.battleSpeed = 1;
    battle.animQueue = [];
    battle.locked = false;
    battle.phase = 4;
    battle.activeUid = battle.allies[0].uid;
    battle.allies.concat(battle.enemies)
      .forEach(unit => unit.hand.forEach(card => { delete card._pendingDraw; }));
    window.render();
  });
  return idx;
}

const peekTpl = `(() => {
  const b = window.state.battle;
  const e = (b.enemies || []).find(x => x.id === "mech_ai_dragon") || b.enemies[0];
  return {
    name: e?.name, id: e?.id, type: e?.type,
    battleRelics: e?.battleRelics || [],
    relicStats: e?.relicStats || {},
    hp: e?.hp, maxHp: e?.maxHp, hand: (e?.hand || []).length,
  };
})()`;

// 让龙打出一张单体【杀】，看推进器是否触发摸牌
// （playActiveCard 限定 actor.side === "ally"，敌方走 BattleSystem.useCard）
const dragonPlayTpl = keepRelics => `(async () => {
  const st = window.state, b = st.battle;
  const e = (b.enemies || []).find(x => x.id === "mech_ai_dragon") || b.enemies[0];
  if (!${keepRelics}) e.battleRelics = [];
  b.activeUid = e.uid; b.phase = 4; b.locked = false;
  e.hand = [{ name: "杀", type: "kill", suit: "♠" }];
  b.allies.forEach(u => { u.hp = 300; u.hand = []; (u.stats = u.stats || {}).handLimit = 99; });
  st.log = [];
  window.render();
  let ok = null;
  try { ok = await window.BattleSystem.useCard(st, e, b.allies[0], e.hand[0]); } catch (err) { ok = "ERR:" + err.message; }
  return { ok, relics: e.battleRelics || [], allyHp: b.allies[0].hp };
})()`;

const logsTpl = `(() => ({
  hand: ((window.state.battle.enemies || []).find(x => x.id === "mech_ai_dragon")?.hand || []).length,
  logs: (window.state.log || []).slice(0, 60).map(String),
}))()`;

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  let pass = 0, total = 0;
  const T = (n, c, x) => { total++; pass += check(n, c, x); };

  // ===== 英雄级 =====
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", e => errors.push(String(e)));
  await startBattleAt(page, "hell");
  const hell = await page.evaluate(peekTpl);
  console.log("英雄级机械AI龙:", JSON.stringify(hell));
  T("英雄级：机械AI龙挂上 battleRelics", (hell.battleRelics || []).length > 0, hell);
  T("英雄级：携带推进器", (hell.battleRelics || []).includes("推进器"), hell);
  T("英雄级：携带智能大脑", (hell.battleRelics || []).includes("智能大脑"), hell);

  // 实战触发：龙出单体杀 → 推进器摸 1 张
  const played = await page.evaluate(dragonPlayTpl(true));
  await page.waitForTimeout(1000);
  const after = await page.evaluate(logsTpl);
  const thrusterLog = (after.logs || []).find(l => l.includes("推进器触发"));
  console.log("英雄级·龙出牌:", JSON.stringify(played), "|", thrusterLog || "无推进器日志");
  // useCard 无返回值（undefined 即成功），以"我方实际掉血"为出牌成功判据
  T("英雄级：龙出牌成功（我方掉血）", played.ok !== false && played.allyHp < 300, played);
  T("英雄级：实战触发推进器（按目标数摸牌）", /摸\d+张/.test(thrusterLog || ""),
    { log: thrusterLog, logs: (after.logs || []).slice(0, 10) });

  // 对照：清空 battleRelics 后不再触发
  const played2 = await page.evaluate(dragonPlayTpl(false));
  await page.waitForTimeout(1000);
  const after2 = await page.evaluate(logsTpl);
  T("对照：清空饰品后不再触发推进器",
    !(after2.logs || []).some(l => l.includes("推进器触发")),
    { logs: (after2.logs || []).filter(l => l.includes("推进器")) });
  await page.close();

  // ===== 普通级对照（不应携带） =====
  const page2 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page2.on("pageerror", e => errors.push(String(e)));
  await startBattleAt(page2, "normal");
  const norm = await page2.evaluate(peekTpl);
  console.log("普通级机械AI龙:", JSON.stringify(norm));
  T("普通级：机械AI龙不携带饰品", (norm.battleRelics || []).length === 0, norm);
  T("英雄级属性倍率已生效（HP 1095）", hell.hp === 1095, { hp: hell.hp, normal: norm.hp });
  await page2.close();

  await browser.close();
  console.log(`\n页面错误: ${errors.length}` + (errors.length ? ` → ${errors.slice(0, 3).join(" | ")}` : ""));
  console.log(`=== ${pass}/${total} 通过 ===`);
  process.exit(pass === total && errors.length === 0 ? 0 : 1);
})().catch(e => { console.error("FATAL", e); process.exit(1); });
